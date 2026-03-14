/**
 * BLE Heart Rate reader (FR-24 – FR-27).
 *
 * Reads heart rate from a BLE HR monitor (UUID 0x180D) on the host machine and
 * feeds values into the existing processBpm() pipeline — the same function used
 * by the Garmin CIQ HTTP POST path. No new HTTP endpoint is needed.
 *
 * Activated when BPM_SOURCE=ble in .env OR via POST /api/ble/start at runtime.
 * In the default (garmin) mode this module is never imported, so it has zero
 * effect on existing behaviour.
 *
 * OS requirements:
 *   macOS  — grant Bluetooth permission to Terminal / Node when prompted.
 *   Linux  — run once: sudo setcap cap_net_raw+eip $(readlink -f $(which node))
 *   Windows — noble BLE support can be unreliable; WSL2 may be required.
 *
 * Uses @abandonware/noble — the actively maintained Node 18+ fork of noble.
 * ANT+ is out of scope; BLE only.
 */

import noble from '@abandonware/noble';
import type { Peripheral, Characteristic } from '@abandonware/noble';
import { processBpm } from '../bpm/processor';

/** BLE service UUID for Heart Rate (Bluetooth SIG assigned). */
const HR_SERVICE_UUID = '180d';
/** BLE characteristic UUID for Heart Rate Measurement. */
const HR_CHAR_UUID = '2a37';

/** ms without a notification before we consider the session ended (FR-28 / step 4). */
const INACTIVITY_TIMEOUT_MS = parseInt(
  process.env['BLE_INACTIVITY_TIMEOUT_MS'] ?? '30000',
  10
);

/** Max reconnect attempts on unexpected disconnect. */
const MAX_RECONNECT_ATTEMPTS = 5;

// ── Module-level state (supports stop/restart without re-initialising noble) ──

/** Whether the BLE reader is actively scanning / connected. */
let bleRunning = false;

/** Set to true when stopBleHrReader() is called to prevent reconnect loops. */
let stopped = false;

/** Whether noble listeners have been registered (only happens once). */
let nobleInitialized = false;

/** Currently connected peripheral (null when scanning or stopped). */
let currentPeripheral: Peripheral | null = null;

/** Parse HR value from the BLE Heart Rate Measurement characteristic buffer.
 *
 * Byte 0 is a flags byte:
 *   bit 0 = 0 → HR value is UInt8 at byte 1
 *   bit 0 = 1 → HR value is UInt16 LE at bytes 1–2
 */
export function parseHrValue(data: Buffer): number {
  const flags = data.readUInt8(0);
  return flags & 0x01 ? data.readUInt16LE(1) : data.readUInt8(1);
}

/** Whether the BLE reader is currently active (scanning or connected). */
export function isBleRunning(): boolean {
  return bleRunning;
}

/**
 * Stop the BLE HR reader.
 *
 * Stops scanning and disconnects the current peripheral. The module stays
 * initialised so startBleHrReader() can resume scanning without re-registering
 * noble event listeners.
 */
export function stopBleHrReader(): void {
  stopped = true;
  bleRunning = false;

  try {
    noble.stopScanning();
  } catch {
    // noble may not be in a scannable state — ignore
  }

  if (currentPeripheral) {
    try {
      currentPeripheral.disconnect(() => {});
    } catch {
      // already disconnected — ignore
    }
    currentPeripheral = null;
  }

  console.log('[ble] HR reader stopped');
}

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

function resetInactivityTimer(): void {
  if (inactivityTimer !== null) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (stopped) return;
    console.warn(
      `[ble] No HR notification for ${INACTIVITY_TIMEOUT_MS / 1000}s — ending BLE session`
    );
    processBpm(0, false).catch((err) =>
      console.error('[ble] processBpm session-end error:', err)
    );
  }, INACTIVITY_TIMEOUT_MS);
}

function clearInactivityTimer(): void {
  if (inactivityTimer !== null) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

async function connectAndSubscribe(peripheral: Peripheral): Promise<void> {
  currentPeripheral = peripheral;

  await new Promise<void>((resolve, reject) => {
    peripheral.connect((err) => {
      if (err) reject(new Error(`[ble] Connect failed: ${err}`));
      else resolve();
    });
  });

  if (stopped) {
    peripheral.disconnect(() => {});
    currentPeripheral = null;
    return;
  }

  console.log(`[ble] Connected to ${peripheral.address || peripheral.id}`);
  reconnectAttempts = 0;

  peripheral.on('disconnect', () => {
    console.warn('[ble] Peripheral disconnected');
    clearInactivityTimer();
    currentPeripheral = null;

    if (stopped || !bleRunning) return;

    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(
        `[ble] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in 3s…`
      );
      setTimeout(() => {
        if (!stopped && bleRunning) {
          connectAndSubscribe(peripheral).catch((err) =>
            console.error('[ble] Reconnect failed:', err)
          );
        }
      }, 3_000);
    } else {
      console.error('[ble] Max reconnect attempts reached. Giving up.');
      processBpm(0, false).catch((err) =>
        console.error('[ble] processBpm session-end error:', err)
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    peripheral.discoverSomeServicesAndCharacteristics(
      [HR_SERVICE_UUID],
      [HR_CHAR_UUID],
      (err, _services, characteristics) => {
        if (err) {
          reject(new Error(`[ble] Discover failed: ${err}`));
          return;
        }

        const hrChar = characteristics.find((c: Characteristic) => c.uuid === HR_CHAR_UUID);
        if (!hrChar) {
          reject(new Error('[ble] HR characteristic 0x2A37 not found'));
          return;
        }

        hrChar.subscribe((subErr) => {
          if (subErr) {
            reject(new Error(`[ble] Subscribe failed: ${subErr}`));
            return;
          }
          console.log('[ble] Subscribed to HR notifications');
          resolve();
        });

        hrChar.on('data', (data: Buffer) => {
          if (stopped || !bleRunning) return;
          const hr = parseHrValue(data);
          resetInactivityTimer();
          processBpm(hr, true).catch((err) =>
            console.error('[ble] processBpm error:', err)
          );
        });
      }
    );
  });
}

/**
 * Start the BLE HR reader.
 *
 * Safe to call multiple times — returns early if already running.
 * If noble was previously initialised and is powered on, scanning resumes
 * immediately without re-registering event listeners.
 *
 * Resolves once scanning has started (or is already running).
 */
export async function startBleHrReader(): Promise<void> {
  if (bleRunning) return;

  const pinAddress = (process.env['BLE_DEVICE_ADDRESS'] ?? '').toLowerCase().trim();

  stopped = false;
  bleRunning = true;
  reconnectAttempts = 0;

  if (nobleInitialized) {
    // noble already has its listeners — check current adapter state and scan
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((noble as any).state === 'poweredOn') {
      console.log('[ble] Resuming scan for HR monitor (UUID 0x180D)…');
      noble.startScanning([HR_SERVICE_UUID], false);
    }
    // if not poweredOn yet, the existing stateChange listener will call startScanning
    return;
  }

  nobleInitialized = true;

  return new Promise<void>((resolve) => {
    noble.on('stateChange', (bleState: string) => {
      if (bleState === 'poweredOn') {
        if (bleRunning && !stopped) {
          console.log('[ble] Bluetooth powered on — scanning for HR monitor (UUID 0x180D)…');
          noble.startScanning([HR_SERVICE_UUID], false);
        }
        resolve();
      } else {
        console.warn(`[ble] Bluetooth state: ${bleState} — not scanning`);
        noble.stopScanning();
      }
    });

    noble.on('discover', (peripheral: Peripheral) => {
      if (stopped || !bleRunning) return;

      const addr = peripheral.address?.toLowerCase() ?? '';

      // If a specific device address is pinned, skip non-matching peripherals (FR-27)
      if (pinAddress && addr !== pinAddress) {
        return;
      }

      console.log(
        `[ble] Discovered HR device: ${peripheral.advertisement?.localName ?? '(unnamed)'} [${addr || peripheral.id}]`
      );

      noble.stopScanning();

      connectAndSubscribe(peripheral).catch((err) => {
        console.error('[ble] Setup error:', err);
        if (!stopped && bleRunning) {
          // Resume scanning so we can try the next device
          noble.startScanning([HR_SERVICE_UUID], false);
        }
      });
    });
  });
}

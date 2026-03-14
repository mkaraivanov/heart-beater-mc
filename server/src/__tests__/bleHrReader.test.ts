/**
 * Tests for BLE HR reader utilities.
 *
 * We cannot run actual BLE scans in the test environment, so we test
 * the parts that are pure functions — specifically parseHrValue, which
 * is the critical data-parsing logic for the HR characteristic buffer.
 */

import { describe, it, expect } from 'vitest';
import { parseHrValue } from '../ble/hrReader';

describe('parseHrValue — BLE Heart Rate Measurement characteristic (0x2A37)', () => {
  it('reads UInt8 HR when flags bit 0 is 0', () => {
    // flags = 0x00 → HR is UInt8 at byte 1
    const buf = Buffer.from([0x00, 75]);
    expect(parseHrValue(buf)).toBe(75);
  });

  it('reads UInt8 HR of 180 when flags bit 0 is 0', () => {
    const buf = Buffer.from([0x00, 180]);
    expect(parseHrValue(buf)).toBe(180);
  });

  it('reads UInt16 LE HR when flags bit 0 is 1', () => {
    // flags = 0x01 → HR is UInt16 LE at bytes 1–2
    // 0x0096 = 150 in little-endian is bytes [0x96, 0x00]
    const buf = Buffer.from([0x01, 0x96, 0x00]);
    expect(parseHrValue(buf)).toBe(150);
  });

  it('reads UInt16 LE HR of 200 correctly', () => {
    // 200 = 0x00C8, LE → [0xC8, 0x00]
    const buf = Buffer.from([0x01, 0xc8, 0x00]);
    expect(parseHrValue(buf)).toBe(200);
  });

  it('ignores other flags bits when determining HR format', () => {
    // flags = 0x04 (bit 0 = 0) → still UInt8
    const buf = Buffer.from([0x04, 95]);
    expect(parseHrValue(buf)).toBe(95);
  });

  it('reads UInt16 when flags = 0x0F (bit 0 = 1)', () => {
    // 120 = 0x0078, LE → [0x78, 0x00]
    const buf = Buffer.from([0x0f, 0x78, 0x00]);
    expect(parseHrValue(buf)).toBe(120);
  });
});

# Garmin Connect IQ Layer

## ⚠️ MANUAL BUILD REQUIRED
Claude Code CANNOT compile Monkey C. The Connect IQ SDK is a standalone tool
with its own compiler and simulator. Claude Code can write and edit .mc source
files, but compilation, simulation, and sideloading must be done manually.

When working on this directory:
- Write/edit .mc files as needed
- Note in your summary that manual CIQ SDK build + sideload is required
- Do NOT attempt to run connectiq CLI commands in bash

## Language
Monkey C (Java-like). SDK docs: https://developer.garmin.com/connect-iq/

## App type
DataField (preferred for HR access during workouts)

## Key APIs
Activity.Info.currentHeartRate   → live BPM (read in compute() tick ~1/sec)
Communications.makeWebRequest()  → HTTP POST to NGROK_URL/api/bpm

## Payload shape
{ "hr": <int>, "active": <bool>, "ts": <epoch_ms> }

## Authentication
Every request MUST include the X-BPM-Key header with the shared secret.
The secret is defined as a constant at the top of the source file.
When BPM_API_KEY changes in .env, this constant must be updated and the
app recompiled + re-sideloaded.

## HTTPS requirement
Android Garmin Connect Mobile >= 4.20 enforces HTTPS.
The NGROK_URL constant at top of source must point to active ngrok tunnel.

## Session detection
Send { active: false } in onTimerStop() callback.
Do not POST when activity timer is not running.

## Known error: makeWebRequest -2
BLE connection drop. Implement exponential backoff: [1000, 2000, 4000] ms,
max 3 retries. Log failure to Toybox.System.println for simulator debugging.

## Backoff pattern
```monkey-c
var _retryDelays = [1000, 2000, 4000];
var _retryCount = 0;

function onResponse(responseCode, data) {
    if (responseCode == 200) {
        _retryCount = 0;
    } else if (_retryCount < _retryDelays.size()) {
        var timer = new Timer.Timer();
        timer.start(method(:retryPost), _retryDelays[_retryCount], false);
        _retryCount++;
    }
}
```

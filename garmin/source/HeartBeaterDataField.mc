/**
 * Heart Beater MC — Connect IQ DataField
 *
 * Reads live heart rate from the Garmin sensor API and HTTP POSTs it to the
 * Heart Beater MC server every 5 seconds, triggering Spotify playlist switches
 * based on BPM threshold rules configured in the web UI.
 *
 * SETUP BEFORE BUILDING:
 *   1. Replace SERVER_URL with your active ngrok HTTPS tunnel URL.
 *      e.g. "https://abcd1234.ngrok.io/api/bpm"
 *   2. Replace BPM_API_KEY with the value of BPM_API_KEY from your server .env file.
 *      Generate a new key with: openssl rand -hex 32
 *   3. Build and sideload using the Garmin Connect IQ SDK (Claude Code cannot compile
 *      Monkey C — see garmin/CLAUDE.md for build instructions).
 *
 * MANUAL BUILD REQUIRED:
 *   Claude Code CANNOT compile Monkey C. Compile + sideload manually:
 *     connectiq build --output dist/HeartBeaterDataField.prg
 *   Then install via Garmin Express or the Garmin Connect mobile app.
 *
 * App type: DataField — runs during activities, fires compute() ~every 1 second.
 */

using Toybox.Application as App;
using Toybox.Activity as Activity;
using Toybox.Communications as Comm;
using Toybox.Timer as Timer;
using Toybox.System as Sys;
using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.Time as Time;

// ---------------------------------------------------------------------------
// CONFIGURATION — update these before building
// ---------------------------------------------------------------------------

// Your ngrok HTTPS tunnel URL pointing to the /api/bpm endpoint.
// Android Garmin Connect Mobile >= 4.20 enforces HTTPS for makeWebRequest.
const SERVER_URL = "https://your-ngrok-subdomain.ngrok.io/api/bpm";

// Shared secret — must match BPM_API_KEY in your server .env file.
// Generate with: openssl rand -hex 32
const BPM_API_KEY = "your_bpm_api_key_here";

// How often to POST heart rate to the server (milliseconds).
const POST_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// DataField app class
// ---------------------------------------------------------------------------

class HeartBeaterApp extends App.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() {
        return [ new HeartBeaterDataField() ];
    }
}

// ---------------------------------------------------------------------------
// DataField view
// ---------------------------------------------------------------------------

class HeartBeaterDataField extends Ui.DataField {

    // Last heart rate reading from the sensor (null until first compute() tick)
    hidden var _lastHr as Number or Null;

    // Timer that fires the periodic POST
    hidden var _postTimer as Timer.Timer or Null;

    // Retry state for exponential backoff on BLE/network errors
    hidden var _retryDelays as Array = [1000, 2000, 4000];
    hidden var _retryCount as Number = 0;
    hidden var _retryTimer as Timer.Timer or Null;

    // Whether the activity timer is currently running
    hidden var _sessionActive as Boolean = false;

    // Cached BPM and timestamp for the next retry (set before the initial POST)
    hidden var _pendingHr as Number or Null;
    hidden var _pendingTs as Number or Null;

    // Display: last server response code for debugging on the watch face
    hidden var _lastStatusCode as Number = 0;

    function initialize() {
        DataField.initialize();
        _lastHr = null;
        _postTimer = null;
        _retryCount = 0;
        _retryTimer = null;
        _sessionActive = false;
        _pendingHr = null;
        _pendingTs = null;
        _lastStatusCode = 0;
    }

    // -----------------------------------------------------------------------
    // Activity lifecycle callbacks
    // -----------------------------------------------------------------------

    // Called when the activity timer starts (user begins workout).
    function onTimerStart() {
        _sessionActive = true;
        _retryCount = 0;
        startPostTimer();
        Sys.println("HeartBeater: session started");
    }

    // Called when the activity timer stops (user pauses or ends workout).
    function onTimerStop() {
        _sessionActive = false;
        stopPostTimer();
        stopRetryTimer();
        // Notify server that the session has ended
        postBpm(null, false);
        Sys.println("HeartBeater: session ended — sent active:false");
    }

    // Called when the activity timer is reset (e.g. discard activity).
    function onTimerReset() {
        _sessionActive = false;
        stopPostTimer();
        stopRetryTimer();
        _lastHr = null;
        _lastStatusCode = 0;
        Sys.println("HeartBeater: timer reset");
    }

    // -----------------------------------------------------------------------
    // Sensor data — called every ~1 second during an activity
    // -----------------------------------------------------------------------

    function compute(info as Activity.Info) as Numeric or Duration or String or Object {
        if (info has :currentHeartRate && info.currentHeartRate != null) {
            _lastHr = info.currentHeartRate;
        }
        // Return the heart rate value so it displays on the DataField tile
        return _lastHr;
    }

    // -----------------------------------------------------------------------
    // Timer management
    // -----------------------------------------------------------------------

    function startPostTimer() {
        stopPostTimer();
        _postTimer = new Timer.Timer();
        // Delay the first POST by POST_INTERVAL_MS so we have a valid HR reading
        _postTimer.start(method(:onPostTimerFired), POST_INTERVAL_MS, true);
    }

    function stopPostTimer() {
        if (_postTimer != null) {
            _postTimer.stop();
            _postTimer = null;
        }
    }

    function stopRetryTimer() {
        if (_retryTimer != null) {
            _retryTimer.stop();
            _retryTimer = null;
        }
        _retryCount = 0;
    }

    // Fired every POST_INTERVAL_MS while session is active.
    function onPostTimerFired() {
        if (!_sessionActive || _lastHr == null) {
            return;
        }
        // Cancel any in-flight retry cycle — fresh POST takes precedence
        stopRetryTimer();
        _retryCount = 0;
        postBpm(_lastHr, true);
    }

    // -----------------------------------------------------------------------
    // HTTP POST to server
    // -----------------------------------------------------------------------

    /**
     * POST heart rate data to the Heart Beater MC server.
     *
     * @param hr   - Heart rate in BPM, or null for a session-end signal.
     * @param active - true for an active BPM reading, false for session end.
     */
    function postBpm(hr as Number or Null, active as Boolean) {
        var ts = Time.now().value() * 1000; // epoch milliseconds
        _pendingHr = hr;
        _pendingTs = ts;

        var body = {
            "active" => active
        };
        if (hr != null) {
            body["hr"] = hr;
        }
        body["ts"] = ts;

        var options = {
            :method => Comm.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => "application/json",
                "X-BPM-Key" => BPM_API_KEY
            },
            :responseType => Comm.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        Sys.println("HeartBeater: posting hr=" + hr + " active=" + active);

        Comm.makeWebRequest(
            SERVER_URL,
            body,
            options,
            method(:onServerResponse)
        );
    }

    /**
     * HTTP response callback.
     *
     * On success (200):     reset retry counter.
     * On error (non-200):   use exponential backoff up to 3 retries.
     *   -2 = BLE connection drop (most common transient error).
     *   401 = wrong BPM_API_KEY constant — fix and rebuild.
     *   Other HTTP errors:  log and skip, server state will reconcile on
     *                       the next periodic POST.
     */
    function onServerResponse(responseCode as Number, data as Dictionary or String or Null) {
        _lastStatusCode = responseCode;

        if (responseCode == 200) {
            _retryCount = 0;
            Sys.println("HeartBeater: POST OK (200)");
            return;
        }

        if (responseCode == 401) {
            // Wrong API key — retrying won't help; log and give up
            Sys.println("HeartBeater: ERROR 401 Unauthorized — check BPM_API_KEY constant");
            _retryCount = 0;
            return;
        }

        // Transient errors (BLE drop = -2, network timeout, 5xx, etc.)
        Sys.println("HeartBeater: POST failed, code=" + responseCode + ", retry=" + _retryCount);

        if (_retryCount < _retryDelays.size()) {
            scheduleRetry();
        } else {
            // All retries exhausted — reset so the next periodic POST starts fresh
            Sys.println("HeartBeater: all retries exhausted, giving up until next interval");
            _retryCount = 0;
        }
    }

    /**
     * Schedule a retry POST after the next exponential backoff delay.
     */
    function scheduleRetry() {
        stopRetryTimer();
        var delayMs = _retryDelays[_retryCount];
        _retryCount++;
        _retryTimer = new Timer.Timer();
        _retryTimer.start(method(:onRetryTimerFired), delayMs, false);
        Sys.println("HeartBeater: scheduling retry " + _retryCount + " in " + delayMs + "ms");
    }

    /**
     * Retry timer callback — re-posts the last pending BPM value.
     */
    function onRetryTimerFired() {
        _retryTimer = null;
        if (!_sessionActive) {
            // Session ended while waiting — skip retry
            _retryCount = 0;
            return;
        }
        Sys.println("HeartBeater: retrying POST (attempt " + _retryCount + ")");
        postBpm(_pendingHr, _pendingHr != null);
    }

    // -----------------------------------------------------------------------
    // Rendering — display current HR and server status on the DataField tile
    // -----------------------------------------------------------------------

    function onUpdate(dc as Gfx.Dc) {
        var bgColor = getBackgroundColor();
        var fgColor = bgColor == Gfx.COLOR_BLACK ? Gfx.COLOR_WHITE : Gfx.COLOR_BLACK;

        dc.setColor(fgColor, bgColor);
        dc.clear();

        var centerX = dc.getWidth() / 2;
        var centerY = dc.getHeight() / 2;

        // Display heart rate or placeholder
        var hrText = _lastHr != null ? _lastHr.toString() : "--";
        dc.drawText(centerX, centerY - 15, Gfx.FONT_MEDIUM, hrText, Gfx.TEXT_JUSTIFY_CENTER);

        // Status indicator: dot colour reflects last server response
        var statusColor;
        if (_lastStatusCode == 200) {
            statusColor = Gfx.COLOR_GREEN;
        } else if (_lastStatusCode == 0) {
            statusColor = fgColor; // no POST yet
        } else {
            statusColor = Gfx.COLOR_RED;
        }
        dc.setColor(statusColor, bgColor);
        dc.drawText(centerX, centerY + 8, Gfx.FONT_TINY, "HB", Gfx.TEXT_JUSTIFY_CENTER);
    }
}

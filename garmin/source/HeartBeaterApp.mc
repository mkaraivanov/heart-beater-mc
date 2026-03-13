import Toybox.Activity;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

// ── Configuration ────────────────────────────────────────────────────────────
// Update SERVER_URL whenever the ngrok tunnel restarts, then recompile + re-sideload.
const SERVER_URL    as String = "https://YOUR-NGROK-URL/api/bpm";
const BPM_API_KEY   as String = "YOUR-SECRET-HERE";
const POST_INTERVAL_MS as Number = 5000;

// ── App / DataField ──────────────────────────────────────────────────────────
class HeartBeaterView extends WatchUi.DataField {

    // Retry state for exponential backoff (error code -2 = BLE drop)
    private var _retryDelays as Array<Number> = [1000, 2000, 4000] as Array<Number>;
    private var _retryCount  as Number = 0;

    // Last HR value captured in compute(); posted by the timer tick
    private var _lastHr      as Number = 0;
    private var _active      as Boolean = false;

    // Timer that fires the POST every POST_INTERVAL_MS
    private var _postTimer   as Timer.Timer;

    // Retry timer — stored as instance var to prevent garbage collection before it fires
    private var _retryTimer  as Timer.Timer or Null;

    // Payload saved for retry attempts
    private var _pendingHr     as Number  = 0;
    private var _pendingActive as Boolean = false;

    function initialize() {
        DataField.initialize();
        _retryTimer = null;
        _postTimer = new Timer.Timer();
        _postTimer.start(method(:onTimerTick), POST_INTERVAL_MS, true);
    }

    // compute() is called ~1/sec by the Connect IQ runtime during an activity
    function compute(info as Activity.Info) as Numeric or Duration or String or Object {
        if (info.currentHeartRate != null) {
            _lastHr = info.currentHeartRate as Number;
        }
        return _lastHr;
    }

    // ── Timer tick — fires every POST_INTERVAL_MS ────────────────────────────
    function onTimerTick() as Void {
        if (_active) {
            postBpm(_lastHr, true);
        }
    }

    // ── Activity session callbacks ───────────────────────────────────────────
    function onTimerStart() as Void {
        _active = true;
        postBpm(_lastHr, true);
    }

    function onTimerStop() as Void {
        _active = false;
        postBpm(_lastHr, false);
    }

    function onTimerReset() as Void {
        _active = false;
        postBpm(0, false);
    }

    // ── HTTP POST ────────────────────────────────────────────────────────────
    function postBpm(hr as Number, active as Boolean) as Void {
        _pendingHr     = hr;
        _pendingActive = active;
        _retryCount    = 0;
        doPost(hr, active);
    }

    private function doPost(hr as Number, active as Boolean) as Void {
        var payload = {
            "hr"     => hr,
            "active" => active,
            "ts"     => Time.now().value()
        };

        var options = {
            :method  => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Content-Type" => "application/json",
                "X-BPM-Key"   => BPM_API_KEY
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        };

        Communications.makeWebRequest(SERVER_URL, payload, options, method(:onResponse));
    }

    // ── Response / backoff ───────────────────────────────────────────────────
    function onResponse(responseCode as Number, data as Dictionary or String or Null) as Void {
        if (responseCode == 200) {
            _retryCount = 0;
            _retryTimer = null;
            System.println("HeartBeater: POST ok");
        } else {
            System.println("HeartBeater: POST failed code=" + responseCode.toString());
            // Exponential backoff — retry up to _retryDelays.size() times
            if (_retryCount < _retryDelays.size()) {
                var delay = _retryDelays[_retryCount] as Number;
                _retryCount++;
                // Store as instance var to prevent GC from collecting the timer before it fires
                _retryTimer = new Timer.Timer();
                _retryTimer.start(method(:retryPost), delay, false);
                System.println("HeartBeater: backoff retry " + _retryCount.toString() + " in " + delay.toString() + "ms");
            } else {
                System.println("HeartBeater: max retries reached, dropping payload");
                _retryCount = 0;
                _retryTimer = null;
            }
        }
    }

    function retryPost() as Void {
        _retryTimer = null;
        System.println("HeartBeater: retrying POST (attempt " + _retryCount.toString() + ")");
        doPost(_pendingHr, _pendingActive);
    }
}

// ── App entry point ──────────────────────────────────────────────────────────
class HeartBeaterApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {}
    function onStop(state as Dictionary?) as Void {}

    function getInitialView() as Array<Views or InputDelegates>? {
        return [new HeartBeaterView()] as Array<Views or InputDelegates>;
    }
}

function getApp() as HeartBeaterApp {
    return Application.getApp() as HeartBeaterApp;
}

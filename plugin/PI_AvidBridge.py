"""
Avid Bridge — XPPython3 plugin.
Binds 127.0.0.1:47821, answers GET /ping with a JSON heartbeat, and logs bind
result + errors to X-Plane's Log.txt so we can diagnose from the companion.

Install to: <X-Plane 12>/Resources/plugins/PythonPlugins/PI_AvidBridge.py
"""
import http.server
import json
import socket
import threading
import time
import traceback

try:
    import xp  # XPPython3 API
except Exception:
    xp = None

BRIDGE_PORT = 47821


def log(msg: str) -> None:
    line = f"[AvidBridge] {msg}"
    if xp is not None:
        try:
            xp.log(line)
        except Exception:
            print(line)
    else:
        print(line)


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/ping":
            body = json.dumps({"ok": True, "t": time.time()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        # Silence default stderr logging.
        return


class PythonInterface:
    def XPluginStart(self):
        self.name = "AvidBridge"
        self.sig = "com.avid.bridge"
        self.desc = "Avid Companion <-> X-Plane bridge"
        self.server = None
        self.thread = None
        try:
            self.server = http.server.HTTPServer(("127.0.0.1", BRIDGE_PORT), Handler)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            log(f"bound 127.0.0.1:{BRIDGE_PORT}")
        except OSError as e:
            log(f"bind failed on 127.0.0.1:{BRIDGE_PORT}: {e}")
        except Exception:
            log(f"unexpected error: {traceback.format_exc()}")
        return self.name, self.sig, self.desc

    def XPluginStop(self):
        try:
            if self.server is not None:
                self.server.shutdown()
                self.server.server_close()
                log("stopped")
        except Exception:
            pass

    def XPluginEnable(self):
        return 1

    def XPluginDisable(self):
        pass

    def XPluginReceiveMessage(self, inFrom, inMsg, inParam):
        pass

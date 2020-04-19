from http.server import BaseHTTPRequestHandler, HTTPServer
import time
import redis

db = redis.Redis(
    host='redis',
    port=6379)

class RedisExample(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        hitcounter = db.get('python-hitcounter')
        self.wfile.write(bytes("<html><body>Hello from a Python Redis example! Hits: {hitcounter}</body></html>", "utf-8"))
        hitcounter = db.incr('python-hitcounter')

if __name__ == "__main__":
    webServer = HTTPServer(('0.0.0.0', 8000), RedisExample)
    print("Python redis example started!")

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")

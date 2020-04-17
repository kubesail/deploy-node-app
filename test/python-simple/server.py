from http.server import BaseHTTPRequestHandler, HTTPServer
import time

class SimpleExample(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(bytes("<html><body>Hello from a Python example!</body></html>", "utf-8"))

if __name__ == "__main__":
    webServer = HTTPServer(('0.0.0.0', 8080), SimpleExample)
    print("Python example started!")

    try:
        webServer.serve_forever()
    except KeyboardInterrupt:
        pass

    webServer.server_close()
    print("Server stopped.")

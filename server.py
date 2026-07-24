#!/usr/bin/env python3
"""
Simple HTTP server for local development.
Usage: python3 server.py
Then open: http://localhost:8000
"""
import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Add CORS headers for local development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def log_message(self, format, *args):
        # Cleaner logging
        if 'GET' in format:
            print(f'  {args[0]}')

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(('', PORT), MyHTTPRequestHandler) as httpd:
        print(f'🚀 Serving {DIRECTORY}')
        print(f'📂 Open: http://localhost:{PORT}')
        print(f'⏹️  Press Ctrl+C to stop\n')
        httpd.serve_forever()

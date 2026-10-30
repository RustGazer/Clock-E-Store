import http.server,socketserver
print("Open http://localhost:8000")
socketserver.TCPServer(("",8000),http.server.SimpleHTTPRequestHandler).serve_forever()

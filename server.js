const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');

const port = Number(process.env.PORT || process.env.WS_PORT || 8080);
const isDev = process.env.NODE_ENV !== 'production';

const allowedOrigins = [
  /^https:\/\/.*\.negationgame\.com$/,
  'https://negationgame.com',
  'https://negation-game-git-rationale-redesign-2-network-goods-institute.vercel.app',
];

if (isDev) {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001');
}

function isOriginAllowed(origin) {
  if (!origin) return false;
  return allowedOrigins.some(allowed =>
    typeof allowed === 'string' ? origin === allowed : allowed.test(origin)
  );
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'y-websocket server running',
      timestamp: new Date().toISOString(),
    }));
  } else if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({
  server,
  verifyClient: info => isOriginAllowed(info.origin || info.req.headers.origin)
});

wss.on('connection', (conn, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // y-websocket expects room in the path ("/roomname"). Our client uses
    // WebsocketProvider(baseUrl, roomName), which constructs that URL.
    const roomFromPath = (url.pathname || '/').slice(1) || 'default';
    const roomFromQuery = url.searchParams.get('room') || undefined;
    const docName = roomFromQuery || roomFromPath;

    setupWSConnection(conn, req, { docName });
  } catch (err) {
    console.error('WS connection error:', err);
    try { conn.close(); } catch {}
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`y-websocket listening on 0.0.0.0:${port}`);
});

wss.on('error', (err) => {
  console.error('ws_error', err);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});


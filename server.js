const WebSocket = require('ws');
const http = require('http');
const Y = require('yjs');

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
  
  return allowedOrigins.some(allowed => {
    if (typeof allowed === 'string') {
      return origin === allowed;
    }
    return allowed.test(origin);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      message: 'YJS WebSocket server is running',
      timestamp: new Date().toISOString(),
      rooms: docs.size
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
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    return isOriginAllowed(origin);
  }
});

const docs = new Map();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomname = url.searchParams.get('room') || 'default';
  ws._roomname = roomname;
  
  if (!docs.has(roomname)) {
    docs.set(roomname, new Y.Doc());
  }
  
  const doc = docs.get(roomname);
  
  ws.on('message', (message) => {
    try {
      const data = new Uint8Array(message);
      Y.applyUpdate(doc, data);
      
      // Broadcast to all other clients in the same room
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN && client._roomname === roomname) {
          client.send(message);
        }
      });
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  ws.on('close', () => {
    // Clean up if no more clients for this room
    const roomClients = Array.from(wss.clients).filter(client => {
      return client.readyState === WebSocket.OPEN && client._roomname === roomname;
    });
    
    if (roomClients.length === 0) {
      docs.delete(roomname);
    }
  });
  
  // Send current document state to new client
  const stateVector = Y.encodeStateVector(doc);
  const update = Y.encodeStateAsUpdate(doc, stateVector);
  if (update.length > 0) {
    ws.send(update);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`YJS WebSocket server listening on 0.0.0.0:${port}`);
});

wss.on('error', (err) => {
  console.error('ws_error', err);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});



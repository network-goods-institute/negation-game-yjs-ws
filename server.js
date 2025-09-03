const WebSocket = require('ws');
const http = require('http');
// This isn't imported or something
let setupWSConnection;
try {
  const packageRoot = require.resolve('y-websocket/package.json');
  utilsPath = path.join(path.dirname(packageRoot), 'bin', 'utils.cjs');
  
  if (!fs.existsSync(utilsPath)) {
    throw new Error('utils.cjs not found at expected location');
  }
} catch (e) {
  try {
    setupWSConnection = require('./node_modules/y-websocket/bin/utils.cjs').setupWSConnection;
  } catch (e2) {
    console.error('Failed to import setupWSConnection:', e2.message);
    process.exit(1);
  }
}

const port = Number(process.env.PORT || process.env.WS_PORT || 8080);

function isAuthTokenValid(token) {
  const secret = process.env.YJS_AUTH_SECRET;
  
  if (!secret) {
    console.warn('[auth] YJS_AUTH_SECRET not configured');
    return false;
  }
  
  if (!token) {
    console.warn('[auth] No auth token provided in connection');
    return false;
  }

  try {
    const parts = token.split('.');

    if (parts.length !== 2) {
      console.warn(`[auth] Invalid token format - expected 2 parts, got ${parts.length}`);
      return false;
    }

    const [payloadB64, signature] = parts;
    
    const crypto = require('crypto');
    const expectedSignature = crypto.createHash('sha256')
      .update(payloadB64 + secret)
      .digest('hex');
    

    if (signature !== expectedSignature) {
      return false;
    }
    
    let payload;
    try {
      const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf8');
      payload = JSON.parse(payloadStr);
    } catch (parseError) {
      console.warn('[auth] Failed to parse token payload');
      return false;
    }
    
    const { userId, expiry } = payload;
    
    const now = Math.floor(Date.now() / 1000);
    if (now > expiry) {
      console.warn(`[auth] Token expired: ${expiry} < ${now}`);
      return false;
    }
    
    console.log(`[auth] Token validated successfully for user ${userId}`);
    return { userId, expiry };
  } catch (error) {
    console.warn('[auth] Token validation error:', error.message);
    return false;
  }
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
  // Enable compression to reduce egress on Yjs frames
  perMessageDeflate: {
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 15,
    threshold: 1024, // only compress larger frames
  },
  verifyClient: info => {
    const origin = info.origin || info.req.headers.origin || 'unknown';
    const userAgent = info.req.headers['user-agent'] || 'unknown';
    
    try {
      const [pathPart, queryPart] = info.req.url.split('?');
      const room = pathPart?.slice(1) || 'default';
      
      let authToken = null;
      if (queryPart) {
        const params = new URLSearchParams(queryPart);
        authToken = params.get('auth');
      }
      
      console.log(`[connection] Attempt from origin: ${origin}, room: ${room}, UA: ${userAgent.substring(0, 50)}`);
      console.log(`[connection] Path: ${pathPart}, Query: ${queryPart}`);
      console.log(`[connection] Auth token from query: ${authToken?.substring(0, 50)}...`);
      
      const authResult = isAuthTokenValid(authToken);
      if (!authResult) {
        console.warn(`[connection] Rejected connection from ${origin} to room ${room}`);
        return false;
      } else {
        console.log(`[connection] Accepted connection from ${origin} to room ${room} for user ${authResult.userId}`);
        return true;
      }
    } catch (error) {
      console.error(`[connection] Error parsing connection request from ${origin}:`, error.message);
      return false;
    }
  }
});

wss.on('connection', (conn, req) => {
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const origin = req.headers.origin || 'unknown';
  
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    // y-websocket expects room in the path ("/roomname"). Our client uses
    // WebsocketProvider(baseUrl, roomName), which constructs that URL.
    const roomFromPath = (url.pathname || '/').slice(1) || 'default';
    const roomFromQuery = url.searchParams.get('room') || undefined;
    const docName = roomFromQuery || roomFromPath;

    console.log(`[ws] Client connected: IP=${clientIp}, origin=${origin}, room=${docName}`);

    setupWSConnection(conn, req, { docName });

    conn.on('close', (code, reason) => {
      console.log(`[ws] Client disconnected: IP=${clientIp}, room=${docName}, code=${code}, reason=${reason || 'none'}`);
    });

    conn.on('error', (error) => {
      console.error(`[ws] Client error: IP=${clientIp}, room=${docName}, error=${error.message}`);
    });

  } catch (err) {
    console.error(`[ws] Connection setup error for IP=${clientIp}:`, err.message);
    try { 
      conn.close(1011, 'Connection setup failed'); 
    } catch (closeErr) {
      console.error(`[ws] Failed to close errored connection:`, closeErr.message);
    }
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[server] y-websocket server started on 0.0.0.0:${port}`);
  console.log(`[server] Auth secret configured: ${!!process.env.YJS_AUTH_SECRET}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

wss.on('error', (err) => {
  console.error('[server] WebSocket server error:', err.message);
});

process.on('SIGINT', () => {
  console.log('[server] Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('[server] Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[server] Unhandled rejection at:', promise, 'reason:', reason);
});


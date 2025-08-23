const { WebSocketServer } = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const port = Number(process.env.PORT || process.env.WS_PORT || 8080);

const wss = new WebSocketServer({ port });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

wss.on('listening', () => {
  console.log(`listening:${port}`);
});

wss.on('error', (err) => {
  console.error('ws_error', err);
});

process.on('SIGINT', () => {
  wss.close(() => process.exit(0));
});



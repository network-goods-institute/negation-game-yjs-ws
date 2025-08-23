# Yjs WebSocket Service


## Local run

```bash
cd yjs-ws
pnpm i #
pnpm dev
# listens on ws://localhost:8080
```

Point your app to it:

```bash
echo NEXT_PUBLIC_YJS_WS_URL=ws://localhost:8080 >> .env.local
```

## Fly.io deploy

```bash
cd yjs-ws
fly launch --name your-yjs-ws --no-deploy
fly deploy
```

Set this in Vercel project settings:

```
NEXT_PUBLIC_YJS_WS_URL=wss://your-yjs-ws.fly.dev
```



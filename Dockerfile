FROM node:22-alpine
WORKDIR /app
COPY server.js ./server.js
RUN npm init -y \
  && npm i y-websocket ws yjs
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]



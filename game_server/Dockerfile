FROM node:14
COPY . /game_server
RUN npm install express axios socket.io http cookie-parser http jsonwebtoken
CMD ["node", "/game_server/game_server.js"]
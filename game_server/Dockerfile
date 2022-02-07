FROM node:14
COPY . /game_server_js
RUN npm install express axios socket.io http cookie-parser http jsonwebtoken
CMD ["node", "/game_server_js/game_server.js"]
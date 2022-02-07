const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const socket = require('socket.io');
const axios = require('axios');
const { SocketAddress } = require('net');
const { table } = require('console');
const e = require('express');
const { truncate } = require('fs');
const poker = require('poker.js')

const PORT = 5000;
const USERS_ACCESS_TOKEN_SECRET_KEY = 's3cret';

const app = express();
app.use(cookieParser());
app.use(express.json());

const delay = ms => new Promise(res => setTimeout(res, ms));

const server = require('http').Server(app);

const io = socket(server, {
    cors: {
        origin: "*",
    }
});

const tables = {};

async function runGame(tableID) {
    var table = new Table(tableID, io, 1, 2, 10);
    tables[tableID] = table;

    while(true) {
        await delay(3000)

        table.updateActivePlayers()

        if (table.activePlayersCt >= 2)
            table.runDeal();
    }
}

io.on("connection", socket => {
    socket.on("join-game", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        socket.join(tableID);
    });

    socket.on("equalize", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        tables[tableID].playerRaise(username, stake);
    });

    socket.on("raise", function (tableID, stake, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        tables[tableID].playerRaise(username, stake);
    });

    socket.on("fold", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        tables[tableID].playerFold(username);
    });

    socket.on("check", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        tables[tableID].playerCheck(username);
    });
})

function isValidToken(token) {
    if (token == null) {
        return null;
    }
    return jwt.verify(token, USERS_ACCESS_TOKEN_SECRET_KEY, (err, user) => {
        if (err) {

            return null;
        }
        return user.user;
    });
}

runGame(1);

server.listen(PORT, function() {
    console.log('listening on *:5000');
});
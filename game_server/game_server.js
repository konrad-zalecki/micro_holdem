const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const socket = require('socket.io');
const axios = require('axios');
const { SocketAddress } = require('net');
const { table } = require('console');
const e = require('express');
const { truncate } = require('fs');
const poker = require("/game_server/poker.js");

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
    const table = new poker.Table(tableID, io, 1, 2, 15);
    tables[tableID] = table;

    while(true) {
        await delay(3000)

        table.updateActivePlayers()
        
        console.log(table.getActivePlayersCt());

        if (table.getActivePlayersCt() >= 2) {
            table.reset()
            table.paySmallBlind()

            let playersCards = table.deck.deal(table.activePlayers.length)
            for(let i = 0; i < table.activePlayers.length; i++)
                table.activePlayers[i].takeCards(playersCards[i])

            table.sendInitialInfoToPlayers();
            await delay(1000)

            // --------------------------- pre-flop ----------------------------
            console.log('pre-flop')
            table.deck.burnCard()
            var preFlop = table.deck.dealCards(3);
            
            await betting(tableID);

            if (table.playersLeft > 1) {
                // --------------------------- flop ---------------------------
                console.log('flop')
                table.cardsOnTable = table.cardsOnTable.concat(preFlop);
                
                await betting(tableID);

                if (table.playersLeft > 1) {
                    // --------------------------- turn ---------------------------
                    console.log('turn')
                    table.deck.burnCard();
                    table.cardsOnTable.push(table.deck.dealCards(1)[0]);

                    await betting(tableID);

                    if (table.playersLeft > 1) {
                        // --------------------------- river ---------------------------
                        console.log('river')
                        table.deck.burnCard();
                        table.cardsOnTable.push(table.deck.dealCards(1)[0]);
                        
                        await betting(tableID);
                    }
                }
            }

            table.concludeResults();
        }
    }
}

async function betting(tableID) {
    const table = tables[tableID]

    while(table.phaseMovesCt < table.activePlayers.length) {
        table.sendUpdateInfoToPlayers();
        await delay(1000);
        if (table.playersLeft < 2)
            break
        
        // one player bet
        const player = table.activePlayers[table.playerToMove];
        if (player.money != 0 && player.status != 'folded') {
            for(let i=0; i<table.secondsPerTurn; i++) {
                await delay(1000);
                console.log('sekunda masna')
                if (table.currentPlayerMoveDesc != '')
                    break;
            }
            
            table.currentPlayerMoveDesc += ' '
            await delay(500)

            if (table.currentPlayerMoveDesc != ' ') {
                table.setCurrentPlayerMoveDesc('-');
                table.sendMessageInfoToPlayers('decision', this.currentPlayerMoveDesc);
            }
            else {
                player.setStatus('folded');
                table.decPlayersLeft();
                table.sendMessageInfoToPlayers('decision', 'folded');
            }
        }  

        table.incPhaseMovesCt();
        table.incPlayerToMove();
        table.resetCurrentPlayerMoveDesc();
    }
    table.resetPhase();
}

io.on("connection", socket => {
    socket.on("join-game", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        socket.join(tableID);

        tables[tableID].joinPlayer(username, socket);
    });

    socket.on("equalize", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        tables[tableID].playerEqualize(username);
    });

    socket.on("raise", function (tableID, stake, authToken) {
        console.log('raise')
        const username = isValidToken(authToken);
        if (username == null) return;

        console.log(stake)
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
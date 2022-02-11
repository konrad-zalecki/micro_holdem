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

var publicGamesIDs = []
var privateGamesIDs = []

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
            table.paySmallAndBigBlind()

            let playersCards = table.deck.deal(table.activePlayers.length)
            for(let i = 0; i < table.activePlayers.length; i++)
                table.activePlayers[i].takeCards(playersCards[i])

            table.sendCardsInfoToPlayers();
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
            await delay(6000);
        }
    }
}

async function betting(tableID) {
    const table = tables[tableID]

    while(table.phaseMovesCt < table.activePlayers.length) {
        table.sendUpdateInfoToPlayers(table.secondsPerTurn+1);
        // Może nie wysyłać jeśli gracz zfoldował? dziwnie wyglada niby
        await delay(1000);
        if (table.playersLeft < 2)
            break
        
        // one player bet
        const player = table.activePlayers[table.playerToMove];
        if (player.money != 0 && player.status != 'folded') {
            for(let i=0; i<table.secondsPerTurn*10; i++) {
                if (i%10 == 0)
                    table.sendUpdateInfoToPlayers(table.secondsPerTurn-i/10); // new
                await delay(100);

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
        table.sendUpdateInfoToPlayers(0); // new
    }
    table.resetPhase();
}

io.on("connection", socket => {
    socket.on("join-game", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }
        socket.join(tableID);

        tables[tableID].joinPlayer(username, socket);
        socket.emit('name-info', username);
    });

    socket.on("equalize", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }

        tables[tableID].playerEqualize(username);
    });

    socket.on("raise", function (tableID, stake, authToken) {
        console.log('raise')
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }

        console.log(stake)
        tables[tableID].playerRaise(username, stake);
    });

    socket.on("fold", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }

        tables[tableID].playerFold(username);
    });

    socket.on("check", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }

        tables[tableID].playerCheck(username);
    });

    socket.on("leave", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;
        if (!publicGamesIDs.includes(tableID) && !privateGamesIDs.includes(tableID)) {
            socket.emit('wrong-game-id');
            return;
        }

        console.log('leave masno ' + username);
        tables[tableID].leavePlayer(username);
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

// runGame(1);

// -------------------------------------------------


app.get('/get-ongoing-games', async (req, res) => {
    console.log('podaję gierki')
    var gamesInfo = []
    for (id of publicGamesIDs) {
        gamesInfo.push({
            gameID: id,
            playersCt: tables[id].allPlayers.size,
            playerNames: Array.from(tables[id].allPlayers)
        });
    }
    var gamesInfoJson = JSON.stringify(gamesInfo);
    res.json(gamesInfoJson);
});


app.get('/create-new-game', async (req, res) => {
    console.log('bomba giera jest tworzona tak o')
    newID = publicGamesIDs.length + 1
    var game = {
        gameID: newID,
        playersCt: 0,
        playerNames: []
    };

    runGame(newID);
    publicGamesIDs.push(newID);

    const gameJson = JSON.stringify(game);
    res.json(gameJson);
});



server.listen(PORT, function() {
    console.log('listening on *:xxxx');
});
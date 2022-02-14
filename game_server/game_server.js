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
    const table = new poker.Table(tableID, io, 1, 2, 29);
    tables[tableID] = table;

    while(true) {
        await delay(3000)

        let payout = table.updateActivePlayers();
        payPlayers(payout);
        
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
            table.deck.burnCard()
            var preFlop = table.deck.dealCards(3);
            
            await betting(tableID);

            if (table.playersLeft > 1) {
                // --------------------------- flop ---------------------------
                table.cardsOnTable = table.cardsOnTable.concat(preFlop);
                
                await betting(tableID);

                if (table.playersLeft > 1) {
                    // --------------------------- turn ---------------------------
                    table.deck.burnCard();
                    table.cardsOnTable.push(table.deck.dealCards(1)[0]);

                    await betting(tableID);

                    if (table.playersLeft > 1) {
                        // --------------------------- river ---------------------------
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

async function payPlayers(players) {
    for (const player of players) {
        axios
        .post('http://accounts-node:2139/add-coins', {
            user: player.name,
            amount: player.money
        })
        .catch(function (error) {
            console.log("error in payout");
        });
        axios
        .post('http://history-node:2190/add-to-history', {
            user: player.name,
            amount: player.money - player.buyIn
        })
        .catch(function (error) {
            console.log("error in history");
        });
    }
}

async function betting(tableID) {
    const table = tables[tableID]

    while(table.phaseMovesCt < table.activePlayers.length) {
        table.sendUpdateInfoToPlayers(table.secondsPerTurn+1);
        // maybe don't send if player folded?
        await delay(1000);
        if (table.playersLeft < 2)
            break
        
        // one player bet
        const player = table.activePlayers[table.playerToMove];
        if (player.money != 0 && player.status != 'folded') {
            for(let i=0; i<table.secondsPerTurn*10; i++) {
                if (i%10 == 0)
                    table.sendUpdateInfoToPlayers(table.secondsPerTurn-i/10);
                await delay(100);


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
        if (tables[tableID].hasPlayer(username)) {
            tables[tableID].joinPlayer(username, socket, 0);
            return;
        }

        axios
        .post('http://accounts-node:2139/get-balance', {
            user: username
        })
        .then(function (response) {
            let buyIn = Math.min(1000, response.data.balance)
            axios
            .post('http://accounts-node:2139/get-coins', {
                user: username,
                amount: buyIn
            })
            .then(function (response) {
                socket.join(tableID);

                tables[tableID].joinPlayer(username, socket, buyIn);
                socket.emit('name-info', username);
            })
            .catch(function (error) {
                console.log("error get coins");
            }); 
        })
        .catch(function (error) {
            console.log("error get balance");
        }); 
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


app.get('/get-ongoing-games', async (req, res) => {
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

app.post('/create-private-game', async (req, res) => {
    newID = req.body.code;
    var game = {
        gameID: newID,
        playersCt: 0,
        playerNames: []
    };

    runGame(newID);
    privateGamesIDs.push(newID);

    const gameJson = JSON.stringify(game);
    res.json(gameJson);
});


server.listen(PORT, function() {
    console.log('listening on *:xxxx');
});
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const socket = require('socket.io');
const axios = require('axios');
const { SocketAddress } = require('net');
const { table } = require('console');
const e = require('express');
const { truncate } = require('fs');

class Deck {
    constructor() {
        this.cards = []
        this.reset()
    }

    reset() {
        this.cards = []
        const colors = ['h', 'd', 's', 'c']
        // const ranks = ['J', 'D', 'K', 'A']
        for (let i = 2; i<=14; i++) {
            // var rank = i.toString()
            // if (i > 10)
            //     var rank = ranks[i%11]
            for (var color of colors)
                this.cards.push({rank: i, suit: color})
        }
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = this.cards[i];
            this.cards[i] = this.cards[j];
            this.cards[j] = temp;
        }
    }

    deal(players) {
        var deal = []
        for(let i = 0; i < players; i++)
            deal.push([this.cards.pop()])
        for(let i = 0; i < players; i++)
            deal[i].push(this.cards.pop())
        return deal
    }

    dealCards(count) {
        var deal = []
        for(let i = 0; i < count; i++)
            deal.push(this.cards.pop())
        return deal
    }

    burnCard() {
        this.cards.pop()
    }
}

class Player {
    constructor(name, money) {
        this.name = name;
        this.money = money;
        this.status = ''
        this.pool = 0
        this.hand = []
    }

    bet(stake) {
        this.money -= stake;
        this.pool += stake;
    }

    win(pool) {
        this.money += pool
    }

    takeCards(hand) {
        this.hand = hand
    } 

    reset() {
        this.status = 'playing'
        this.pool = 0
        // this.hand = []
    }

    setStatus(status) {
        this.status = status
    }

    get gmoney() {
        return this.money;
    }

    get gname() {
        return this.name;
    }

    get gstatus() {
        return this.status;
    }

    get gpool() {
        return this.pool;
    }

    get ghand() {
        return this.hand;
    }
}

class Table {
    constructor(tableID, io, smallBlind, bigBlind, secondsPerTurn) {
        this.tableID = tableID;
        this.playerMap = {};
        this.allPlayers = new Set();
        this.activePlayers = [];
        this.deck = new Deck();
        this.io = io;
        this.cardsOnTable = [];

        this.playerSmallBlind = 0;
        this.playerToMove = 0;
        this.phaseMovesCt = 0;
        this.playersLeft = 0;
        this.pool = 0;
        this.stake = 0;
        this.currentPlayerMoveDesc = '';

        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
        this.secondsPerTurn = secondsPerTurn
    }

    joinPlayer(name) {
        if (!this.allPlayers.has(name)) {
            var player = new Player(name, 1000);
            this.allPlayers.add(player);
        }
        console.log(name + ' player joined')
    }

    updateActivePlayers() {
        this.activePlayers = [];
        for(const player of this.allPlayers) {
            if (player.gmoney >= this.bigBlind)
                this.activePlayers.push(player);
        }
    }

    reset() {
        this.playerSmallBlind = (this.playerSmallBlind+1)%this.activePlayers.length;
        this.playerToMove = (this.playerSmallBlind+1)%this.activePlayers.length;
        this.phaseEndingPlayer = this.playerToMove;
        this.playersLeft = this.activePlayers.length;
        this.phaseMovesCt = 0;
        this.stake = this.bigBlind;
        this.pool = 0;
        this.currentPlayerMoveDesc = '';
        this.cardsOnTable = []
        for(const player of this.activePlayers)
            player.reset();
        this.deck.reset();
        this.deck.shuffle();
    }
    
    incPlayerToMove() {
        this.playerToMove = (this.playerToMove+1)%this.activePlayers.length;
    }

    incPhaseMovesCt() {
        this.phaseMovesCt += 1;
    }

    resetCurrentPlayerMoveDesc() {
        this.currentPlayerMoveDesc = '';
    }

    setCurrentPlayerMoveDesc(desc) {
        this.currentPlayerMoveDesc = desc;
    }

    setPlayerToMove(player) {
        this.playerToMove = player;
    }

    decPlayersLeft() {
        this.playersLeft -= 1;
    }

    sendInitialInfoToPlayers() {
        console.log('init info')
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.gname,
                money: player.gmoney,
                pool: player.gpool,
                hand: player.ghand,
                status: player.gstatus
            })
        }
        io.in(this.tableID).emit(
            "init-info", 
            players
        );
    }

    sendUpdateInfoToPlayers() {
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.gname,
                money: player.gmoney,
                pool: player.gpool,
                hand: player.ghand,
                status: player.gstatus
            })
        }
        var updateInfoDict = {
            activePlayers: players,
            playerToMove: this.playerToMove,
            cardsOnTable: this.cardsOnTable,
            pool: this.pool,
            stake: this.stake
        }
        io.in(this.tableID).emit(
            "update-info", 
            updateInfoDict
        );
        console.log('update info sent')
    }

    sendFinalInfoToPlayers(name) {
        io.in(this.tableID).emit(
            "final-info", 
            name
        );
    }

    sendMessageInfoToPlayers(type, info) {
        io.in(this.tableID).emit(
            type, 
            info
        );
    }

    concludeResults() {
        var p;
        var highest = 0;
        for (const player of this.activePlayers) {
            let highCard = Math.max(player.ghand[0].rank, player.ghand[1].rank);
            if (highCard > highest) {
                p = player;
                highest = highCard;
            }
            player.reset();
        }
        p.win(this.pool);

        this.sendFinalInfoToPlayers(p.gname);
    }

    playerEqualize(name) {
        if (this.activePlayers[this.playerToMove].gname != name)
            return;
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name; // lock
        const player = this.activePlayers[this.playerToMove];
        let diff = this.stake - player.gpool

        if (player.gmoney >= diff) {
            player.bet(diff);
            this.pool += diff;
        }
        else {
            this.pool += player.gmoney;
            player.bet(player.gmoney);
        }
        this.currentPlayerMoveDesc += ' equalized';
    }

    playerFold(name) {
        if (this.activePlayers[this.playerToMove].gname != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name; // lock
        const player = this.activePlayers[this.playerToMove];

        this.currentPlayerMoveDesc += ' folded';
        player.setStatus('folded')
    }
    
    playerCheck(name) {
        if (this.activePlayers[this.playerToMove].gname != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];

        if (this.stake > player.gpool)
            return
        this.currentPlayerMoveDesc = name; // lock

        this.currentPlayerMoveDesc += ' checked';
    }

    playerRaise(name, stake) {
        if (this.activePlayers[this.playerToMove].gname != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];

        if (player.gpool + stake < this.stake)
            return
        if (player.gmoney < stake)
            return
        this.currentPlayerMoveDesc = name; // lock

        player.bet(stake)
        this.stake = player.gpool
        this.pool += stake    

        this.phaseMovesCt = 0;
        this.currentPlayerMoveDesc += ' raised';
    }

    paySmallBlind() {
        const player = this.activePlayers[this.playerSmallBlind];
        player.bet(this.smallBlind);
        this.pool += this.smallBlind;
    }

    sleep(ms) {
        var start = new Date().getTime(), expire = start + ms;
        while (new Date().getTime() < expire) { }
        return;
    }

    getActivePlayersCt() {
        return this.activePlayers.length;
    }

    resetPhase() {
        this.phaseMovesCt = 0;
        this.playerToMove = this.playerSmallBlind;
    }
}




// ----------------

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
    const table = new Table(tableID, io, 1, 2, 15);
    tables[tableID] = table;

    while(true) {
        await delay(3000)

        table.updateActivePlayers()
        
        console.log(table.getActivePlayersCt());

        if (table.getActivePlayersCt() >= 2) {
            console.log('uuuuuuuuuuuuuuuuuuuuuuuuuuu')
            table.reset()
            table.paySmallBlind()

            let playersCards = table.deck.deal(table.activePlayers.length)
            for(let i = 0; i < table.activePlayers.length; i++)
                table.activePlayers[i].takeCards(playersCards[i])

            table.sendInitialInfoToPlayers();
            await delay(1000)

            // pre-flop
            console.log('pre-flop')
            table.deck.burnCard()
            var preFlop = table.deck.dealCards(3);
            
            // betting -----------------------

            while(table.phaseMovesCt < table.activePlayers.length) {
                table.sendUpdateInfoToPlayers();
                
                // one player bet
                const player = table.activePlayers[table.playerToMove];
                if (player.gmoney != 0 && player.gstatus != 'folded') {
                    for(let i=0; i<table.secondsPerTurn; i++) {
                        await delay(1000);
                        console.log('sekunda masna')
                        if (table.currentPlayerMoveDesc != '')
                            break;
                    }
                
                    if (table.currentPlayerMoveDesc != '') {
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
            // end betting -------------------

            if (table.playersLeft > 1) {
                // flop
                console.log('flop')
                table.cardsOnTable = table.cardsOnTable.concat(preFlop);
                
                // betting ---------------------

                while(table.phaseMovesCt < table.activePlayers.length) {
                    table.sendUpdateInfoToPlayers();
                    
                    // one player bet
                    const player = table.activePlayers[table.playerToMove];
                    if (player.gmoney != 0 && player.gstatus != 'folded') {
                        for(let i=0; i<table.secondsPerTurn; i++) {
                            await delay(1000);
                            console.log('sekunda masna')
                            if (table.currentPlayerMoveDesc != '')
                                break;
                        }
                    
                        if (table.currentPlayerMoveDesc != '') {
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
                // end betting --------------------

                if (table.playersLeft > 1) {
                    // turn
                    console.log('turn')
                    table.deck.burnCard();
                    table.cardsOnTable.push(table.deck.dealCards(1)[0]);
                    // betting ---------------------

                    while(table.phaseMovesCt < table.activePlayers.length) {
                        table.sendUpdateInfoToPlayers();
                        
                        // one player bet
                        const player = table.activePlayers[table.playerToMove];
                        if (player.gmoney != 0 && player.gstatus != 'folded') {
                            for(let i=0; i<table.secondsPerTurn; i++) {
                                await delay(1000);
                                console.log('sekunda masna')
                                if (table.currentPlayerMoveDesc != '')
                                    break;
                            }
                        
                            if (table.currentPlayerMoveDesc != '') {
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
                    // end betting --------------------

                    if (table.playersLeft > 1) {
                        // river
                        console.log('river')
                        table.deck.burnCard();
                        table.cardsOnTable.push(table.deck.dealCards(1)[0]);
                        
                        // betting ---------------------

                        while(table.phaseMovesCt < table.activePlayers.length) {
                            table.sendUpdateInfoToPlayers();
                            
                            // one player bet
                            const player = table.activePlayers[table.playerToMove];
                            if (player.gmoney != 0 && player.gstatus != 'folded') {
                                for(let i=0; i<table.secondsPerTurn; i++) {
                                    await delay(1000);
                                    console.log('sekunda masna')
                                    if (table.currentPlayerMoveDesc != '')
                                        break;
                                }
                            
                                if (table.currentPlayerMoveDesc != '') {
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
                        table.setPlayerToMove(table.playerSmallBlind);
                        // end betting --------------------
                    }
                }
            }

            table.concludeResults();
        }
    }
}

io.on("connection", socket => {
    socket.on("join-game", function (tableID, authToken) {
        const username = isValidToken(authToken);
        if (username == null) return;

        socket.join(tableID);

        tables[tableID].joinPlayer(username);
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
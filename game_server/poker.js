class Deck {
    constructor() {
        this.cards = []
        this.reset()
    }

    reset() {
        this.cards = []
        const colors = ['H', 'D', 'S', 'C']
        const ranks = ['J', 'Q', 'K', 'A']
        for (let i = 2; i<=14; i++) {
            var rank = i.toString()
            if (i > 10)
                rank = ranks[i%11]
            for (var color of colors)
                this.cards.push({rank: rank, suit: color})
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
    constructor(name, money, socket) {
        this.name = name;
        this.money = money;
        this.status = ''
        this.pool = 0
        this.hand = []
        this.socket = socket
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
}

class Table {
    constructor(tableID, io, smallBlind, bigBlind, secondsPerTurn) {
        this.tableID = tableID;
        this.playerMap = {};
        this.allPlayers = new Set();
        this.playersToLeave = new Set();
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

    joinPlayer(name, socket) {
        if (!this.allPlayers.has(name)) {
            var player = new Player(name, 1000, socket);
            this.allPlayers.add(name);
            this.playerMap[name] = player
        }
        else {
            this.playersToLeave.delete(name);
            this.playerMap[name].socket = socket;
        }
        console.log(name + ' player joined')
    }

    leavePlayer(name) {
        if (this.allPlayers.has(name)) {
            this.playersToLeave.add(name);
        }
    }

    payoutPlayer(player) {
        console.log('PAYOUT TIME BBY ' + player)
        return;
    }

    updateActivePlayers() {
        // lock needed
        for(var name of this.playersToLeave) {
            this.allPlayers.delete(name);
            var player = this.playerMap[name];
            this.payoutPlayer(player);
            delete this.playerMap[name];
        }
        this.playersToLeave.clear();

        this.activePlayers = [];
        for(const name of this.allPlayers) {
            var player = this.playerMap[name];
            if (player.money >= this.bigBlind)
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

    sendCardsInfoToPlayers() {
        for (const player of this.activePlayers) {
            player.socket.emit('cards-info', player.hand);
        }
        console.log("cards info sent");
    }

    sendInitialInfoToPlayers() {
        console.log('init info')
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.name,
                money: player.money,
                pool: player.pool,
                hand: player.hand,
                status: player.status
            })
        }
        this.io.in(this.tableID).emit(
            "init-info", 
            players
        );
    }

    sendUpdateInfoToPlayers() {
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.name,
                money: player.money,
                pool: player.pool,
                hand: player.hand,
                status: player.status
            })
        }
        var updateInfoDict = {
            activePlayers: players,
            playerToMove: this.playerToMove,
            cardsOnTable: this.cardsOnTable,
            pool: this.pool,
            stake: this.stake
        }
        this.io.in(this.tableID).emit(
            "update-info", 
            updateInfoDict
        );

        // const player = this.activePlayers[this.playerToMove];
        // player.socket.emit('your-turn')
        // console.log('update info sent')
    }

    sendFinalInfoToPlayers(name) {
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.name,
                hand: player.hand,
            })
        }
        this.io.in(this.tableID).emit(
            "final-info", 
            players,
            name
        );
    }

    sendMessageInfoToPlayers(type, info) {
        this.io.in(this.tableID).emit(
            type, 
            info
        );
    }

    concludeResults() {
        var p = this.activePlayers[0];
        var highest = 0;
        for (const player of this.activePlayers) {
            let highCard = Math.max(player.hand[0].rank, player.hand[1].rank);
            if (highCard > highest) {
                p = player;
                highest = highCard;
            }
            player.reset();
        }
        p.win(this.pool);
        console.log("final info")

        this.sendFinalInfoToPlayers(p.name);
    }

    playerEqualize(name) {
        if (this.activePlayers[this.playerToMove].name != name)
            return;
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name; // lock
        const player = this.activePlayers[this.playerToMove];
        let diff = this.stake - player.pool

        if (player.money >= diff) {
            player.bet(diff);
            this.pool += diff;
        }
        else {
            this.pool += player.money;
            player.bet(player.money);
        }
        this.currentPlayerMoveDesc += ' equalized';
    }

    playerFold(name) {
        if (this.activePlayers[this.playerToMove].name != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name; // lock
        const player = this.activePlayers[this.playerToMove];

        this.currentPlayerMoveDesc += ' folded';
        this.decPlayersLeft();
        player.setStatus('folded')
    }
    
    playerCheck(name) {
        if (this.activePlayers[this.playerToMove].name != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];

        if (this.stake > player.pool)
            return
        this.currentPlayerMoveDesc = name; // lock

        this.currentPlayerMoveDesc += ' checked';
    }

    playerRaise(name, stake) {
        console.log('ok')
        if (this.activePlayers[this.playerToMove].name != name)
            return
        console.log('lol')
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];
        console.log(player.pool)

        if (player.pool + stake < this.stake)
            return
        if (player.money < stake)
            return
        this.currentPlayerMoveDesc = name; // lock

        player.bet(stake)
        this.stake = player.pool
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


module.exports.Table = Table;

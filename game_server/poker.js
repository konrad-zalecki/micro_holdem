const { table } = require("console")

class Deck {
    constructor() {
        this.cards = []
        this.reset()
    }

    reset() {
        this.cards = []
        const colors = ['h', 'd', 's', 'c']
        const ranks = ['J', 'D', 'K', 'A']
        for (let i = 2; i<=14; i++) {
            var rank = i.toString()
            if (i > 10)
                var rank = ranks[i%11]
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
    }

    get money() {
        return this.money;
    }

    get name() {
        return this.name;
    }

    get pool() {
        return this.pool;
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
    }

    updateActivePlayers() {
        this.activePlayers = [];
        for(const player of this.allPlayers) {
            if (player.money >= this.bigBlind)
                this.activePlayers.push(player);
        }
    }

    reset() {
        this.playerSmallBlind = (this.playerSmallBlind+1)%this.activePlayers.length;
        this.playerToMove = (this.playerSmallBlind+1)%this.activePlayers.length;
        this.phaseEndingPlayer = this.playerToMove;
        this.playersLeft = this.activePlayers.length;
        this.stake = this.bigBlind;
        this.pool = 0;
        this.currentPlayerMoveDesc = '';
        for(const player in this.activePlayers)
            player.reset()
    }

    runDeal() {
        this.reset()
        this.paySmallBlind()

        let playersCards = this.deck.deal(this.activePlayers.length)
        for(let i = 0; i < this.activePlayers.length; i++)
            this.activePlayers[i].takeCards(playersCards[i])

        this.sendInitialInfoToPlayers();

        // pre-flop
        this.deck.burnCard()
        var preFlop = this.deck.dealCards(3);
        this.betting();

        if (this.playersLeft > 1) {
            // flop
            this.cardsOnTable.concat(preFlop);
            this.betting()

            if (this.playersLeft > 1) {
                // turn
                this.deck.burnCard();
                this.cardsOnTable.push(this.deck.dealCards(1)[0]);
                this.betting();

                if (this.playersLeft > 1) {
                    // river
                    this.deck.burnCard();
                    this.cardsOnTable.push(this.deck.dealCards(1)[0]);
                    this.betting();
                }
            }
        }

        concludeResults();
    }

    onePlayerBet() {
        const player = this.activePlayers[this.playerToMove];
        if (player.money == 0 || player.status == 'folded')
            return
        
        for(let i=0; i<this.secondsPerTurn; i++) {
            this.sleep(1000)
            if (this.currentPlayerMoveDesc != '')
                break;
        }

        if (this.currentPlayerMoveDesc != '') {
            this.currentPlayerMoveDesc = '-';
            this.sendMessageInfoToPlayers('decision', this.currentPlayerMoveDesc);
        }
        else {
            player.setStatus(folded);
            this.playersLeft -= 1;
            this.sendMessageInfoToPlayers('decision', 'folded');
        }
    }

    betting() {
        while(this.phaseMovesCt < this.activePlayers.length) {
            this.sendUpdateInfoToPlayers();
            onePlayerBet();
            this.phaseMovesCt += 1;
            this.playerToMove = (this.playerToMove+1)%this.activePlayers;
            this.currentPlayerMoveDesc = '';
        }
        this.playerToMove = this.playerSmallBlind;
        this.sendUpdateInfoToPlayers();
    }

    sendInitialInfoToPlayers() {
        io.in(tableID).emit(
            "init-info", 
            this.playerToMove,
        );
    }

    sendUpdateInfoToPlayers() {
        io.in(tableID).emit(
            "init-info", 
            this.playerToMove,
        );
    }

    sendMessageInfoToPlayers(type, info) {
        io.in(tableID).emit(
            type, 
            info
        );
    }

    concludeResults() {

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

        this.currentPlayerMoveDesc += ' folded';
    }
    
    playerCheck(name) {
        if (this.activePlayers[this.playerToMove].name != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name; // lock

        this.currentPlayerMoveDesc += ' folded';
    }

    playerRaise(name, stake) {
        if (this.activePlayers[this.playerToMove].name != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];

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
}
const { monitorEventLoopDelay } = require("perf_hooks")

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
                this.cards.push({rank: rank, suit: color, val: i})
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

    static checkRF(cards) {
        if (!Deck.checkST(cards))
            return false;
        if (!Deck.checkFL(cards))
            return false;
        return true;
    }

    static checkFOAK(cards) {
        if (cards[0].val == cards[3].val || cards[1].val == cards[4].val)
            return true;
        return false;
    }

    static checkFH(cards) {
        if (cards[0].val == cards[1].val && cards[2].val == cards[4].val)
            return true;
        if (cards[0].val == cards[2].val && cards[3].val == cards[4].val)
            return true;
        return false;
    }

    static checkFL(cards) {
        for (let i=1; i<5; i++) {
            if (cards[i].suit != cards[i-1].suit)
                return false;
        }
        return true;
    }

    static checkST(cards) {
        let cond = true;
        for (let i=1; i<4; i++) {
            if (cards[i].val != cards[i-1].val+1)
                cond = false;
        }
        if (!cond)
            return false;
        
        if (cards[4].val == cards[3].val+1)
            return true;
        if (cards[4].val == 14 && cards[0].val == 2)
            return true;
        return false;
    }  

    static checkTOAK(cards) {
        for (let i=0; i<3; i++) {
            if (cards[i].val == cards[i+2].val)
                return true;
        }
        return false;
    }

    static checkTP(cards) {
        if (cards[0].val == cards[1].val && cards[2].val == cards[3].val)
            return true;
        if (cards[0].val == cards[1].val && cards[3].val == cards[4].val)
            return true;
        if (cards[1].val == cards[2].val && cards[3].val == cards[4].val)
            return true;
        return false;
    }

    static checkPR(cards) {
        for (let i=0; i<4; i++) {
            if (cards[i].val == cards[i+1].val)
                return true;
        }
        return false;
    }

    static getCardsVal(cards) {
        var val = "";
        for (let i=4; i>=0; i--) {
            let x = cards[i].val.toString();
            if (x.length == 1)
                x = '0'+x;
            val += x;
        }
        return val;
    }

    static getCardsValST(cards) {
        if (cards[0].val == 2 && cards[4].val == 14)
            return '0504030201';
        return Deck.getCardsVal(cards);
    }

    static getFigure(cards) {
        var val = "";
        for (let i=0; i<5; i++) {
            val += cards[i].rank + cards[i].suit;
            if (i != 4)
                val += ',';
        }
        return val;
    }

    static getFigureST(cards) {
        if (cards[0].val == 2 && cards[4].val == 14)
            cards = [cards[4]].concat(cards.slice(0, 4));
        return Deck.getFigure(cards);
    }
}

class Player {
    constructor(name, money, socket) {
        this.name = name;
        this.money = money;
        this.status = '';
        this.pool = 0;
        this.hand = [];
        this.socket = socket;
        this.buyIn = money;
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

    hasPlayer(name) {
        return this.allPlayers.has(name);
    }

    joinPlayer(name, socket, buyIn) {
        if (!this.allPlayers.has(name)) {
            var player = new Player(name, buyIn, socket);
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

    updateActivePlayers() {
        var payout = []
        for(var name of this.playersToLeave) {
            this.allPlayers.delete(name);
            var player = this.playerMap[name];
            payout.push(player);
            delete this.playerMap[name];
        }
        this.playersToLeave.clear();

        this.activePlayers = [];
        for(const name of this.allPlayers) {
            var player = this.playerMap[name];
            if (player.money >= this.bigBlind)
                this.activePlayers.push(player);
        }
        return payout
    }

    reset() {
        this.playerSmallBlind = (this.playerSmallBlind+1)%this.activePlayers.length;
        this.playerToMove = (this.playerSmallBlind+2)%this.activePlayers.length;
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
    }

    sendInitialInfoToPlayers() {
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

    sendUpdateInfoToPlayers(time=0) {
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
            stake: this.stake,
            time: time
        }
        this.io.in(this.tableID).emit(
            "update-info", 
            updateInfoDict
        );
    }

    sendFinalInfoToPlayers(figureMap, earningsMap) {
        var players = []
        for (const player of this.activePlayers) {
            players.push({
                name: player.name,
                hand: player.hand,
            })
        }

        var winInfo = []
        for (const player of this.activePlayers) {
            if (earningsMap[player.name] > 0) {
                winInfo.push({
                    info: "player " + player.name + " won " + earningsMap[player.name].toString(),
                    cards: figureMap[player.name].split(',')
                });
            }
        }

        this.io.in(this.tableID).emit(
            "final-info", 
            players,
            winInfo
        );
    }

    sendMessageInfoToPlayers(type, info) {
        this.io.in(this.tableID).emit(
            type, 
            info
        );
    }

    calculateBestFigure(player) {
        if (this.cardsOnTable.length < 5) {
            return [1, '', player];
        }

        var allCards = player.hand.concat(this.cardsOnTable)
        var bestFigureVal = 0;
        var bestFigure = ''
        for (let i1=0; i1<7; i1++) {
            for (let i2=i1+1; i2<7; i2++) {
                let t = []
                for (let i=0; i<7; i++) {
                    if (i != i1 && i != i2)
                        t.push(allCards[i])
                }
                t = t.sort(function(a,b) {
                    return a.val - b.val;
                });
                let cardsVal = '';
                let figure = ''
                if (Deck.checkRF(t))
                    cardsVal = '8';
                else if (Deck.checkFOAK(t))
                    cardsVal = '7';
                else if (Deck.checkFH(t))
                    cardsVal = '6';
                else if (Deck.checkFL(t))
                    cardsVal = '5';
                else if (Deck.checkST(t))
                    cardsVal = '4';
                else if (Deck.checkTOAK(t))
                    cardsVal = '3';
                else if (Deck.checkTP(t))
                    cardsVal = '2';
                else if (Deck.checkPR(t))
                    cardsVal = '1';
                else
                    cardsVal = '0';

                if (cardsVal == '8' || cardsVal == '4') {
                    cardsVal += Deck.getCardsValST(t)
                    figure = Deck.getFigureST(t)
                }
                else {
                    cardsVal += Deck.getCardsVal(t)
                    figure = Deck.getFigure(t)
                }

                cardsVal = parseInt(cardsVal, 10);
                if (cardsVal > bestFigureVal) {
                    bestFigureVal = cardsVal;
                    bestFigure = figure;
                }
            }
        }
        return [bestFigureVal, bestFigure, player]
    }

    concludeResults() {
        var figures = []
        for (const player of this.activePlayers) {
            if (player.status != 'folded') {
                figures.push(this.calculateBestFigure(player))
            }
        }
        figures = figures.sort(function(a,b) {
            return b[0] - a[0];
        });
        console.log(figures);

        // playerName -> figure
        var figureMap = {}
        // playerName -> win
        var earningsMap = {}
        for (const player of this.activePlayers)
            earningsMap[player.name] = 0;

        for (const figure of figures) 
            figureMap[figure[2].name] = figure[1];

        var stakePaid = 0;
        while (figures.length > 0 && stakePaid < this.stake) {
            // get all players having current best figure
            let i = 1;
            while (i < figures.length && figures[i][0] == figures[0][0])
                i += 1;
            let curPlayers = []
            for (let j=0; j<i; j++)
                curPlayers.push([figures[j][2].pool, figures[j][2]])
            figures = figures.slice(i)
            
            // sort players having current best figure by pool
            curPlayers = curPlayers.sort(function(a,b) {
                return a[0] - b[0];
            });

            // pay each player
            let cur = 0;
            for (const winner of curPlayers) {
                // if there is anything to win
                if (winner[0] > stakePaid) {
                    let poolToWin = winner[0] - stakePaid;
                    let curPlayer = winner[1];
                    let money = 0;
                    for (const player of this.activePlayers) {
                        let moneyLeft = player.pool - stakePaid;
                        if (moneyLeft > 0)
                            money += Math.min(moneyLeft, poolToWin);
                    }
                    for (let j=cur; j<curPlayers.length; j++) {
                        let curWin = money/(curPlayers.length - cur);
                        curPlayers[j][1].win(curWin);
                        earningsMap[curPlayers[j][1].name] += curWin;
                    }
                    cur +=  1
                    stakePaid = winner[0];
                }
            }
        }

        this.sendFinalInfoToPlayers(figureMap, earningsMap);
    }

    playerEqualize(name) {
        if (this.activePlayers[this.playerToMove].name != name)
            return;
        if (this.currentPlayerMoveDesc != '')
            return;
        this.currentPlayerMoveDesc = name;
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
        this.currentPlayerMoveDesc = name;
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
        this.currentPlayerMoveDesc = name;

        this.currentPlayerMoveDesc += ' checked';
    }

    playerRaise(name, stake) {
        if (this.activePlayers[this.playerToMove].name != name)
            return
        if (this.currentPlayerMoveDesc != '')
            return;
        const player = this.activePlayers[this.playerToMove];
        console.log(player.pool)

        if (player.pool + stake < this.stake)
            return
        if (player.money < stake)
            return
        this.currentPlayerMoveDesc = name;

        player.bet(stake)
        this.stake = player.pool
        this.pool += stake    

        this.phaseMovesCt = 0;
        this.currentPlayerMoveDesc += ' raised';
    }

    paySmallAndBigBlind() {
        this.activePlayers[this.playerSmallBlind].bet(this.smallBlind);
        this.activePlayers[(this.playerSmallBlind+1)%this.activePlayers.length].bet(this.bigBlind);
        this.pool += this.smallBlind + this.bigBlind;
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

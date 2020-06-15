import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver'
import { TBTC_SYM, TETH_SYM, BITFINEX_EXP, BITFINEX_MIN, DISTRIBUTION, OFFER_MAX, COIN_MAX, COIN_MAX_MAX, RISK_MAX, SUPPORT_COIN, USERDB, BITNIFEX_PARENT, FUSD_SYM, FUSDT_SYM, FETH_SYM, FBTC_SYM, FOMG_SYM, EXTREM_RATE_NUMBER, EXTREM_DURATION, UPDATE_BOOK, UPDATE_ORDER, SUPPORT_PAIR, MINIMAL_OFFER, SUPPORT_PRICE } from '../constants'
import BFX from 'bitfinex-api-node'
import { FundingOffer, Order } from 'bfx-api-node-models'
import Mongo from '../models/mongo-tool'
import { handleError, HoError, isValidString } from '../util/utility'
import sendWs from '../util/sendWs'

//system
const bfx = new BFX({ apiKey: BITFINEX_KEY, apiSecret: BITFINEX_SECRET });
const rest = bfx.rest(2, { transform: true });
let finalRate = {};
let maxRange = {};
let currentRate = {};
let priceData = {};

//user
let userWs = {};
let userOk = {};
let updateTime = {};
let extremRate = {};

let available = {};
let margin = {};

let offer = {};
let order = {};

let credit = {};
let ledger = {};
let position = {};

//wallet history
//credit history
//5m candle x

export const calRate = curArr => {
    const recurPrice = index => {
        if (index >= SUPPORT_PRICE.length) {
            if (priceData[TBTC_SYM].dailyChange < COIN_MAX || priceData[TETH_SYM].dailyChange < COIN_MAX) {
                sendWs(`Bitfinex Daily Change: ${priceData[TBTC_SYM].dailyChange} ${priceData[TETH_SYM].dailyChange}` , 0, 0, true);
            }
            return Promise.resolve();
        } else {
            return rest.ticker(SUPPORT_PRICE[index]).then(ticker => {
                priceData[SUPPORT_PRICE[index]] = {
                    dailyChange: ticker.dailyChangePerc * 100,
                    lastPrice: ticker.lastPrice,
                    time: Math.round(new Date().getTime() / 1000),
                }
                return recurPrice(index + 1);
            });
        }
    }
    const singleCal = (curType, index) => rest.ticker(curType).then(curTicker => rest.orderBook(curType, 'P0', 100).then(orderBooks => {
        currentRate[curType] = {
            rate: curTicker.lastPrice * BITFINEX_EXP,
            time: Math.round(new Date().getTime() / 1000),
        };
        const hl = [];
        const weight = [];
        return rest.candles({symbol: curType, timeframe: '1m', period: 'p2', query: {limit: 1440}}).then(entries => {
            const calHL = (start, end, startHigh = -1, startLow = -1, vol = 0) => {
                for (let i = start; i < end; i++) {
                    if (!entries[i]) {
                        break;
                    }
                    const high = entries[i]['high'] * BITFINEX_EXP;
                    const low = entries[i]['low'] * BITFINEX_EXP;
                    const wi = Math.floor(high / BITFINEX_MIN);
                    weight[wi] = weight[wi] ? weight[wi] + entries[i].volume : entries[i].volume;
                    //console.log(high);
                    //console.log(low);
                    if (high > startHigh) {
                        startHigh = high;
                    }
                    if (startLow < 0 || low < startLow) {
                        startLow = low;
                    }
                    vol = vol + entries[i].volume;
                }
                return {
                    high: startHigh,
                    low: startLow,
                    vol,
                };
            }
            hl.push(calHL(0, 5));
            hl.push(calHL(5, 10, hl[0].high, hl[0].low, hl[0].vol));
            hl.push(calHL(10, 20, hl[1].high, hl[1].low, hl[1].vol));
            hl.push(calHL(20, 40, hl[2].high, hl[2].low, hl[2].vol));
            hl.push(calHL(40, 80, hl[3].high, hl[3].low, hl[3].vol));
            hl.push(calHL(80, 160, hl[4].high, hl[4].low, hl[4].vol));
            hl.push(calHL(160, 320, hl[5].high, hl[5].low, hl[5].vol));
            hl.push(calHL(320, 640, hl[6].high, hl[6].low, hl[6].vol));
            hl.push(calHL(640, 1280, hl[7].high, hl[7].low, hl[7].vol));
            hl.push(calHL(1280, 2560, hl[8].high, hl[8].low, hl[8].vol));
            const calOBRate = orderBooks => {
                let volsum = 0;
                let vol = 0;
                let j = 0;
                const rate = [];
                orderBooks.forEach(v => {
                    if(v[3] > 0) {
                        volsum = volsum + v[3];
                    }
                });
                orderBooks.forEach(v => {
                    if(v[3] > 0) {
                        if (rate.length === 0) {
                            rate.push(v[0] * BITFINEX_EXP);
                        }
                        if (rate.length > 9) {
                            rate[10] = v[0] * BITFINEX_EXP;
                        } else {
                            vol = vol + v[3];
                            while (vol >= (volsum / 100 * DISTRIBUTION[j]) && j < 9) {
                                rate.push(v[0] * BITFINEX_EXP);
                                j++;
                            }
                        }
                    }
                });
                return rate.reverse();
            }
            const calTenthRate = (hl, weight) => {
                const rate = [hl[9].low];
                let i = 0;
                let j = 0;
                weight.forEach((v, k) => {
                    if (weight[k]) {
                        i = i + weight[k];
                        while (i >= (hl[9].vol / 100 * DISTRIBUTION[j]) && j < 9) {
                            rate.push(k * 100);
                            j++;
                        }
                    }
                });
                rate.push(hl[9].high);
                return rate.reverse();
            }
            const OBRate = calOBRate(orderBooks);
            const tenthRate = calTenthRate(hl, weight);
            maxRange[curType] = tenthRate[1] - tenthRate[9];
            finalRate[curType] = tenthRate.map((v, k) => (v > OBRate[k] || !OBRate[k]) ? (v - 1) : (OBRate[k] - 1));
            console.log(`${curType} RATE: ${finalRate[curType]}`);
            console.log(OBRate);
            console.log(tenthRate);
            //console.log(currentRate[curType]);
            //console.log(maxRange[curType]);
        });
    }));
    const recurType = index => (index >= curArr.length) ? Promise.resolve(sendWs({
            type: 'bitfinex',
            data: 0,
        })) : (SUPPORT_COIN.indexOf(curArr[index]) !== -1) ? singleCal(curArr[index], index).then(() => recurType(index + 1)) : recurType(index + 1);
    return recurPrice(0).then(() => recurType(0));
}

export const setWsOffer = (id, curArr=[]) => {
    //檢查跟設定active
    curArr = curArr.filter(v => (v.isActive && v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0) ? true : false);
    if (curArr.length < 1) {
        return Promise.resolve();
    }
    let userKey  = null;
    let userSecret = null;
    for (let i = 0; i < curArr.length; i++) {
        if (curArr[i].key && curArr[i].secret) {
            userKey = curArr[i].key;
            userSecret = curArr[i].secret;
            break;
        }
    }
    if (!userKey || !userSecret) {
        return handleError(new HoError('Api key or secret Missing'));
    }
    const userBfx = new BFX({ apiKey: userKey, apiSecret: userSecret });
    const userRest = userBfx.rest(2, { transform: true });
    const cancelOrder = (symbol, index, amount, time, type, is_close) => {
        if (!order[id][symbol] || index >= order[id][symbol].length || is_close) {
            return Promise.resolve();
        } else {
            console.log(amount);
            console.log(time);
            console.log(type);
            console.log(order[id][symbol][index]);
            console.log(is_close);
            if (order[id][symbol][index].amount === amount && Math.abs(order[id][symbol][index].time - time) < 60 && ((type !== 'LIMIT' && order[id][symbol][index].type == 'LIMIT') || (type === 'LIMIT' && order[id][symbol][index].type !== 'LIMIT')) && !is_close) {
                return userRest.cancelOrder(order[id][symbol][index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOrder(symbol, index + 1, amount, time, type, true)));
            } else {
                return cancelOrder(symbol, index + 1, amount, time, type, is_close);
            }
        }
    }
    if (!userWs[id] || !userOk[id]) {
        console.log('initial ws');
        if (!updateTime[id]) {
            updateTime[id] = {};
            updateTime[id]['book'] = 0;
            updateTime[id]['offer'] = 0;
            updateTime[id]['credit'] = 0;
            updateTime[id]['position'] = 0;
            updateTime[id]['order'] = 0;
        }
        if (!available[id]) {
            available[id] = {}
        }
        if (!margin[id]) {
            margin[id] = {}
        }
        if (!offer[id]) {
            offer[id] = {};
        }
        if (!order[id]) {
            order[id] = {};
        }
        if (!credit[id]) {
            credit[id] = {};
        }
        if (!ledger[id]) {
            ledger[id] = {};
        }
        if (!position[id]) {
            position[id] = {};
        }
        if (!extremRate[id]) {
            extremRate[id] = {}
        }
        userWs[id] = userBfx.ws(2,{ transform: true });
        userWs[id].on('error', err => {
            if (!(err.message||err.msg).includes('auth: dup')) {
                sendWs(`${id} Bitfinex Ws Error: ${err.message||err.msg}`, 0, 0, true);
                handleError(err, `${id} Bitfinex Ws Error`);
            }
        });
        userWs[id].on('open', () => userWs[id].auth());
        userWs[id].once('auth', () => {
            console.log(`${id} authenticated`);
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate ({}, wallet => {
            SUPPORT_COIN.forEach((t, i) => {
                if (wallet.currency === t.substr(1)) {
                    if (wallet.type === 'funding') {
                        available[id][t] = {
                            avail: wallet.balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: wallet.balance,
                        }
                        sendWs({
                            type: 'bitfinex',
                            data: (i+1) * 10000,
                            user: id,
                        });
                    } else if (wallet.type === 'margin') {
                        margin[id][t] = {
                            avail: wallet.balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: wallet.balance,
                        }
                    }
                }
            });
        });
        userWs[id].onFundingOfferUpdate({ }, fo => {
            if (SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                if (!offer[id][fo.symbol]) {
                    offer[id][fo.symbol] = [];
                }
                for (let j = 0; j < offer[id][fo.symbol].length; j++) {
                    if (offer[id][fo.symbol][j].id === fo.id) {
                        //offer[id][fo.symbol][j].time = fo.mtsCreate;
                        offer[id][fo.symbol][j].amount = fo.amount;
                        offer[id][fo.symbol][j].rate = fo.rate;
                        offer[id][fo.symbol][j].period = fo.period;
                        offer[id][fo.symbol][j].status = fo.status;
                        break;
                    }
                }
                const now = Math.round(new Date().getTime() / 1000);
                if ((now - updateTime[id]['offer']) > UPDATE_ORDER) {
                    updateTime[id]['offer'] = now;
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
            }
        });
        userWs[id].onFundingOfferNew({ }, fo => {
            if (SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                console.log(`${fo.symbol} ${id} offer new`);
                if (!offer[id][fo.symbol]) {
                    offer[id][fo.symbol] = [];
                }
                let isExist = false;
                for (let i = 0; i < offer[id][fo.symbol].length; i++) {
                    if (fo.id === offer[id][fo.symbol][i].id) {
                        offer[id][fo.symbol][i].time = Math.round(fo.mtsCreate / 1000);
                        offer[id][fo.symbol][i].status = fo.status;
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    offer[id][fo.symbol].push({
                        id: fo.id,
                        time: Math.round(fo.mtsCreate / 1000),
                        amount: fo.amount,
                        rate: fo.rate,
                        period: fo.period,
                        status: fo.status,
                    });
                }
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onFundingOfferClose({ }, fo => {
            if (SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                console.log(`${fo.symbol} ${id} offer close`);
                if (offer[id][fo.symbol]) {
                    for (let j = 0; j < offer[id][fo.symbol].length; j++) {
                        if (offer[id][fo.symbol][j].id === fo.id) {
                            offer[id][fo.symbol].splice(j, 1);
                            break;
                        }
                    }
                }
            }
        });
        userWs[id].onFundingCreditUpdate({ }, fc => {
            if (SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (!credit[id][fc.symbol]) {
                    credit[id][fc.symbol] = [];
                }
                for (let j = 0; j < credit[id][fc.symbol].length; j++) {
                    if (credit[id][fc.symbol][j].id === fc.id) {
                        credit[id][fc.symbol][j].time = Math.round(fc.mtsOpening / 1000);
                        credit[id][fc.symbol][j].amount = fc.amount;
                        credit[id][fc.symbol][j].rate = fc.rate;
                        credit[id][fc.symbol][j].period = fc.period;
                        credit[id][fc.symbol][j].pair = fc.positionPair;
                        credit[id][fc.symbol][j].status = fc.status;
                        credit[id][fc.symbol][j].side = fc.side;
                        break;
                    }
                }
                const now = Math.round(new Date().getTime() / 1000);
                if ((now - updateTime[id]['credit']) > UPDATE_ORDER) {
                    updateTime[id]['credit'] = now;
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
            }
        });
        userWs[id].onFundingCreditNew({ }, fc => {
            if (SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (!credit[id][fc.symbol]) {
                    credit[id][fc.symbol] = [];
                }
                credit[id][fc.symbol].push({
                    id: fc.id,
                    time: Math.round(fc.mtsOpening / 1000),
                    amount: fc.amount,
                    rate: fc.rate,
                    period: fc.period,
                    pair: fc.positionPair,
                    status: fc.status,
                    side: fc.side,
                });
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onFundingCreditClose({ }, fc => {
            if (SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (credit[id][fc.symbol]) {
                    for (let j = 0; j < credit[id][fc.symbol].length; j++) {
                        if (credit[id][fc.symbol][j].id === fc.id) {
                            credit[id][fc.symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onPositionUpdate({ }, fc => {
            const symbol = `f${fc.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!position[id][symbol]) {
                    position[id][symbol] = [];
                }
                for (let j = 0; j < position[id][symbol].length; j++) {
                    if (position[id][symbol][j].id === fc.id) {
                        //position[id][symbol][j].time = Math.round(fc.mtsCreate / 1000);
                        position[id][symbol][j].amount = fc.amount;
                        position[id][symbol][j].symbol = fc.symbol;
                        position[id][symbol][j].price = Math.round(fc.basePrice * 1000) / 1000;
                        position[id][symbol][j].lp = Math.round(fc.liquidationPrice * 1000) / 1000;
                        position[id][symbol][j].pl = fc.pl;
                        break;
                    }
                }
                const now = Math.round(new Date().getTime() / 1000);
                if ((now - updateTime[id]['position']) > UPDATE_ORDER) {
                    updateTime[id]['position'] = now;
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
            }
        });
        userWs[id].onPositionNew({ }, fc => {
            const symbol = `f${fc.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!position[id][symbol]) {
                    position[id][symbol] = [];
                }
                position[id][symbol].push({
                    id: fc.id,
                    time: Math.round(fc.mtsCreate / 1000),
                    amount: fc.amount,
                    symbol: fc.symbol,
                    price: Math.round(fc.basePrice * 1000) / 1000,
                    lp: Math.round(fc.liquidationPrice * 1000) / 1000,
                    pl: fc.pl,
                });
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onPositionClose({ }, fc => {
            const symbol = `f${fc.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (position[id][symbol]) {
                    for (let j = 0; j < position[id][symbol].length; j++) {
                        if (position[id][symbol][j].id === fc.id) {
                            position[id][symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onOrderUpdate({}, os => {
            const symbol = `f${os.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!order[id][symbol]) {
                    order[id][symbol] = [];
                }
                for (let j = 0; j < order[id][symbol].length; j++) {
                    if (order[id][symbol][j].id === os.id) {
                        order[id][symbol][j].time = Math.round(os.mtsCreate / 1000);
                        order[id][symbol][j].amount = os.amountOrig;
                        order[id][symbol][j].type = os.type;
                        order[id][symbol][j].symbol = os.symbol;
                        order[id][symbol][j].price = os.price;
                        order[id][symbol][j].trailing = os.priceTrailing;
                        order[id][symbol][j].flags = os.flags;
                        break;
                    }
                }
                const now = Math.round(new Date().getTime() / 1000);
                if ((now - updateTime[id]['order']) > UPDATE_ORDER) {
                    updateTime[id]['order'] = now;
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
            }
        });
        userWs[id].onOrderNew({}, os => {
            const symbol = `f${os.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                console.log(`${symbol} ${id} order new`);
                console.log(os);
                if (!order[id][symbol]) {
                    order[id][symbol] = [];
                }
                order[id][symbol].push({
                    id: os.id,
                    time: Math.round(os.mtsCreate / 1000),
                    amount: os.amountOrig,
                    type: os.type,
                    symbol: os.symbol,
                    price: os.price,
                    trailing: os.priceTrailing,
                    flags: os.flags,
                });
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            }
        });
        userWs[id].onOrderClose({}, os => {
            const symbol = `f${os.symbol.substr(-3)}`;
            if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                console.log(`${symbol} ${id} order close`);
                console.log(os);
                if (order[id][symbol]) {
                    for (let j = 0; j < order[id][symbol].length; j++) {
                        if (order[id][symbol][j].id === os.id) {
                            order[id][symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                const transMargin = () => setTimeout(() => {
                    console.log(margin[id]);
                    if (margin[id] && margin[id][symbol] && margin[id][symbol].avail > 1) {
                        return userRest.transfer({
                            from: 'margin',
                            to: 'funding',
                            amount: margin[id][symbol].avail.toString(),
                            currency: symbol.substr(1),
                        });
                    }
                }, 5000);
                for (let i = 0; i < curArr.length; i++) {
                    if (curArr[i].type === symbol && curArr[i].isTrade && curArr[i].interval && curArr[i].amount && curArr[i].low_point && curArr[i].loss_stop && curArr[i].pair && curArr[i].pair.length > 0) {
                        if (os.amountOrig > 0) {
                            if (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) {
                                //set oco trail priceTrailing
                                if (curArr[i].gain_stop) {
                                    const or = new Order({
                                        cid: Date.now(),
                                        type: 'LIMIT',
                                        symbol: os.symbol,
                                        amount: -os.amountOrig / 2,
                                        price: os.price * (101 + curArr[i].gain_stop) / 100,
                                        priceAuxLimit: os.price * (100 - curArr[i].loss_stop) / 100,
                                        flags: 17408,
                                    }, userRest);
                                    or.submit().then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => {
                                        const or1 = new Order({
                                            cid: Date.now(),
                                            type: 'LIMIT',
                                            symbol: os.symbol,
                                            amount: -os.amountOrig / 2,
                                            price: os.price * (101 + curArr[i].gain_stop * 2) / 100,
                                            priceAuxLimit: os.price * (100 - curArr[i].loss_stop) / 100,
                                            flags: 17408,
                                        }, userRest);
                                        return or1.submit();
                                    });
                                } else {
                                    const or = new Order({
                                        cid: Date.now(),
                                        type: 'STOP',
                                        symbol: os.symbol,
                                        amount: -os.amountOrig / 2,
                                        price: os.price * (100 - curArr[i].loss_stop) / 100,
                                        flags: 1024,
                                    }, userRest);
                                    or.submit().then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => {
                                        const or1 = new Order({
                                            cid: Date.now(),
                                            type: 'STOP',
                                            symbol: os.symbol,
                                            amount: -os.amountOrig / 2,
                                            price: os.price * (100 - curArr[i].loss_stop) / 100,
                                            flags: 17408,
                                        }, userRest);
                                        return or1.submit();
                                    });
                                }
                            } else if (os.status.includes('CANCELED')) {
                                transMargin();
                            }
                        } else if (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) {
                            cancelOrder(symbol, 0, os.amountOrig, Math.round(os.mtsCreate / 1000), os.type, false).then(() => transMargin());
                        } else if (os.status.includes('CANCELED') && os.type === 'STOP') {
                            cancelOrder(symbol, 0, os.amountOrig, Math.round(os.mtsCreate / 1000), os.type, false);
                        }
                        break;
                    }
                }
            }
        });
        userWs[id].open();
    } else if (!userWs[id].isOpen()) {
        console.log('reconnect ws');
        userWs[id].reconnect();
    }

    const initialBook = () => {
        const now = Math.round(new Date().getTime() / 1000);
        if ((now - updateTime[id]['book']) > UPDATE_BOOK) {
            updateTime[id]['book'] = now;
            console.log(updateTime[id]['book']);
            return userRest.wallets().then(wallet => {
                wallet.forEach(w => {
                    const symbol = `f${w.currency}`;
                    if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (w.type === 'funding') {
                            available[id][symbol] = {
                                avail: w.balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: w.balance,
                            }
                        } else if (w.type === 'margin') {
                            margin[id][symbol] = {
                                avail: w.balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: w.balance,
                            }
                        }
                    }
                });
            }).then(() => userRest.fundingOffers('')).then(fos => {
                let risk = RISK_MAX;
                const temp = {};
                fos.forEach(v => {
                    if (SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                        if (!temp[v.symbol]) {
                            temp[v.symbol] = [];
                        }
                        temp[v.symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            amount: v.amount,
                            rate: v.rate,
                            period: v.period,
                            status: v.status,
                            risk: risk > 0 ? risk-- : 0,
                        })
                    }
                });
                offer[id] = temp;
            }).then(() => userRest.fundingCredits('')).then(fcs => {
                const temp = {};
                fcs.forEach(v => {
                    if (SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                        if (!temp[v.symbol]) {
                            temp[v.symbol] = [];
                        }
                        temp[v.symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsOpening / 1000),
                            amount: v.amount,
                            rate: v.rate,
                            period: v.period,
                            status: v.status,
                            pair: v.positionPair,
                            side: v.side,
                        });
                    }
                });
                credit[id] = temp;
            }).then(() => userRest.activeOrders()).then(os => {
                const temp = {};
                os.forEach(v => {
                    const symbol = `f${v.symbol.substr(-3)}`;
                    if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (!temp[symbol]) {
                            temp[symbol] = [];
                        }
                        temp[symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            amount: v.amountOrig,
                            symbol: v.symbol,
                            type: v.type,
                            price: v.price,
                            trailing: v.priceTrailing,
                            flags: v.flags,
                        });
                    }
                });
                order[id] = temp;
            }).then(() => userRest.positions()).then(ps => {
                const temp = {};
                ps.forEach(v => {
                    const symbol = `f${v.symbol.substr(-3)}`;
                    if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (!temp[symbol]) {
                            temp[symbol] = [];
                        }
                        temp[symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            price: Math.round(v.basePrice * 1000) / 1000,
                            lp: Math.round(v.liquidationPrice * 1000) / 1000,
                            amount: v.amount,
                            symbol: v.symbol,
                            pl: v.pl,
                        });
                    }
                });
                position[id] = temp;
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
            });
        } else {
            console.log('no new');
            return Promise.resolve();
        }
    }

    const checkRisk = (risk, ...arr) => {
        if (risk < 1) {
            return false;
        }
        for (let j of arr) {
            for (let i of j) {
                if (risk === i.risk) {
                    return true;
                }
            }
        }
        return false;
    }

    const singleLoan = current => {
        const needNew = [];
        const needRetain = [];
        const finalNew = [];
        const needDelete = [];
        console.log(currentRate[current.type].rate);
        const MR = (current.miniRate > 0) ? current.miniRate / 100 * BITFINEX_EXP : 0;
        console.log(MR);
        const DR = [];
        const pushDR = (rate, day) => {
            if (rate > 0 && day >= 2 && day <= 30) {
                const DRT = {
                    rate: rate / 100 * BITFINEX_EXP,
                    day: day,
                    speed: (58 - day) / 56,
                };
                for (let i = DR.length; i >= 0; i--) {
                    if (i === 0 || DRT.rate < DR[i - 1].rate) {
                        DR.splice(i, 0, DRT);
                        break;
                    }
                }
            }
        }
        const getDR = rate => {
            if (DR.length === 0) {
                return false;
            }
            for (let i = 0; i < DR.length; i++) {
                if (rate >= DR[i].rate) {
                    return DR[i];
                }
            }
            return false;
        }
        pushDR(current.dynamic, 30);
        pushDR(current.dynamicRate1, current.dynamicDay1);
        pushDR(current.dynamicRate2, current.dynamicDay2);
        //const DR = (current.dynamic > 0) ? current.dynamic/36500*BITFINEX_EXP : 0;
        const extremRateCheck = () => {
            if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
                return false;
            }
            if (DR.length > 0 && currentRate[current.type].rate > DR[0].rate) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 1,
                        low: 0,
                        is_low: 0,
                        is_high: 0,
                    }
                } else {
                    extremRate[id][current.type].high++;
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : (extremRate[id][current.type].low - 1);
                    if (extremRate[id][current.type].high >= EXTREM_RATE_NUMBER) {
                        sendWs(`${id} ${current.type.substr(1)} rate too high!!!` , 0, 0, true);
                        extremRate[id][current.type].is_high = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].high = 0;
                    }
                }
            } else if (MR > 0 && currentRate[current.type].rate < MR) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 1,
                        is_low: 0,
                        is_high: 0,
                    }
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : (extremRate[id][current.type].high - 1);
                    extremRate[id][current.type].low++;
                    if (extremRate[id][current.type].low >= EXTREM_RATE_NUMBER) {
                        sendWs(`${id} ${current.type.substr(1)} rate too low!!!` , 0, 0, true);
                        extremRate[id][current.type].is_low = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].low = 0;
                    }
                }
            } else {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 0,
                        is_low: 0,
                        is_high: 0,
                    }
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : (extremRate[id][current.type].high - 1);
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : (extremRate[id][current.type].low - 1);
                }
            }
        }
        // adjust offer & history
        //keep cash
        const calKeepCash = avail => {
            let kp = avail ? (avail[current.type] ? avail[current.type].avail : 0) : 0;
            if (current.isKeep) {
                if (priceData[TBTC_SYM].dailyChange < COIN_MAX || priceData[TETH_SYM].dailyChange < COIN_MAX) {
                    const dailyChange = (priceData[TBTC_SYM].dailyChange < priceData[TETH_SYM].dailyChange) ? priceData[TBTC_SYM].dailyChange : priceData[TETH_SYM].dailyChange;
                    kp = kp * (50 - ((COIN_MAX - dailyChange) / (COIN_MAX - COIN_MAX_MAX) * 50)) / 100;
                }
            }
            if (current.keepAmountRate1 > 0 && current.keepAmountMoney1 > 0 && currentRate[current.type].rate < (current.keepAmountRate1 / 100 * BITFINEX_EXP)) {
                return kp - current.keepAmountMoney1;
            } else {
                return current.keepAmount ? kp - current.keepAmount : kp;
            }
        }
        let keep_available = calKeepCash(available[id]);
        console.log(keep_available);
        const adjustOffer = () => {
            console.log(`${id} ${current.type}`);
            if (offer[id][current.type]) {
                //console.log(offer[current.type]);
                //produce retain delete
                offer[id][current.type].forEach(v => {
                    if (v.risk === undefined) {
                        console.log('manual');
                        return false;
                    }
                    if (keep_available > 1 && v.amount < current.amountLimit) {
                        console.log(keep_available);
                        console.log(v.amount);
                        const sum = keep_available + v.amount;
                        let newAmount = 0;
                        if (sum <= (current.amountLimit * 1.2)) {
                            keep_available = 0;
                            newAmount = sum;
                        } else {
                            keep_available = sum - current.amountLimit;
                            newAmount = current.amountLimit;
                        }
                        console.log(keep_available);
                        console.log(newAmount);
                        needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id, newAmount});
                    } else if ((v.rate - currentRate[current.type].rate) > maxRange[current.type]) {
                        needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                    } else {
                        const DRT = getDR(v.rate * BITFINEX_EXP);
                        console.log(DRT);
                        const waitTime = (DRT === false) ? current.waitTime : (DRT.speed * current.waitTime);
                        if ((Math.round(new Date().getTime() / 1000) - v.time) >= (waitTime * 60)) {
                            needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                        } else {
                            needRetain.push({risk: v.risk, rate: v.rate * BITFINEX_EXP});
                        }
                    }
                });
            }
            needDelete.forEach(v => {
                let risk = v.newAmount ? v.risk : (v.risk > 1) ? (v.risk - 1) : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                needNew.push({
                    risk,
                    amount: v.newAmount ? v.newAmount : v.amount,
                    rate: (MR > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                })
            });
            //console.log('needdelete');
            //console.log(needDelete);
        }
        //produce new
        const newOffer = risk => {
            //console.log('keep available');
            //console.log(keep_available);
            if (risk > RISK_MAX) {
                risk = RISK_MAX;
            }
            const newLength = OFFER_MAX - needRetain.length - needNew.length;
            for (let i = 0; i < newLength; i++) {
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                let miniOffer = MINIMAL_OFFER;
                if (priceData[`t${current.type.substr(1)}USD`]) {
                    miniOffer = MINIMAL_OFFER / priceData[`t${current.type.substr(1)}USD`].lastPrice;
                }
                if (finalRate[current.type].length <= 0 || keep_available < miniOffer) {
                    break;
                }
                if (risk < 0) {
                    break;
                }
                let amount = current.amountLimit;
                if (keep_available <= current.amountLimit * 1.2) {
                    amount = keep_available;
                }
                needNew.push({
                    risk,
                    amount,
                    rate: (MR > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                });
                keep_available = keep_available - amount;
                //risk = risk < 1 ? 0 : risk-1;
                risk--;
            }
            //console.log('needNew');
            //console.log(needNew);
        }
        //merge new & delete
        const mergeOffer = () => {
            const checkDelete = (rate, amount) => {
                for (let i = 0; i < needDelete.length; i++) {
                    if (Math.ceil(rate / BITFINEX_MIN) === Math.ceil(needDelete[i].rate / BITFINEX_MIN) && amount === needDelete[i].amount) {
                        return i;
                    }
                }
                return -1;
            }
            needNew.forEach(v => {
                const notDelete = checkDelete(v.rate, v.amount);
                if (notDelete !== -1) {
                    for (let i = 0; i < offer[id][current.type].length; i++) {
                        if (needDelete[notDelete].id === offer[id][current.type][i].id) {
                            offer[id][current.type][i].time = Math.round(new Date().getTime() / 1000);
                            offer[id][current.type][i].risk = v.risk;
                            break;
                        }
                    }
                    needDelete.splice(notDelete, 1);
                } else {
                    finalNew.push(v);
                }
            });
            console.log('retain');
            console.log(needRetain);
            console.log('delete');
            console.log(needDelete);
            console.log('final');
            console.log(finalNew);
        }
        extremRateCheck();
        adjustOffer();
        newOffer(current.riskLimit);
        mergeOffer();
        const cancelOffer = index => (index >= needDelete.length) ? Promise.resolve() : userRest.cancelFundingOffer(needDelete[index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOffer(index + 1)));
        const submitOffer = index => {
            if (index >= finalNew.length) {
                if ((finalNew.length + needDelete.length) > 0) {
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
                return Promise.resolve();
            } else {
                const DRT = getDR(finalNew[index].rate);
                console.log(DRT);
                const fo = new FundingOffer({
                    symbol: current.type,
                    amount: finalNew[index].amount,
                    rate: finalNew[index].rate / BITFINEX_EXP,
                    period: (DRT === false) ? 2 : DRT.day,
                    type: 'LIMIT',
                }, userRest);
                console.log(finalNew[index].amount);
                console.log(keep_available);
                console.log(available[id]);
                return fo.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => {
                    let isExist = false;
                    for (let i = 0; i < offer[id][current.type].length; i++) {
                        if (fo.id === offer[id][current.type][i].id) {
                            offer[id][current.type][i].risk = finalNew[index].risk;
                            //console.log(`Offer ${offer[id][current.type][i].id} ${offer[id][current.type][i].risk}`);
                            isExist = true;
                            break;
                        }
                    }
                    if (!isExist) {
                        offer[id][current.type].push({
                            id: fo.id,
                            time: Math.round(new Date().getTime() / 1000),
                            amount: fo.amount,
                            rate: fo.rate,
                            period: fo.period,
                            risk: finalNew[index].risk,
                        });
                    }
                    return submitOffer(index + 1);
                }));
            }
        }
        return cancelOffer(0).then(() => submitOffer(0));
    }

    const singleTrade = current => {
        if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
            return Promise.resolve();
        }
        //set stop
        if (!extremRate[id][current.type].is_low || (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_low) > EXTREM_DURATION || extremRate[id][current.type].is_high > extremRate[id][current.type].is_low) {
            let is_high = false;
            if (extremRate[id][current.type].is_high && ((Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_high) <= EXTREM_DURATION)) {
                is_high = true;
            }
            console.log('is_high');
            console.log(is_high);
            const gain_stage = [];
            const getStage = os => {
                for (let i of gain_stage) {
                    if (i.amount === os.amount && (Math.abs(os.time - i.time) < 60)) {
                        return 1;
                    }
                }
                return 2;
            }
            const processing = [];
            const checkOrder = index => {
                if (!order[id][current.type] || index >= order[id][current.type].length) {
                    return Promise.resolve();
                } else {
                    if (order[id][current.type][index].amount > 0) {
                        processing.push({
                            type: 1,
                            os: order[id][current.type][index],
                        });
                        return checkOrder(index + 1);
                    } else if (order[id][current.type][index].type === 'STOP') {
                        processing.push({
                            type: 2,
                            os: order[id][current.type][index],
                        });
                        return checkOrder(index + 1);
                    } else {
                        if (order[id][current.type][index].type === 'TRAILING STOP' && is_high) {
                            processing.push({
                                type: 3,
                                os: order[id][current.type][index],
                            });
                            return checkOrder(index + 1);
                        } else {
                            return checkOrder(index + 1);
                        }
                    }
                }
            }
            const processOrder = index => {
                console.log(processing)
                if (index >= processing.length) {
                    return Promise.resolve();
                } else {
                    let last_price = processing[index].os.price * 100 / (100.01 - current.loss_stop);
                    if (SUPPORT_PRICE.indexOf(processing[index].os.symbol) !== -1) {
                        last_price = priceData[processing[index].os.symbol].lastPrice;
                    }
                    switch(processing[index].type) {
                        case 1:
                        const amount = processing[index].os.amount * processing[index].os.price / current.leverage;
                        return userRest.cancelOrder(processing[index].os.id).then(() => {
                            current.used = current.used ? current.used - amount : -amount;
                            console.log(current.used);
                            return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}}).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => processOrder(index + 1)));
                        });
                        case 2:
                        //close & new trail & new limit
                        console.log(last_price * current.loss_stop / 100);
                        console.log(last_price * current.loss_stop / 100/2);
                        const trail = last_price * current.loss_stop / 100 / (is_high ? 2 : 1);
                        console.log(trail);
                        const limit = current.gain_stop ? last_price * (101 + getStage(processing[index].os) * current.gain_stop) / 100 : 0;
                        if ((last_price - trail) < processing[index].os.price) {
                            return processOrder(index + 1);
                        } else {
                            const pre_os = {
                                amount: processing[index].os.amount,
                                time: processing[index].os.time,
                            };
                            return userRest.cancelOrder(processing[index].os.id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => {
                                const or = new Order({
                                    cid: Date.now(),
                                    type: 'TRAILING STOP',
                                    symbol: processing[index].os.symbol,
                                    amount: pre_os.amount,
                                    priceTrailing: trail,
                                    flags: 1024,
                                }, userRest);
                                return or.submit().then(() => {
                                    gain_stage.push(pre_os);
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(), 3000));
                                });
                            }).then(() => {
                                if (is_high || !current.gain_stop) {
                                    return Promise.resolve();
                                } else {
                                    const or1 = new Order({
                                        cid: Date.now(),
                                        type: 'LIMIT',
                                        symbol: processing[index].os.symbol,
                                        amount: pre_os.amount,
                                        price: limit,
                                        flags: 1024,
                                    }, userRest);
                                    return or1.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)));
                                }
                            }).then(() => processOrder(index + 1));
                        }
                        case 3:
                        //update
                        const trail2 = last_price * current.loss_stop / 200;
                        if (trail2 * 1.5 > processing[index].os.trailing || (last_price - trail2) < processing[index].os.price) {
                            return processOrder(index + 1);
                        } else {
                            return cancelOrder(current.type, 0, processing[index].os.amount, processing[index].os.time, processing[index].os.type, false).then(() => userRest.updateOrder({
                                id: processing[index].os.id,
                                price_trailing: trail2.toString(),
                            }).then(os => {
                                console.log(os);
                                return new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))
                            }).then(() => processOrder(index + 1)));
                        }
                        default:
                        return processOrder(index + 1);
                    }
                }
            }
            return checkOrder(0).then(() => processOrder(0));
        }
        const checkExpire = () => {
            if ((Math.round(new Date().getTime() / 1000) - current.last_trade) > current.interval) {
                current.used = 0;
                return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}});
            } else {
                return Promise.resolve();
            }
        }
        const getAM = () => {
            const needAmount = current.amount - current.used;
            let needTrans = needAmount;
            //check need amount
            if (margin[id] && margin[id][current.type]) {
                needTrans = needTrans - margin[id][current.type].avail;
            }
            let availableMargin = 0;
            if (needTrans > 1) {
                if (available[id] && available[id][current.type] && available[id][current.type].avail > 0) {
                    availableMargin = available[id][current.type].avail;
                }
                if (availableMargin >= needTrans) {
                    availableMargin = needTrans;
                } else {
                    //close offer
                    if (offer[id] && offer[id][current.type]) {
                        const cancelOffer = index => {
                            if ((index >= offer[id][current.type].length) || availableMargin >= needTrans) {
                                return Promise.resolve(availableMargin);
                            } else {
                                if (offer[id][current.type][index].risk === undefined) {
                                    return cancelOffer(index + 1);
                                }
                                availableMargin = availableMargin + offer[id][current.type][index].amount;
                                if (availableMargin >= needTrans) {
                                    availableMargin = needTrans;
                                }
                                return userRest.cancelFundingOffer(offer[id][current.type][index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOffer(index + 1)));
                            }
                        }
                        return cancelOffer(0);
                    }
                }
            }
            return Promise.resolve([availableMargin, needAmount]);
        }
        return checkExpire().then(() => getAM()).then(([availableMargin, needAmount]) => {
            console.log(needAmount);
            console.log(availableMargin);
            console.log(available);
            //transform wallet
            if (availableMargin < 1) {
                return Promise.resolve(needAmount);
            } else {
                return userRest.transfer({
                    from: 'funding',
                    to: 'margin',
                    amount: availableMargin.toString(),
                    currency: current.type.substr(1),
                }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(needAmount), 3000)));
            }
        }).then(needAmount => {
            if (!margin[id][current.type] || margin[id][current.type].avail < 1) {
                return Promise.resolve();
            }
            console.log(margin[id][current.type].avail);
            //order
            const marginOrderAmount = (margin[id][current.type].avail > needAmount) ? needAmount : margin[id][current.type].avail;
            if (marginOrderAmount >= 10) {
                const getLowpoint = (index = 0, final_low_point = 0, final_last_price = 1, symbol = '') => {
                    if (index >= current.pair.length) {
                        return Promise.resolve([final_low_point, symbol]);
                    } else {
                        if (SUPPORT_PAIR[current.type] && SUPPORT_PAIR[current.type].indexOf(current.pair[index]) !== -1) {
                            return userRest.candles({symbol: current.pair[index], timeframe: '30m', query: {limit: 120}}).then(entries => {
                                let low_point = 0;
                                const range = (entries.length > (current.low_point / 30)) ? (current.low_point / 30) : entries.length;
                                for (let i = 0; i < range; i++) {
                                    if (!low_point || entries[i].low < low_point) {
                                        low_point = entries[i].low;
                                    }
                                }
                                let last_price = 1;
                                if (SUPPORT_PRICE.indexOf(current.pair[index]) !== -1) {
                                    last_price = priceData[current.pair[index]].lastPrice;
                                }
                                low_point = (low_point * 1.005 < last_price) ? low_point * 1.005 : last_price;
                                console.log(low_point);
                                console.log(last_price);
                                return (final_low_point === 0 || (final_last_price / final_low_point > last_price / low_point)) ? getLowpoint(index + 1, low_point, last_price, current.pair[index]) : getLowpoint(index + 1, final_low_point, final_last_price, symbol);
                            });
                        } else {
                            return getLowpoint(index + 1, final_low_point, final_last_price, symbol);
                        }
                    }
                }
                return getLowpoint(0).then(([low_point, symbol]) => {
                    console.log(low_point);
                    if (low_point <= 0) {
                        return Promise.resolve();
                    }
                    const orderAmount = current.leverage ? (marginOrderAmount * current.leverage * 0.985) / low_point : (marginOrderAmount * 0.985) / low_point
                    console.log(orderAmount);
                    const or = new Order({
                        cid: Date.now(),
                        type: 'LIMIT',
                        symbol,
                        amount: orderAmount,
                        price: low_point,
                        flags: 0,
                        lev: current.leverage ? current.leverage : 1,
                    }, userRest);
                    return or.submit().then(() => {
                        current.used = current.used? current.used + marginOrderAmount : marginOrderAmount;
                        current.last_trade = Math.round(new Date().getTime() / 1000);
                        return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used, "bitfinex.$.last_trade": current.last_trade}}).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)));
                    });
                });
            }
        });
    }
    const getLegder = current => {
        if (ledger[id][current.type] && ledger[id][current.type].length > 0) {
            const now = new Date();
            now.setHours(0);
            now.setMinutes(0);
            now.setSeconds(0);
            if ((ledger[id][current.type][0].time * 1000) >= now.getTime()) {
                return Promise.resolve();
            } else {
                now.setHours(9);
                now.setMinutes(30);
                if (new Date().getTime() < now.getTime()) {
                    return Promise.resolve();
                }
            }
        }
        return userRest.ledgers({ccy: current.type.substr(1), category: 28}).then(entries => {
            console.log(`${current.type} ledger`);
            ledger[id][current.type] = entries.map(e => ({
                id: e.id,
                time: Math.round(e.mts / 1000),
                amount: Math.round(e.amount * 100) / 100,
                rate: e.amount / e.balance,
                type: 0,
            }));
        }).then(() => userRest.ledgers({ccy: current.type.substr(1), category: 51}).then(entries => {
            let previous = null;
            let pamount = 0;
            let pbalance = 0;
            entries.forEach(e => {
                if (e.wallet === 'funding') {
                    if (!previous) {
                        previous = {
                            id: e.id,
                            time: Math.round(e.mts / 1000),
                            amount: e.amount,
                            type: 1,
                        }
                        pamount = e.amount;
                        pbalance = e.balance;
                    } else if (pamount < 0 && e.amount > 0) {
                        previous.rate = previous.amount / pbalance;
                        previous.amount = Math.round(previous.amount * 100) / 100;
                        ledger[id][current.type].push(previous);
                        previous = {
                            id: e.id,
                            time: Math.round(e.mts / 1000),
                            amount: e.amount,
                            type: 1,
                        }
                        pamount = e.amount;
                        pbalance = e.balance;
                    } else {
                        previous = {
                            id: e.id,
                            time: Math.round(e.mts / 1000),
                            amount: previous.amount + e.amount,
                            type: 1,
                        }
                        pamount = e.amount;
                        pbalance = e.balance;
                    }
                }
            });
            if (previous) {
                previous.rate = previous.amount / pbalance;
                previous.amount = Math.round(previous.amount * 100) / 100;
                ledger[id][current.type].push(previous);
            }
            sendWs({
                type: 'bitfinex',
                data: -1,
                user: id,
            });
        }));
    }
    const recurLoan = index => (index >= curArr.length) ? Promise.resolve() : (curArr[index] && SUPPORT_COIN.indexOf(curArr[index].type) !== -1) ? getLegder(curArr[index]).then(() => singleLoan(curArr[index]).then(() => singleTrade(curArr[index]).then(() => recurLoan(index + 1)))) : recurLoan(index + 1);
    return initialBook().then(() => recurLoan(0));
}

export const resetBFX = (update=false) => {
    console.log('BFX reset');
    const closeWs = index => {
        if (index >= Object.keys(userWs).length) {
            userWs = {};
            userOk = {};
            return Promise.resolve();
        } else {
            userWs[Object.keys(userWs)[index]].close();
            return closeWs(index + 1);
        }
    }
    if (update) {
        for (let i in updateTime) {
            updateTime[i] = {};
            updateTime[i]['book'] = 0;
            updateTime[i]['offer'] = 0;
            updateTime[i]['credit'] = 0;
            updateTime[i]['position'] = 0;
            updateTime[i]['order'] = 0;
        }
    } else {
        return closeWs(0);
    }
}

export default {
    getBot: function(id) {
        return Mongo('find', USERDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('User does not exist!!!'));
            }
            return returnSupport(items[0].bitfinex);
        });
    },
    updateBot: function(id, set) {
        let isSupport = false;
        for (let i of SUPPORT_COIN) {
            if (set.type === i) {
                isSupport = true;
                break;
            }
        }
        if (!isSupport) {
            return handleError(new HoError(`${set.type} is not support!!!`));
        }
        const data = {};
        if (set.key) {
            const key = isValidString(set.key, 'name');
            if (!key) {
                return handleError(new HoError('API Key is not valid'));
            }
            data['key'] = key;
        }
        if (set.secret) {
            const secret = isValidString(set.secret, 'name');
            if (!secret) {
                return handleError(new HoError('API Secret is not valid'));
            }
            data['secret'] = secret;
        }
        if (set.amountLimit) {
            const amountLimit = isValidString(set.amountLimit, 'int');
            if (!amountLimit) {
                return handleError(new HoError('Amount Limit is not valid'));
            }
            //data['amountLimit'] = amountLimit > MINIMAL_OFFER ? amountLimit : MINIMAL_OFFER;
        }
        if (set.riskLimit) {
            const riskLimit = isValidString(set.riskLimit, 'int')
            if (!riskLimit) {
                return handleError(new HoError('Risk is not valid'));
            }
            data['riskLimit'] = (riskLimit > 10) ? 10 : (riskLimit < 1) ? 1 : parseInt(riskLimit);
        }
        if (set.waitTime) {
            const waitTime = isValidString(set.waitTime, 'int');
            if (!waitTime) {
                return handleError(new HoError('Time Intervel is not valid'));
            }
            data['waitTime'] = waitTime;
        }
        if (set.miniRate) {
            const miniRate = isValidString(set.miniRate, 'zeroint');
            if (miniRate === false) {
                return handleError(new HoError('Mini Rate is not valid'));
            }
            data['miniRate'] = miniRate;
        }
        if (set.dynamic) {
            const dynamic = isValidString(set.dynamic, 'zeroint');
            if (dynamic === false) {
                return handleError(new HoError('Dynamic Rate is not valid'));
            }
            data['dynamic'] = dynamic;
        }
        if (set.keepAmount) {
            const keepAmount = isValidString(set.keepAmount, 'zeroint');
            if (keepAmount === false) {
                return handleError(new HoError('Keep Amount is not valid'));
            }
            data['keepAmount'] = keepAmount;
        }
        if (set.hasOwnProperty('keep')) {
            data['isKeep'] = set.keep;
        }
        if (set.hasOwnProperty('active')) {
            data['isActive'] = set.active;
        }
        if (set.keepAmountRate1) {
            const keepAmountRate1 = isValidString(set.keepAmountRate1, 'zeroint');
            if (keepAmountRate1 === false) {
                return handleError(new HoError('Keep Amount 1 is not valid'));
            }
            if (keepAmountRate1 > 0 && set.keepAmountMoney1) {
                const keepAmountMoney1 = isValidString(set.keepAmountMoney1, 'zeroint');
                if (keepAmountMoney1 === false) {
                    return handleError(new HoError('Keep Amount 1 is not valid'));
                }
                data['keepAmountRate1'] = keepAmountRate1;
                data['keepAmountMoney1'] = keepAmountMoney1;
            }
        }
        if (set.dynamicRate1) {
            const dynamicRate1 = isValidString(set.dynamicRate1, 'zeroint');
            if (dynamicRate1 === false) {
                return handleError(new HoError('Dynamic Rate 1 is not valid'));
            }
            if (dynamicRate1 > 0 && set.dynamicDay1) {
                const dynamicDay1 = isValidString(set.dynamicDay1, 'zeroint');
                if (dynamicDay1 === false || dynamicDay1 < 2 || dynamicDay1 > 30) {
                    return handleError(new HoError('Dynamic Rate 1 is not valid'));
                }
                data['dynamicRate1'] = dynamicRate1;
                data['dynamicDay1'] = Math.floor(dynamicDay1);
            }
        }
        if (set.dynamicRate2) {
            const dynamicRate2 = isValidString(set.dynamicRate2, 'zeroint');
            if (dynamicRate2 === false) {
                return handleError(new HoError('Dynamic Rate 2 is not valid'));
            }
            if (dynamicRate2 > 0 && set.dynamicDay2) {
                const dynamicDay2 = isValidString(set.dynamicDay2, 'zeroint');
                if (dynamicDay2 === false || dynamicDay2 < 2 || dynamicDay2 > 30) {
                    return handleError(new HoError('Dynamic Rate 2 is not valid'));
                }
                data['dynamicRate2'] = dynamicRate2;
                data['dynamicDay2'] = Math.floor(dynamicDay2);
            }
        }
        if (SUPPORT_PAIR[set.type]) {
            if (set.hasOwnProperty('trade')) {
                data['isTrade'] = set.trade;
            }
            if (set.low_point) {
                const low_point = isValidString(set.low_point, 'int');
                if (low_point === false) {
                    return handleError(new HoError('Low Point is not valid'));
                }
                data['low_point'] = low_point;
            }
            if (set.amount) {
                const amount = isValidString(set.amount, 'int');
                if (amount === false) {
                    return handleError(new HoError('Trade Amount is not valid'));
                }
                data['amount'] = amount;
            }
            if (set.interval) {
                const interval = isValidString(set.interval, 'int');
                if (interval === false) {
                    return handleError(new HoError('Trade Interval is not valid'));
                }
                data['interval'] = interval;
            }
            if (set.loss_stop) {
                const loss_stop = isValidString(set.loss_stop, 'int');
                if (loss_stop === false) {
                    return handleError(new HoError('Loss Stop is not valid'));
                }
                data['loss_stop'] = loss_stop;
            }
            if (set.gain_stop) {
                const gain_stop = isValidString(set.gain_stop, 'zeroint');
                if (gain_stop === false) {
                    return handleError(new HoError('Gain Stop is not valid'));
                }
                data['gain_stop'] = gain_stop;
            }
            if (set.leverage) {
                const leverage = isValidString(set.leverage, 'zeroint');
                if (leverage === false) {
                    return handleError(new HoError('Leverage is not valid'));
                }
                data['leverage'] = leverage;
            }
            if (set.pair) {
                const pair = isValidString(set.pair, 'name');
                if (pair === false) {
                    return handleError(new HoError('Trade Pair is not valid'));
                }
                const pairArr = [];
                pair.split(',').forEach(v => {
                    const p = v.trim();
                    if (SUPPORT_PAIR[set.type].indexOf(p) !== -1) {
                        pairArr.push(p);
                    }
                });
                if (pairArr.length > 0) {
                    data['pair'] = pairArr;
                }
            }
        }
        data['type'] = set.type;
        return Mongo('find', USERDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('User does not exist!!!'));
            }
            let bitfinex = [];
            if (!items[0].bitfinex) {
                bitfinex = [data];
            } else {
                let isExist = false;
                for (let i = 0; i < items[0].bitfinex.length; i++) {
                    if (items[0].bitfinex[i].type === data.type) {
                        items[0].bitfinex[i] = Object.assign({}, items[0].bitfinex[i], data);
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    items[0].bitfinex.push(data);
                }
                bitfinex = items[0].bitfinex;
            }
            return Mongo('update', USERDB, {_id: id}, {$set: {bitfinex}}).then(user => {
                console.log(user);
                return returnSupport(bitfinex);
            });
        });
    },
    deleteBot: function(id, type) {
        return Mongo('find', USERDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('User does not exist!!!'));
            }
            if (items[0].bitfinex) {
                const bitfinex = items[0].bitfinex.filter(v => (v.type === type) ? false : true);
                //console.log(bitfinex);
                return Mongo('update', USERDB, {_id: id}, {$set: {bitfinex}}).then(user => {
                    console.log(user);
                    return returnSupport(bitfinex);
                });
            } else {
                return returnSupport();
            }
        });
    },
    query: function(page, name, sortName, sortType, user, session, uid=-1) {
        const id = user.username;
        if (name) {
            name = isValidString(name, 'name');
            if (!name) {
                return handleError(new HoError('tag name is not valid'));
            }
        }
        page = isValidString(page, 'zeroint');
        if (page === false) {
            return handleError(new HoError('page is not valid'));
        }
        const itemList = [];
        const rateList = [];
        if (!session['bitfinex']) {
            session['bitfinex'] = 'all';
        }
        if (name) {
            session['bitfinex'] = name;
        }
        let type = 0;
        let coin = 'all';
        const sess = session['bitfinex'];
        switch(sess) {
            case 'usd':
            case 'USD':
            coin = FUSD_SYM;
            break;
            case 'ust':
            case 'UST':
            coin = FUSDT_SYM;
            break;
            case 'eth':
            case 'ETH':
            coin = FETH_SYM;
            break;
            case 'btc':
            case 'BTC':
            coin = FBTC_SYM;
            break;
            case 'omg':
            case 'OMG':
            coin = FOMG_SYM;
            break;
            case 'wallet':
            case '錢包':
            type = 1;
            break;
            case 'rate':
            case '利率':
            type = 2;
            break;
            case 'offer':
            case '掛單':
            type = 3;
            break;
            case 'credit':
            case '放款':
            type = 4;
            break;
            case 'payment':
            case '利息收入':
            type = 5;
            break;
        }
        if (type === 0 || type === 1) {
            for (let i = 0; i < SUPPORT_COIN.length; i++) {
                const v = SUPPORT_COIN[i];
                if (coin !== 'all' && coin !== v) {
                    continue;
                }
                if (available[id] && available[id][v]) {
                    if (uid === (i+1) * 10000) {
                        return {
                            item: [
                                {
                                    name: `閒置 ${v.substr(1)} $${Math.round(available[id][v].avail * 100) / 100}`,
                                    id: (i+1) * 10000,
                                    tags: [v.substr(1).toLowerCase(), 'wallet', '錢包'],
                                    rate: `$${Math.round(available[id][v].total * 100) / 100}`,
                                    count: available[id][v].total,
                                    utime: available[id][v].time,
                                    type: 0,
                                }
                            ],
                        };
                    } else {
                        itemList.push({
                            name: `閒置 ${v.substr(1)} $${Math.round(available[id][v].avail * 100) / 100}`,
                            id: (i+1) * 10000,
                            tags: [v.substr(1).toLowerCase(), 'wallet', '錢包'],
                            rate: `$${Math.round(available[id][v].total * 100) / 100}`,
                            count: available[id][v].total,
                            utime: available[id][v].time,
                            type: 0,
                        })
                    }
                }
            }
        }
        if (type === 0 || type === 2) {
            const tempList = (uid === 0) ? rateList : itemList;
            for (let i = 0; i < SUPPORT_COIN.length; i++) {
                const v = SUPPORT_COIN[i];
                if (coin !== 'all' && coin !== v) {
                    continue;
                }
                if (currentRate[v]) {
                    const rate = Math.round(currentRate[v].rate / 10) / 100000;
                    tempList.push({
                        name: `${v.substr(1)} Rate`,
                        id: i,
                        tags: [v.substr(1).toLowerCase(), 'rate', '利率'],
                        rate: `${rate}%`,
                        count: rate,
                        utime: currentRate[v].time,
                        type: 1,
                    });
                }
            }
            let vid = SUPPORT_COIN.length;
            for (let i in priceData) {
                tempList.push({
                    name: `${i.substr(1)} $${Math.floor(priceData[i].lastPrice * 100) / 100}`,
                    id: vid++,
                    tags: [i.substr(1, 4), i.substr(-3), 'rate', '利率'],
                    rate: `${Math.floor(priceData[i].dailyChange * 10000) / 10000}%`,
                    count: priceData[i].dilyChange,
                    utime: priceData[i].time,
                    type: 1,
                })
            }
        }
        if (uid === 0) {
            return {item: rateList};
        } else if (uid > 0) {
            return {empty: true};
        }
        if (type === 0 || type === 3) {
            SUPPORT_COIN.forEach((v, i) => {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (order[id] && order[id][v]) {
                    order[id][v].forEach(o => {
                        itemList.push({
                            name: `交易掛單 ${o.symbol.substr(1)} ${Math.floor(o.amount * 10000) / 10000}枚 ${o.type}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'order', '交易掛單'],
                            rate: `$${o.price}`,
                            count: o.price,
                            utime: o.time,
                            boost: (o.amount < 0) ? true : false,
                            type: 2,
                        })
                    })
                }
                if (offer[id] && offer[id][v]) {
                    offer[id][v].forEach(o => {
                        const rate = Math.round(o.rate * 10000000) / 100000;
                        const risk = o.risk === undefined ? '手動' : `risk ${o.risk}`;
                        itemList.push({
                            name: `掛單 ${v.substr(1)} $${Math.floor(o.amount * 100) / 100} ${o.period}天期 ${risk}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'offer', '掛單'],
                            rate: `${rate}%`,
                            boost: (o.period === 30) ? true : false,
                            count: rate,
                            utime: o.time,
                            type: 2,
                        })
                    })
                }
            });
        }
        if (type === 0 || type === 4) {
            SUPPORT_COIN.forEach((v, i) => {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (position[id] && position[id][v]) {
                    position[id][v].forEach(o => {
                        console.log(o);
                        const rate = Math.round(o.pl * 1000) / 1000;
                        itemList.push({
                            name: `部位 ${o.symbol.substr(1)} ${Math.floor(o.amount * 10000) / 10000}枚 ${o.price} / ${o.lp}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'position', '部位'],
                            rate: `$${rate}`,
                            count: rate,
                            utime: o.time,
                            type: 3,
                            boost: (o.pl < 0) ? true : false,
                        })
                    })
                }
                if (credit[id] && credit[id][v]) {
                    credit[id][v].forEach(o => {
                        const rate = Math.round(o.rate * 10000000) / 100000;
                        itemList.push({
                            name: `${(o.side === 1) ? '放款' : '借款'} ${v.substr(1)} $${Math.floor(o.amount * 100) / 100} ${o.period}天期 ${o.pair}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'credit', '放款'],
                            rate: `${rate}%`,
                            count: rate,
                            boost: (o.period === 30) ? true : false,
                            utime: o.time + o.period * 86400,
                            type: 3,
                        })
                    })
                }
            });
        }
        if (type === 0 || type === 5) {
            SUPPORT_COIN.forEach((v, i) => {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (ledger[id] && ledger[id][v]) {
                    ledger[id][v].forEach(o => {
                        switch (o.type) {
                            case 0:
                            const rate = Math.round(o.rate * 10000000) / 100000;
                            itemList.push({
                                name: `利息收入 ${v.substr(1)} $${o.amount}`,
                                id: o.id,
                                tags: [v.substr(1).toLowerCase(), 'payment', '利息收入'],
                                rate: `${rate}%`,
                                count: rate,
                                utime: o.time,
                                type: 4,
                            })
                            break;
                            case 1:
                            const rate1 = Math.round(o.rate * 10000000) / 100000;
                            itemList.push({
                                name: `交易收入 ${v.substr(1)} $${o.amount}`,
                                id: o.id,
                                tags: [v.substr(1).toLowerCase(), 'profit', '交易收入'],
                                rate: `${rate1}%`,
                                count: rate1,
                                utime: o.time,
                                type: 4,
                                boost: (o.rate < 0) ? true : false,
                            })
                            break;
                        }
                    })
                }
            });
        }
        if (sortName === 'name' && sortType === 'desc') {
            itemList.reverse();
        } else if (sortName === 'mtime' && sortType === 'asc') {
            itemList.sort((a, b) => (a.count - b.count));
        } else if (sortName === 'mtime' && sortType === 'desc') {
            itemList.sort((a, b) => (b.count - a.count));
        } else if (sortName === 'count' && sortType === 'asc') {
            itemList.sort((a, b) => (a.utime - b.utime));
        } else if (sortName === 'count' && sortType === 'desc') {
            itemList.sort((a, b) => (b.utime - a.utime));
        }
        return {
            itemList,
            parentList: {
                cur: [],
                his: [],
                exactly: [],
                bookmark: '',
            },
        }
    },
    parent: function() {
        return BITNIFEX_PARENT;
    }
}

const returnSupport = bitfinex => bitfinex ? SUPPORT_COIN.map(v => {
    for (let i of bitfinex) {
        if (i.type === v) {
            if (i.pair) {
                i.pair = i.pair.toString();
            }
            if (SUPPORT_PAIR[v]) {
                i.tradable = true;
            }
            return i;
        }
    }
    return {type: v};
}) : SUPPORT_COIN.map(v => ({type: v}));
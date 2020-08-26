import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver'
import { TBTC_SYM, TETH_SYM, BITFINEX_EXP, BITFINEX_MIN, DISTRIBUTION, OFFER_MAX, COIN_MAX, COIN_MAX_MAX, RISK_MAX, SUPPORT_COIN, USERDB, BITNIFEX_PARENT, FUSD_SYM, FUSDT_SYM, FETH_SYM, FBTC_SYM, FOMG_SYM, EXTREM_RATE_NUMBER, EXTREM_DURATION, UPDATE_BOOK, UPDATE_ORDER, SUPPORT_PAIR, MINIMAL_OFFER, SUPPORT_PRICE, MAX_RATE, TOMG_SYM, BITFINEX_FEE, BITFINEX_INTERVAL, RANGE_BITFINEX_INTERVAL, TOTALDB, ORDER_INTERVAL, SUPPORT_LEVERAGE } from '../constants'
import BFX from 'bitfinex-api-node'
import { FundingOffer, Order } from 'bfx-api-node-models'
import { calStair, stockProcess, stockTest, logArray } from '../models/stock-tool'
import Mongo from '../models/mongo-tool'
import Redis from '../models/redis-tool'
import { handleError, HoError, isValidString } from '../util/utility'
import sendWs from '../util/sendWs'

//system
const bfx = new BFX({ apiKey: BITFINEX_KEY, apiSecret: BITFINEX_SECRET });
const rest = bfx.rest(2, { transform: true });
let finalRate = {};
let maxRange = {};
let currentRate = {};
let priceData = {};
let order_count = 0;

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
                return Redis('hgetall', `bitfinex: ${SUPPORT_PRICE[index]}`).then(item => {
                    priceData[SUPPORT_PRICE[index]] = {
                        dailyChange: ticker.dailyChangePerc * 100,
                        lastPrice: ticker.lastPrice,
                        time: Math.round(new Date().getTime() / 1000),
                        str: item ? item.str : '',
                    }
                    return recurPrice(index + 1);
                });
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
            finalRate[curType] = finalRate[curType].map(v => (v >= MAX_RATE) ? MAX_RATE - 1 : v);
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

export const calWeb = curArr => {
    const recurType = index => (index >= curArr.length) ? Promise.resolve() : (SUPPORT_PAIR[FUSD_SYM].indexOf(curArr[index]) !== -1) ? singleCal(curArr[index], index).then(() => recurType(index + 1)) : recurType(index + 1);
    const singleCal = (curType, index) => rest.candles({symbol: curType, timeframe: '1h', query: {limit: 3600}}).then(entries => {
        let max = 0;
        let min = 0;
        let min_vol = 0;
        const raw_arr = entries.map(v => {
            if (!max || max < v.high) {
                max = v.high;
            }
            if (!min || min > v.low) {
                min = v.low;
            }
            if (!min_vol || min_vol > v.volume) {
                min_vol = v.volume;
            }
            return {
                h: v.high,
                l: v.low,
                v: v.volume,
            }
        });
        console.log(max);
        console.log(min);
        console.log(min_vol);
        const loga = logArray(max, min);
        const web = calStair(raw_arr, loga, min, 0, BITFINEX_FEE, 240 * 3);
        console.log(web);
        const month = [];
        const ret_str1 = [];
        let ret_str = '';
        let best_rate = 0;
        let lastest_type = 0;
        let lastest_rate = 0;
        const resultShow = type => {
            let str = '';
            const testResult = [];
            const match = [];
            //let j = Math.floor((raw_arr.length - 1) / 2);
            let j = raw_arr.length - (240 * 3);
            //console.log('start');
            while (j > 239) {
                //console.log(j);
                const temp = stockTest(raw_arr, loga, min, type, j, false, 240, RANGE_BITFINEX_INTERVAL, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, 24, 1);
                const tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                    testResult.push(temp);
                    match.push(tempM);
                }
                j = temp.start + 1;
            }
            if (testResult.length > 0) {
                testResult.forEach((v, i) => {
                    if (!month[i]) {
                        month[i] = [];
                    }
                    month[i].push(v);
                });
                let rate = 1;
                let real = 1;
                let count = 0;
                let times = 0;
                let stoploss = 0;
                let maxloss = 0;
                match.forEach((v, i) => {
                    rate = rate * (Number(v[3]) + 100) / 100;
                    /*if ((i === match.length - 1) && (!lastest_rate || Number(v[3]) > lastest_rate)) {
                        lastest_rate = Number(v[3]);
                        lastest_type = type;
                    }*/
                    real = real * (Number(v[4]) + 100) / 100;
                    count++;
                    times += Number(v[5]);
                    stoploss += Number(v[6]);
                    if (!maxloss || maxloss > +v[7]) {
                        maxloss = +v[7];
                    }
                });
                str = `${Math.round((+priceData[curType].lastPrice - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}`;
                rate = Math.round(rate * 10000 - 10000) / 100;
                real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                times = Math.round(times / count * 100) / 100;
                str += ` ${rate}% ${real}% ${times} ${stoploss} ${maxloss}% ${raw_arr.length} ${min_vol}`;
                if (!best_rate || rate > best_rate) {
                    best_rate = rate;
                    ret_str = str;
                }
                const temp = stockTest(raw_arr, loga, min, type, j, true, 240, RANGE_BITFINEX_INTERVAL, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, 24, 1);
                if (temp === 'data miss') {
                    return true;
                }
                const tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                    if (!lastest_rate || Number(tempM[3]) > lastest_rate) {
                        lastest_rate = Number(tempM[3]);
                        lastest_type = type;
                    }
                }
            } else {
                str = 'no less than mid point';
            }
            ret_str1.push(str);
        }
        for (let i = 15; i >= 0; i--) {
            resultShow(i);
        }
        month.forEach((v, i) => {
            console.log('month' + (+i + 1));
            v.forEach(k => console.log(k.str));
        });
        ret_str1.forEach(v => console.log(v));
        if (!ret_str) {
            ret_str = 'no less than mid point';
        }
        console.log(lastest_type);
        console.log('done');
        Redis('hmset', `bitfinex: ${curArr[index]}`, {
            str: ret_str,
        }).catch(err => handleError(err, 'Redis'));
        const updateWeb = () => Mongo('find', TOTALDB, {index: curArr[index]}).then(item => {
            console.log(item);
            if (item.length < 1) {
                return Mongo('insert', TOTALDB, {
                    sType: 1,
                    index: curArr[index],
                    name: curArr[index].substr(1),
                    type: FUSD_SYM,
                    web: web.arr,
                    wType: lastest_type,
                    mid: web.mid,
                }).then(items => console.log(items));
            } else {
                const recur_update = i => {
                    if (i >= item.length) {
                        return Promise.resolve();
                    } else {
                        if (!item[i].owner) {
                            return Mongo('update', TOTALDB, {_id: item[i]._id}, {$set: {
                                web: web.arr,
                                wType: lastest_type,
                                mid: web.mid,
                            }}).then(items => {
                                console.log(items);
                                return recur_update(i + 1);
                            });
                        } else {
                            const maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                            return Mongo('update', TOTALDB, {_id: item[i]._id}, {$set: {
                                web: web.arr,
                                wType: lastest_type,
                                mid: web.mid,
                                times: Math.floor(item[i].orig / maxAmount * 10000) / 10000,
                            }}).then(items => {
                                console.log(items);
                                return recur_update(i + 1);
                            });
                        }
                    }
                }
                return recur_update(0);
            }
        });
        return updateWeb();
    });
    //return recurPrice(0).then(() => recurType(0));
    return recurType(0);
}

export const setWsOffer = (id, curArr=[], uid) => {
    //檢查跟設定active
    curArr = curArr.filter(v => (v.isActive && ((v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0) || (v.isTrade && v.amount >= 0 && v.pair))) ? true : false);
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
                        sendWs({
                            type: 'bitfinex',
                            data: (i+1) * 100,
                            user: id,
                        });
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
                for (let i = 0; i < curArr.length; i++) {
                    if (curArr[i].type === symbol && curArr[i].isTrade && curArr[i].amount >= 0 && curArr[i].pair) {
                        for (let j = 0; j < curArr[i].pair.length; j++) {
                            if (curArr[i].pair.type === os.symbol) {
                                if (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) {
                                    const amount = os.priceAvg * (os.amountOrig - os.amount);
                                    return Mongo('update', TOTALDB, {owner: uid, sType: 1, type: curArr[i].type}, {$inc: {amount: -os.priceAvg * (os.amountOrig - os.amount)}}).catch(err => {
                                        sendWs(`${id} Total Updata Error: ${err.message||err.msg}`, 0, 0, true);
                                        handleError(err, `${id} Total Updata Error`);
                                    });
                                }
                                break;
                            }
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
        if (current.riskLimit > 0 && current.waitTime > 0 && current.amountLimit > 0) {
        } else {
            return Promise.resolve();
        }
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
            /*if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
                return false;
            }*/
            if (current.isTrade && current.amount >= 0 && current.pair) {
            } else {
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
            /*if (current.isKeep) {
                if (priceData[TBTC_SYM].dailyChange < COIN_MAX || priceData[TETH_SYM].dailyChange < COIN_MAX) {
                    const dailyChange = (priceData[TBTC_SYM].dailyChange < priceData[TETH_SYM].dailyChange) ? priceData[TBTC_SYM].dailyChange : priceData[TETH_SYM].dailyChange;
                    kp = kp * (50 - ((COIN_MAX - dailyChange) / (COIN_MAX - COIN_MAX_MAX) * 50)) / 100;
                }
            }*/
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
                const orig_risk = v.risk;
                let risk = v.newAmount ? v.risk : (v.risk > 1) ? (v.risk - 1) : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                if (current.isDiff && risk < 1) {
                    risk = orig_risk;
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
                const orig_risk = risk;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                if (current.isDiff && risk < 1) {
                    risk = orig_risk;
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
        //return Promise.resolve();
    }

    const singleTrade = current => {
        console.log('singleTrade');
        if (current.isTrade && current.amount >= 0 && current.pair) {
        } else {
            return Promise.resolve();
        }
        if (extremRate[id][current.type].is_low && (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_low) <= EXTREM_DURATION && extremRate[id][current.type].is_high < extremRate[id][current.type].is_low) {
            console.log('is low');
            current.amount = current.amount - current.amount * current.rate_ratio;
        } else if (extremRate[id][current.type].is_high && (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_high) <= EXTREM_DURATION && extremRate[id][current.type].is_high > extremRate[id][current.type].is_low) {
            console.log('is high');
            current.amount = current.amount + current.amount * current.rate_ratio;
        }
        //add rate big small
        const getAM = () => {
            console.log(current);
            const needTrans = (current.used > 0) ? current.amount - current.used : current.amount;
            //let needTrans = needAmount;
            //check need amount
            /*if (needTrans > 0) {
                if (margin[id][current.type]) {
                    needTrans = needTrans - margin[id][current.type].avail;
                }
            }*/
            let availableMargin = 0;
            if (needTrans > 1 && current.clear !== true) {
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
            } else if (needTrans < -1 || current.clear === true) {
                if (margin[id] && margin[id][current.type] && margin[id][current.type].avail > 0) {
                    availableMargin = -margin[id][current.type].avail;
                }
                if (availableMargin <= needTrans && current.clear !== true) {
                    availableMargin = needTrans;
                } else {
                    //close order
                    if (order[id] && order[id][current.type]) {
                        const cancelOrder = index => {
                            if ((index >= order[id][current.type].length) || (availableMargin <= needTrans && current.clear !== true)) {
                                return Promise.resolve(availableMargin);
                            }
                            if (order[id][current.type][index].amount < 0) {
                                return cancelOrder(index + 1);
                            }
                            availableMargin = availableMargin - order[id][current.type][index].amount * order[id][current.type][index].price;
                            if (availableMargin <= needTrans && current.clear !== true) {
                                availableMargin = needTrans;
                            }
                            return userRest.cancelOrder(order[id][current.type][index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOrder(index + 1)));
                        }
                        return cancelOrder(0);
                    }
                }
            }
            return Promise.resolve(availableMargin);
        }
        return getAM().then(availableMargin => {
            console.log(availableMargin);
            console.log(available[id]);
            console.log(margin[id]);
            //transform wallet
            if (availableMargin < 1 && availableMargin > -1) {
                return Promise.resolve();
            } else if (availableMargin >= 1) {
                return userRest.transfer({
                    from: 'funding',
                    to: 'margin',
                    amount: availableMargin.toString(),
                    currency: current.type.substr(1),
                }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => {
                    current.used = current.used > 0 ? current.used + availableMargin : availableMargin;
                    return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}});
                });
            } else {
                return userRest.transfer({
                    from: 'margin',
                    to: 'funding',
                    amount: (-availableMargin).toString(),
                    currency: current.type.substr(1),
                }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => {
                    current.used = (current.used > 0 && current.used + availableMargin > 1) ? current.used + availableMargin : 0;
                    return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}});
                });
            }
        }).then(() => {
            order_count++;
            if (order_count % ORDER_INTERVAL !== 3) {
                return Promise.resolve();
            }
            return Mongo('find', TOTALDB, {owner: uid, sType: 1, type: current.type}).then(items => {
                const reucr_status = index => {
                    if (index >= items.length) {
                        return Promise.resolve();
                    } else {
                        const item = items[index];
                        console.log(item);
                        const startStatus = () => {
                            let newArr = item.web.map(v => v * item.newMid[item.newMid.length - 1] / item.mid);
                            let checkMid = (item.newMid.length > 1) ? item.newMid[item.newMid.length - 2] : item.mid;
                            while ((item.newMid.length > 0) && ((item.newMid[item.newMid.length - 1] > checkMid && +priceData[item.index].lastPrice < checkMid) || (item.newMid[item.newMid.length - 1] <= checkMid && +priceData[item.index].lastPrice > checkMid))) {
                                item.newMid.pop();
                                if (item.newMid.length === 0 && Math.round(new Date().getTime() / 1000) - item.tmpPT.time < RANGE_BITFINEX_INTERVAL) {
                                    item.previous.price = item.tmpPT.price;
                                    item.previous.time = item.tmpPT.time;
                                    item.previous.type = item.tmpPT.type;
                                } else {
                                    item.previous.time = 0;
                                }
                                newArr = item.web.map(v => v * item.newMid[item.newMid.length - 1] / item.mid);
                                checkMid = (item.newMid.length > 1) ? item.newMid[item.newMid.length - 2] : item.mid;
                            }
                            let item_count = 0;
                            if (position[id] && position[id][FUSD_SYM]) {
                                position[id][FUSD_SYM].forEach(v => {
                                    if (v.symbol === item.index) {
                                        item_count += v.amount;
                                    }
                                });
                            }
                            let suggestion = stockProcess(+priceData[item.index].lastPrice, (item.newMid.length > 0) ? newArr : item.web, item.times, item.previous, item.amount, item_count, item.wType, 1, BITFINEX_INTERVAL, BITFINEX_INTERVAL);
                            while(suggestion.resetWeb) {
                                if (item.newMid.length === 0) {
                                    item.tmpPT = {
                                        price: item.previous.price,
                                        time: item.previous.time,
                                        type: item.previous.type,
                                    };
                                }
                                item.previous.time = 0;
                                item.newMid.push(suggestion.newMid);
                                newArr = item.web.map(v => v * item.newMid[item.newMid.length - 1] / item.mid);
                                suggestion = stockProcess(+priceData[item.index].lastPrice, (item.newMid.length > 0) ? newArr : item.web, item.times, item.previous, item.amount, item_count, item.wType, 1, BITFINEX_INTERVAL, BITFINEX_INTERVAL);
                            }
                            console.log(suggestion);
                            let count = 0;
                            let amount = item.amount;
                            if (suggestion.type === 7) {
                                if (amount > item.orig * 7 / 8) {
                                    let tmpAmount = amount - item.orig * 3 / 4;
                                    while ((tmpAmount - suggestion.buy * item.times) > 0) {
                                        amount -= (suggestion.buy * item.times);
                                        tmpAmount = amount - item.orig * 3 / 4;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.bCount) {
                                        suggestion.bCount = count * item.times;
                                    }
                                }
                            } else if (suggestion.type === 3) {
                                if (amount > item.orig * 5 / 8) {
                                    let tmpAmount = amount - item.orig / 2;
                                    while ((tmpAmount - suggestion.buy * item.times) > 0) {
                                        amount -= (suggestion.buy * item.times);
                                        tmpAmount = amount - item.orig / 2;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.bCount) {
                                        suggestion.bCount = count * item.times;
                                    }
                                }
                            } else if (suggestion.type === 6) {
                                if (amount > item.orig * 3 / 8) {
                                    let tmpAmount = amount - item.orig / 4;
                                    while ((tmpAmount - suggestion.buy * item.times) > 0) {
                                        amount -= (suggestion.buy * item.times);
                                        tmpAmount = amount - item.orig / 4;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.bCount) {
                                        suggestion.bCount = count * item.times;
                                    }
                                }
                            }
                            count = 0;
                            amount = item.amount;
                            if (suggestion.type === 9) {
                                if (amount < item.orig / 8) {
                                    let tmpAmount = item.orig / 4 - amount;
                                    while ((tmpAmount - suggestion.sell * item.times * (1 - BITFINEX_FEE)) > 0) {
                                        amount += (suggestion.sell * item.times * (1 - BITFINEX_FEE));
                                        tmpAmount = item.orig / 4 - amount;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.sCount) {
                                        suggestion.sCount = count * item.times;
                                    }
                                }
                            } else if (suggestion.type === 5) {
                                if (amount < item.orig * 3 / 8) {
                                    let tmpAmount = item.orig / 2 - amount;
                                    while ((tmpAmount - suggestion.sell * item.times * (1 - BITFINEX_FEE)) > 0) {
                                        amount += (suggestion.sell * item.times * (1 - BITFINEX_FEE));
                                        tmpAmount = item.orig / 2 - amount;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.sCount) {
                                        suggestion.sCount = count * item.times;
                                    }
                                }
                            } else if (suggestion.type === 8) {
                                if (amount < item.orig * 5 / 8) {
                                    let tmpAmount = item.orig * 3 / 4 - amount;
                                    while ((tmpAmount - suggestion.sell * item.times * (1 - BITFINEX_FEE)) > 0) {
                                        amount += (suggestion.sell * item.times * (1 - BITFINEX_FEE));
                                        tmpAmount = item.orig * 3 / 4 - amount;
                                        count++;
                                    }
                                    if (count * item.times > suggestion.sCount) {
                                        suggestion.sCount = count * item.times;
                                    }
                                }
                            }
                            console.log(suggestion);
                            const submitBuy = () => {
                                if (current.clear === true || current.clear[item.index] === true) {
                                    return reucr_status(index + 1);
                                }
                                if (item.amount < suggestion.bCount * suggestion.buy) {
                                    suggestion.bCount = Math.floor(item.amount / suggestion.buy * 10000) / 10000;
                                }
                                const order_avail = (margin[id] && margin[id][current.type] && margin[id][current.type].total) ? SUPPORT_LEVERAGE[item.index] ? SUPPORT_LEVERAGE[item.index] * margin[id][current.type].avail : margin[id][current.type].avail : 0;
                                if (order_avail < suggestion.bCount * suggestion.buy) {
                                    suggestion.bCount = Math.floor(order_avail / suggestion.buy * 10000) / 10000;
                                }
                                if (suggestion.bCount > 0) {
                                    console.log(`buy ${item.index} ${suggestion.bCount} ${suggestion.buy}`);
                                    const or1 = new Order({
                                        cid: Date.now(),
                                        type: 'LIMIT',
                                        symbol: item.index,
                                        amount: suggestion.bCount,
                                        price: suggestion.buy,
                                    }, userRest);
                                    return or1.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => reucr_status(index + 1));
                                } else {
                                    return reucr_status(index + 1);
                                }
                            }
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set : {
                                newMid: item.newMid,
                                tmpPT: item.tmpPT,
                                previous: item.previous,
                            }}).then(result => {
                                console.log(result);
                                if (order[id] && order[id][current.type]) {
                                    const cancelOrder = index => {
                                        if (index >= order[id][current.type].length) {
                                            return Promise.resolve();
                                        }
                                        if (order[id][current.type][index].symbol !== item.index) {
                                            return cancelOrder(index + 1);
                                        }
                                        return userRest.cancelOrder(order[id][current.type][index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOrder(index + 1)));
                                    }
                                    return cancelOrder(0);
                                } else {
                                    return Promise.resolve();
                                }
                            }).then(() => {
                                if (item_count < suggestion.sCount) {
                                    suggestion.sCount = item.count;
                                }
                                if (suggestion.sCount > 0) {
                                    console.log(`sell ${item.index} ${suggestion.sCount} ${suggestion.sell}`);
                                    const or = new Order({
                                        cid: Date.now(),
                                        type: 'LIMIT',
                                        symbol: item.index,
                                        amount: -suggestion.sCount,
                                        price: suggestion.sell,
                                        flags: 1024,
                                    }, userRest);
                                    return or.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => submitBuy());
                                } else {
                                    return submitBuy();
                                }
                            });
                        }
                        if (item.ing === 2) {
                            const sellAll = () => {
                                let item_count = 0;
                                if (position[id] && position[id][current.type]) {
                                    position[id][current.type].forEach(v => {
                                        if (v.symbol === item.index) {
                                            item_count += v.amount;
                                        }
                                    });
                                }
                                const delTotal = () => Mongo('remove', TOTALDB, {_id: item._id, $isolated: 1}).then(() => reucr_status(index + 1));
                                if (item_count > 0) {
                                    const or = new Order({
                                        cid: Date.now(),
                                        type: 'MARKET',
                                        symbol: item.index,
                                        amount: -item_count,
                                        flags: 1024,
                                    }, userRest);
                                    return or.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 3000))).then(() => delTotal());
                                } else {
                                    return delTotal();
                                }
                            }
                            if (order[id] && order[id][current.type]) {
                                const cancelOrder = index => {
                                    if (index >= order[id][current.type].length) {
                                        return sellAll();
                                    }
                                    if (order[id][current.type][index].symbol !== item.index) {
                                        return cancelOrder(index + 1);
                                    }
                                    return userRest.cancelOrder(order[username][data.type][index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 3000)).then(() => cancelOrder(index + 1)));
                                }
                                return cancelOrder(0);
                            } else {
                                return sellAll();
                            }
                        } else if (item.ing === 1) {
                            return startStatus();
                        } else {
                            if ((+priceData[item.index].lastPrice - item.mid) / item.mid * 100 < current.enter_mid) {
                                return Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}}).then(result => startStatus());
                            } else {
                                console.log('enter_mid');
                                console.log((+priceData[item.index].lastPrice - item.mid) / item.mid * 100);
                                return reucr_status(index + 1);
                            }
                        }
                    }
                }
                return reucr_status(0);
            });
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
                //type: 0,
            }));
            sendWs({
                type: 'bitfinex',
                data: -1,
                user: id,
            });
        });
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
            data['amountLimit'] = amountLimit;
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
        if (set.hasOwnProperty('diff')) {
            data['isDiff'] = set.diff;
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
            if (set.amount) {
                const amount = isValidString(set.amount, 'int');
                if (amount === false) {
                    return handleError(new HoError('Trade Amount is not valid'));
                }
                data['amount'] = amount;
            }
            if (set.enter_mid) {
                const enter_mid = Number(set.enter_mid);
                if (isNaN(enter_mid)) {
                    return handleError(new HoError('Enter Mid is not valid'));
                }
                data['enter_mid'] = enter_mid;
            }
            if (set.rate_ratio) {
                const rate_ratio = Number(set.rate_ratio);
                if (isNaN(rate_ratio)) {
                    return handleError(new HoError('Rate Ratio is not valid'));
                }
                data['rate_ratio'] = rate_ratio;
            }
            if (set.hasOwnProperty('pair')) {
                if (set.pair) {
                    const pair = isValidString(set.pair, 'name');
                    if (pair === false) {
                        return handleError(new HoError('Trade Pair is not valid'));
                    }
                    const pairArr = [];
                    pair.split(',').forEach(v => {
                        const p = v.trim();
                        const m = p.match(/^([a-zA-Z]+)\=(\d+)$/);
                        if (m && SUPPORT_PAIR[set.type].indexOf(m[1]) !== -1) {
                            pairArr.push({
                                type: m[1],
                                amount: Number(m[2]),
                            });
                        }
                    });
                    data['pair'] = pairArr;
                } else {
                    data['pair'] = [];
                }
            }
            if (set.hasOwnProperty('clear')) {
                if (set.clear) {
                    let allClear = false;
                    const clear = isValidString(set.clear, 'name');
                    if (clear === false) {
                        return handleError(new HoError('Trade Clear is not valid'));
                    }
                    const clearArr = {};
                    clear.split(',').forEach(v => {
                        const c = v.trim();
                        if (c === 'ALL') {
                            allClear = true;
                        } else if (SUPPORT_PAIR[set.type].indexOf(c) !== -1) {
                            clearArr[c] = true;
                        }
                    });
                    if (allClear) {
                        data['clear'] = true;
                    } else {
                        data['clear'] = clearArr;
                    }
                } else {
                    data['clear'] = {};
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
                //處理市價出單
                return Mongo('find', TOTALDB, {owner: id, sType: 1, type: set.type}).then(item => {
                    console.log(item);
                    if (data['pair']) {
                        for (let i = 0; i < data['pair'].length; i++) {
                            let exist = false;
                            for (let j = 0; j < item.length; j++) {
                                if (item[j].index === data['pair'][i].type) {
                                    exist = true;
                                    break;
                                }
                            }
                            if (!exist) {
                                item.push(data['pair'][i]);
                            }
                        }
                        const recur_update = index => {
                            if (index >= item.length) {
                                return returnSupport(bitfinex);
                            } else {
                                if (item[index]._id) {
                                    for (let i = 0; i < data['pair'].length; i++) {
                                        if (item[index].index === data['pair'][i].type) {
                                            return Mongo('update', TOTALDB, {_id: item[index]._id}, {$set : {
                                                times: Math.floor(item[index].times * data['pair'][i].amount / item[index].orig * 10000) / 10000,
                                                amount: item[index].amount + data['pair'][i].amount - item[index].orig,
                                                orig: data['pair'][i].amount,
                                            }}).then(item => {
                                                console.log(item);
                                                return recur_update(index + 1);
                                            });
                                        }
                                    }
                                    return Mongo('update', TOTALDB, {_id: item[index]._id}, {$set : {ing: 2}}).then(result => {
                                        console.log(result);
                                        return recur_update(index + 1);
                                    });
                                } else {
                                    return Mongo('find', TOTALDB, {index: item[index].type, sType: 1}).then(webitem => {
                                        if (webitem.length < 1) {
                                            return handleError(new HoError(`miss ${item[index].type} web`));
                                        }
                                        const maxAmount = webitem[0].mid * (webitem[0].web.length - 1) / 3 * 2;
                                        return Mongo('insert', TOTALDB, {
                                            owner: id,
                                            index: item[index].type,
                                            name: item[index].type.substr(1),
                                            type: set.type,
                                            sType: 1,
                                            web: webitem[0].web,
                                            wType: webitem[0].wType,
                                            mid: webitem[0].mid,
                                            times: Math.floor(item[index].amount / maxAmount * 10000) / 10000,
                                            amount: item[index].amount,
                                            orig: item[index].amount,
                                            previous: {buy: [], sell: []},
                                            newMid: [],
                                            ing: 0,
                                        }).then(item => {
                                            console.log(item);
                                            return recur_update(index + 1);
                                        })
                                    });
                                }
                            }
                        }
                        return recur_update(0);
                    } else {
                        return returnSupport(bitfinex);
                    }
                });
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
                if (margin[id] && margin[id][v]) {
                    if (uid === (i+1) * 100) {
                        return {
                            item: [
                                {
                                    name: `交易閒置 ${v.substr(1)} $${Math.round(margin[id][v].avail * 100) / 100}`,
                                    id: (i+1) * 100,
                                    tags: [v.substr(1).toLowerCase(), 'wallet', '錢包', '交易'],
                                    rate: `$${Math.round(margin[id][v].total * 100) / 100}`,
                                    count: margin[id][v].total,
                                    utime: margin[id][v].time,
                                    type: 0,
                                }
                            ],
                        };
                    } else {
                        itemList.push({
                            name: `交易閒置 ${v.substr(1)} $${Math.round(margin[id][v].avail * 100) / 100}`,
                            id: (i+1) * 100,
                            tags: [v.substr(1).toLowerCase(), 'wallet', '錢包', '交易'],
                            rate: `$${Math.round(margin[id][v].total * 100) / 100}`,
                            count: margin[id][v].total,
                            utime: margin[id][v].time,
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
                    name: `${i.substr(1)} $${Math.floor(priceData[i].lastPrice * 10000) / 10000}`,
                    id: vid++,
                    tags: [i.substr(1, 4), i.substr(-3), 'rate', '利率'],
                    rate: `${Math.floor(priceData[i].dailyChange * 100) / 100}%`,
                    count: priceData[i].dilyChange,
                    utime: priceData[i].time,
                    type: 1,
                    str: priceData[i].str,
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
                let p = '';
                i.pair.forEach(v => {
                    if (p) {
                        p = `${p},${v.type}=${v.amount}`;
                    } else {
                        p =`${v.type}=${v.amount}`;
                    }
                })
                i.pair = p;
            } else {
                i.pair = '';
            }
            if (i.clear) {
                if (i.clear === true) {
                    i.clear = 'ALL';
                } else {
                    i.clear = Object.keys(i.clear).toString();
                }
            } else {
                i.clear = '';
            }
            if (SUPPORT_PAIR[v]) {
                i.tradable = true;
            }
            return i;
        }
    }
    return {type: v};
}) : SUPPORT_COIN.map(v => ({type: v}));
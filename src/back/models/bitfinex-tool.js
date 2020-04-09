import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver'
import { TBTC_SYM, TETH_SYM, BITFINEX_EXP, BITFINEX_MIN, DISTRIBUTION, OFFER_MAX, COIN_MAX, COIN_MAX_MAX, RISK_MAX, SUPPORT_COIN, USERDB } from '../constants'
import BFX from 'bitfinex-api-node'
import { FundingOffer } from 'bfx-api-node-models'
import Mongo from '../models/mongo-tool'
import { handleError, HoError, isValidString } from '../util/utility'
import sendWs from '../util/sendWs'

const bfx = new BFX({ apiKey: BITFINEX_KEY, apiSecret: BITFINEX_SECRET });
const rest = bfx.rest(2, { transform: true });
const userWs = {};
const userOk = {};

let finalRate = {};
let maxRange = {};
let currentRate = {};

let btcDailyChange = 0;
let ethDailyChange = 0;

let available = {};
let offer = {};

//let credit = {};
//legder

//wallet history
//credit history
//5m candle x

export const calRate = curArr => rest.ticker(TBTC_SYM).then(btcTicker => rest.ticker(TETH_SYM).then(ethTicker => {
    btcDailyChange = btcTicker.dailyChangePerc * 100;
    ethDailyChange = ethTicker.dailyChangePerc * 100;
    //console.log(btcDailyChange);
    //console.log(ethDailyChange);
    if (btcDailyChange < COIN_MAX || ethDailyChange < COIN_MAX) {
        sendWs(`Bitfinex Daily Change: ${btcDailyChange} ${ethDailyChange}` , 0, 0, true);
    }
    const singleCal = curType => rest.ticker(curType).then(curTicker => rest.orderBook(curType, 'P0', 100).then(orderBooks => {
        currentRate[curType] = curTicker.lastPrice * BITFINEX_EXP;
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
            const calOBRate = (hl, orderBooks) => {
                let vol = 0;
                let i = 0;
                const rate = [];
                let j = 0;
                orderBooks.forEach(v => {
                    if(v[3] > 0) {
                        vol = vol + v[3];
                        if (i < hl.length && vol > hl[i].vol) {
                            rate.push(v[0] * BITFINEX_EXP);
                            i++;
                        } else if (j === 0) {
                            rate.push(v[0] * BITFINEX_EXP);
                        } else if (j === 99) {
                            rate.push(v[0] * BITFINEX_EXP);
                        }
                        j++;
                    }
                });
                rate.reverse();
                while (rate.length < 11) {
                    rate.push(rate[rate.length - 1]);
                }
                return rate;
            }
            const calTenthRate = (hl, weight) => {
                const rate = [hl[9].low];
                let i = 0;
                let j = 0;
                weight.forEach((v, k) => {
                    if (weight[k]) {
                        i = i + weight[k];
                        while (i > (hl[9].vol / 100 * DISTRIBUTION[j]) && j < 9) {
                            rate.push(k * 100);
                            j++;
                        }
                    }
                });
                rate.push(hl[9].high);
                return rate.reverse();
            }
            const OBRate = calOBRate(hl, orderBooks);
            const tenthRate = calTenthRate(hl, weight);
            maxRange[curType] = tenthRate[1] - tenthRate[9];
            finalRate[curType] = tenthRate.map((v, k) => (v > OBRate[k]) ? (v - 1) : (OBRate[k] - 1));
            console.log(`${curType} RATE: ${finalRate[curType]}`);
            //console.log(OBRate);
            //console.log(tenthRate);
            //console.log(currentRate[curType]);
            //console.log(maxRange[curType]);
        });
    }));
    const recurType = index => (index >= curArr.length) ? Promise.resolve() : (SUPPORT_COIN.indexOf(curArr[index]) !== -1) ? singleCal(curArr[index]).then(() => recurType(index + 1)) : recurType(index + 1);
    return recurType(0);
}));

export const setWsOffer = (id, curArr=[]) => {
    //檢查跟設定active
    curArr = curArr.filter(v => (v.isActive && v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0) ? true : false);
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
        userWs[id] = userBfx.ws(2,{ transform: true });
        userWs[id].on('error', err => {
            sendWs(`${id} Bitfinex Ws Error: ${err.message||err.msg}`, 0, 0, true);
            handleError(err, 'Bitfinex Ws Error');
        });
        userWs[id].on('open', () => userWs[id].auth());
        userWs[id].once('auth', () => {
            console.log(`${id} authenticated`);
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate ({}, wallet => {
            SUPPORT_COIN.forEach(t => {
                if (wallet.type === 'funding' && wallet.currency === t.substr(1)) {
                    available[t] = wallet.balanceAvailable;
                    console.log('available');
                    console.log(available);
                }
            });
        });
        SUPPORT_COIN.forEach(t => {
            /*userRest.ledgers({ccy: curArr[i].type.substr(1), category: 28}).then(entries => {
                console.log(`${curArr[i].type} ledgers`);
                console.log(entries.length);
            }).catch(err => {
                sendWs(`Bitfinex ${curArr[i].type} Ws Error: ${err.message||err.msg}`, 0, 0, true);
                handleError(err, `Bitfinex ${curArr[i].type} Ledger Error`);
            });*/
            userWs[id].onFundingOfferSnapshot({ symbol: t }, fos => {
                console.log(`${t} offer`);
                let risk = RISK_MAX;
                const temp = [];
                fos.forEach(v => {
                    if (v.symbol === t) {
                        temp.push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            amount: v.amount,
                            rate: v.rate,
                            period: v.period,
                            status: v.status,
                            risk: risk > 0 ? risk-- : 0,
                        });
                    }
                });
                offer[t] = temp;
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferUpdate({ symbol: t }, fo => {
                console.log(`${t} offer update`);
                for (let j = 0; j < offer[t].length; j++) {
                    if (offer[t][j].id === fo.id) {
                        offer[t][j].id = fo.id;
                        //offer[t][j].time = fo.mtsCreate;
                        offer[t][j].amount = fo.amount;
                        offer[t][j].rate = fo.rate;
                        offer[t][j].period = fo.period;
                        offer[t][j].status = fo.status;
                        break;
                    }
                }
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferNew({ symbol: t }, fo => {
                console.log(`${t} offer new`);
                if (!offer[t]) {
                    offer[t] = [];
                }
                offer[t].push({
                    id: fo.id,
                    time: Math.round(fo.mtsCreate / 1000),
                    amount: fo.amount,
                    rate: fo.rate,
                    period: fo.period,
                    status: fo.status,
                });
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferClose({ symbol: t }, fo => {
                console.log(`${t} offer close`);
                for (let j = 0; j < offer[t].length; j++) {
                    if (offer[t][j].id === fo.id) {
                        offer[t].splice(j, 1);
                        break;
                    }
                }
                console.log(offer[t].length);
            });
            /*userWs[id].onFundingCreditSnapshot({ symbol: curArr[i].type }, fcs => {
                console.log(`${curArr[i].type} credit`);
                credit[curArr[i].type] = fcs.map(v => ({
                    id: v.id,
                    time: Math.round(v.mtsOpening / 1000),
                    amount: v.amount,
                    rate: v.rate,
                    period: v.period,
                    pair: v.positionPair,
                    status: v.status,
                }));
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditUpdate({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit update`);
                for (let j = 0; j < credit[curArr[i].type].length; j++) {
                    if (credit[curArr[i].type][j].id === fc.id) {
                        credit[curArr[i].type][j].id = fc.id;
                        credit[curArr[i].type][j].time = Math.round(fc.mtsOpening / 1000);
                        credit[curArr[i].type][j].amount = fc.amount;
                        credit[curArr[i].type][j].rate = fc.rate;
                        credit[curArr[i].type][j].period = fc.period;
                        credit[curArr[i].type][j].pair = fc.positionPair;
                        credit[curArr[i].type][j].status = fc.status;
                        break;
                    }
                }
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditNew({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit new`);
                credit[curArr[i].type].push({
                    id: fc.id,
                    time: Math.round(fc.mtsOpening / 1000),
                    amount: fc.amount,
                    rate: fc.rate,
                    period: fc.period,
                    pair: fc.positionPair,
                    status: fc.status,
                });
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditClose({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit close`);
                for (let j = 0; j < credit[curArr[i].type].length; j++) {
                    if (credit[curArr[i].type][j].id === fc.id) {
                        credit[curArr[i].type].splice(j, 1);
                        break;
                    }
                }
                console.log(credit[curArr[i].type].length);
            });*/
        });
        userWs[id].open();
    } else if (!userWs[id].isOpen()) {
        console.log('reconnect ws');
        userWs[id].reconnect();
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
        const MR = (current.miniRate > 0) ? current.miniRate/36500*BITFINEX_EXP : 0;
        // adjust offer & history
        const adjustOffer = () => {
            console.log(`${id} ${current.type}`);
            if (offer[current.type]) {
                //console.log(offer[current.type]);
                //produce retain delete
                offer[current.type].forEach(v => {
                    if ((v.rate - currentRate[current.type]) > maxRange[current.type]) {
                        needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                    } else if ((Math.round(new Date().getTime() / 1000) - v.time) >= (current.waitTime * 60)) {
                        needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                    } else {
                        needRetain.push({risk: v.risk, rate: v.rate * BITFINEX_EXP});
                    }
                });
            }
            needDelete.forEach(v => {
                let risk = (v.risk > 1) ? v.risk - 1 : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                needNew.push({
                    risk,
                    amount: v.amount,
                    rate: (current.miniRate > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                })
            });
            //console.log('needdelete');
            //console.log(needDelete);
        }
        //keep cash
        const calKeepCash = avail => {
            let kp = avail ? avail : 0;
            if (current.isKeep) {
                if (btcDailyChange < COIN_MAX || ethDailyChange < COIN_MAX) {
                    const dailyChange = (btcDailyChange < ethDailyChange) ? btcDailyChange : ethDailyChange;
                    kp = kp * (50 - ((COIN_MAX - dailyChange) / (COIN_MAX - COIN_MAX_MAX) * 50)) / 100;
                }
            }
            return current.keepAmount ? kp - current.keepAmount : kp;
        }
        //produce new
        const newOffer = risk => {
            let keep_available = calKeepCash(available[current.type]);
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
                if (finalRate[current.type].length <= 0 || keep_available < current.amountLimit * 0.2 || keep_available < 50) {
                    break;
                }
                let amount = current.amountLimit;
                if (keep_available < current.amountLimit * 1.2) {
                    amount = keep_available;
                }
                needNew.push({
                    risk,
                    amount,
                    rate: (current.miniRate > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                });
                keep_available = keep_available - amount;
                risk = risk < 1 ? 0 : risk-1;
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
                    for (let i = 0; i < offer[current.type].length; i++) {
                        if (needDelete[notDelete].id === offer[current.type][i].id) {
                            offer[current.type][i].time = Math.round(new Date().getTime() / 1000);
                            offer[current.type][i].risk = v.risk;
                            break;
                        }
                    }
                    needDelete.splice(notDelete, 1);
                } else {
                    finalNew.push(v);
                }
            });
            //console.log('retain');
            //console.log(needRetain);
            console.log('delete');
            console.log(needDelete);
            console.log('final');
            console.log(finalNew);
        }
        adjustOffer();
        newOffer(current.riskLimit);
        mergeOffer();
        const DR = (current.dynamic > 0) ? current.dynamic/36500*BITFINEX_EXP : 0;
        const cancelOffer = index => (index >= needDelete.length) ? Promise.resolve() : userRest.cancelFundingOffer(needDelete[index].id).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 1000)).then(() => cancelOffer(index + 1)));
        const submitOffer = index => {
            if (index >= finalNew.length) {
                return Promise.resolve();
            } else {
                const fo = new FundingOffer({
                    symbol: current.type,
                    amount: finalNew[index].amount,
                    rate: finalNew[index].rate / BITFINEX_EXP,
                    period: (current.dynamic > 0 && finalNew[index].rate > DR) ? 30 : 2,
                    type: 'LIMIT',
                }, userRest);
                return fo.submit().then(() =>  new Promise((resolve, reject) => setTimeout(() => resolve(), 1000)).then(() => {
                    for (let i = 0; i < offer[current.type].length; i++) {
                        if (fo.id === offer[current.type][i].id) {
                            offer[current.type][i].risk = finalNew[index].risk;
                            console.log(`Offer ${offer[current.type][i].id} ${offer[current.type][i].risk}`);
                            break;
                        }
                    }
                    return submitOffer(index + 1);
                }));
            }
        }
        return cancelOffer(0).then(() => submitOffer(0));
    }

    const recurLoan = index => (index >= curArr.length) ? Promise.resolve() : (curArr[index] && SUPPORT_COIN.indexOf(curArr[index].type) !== -1) ? singleLoan(curArr[index]).then(() => recurLoan(index + 1)) : recurLoan(index + 1);
    return recurLoan(0);
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
            data['amountLimit'] = amountLimit > 50 ? amountLimit : 50;
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
                return handleError(new HoError('API secret is not valid'));
            }
            data['keepAmount'] = keepAmount;
        }
        if (set.hasOwnProperty('keep')) {
            data['isKeep'] = set.keep;
        }
        if (set.hasOwnProperty('active')) {
            data['isActive'] = set.active;
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
                console.log(bitfinex);
                return Mongo('update', USERDB, {_id: id}, {$set: {bitfinex}}).then(user => {
                    console.log(user);
                    return returnSupport(bitfinex);
                });
            } else {
                return returnSupport();
            }
        });
    },
}

const returnSupport = bitfinex => bitfinex ? SUPPORT_COIN.map(v => {
    for (let i of bitfinex) {
        if (i.type === v) {
            return i;
        }
    }
    return {type: v};
}) : SUPPORT_COIN.map(v => ({type: v}));
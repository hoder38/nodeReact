import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver'
import { TBTC_SYM, TETH_SYM, BITFINEX_EXP, BITFINEX_MIN, DISTRIBUTION, OFFER_MAX, COIN_MAX, COIN_MAX_MAX, RISK_MAX, SUPPORT_COIN, USERDB, BITNIFEX_PARENT, FUSD_SYM, FUSDT_SYM } from '../constants'
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

let extremRate = {};

let btcData = null;
let ethData = null;

let available = {};
let offer = {};

let credit = {};
let ledger = {};

//wallet history
//credit history
//5m candle x

export const calRate = curArr => rest.ticker(TBTC_SYM).then(btcTicker => rest.ticker(TETH_SYM).then(ethTicker => {
    btcData = {
        dailyChange: btcTicker.dailyChangePerc * 100,
        lastPrice: btcTicker.lastPrice,
        time: Math.round(new Date().getTime() / 1000),
    }
    ethData = {
        dailyChange: ethTicker.dailyChangePerc * 100,
        lastPrice: ethTicker.lastPrice,
        time: Math.round(new Date().getTime() / 1000),
    }
    if (btcData.dailyChange < COIN_MAX || ethData.dailyChange < COIN_MAX) {
        sendWs(`Bitfinex Daily Change: ${btcData.dailyChange} ${ethData.dailyChange}` , 0, 0, true);
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
            handleError(err, `${id} Bitfinex Ws Error`);
        });
        userWs[id].on('open', () => userWs[id].auth());
        userWs[id].once('auth', () => {
            console.log(`${id} authenticated`);
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate ({}, wallet => {
            SUPPORT_COIN.forEach((t, i) => {
                if (wallet.type === 'funding' && wallet.currency === t.substr(1)) {
                    if (!available[id]) {
                        available[id] = {}
                    }
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
                    //console.log('available');
                    //console.log(available[id]);
                }
            });
        });
        SUPPORT_COIN.forEach(t => {
            userWs[id].onFundingOfferSnapshot({ symbol: t }, fos => {
                //console.log(`${t} offer`);
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
                if (!offer[id]) {
                    offer[id] = {};
                }
                offer[id][t] = temp;
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
                //console.log(offer[id][t].length);
            });
            userWs[id].onFundingOfferUpdate({ symbol: t }, fo => {
                //console.log(`${t} offer update`);
                for (let j = 0; j < offer[id][t].length; j++) {
                    if (offer[id][t][j].id === fo.id) {
                        offer[id][t][j].id = fo.id;
                        //offer[id][t][j].time = fo.mtsCreate;
                        offer[id][t][j].amount = fo.amount;
                        offer[id][t][j].rate = fo.rate;
                        offer[id][t][j].period = fo.period;
                        offer[id][t][j].status = fo.status;
                        break;
                    }
                }
                //console.log(offer[id][t].length);
            });
            userWs[id].onFundingOfferNew({ symbol: t }, fo => {
                console.log(`${t} ${id} offer new`);
                if (!offer[id]) {
                    offer[id] = {};
                }
                if (!offer[id][t]) {
                    offer[id][t] = [];
                }
                let isExist = false;
                for (let i = 0; i < offer[id][t].length; i++) {
                    if (fo.id === offer[id][t][i].id) {
                        offer[id][t][i].time = Math.round(fo.mtsCreate / 1000);
                        offer[id][t][i].status = fo.status;
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    offer[id][t].push({
                        id: fo.id,
                        time: Math.round(fo.mtsCreate / 1000),
                        amount: fo.amount,
                        rate: fo.rate,
                        period: fo.period,
                        status: fo.status,
                    });
                }
                //console.log(offer[id][t].length);
            });
            userWs[id].onFundingOfferClose({ symbol: t }, fo => {
                console.log(`${t} ${id} offer close`);
                if (!offer[id]) {
                    offer[id] = {};
                }
                if (offer[id][t]) {
                    for (let j = 0; j < offer[id][t].length; j++) {
                        if (offer[id][t][j].id === fo.id) {
                            offer[id][t].splice(j, 1);
                            break;
                        }
                    }
                    //console.log(offer[id][t].length);
                }
            });
            userWs[id].onFundingCreditSnapshot({ symbol: t }, fcs => {
                //console.log(`${t} credit`);
                const temp = [];
                fcs.forEach(v => {
                    if (v.symbol === t) {
                        temp.push({
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
                if (!credit[id]) {
                    credit[id] = {};
                }
                credit[id][t] = temp;
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
                //console.log(credit[id][t].length);
            });
            userWs[id].onFundingCreditUpdate({ symbol: t }, fc => {
                //console.log(`${t} credit update`);
                for (let j = 0; j < credit[id][t].length; j++) {
                    if (credit[id][t][j].id === fc.id) {
                        credit[id][t][j].id = fc.id;
                        credit[id][t][j].time = Math.round(fc.mtsOpening / 1000);
                        credit[id][t][j].amount = fc.amount;
                        credit[id][t][j].rate = fc.rate;
                        credit[id][t][j].period = fc.period;
                        credit[id][t][j].pair = fc.positionPair;
                        credit[id][t][j].status = fc.status;
                        credit[id][t][j].side = fc.side;
                        break;
                    }
                }
                //console.log(credit[id][t].length);
            });
            userWs[id].onFundingCreditNew({ symbol: t }, fc => {
                //console.log(`${t} credit new`);
                if (!credit[id]) {
                    credit[id] = {};
                }
                if (!credit[id][t]) {
                    credit[id][t] = [];
                }
                credit[id][t].push({
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
                //console.log(credit[id][t].length);
            });
            userWs[id].onFundingCreditClose({ symbol: t }, fc => {
                //console.log(`${t} credit close`);
                if (!credit[id]) {
                    credit[id] = {};
                }
                if (credit[id][t]) {
                    for (let j = 0; j < credit[id][t].length; j++) {
                        if (credit[id][t][j].id === fc.id) {
                            credit[id][t].splice(j, 1);
                            break;
                        }
                    }
                }
                sendWs({
                    type: 'bitfinex',
                    data: -1,
                    user: id,
                });
                //console.log(credit[id][t].length);
            });
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
        const DR = [];
        const pushDR = (rate, day) => {
            if (rate > 0) {
                const DRT = {
                    rate: rate/36500*BITFINEX_EXP,
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
        const extremRateCheck = (auUser) => {
            if (id !== auUser) {
                return false;
            }
            if (!extremRate[id]) {
                extremRate[id] = {}
            }
            if (DR.length > 0 && currentRate[current.type].rate > DR[0].rate) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 1,
                        low: 0,
                    }
                } else {
                    extremRate[id][current.type].high++;
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : (extremRate[id][current.type].low - 1);
                    if (extremRate[id][current.type].high >= 15) {
                        sendWs(`${id} ${current.type.substr(1)} rate too high!!!` , 0, 0, true);
                        extremRate[id][current.type].high = 0;
                    }
                }
            } else if (MR > 0 && currentRate[current.type].rate < MR) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 1,
                    }
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : (extremRate[id][current.type].high - 1);
                    extremRate[id][current.type].low++;
                    if (extremRate[id][current.type].low >= 15) {
                        sendWs(`${id} ${current.type.substr(1)} rate too low!!!` , 0, 0, true);
                        extremRate[id][current.type].low = 0;
                    }
                }
            } else {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 0,
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
                if (btcData.dailyChange < COIN_MAX || ethData.dailyChange < COIN_MAX) {
                    const dailyChange = (btcData.dailyChange < ethData.dailyChange) ? btcData.dailyChange : ethData.dailyChange;
                    kp = kp * (50 - ((COIN_MAX - dailyChange) / (COIN_MAX - COIN_MAX_MAX) * 50)) / 100;
                }
            }
            if (current.keepAmountRate1 > 0 && currentRate[current.type].rate > (current.keepAmountRate1 / 36500 * BITFINEX_EXP)) {
                return kp - current.keepAmountMoney1;
            } else {
                return current.keepAmount ? kp - current.keepAmount : kp;
            }
        }
        let keep_available = calKeepCash(available[id]);
        console.log(keep_available);
        const adjustOffer = () => {
            console.log(`${id} ${current.type}`);
            if (!offer[id]) {
                offer[id] = {};
            }
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
                    rate: (current.miniRate > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
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
                if (finalRate[current.type].length <= 0 || keep_available < 50) {
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
                    rate: (current.miniRate > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
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
        extremRateCheck('hoder');
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
    const getLegder = current => {
        if (!ledger[id]) {
            ledger[id] = {};
        }
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
            }));
            sendWs({
                type: 'bitfinex',
                data: -1,
                user: id,
            });
            console.log(ledger[id][current.type].length);
        });
    }
    const recurLoan = index => (index >= curArr.length) ? Promise.resolve() : (curArr[index] && SUPPORT_COIN.indexOf(curArr[index].type) !== -1) ? getLegder(curArr[index]).then(() => singleLoan(curArr[index]).then(() => recurLoan(index + 1))) : recurLoan(index + 1);
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
        //dynamic1 > dynamic2 做排序?
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
                    const showRate = Math.round(rate * 36500) / 100;
                    tempList.push({
                        name: `${v.substr(1)} Rate`,
                        id: i,
                        tags: [v.substr(1).toLowerCase(), 'rate', '利率'],
                        rate: `${rate} (${showRate}%)`,
                        count: rate,
                        utime: currentRate[v].time,
                        type: 1,
                    });
                }
            }
            if (btcData) {
                tempList.push({
                    name: `Bitcoin $${Math.floor(btcData.lastPrice * 100) / 100}`,
                    id: SUPPORT_COIN.length,
                    tags: ['bitcoin', '比特幣', 'rate', '利率'],
                    rate: `${Math.floor(btcData.dailyChange * 100) / 100}%`,
                    count: btcData.dilyChange,
                    utime: btcData.time,
                    type: 1,
                })
            }
            if (ethData) {
                tempList.push({
                    name: `Ethereum $${Math.floor(ethData.lastPrice * 100) / 100}`,
                    id: SUPPORT_COIN.length + 1,
                    tags: ['bitcoin', '比特幣', 'rate', '利率'],
                    rate: `${Math.floor(ethData.dailyChange * 100) / 100}%`,
                    count: ethData.dailyChange,
                    utime: ethData.time,
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
                if (offer[id] && offer[id][v]) {
                    offer[id][v].forEach(o => {
                        const rate = Math.round(o.rate * 10000000) / 100000;
                        const showRate = Math.round(rate * 36500) / 100;
                        const risk = o.risk === undefined ? '手動' : `risk ${o.risk}`;
                        itemList.push({
                            name: `掛單 ${v.substr(1)} $${Math.floor(o.amount * 100) / 100} ${o.period}天期 ${o.status ? o.status : ''} ${risk}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'offer', '掛單'],
                            rate: `${rate} (${showRate}%)`,
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
                if (credit[id] && credit[id][v]) {
                    credit[id][v].forEach(o => {
                        const rate = Math.round(o.rate * 10000000) / 100000;
                        const showRate = Math.round(rate * 36500) / 100;
                        itemList.push({
                            name: `${(o.side === 1) ? '放款' : '借款'} ${v.substr(1)} $${Math.floor(o.amount * 100) / 100} ${o.period}天期 ${o.status} ${o.pair}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'credit', '放款'],
                            rate: `${rate} (${showRate}%)`,
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
                        const showRate = Math.round(rate * 36500) / 100;
                        itemList.push({
                            name: `利息收入 ${v.substr(1)} $${o.amount}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'payment', '利息收入'],
                            rate: `${rate} (${showRate}%)`,
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
            return i;
        }
    }
    return {type: v};
}) : SUPPORT_COIN.map(v => ({type: v}));
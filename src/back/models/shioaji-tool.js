import { SHIOAJI_APIKEY, SHIOAJI_APISECRET, SHIOAJI_CA, SHIOAJI_CAPW } from '../../../ver.js'
import { __dirname, TRADE_FEE, UPDATE_ORDER, TOTALDB, RANGE_INTERVAL, TWSE_ORDER_INTERVAL, TWSE_MARKET_TIME, PRICE_INTERVAL, API_WAIT } from '../constants.js'
import pathModule from 'path'
const { join: PathJoin } = pathModule;
import Child_process from 'child_process'
import { getSuggestionData } from '../models/stock-tool.js'
import { handleError, HoError } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'
import createLogger from '../util/logger.js'

const log = createLogger('shioaji')

let updateTime = {book: 0, trade: 0};
let available = 0;
let order = [];
let position = [];
let fakeOrder = [];
let _TWSE_MARKET_TIME = TWSE_MARKET_TIME;

// Test helpers — expose state for white-box testing without jest.resetModules()
export function _resetState() {
    updateTime = {book: 0, trade: 0};
    available = 0;
    order = [];
    position = [];
    fakeOrder = [];
    _TWSE_MARKET_TIME = TWSE_MARKET_TIME;
}
export function _getState() {
    return { updateTime: {...updateTime}, available, order: [...order], position: [...position], fakeOrder: [...fakeOrder] };
}
export function _setState(overrides) {
    if ('updateTime' in overrides) updateTime = overrides.updateTime;
    if ('available' in overrides) available = overrides.available;
    if ('order' in overrides) order = overrides.order;
    if ('position' in overrides) position = overrides.position;
    if ('fakeOrder' in overrides) fakeOrder = overrides.fakeOrder;
    if ('marketTime' in overrides) _TWSE_MARKET_TIME = overrides.marketTime;
}

export const twseShioajiInit = (force = false) => {
    const initialBook = () => {
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            log.info({ bookTime: updateTime['book'] }, 'book refresh')
            return getShioajiData(false).catch(err => {
                if (force === true) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                }
                log.error({ err }, 'shioaji python error')
                return handleError(new HoError('Shioaji python error!!!'));
            }).then(ret => {
                const twseSuggestion = getSuggestionData('twse');
                log.debug({ fakeOrder }, 'fakeOrder shioaji')
                fakeOrder.forEach(o => {
                    if (!o.done && o.type === 'buy' && twseSuggestion[o.symbol].price && twseSuggestion[o.symbol].price <= o.price) {
                        o.done = true;
                        log.info('fake order close')
                        ret.fill_order.push({
                            price: o.price,
                            time: o.time,
                            symbol: o.symbol,
                            starttime: o.time,
                            type: 'Buy',
                            fake: true,
                        });
                    } else if (!o.done && o.type === 'sell' && twseSuggestion[o.symbol].price && twseSuggestion[o.symbol].price >= o.price) {
                        o.done = true;
                        log.info('fake order close')
                        ret.fill_order.push({
                            price: o.price,
                            time: o.time,
                            symbol: o.symbol,
                            starttime: o.time,
                            type: 'Sell',
                            fake: true,
                        });
                    }
                });
                const fill_order_recur = index => {
                    if (index >= ret.fill_order.length) {
                        return Promise.resolve();
                    } else {
                        const o = ret.fill_order[index];
                        log.debug({ order: o }, 'processing fill order')
                        if (o.price <= 0) {
                            return fill_order_recur(index + 1);
                        }
                        return Mongo('find', TOTALDB, {setype: 'twse', index: o.symbol}).then(items => {
                            if (items.length < 1) {
                                log.warn({ symbol: o.symbol }, 'symbol not found in TOTALDB')
                                return fill_order_recur(index + 1);
                            }
                            const item = items[0];
                            if (o.type === 'Buy') {
                                let is_insert = false;
                                for (let k = 0; k < item.previous.buy.length; k++) {
                                    if (item.previous.buy[k].time === o.time && item.previous.buy[k].price === o.price) {
                                        log.warn('order duplicate skipped')
                                        return fill_order_recur(index + 1);
                                    } else if (o.price < item.previous.buy[k].price) {
                                        item.previous.buy.splice(k, 0, {
                                            price: o.price,
                                            time: o.time,
                                        });
                                        is_insert = true;
                                        break;
                                    }
                                }
                                if (!is_insert) {
                                    item.previous.buy.push({
                                        price: o.price,
                                        time: o.time,
                                    });
                                }
                                if ((o.starttime + TWSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                    if (o.fake) {
                                        item.previous = {
                                            price: o.price,
                                            tprice: item.previous.tprice ? 0 : item.previous.price,
                                            time: item.previous.time,
                                            type: 'buy',
                                            buy: item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            sell: item.previous.sell,
                                            //real: false,
                                        }
                                    } else {
                                        let profit = 0;
                                        if (typeof o.profit === 'string' && typeof o.ptime === 'string') {
                                            const this_profit = o.profit.split('p').filter(i => i);
                                            const this_time = o.ptime.split('t').filter(i => i);
                                            let matchCount = 0;
                                            for (let i = this_profit.length - 1; i >= 0; i--) {
                                                const p = Number(this_profit[i]);
                                                const t = Number(this_time[i]);
                                                for (let k = 0; k < item.previous.buy.length; k++) {
                                                    if (item.previous.buy[k].time === t) {
                                                        matchCount++;
                                                        break;
                                                    }
                                                }
                                                if (matchCount < 2) {
                                                    profit += p;
                                                    while (Number(this_time[i - 1]) === t) {
                                                        profit += Number(this_profit[i - 1]);
                                                        i--;
                                                    }
                                                } else {
                                                    break;
                                                }
                                            }
                                            item.profit -= profit;
                                        }
                                        item.previous = {
                                            price: o.price,
                                            time: o.time,
                                            type: 'buy',
                                            buy: item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            sell: item.previous.sell,
                                            //real: true,
                                        }
                                    }
                                } else {
                                    log.warn({
                                        starttime: o.starttime,
                                        deadline: o.starttime + TWSE_ORDER_INTERVAL,
                                        now: Math.round(new Date().getTime() / 1000),
                                    }, 'buy order out of time')
                                    item.previous.buy = item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false);
                                }
                            } else {
                                let is_insert = false;
                                for (let k = 0; k < item.previous.sell.length; k++) {
                                    if (item.previous.sell[k].time === o.time && item.previous.sell[k].price === o.price) {
                                        log.warn('order duplicate skipped')
                                        return fill_order_recur(index + 1);
                                    } else if (o.price > item.previous.sell[k].price) {
                                        item.previous.sell.splice(k, 0, {
                                            price: o.price,
                                            time: o.time,
                                        });
                                        is_insert = true;
                                        break;
                                    }
                                }
                                if (!is_insert) {
                                    item.previous.sell.push({
                                        price: o.price,
                                        time: o.time,
                                    });
                                }
                                if ((o.starttime + TWSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                    if (o.fake) {
                                        item.previous = {
                                            price: o.price,
                                            tprice: item.previous.tprice ? 0 : item.previous.price,
                                            time: item.previous.time,
                                            type: 'sell',
                                            sell: item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            buy: item.previous.buy,
                                            //real: false,
                                        }
                                    } else {
                                        let profit = 0;
                                        if (typeof o.profit === 'string' && typeof o.ptime === 'string') {
                                            const this_profit = o.profit.split('p').filter(i => i);
                                            const this_time = o.ptime.split('t').filter(i => i);
                                            let matchCount = 0;
                                            for (let i = this_profit.length - 1; i >= 0; i--) {
                                                const p = Number(this_profit[i]);
                                                const t = Number(this_time[i]);
                                                for (let k = 0; k < item.previous.sell.length; k++) {
                                                    if (item.previous.sell[k].time === t) {
                                                        matchCount++;
                                                        break;
                                                    }
                                                }
                                                if (matchCount < 2) {
                                                    profit += p;
                                                    while (Number(this_time[i - 1]) === t) {
                                                        profit += Number(this_profit[i - 1]);
                                                        i--;
                                                    }
                                                } else {
                                                    break;
                                                }
                                            }
                                            item.profit += profit * (1 - TRADE_FEE);
                                        }
                                        item.previous = {
                                            price: o.price,
                                            time: o.time,
                                            type: 'sell',
                                            sell: item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            buy: item.previous.buy,
                                            //real: true,
                                        }
                                    }
                                } else {
                                    log.warn({
                                        starttime: o.starttime,
                                        deadline: o.starttime + TWSE_ORDER_INTERVAL,
                                        now: Math.round(new Date().getTime() / 1000),
                                    }, 'sell order out of time')
                                    item.previous.sell = item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false);
                                }
                            }
                            log.debug({ previous: item.previous }, 'updated previous state')
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set: Object.assign({previous: item.previous, profit: item.profit}, o.hasOwnProperty("quantity") ? (o.type === 'Buy') ? {bquantity: o.quantity} : {squantity: o.quantity} : (o.type === 'Buy') ? {boddquantity: o.oddquantity} : {soddquantity: o.oddquantity})}).then(() => fill_order_recur(index + 1));
                        });
                    }
                }
                return fill_order_recur(0);
            });
        } else {
            log.debug('no new fill orders')
            return Promise.resolve();
        }
    }
    return initialBook().then(() => {
        updateTime['trade']++;
        log.info({ tradeCount: updateTime['trade'] }, 'trade cycle tick')
        if (updateTime['trade'] % (Math.ceil(TWSE_ORDER_INTERVAL / PRICE_INTERVAL) - 3) !== 3) {
            return Promise.resolve();
        } else {
            log.info('entering TWSE order submission window')
            //避開交易時間
            const hour = new Date().getHours();
            if (_TWSE_MARKET_TIME[0] > _TWSE_MARKET_TIME[1]) {
                if (hour >= _TWSE_MARKET_TIME[0] || hour < _TWSE_MARKET_TIME[1]) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    return Promise.resolve();
                }
            } else if (hour >= _TWSE_MARKET_TIME[0] && hour < _TWSE_MARKET_TIME[1]) {
                updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                return Promise.resolve();
            }
        }
        return Mongo('find', TOTALDB, {setype: 'twse', sType: {$exists: false}}).then(items => {
            const newOrder = [];
            const twseSuggestion = getSuggestionData('twse');
            log.debug({ twseSuggestion }, 'suggestion data')
            let isSubmit = false;
            const recur_status = index => {
                if (index >= items.length) {
                    return Promise.resolve();
                } else {
                    const item = items[index];
                    if (item.index === 0 || !twseSuggestion[item.index]) {
                        return recur_status(index + 1);
                    }
                    const price = twseSuggestion[item.index].price;
                    //market cap multiple
                    if (item.mul) {
                        item.orig = item.orig * item.mul;
                        item.times = Math.floor(item.times * item.mul);
                    }
                    log.debug({ item }, 'evaluating stock item')
                    const startStatus = () => {
                        isSubmit = true;
                        if (twseSuggestion[item.index]) {
                            newOrder.push({item, suggestion: twseSuggestion[item.index]});
                        }
                        return recur_status(index + 1);
                    }
                    if (item.ing === 2) {
                        const delTotal = () => Mongo('deleteMany', TOTALDB, {_id: item._id}).then(() => recur_status(index + 1));
                        return sellallShioajiOrder(item.index, false).catch(err => {
                            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                            log.error({ err }, 'sellall shioaji error')
                            return handleError(new HoError('Shioaji python error!!!'));
                        }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000)).then(() => delTotal()));
                    } else if (item.ing === 1) {
                        if (price) {
                            return startStatus();
                        } else {
                            return recur_status(index + 1);
                        }
                    } else {
                        const negBounds = item.web.filter(v => v < 0);
                        const sigma1Up = negBounds.length >= 3 ? -negBounds[2] : item.mid * 2;
                        if (price < sigma1Up) {
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}}).then(result => {
                                if (price) {
                                    return startStatus();
                                } else {
                                    return recur_status(index + 1);
                                }
                            });
                        } else {
                            log.debug({ price, sigma1Up, mid: item.mid }, 'enter_mid: price above 1σ')
                            return recur_status(index + 1);
                        }
                    }
                }
            }
            const submitTwseOrder = () => {
                if (isSubmit) {
                    // §6c Conviction-weighted sort: 50% invested market value + 50% conviction (1/extrem)
                    if (newOrder.length > 1) {
                        const marketVal = e => Math.abs(e.item.count || 0) * (e.suggestion.price || 0);
                        const maxMarketVal = Math.max(...newOrder.map(marketVal)) || 1;
                        const maxConviction = Math.max(...newOrder.map(e => e.item.extrem ? 1 / e.item.extrem : 0)) || 1;
                        newOrder.sort((a, b) => {
                            const aMV = marketVal(a) / maxMarketVal;
                            const bMV = marketVal(b) / maxMarketVal;
                            const aConv = (a.item.extrem ? 1 / a.item.extrem : 0) / maxConviction;
                            const bConv = (b.item.extrem ? 1 / b.item.extrem : 0) / maxConviction;
                            return (0.5 * bMV + 0.5 * bConv) - (0.5 * aMV + 0.5 * aConv);
                        });
                    }
                    return submitShioajiOrder(newOrder, false).catch(err => {
                        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                        log.error({ err }, 'submit shioaji order error')
                        return handleError(new HoError('Shioaji python error!!!'));
                    });
                } else {
                    return Promise.resolve();
                }
            }
            return recur_status(0).then(() => submitTwseOrder());
        });
    });
}

const getShioajiData = (simulation = true) => {
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_APIKEY;
    const pw = simulation ? '2222' : SHIOAJI_APISECRET;
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        log.debug({ output }, 'shioaji python raw output')
        const result = output.split('\n');
        log.debug({ result }, 'parsed result lines')
        let start_result = 0;
        const ret = {};
        for (let i = 0; i < result.length; i++) {
            if (!start_result) {
                if (result[i] === 'start result') {
                    start_result = 1;
                }
            } else if (start_result === 1) {
                if (result[i] !== 'same') {
                    available = Number(result[i]);
                }
                start_result = 2;
            } else if (start_result === 2) {
                ret.position = [...position];
                position = JSON.parse(result[i]);
                start_result = 3;
            } else if (start_result === 3) {
                order = JSON.parse(result[i]);
                start_result = 4;
            } else if (start_result === 4) {
                ret.fill_order = JSON.parse(result[i]);
                break;
            }
        }
        return ret;
    });
}

const submitShioajiOrder = (submitList, simulation = true) => {
    fakeOrder = [];
    let list = '';
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_APIKEY;
    const pw = simulation ? '2222' : SHIOAJI_APISECRET;
    const ca = simulation ? '2222' : SHIOAJI_CA;
    const capw = simulation ? '2222' : SHIOAJI_CAPW;
    submitList.forEach(s => {
        list = `${list} ${s.item.index}=`;
        if (s.suggestion.bCount) {
            list = `${list}buy${s.suggestion.bCount}=${s.suggestion.buy}`;
        } else if (s.suggestion.buy) {
            fakeOrder.push({
                type: 'buy',
                time: Math.round(new Date().getTime() / 1000),
                price: s.suggestion.buy,
                symbol: s.item.index,
            });
        }
        if (s.suggestion.sCount) {
            list = `${list}sell${s.suggestion.sCount}=${s.suggestion.sell}`;
        } else if (s.suggestion.sell) {
            fakeOrder.push({
                type: 'sell',
                time: Math.round(new Date().getTime() / 1000),
                price: s.suggestion.sell,
                symbol: s.item.index,
            });
        }
    });
    log.info({ list }, 'submitting shioaji order')
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw} submit ${ca} ${capw} ${TRADE_FEE} ${list}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        log.debug({ output }, 'submit order output')
    });
}

const sellallShioajiOrder = (index, simulation = true) => {
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_APIKEY;
    const pw = simulation ? '2222' : SHIOAJI_APISECRET;
    const ca = simulation ? '2222' : SHIOAJI_CA;
    const capw = simulation ? '2222' : SHIOAJI_CAPW;
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw} sellall ${ca} ${capw} ${index}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        log.debug({ output }, 'sellall order output')
    });
}

export const getTwsePosition = () => {
    let is_exist = false;
    for (let i = 0; i < position.length; i++) {
        if (position[i].symbol === 0) {
            is_exist = true;
            break;
        }
    }
    if (!is_exist) {
        position.push({
            symbol: 0,
            amount: 1,
            price: available,
        });
    }
    return position;
}

export const getTwseOrder = () => order;

export const resetShioaji = () => {
    log.info('shioaji state reset')
    const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = trade_count;
}
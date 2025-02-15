import { SHIOAJI_APIKEY, SHIOAJI_APISECRET, SHIOAJI_CA, SHIOAJI_CAPW } from '../../../ver.js'
import { __dirname, TRADE_FEE, UPDATE_ORDER, TOTALDB, RANGE_INTERVAL, TWSE_ORDER_INTERVAL, TWSE_MARKET_TIME, PRICE_INTERVAL, API_WAIT, TWSE_ENTER_MID } from '../constants.js'
import pathModule from 'path'
const { join: PathJoin } = pathModule;
import Child_process from 'child_process'
import { getSuggestionData } from '../models/stock-tool.js'
import { handleError, HoError } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'

let updateTime = {book: 0, trade: 0};
let available = 0;
let order = [];
let position = [];
let fakeOrder = [];

export const twseShioajiInit = () => {
    const initialBook = (force = false) => {
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            console.log(updateTime['book']);
            return getShioajiData(false).catch(err => {
                if (force === true) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                }
                console.log(err);
                return handleError(new HoError('Shioaji python error!!!'));
            }).then(ret => {
                //console.log(ret);
                //console.log(available);
                //console.log(order);
                //console.log(position);
                const twseSuggestion = getSuggestionData('twse');
                console.log('fakeOrder shioaji');
                console.log(fakeOrder);
                fakeOrder.forEach(o => {
                    if (!o.done && o.type === 'buy' && twseSuggestion[o.symbol].price && twseSuggestion[o.symbol].price <= o.price) {
                        o.done = true;
                        console.log('fake order close');
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
                        console.log('fake order close');
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
                        console.log(o);
                        if (o.price <= 0) {
                            return fill_order_recur(index + 1);
                        }
                        let profit = 0;
                        return Mongo('find', TOTALDB, {setype: 'twse', index: o.symbol}).then(items => {
                            if (items.length < 1) {
                                console.log(`miss ${o.symbol}`);
                                return fill_order_recur(index + 1);
                            }
                            const item = items[0];
                            if (o.type === 'Buy') {
                                let is_insert = false;
                                for (let k = 0; k < item.previous.buy.length; k++) {
                                    if (item.previous.buy[k].time === o.time && item.previous.buy[k].price === o.price) {
                                        console.log('s order duplicate');
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
                                            time: o.time,
                                            type: 'buy',
                                            buy: item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            sell: item.previous.sell,
                                        }
                                    } else {
                                        item.previous = {
                                            price: o.price,
                                            time: o.time,
                                            type: 'buy',
                                            buy: item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            sell: item.previous.sell,
                                        }
                                    }
                                } else {
                                    console.log('s out of time');
                                    console.log(o.starttime);
                                    console.log(o.starttime + TWSE_ORDER_INTERVAL);
                                    console.log(Math.round(new Date().getTime() / 1000));
                                    item.previous.buy = item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false);
                                }
                            } else {
                                let is_insert = false;
                                for (let k = 0; k < item.previous.sell.length; k++) {
                                    if (item.previous.sell[k].time === o.time && item.previous.sell[k].price === o.price) {
                                        console.log('s order duplicate');
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
                                            time: o.time,
                                            type: 'sell',
                                            sell: item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            buy: item.previous.buy,
                                        }
                                    } else {
                                        item.previous = {
                                            price: o.price,
                                            time: o.time,
                                            type: 'sell',
                                            sell: item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                            buy: item.previous.buy,
                                        }
                                    }
                                } else {
                                    console.log('s out of time');
                                    console.log(o.starttime);
                                    console.log(o.starttime + TWSE_ORDER_INTERVAL);
                                    console.log(Math.round(new Date().getTime() / 1000));
                                    item.previous.sell = item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false);
                                }
                                //calculate profit
                                console.log(ret.position);
                                console.log(position);
                                if (!o.fake && ret.position.length > 0) {
                                    let pp = 0;
                                    let cp = 0;
                                    let pa = 0;
                                    let peq = false;
                                    for (let i = 0; i < ret.position.length; i++) {
                                        if (ret.position[i].symbol === item.index) {
                                            pa = ret.position[i].amount;
                                            pp = ret.position[i].amount * ret.position[i].price;
                                            break;
                                        }
                                    }
                                    if (pp !== 0) {
                                        for (let i = 0; i < position.length; i++) {
                                            if (position[i].symbol === item.index) {
                                                if (pa === position[i].amount) {
                                                    peq = true;
                                                }
                                                cp = position[i].amount * position[i].price;
                                                break;
                                            }
                                        }
                                        console.log(pp);
                                        console.log(cp);
                                        if (!peq) {
                                            const this_profit = o.profit.split('p').filter(i => i);
                                            const this_time = o.ptime.split('t').filter(i => i);
                                            is_insert = 0;
                                            for (let i = this_profit.length - 1; i >= 0; i--) {
                                                const p = Number(this_profit[i]);
                                                const t = Number(this_time[i]);
                                                for (let k = 0; k < item.previous.sell.length; k++) {
                                                    if (item.previous.sell[k].time === t) {
                                                        is_insert++;
                                                        break;
                                                    }
                                                }
                                                if (is_insert < 2) {
                                                    profit = profit + p * (1 - TRADE_FEE);
                                                    while (Number(this_time[i - 1]) === t) {
                                                        profit = profit + Number(this_profit[i - 1]) * (1 - TRADE_FEE);
                                                        i--;
                                                    }
                                                } else {
                                                    break;
                                                }
                                            }
                                            profit = profit - pp + cp;
                                        }
                                        console.log(profit);
                                    }
                                }
                            }
                            item.profit = item.profit ? item.profit + profit : profit;
                            console.log(item.previous);
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set: Object.assign({previous: item.previous, profit: item.profit}, o.hasOwnProperty("quantity") ? (o.type === 'Buy') ? {bquantity: o.quantity} : {squantity: o.quantity} : (o.type === 'Buy') ? {boddquantity: o.oddquantity} : {soddquantity: o.oddquantity})}).then(() => fill_order_recur(index + 1));
                        });
                    }
                }
                return fill_order_recur(0);
            });
        } else {
            console.log('Shioaji no new');
            return Promise.resolve();
        }
    }
    return initialBook().then(() => {
        updateTime['trade']++;
        console.log(`shioaji ${updateTime['trade']}`);
        if (updateTime['trade'] % (Math.ceil(TWSE_ORDER_INTERVAL / PRICE_INTERVAL) - 3) !== 3) {
            return Promise.resolve();
        } else {
            console.log('twse time');
            //避開交易時間
            const hour = new Date().getHours();
            if (TWSE_MARKET_TIME[0] > TWSE_MARKET_TIME[1]) {
                if (hour >= TWSE_MARKET_TIME[0] || hour < TWSE_MARKET_TIME[1]) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    return Promise.resolve();
                }
            } else if (hour >= TWSE_MARKET_TIME[0] && hour < TWSE_MARKET_TIME[1]) {
                updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                return Promise.resolve();
            }
        }
        return Mongo('find', TOTALDB, {setype: 'twse', sType: {$exists: false}}).then(items => {
            const newOrder = [];
            const twseSuggestion = getSuggestionData('twse');
            console.log(twseSuggestion);
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
                    console.log(item);
                    const startStatus = () => {
                        isSubmit = true;
                        if (twseSuggestion[item.index]) {
                            let is_insert = false;
                            for (let i = 0; i < newOrder.length; i++) {
                                if (item.amount > newOrder[i].item.amount) {
                                    newOrder.splice(i, 0, {item, suggestion: twseSuggestion[item.index]});
                                    is_insert = true;
                                    break;
                                }
                            }
                            if (!is_insert) {
                                newOrder.push({item, suggestion: twseSuggestion[item.index]});
                            }
                        }
                        return recur_status(index + 1);
                    }
                    if (item.ing === 2) {
                        const delTotal = () => Mongo('deleteMany', TOTALDB, {_id: item._id}).then(() => recur_status(index + 1));
                        return sellallShioajiOrder(item.index, false).catch(err => {
                            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                            console.log(err);
                            return handleError(new HoError('Shioaji python error!!!'));
                        }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000)).then(() => delTotal()));
                    } else if (item.ing === 1) {
                        if (price) {
                            return startStatus();
                        } else {
                            return recur_status(index + 1);
                        }
                    } else {
                        if ((price - item.mid) / item.mid * 100 < TWSE_ENTER_MID) {
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}}).then(result => {
                                if (price) {
                                    return startStatus();
                                } else {
                                    return recur_status(index + 1);
                                }
                            });
                        } else {
                            console.log('enter_mid');
                            console.log((price - item.mid) / item.mid * 100);
                            return recur_status(index + 1);
                        }
                    }
                }
            }
            const submitTwseOrder = () => {
                if (isSubmit) {
                    return submitShioajiOrder(newOrder, false).catch(err => {
                        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                        console.log(err);
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
        console.log(output);
        const result = output.split('\n');
        console.log(result);
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
        //console.log(cash);
        //console.log(position);
        //console.log(order);
        //console.log(fill_order);
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
    console.log(list);
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw} submit ${ca} ${capw} ${TRADE_FEE} ${list}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        console.log(output);
    });
}

const sellallShioajiOrder = (index, simulation = true) => {
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_APIKEY;
    const pw = simulation ? '2222' : SHIOAJI_APISECRET;
    const ca = simulation ? '2222' : SHIOAJI_CA;
    const capw = simulation ? '2222' : SHIOAJI_CAPW;
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw} sellall ${ca} ${capw} ${index}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        console.log(output);
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
    console.log('Shioaji reset');
    const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = trade_count;
}
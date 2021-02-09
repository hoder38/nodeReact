import { SHIOAJI_ID, SHIOAJI_PW, SHIOAJI_CA, SHIOAJI_CAPW } from '../../../ver.js'
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
let processedOrder = [];

export const twseShioajiInit = () => {
    const initialBook = (force = false) => {
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            console.log(updateTime['book']);
            return getShioajiData(false).catch(err => {
                updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                console.log(err);
                return handleError(new HoError('Shioaji python error!!!'));
            }).then(ret => {
                //console.log(ret);
                //console.log(available);
                //console.log(order);
                //console.log(position);
                const fill_order_recur = index => {
                    if (index >= ret.fill_order.length) {
                        return Promise.resolve();
                    } else {
                        const o = ret.fill_order[index];
                        if (processedOrder.indexOf(o.id) === -1) {
                            console.log(o);
                            processedOrder.push(o.id);
                            if (o.profit <= 0) {
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
                                    if (item.previous.buy[0] && item.previous.buy[0].time === o.time && item.previous.buy[0].price === o.price) {
                                        return fill_order_recur(index + 1);
                                    }
                                    let is_insert = false;
                                    for (let k = 0; k < item.previous.buy.length; k++) {
                                        if (o.price < item.previous.buy[k].price) {
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
                                    item.previous = {
                                        price: o.price,
                                        time: o.time,
                                        type: 'buy',
                                        buy: item.previous.buy.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                        sell: item.previous.sell,
                                    }
                                } else {
                                    if (item.previous.sell[0] && item.previous.sell[0].time === o.time && item.previous.sell[0].price === o.price) {
                                        return fill_order_recur(index + 1);
                                    }
                                    let is_insert = false;
                                    for (let k = 0; k < item.previous.sell.length; k++) {
                                        if (o.price > item.previous.sell[k].price) {
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
                                    item.previous = {
                                        price: o.price,
                                        time: o.time,
                                        type: 'sell',
                                        sell: item.previous.sell.filter(v => (o.time - v.time < RANGE_INTERVAL) ? true : false),
                                        buy: item.previous.buy,
                                    }
                                    //calculate profit
                                    console.log(ret.position);
                                    console.log(position);
                                    if (ret.position.length > 0) {
                                        let pp = 0;
                                        let cp = 0;
                                        for (let i = 0; i < ret.position.length; i++) {
                                            if (ret.position[i].symbol === item.index) {
                                                pp = ret.position[i].amount * ret.position[i].price;
                                                break;
                                            }
                                        }
                                        if (pp !== 0) {
                                            for (let i = 0; i < position.length; i++) {
                                                if (position[i].symbol === item.index) {
                                                    cp = position[i].amount * position[i].price;
                                                    break;
                                                }
                                            }
                                            console.log(pp);
                                            console.log(cp);
                                            profit = o.profit * (1 - TRADE_FEE) - pp + cp;
                                            console.log(profit);
                                        }
                                    }
                                }
                                item.profit = item.profit ? item.profit + profit : profit;
                                return Mongo('update', TOTALDB, {_id: item._id}, {$set: {previous: item.previous, profit: item.profit}}).then(() => fill_order_recur(index + 1));
                            });
                        } else {
                            return fill_order_recur(index + 1);
                        }
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
        if (updateTime['trade'] % Math.ceil(TWSE_ORDER_INTERVAL / PRICE_INTERVAL) !== Math.floor(1800 / PRICE_INTERVAL)) {
            return Promise.resolve();
        } else {
            console.log('twse time');
            //避開交易時間
            const hour = new Date().getHours();
            if (TWSE_MARKET_TIME[0] > TWSE_MARKET_TIME[1]) {
                if (hour > TWSE_MARKET_TIME[0] || hour < TWSE_MARKET_TIME[1]) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    return Promise.resolve();
                }
            } else if (hour > TWSE_MARKET_TIME[0] && hour < TWSE_MARKET_TIME[1]) {
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
                    console.log(item);
                    const startStatus = () => {
                        isSubmit = true;
                        if (twseSuggestion[item.index]) {
                            let is_insert = false;
                            for (let i = 0; i < newOrder.length; i++) {
                                if (item.orig > newOrder[i].item.orig) {
                                    newOrder.splice(i, 0, {index: item.index, suggestion: twseSuggestion[item.index]});
                                    is_insert = true;
                                    break;
                                }
                            }
                            if (!is_insert) {
                                newOrder.push({index: item.index, suggestion: twseSuggestion[item.index]});
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
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_ID;
    const pw = simulation ? '2222' : SHIOAJI_PW;
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
                available = Number(result[i]);
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
    let list = '';
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_ID;
    const pw = simulation ? '2222' : SHIOAJI_PW;
    const ca = simulation ? '2222' : SHIOAJI_CA;
    const capw = simulation ? '2222' : SHIOAJI_CAPW;
    submitList.forEach(s => {
        list = `${list} ${s.index}=`;
        if (s.suggestion.bCount) {
            list = `${list}buy${s.suggestion.bCount}=${s.suggestion.buy}`;
        }
        if (s.suggestion.sCount) {
            list = `${list}sell${s.suggestion.sCount}=${s.suggestion.sell}`;
        }
    });
    console.log(list);
    return new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/twse.py')} ${id} ${pw} submit ${ca} ${capw} ${TRADE_FEE} ${list}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        console.log(output);
    });
}

const sellallShioajiOrder = (index, simulation = true) => {
    const id = simulation ? 'PAPIUSER02' : SHIOAJI_ID;
    const pw = simulation ? '2222' : SHIOAJI_PW;
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
    //if (update) {
    //const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = 0;
}
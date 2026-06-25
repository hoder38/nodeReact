import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver.js'
import { BITFINEX_EXP, BITFINEX_MIN, DISTRIBUTION, OFFER_MAX, RISK_MAX, SUPPORT_COIN, USERDB, BITNIFEX_PARENT, FUSD_SYM, FUSDT_SYM, FETH_SYM, FBTC_SYM, FLTC_SYM, FDOT_SYM, FSOL_SYM, FADA_SYM, FXRP_SYM, FAVAX_SYM, FTRX_SYM, FUNI_SYM, EXTREM_RATE_NUMBER, EXTREM_DURATION, UPDATE_BOOK, UPDATE_ORDER, UPDATE_FILL_ORDER, SUPPORT_PAIR, MINIMAL_OFFER, SUPPORT_PRICE, MAX_RATE, BITFINEX_FEE, BITFINEX_INTERVAL, RANGE_BITFINEX_INTERVAL, TOTALDB, ORDER_INTERVAL, SUPPORT_LEVERAGE, RATE_INTERVAL, API_WAIT, MAX_NEWMID_STACK, EMERGENCY_STOP_THRESHOLD, MERGE_RATE_TOLERANCE } from '../constants.js'
import BFX from 'bitfinex-api-node'
import Fetch from 'node-fetch'
import bfxApiNodeModels from 'bfx-api-node-models'
const { FundingOffer, Order } = bfxApiNodeModels;
import { calStair, stockProcess, stockTest, logArray, computeBinCount, resolveNewMidStack, scaleWebArr } from '../models/stock-tool.js'
import Mongo from '../models/mongo-tool.js'
import Redis from '../models/redis-tool.js'
import Api from './api-tool.js'
import { handleError, HoError, isValidString } from '../util/utility.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js';
const log = createLogger('bitfinex');

// Exchange-level Bitfinex clients and market snapshots shared across all users.
let bfx = new BFX({ apiKey: BITFINEX_KEY, apiSecret: BITFINEX_SECRET });
let rest = bfx.rest(2, { transform: true });
let finalRate = {};
let maxRange = {};
let currentRate = {};
let priceData = {};

// Per-user runtime state keyed by user id.
let userWs = {};
let userOk = {};
let updateTime = {};
let extremRate = {};

let available = {};
let margin = {};

let offer = {};
let order = {};
const deleteOffer = [];
const deleteOrder = [];
const fakeOrder = {};

let credit = {};
const closeCredit = {};
let ledger = {};
let position = {};

// Underscore-prefixed exports are test seams, not part of the production API.
/**
 * Replace the shared Bitfinex client used by the module.
 *
 * @param {Object} newBfx Mock or real BFX instance with a `rest()` factory.
 * @returns {void}
 */
export const _setSystemBfx = (newBfx) => {
    bfx = newBfx;
    rest = newBfx.rest(2, { transform: true });
};

/**
 * Return the current shared REST client.
 *
 * @returns {Object} Bitfinex REST v2 client.
 */
export const _getSystemRest = () => rest;

/**
 * Clear all module-scoped caches so each test starts from a clean state.
 *
 * @returns {void}
 */
export const _resetState = () => {
    finalRate = {};
    maxRange = {};
    currentRate = {};
    priceData = {};
    userWs = {};
    userOk = {};
    updateTime = {};
    extremRate = {};
    available = {};
    margin = {};
    offer = {};
    order = {};
    deleteOffer.length = 0;
    deleteOrder.length = 0;
    Object.keys(fakeOrder).forEach(k => delete fakeOrder[k]);
    credit = {};
    Object.keys(closeCredit).forEach(k => delete closeCredit[k]);
    ledger = {};
    position = {};
};

/**
 * Snapshot the current module-scoped state for assertions in unit tests.
 *
 * @returns {Object} References to the current shared state containers.
 */
export const _getState = () => ({
    finalRate, maxRange, currentRate, priceData,
    userWs, userOk, updateTime, extremRate,
    available, margin, offer, order,
    deleteOffer, deleteOrder, fakeOrder,
    credit, closeCredit, ledger, position,
});

/**
 * Merge selected state fragments into the current module-scoped caches.
 *
 * @param {Object} partial Partial state tree to merge into the shared module state.
 * @returns {void}
 */
export const _setState = (partial) => {
    if (partial.priceData) priceData = { ...priceData, ...partial.priceData };
    if (partial.currentRate) currentRate = { ...currentRate, ...partial.currentRate };
    if (partial.finalRate) finalRate = { ...finalRate, ...partial.finalRate };
    if (partial.maxRange) maxRange = { ...maxRange, ...partial.maxRange };
    if (partial.updateTime) updateTime = { ...updateTime, ...partial.updateTime };
    if (partial.userWs) userWs = { ...userWs, ...partial.userWs };
    if (partial.userOk) userOk = { ...userOk, ...partial.userOk };
    if (partial.available) available = { ...available, ...partial.available };
    if (partial.margin) margin = { ...margin, ...partial.margin };
    if (partial.offer) offer = { ...offer, ...partial.offer };
    if (partial.order) order = { ...order, ...partial.order };
    if (partial.credit) credit = { ...credit, ...partial.credit };
    if (partial.position) position = { ...position, ...partial.position };
    if (partial.ledger) ledger = { ...ledger, ...partial.ledger };
    if (partial.extremRate) extremRate = { ...extremRate, ...partial.extremRate };
    if (partial.closeCredit) {
        Object.keys(partial.closeCredit).forEach(k => { closeCredit[k] = partial.closeCredit[k]; });
    }
    if (partial.fakeOrder) {
        Object.keys(partial.fakeOrder).forEach(k => { fakeOrder[k] = partial.fakeOrder[k]; });
    }
};

/**
 * Rebuild funding-rate buckets and supporting spot-price snapshots for supported coins.
 *
 * @param {string[]} curArr Funding symbols to refresh.
 * @returns {Promise<void>} Resolves after the cached rates are updated and the Bitfinex WS refresh is emitted.
 */
export const calRate = curArr => {
    // Refresh spot reference data first so later web/risk calculations can reuse the latest prices.
    const recurPrice = index => {
        if (index >= SUPPORT_PRICE.length) {
            return Promise.resolve();
        } else {
            return rest.ticker(SUPPORT_PRICE[index]).then(ticker => {
                if (ticker && ticker.lastPrice) {
                    return Redis('hgetall', `bitfinex: ${SUPPORT_PRICE[index]}`).then(item => {
                        priceData[SUPPORT_PRICE[index]] = {
                            dailyChange: ticker.dailyChangePerc * 100,
                            lastPrice: ticker.lastPrice,
                            time: Math.round(new Date().getTime() / 1000),
                            str: item ? item.str : '',
                            str2: priceData[SUPPORT_PRICE[index]] && priceData[SUPPORT_PRICE[index]].str2 ? priceData[SUPPORT_PRICE[index]].str2 : '',
                        }
                        return recurPrice(index + 1);
                    });
                } else {
                    return recurPrice(index + 1);
                }
            });
        }
    }
    const singleCal = (curType, index) => rest.ticker(curType).then(curTicker => rest.orderBook(curType, 'P0', 100).then(orderBooks => {
        currentRate[curType] = {
            rate: curTicker.lastPrice * BITFINEX_EXP,
            time: Math.round(new Date().getTime() / 1000),
            frr: curTicker.frr * BITFINEX_EXP,
        };
        const hl = [];
        const weight = [];
        return rest.candles({symbol: curType, timeframe: '1m', period: 'p2', query: {limit: 1440}}).then(entries => {
            // Build expanding lookback windows plus price-bucketed volume for the percentile ladder.
            const calHL = (start, end, startHigh = -1, startLow = -1, vol = 0) => {
                for (let i = start; i < end; i++) {
                    if (!entries[i]) {
                        break;
                    }
                    const high = entries[i]['high'] * BITFINEX_EXP;
                    const low = entries[i]['low'] * BITFINEX_EXP;
                    const wi = Math.floor(high / BITFINEX_MIN);
                    weight[wi] = weight[wi] ? weight[wi] + entries[i].volume : entries[i].volume;
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
            // Translate the live funding order book into percentile checkpoints matching DISTRIBUTION.
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
                // R1: pad to 11 elements so finalRate map never indexes undefined
                const fill = rate.length > 0 ? rate[rate.length - 1] : 0;
                while (rate.length < 11) rate.push(fill);
                return rate.reverse();
            }
            // Convert the 24h candle distribution into the same 11 checkpoints used by the order book.
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
                // R2: pad to 11 elements so maxRange/finalRate never index undefined
                const fill = rate.length > 0 ? rate[rate.length - 1] : 0;
                while (rate.length < 11) rate.push(fill);
                return rate.reverse();
            }
            const OBRate = calOBRate(orderBooks);
            const tenthRate = calTenthRate(hl, weight);
            maxRange[curType] = tenthRate[1] - tenthRate[9];
            // Use the more conservative of historical distribution vs. live book, then cap below MAX_RATE.
            finalRate[curType] = tenthRate.map((v, k) => (v > OBRate[k] || !OBRate[k]) ? (v - 1) : (OBRate[k] - 1));
            finalRate[curType] = finalRate[curType].map(v => (v >= MAX_RATE) ? MAX_RATE - 1 : v);
            log.debug({ curType, rate: finalRate[curType], OBRate, tenthRate }, 'lending rate computed');
        });
    }));
    const recurType = index => (index >= curArr.length) ? Promise.resolve(sendWs({
            type: 'bitfinex',
            data: 0,
        })) : (SUPPORT_COIN.indexOf(curArr[index]) !== -1) ? singleCal(curArr[index], index).then(() => recurType(index + 1)) : recurType(index + 1);
    return recurPrice(0).then(() => recurType(0));
}

/**
 * Build the Bitfinex web arrays from 6h candles and persist the derived strategy metadata.
 *
 * @param {string[]} curArr Funding pairs to analyze.
 * @returns {Promise<void>} Resolves after TOTALDB webs and user multipliers are refreshed.
 */
export const calWeb = curArr => {
    const recurType = index => (index >= curArr.length) ? Promise.resolve() : (SUPPORT_PAIR[FUSD_SYM].indexOf(curArr[index]) !== -1) ? singleCal(curArr[index], index).then(() => recurType(index + 1)) : recurType(index + 1);
    const singleCal = (curType, index) => rest.candles({symbol: curType, timeframe: '6h', query: {limit: 3600}}).then(entries => {
        let max = 0;
        let min = 0;
        let min_vol = 0;
        // Convert OHLCV candles into the compact shape expected by the web/backtest helpers.
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
        log.debug({ max, min, min_vol }, 'price range');
        const bins = computeBinCount(raw_arr, 0, 240 * 3);
        const loga = logArray(max, min, bins);
        const web = calStair(raw_arr, loga, min, 0, BITFINEX_FEE, 240 * 3);
        log.debug({ web }, 'computed web');
        const results = [];
        let lastest_type = 0;
        let lastest_rate = 0;
        const pricePct = Math.round((+priceData[curType].lastPrice - web.mid) / web.mid * 10000) / 100;
        // One segmented backtest per pType. lastest_type is chosen from the same result
        // (G10 returnPct); a second pass is no longer needed since start/reverse/len
        // are superseded and both calls would return identical results.
        const resultShow = type => {
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, RANGE_BITFINEX_INTERVAL, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, 1)).then(temp => {
                if (temp === 'data miss') {
                    return;
                }
                const m = temp.metrics;
                const s = temp.summary;
                if (!s || (s.avgReturnAnnualPct === 0 && m.sellTrade === 0 && m.stopLoss === 0)) {
                    results.push({ type, str: 'no less than mid point', metrics: null, rate: -Infinity });
                    return;
                }
                // 6-field string: pricePct% avgReturnAnnualPct% avgBuyHoldPct% avgSortino avgProfitFactor maxDrawdownPct%
                const str = `${pricePct}% ${s.avgReturnAnnualPct}% ${s.avgBuyHoldPct}% ${s.avgSortino} ${s.avgProfitFactor} ${s.maxDrawdownPct}%`;
                results.push({ type, str, metrics: m, rate: s.avgReturnAnnualPct });
                if (m.returnPct !== 0 || m.sellTrade !== 0 || m.stopLoss !== 0) {
                    if (!lastest_rate || m.returnPct > lastest_rate) {
                        lastest_rate = m.returnPct;
                        lastest_type = type;
                    }
                }
            });
        }
        const loopShow = index => {
            if (index >= 0) {
                return resultShow(index).then(() => loopShow(index - 1));
            } else {
                return Promise.resolve();
            }
        }
        return loopShow(0).then(() => {
            const sorted = results.filter(r => r.metrics);
            sorted.sort((a, b) => b.rate - a.rate);
            // Persist the middle profitable candidate instead of the single top outlier to reduce overfitting.
            const bestIdx = sorted.length > 0 ? Math.ceil(sorted.length / 2) - 1 : -1;
            const bestStr = bestIdx >= 0 ? sorted[bestIdx].str : 'no less than mid point';
            const bestMetrics = bestIdx >= 0 ? sorted[bestIdx].metrics : null;
            results.forEach(r => log.debug({ str: r.str }, 'backtest result'));
            log.debug({ lastest_type }, 'backtest done');
            Redis('hmset', `bitfinex: ${curArr[index]}`, {
                str: bestStr,
            }).catch(err => handleError(err, 'Redis'));
            const updateWeb = () => Mongo('find', TOTALDB, {index: curArr[index]}).then(item => {
                log.debug({ item }, 'web update result');
                if (item.length < 1) {
                    return Mongo('insert', TOTALDB, {
                        sType: 1,
                        index: curArr[index],
                        name: curArr[index].substr(1),
                        type: FUSD_SYM,
                        web: web.arr,
                        wType: lastest_type,
                        mid: web.mid,
                        extrem: web.extrem,
                        metrics: bestMetrics,
                    }).then(items => log.debug({ items }, 'times update result'));
                } else {
                    const recur_update = async () => {
                        for (let i = 0; i < item.length; i++) {
                            if (!item[i].owner) {
                                const items = await Mongo('update', TOTALDB, {_id: item[i]._id}, {$set: {
                                    web: web.arr,
                                    wType: lastest_type,
                                    mid: web.mid,
                                    extrem: web.extrem,
                                    metrics: bestMetrics,
                                }});
                                log.debug({ items }, 'buy fill update result');
                            } else {
                                // User-owned entries also need `times` rescaled to the refreshed web capacity.
                                const maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                                const items = await Mongo('update', TOTALDB, {_id: item[i]._id}, {$set: {
                                    web: web.arr,
                                    wType: lastest_type,
                                    mid: web.mid,
                                    extrem: web.extrem,
                                    metrics: bestMetrics,
                                    times: Math.floor(item[i].orig / maxAmount * 10000) / 10000,
                                    newMid: [],
                                }});
                                log.debug({ items }, 'sell fill update result');
                            }
                        }
                    }
                    return recur_update();
                }
            });
            return updateWeb();
        });
    });
    const coinList = SUPPORT_COIN.map(v => v.replace('f', '')).join(',');
    log.info({ coinList }, 'supported coin list');
    // After the webs are refreshed, update each user's size multiplier from market-cap rank and volatility.
    return recurType(0).then(() => Fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${coinList}&convert=USD`, {
        method: 'GET',
        headers: {
            'X-CMC_PRO_API_KEY': '7e49886e256b4612b431fb7915dafc1b',
            'Accept': 'application/json'}
        }).then(res => res.json()).then(data => {
        return Mongo('find', USERDB, {bitfinex: {$exists: true}}).then(userlist => {
            const recurUser = uIndex => (uIndex < userlist.length) ? Mongo('find', TOTALDB, {owner: userlist[uIndex]._id, sType: 1, type: FUSD_SYM}).then(items => {
                const mcList = [];
                items.forEach(i => {
                    const sym = i.name.match(/^([\da-zA-Z]+)\:?USD$/);
                    if (sym && data.data[sym[1]]) {
                        mcList.push({_id: i._id, mc: data.data[sym[1]].quote.USD.market_cap, extrem: i.extrem});
                    }
                });
                mcList.sort((a, b) => {
                    if (a.mc < b.mc) {
                        return 1;
                    } else if (a.mc > b.mc) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                if (mcList.length > 2) {
                    const mcMiddle = Math.round(mcList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        const mul = mcList[i].mc / mcList[mcMiddle].mc;
                        mcList[i].mul = (mul > 5) ? 5 : mul;
                    }
                }
                log.debug({ mcList }, 'marketcap list');
                // §9b Volatility-normalized position size: mul = mcMul + volMul, cap at 5, default = 1
                const updmul = mIndex => (mIndex < mcList.length) ? (() => {
                    const volValue = 1 + Math.max(0, 1 - (mcList[mIndex].extrem || 0) / 0.4);
                    const mcMul = mcList[mIndex].mul || 1;
                    const finalMul = (mcMul > volValue) ? mcMul : volValue;
                    return Mongo('update', TOTALDB, {_id: mcList[mIndex]._id}, {$set: {mul: finalMul > 5 ? 5 : finalMul}});
                })().then(mitems => {
                    log.debug({ mitems }, 'mul update result');
                    return updmul(mIndex + 1);
                }) : Promise.resolve();
                return updmul(0).then(() => recurUser(uIndex + 1));
            }) : Promise.resolve();
            return recurUser(0);
        });
    }));
}

/**
 * Update an item's previous-trade ledger after a REST-reported fill and persist it.
 *
 * @param {number} amount Signed fill amount; positive = buy, negative = sell.
 * @param {number} price Fill price.
 * @param {number|string} oid Exchange order id used for duplicate detection.
 * @param {number} time Fill timestamp in seconds.
 * @param {Object} item TOTALDB item whose `previous` ledger will be updated.
 * @param {boolean} fake Whether the fill is synthetic and should preserve the original trade time.
 * @returns {Promise<Object|void>} Mongo update promise, or a resolved promise when the fill is a duplicate.
 */
export const processOrderRest = (amount, price, oid, time, item, fake) => {
    const tradeType = amount > 0 ? 'buy' : 'sell';
    if (tradeType === 'buy') {
        let is_insert = false;
        for (let k = 0; k < item.previous.buy.length; k++) {
            if (item.previous.buy[k].price === price && (oid && item.previous.buy[k].id === oid)) {
                log.warn('buy order duplicate');
                return Promise.resolve();
            } else if (price < item.previous.buy[k].price) {
                // Keep buy fills sorted from low to high so downstream range checks stay deterministic.
                item.previous.buy.splice(k, 0, {price, time, id: oid});
                is_insert = true;
                break;
            }
        }
        if (!is_insert) {
            item.previous.buy.push({price, time, id: oid});
        }
        if (fake) {
            item.previous = {
                price,
                tprice: item.previous.tprice ? 0 : item.previous.price,
                time: item.previous.time,
                type: 'buy',
                // Fake fills keep the original timestamp while trimming historical buys to the replay window.
                buy: item.previous.buy.filter(v => (time - v.time < RANGE_BITFINEX_INTERVAL) ? true : false),
                sell: item.previous.sell,
            }
        } else {
            if (item.profit) {
                item.profit -= amount * price;
            } else {
                item.profit = -amount * price;
            }
            item.previous = {
                price,
                time,
                type: 'buy',
                buy: item.previous.buy.filter(v => (time - v.time < RANGE_BITFINEX_INTERVAL) ? true : false),
                sell: item.previous.sell,
            }
        }
    } else if (tradeType === 'sell') {
        let is_insert = false;
        for (let k = 0; k < item.previous.sell.length; k++) {
            if (item.previous.sell[k].price === price && (oid && item.previous.sell[k].id === oid)) {
                log.warn('sell order duplicate');
                return Promise.resolve();
            } else if (price > item.previous.sell[k].price) {
                // Keep sell fills sorted from high to low for the same price-ladder comparisons.
                item.previous.sell.splice(k, 0, {price, time, id: oid});
                is_insert = true;
                break;
            }
        }
        if (!is_insert) {
            item.previous.sell.push({price, time, id: oid});
        }
        if (fake) {
            item.previous = {
                price,
                tprice: item.previous.tprice ? 0 : item.previous.price,
                time: item.previous.time,
                type: 'sell',
                // Fake fills keep the original timestamp while trimming historical sells to the replay window.
                sell: item.previous.sell.filter(v => (time - v.time < RANGE_BITFINEX_INTERVAL) ? true : false),
                buy: item.previous.buy,
            }
        } else {
            if (item.profit) {
                item.profit -= amount * price * (1 - BITFINEX_FEE);
            } else {
                item.profit = -amount * price * (1 - BITFINEX_FEE);
            }
            item.previous = {
                price,
                time,
                type: 'sell',
                sell: item.previous.sell.filter(v => (time - v.time < RANGE_BITFINEX_INTERVAL) ? true : false),
                buy: item.previous.buy,
            }
        }
    }
    return Mongo('update', TOTALDB, {_id: item._id}, {$set: {
        previous: item.previous,
        profit: item.profit,
    }});
};

/**
 * Check whether a risk bucket already exists in any candidate order list.
 *
 * @param {number} risk Risk bucket to search for.
 * @param {...Object[]} arr Candidate arrays containing entries with a `risk` field.
 * @returns {boolean} True when the risk bucket is already present.
 */
export const checkRisk = (risk, ...arr) => {
    // Risk values below 1 are treated as disabled sentinels and should never match.
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
};

/**
 * Close and drain any queued funding credits for a user.
 *
 * @param {string} id User id key for the module-scoped close queue.
 * @param {Object} userRest User-scoped Bitfinex REST client.
 * @returns {Promise<void>}
 */
export const closeRestCredit = async (id, userRest) => {
    if (closeCredit[id] && closeCredit[id].length > 0) {
        log.debug({ credits: closeCredit[id] }, 'credits to close');
        // Snapshot and clear the queue first so concurrently added ids wait for the next pass.
        const close_id = closeCredit[id].splice(0, closeCredit[id].length);
        for (let i = 0; i < close_id.length; i++) {
            const result = await userRest.closeFunding({id: Number(close_id[i])});
            log.debug({ result }, 'credit close result');
        }
    }
};

// WebSocket event handler factories that bind per-user identifiers to module-scoped caches.
// ---------------------------------------------------------------------------

/**
 * Sync a wallet payload into the funding or margin cache for one user.
 * Funding and margin balances feed different UI panels, so the handler keeps
 * separate caches and emits distinct WebSocket update codes for each bucket.
 */
export const makeOnWalletUpdate = (id) => wallet => {
    SUPPORT_COIN.forEach((t, i) => {
        if (wallet.currency === t.substr(1)) {
            // Funding balances back lendable funds, while margin balances back open positions.
            if (wallet.type === 'funding') {
                available[id][t] = {
                    avail: wallet.balanceAvailable,
                    time: Math.round(new Date().getTime() / 1000),
                    total: wallet.balance,
                };
                sendWs({type: 'bitfinex', data: (i+1) * 10000, user: id});
            } else if (wallet.type === 'margin') {
                if (margin[id][t]) {
                    margin[id][t]['avail'] = wallet.balanceAvailable;
                    margin[id][t]['time'] = Math.round(new Date().getTime() / 1000);
                    margin[id][t]['total'] = wallet.balance;
                } else {
                    margin[id][t] = {
                        avail: wallet.balanceAvailable,
                        time: Math.round(new Date().getTime() / 1000),
                        total: wallet.balance,
                    };
                }
                sendWs({type: 'bitfinex', data: (i+1) * 100, user: id});
            }
        }
    });
};

/**
 * Update an existing funding offer in the in-memory cache.
 * WebSocket broadcasts are throttled so rapid order-book churn does not flood clients.
 */
export const makeOnFundingOfferUpdate = (id) => fo => {
    if (SUPPORT_COIN.indexOf(fo.symbol) === -1) return;
    if (!offer[id][fo.symbol]) offer[id][fo.symbol] = [];
    for (let j = 0; j < offer[id][fo.symbol].length; j++) {
        if (offer[id][fo.symbol][j].id === fo.id) {
            offer[id][fo.symbol][j].amount = fo.amount;
            offer[id][fo.symbol][j].rate = fo.rate;
            offer[id][fo.symbol][j].period = fo.period;
            offer[id][fo.symbol][j].status = fo.status;
            break;
        }
    }
    const now = Math.round(new Date().getTime() / 1000);
    // Offer updates can arrive in bursts, so only push a refresh after the debounce window.
    if ((now - updateTime[id]['offer']) > UPDATE_ORDER) {
        updateTime[id]['offer'] = now;
        sendWs({type: 'bitfinex', data: -1, user: id});
    }
};

/**
 * Insert a new funding offer, or refresh the timestamp/status if Bitfinex replays it.
 */
export const makeOnFundingOfferNew = (id) => fo => {
    if (SUPPORT_COIN.indexOf(fo.symbol) === -1) return;
    log.info({ symbol: fo.symbol, id }, 'funding offer new');
    if (!offer[id][fo.symbol]) offer[id][fo.symbol] = [];
    // Reconnects can replay a "new" event for an offer we already cached.
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
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Remove a funding offer from the cache when Bitfinex marks it closed.
 */
export const makeOnFundingOfferClose = (id) => fo => {
    if (SUPPORT_COIN.indexOf(fo.symbol) === -1) return;
    log.info({ symbol: fo.symbol, id }, 'funding offer close');
    if (offer[id][fo.symbol]) {
        let is_exist = false;
        for (let j = 0; j < offer[id][fo.symbol].length; j++) {
            if (offer[id][fo.symbol][j].id === fo.id) {
                offer[id][fo.symbol].splice(j, 1);
                is_exist = true;
                break;
            }
        }
        if (!is_exist) {
            // Close events can win the race against the local cache; keep a short tombstone list
            // so later reconciliation does not resurrect an already-closed offer.
            deleteOffer.push(fo.id);
            // Keep the tombstone buffer bounded even if the exchange emits a long close burst.
            if (deleteOffer.length > OFFER_MAX * 5) {
                deleteOffer.splice(0, deleteOffer.length - OFFER_MAX * 5);
            }
        }
    }
};

/**
 * Update an existing funding credit entry without rebuilding the whole credit snapshot.
 */
export const makeOnFundingCreditUpdate = (id) => fc => {
    if (SUPPORT_COIN.indexOf(fc.symbol) === -1) return;
    if (!credit[id][fc.symbol]) credit[id][fc.symbol] = [];
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
    // Credits also refresh frequently, so reuse the same throttled push pattern as offers/orders.
    if ((now - updateTime[id]['credit']) > UPDATE_ORDER) {
        updateTime[id]['credit'] = now;
        sendWs({type: 'bitfinex', data: -1, user: id});
    }
};

/**
 * Append a newly opened funding credit and immediately refresh the client view.
 */
export const makeOnFundingCreditNew = (id) => fc => {
    if (SUPPORT_COIN.indexOf(fc.symbol) === -1) return;
    if (!credit[id][fc.symbol]) credit[id][fc.symbol] = [];
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
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Remove a funding credit once Bitfinex reports it as closed.
 */
export const makeOnFundingCreditClose = (id) => fc => {
    if (SUPPORT_COIN.indexOf(fc.symbol) === -1) return;
    if (credit[id][fc.symbol]) {
        for (let j = 0; j < credit[id][fc.symbol].length; j++) {
            if (credit[id][fc.symbol][j].id === fc.id) {
                credit[id][fc.symbol].splice(j, 1);
                break;
            }
        }
    }
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Update an open position and keep it grouped by the funding currency bucket.
 */
export const makeOnPositionUpdate = (id) => fc => {
    // Positions come through as trading pairs (for example tBTCUSD); normalize them to fUSD/fBTC buckets.
    const symbol = `f${fc.symbol.substr(-3)}`;
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    if (!position[id][symbol]) position[id][symbol] = [];
    for (let j = 0; j < position[id][symbol].length; j++) {
        if (position[id][symbol][j].id === fc.id) {
            position[id][symbol][j].amount = fc.amount;
            position[id][symbol][j].symbol = fc.symbol;
            position[id][symbol][j].price = Math.round(fc.basePrice * 1000) / 1000;
            if (fc.lp) {
                position[id][symbol][j].lp = Math.round(fc.liquidationPrice * 1000) / 1000;
            }
            // Bitfinex sometimes sends a falsy pl on incremental updates; keep the last known value in that case.
            if (!fc.pl) {
                log.warn({ fc }, 'position pl is null');
            } else {
                position[id][symbol][j].pl = fc.pl;
            }
            break;
        }
    }
    const now = Math.round(new Date().getTime() / 1000);
    // Position marks can move rapidly, so debounce downstream refreshes.
    if ((now - updateTime[id]['position']) > UPDATE_ORDER) {
        updateTime[id]['position'] = now;
        sendWs({type: 'bitfinex', data: -1, user: id});
    }
};

/**
 * Cache a newly opened position so later update/close events can reconcile against it.
 */
export const makeOnPositionNew = (id) => fc => {
    log.debug({ fc }, 'position new');
    const symbol = `f${fc.symbol.substr(-3)}`;
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    if (!position[id][symbol]) position[id][symbol] = [];
    position[id][symbol].push({
        id: fc.id,
        time: Math.round(fc.mtsCreate / 1000),
        amount: fc.amount,
        symbol: fc.symbol,
        price: Math.round(fc.basePrice * 1000) / 1000,
        lp: Math.round(fc.liquidationPrice * 1000) / 1000,
        pl: fc.pl,
    });
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Remove a closed position and fold its realized P/L back into the paired TOTALDB record.
 */
export const makeOnPositionClose = (id, curArr, uid) => fc => {
    // Close payloads also arrive as trading pairs, so normalize before looking up cached positions.
    const symbol = `f${fc.symbol.substr(-3)}`;
    log.debug({ fc }, 'position close');
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    if (position[id][symbol]) {
        for (let j = 0; j < position[id][symbol].length; j++) {
            if (position[id][symbol][j].id === fc.id) {
                const lastP = position[id][symbol].splice(j, 1);
                log.debug({ lastP }, 'last position profit');
                // Match the closed position back to the configured pair so realized profit stays in sync.
                /*for (let i = 0; i < curArr.length; i++) {
                    if (curArr[i].type === symbol && curArr[i].pair) {
                        for (let k = 0; k < curArr[i].pair.length; k++) {
                            if (curArr[i].pair[k].type === fc.symbol) {
                                Mongo('find', TOTALDB, {owner: uid, sType: 1, index: fc.symbol}).then(items => {
                                    log.debug({ items }, 'TOTALDB lookup');
                                    if (items.length < 1) {
                                        return handleError(new HoError(`miss ${fc.symbol}`));
                                    }
                                    const profit = items[0].profit ? items[0].profit + Number(lastP[0].pl) : Number(lastP[0].pl);
                                    log.debug({ profit }, 'realized profit');
                                    // Mirror the persisted profit in the margin cache used by the UI.
                                    margin[id][`f${items[0].index.substr(-3)}`][items[0].index] = profit;
                                    return Mongo('update', TOTALDB, {_id: items[0]._id}, {$set : {profit}}).then(result => {
                                        log.debug({ result }, 'profit update result');
                                    });
                                }).catch(err => {
                                    sendWs(`${id} Position close Error: ${err.message||err.msg}`, 0, 0, true);
                                    handleError(err, `${id} Position close Error`);
                                });
                                break;
                            }
                        }
                        break;
                    }
                }*/
                break;
            }
        }
    }
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Update an active order in place and throttle downstream refreshes.
 */
export const makeOnOrderUpdate = (id) => os => {
    const symbol = `f${os.symbol.substr(-3)}`;
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    if (!order[id][symbol]) order[id][symbol] = [];
    for (let j = 0; j < order[id][symbol].length; j++) {
        if (order[id][symbol][j].id === os.id) {
            order[id][symbol][j].time = Math.round(os.mtsCreate / 1000);
            order[id][symbol][j].amount = os.amountOrig;
            order[id][symbol][j].type = os.type;
            order[id][symbol][j].symbol = os.symbol;
            order[id][symbol][j].price = os.price;
            order[id][symbol][j].flags = os.flags;
            order[id][symbol][j].status = os.status;
            break;
        }
    }
    const now = Math.round(new Date().getTime() / 1000);
    // Orders can churn quickly during partial fills, so debounce UI refreshes here too.
    if ((now - updateTime[id]['order']) > UPDATE_ORDER) {
        updateTime[id]['order'] = now;
        sendWs({type: 'bitfinex', data: -1, user: id});
    }
};

/**
 * Cache a newly opened order, or refresh the timestamp if the exchange replays the event.
 */
export const makeOnOrderNew = (id) => os => {
    const symbol = `f${os.symbol.substr(-3)}`;
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    log.info({ symbol, id, order: os }, 'order new');
    if (!order[id][symbol]) order[id][symbol] = [];
    // Bitfinex can resend the same order-open event after reconnects, so dedupe by id.
    let isExist = false;
    for (let i = 0; i < order[id][symbol].length; i++) {
        if (os.id === order[id][symbol][i].id) {
            order[id][symbol][i].time = Math.round(os.mtsCreate / 1000);
            isExist = true;
            break;
        }
    }
    if (!isExist) {
        order[id][symbol].push({
            id: os.id,
            time: Math.round(os.mtsCreate / 1000),
            amount: os.amountOrig,
            type: os.type,
            symbol: os.symbol,
            price: os.price,
            flags: os.flags,
            status: os.status,
        });
    }
    sendWs({type: 'bitfinex', data: -1, user: id});
};

/**
 * Remove a closed order and reconcile executed quantity back into TOTALDB when needed.
 */
export const makeOnOrderClose = (id, curArr, uid) => os => {
    const symbol = `f${os.symbol.substr(-3)}`;
    if (SUPPORT_COIN.indexOf(symbol) === -1) return;
    log.info({ symbol, id, order: os }, 'order close');
    let is_exist = false;
    if (order[id][symbol]) {
        for (let j = 0; j < order[id][symbol].length; j++) {
            if (order[id][symbol][j].id === os.id) {
                log.debug({ orderId: os.id }, 'deleting cached order');
                is_exist = true;
                order[id][symbol].splice(j, 1);
                break;
            }
        }
    }
    if (!is_exist) {
        // If the order is already gone from the local cache, preserve the executed delta for later cleanup.
        const amount = (os.amountOrig - os.amount < 0) ? (1 - BITFINEX_FEE) * (os.amountOrig - os.amount) : os.amountOrig - os.amount;
        if (amount !== 0) {
            deleteOrder.push({
                id: os.id,
                amount,
                price: os.price,
                process: (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) ? true : false,
            });
        }
    }
    // Only recent non-exchange closes feed TOTALDB; older events have already been reconciled elsewhere.
    if ((Math.round(os.mtsCreate / 1000) + ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000) && !os.type.includes('EXCHANGE') && (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE'))) {
        for (let i = 0; i < curArr.length; i++) {
            if (curArr[i].type === symbol && curArr[i].pair) {
                for (let j = 0; j < curArr[i].pair.length; j++) {
                    if (curArr[i].pair[j].type === os.symbol) {
                        log.info({ symbol: os.symbol }, 'order executed');
                        const amount = (os.amountOrig - os.amount < 0) ? (1 - BITFINEX_FEE) * (os.amountOrig - os.amount) : os.amountOrig - os.amount;
                        if (amount !== 0) {
                            Mongo('find', TOTALDB, {owner: uid, sType: 1, index: os.symbol}).then(items => {
                                log.debug({ items }, 'order history TOTALDB items');
                                if (items.length < 1) {
                                    return handleError(new HoError(`miss ${os.symbol}`));
                                }
                                return processOrderRest(amount, os.price, os.id, Math.round(os.mtsUpdate / 1000), items[0]);
                            }).catch(err => {
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
};

/**
 * Refresh the full REST snapshot for wallets, offers, credits, orders, and positions.
 * This is the recovery path after startup/reconnect, so each collection is rebuilt from
 * Bitfinex data and then swapped into the per-user caches in one pass.
 */
export const initialBookFn = (id, userRest) => {
    const now = Math.round(new Date().getTime() / 1000);
    // Skip the expensive REST bootstrap unless the cached snapshot is stale.
    if ((now - updateTime[id]['book']) > UPDATE_BOOK) {
        updateTime[id]['book'] = now;
        return userRest.wallets().then(wallet => {
            wallet.forEach(w => {
                const symbol = `f${w.currency}`;
                if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                    if (w.type === 'funding') {
                        available[id][symbol] = {
                            avail: w.balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: w.balance,
                        };
                    } else if (w.type === 'margin') {
                        if (margin[id][symbol]) {
                            margin[id][symbol]['avail'] = w.balanceAvailable;
                            margin[id][symbol]['time'] = Math.round(new Date().getTime() / 1000);
                            margin[id][symbol]['total'] = w.balance;
                        } else {
                            margin[id][symbol] = {
                                avail: w.balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: w.balance,
                            };
                        }
                    }
                }
            });
        }).then(() => userRest.fundingOffers('')).then(fos => {
            // Rebuild the offer map from scratch so reconnects do not append duplicate entries.
            const risk = {};
            const temp = {};
            fos.forEach(v => {
                if (SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                    if (!temp[v.symbol]) {
                        temp[v.symbol] = [];
                        risk[v.symbol] = RISK_MAX;
                    }
                    temp[v.symbol].push({
                        id: v.id,
                        time: Math.round(v.mtsCreate / 1000),
                        amount: v.amount,
                        rate: v.rate,
                        period: v.period,
                        status: v.status,
                        // Risk starts with the first RISK_MAX offers and then stays floored so the UI
                        // still gets a deterministic value once the countdown has been exhausted.
                        risk: risk[v.symbol] > 0 ? risk[v.symbol]-- : (OFFER_MAX > RISK_MAX ? OFFER_MAX - RISK_MAX : 0),
                    });
                }
            });
            offer[id] = temp;
        }).then(() => userRest.fundingCredits('')).then(fcs => {
            // Replace the credit cache atomically so websocket deltas apply to a clean baseline.
            const temp = {};
            fcs.forEach(v => {
                if (SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                    if (!temp[v.symbol]) temp[v.symbol] = [];
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
            // Active orders are rebuilt by symbol bucket because later handlers mutate them in place.
            const temp = {};
            os.forEach(v => {
                const symbol = `f${v.symbol.substr(-3)}`;
                if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                    if (!temp[symbol]) temp[symbol] = [];
                    temp[symbol].push({
                        id: v.id,
                        time: Math.round(v.mtsCreate / 1000),
                        amount: v.amountOrig,
                        symbol: v.symbol,
                        type: v.type,
                        price: v.price,
                        flags: v.flags,
                        status: v.status,
                    });
                }
            });
            order[id] = temp;
        }).then(() => userRest.positions()).then(ps => {
            // Positions are also rebuilt from scratch to realign websocket state after reconnects.
            const temp = {};
            ps.forEach(v => {
                const symbol = `f${v.symbol.substr(-3)}`;
                if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                    if (!temp[symbol]) temp[symbol] = [];
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
            sendWs({type: 'bitfinex', data: -1, user: id});
        });
    } else {
        log.debug('no new orders to submit');
        return Promise.resolve();
    }
};

/**
 * Recompute pending orders for one TOTALDB item batch and return the new order payloads.
 * The helper is kept at module scope so tests can drive the reconciliation logic directly.
 */
export const _recur_status = async ({ id, uid, current, userRest, items }) => {
    const newOrder = [];
    fakeOrder[id][current.type] = [];

    for (let idx = 0; idx < items.length; idx++) {
        let item = items[idx];
        // Recompute the working bankroll from persisted fields on every pass so
        // prior loop mutations do not leak into the next iteration.
        if (item.mul) {
            item.orig = item.orig * item.mul;
            item.times = Math.floor(item.times * item.mul * 10000) / 10000;
        }
        margin[id][current.type][item.index] = item.profit;
        log.debug({ margin: margin[id] }, 'margin state');
        const clearP = (current.clear === true || current.clear[item.index] === true) ? true : false;
        // Reset the live position snapshot before folding in the current holdings.
        item.count = 0;
        //item.pricecost = 0;
        //item.pl = 0;
        if (item.profit) {
            item.orig += item.profit;
        }
        item.amount = item.orig;
        // Unrealized P/L is treated as deployable capital for the next decision.
        /*if (position[id][current.type]) {
            position[id][current.type].forEach(v => {
                if (v.symbol === item.index) {
                    item.orig += v.pl;
                    item.pl += v.pl;
                }
            });
        }*/
        // Holdings reduce remaining cash and preserve the latest entry cost for stockProcess().
        if (position[id][current.type]) {
            position[id][current.type].forEach(v => {
                if (v.symbol === item.index) {
                    item.orig += (v.amount * (+priceData[item.index].lastPrice));
                    item.count += v.amount;
                    //item.amount = item.amount - v.amount * v.price;
                    //item.pricecost = v.price;
                }
            });
        }

        if (item.orig < 1000) {
            item.orig = 1000;
        }
        log.debug({ item }, 'recur_status item');

        const cancelOrder = async () => {
            if (order[id][current.type]) {
                // Only cancel strategy-owned orders for this symbol; EXCHANGE orders are managed elsewhere.
                const real_id = order[id][current.type].filter(v => (v.symbol === item.index && !v.type.includes('EXCHANGE')));
                log.debug({ real_id }, 'real order ids');
                for (const entry of real_id) {
                    // Leave partial fills alone so the loop does not immediately re-open them.
                    if (entry.status && entry.status.includes('PARTIALLY FILLED')) continue;
                    await userRest.cancelOrder(entry.id);
                    await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                }
            } else {
                order[id][current.type] = [];
            }
        };

        const startStatus = async () => {
            // Re-read before trading so this pass uses the latest persisted ladder state.
            const nitem = await Mongo('find', TOTALDB, {_id: item._id});
            if (nitem.length < 1) {
                return handleError(new HoError(`miss ${item.index}`));
            }
            item = nitem[0];
            if (item.mul) {
                item.orig = item.orig * item.mul;
                item.times = Math.floor(item.times * item.mul * 10000) / 10000;
            }
            item.count = 0;
            //item.pricecost = 0;
            //item.pl = 0;
            if (item.profit) {
                item.orig += item.profit;
            }
            item.amount = item.orig;
            /*if (position[id][current.type]) {
                position[id][current.type].forEach(v => {
                    if (v.symbol === item.index) {
                        item.orig += v.pl;
                        item.pl += v.pl;
                    }
                });
            }*/
            if (position[id][current.type]) {
                position[id][current.type].forEach(v => {
                    if (v.symbol === item.index) {
                        item.orig += (v.amount * (+priceData[item.index].lastPrice));
                        item.count += v.amount;
                        //item.amount = item.amount - v.amount * v.price;
                        //item.pricecost = v.price;
                    }
                });
            }
            if (item.orig < 1000) {
                item.orig = 1000;
            }
            // Apply the pending newMid stack before asking stockProcess() for the next ladder action.
            let newArr = resolveNewMidStack(item.newMid, +priceData[item.index].lastPrice, item.mid, item.web, (nm) => {
                log.debug({ nm }, 'newMid check');
            });
            let suggestion = stockProcess(+priceData[item.index].lastPrice, newArr, item.times, item.previous, item.orig, clearP ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 1, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, undefined, item.newMid.length);
            const processResetWeb = (recalcCount) => {
                if (!suggestion.resetWeb) return Promise.resolve();
                item.newMid.push(suggestion.newMid);
                // A deep newMid stack means price has lived outside the original web for too long.
                // Rebuild from candles when possible so §6c continues from a fresh ladder instead of
                // endlessly shifting the old one.
                if (item.newMid.length >= MAX_NEWMID_STACK) {
                    recalcCount++;
                    if (recalcCount > 2) {
                        item.newMid = [];
                        newArr = item.web;
                        return Promise.resolve();
                    }
                    return rest.candles({symbol: item.index, timeframe: '6h', query: {limit: 3600}}).then(entries => {
                        if (entries && entries.length > 0) {
                            let cMax = 0, cMin = 0;
                            const raw_arr = entries.map(v => {
                                if (!cMax || cMax < v.high) cMax = v.high;
                                if (!cMin || cMin > v.low) cMin = v.low;
                                return { h: v.high, l: v.low, v: v.volume };
                            });
                            let fraction = 2;
                            let recalcWeb = null;
                            // Retry with progressively shorter windows until calStair() finds a stable web.
                            while (fraction <= 8) {
                                const halfLen = Math.max(Math.floor(raw_arr.length / fraction), 20);
                                const bins = computeBinCount(raw_arr, 0, halfLen);
                                const loga = logArray(cMax, cMin, bins);
                                recalcWeb = calStair(raw_arr, loga, cMin, 0, BITFINEX_FEE, halfLen);
                                if (recalcWeb) break;
                                fraction *= 2;
                            }
                            if (recalcWeb) {
                                item.mid = recalcWeb.mid;
                                item.web = recalcWeb.arr;
                                item.newMid = [];
                                newArr = item.web;
                            } else {
                                // Fall back to scaling the existing ladder to the newest shifted midpoint.
                                const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                                item.mid = item.newMid[item.newMid.length - 1];
                                item.web = item.web.map(v => v * ratio);
                                item.newMid = [];
                                newArr = item.web;
                            }
                        } else {
                            // No candles returned: preserve spacing by applying the same midpoint ratio.
                            const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                            item.mid = item.newMid[item.newMid.length - 1];
                            item.web = item.web.map(v => v * ratio);
                            item.newMid = [];
                            newArr = item.web;
                        }
                        suggestion = stockProcess(+priceData[item.index].lastPrice, newArr, item.times, item.previous, item.orig, clearP ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 1, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, undefined, item.newMid.length);
                        return processResetWeb(recalcCount);
                    }).catch(() => {
                        // On candle fetch failure, keep trading with a rescaled ladder instead of aborting the loop.
                        const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                        item.mid = item.newMid[item.newMid.length - 1];
                        item.web = item.web.map(v => v * ratio);
                        item.newMid = [];
                        newArr = item.web;
                        suggestion = stockProcess(+priceData[item.index].lastPrice, newArr, item.times, item.previous, item.orig, clearP ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 1, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, undefined, item.newMid.length);
                        return processResetWeb(recalcCount);
                    });
                } else {
                    newArr = scaleWebArr(item.newMid, item.mid, item.web);
                }
                suggestion = stockProcess(+priceData[item.index].lastPrice, newArr, item.times, item.previous, item.orig, clearP ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 1, BITFINEX_FEE, BITFINEX_INTERVAL, BITFINEX_INTERVAL, undefined, item.newMid.length);
                return processResetWeb(recalcCount);
            };
            await processResetWeb(0);
            // §9a Kelly Criterion: boost trade count when kelly > 50%
            if (item.metrics && item.metrics.winRate > 0 && item.metrics.avgLoss > 0) {
                const p = item.metrics.winRate / 100;
                const b = item.metrics.avgWin / item.metrics.avgLoss;
                const kelly = p - (1 - p) / b;
                if (kelly > 0.5) {
                    if (suggestion.buy > 0) suggestion.bCount++;
                    if (suggestion.sell > 0) suggestion.sCount++;
                }
            }
            let count = 0;
            let amount = clearP ? 0 : item.amount;
            // When the shifted midpoint sits below the base mid, preserve extra cash only down to the
            // target band; anything above that can still add ladder buys.
            if (item.newMid.length > 0 && item.newMid[item.newMid.length - 1] <= item.mid) {
                if (suggestion.buy > 0 && amount > item.orig * 5 / 8) {
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
            } else if (item.newMid.length <= 0) {
                if (suggestion.buy > 0) {
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
                }
            }
            count = 0;
            amount = item.amount;
            // Mirror the buy-side guardrails when price has shifted above mid: sell only until the
            // account returns to the target cash band for the current ladder state.
            if (item.newMid.length > 0 && item.newMid[item.newMid.length - 1] >= item.mid) {
                if (suggestion.sell > 0 && amount < item.orig * 3 / 8) {
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
            } else if (item.newMid.length <= 0) {
                // Without a shifted stack, suggestion.type determines which sell target band applies.
                if (suggestion.sell > 0) {
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
                }
            }
            log.debug({ suggestion }, 'trade suggestion');
            priceData[item.index].str2 = suggestion.str;
            // Clamp the staged counts to what the current position size and cash balance can actually fill.
            if (item.count < suggestion.sCount * 4 / 3) {
                suggestion.sCount = item.count;
            }
            if (item.amount < suggestion.bCount * suggestion.buy * 4 / 3) {
                if (item.amount < suggestion.bCount * suggestion.buy * 2 / 3) {
                    suggestion.bCount = 0;
                    suggestion.buy = 0;
                } else {
                    suggestion.bCount = (item.amount < 0) ? 0 : Math.floor(item.amount / suggestion.buy * 10000) / 10000;
                }
            }
            // Persist any ladder recalculation before the later order-submission phase reads newOrder.
            await Mongo('update', TOTALDB, {_id: item._id}, {$set : {
                newMid: item.newMid,
                mid: item.mid,
                web: item.web,
                previous: item.previous,
            }});
            newOrder.push({item, suggestion});
        };

        // ing=2 means unwind now: cancel resting orders, market-close leftovers, then remove the item.
        if (item.ing === 2) {
            const delTotal = async () => {
                await Mongo('deleteMany', TOTALDB, {_id: item._id});
            };
            await cancelOrder();
            if (item.count > 0) {
                const or = new Order({
                    cid: Date.now(),
                    type: 'MARKET',
                    symbol: item.index,
                    amount: -item.count,
                    flags: 1024,
                }, userRest);
                await or.submit();
                await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                // Keep the local order cache in sync without re-adding entries already seen or queued for deletion.
                let isExist = false;
                for (let i = 0; i < order[id][current.type].length; i++) {
                    if (or[0].id === order[id][current.type][i].id) {
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    let isDelete = false;
                    for (let i = 0; i < deleteOrder.length; i++) {
                        if (deleteOrder[i].id === or[0].id) {
                            isDelete = true;
                            deleteOrder.splice(i, 1);
                            break;
                        }
                    }
                    if (!isDelete) {
                        order[id][current.type].push({
                            id: or[0].id,
                            time: Math.round(new Date().getTime() / 1000),
                            amount: or[0].amount,
                            type: or[0].type,
                            symbol: or[0].symbol,
                            price: or[0].price,
                            flags: or[0].flags,
                        });
                    }
                }
            }
            await delTotal();
        } else if (item.ing === 1) {
            // ing=1 is the normal active path: refresh orders and recompute the next suggestion.
            if (+priceData[item.index].lastPrice) {
                await cancelOrder();
                await startStatus();
            }
        } else {
            // ing=0 waits for price to be below 1σ before the strategy is allowed to start trading.
            const negBounds = item.web.filter(v => v < 0);
            const sigma1Up = negBounds.length >= 3 ? -negBounds[2] : item.mid * 2;
            if (+priceData[item.index].lastPrice < sigma1Up) {
                await Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}});
                if (+priceData[item.index].lastPrice) {
                    await cancelOrder();
                    await startStatus();
                }
            } else {
                log.debug({ price: +priceData[item.index].lastPrice, sigma1Up, mid: item.mid }, 'enter_mid: price above 1σ');
            }
        }
    }

    sendWs({
        type: 'bitfinex',
        data: -1,
        user: id,
    });
    // §6c Conviction-weighted sort: 50% invested market value + 50% conviction (1/extrem)
    if (newOrder.length > 1) {
        const marketVal = e => Math.abs(e.item.count || 0) * (priceData[e.item.index] ? +priceData[e.item.index].lastPrice : 0);
        const maxMarketVal = Math.max(...newOrder.map(marketVal)) || 1;
        const maxConviction = Math.max(...newOrder.map(e => e.item.extrem ? 1 / e.item.extrem : 0)) || 1;
        newOrder.sort((a, b) => {
            const aMV = marketVal(a) / maxMarketVal;
            const bMV = marketVal(b) / maxMarketVal;
            const aConviction = (a.item.extrem ? 1 / a.item.extrem : 0) / maxConviction;
            const bConviction = (b.item.extrem ? 1 / b.item.extrem : 0) / maxConviction;
            return (0.5 * bMV + 0.5 * bConviction) - (0.5 * aMV + 0.5 * aConviction);
        });
    }
    // §6d Emergency Stop: when too many active holdings have broken out of their web price range
    // (non-empty newMid stack), zero all buy/sell counts to prevent trading until market stabilizes.
    // Clearing (current.clear) and deleting (ing=2) items are excluded since they are already winding down.
    const activeItems = items.filter(it => it.ing !== 2 && !(current.clear === true || (current.clear && current.clear[it.index] === true)));
    if (activeItems.length > 0) {
        const shiftedCount = activeItems.filter(it => it.newMid && it.newMid.length > 0).length;
        if (shiftedCount > activeItems.length * EMERGENCY_STOP_THRESHOLD / 100) {
            log.warn({ shiftedCount, total: activeItems.length }, 'emergency stop triggered — forcing fakeOrder');
            // Zero out suggestion counts only for non-clearing/non-deleting entries
            newOrder.forEach(entry => {
                if (!entry.item.clear && entry.item.ing !== 2 && !(current.clear === true || (current.clear && current.clear[entry.item.index] === true))) {
                    entry.suggestion.bCount = 0;
                    entry.suggestion.sCount = 0;
                }
            });
        }
    }
    return newOrder;
};

/**
 * Submit the sell leg first and then the buy leg for each suggestion prepared by _recur_status().
 * The queue already reflects §6c sorting and any §6d emergency-stop zeroing before it reaches here.
 */
export const _recur_NewOrder = async ({ id, uid, current, userRest, newOrder }) => {
    for (let idx = 0; idx < newOrder.length; idx++) {
        const item = newOrder[idx].item;
        const suggestion = newOrder[idx].suggestion;

        // ── sell leg ──
        if (suggestion.sCount > 0 && suggestion.sell) {
            log.info({ symbol: item.index, sCount: suggestion.sCount, sell: suggestion.sell }, 'sell order');
            let or = new Order({
                cid: Date.now(),
                type: 'LIMIT',
                symbol: item.index,
                amount: -suggestion.sCount,
                price: suggestion.sell,
                flags: 1024,
            }, userRest);
            try {
                await or.submit();
            } catch (err) {
                const msg = err.message || err.msg;
                if (msg.includes('minimum size')) {
                    or = null;
                } else {
                    throw err;
                }
            }
            await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
            if (or) {
                let isExist = false;
                for (let i = 0; i < order[id][current.type].length; i++) {
                    if (or[0].id === order[id][current.type][i].id) {
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    let isDelete = false;
                    for (let i = 0; i < deleteOrder.length; i++) {
                        if (deleteOrder[i].id === or[0].id) {
                            isDelete = true;
                            const delobj = deleteOrder.splice(i, 1);
                            break;
                        }
                    }
                    if (!isDelete) {
                        order[id][current.type].push({
                            id: or[0].id,
                            time: Math.round(new Date().getTime() / 1000),
                            amount: or[0].amount,
                            type: or[0].type,
                            symbol: or[0].symbol,
                            price: or[0].price,
                            flags: or[0].flags,
                        });
                    }
                }
            }
        } else if (suggestion.sell) {
            fakeOrder[id][current.type].push({
                type: 'sell',
                time: Math.round(new Date().getTime() / 1000),
                price: suggestion.sell,
                symbol: item.index,
            });
        }

        // ── buy leg ──
        if (suggestion.bCount > 0 && suggestion.buy) {
            const wallets = await userRest.wallets();
            for (let i = 0; i < wallets.length; i++){
                if (wallets[i].type === 'margin' && wallets[i].currency === current.type.substr(1)) {
                    if (margin[id][current.type]) {
                        margin[id][current.type]['avail'] = wallets[i].balanceAvailable;
                        margin[id][current.type]['time'] = Math.round(new Date().getTime() / 1000);
                        margin[id][current.type]['total'] = wallets[i].balance;
                    } else {
                        margin[id][current.type] = {
                            avail: wallets[i].balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: wallets[i].balance,
                        };
                    }
                    break;
                }
            }
            log.debug({ margin: margin[id] }, 'margin after sell');
            const order_avail = (margin[id][current.type] && margin[id][current.type].avail && (margin[id][current.type].avail - 1) > 0) ? SUPPORT_LEVERAGE[item.index] ? SUPPORT_LEVERAGE[item.index] * (margin[id][current.type].avail - 1) : margin[id][current.type].avail - 1 : 0;
            if (order_avail < suggestion.bCount * suggestion.buy * 4 / 3) {
                if (order_avail < suggestion.bCount * suggestion.buy * 2 / 3) {
                    suggestion.bCount = 0;
                    suggestion.buy = 0;
                } else {
                    suggestion.bCount = Math.floor(order_avail / suggestion.buy * 10000) / 10000;
                }
            }
            if (suggestion.bCount > 0 && suggestion.buy) {
                log.info({ symbol: item.index, bCount: suggestion.bCount, buy: suggestion.buy }, 'buy order');
                let or1 = null;
                const submitOrderBuy = async (quotaChk) => {
                    if (quotaChk <= 0) {
                        or1 = null;
                        return;
                    }
                    or1 = new Order({
                        cid: Date.now(),
                        type: 'LIMIT',
                        symbol: item.index,
                        amount: suggestion.bCount * quotaChk / 10,
                        price: suggestion.buy,
                    }, userRest);
                    try {
                        await or1.submit();
                    } catch (err) {
                        const msg = err.message || err.msg;
                        if (msg.includes('not enough tradable balance')) {
                            handleError(err, `${id} Total Updata Error`);
                            await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                            return submitOrderBuy(quotaChk - 1);
                        } else if (msg.includes('minimum size')) {
                            or1 = null;
                            return;
                        } else {
                            throw err;
                        }
                    }
                };
                await submitOrderBuy(10);
                await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                if (or1) {
                    let isExist = false;
                    for (let i = 0; i < order[id][current.type].length; i++) {
                        if (or1[0].id === order[id][current.type][i].id) {
                            isExist = true;
                            break;
                        }
                    }
                    if (!isExist) {
                        let isDelete = false;
                        for (let i = 0; i < deleteOrder.length; i++) {
                            if (deleteOrder[i].id === or1[0].id) {
                                isDelete = true;
                                const delobj = deleteOrder.splice(i, 1);
                                break;
                            }
                        }
                        if (!isDelete) {
                            order[id][current.type].push({
                                id: or1[0].id,
                                time: Math.round(new Date().getTime() / 1000),
                                amount: or1[0].amount,
                                type: or1[0].type,
                                symbol: or1[0].symbol,
                                price: or1[0].price,
                                flags: or1[0].flags,
                            });
                        }
                    }
                }
            } else if (suggestion.buy) {
                fakeOrder[id][current.type].push({
                    type: 'buy',
                    time: Math.round(new Date().getTime() / 1000),
                    price: suggestion.buy,
                    symbol: item.index,
                });
            }
        } else if (suggestion.buy) {
            fakeOrder[id][current.type].push({
                type: 'buy',
                time: Math.round(new Date().getTime() / 1000),
                price: suggestion.buy,
                symbol: item.index,
            });
        }
    }

    sendWs({
        type: 'bitfinex',
        data: -1,
        user: id,
    });
};

/**
 * Coordinate a user's Bitfinex funding/trading session: ensure the authenticated WS exists,
 * refresh wallet/order snapshots, rebalance lending offers, and reconcile trade state.
 */
export const setWsOffer = (id, curArr=[], uid) => {
    // Only keep active configs that have enough data to either lend or drive the trade bot.
    curArr = curArr.filter(v => (v.isActive && ((v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0) || (v.isTrade && v.pair))) ? true : false);
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
        log.error({ id }, 'Bitfinex API key or secret missing');
        sendWs(`${id} Bitfinex Error: Api key or secret Missing`, 0, 0, true);
        return Promise.resolve();
    }
    const userBfx = new BFX({ apiKey: userKey, apiSecret: userSecret });
    const userRest = userBfx.rest(2, { transform: true });
    // Bind the module-level helpers to this user's REST client for the current run.
    const _closeRestCredit = () => closeRestCredit(id, userRest);
    const _processOrderRest = processOrderRest;
    if (!userWs[id] || !userOk[id]) {
        log.info('initializing WebSocket');
        if (!updateTime[id]) {
            updateTime[id] = {};
            updateTime[id]['book'] = 0;
            updateTime[id]['offer'] = 0;
            updateTime[id]['credit'] = 0;
            updateTime[id]['position'] = 0;
            updateTime[id]['order'] = 0;
            updateTime[id]['trade'] = Math.round(new Date().getTime() / 1000) - ORDER_INTERVAL + RATE_INTERVAL * 2;
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
        if (!fakeOrder[id]) {
            fakeOrder[id] = {};
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
            const msg = (err.message||err.msg) ? (err.message||err.msg) : '';
            if (!msg) {
                log.error({ err }, 'WebSocket error');
            }
            if (!msg.includes('auth: dup')) {
                sendWs(`${id} Bitfinex Ws Error: ${msg}`, 0, 0, true);
                handleError(err, `${id} Bitfinex Ws Error`);
            }
        });
        userWs[id].on('open', () => userWs[id].auth());
        userWs[id].once('auth', () => {
            log.info({ id }, 'WebSocket authenticated');
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate({}, makeOnWalletUpdate(id));
        userWs[id].onFundingOfferUpdate({}, makeOnFundingOfferUpdate(id));
        userWs[id].onFundingOfferNew({}, makeOnFundingOfferNew(id));
        userWs[id].onFundingOfferClose({}, makeOnFundingOfferClose(id));
        userWs[id].onFundingCreditUpdate({}, makeOnFundingCreditUpdate(id));
        userWs[id].onFundingCreditNew({}, makeOnFundingCreditNew(id));
        userWs[id].onFundingCreditClose({}, makeOnFundingCreditClose(id));
        userWs[id].onPositionUpdate({}, makeOnPositionUpdate(id));
        userWs[id].onPositionNew({}, makeOnPositionNew(id));
        userWs[id].onPositionClose({}, makeOnPositionClose(id, curArr, uid));
        userWs[id].onOrderUpdate({}, makeOnOrderUpdate(id));
        userWs[id].onOrderNew({}, makeOnOrderNew(id));
        userWs[id].onOrderClose({}, makeOnOrderClose(id, curArr, uid));
        userWs[id].open();
    } else if (!userWs[id].isOpen()) {
        log.info('reconnecting WebSocket');
        if (!updateTime[id]) {
            updateTime[id] = {};
            updateTime[id]['book'] = 0;
            updateTime[id]['offer'] = 0;
            updateTime[id]['credit'] = 0;
            updateTime[id]['position'] = 0;
            updateTime[id]['order'] = 0;
            updateTime[id]['trade'] = Math.round(new Date().getTime() / 1000) - ORDER_INTERVAL + RATE_INTERVAL * 2;
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
        if (!fakeOrder[id]) {
            fakeOrder[id] = {};
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
        userWs[id].reconnect();
    }

    const initialBook = () => initialBookFn(id, userRest);

    // Manage one funding currency: refresh lending offers, recycle stale orders, and trigger
    // any simulated fills that were queued while the trade bot could not place a real order.
    const singleLoan = current => {
        if (current.riskLimit > 0 && current.waitTime > 0 && current.amountLimit > 0) {
        } else {
            return Promise.resolve();
        }
        const needNew = [];
        const needRetain = [];
        const finalNew = [];
        const needDelete = [];
        log.debug({ rate: currentRate[current.type].rate, frr: currentRate[current.type].frr }, 'current lending rate');
        const MR = (current.miniRate > 0) ? current.miniRate / 100 * BITFINEX_EXP : 0;
        const MR2 = (current.keepAmountRate1 > 0) ? current.keepAmountRate1 / 100 * BITFINEX_EXP : 0;
        let KAM = (current.keepAmountMoney1 > 0) ? current.keepAmountMoney1 : 0;
        log.debug({ MR, MR2, KAM }, 'manual rate overrides');
        const DR = [];
        // Keep dynamic-rate tiers sorted from low to high so getDR() can pick the first
        // tenor whose minimum rate is already satisfied by the current offer.
        const pushDR = (rate, day) => {
            if (rate > 0 && day >= 2 && day <= 120) {
                const DRT = {
                    rate: rate / 100 * BITFINEX_EXP,
                    day: day,
                    speed: (day > 30) ? ((210 - day) / 360) : ((58 - day) / 56),
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
        // Track repeated extreme-rate readings so the trade bot can widen or tighten exposure
        // only after a sustained move instead of reacting to a single noisy tick.
        const extremRateCheck = () => {
            if (current.isTrade && current.pair) {
            } else {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 1,
                        low: 0,
                        lowTriggeredAt: 0,
                        highTriggeredAt: 0,
                    }
                }
                return false;
            }
            if (DR.length > 0 && currentRate[current.type].rate > DR[0].rate) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 1,
                        low: 0,
                        lowTriggeredAt: 0,
                        highTriggeredAt: 0,
                    }
                } else {
                    extremRate[id][current.type].high++;
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : (extremRate[id][current.type].low - 1);
                    if (extremRate[id][current.type].high >= EXTREM_RATE_NUMBER) {
                        sendWs(`${id} ${current.type.substr(1)} rate too high!!!` , 0, 0, true);
                        extremRate[id][current.type].highTriggeredAt = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].high = 0;
                    }
                }
            } else if (MR > 0 && currentRate[current.type].rate < MR) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 1,
                        lowTriggeredAt: 0,
                        highTriggeredAt: 0,
                    }
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : (extremRate[id][current.type].high - 1);
                    extremRate[id][current.type].low++;
                    if (extremRate[id][current.type].low >= EXTREM_RATE_NUMBER) {
                        sendWs(`${id} ${current.type.substr(1)} rate too low!!!` , 0, 0, true);
                        extremRate[id][current.type].lowTriggeredAt = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].low = 0;
                    }
                }
            } else {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 0,
                        lowTriggeredAt: 0,
                        highTriggeredAt: 0,
                    }
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : (extremRate[id][current.type].high - 1);
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : (extremRate[id][current.type].low - 1);
                }
            }
        }
        // Refresh funding-wallet cash and reserve the configured keepAmount before sizing offers.
        const calKeepCash = () => userRest.wallets().then(wallet => {
            for (let i = 0; i < wallet.length; i++){
                if (wallet[i].type === 'funding' && wallet[i].currency === current.type.substr(1)) {
                    available[id][current.type] = {
                        avail: wallet[i].balanceAvailable,
                        time: Math.round(new Date().getTime() / 1000),
                        total: wallet[i].balance,
                    }
                    break;
                }
            }
            log.debug({ available: available[id] }, 'funding available');
            const kp = available[id][current.type] ? available[id][current.type].avail : 0;
            return current.keepAmount ? kp - current.keepAmount : kp;
        });
        return calKeepCash().then(keep_available => {
            log.debug({ keep_available }, 'available after reserves');
            const adjustOffer = () => {
                log.debug({ id, type: current.type }, 'processing lending');
                if (offer[id][current.type]) {
                    // L4: snapshot offer array to avoid WS mutation during async phases
                    const offerSnapshot = [...offer[id][current.type]];
                    //produce retain delete
                    offerSnapshot.forEach(v => {
                        if (v.risk === undefined) {
                            log.debug('manual rate mode');
                            return false;
                        }
                        if (keep_available > 1 && v.amount < current.amountLimit) {
                            log.debug({ keep_available, amount: v.amount }, 'offer amount check');
                            const sum = keep_available + v.amount;
                            let newAmount = 0;
                            if (sum <= (current.amountLimit * 1.2)) {
                                keep_available = 0;
                                newAmount = sum;
                            } else {
                                keep_available = sum - current.amountLimit;
                                newAmount = current.amountLimit;
                            }
                            log.debug({ keep_available, newAmount }, 'adjusted offer amount');
                            needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id, newAmount});
                        } else if ((v.rate * BITFINEX_EXP - currentRate[current.type].rate) > maxRange[current.type]) {
                            needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                        } else {
                            const DRT = getDR(v.rate * BITFINEX_EXP);
                            log.debug({ DRT }, 'days to retain');
                            const waitTime = (DRT === false) ? current.waitTime : (DRT.speed * current.waitTime);
                            if ((Math.round(new Date().getTime() / 1000) - v.time) >= (waitTime * 60)) {
                                needDelete.push({risk: v.risk, amount: v.amount, rate: v.rate * BITFINEX_EXP, id: v.id});
                            } else {
                                needRetain.push({risk: v.risk, rate: v.rate * BITFINEX_EXP});
                            }
                        }
                    });
                } else {
                    offer[id][current.type] = [];
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
                    if (KAM > 0) {
                        KAM = KAM - (v.newAmount ? v.newAmount : v.amount);
                        needNew.push({
                            risk,
                            amount: v.newAmount ? v.newAmount : v.amount,
                            rate: (MR2 > 0 && finalRate[current.type][10 - risk] < MR2) ? MR2 : finalRate[current.type][10 - risk],
                        })
                    } else {
                        needNew.push({
                            risk,
                            amount: v.newAmount ? v.newAmount : v.amount,
                            rate: (MR > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                        })
                    }
                });
            }
            // Produce new offers to fill empty slots up to OFFER_MAX.
            const newOffer = risk => {
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
                        amount = Math.floor(keep_available * 10000) / 10000;
                    }
                    if (KAM > 0) {
                        if (amount > KAM) {
                            amount = KAM;
                            KAM = 0;
                        } else {
                            KAM = KAM - amount;
                        }
                        needNew.push({
                            risk,
                            amount,
                            rate: (MR2 > 0 && finalRate[current.type][10 - risk] < MR2) ? MR2 : finalRate[current.type][10 - risk],
                        })
                    } else {
                        needNew.push({
                            risk,
                            amount,
                            rate: (MR > 0 && finalRate[current.type][10 - risk] < MR) ? MR : finalRate[current.type][10 - risk],
                        });
                    }
                    keep_available = keep_available - amount;
                    risk--;
                }
            }
            // Merge new offers with delete candidates — cancel only when no matching retain exists.
            const mergeOffer = () => {
                const checkDelete = (rate, amount) => {
                    for (let i = 0; i < needDelete.length; i++) {
                        // Improvement 5: tolerance-based match instead of exact bucket
                        const rateDiff = Math.abs(rate - needDelete[i].rate);
                        if (rateDiff <= BITFINEX_MIN * MERGE_RATE_TOLERANCE && amount === needDelete[i].amount) {
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
                log.debug({ needRetain, needDelete, finalNew }, 'offer reconciliation');
            }
            extremRateCheck();
            adjustOffer();
            newOffer(current.riskLimit);
            mergeOffer();
            const cancelOffer = async () => {
                for (let index = 0; index < needDelete.length; index++) {
                    try {
                        await userRest.cancelFundingOffer(needDelete[index].id);
                    } catch (err) {
                        for (let j = 0; j < offer[id][current.type].length; j++) {
                            if (needDelete[index].id === offer[id][current.type][j].id) {
                                log.debug({ offerId: needDelete[index].id }, 'cancelling offer');
                                offer[id][current.type].splice(j, 1);
                                break;
                            }
                        }
                        sendWs(`${id} ${needDelete[index].id} cancelFundingOffer Error: ${err.message||err.msg}`, 0, 0, true);
                        handleError(err, `${id} ${needDelete[index].id} cancelFundingOffer Error`);
                    }
                    await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                }
            };
            const submitOffer = async () => {
                // L2: single balance check before the loop to avoid per-offer REST race
                let submitAvailable = await calKeepCash();
                for (let index = 0; index < finalNew.length; index++) {
                    if (submitAvailable < finalNew[index].amount) {
                        continue;
                    }
                    const finalfinalRate = ((currentRate[current.type].frr >= current.dynamic) || (extremRate[id][current.type].lowTriggeredAt && (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].lowTriggeredAt) <= EXTREM_DURATION && extremRate[id][current.type].highTriggeredAt < extremRate[id][current.type].lowTriggeredAt) || (finalNew[index].rate > currentRate[current.type].frr * 0.7)) ? finalNew[index].rate : currentRate[current.type].frr * 0.7;
                    const DRT = getDR(finalfinalRate);
                    log.debug({ DRT }, 'days to retain for new offer');
                    const fo = new FundingOffer({
                        symbol: current.type,
                        amount: finalNew[index].amount,
                        rate: finalfinalRate / BITFINEX_EXP,
                        period: (DRT === false) ? 2 : DRT.day,
                        type: 'LIMIT',
                    }, userRest);
                    log.debug({ amount: finalNew[index].amount, submitAvailable }, 'submitting new offer');
                    await fo.submit();
                    submitAvailable -= finalNew[index].amount;
                    await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                    let isExist = false;
                    for (let i = 0; i < offer[id][current.type].length; i++) {
                        if (fo.id === offer[id][current.type][i].id) {
                            offer[id][current.type][i].risk = finalNew[index].risk;
                            isExist = true;
                            break;
                        }
                    }
                    if (!isExist) {
                        const isDelete = deleteOffer.indexOf(fo.id);
                        if (isDelete === -1) {
                            offer[id][current.type].push({
                                id: fo.id,
                                time: Math.round(new Date().getTime() / 1000),
                                amount: fo.amount,
                                rate: fo.rate,
                                period: fo.period,
                                risk: finalNew[index].risk,
                            });
                        } else {
                            deleteOffer.splice(isDelete, 1);
                        }
                    }
                }
                if ((finalNew.length + needDelete.length) > 0) {
                    sendWs({
                        type: 'bitfinex',
                        data: -1,
                        user: id,
                    });
                }
            };
            if (current.isTrade && fakeOrder[id][current.type]) {
                log.debug({ id, type: current.type, fakeOrder: fakeOrder[id][current.type] }, 'fake order state');
            }
            const checkFakeOrder = async () => {
                if (!(current.isTrade && fakeOrder[id][current.type])) {
                    return;
                }
                for (let index = 0; index < fakeOrder[id][current.type].length; index++) {
                    const o = fakeOrder[id][current.type][index];
                    if (!o.done && o.type === 'buy' && +priceData[o.symbol].lastPrice && +priceData[o.symbol].lastPrice <= o.price) {
                        const items = await Mongo('find', TOTALDB, {owner: uid, sType: 1, index: o.symbol});
                        log.info({ items }, 'closing fake sell orders');
                        if (items.length < 1) {
                            log.warn({ symbol: o.symbol }, 'fake order symbol missing');
                            continue;
                        }
                        await processOrderRest(1, o.price, 0, o.time, items[0], true);
                        o.done = true;
                    } else if (!o.done && o.type === 'sell' && +priceData[o.symbol].lastPrice && +priceData[o.symbol].lastPrice >= o.price) {
                        const items = await Mongo('find', TOTALDB, {owner: uid, sType: 1, index: o.symbol});
                        log.info({ items }, 'closing fake buy orders');
                        if (items.length < 1) {
                            log.warn({ symbol: o.symbol }, 'fake order symbol missing');
                            continue;
                        }
                        await processOrderRest(-1, o.price, 0, o.time, items[0], true);
                        o.done = true;
                    }
                }
            };
            return cancelOffer().then(() => submitOffer()).then(() => checkFakeOrder());
        });
    }

    // Handle margin trading adjustments for one funding symbol by moving funds between
    // funding and margin wallets until the pair allocation matches current.amount.
    const singleTrade = current => {
        log.info('singleTrade start');
        if (current.isTrade && current.pair) {
        } else {
            return Promise.resolve();
        }
        let min_available = 5000;
        if (current.amount > 0 && current.rate_ratio > 0) {
            if (extremRate[id][current.type].lowTriggeredAt && (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].lowTriggeredAt) <= EXTREM_DURATION && extremRate[id][current.type].highTriggeredAt < extremRate[id][current.type].lowTriggeredAt) {
                log.info('extreme low rate detected');
                min_available = 0;
            } else if (extremRate[id][current.type].highTriggeredAt && (Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].highTriggeredAt) <= EXTREM_DURATION && extremRate[id][current.type].highTriggeredAt > extremRate[id][current.type].lowTriggeredAt) {
                log.info('extreme high rate detected');
                min_available = 10000;
            }
        }
        // Calculate the amount that must move to or from margin so the live position
        // converges on current.amount before placing or clearing pair trades.
        const getAM = () => {
            log.debug({ current }, 'trade current config');
            let needTrans = 0;
            if (margin[id][current.type] && margin[id][current.type]['total'] > 0) {
                if ((Math.abs(current.amount - margin[id][current.type]['total']) >= 2000) || (Math.abs(current.amount - margin[id][current.type]['total']) >= current.amount * 0.05)) {
                    needTrans = current.amount - margin[id][current.type]['total'];
                }
                log.debug({ total: margin[id][current.type]['total'] }, 'margin total');
            } else {
                needTrans = current.amount;
            }
            log.debug({ needTrans }, 'transfer needed');
            let availableMargin = 0;
            if (needTrans > 1 && current.clear !== true) {
                return userRest.wallets().then(wallet => {
                    for (let i = 0; i < wallet.length; i++){
                        if (wallet[i].type === 'funding' && wallet[i].currency === current.type.substr(1)) {
                            available[id][current.type] = {
                                avail: wallet[i].balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: wallet[i].balance,
                            }
                            break;
                        }
                    }
                    log.debug({ available: available[id] }, 'wallet available');
                    if (available[id][current.type] && available[id][current.type].avail > 0) {
                        availableMargin = available[id][current.type].avail;
                    }
                    if (availableMargin >= needTrans) {
                        availableMargin = needTrans;
                    } else {
                        //close offer
                        if (offer[id][current.type]) {
                            const real_id = offer[id][current.type].filter(v => v.risk !== undefined);
                            const real_delete = async () => {
                                for (let index = 0; index < real_id.length; index++) {
                                    if (availableMargin >= needTrans) break;
                                    let is_error = false;
                                    try {
                                        await userRest.cancelFundingOffer(real_id[index].id);
                                    } catch (err) {
                                        is_error = true;
                                        for (let j = 0; j < offer[id][current.type].length; j++) {
                                            if (real_id[index].id === offer[id][current.type][j].id) {
                                                log.debug({ orderId: real_id[index].id }, 'cancelling margin order');
                                                offer[id][current.type].splice(j, 1);
                                                break;
                                            }
                                        }
                                        sendWs(`${id} ${real_id[index].id} cancelFundingOffer Error: ${err.message||err.msg}`, 0, 0, true);
                                        handleError(err, `${id} ${real_id[index].id} cancelFundingOffer Error`);
                                    }
                                    if (!is_error) {
                                        availableMargin = availableMargin + real_id[index].amount;
                                        if (availableMargin >= needTrans) {
                                            availableMargin = needTrans;
                                        }
                                    }
                                    await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                                }
                                return availableMargin;
                            };
                            return real_delete();
                        }
                    }
                    return Promise.resolve(availableMargin);
                });
            } else if (needTrans < -1 || current.clear === true) {
                return userRest.wallets().then(wallet => {
                    for (let i = 0; i < wallet.length; i++){
                        if (wallet[i].type === 'margin' && wallet[i].currency === current.type.substr(1)) {
                            if (margin[id][current.type]) {
                                margin[id][current.type]['avail'] = wallet[i].balanceAvailable;
                                margin[id][current.type]['time'] = Math.round(new Date().getTime() / 1000);
                                margin[id][current.type]['total'] = wallet[i].balance;
                            } else {
                                margin[id][current.type] = {
                                    avail: wallet[i].balanceAvailable,
                                    time: Math.round(new Date().getTime() / 1000),
                                    total: wallet[i].balance,
                                }
                            }
                            break;
                        }
                    }
                    log.debug({ margin: margin[id] }, 'margin after transfer');
                    if (margin[id][current.type] && margin[id][current.type].avail > 0) {
                        availableMargin = -margin[id][current.type].avail;
                    }
                    if (credit[id] && credit[id][current.type]) {
                        const now = Math.round(new Date().getTime() / 1000);
                        credit[id][current.type].forEach(o => {
                            if (o.side !== 1 && now < (o.time + o.period * 86400)) {
                                availableMargin = availableMargin + o.amount;
                            }
                        });
                    }
                    if (availableMargin <= needTrans && current.clear !== true) {
                        availableMargin = needTrans;
                    } else {
                        if (order[id][current.type]) {
                            const real_id = order[id][current.type].filter(v => v.amount > 0 && !v.type.includes('EXCHANGE'));
                            log.debug({ real_id }, 'margin order ids');
                            const real_delete = async () => {
                                for (let index = 0; index < real_id.length; index++) {
                                    if (availableMargin <= needTrans && current.clear !== true) break;
                                    if (real_id[index].status && real_id[index].status.includes('PARTIALLY FILLED')) {
                                        continue;
                                    }
                                    await userRest.cancelOrder(real_id[index].id);
                                    availableMargin = availableMargin - real_id[index].amount * real_id[index].price;
                                    if (availableMargin <= needTrans && current.clear !== true) {
                                        availableMargin = needTrans;
                                    }
                                    await new Promise(resolve => setTimeout(resolve, API_WAIT * 1000));
                                }
                                if (availableMargin > 0) {
                                    availableMargin = 0;
                                }
                                return availableMargin;
                            };
                            let delOrderNumber = 0;
                            real_id.forEach(r => delOrderNumber = delOrderNumber - r.amount * r.price / SUPPORT_LEVERAGE[r.symbol]);
                            if ((availableMargin + delOrderNumber) < 0) {
                                return real_delete();
                            } else {
                                if (availableMargin > 0) {
                                    availableMargin = 0;
                                }
                                return Promise.resolve(availableMargin);
                            }
                        }
                    }
                    if (availableMargin > 0) {
                        availableMargin = 0;
                    }
                    return Promise.resolve(availableMargin);
                });
            }
            return Promise.resolve(availableMargin);
        }
        return getAM().then(availableMargin => {
            log.debug({ availableMargin }, 'available margin for new order');
            //transform wallet
            if (availableMargin < 1 && availableMargin > -1) {
                return Promise.resolve();
            } else if (availableMargin >= 1) {
                return userRest.transfer({
                    from: 'funding',
                    to: 'margin',
                    amount: (Math.floor(availableMargin * 1000000) / 1000000).toString(),
                    currency: current.type.substr(1),
                }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 1000))).then(data => {
                    log.debug({ data }, 'margin order submitted');
                    return Promise.resolve();
                    /*current.used = current.used > 0 ? current.used + availableMargin : availableMargin;
                    return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}});*/
                });
            } else {
                return userRest.transfer({
                    from: 'margin',
                    to: 'funding',
                    amount: (-availableMargin).toString(),
                    currency: current.type.substr(1),
                }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 1000))).then(data => {
                    log.debug({ data }, 'margin order submitted');
                    return Promise.resolve();
                    /*current.used = (current.used > 0 && current.used + availableMargin > 1) ? current.used + availableMargin : 0;
                    if (margin[id][current.type] && (margin[id][current.type].total < 1 || !margin[id][current.type].total)) {
                        current.used = 0;
                    }
                    return Mongo('update', USERDB, {"username": id, "bitfinex.type": current.type}, {$set:{"bitfinex.$.used": current.used}});*/
                });
            }
        }).then(() => {
            const now = Math.round(new Date().getTime() / 1000);
            if ((now - updateTime[id]['trade']) < ORDER_INTERVAL) {
                return Promise.resolve();
            }
            // Auto-cancel open funding credits that have stayed inactive past the
            // current threshold checks so they can be re-priced or re-issued.
            const closecredit_recur = async () => {
                if (!credit[id][current.type]) return;
                for (let index = 0; index < credit[id][current.type].length; index++) {
                    if (credit[id][current.type][index].side !== 1) {
                        //frr
                        if (!credit[id][current.type][index].rate) {
                            if (!closeCredit[id]) {
                                closeCredit[id] = [credit[id][current.type][index].id];
                            } else {
                                closeCredit[id].push(credit[id][current.type][index].id);
                            }
                        } else if ((currentRate[current.type].frr > 0 && credit[id][current.type][index].rate * BITFINEX_EXP > currentRate[current.type].frr && credit[id][current.type][index].rate > current.miniRate / 100 * 2) || credit[id][current.type][index].period > 2) {
                            if (!closeCredit[id]) {
                                closeCredit[id] = [credit[id][current.type][index].id];
                            } else {
                                closeCredit[id].push(credit[id][current.type][index].id);
                            }
                        }
                    }
                }
            }
            updateTime[id]['trade'] = now;
            log.debug({ tradeCount: updateTime[id]['trade'] }, 'singleTrade interval check');
            const dynamicAmount = () => {
                if (current.rate_ratio > 0) {
                    let lent_credit = 0;
                    if (credit[id] && credit[id][current.type]) {
                        credit[id][current.type].forEach(o => {
                            if (o.side !== 1 && now < (o.time + o.period * 86400)) {
                                lent_credit = lent_credit + o.amount;
                            }
                        });
                    }
                    log.debug({ lent_credit }, 'lent credits for auto-close');
                    if (lent_credit <= 0) {
                        for (let i = 0; i < curArr.length; i++) {
                            if (curArr[i].type === current.type) {
                                current.amount = current.amount - current.rate_ratio;
                                return Mongo('update', USERDB, {_id: uid}, {$set : {
                                    [`bitfinex.${i}.amount`]: current.amount,
                                }});
                            }
                        }
                    } else if (lent_credit > 5000) {
                        for (let i = 0; i < curArr.length; i++) {
                            if (curArr[i].type === current.type) {
                                if (margin[id] && margin[id][current.type]) {
                                    if (available[id] && available[id][current.type] && (current.amount - margin[id][current.type].total) >= (available[id][current.type].total - min_available)) {
                                        current.amount = Math.floor(margin[id][current.type].total + available[id][current.type].total - min_available);
                                    } else if ((current.amount - margin[id][current.type]['total']) <= 2000) {
                                        current.amount = Math.floor(current.amount + current.rate_ratio);
                                    }
                                    return Mongo('update', USERDB, {_id: uid}, {$set : {
                                        [`bitfinex.${i}.amount`]: current.amount,
                                    }});
                                }
                            }
                        }
                    }
                }
                return Promise.resolve();
            }
            const orderHistory = () => userRest.accountTrades(null, new Date().getTime() - UPDATE_FILL_ORDER * 1000, new Date().getTime(), UPDATE_FILL_ORDER / 3600 * 20).then(oss => {
                const order_recur = index => {
                    if (index < 0) {
                        return Promise.resolve();
                    } else {
                        const os = oss[index];
                        // Reconcile each recent margin trade fill back into the local order state.
                        const symbol = `f${os.symbol.substr(-3)}`;
                        if (SUPPORT_COIN.indexOf(symbol) !== -1) {
                            // Ignore exchange wallet fills here; only margin pair closes affect this path.
                            if (!os.orderType.includes('EXCHANGE')) {
                                for (let i = 0; i < curArr.length; i++) {
                                    if (curArr[i].type === symbol && curArr[i].pair) {
                                        for (let j = 0; j < curArr[i].pair.length; j++) {
                                            if (curArr[i].pair[j].type === os.symbol) {
                                                log.info({ order: os }, 'trade history event');
                                                // Apply the execution fee adjustment before updating holdings.
                                                const amount = os.execAmount < 0 ? (1 - BITFINEX_FEE) * os.execAmount : os.execAmount;
                                                if (amount !== 0) {
                                                    // Load the tracked TOTALDB row for this pair and record the close fill.
                                                    return Mongo('find', TOTALDB, {owner: uid, sType: 1, index: os.symbol}).then(items => {
                                                        log.debug({ items }, 'TOTALDB items for order');
                                                        if (items.length < 1) {
                                                            return handleError(new HoError(`miss ${os.symbol}`));
                                                        }
                                                        return processOrderRest(amount, os.orderPrice, os.orderID, Math.round(os.mtsCreate / 1000), items[0]);
                                                    }).catch(err => {
                                                        sendWs(`${id} Total Updata Error: ${err.message||err.msg}`, 0, 0, true);
                                                        handleError(err, `${id} Total Updata Error`);
                                                    }).then(() => order_recur(index - 1));
                                                }
                                                break;
                                            }
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                        return order_recur(index - 1);
                    }
                }
                return order_recur(oss.length - 1);
            });
            return dynamicAmount().then(() => orderHistory().then(() => closecredit_recur().then(() => Mongo('find', TOTALDB, {owner: uid, sType: 1, type: current.type}).then(async items => {
                const newOrder = await _recur_status({ id, uid, current, userRest, items });
                await _recur_NewOrder({ id, uid, current, userRest, newOrder });
            }).catch(err => {
                updateTime[id]['trade'] = updateTime[id]['trade'] - 2 * RATE_INTERVAL;
                return Promise.reject(err);
            }))));
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
            log.info({ type: current.type }, 'processing ledger');
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
    const recurLoan = async () => {
        for (let i = 0; i < curArr.length; i++) {
            if (curArr[i] && SUPPORT_COIN.indexOf(curArr[i].type) !== -1) {
                await getLegder(curArr[i]);
                await singleLoan(curArr[i]);
                await singleTrade(curArr[i]);
            }
        }
    };
    return initialBook().then(() => _closeRestCredit()).then(() => recurLoan());
}

/**
 * Reset the Bitfinex module runtime state.
 *
 * Closes all active user WebSocket connections, clears per-user caches, and forces
 * the shared Bitfinex REST clients/snapshots to be rebuilt on the next cycle. When
 * `update` is true, keep the trade timer but refresh the book/offer/credit/
 * position snapshots so rate data can be reloaded without a full disconnect.
 *
 * @param {boolean} [update=false] Whether to do a partial snapshot refresh only.
 * @returns {Promise<void>|void}
 */
export const resetBFX = (update=false) => {
    log.info('BFX reset');
    const closeWs = async () => {
        const keys = Object.keys(userWs);
        for (let i = 0; i < keys.length; i++) {
            userWs[keys[i]].close();
        }
        userWs = {};
        userOk = {};
    };
    if (update) {
        for (let i in updateTime) {
            const trade_count = updateTime[i]['trade'];
            updateTime[i] = {};
            updateTime[i]['book'] = 0;
            updateTime[i]['offer'] = 0;
            updateTime[i]['credit'] = 0;
            updateTime[i]['position'] = 0;
            updateTime[i]['order'] = 0;
            //先不reset
            updateTime[i]['trade'] = trade_count;
        }
    } else {
        updateTime = {};
        return closeWs();
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
    updateBot: function(id, set, userID) {
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
        let rest_total = false;
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
            if (keepAmountRate1 >= 0 && set.keepAmountMoney1) {
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
            if (dynamicRate1 >= 0 && set.dynamicDay1) {
                const dynamicDay1 = isValidString(set.dynamicDay1, 'zeroint');
                if (dynamicDay1 === 0 && dynamicRate1 === 0) {

                } else if (dynamicDay1 === false || dynamicDay1 < 2 || dynamicDay1 > 120) {
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
            if (dynamicRate2 >= 0 && set.dynamicDay2) {
                const dynamicDay2 = isValidString(set.dynamicDay2, 'zeroint');
                if (dynamicDay2 === 0 && dynamicRate2 === 0) {

                } else if (dynamicDay2 === false || dynamicDay2 < 2 || dynamicDay2 > 120) {
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
                const amount = isValidString(set.amount, 'zeroint');
                if (amount === false) {
                    return handleError(new HoError('Trade Amount is not valid'));
                }
                data['amount'] = amount;
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
                    const pair = set.pair.trim()
                    if (pair !== '.' && pair !== '..') {
                        if (pair.match(/^[^\\\/\|\*\?"<>]{1,500}$/)) {
                        } else {
                            return handleError(new HoError('Trade Pair is not valid'));
                        }
                    } else {
                        return handleError(new HoError('Trade Pair is not valid'));
                    }
                    /*const mPair = pair.match(/^([a-zA-Z]+)\=([a|c]\d+\.?\d*)([a|c]\d+\.?\d*)?$/);
                    if (mPair) {
                        if (SUPPORT_PAIR[set.type].indexOf(mPair[1]) !== -1) {
                            rest_total = {
                                index: mPair[1],
                                data: Object.assign(mPair[2][0] === 'a' ? {amount: Number(mPair[2].substr(1))} : mPair[2][0] === 'c' ? {count: Number(mPair[2].substr(1))} : {}, (mPair[3] && mPair[3][0] === 'a') ? {amount: Number(mPair[3].substr(1))} : (mPair[3] && mPair[3][0] === 'c') ? {count: Number(mPair[3].substr(1))} : {},),
                            };
                        }
                    } else {*/
                        const pairArr = [];
                        pair.split(',').forEach(v => {
                            const p = v.trim();
                            const m = p.match(/^([a-zA-Z\:]+)\=(\d+)$/);
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
                    const clear = set.clear.trim()
                    if (clear !== '.' && clear !== '..') {
                        if (clear.match(/^[^\\\/\|\*\?"<>]{1,500}$/)) {
                        } else {
                            return handleError(new HoError('Trade Clear is not valid'));
                        }
                    } else {
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
                log.debug({ user }, 'setWsOffer user');
                //處理市價出單
                return Mongo('find', TOTALDB, {owner: id, sType: 1, type: set.type}).then(item => {
                    log.debug({ item }, 'bitfinex config item');
                    /*if (rest_total) {
                        for (let i = 0; i < item.length; i++) {
                            if (item[i].index === rest_total.index) {
                                rest_total.data.amount = (rest_total.data.amount) ? item[i].amount - rest_total.data.amount > 0 ? item[i].amount - rest_total.data.amount : 0 : item[i].amount;
                                log.debug({ rest_total }, 'rest total from TOTALDB');
                                return Mongo('update', TOTALDB, {_id: item[i]._id}, {$set : rest_total.data}).then(result => {
                                    log.debug({ result }, 'TOTALDB insert result');
                                    return returnSupport(bitfinex);
                                });
                            }
                        }
                    } else */if (data['pair']) {
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
                        const recur_update = async () => {
                            for (let index = 0; index < item.length; index++) {
                                if (item[index]._id) {
                                    let updated = false;
                                    for (let i = 0; i < data['pair'].length; i++) {
                                        if (item[index].index === data['pair'][i].type) {
                                            if (item[index].ing === 2) {
                                                item[index].ing = (position[userID] && position[userID][item[index].index]) ? 1 : 0;
                                            }
                                            const r = await Mongo('update', TOTALDB, {_id: item[index]._id}, {$set : {
                                                times: Math.floor(item[index].times * data['pair'][i].amount / item[index].orig * 10000) / 10000,
                                                //amount: item[index].amount + data['pair'][i].amount - item[index].orig,
                                                orig: data['pair'][i].amount,
                                                ing: item[index].ing,
                                            }});
                                            log.debug({ r }, 'clear result');
                                            updated = true;
                                            break;
                                        }
                                    }
                                    if (!updated) {
                                        const result = await Mongo('update', TOTALDB, {_id: item[index]._id}, {$set : {ing: 2}});
                                        log.debug({ result }, 'update result');
                                    }
                                } else {
                                    const webitem = await Mongo('find', TOTALDB, {index: item[index].type, sType: 1});
                                    if (webitem.length < 1) {
                                        return handleError(new HoError(`miss ${item[index].type} web`));
                                    }
                                    const maxAmount = webitem[0].mid * (webitem[0].web.length - 1) / 3 * 2;
                                    // §9b Volatility-normalized position size
                                    const volValue = Math.max(0, 1 - (webitem[0].extrem || 0) / 0.4);
                                    const r = await Mongo('insert', TOTALDB, {
                                        owner: id,
                                        index: item[index].type,
                                        name: item[index].type.substr(1),
                                        type: set.type,
                                        sType: 1,
                                        web: webitem[0].web,
                                        wType: webitem[0].wType,
                                        mid: webitem[0].mid,
                                        extrem: webitem[0].extrem,
                                        mul: 1 + volValue,
                                        times: Math.floor(item[index].amount / maxAmount * 10000) / 10000,
                                        //amount: item[index].amount,
                                        orig: item[index].amount,
                                        previous: {buy: [], sell: []},
                                        newMid: [],
                                        ing: 0,
                                        //count: 0,
                                    });
                                    log.debug({ r }, 'delete result');
                                }
                            }
                            if (userWs[userID]) {
                                userWs[userID].close();
                                userWs[userID] = null;
                                userOk[userID] = false;
                            }
                            return returnSupport(bitfinex);
                        }
                        return recur_update();
                    } else {
                        if (userWs[userID]) {
                            userWs[userID].close();
                            userWs[userID] = null;
                            userOk[userID] = false;
                        }
                        return returnSupport(bitfinex);
                    }
                });
            });
        });
    },
    deleteBot: function(id, type, userID) {
        return Mongo('find', USERDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('User does not exist!!!'));
            }
            if (items[0].bitfinex) {
                const bitfinex = items[0].bitfinex.filter(v => (v.type === type) ? false : true);
                return Mongo('update', USERDB, {_id: id}, {$set: {bitfinex}}).then(user => {
                    log.debug({ user }, 'user after bitfinex removal');
                    if (userWs[userID]) {
                        userWs[userID].close();
                        userWs[userID] = null;
                        userOk[userID] = false;
                    }
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
            case 'ltc':
            case 'LTC':
            coin = FLTC_SYM;
            break;
            /*case 'omg':
            case 'OMG':
            coin = FOMG_SYM;
            break;*/
            case 'dot':
            case 'DOT':
            coin = FDOT_SYM;
            break;
            case 'sol':
            case 'SOL':
            coin = FSOL_SYM;
            break;
            case 'ada':
            case 'ADA':
            coin = FADA_SYM;
            break;
            case 'xrp':
            case 'XRP':
            coin = FXRP_SYM;
            break;
            case 'avax':
            case 'AVAX':
            coin = FAVAX_SYM;
            break;
            case 'trx':
            case 'TRX':
            coin = FTRX_SYM;
            break;
            case 'uni':
            case 'UNI':
            coin = FUNI_SYM;
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
                    const frr = Math.round(currentRate[v].frr / 10) / 100000;
                    tempList.push({
                        name: `${v.substr(1)} Rate ${frr}%`,
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
                let profit = 0;
                if (margin[id] && margin[id][`f${i.substr(-3)}`] && margin[id][`f${i.substr(-3)}`][i]) {
                    profit = margin[id][`f${i.substr(-3)}`][i];
                }
                if (position[id] && position[id][`f${i.substr(-3)}`]) {
                    position[id][`f${i.substr(-3)}`].forEach(o => {
                        if (o.symbol === i) {
                            profit = profit + o.amount * priceData[i].lastPrice;
                        }
                    });
                }
                tempList.push({
                    name: `${i.substr(1)} $${Math.floor(priceData[i].lastPrice * 10000) / 10000} ${(profit > 0) ? '+' : ''}${Math.round(profit * 1000) / 1000}`,
                    id: vid++,
                    tags: [i.substr(1, 3), i.substr(-3), 'rate', '利率'],
                    rate: `${Math.floor(priceData[i].dailyChange * 100) / 100}%`,
                    count: priceData[i].dilyChange,
                    utime: priceData[i].time,
                    type: 1,
                    str: priceData[i].str,
                    str2: priceData[i].str2,
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
                            name: `交易掛單 ${o.symbol.substr(1)} ${Math.floor(o.amount * 10000) / 10000}枚 ${o.type}${o.type.includes('EXCHANGE') ? ' 手動' : ''}`,
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
                            boost: (o.period >= 30) ? true : false,
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
                        log.debug({ o }, 'bitfinex config entry');
                        const rate = Math.round(o.pl * 1000) / 1000;
                        itemList.push({
                            name: `部位 ${o.symbol.substr(1)} ${Math.floor(o.amount * 10000) / 10000}枚 ${o.price} / ${o.lp}`,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'position', '部位'],
                            rate: `$${rate}`,
                            count: rate,
                            utime: o.time,
                            type: 3,
                            taken: (o.pl < 0) ? true : false,
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
                            rate: rate ? `${rate}%` : 'FRR',
                            count: rate,
                            boost: (o.period >= 30) ? true : false,
                            taken: (o.side === 1) ? false : true,
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
    },
    closeCredit: function(id, cId) {
        if (!closeCredit[id]) {
            closeCredit[id] = [cId];
        } else {
            closeCredit[id].push(cId);
        }
        log.debug({ closeCredit }, 'close credit state');
        return Promise.resolve();
    }
}

/**
 * Map the supported Bitfinex coins against a user's saved config into the
 * frontend-facing summary objects, including pair text and current state flags.
 *
 * @param {Array<Object>} bitfinex User Bitfinex config entries.
 * @returns {Array<Object>} Supported coin summaries for the UI.
 */
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


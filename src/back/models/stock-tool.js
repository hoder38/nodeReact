import { ENV_TYPE } from '../../../ver.js'
import { CHECK_STOCK, USSE_TICKER, TWSE_TICKER } from '../config.js'
import { STOCKDB, CACHE_EXPIRE, STOCK_FILTER_LIMIT, STOCK_FILTER, MAX_RETRY, TOTALDB, STOCK_INDEX, NORMAL_DISTRIBUTION, TRADE_FEE, TRADE_INTERVAL, RANGE_INTERVAL, TRADE_TIME, USSE_FEE, USERDB, TWSE_NUM, USSE_NUM, MAX_NEWMID_STACK, EMERGENCY_STOP_THRESHOLD, MIN_BINS, MAX_BINS, VOLUME_DECAY_LAMBDA } from '../constants.js'
import Htmlparser from 'htmlparser2'
import fsModule from 'fs'
import yahooFinance from 'yahoo-finance2'
const { existsSync: FsExistsSync } = fsModule;
import Mkdirp from 'mkdirp'
import Redis from '../models/redis-tool.js'
import Mongo from '../models/mongo-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import Api from './api-tool.js'
import { getUssePosition, getUsseOrder } from '../models/tdameritrade-tool.js'
import { getTwsePosition, getTwseOrder } from '../models/shioaji-tool.js'
import { handleError, HoError, findTag, completeZero, addPre, isValidString, toValidName, convertTimestampToDate } from '../util/utility.js'
import { getExtname } from '../util/mime.js'
import sendWs from '../util/sendWs.js'

const StockTagTool = TagTool(STOCKDB);

let stockFiltering = false;
let stockIntervaling = false;
let stockPredicting = false;
const suggestionData = {
    twse: {},
    usse: {},
}
let stringSent = 0;

export const getStockPrice = (type='twse', index, previous = false) => {
    switch(type) {
        case 'twse':
        let count = 0;
        const real = () => Api('url', `https://tw.stock.yahoo.com/quote/${index}`).then(raw_data => {
            const center = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0];
            if (!center) {
                let tabs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'app')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[3], 'div')[0], 'div')[0], 'div')[0];
                if (tabs.attribs.id === 'myLightboxContainer') {
                    tabs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'app')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[2], 'div')[0], 'div')[0], 'div')[0];
                }
                let div = null;
                if (findTag(tabs, 'div', 'main-0-QuoteHeader-Proxy')[0]) {
                    div = findTag(findTag(findTag(findTag(findTag(tabs, 'div', 'main-0-QuoteHeader-Proxy')[0], 'div')[0], 'div')[1], 'div')[0], 'div')[0];
                } else {
                    div = findTag(findTag(findTag(findTag(findTag(findTag(tabs, 'div')[0], 'div', 'main-0-QuoteHeader-Proxy')[0], 'div')[0], 'div')[1], 'div')[0], 'div')[0];
                }
                let price = findTag(findTag(div, 'span')[0])[0];
                price = price === '-' ? 0 : Number(price.replace(/,/g, ''));
                if (previous) {
                    let previousPrice = 0;
                    if (findTag(tabs, 'div', 'main-2-QuoteOverview-Proxy')[0]) {
                        findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(tabs, 'div', 'main-2-QuoteOverview-Proxy')[0], 'div')[0], 'section')[0], 'div')[1], 'div')[1], 'div')[0], 'ul')[0], 'li').forEach(l => {
                            if (findTag(findTag(l, 'span')[0])[0] === '昨收') {
                                previousPrice = findTag(findTag(l, 'span')[1])[0];
                                previousPrice = previousPrice === '-' ? 0 : Number(previousPrice.replace(/,/g, ''));
                            }
                        });
                    } else {
                        findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(tabs, 'div')[0], 'div', 'main-2-QuoteOverview-Proxy')[0], 'div')[0], 'section')[0], 'div')[1], 'div')[1], 'div')[0], 'ul')[0], 'li').forEach(l => {
                            if (findTag(findTag(l, 'span')[0])[0] === '昨收') {
                                previousPrice = findTag(findTag(l, 'span')[1])[0];
                                previousPrice = previousPrice === '-' ? 0 : Number(previousPrice.replace(/,/g, ''));
                            }
                        });
                    }

                    console.log(price);
                    console.log(previousPrice);
                    return [price, previousPrice];
                } else {
                    console.log(price);
                    return price;
                }
            }
            const table1 = findTag(center, 'table')[1];
            if (!table1) {
                return handleError(new HoError(`stock ${index} price get fail`));
            }
            const tr = findTag(table1, 'tr')[0];
            if (!tr) {
                return handleError(new HoError(`stock ${index} price get fail`));
            }
            const table = findTag(findTag(tr, 'td')[0], 'table')[0];
            if (!table) {
                return handleError(new HoError(`stock ${index} price get fail`));
            }
            const price = findTag(findTag(findTag(findTag(table, 'tr')[1], 'td')[2], 'b')[0])[0].match(/^(\d+(\.\d+)?|\-)/);
            if (!price || !price[0]) {
                console.log(raw_data);
                return handleError(new HoError(`stock ${index} price get fail`));
            }
            if (price[0] === '-') {
                const last_price = findTag(findTag(findTag(findTag(findTag(table, 'tr')[1], 'td')[5], 'font')[0], 'td')[1])[0].match(/^(\d+(\.\d+)?|\-)/);
                if (!last_price || !last_price[0]) {
                    return handleError(new HoError(`stock ${index} price get fail`));
                }
                if (price[0] === '-') {
                    last_price[0] = 0;
                }
                price[0] = last_price[0];
            }
            price[0] = +price[0];
            /*if (!price_only) {
                const up = findTag(findTag(findTag(findTag(table, 'tr')[1], 'td')[5], 'font')[0])[0].match(/^(.?\d+(\.\d+)?|\-)/);
                if (up && up[0]) {
                    price[0] = `${price[0]} ${up[0]}`;
                }
            }*/
            console.log(price[0]);
            return price[0];
        }).catch(err => {
            console.log(count);
            return (++count > _maxRetry) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), count * 1000));
        });
        return real();
        case 'usse':
        /*const up = getUssePrice();
        if (up[index] && ((_dateFactory().getTime()/1000 - up[index].t) < 86400)) {
            console.log(up[index]);
            return up[index].p;
        } else {*/
            return getUsStock(index).then(ret => {
                if (!ret.price) {
                    if (previous) {
                        return [0, 0];
                    } else {
                        return 0;
                    }
                }
                if (previous) {
                    console.log(ret.price);
                    console.log(ret.previous);
                    return [ret.price, ret.previous];
                } else {
                    console.log(ret.price);
                    return ret.price;
                }
            });
        //}
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

export const getBasicStockData = (type, index) => {
    let count = 0;
    switch(type) {
        case 'twse':
        const real = () => Api('url', `https://mopsov.twse.com.tw/mops/web/ajax_quickpgm?encodeURIComponent=1&step=4&firstin=1&off=1&keyword4=${index}&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&co_id=${index}`).then(raw_data => {
            let result = {stock_location: ['tw', '台灣', '臺灣']};
            let i = 0;
            const form = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0];
            const table = findTag(form, 'table', 'zoom')[0] ? findTag(form, 'table', 'zoom')[0] : findTag(findTag(form, 'table')[0], 'table', 'zoom')[0];
            findTag(findTag(table, 'tr')[1], 'td').forEach(d => {
                const as = findTag(d, 'a');
                if (as.length > 0) {
                    let texts = [];
                    as.forEach(a => {
                        const text = findTag(a)[0];
                        if (text) {
                            texts.push(text);
                        }
                    });
                    switch(i) {
                        case 0:
                        result.stock_index = texts[0];
                        break;
                        case 1:
                        result.stock_name = texts;
                        for (let t of texts) {
                            if (t.match(/^F/)) {
                                result.stock_location.push('大陸');
                                result.stock_location.push('中國');
                                result.stock_location.push('中國大陸');
                                result.stock_location.push('china');
                                break;
                            }
                        }
                        break;
                        case 2:
                        result.stock_full = texts[0];
                        break;
                        case 3:
                        result.stock_market = texts[0];
                        if (texts[0] === '上市') {
                            result.stock_market_e = 'sii';
                        } else if (texts[0] === '上櫃') {
                            result.stock_market_e = 'otc';
                        } else if (texts[0] === '興櫃') {
                            result.stock_market_e = 'rotc';
                        } else if (texts[0] === '公開發行') {
                            result.stock_market_e = 'pub';
                        }
                        break;
                        case 4:
                        result.stock_class = texts[0];
                        break;
                        case 5:
                        result.stock_time = (Number(texts[0].match(/\d+$/)[0]) + 1911).toString();
                        break;
                    }
                }
                i++;
            });
            return result;
        }).catch(err => {
            console.log(count);
            return (++count > _maxRetry) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), _retryDelay));
        });
        return real();
        case 'usse':
        const real1 = () => yahooFinance.quote(index).then(yFresult => {
            let result = {stock_location: ['us', '美國'], stock_index: index};
            result.stock_full = yFresult['longName'];
            result.stock_name = [result.stock_full];
            result.stock_market = yFresult['fullExchangeName'];
            return yahooFinance.quoteSummary('AAPL', { modules: [ "assetProfile" ] }).then(summary => {
                result.stock_class = summary['assetProfile']['sector'];
                result.stock_ind = summary['assetProfile']['industry'];
                result.stock_executive = [];
                summary['assetProfile']['companyOfficers'].forEach(v => {
                    result.stock_executive.push(v['name']);
                });
                return result;
            });
        }).catch(err => {
            console.log(`${index} ${count}`);
            return (++count > _maxRetry) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real1()), _retryDelay));
        });
        return real1();
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

export const handleStockTagV2 = (type, index, indexTag) => getBasicStockData(type, index).then(basic => {
    let tags = new Set();
    indexTag.forEach(v => tags.add(v));
    tags.add(type).add(basic.stock_index).add(basic.stock_full).add(basic.stock_market);
    if (basic.stock_class) {
        tags.add(basic.stock_class);
    }
    if (basic.stock_market_e) {
        tags.add(basic.stock_market_e);
    }
    if (basic.stock_time) {
        tags.add(basic.stock_time);
    }
    if (basic.stock_ind) {
        tags.add(basic.stock_ind);
    }
    basic.stock_name.forEach(i => tags.add(i));
    basic.stock_location.forEach(i => tags.add(i));
    if (basic.stock_executive && basic.stock_executive.length > 0) {
        basic.stock_executive.forEach(i => tags.add(i));
    }
    let valid_tags = [];
    tags.forEach(i => {
        const valid_name = isValidString(i, 'name');
        if (valid_name) {
            valid_tags.push(valid_name.replace('&amp;', '&'));
        }
    });
    return [basic.stock_name[0], valid_tags];
});

export const getParameterV2 = (data, type, text = null) => {
    const matchProfit = data.match(new RegExp('\\>' + type + '\\<\\/td\\>([\\s\\S]+?)\\<\\/tr\\>'));
    if (!matchProfit) {
        return false;
    }
    if (text && !matchProfit[1].match(new RegExp(text))) {
        return false;
    }
    return matchProfit[1].match(/[^\>\<]*(\>[\d,]+\<)/g).map(v => {
        const ret = Number(v.match(/\>[\d,]+\</)[0].replace(/[\>\<,]/g, ''))
        return v.match(/sign\=\"\-\"/) ? -ret : ret;
    });
}

let _statusDelay = 3000;
export const _setStatusDelay = n => { _statusDelay = n; };
let _maxRetry = MAX_RETRY;
export const _setMaxRetry = n => { _maxRetry = n; };
let _twseDelay = 5000;
export const _setTwseDelay = n => { _twseDelay = n; };
let _dateFactory = () => new Date();
export const _setDateFactory = fn => { _dateFactory = fn || (() => new Date()); };
let _retryDelay = 60000;
export const _setRetryDelay = n => { _retryDelay = n; };
let _overrunDelay = 20000;
export const _setOverrunDelay = n => { _overrunDelay = n; };
let _annualDelay = 5000;
export const _setAnnualDelay = n => { _annualDelay = n; };

export const findFirstParameter = (raw_data, codes, label) => {
    for (const code of codes) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result[0];
    }
    return null;
};

export const findFirstParameterArray = (raw_data, codes, label) => {
    for (const code of codes) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result;
    }
    return null;
};

export const findFirstParameterPairs = (raw_data, pairs) => {
    for (const [code, label] of pairs) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result[0];
    }
    return null;
};

export const PROFIT_CODES = [7900, 6100, 61001, 62000, 61000];
export const PROFIT_LABEL = '繼續營業單位稅前淨利（淨損）';
export const EQUITY_CODES = [3100, 31100, 31000];
export const EQUITY_LABEL = '股本合計';
export const NETVALUE_PAIRS = [
    ['3XXX', '權益總計'],
    [30000, '權益總計'],
    ['3XXXX', '權益總額'],
    [39999, '權益總計'],
    [39999, '權益總額'],
    ['3XXX', '權益總額'],
    ['3XXXX', '權益總計'],
];

export const BUY_THRESHOLDS = { 7: [7/8, 3/4], 3: [5/8, 1/2], 6: [3/8, 1/4] };
export const SELL_THRESHOLDS = { 9: [1/8, 1/4], 5: [3/8, 1/2], 8: [5/8, 3/4] };

export const executeBuy = (suggest, amount, maxAmount, count, fee) => {
    let buyTrade = 0;
    const origCount = count;
    for (let j = 0; j < suggest.bCount; j++) {
        if ((amount - suggest.buy) <= 0) break;
        amount -= suggest.buy;
        count++;
        buyTrade++;
    }
    const t = BUY_THRESHOLDS[suggest.type];
    if (t && amount > maxAmount * t[0]) {
        let tmpAmount = amount - maxAmount * t[1];
        while ((tmpAmount - suggest.buy) > 0) {
            amount -= suggest.buy;
            tmpAmount = amount - maxAmount * t[1];
            count++;
            buyTrade++;
        }
    }
    return { amount, count, buyTrade, didBuy: count > origCount };
};

export const executeSell = (suggest, amount, maxAmount, count, fee) => {
    let sellTrade = 0;
    for (let j = 0; j < suggest.sCount; j++) {
        amount += (suggest.sell * (1 - fee));
        sellTrade++;
        count--;
        if (count <= 0) break;
    }
    const t = SELL_THRESHOLDS[suggest.type];
    if (t && amount < maxAmount * t[0]) {
        let tmpAmount = maxAmount * t[1] - amount;
        while ((tmpAmount - suggest.sell * (1 - fee)) > 0) {
            amount += (suggest.sell * (1 - fee));
            tmpAmount = maxAmount * t[1] - amount;
            sellTrade++;
            count--;
            if (count <= 0) break;
        }
    }
    return { amount, count, sellTrade };
};

export default {
    _resetFlags: function() {
        stockFiltering = false;
        stockIntervaling = false;
        stockPredicting = false;
        stringSent = 0;
        suggestionData.twse = {};
        suggestionData.usse = {};
    },
    _getFlags: function() {
        return { stockFiltering, stockIntervaling, stockPredicting, stringSent };
    },
    getSingleStockV2: function(type, obj, stage=0, back=false) {
        const date = _dateFactory();
        const index = obj.index;
        let updateyear = date.getFullYear();
        let updatequarter = 3;
        const month = date.getMonth() + 1;
        if (month < 4) {
            updatequarter = 4;
            updateyear--;
        } else if (month < 7) {
            updatequarter = 1;
        } else if (month < 10) {
            updatequarter = 2;
        }
        switch(type) {
            case 'twse':
            let year = date.getFullYear();
            let reportType = 'C';
            let quarter = 3;
            if (month < 4) {
                quarter = 4;
                year--;
            } else if (month < 7) {
                quarter = 1;
            } else if (month < 10) {
                quarter = 2;
            }
            let latestQuarter = 0;
            let latestYear = 0;
            if (stage === 0) {
                return handleError(new HoError('no finance data'));
            } else {
                let id_db = null;
                let normal_tags = [];
                let not = 0;
                let profit = 0;
                let equity = 0;
                let netValue = 0;
                let dividends = 0;
                let needDividends = false;
                const final_stage = price => {
                    return handleStockTagV2(type, index, obj.tag).then(([name, tags]) => {
                        let stock_default = [];
                        for (let t of tags) {
                            const normal = normalize(t);
                            if (!isDefaultTag(normal)) {
                                if (normal_tags.indexOf(normal) === -1) {
                                    normal_tags.push(normal);
                                    stock_default.push(normal);
                                }
                            }
                        }
                        const per = (profit <= 0) ? 9999 : Math.round(price / profit * equity * 10) / 100;
                        const pdr = (dividends <= 0) ? 9999 : Math.round(price / dividends * equity * 10) / 100;
                        const pbr = (netValue <= 0) ? 9999 : Math.round(price / netValue * equity * 10) / 100;
                        console.log(per);
                        console.log(pdr);
                        console.log(pbr);
                        const retObj = () => id_db ? Mongo('update', STOCKDB, {_id: id_db}, {$set: {
                            price,
                            profit,
                            equity,
                            dividends,
                            netValue,
                            per,
                            pdr,
                            pbr,
                            latestQuarter,
                            latestYear,
                            tags: normal_tags,
                            name,
                            stock_default,
                        }}).then(item => id_db) : Mongo('insert', STOCKDB, {
                            type,
                            index,
                            name,
                            price,
                            profit,
                            equity,
                            dividends,
                            netValue,
                            per,
                            pdr,
                            pbr,
                            latestQuarter,
                            latestYear,
                            //tags: normal_tags,
                            important: 0,
                            stock_default,
                        }).then(item => Mongo('update', STOCKDB, {_id: item[0]._id}, {$set: {tags: normal_tags}}).then(() => item[0]._id));
                        return retObj().then(id => {
                            return StockTagTool.addTag(id, `${updateyear}q${updatequarter}`, {_id:'000000000000000000000000'}).then(add_result => {
                                sendWs({
                                    type: 'stock',
                                    data: add_result.id,
                                }, 0, 1);
                            }).catch(err => {
                                handleError(err, 'Stock filter');
                            }).then(() => ({
                                per,
                                pdr,
                                pbr,
                                latestQuarter,
                                latestYear,
                                stockName: `${type} ${index} ${name}`,
                                id,
                            }));
                        });
                    });
                }
                let wait_count = 0;
                const recur_getTwseProfit = () => {
                    console.log(year);
                    console.log(quarter);
                    return Api('url', `https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=${index}&SYEAR=${year}&SSEASON=${quarter}&REPORT_ID=${reportType}`, {big5: true}).then(raw_data => {
                        if (findTag(Htmlparser.parseDOM(raw_data), 'h4')[0]) {
                            if (latestQuarter) {
                                return handleError(new HoError('too short stock data'));
                            } else {
                                not++;
                                if (not > 8) {
                                    return handleError(new HoError('cannot find stock data'));
                                } else {
                                    if (reportType === 'C') {
                                        reportType = 'A';
                                        return recur_getTwseProfit();
                                    } else {
                                        quarter--;
                                        if (quarter < 1) {
                                            quarter = 4;
                                            year--;
                                        }
                                        reportType = 'C';
                                        return recur_getTwseProfit();
                                    }
                                }
                            }
                        } else if (raw_data.match(/\>Overrun \- /)) {
                            if (wait_count >= 10) {
                                return handleError(new HoError('too much wait'));
                            } else {
                                wait_count++;
                                console.log('wait');
                                console.log(wait_count);
                                return new Promise((resolve, reject) => setTimeout(() => resolve(recur_getTwseProfit()), _overrunDelay));
                            }
                        } else {
                            wait_count = 0;
                            let profitArr = findFirstParameterArray(raw_data, PROFIT_CODES, PROFIT_LABEL);
                            if (!profitArr) {
                                return handleError(new HoError('cannot find stock profit'));
                            }
                            if (!equity) {
                                equity = findFirstParameter(raw_data, EQUITY_CODES, EQUITY_LABEL);
                                if (!equity) {
                                    return handleError(new HoError('cannot find stock equity'));
                                }
                            }
                            if (!netValue) {
                                netValue = findFirstParameterPairs(raw_data, NETVALUE_PAIRS);
                                if (!netValue) {
                                    return handleError(new HoError('cannot find stock net value'));
                                }
                            }
                            const matchDividends = getParameterV2(raw_data, 'C04500');
                            if (matchDividends && matchDividends[0] > dividends) {
                                dividends = matchDividends[0];
                            }
                            switch (quarter) {
                                case 4:
                                profit += profitArr[0];
                                console.log(profit);
                                console.log(equity);
                                console.log(netValue);
                                console.log(dividends);
                                if (!latestQuarter) {
                                    latestQuarter = quarter;
                                    latestYear = year;
                                }
                                if (dividends === 0) {
                                    quarter = 3;
                                    needDividends = true;
                                    return recur_getTwseProfit();
                                } else {
                                    return getStockPrice(type, index).then(price => final_stage(price));
                                }
                                break;
                                case 3:
                                case 2:
                                if (needDividends) {
                                    console.log(profit);
                                    console.log(equity);
                                    console.log(netValue);
                                    console.log(dividends);
                                    return getStockPrice(type, index).then(price => final_stage(price));
                                }
                                profit += profitArr[2];
                                profit -= profitArr[3];
                                break;
                                case 1:
                                profit += profitArr[0];
                                profit -= profitArr[1];
                                break;
                            }
                            latestQuarter = quarter;
                            latestYear = year;
                            quarter = 4;
                            year--;
                            return recur_getTwseProfit();
                        }
                    });
                }
                return Mongo('find', STOCKDB, {type, index}, {limit: 1}).then(items => {
                    if (items.length > 0) {
                        id_db = items[0]._id;
                        for (let i of items[0].tags) {
                            if (items[0].stock_default) {
                                if (!items[0].stock_default.includes(i)) {
                                    normal_tags.push(i);
                                }
                            } else {
                                normal_tags.push(i);
                            }
                        }
                    }
                    return recur_getTwseProfit();
                });
            }
            break;
            case 'usse':
            if (stage === 0) {
                return handleError(new HoError('no finance data'));
            } else {
                let id_db = null;
                let normal_tags = [];
                return Mongo('find', STOCKDB, {type, index}, {limit: 1}).then(items => {
                    if (items.length > 0) {
                        id_db = items[0]._id;
                        for (let i of items[0].tags) {
                            if (items[0].stock_default) {
                                if (!items[0].stock_default.includes(i)) {
                                    normal_tags.push(i);
                                }
                            } else {
                                normal_tags.push(i);
                            }
                        }
                    }
                    return getUsStock(index, ['price', 'per', 'pdr', 'pbr', 'equity'], back).then(ret => handleStockTagV2(type, index, obj.tag).then(([name, tags]) => {
                        console.log(ret);
                        let stock_default = [];
                        for (let t of tags) {
                            const normal = normalize(t);
                            if (!isDefaultTag(normal)) {
                                if (normal_tags.indexOf(normal) === -1) {
                                    normal_tags.push(normal);
                                    stock_default.push(normal);
                                }
                            }
                        }
                        const retObj = () => id_db ? Mongo('update', STOCKDB, {_id: id_db}, {$set: {
                            price: ret.price,
                            per: ret.per,
                            pdr: ret.pdr,
                            pbr: ret.pbr,
                            equity: ret.equity,
                            latestQuarter: ret.latestQuarter,
                            latestYear: ret.latestYear,
                            tags: normal_tags,
                            name,
                            stock_default,
                        }}).then(item => id_db) : Mongo('insert', STOCKDB, {
                            type,
                            index,
                            name,
                            price: ret.price,
                            per: ret.per,
                            pdr: ret.pdr,
                            pbr: ret.pbr,
                            equity: ret.equity,
                            latestQuarter: ret.latestQuarter,
                            latestYear: ret.latestYear,
                            //tags: normal_tags,
                            important: 0,
                            stock_default,
                        }).then(item => Mongo('update', STOCKDB, {_id: item[0]._id}, {$set: {tags: normal_tags}}).then(() => item[0]._id));
                        return retObj().then(id => {
                            return StockTagTool.addTag(id, `${updateyear}q${updatequarter}`, {_id:'000000000000000000000000'}).then(add_result => {
                                sendWs({
                                    type: 'stock',
                                    data: add_result.id,
                                }, 0, 1);
                            }).catch(err => {
                                handleError(err, 'Stock filter');
                            }).then(() => ({
                                per: ret.per,
                                pdr: ret.pdr,
                                pbr: ret.pbr,
                                equity: ret.equity,
                                latestQuarter: ret.latestQuarter,
                                latestYear: ret.latestYear,
                                stockName: `${type} ${index} ${name}`,
                                id,
                            }));
                        });
                    }));
                });
            }
            break;
            default:
            return handleError(new HoError('stock type unknown!!!'));
        }
    },
    getStockPERV2: function(id) {
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            const start = (items[0].latestQuarter === 0) ? `${items[0].latestYear - 1912}12` : `${items[0].latestYear - 1911}${completeZero(items[0].latestQuarter*3, 2)}`;
            switch(items[0].type) {
                case 'twse':
                return getStockPrice(items[0].type, items[0].index).then(price => {
                    const per = (items[0].profit <= 0) ? 9999 : Math.round(price / items[0].profit * items[0].equity * 10) / 100;
                    const pdr = (items[0].dividends <= 0) ? 9999 : Math.round(price / items[0].dividends * items[0].equity * 10) / 100;
                    const pbr = (items[0].netValue <= 0) ? 9999 : Math.round(price / items[0].netValue * items[0].equity * 10) / 100;
                    return [(per > 0) ? per : 9999, (pdr > 0) ? pdr : 9999, (pbr > 0) ? pbr : 9999, items[0].index, start];
                });
                case 'usse':
                return getUsStock(items[0].index, ['price', 'per', 'pbr']).then(ret => [ret.per, items[0].pdr, ret.pbr, items[0].index, start]);
                default:
                return handleError(new HoError('stock type unknown!!!'));
            }
        });
    },
    testData: function() {
        return Mongo('find', STOCKDB, {}).then(items => {
            const recur_test = index => (index >= items.length) ? Promise.resolve() : Redis('hgetall', `interval: ${items[index].type}${items[index].index}`).then(item => {
                const getInit = () => item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                return getInit();
            }).then(([raw_list, ret_obj, etime]) => {
                console.log(items[index].index + items[index].name);
                if (!raw_list) {
                    console.log(`${items[index].type} ${items[index].index} data empty`);
                } else {
                    let isnull = false;
                    for (let i in raw_list) {
                        console.log(i);
                        for (let j in raw_list[i]) {
                            for (let k = 0; k < raw_list[i][j].raw.length; k++) {
                                if (!raw_list[i][j].raw[k].h || !raw_list[i][j].raw[k].l) {
                                    console.log(j);
                                    console.log(k);
                                    console.log(raw_list[i][j].raw[k]);
                                    console.log(`${items[index].type} ${items[index].index} data miss`);
                                    Redis('hmset', `interval: ${items[index].type}${items[index].index}`, {
                                            raw_list: false,
                                            ret_obj: 0,
                                            etime: -1,
                                    }).catch(err => handleError(err, 'Redis'));
                                    isnull = true;
                                    break;
                                }
                            }
                            if (isnull) {
                                break;
                            }
                        }
                        if (isnull) {
                            break;
                        }
                    }
                }
                return recur_test(index + 1);
            });
            return recur_test(0);
        });
    },
    cleanUseless: function(dryRun = true) {
        const date = _dateFactory();
        let updateyear = date.getFullYear();
        let updatequarter = 3;
        const month = date.getMonth() + 1;
        if (month < 4) {
            updatequarter = 4;
            updateyear--;
        } else if (month < 7) {
            updatequarter = 1;
        } else if (month < 10) {
            updatequarter = 2;
        }
        const latestQuarter = `${updateyear}q${updatequarter}`;
        //const latestQuarter = "美國";
        const keepList = [];
        console.log(`keep tag: ${latestQuarter}`);
        return Mongo('find', STOCKDB, {tags:{$nin:[latestQuarter]}}).then(items => {
            const recur_remove = index => (index >= items.length) ? Promise.resolve() : Mongo('find', TOTALDB, {index: items[index].index, setype: items[index].type}, {limit: 1}).then(stock => {
                if (stock.length < 1) {
                    if (dryRun) {
                        console.log(`dry run ${items[index].type} ${items[index].index} ${items[index].name}`);
                        return recur_remove(index + 1);
                    } else {
                        console.log(`remove ${items[index].type} ${items[index].index} ${items[index].name}`);
                        return Mongo('deleteMany', STOCKDB, {_id: items[index]._id}).then(() => recur_remove(index + 1));
                    }
                } else {
                    keepList.push(`${items[index].type} ${items[index].index} ${items[index].name}`);
                    return recur_remove(index + 1);
                }
            });
            return recur_remove(0).then(() => {
                if (keepList.length > 0) {
                    console.log("In total but out of list:");
                    keepList.forEach(k => console.log(k));
                }
            });
        });
    },
    getIntervalV2: function(id, session) {
        const date = _dateFactory();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let month_str = completeZero(month.toString(), 2);
        let vol_year = year;
        let vol_month = month;
        let vol_month_str = month_str;
        console.log(year);
        console.log(month_str);
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            switch(items[0].type) {
                case 'twse':
                StockTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
                return Redis('hgetall', `interval: ${items[0].type}${items[0].index}`).then(item => {
                    const getInit = () => item ? [JSON.parse(item.raw_list), item.adjustments ? JSON.parse(item.adjustments) : [], item.ret_obj, item.etime] : [null, [], 0, -1];
                    return getInit();
                }).then(([raw_list, cached_adjustments, ret_obj, etime]) => {
                    let interval_data = null;
                    let start_month = '';
                    let max = 0;
                    let min = 0;
                    let raw_arr = [];
                    let latestAdjustments = cached_adjustments;
                    const rest_interval = (type, index, is_stop=false) => {
                        index++;
                        if (month === 1) {
                            year--;
                            month = 12;
                            month_str = completeZero(month.toString(), 2);
                        } else {
                            month--;
                            month_str = completeZero(month.toString(), 2);
                        }
                        console.log(year);
                        console.log(month_str);
                        if (!is_stop && index < 60 && raw_arr.length <= 1000) {
                            return recur_mi(type, index);
                        }
                        // Adjust prices using TWSE/TPEx official APIs
                        const adjustWithTwse = () => {
                            if (!interval_data) return Promise.resolve([]);
                            return fetchTwseAdjustments(items[0].index, type);
                        };
                        return adjustWithTwse().then(newAdjustments => {
                        latestAdjustments = newAdjustments;
                        if (newAdjustments.length > 0) {
                            const { adjustedData, raw_arr: adjArr, max: adjMax, min: adjMin } = applyAdjustments(interval_data, newAdjustments);
                            raw_arr = adjArr;
                            max = adjMax;
                            min = adjMin;
                        }
                        validateIntervalData(interval_data, raw_arr, newAdjustments);
                        console.log(max);
                        console.log(min);
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year] && interval_data[vol_year][vol_month_str]; i--) {
                            //min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
                            interval_data[vol_year][vol_month_str].raw.forEach(v => {
                                if (!min_vol || (v.v && v.v < min_vol)) {
                                    min_vol = v.v;
                                }
                            });
                            if (vol_month === 1) {
                                vol_month = 12;
                                vol_year--;
                                vol_month_str = completeZero(vol_month.toString(), 2);
                            } else {
                                vol_month--;
                                vol_month_str = completeZero(vol_month.toString(), 2);
                            }
                        }
                        console.log(min_vol);
                        const bins = computeBinCount(raw_arr);
                        const loga = logArray(max, min, bins);
                        const web = calStair(raw_arr, loga, min);
                        console.log(web);
                        return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => {
                            console.log(item);
                            if (!web) {
                                return [interval_data, 'no profit'];
                            }
                            //update total
                            const restTest = () => getStockPrice(items[0].type, items[0].index).then(price => {
                                const results = [];
                                let lastest_type = 0;
                                let lastest_rate = 0;
                                const pricePct = Math.round((+price - web.mid) / web.mid * 10000) / 100;
                                const resultShow = type => {
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, raw_arr.length - 1, false, 0)).then(temp => {
                                        if (temp === 'data miss') {
                                            return Promise.resolve(true);
                                        }
                                        const m = temp.metrics;
                                        if (!m || (m.returnPct === 0 && m.sellTrade === 0 && m.stopLoss === 0)) {
                                            results.push({ type, str: 'no less than mid point', metrics: null, rate: -Infinity });
                                            return;
                                        }
                                        const winLoss = m.avgLoss > 0 ? Math.round(m.avgWin / m.avgLoss * 100) / 100 : 0;
                                        //const str = `${pricePct}% ${m.maxAmount} ${m.returnPct}% ${m.buyHoldPct}% ${m.sharpe} ${m.sortino} ${m.maxDrawdownPct}% ${m.maxDrawdownDuration} ${m.winRate}% ${winLoss} ${m.profitFactor} ${m.tradesPerYear} ${m.calmar} ${raw_arr.length} ${min_vol}`;
                                        const str = `${pricePct}% ${m.sortino} ${m.profitFactor}`;
                                        results.push({ type, str, metrics: m, rate: m.returnPct });
                                        return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, 0, true)).then(rtemp => {
                                            if (rtemp === 'data miss') {
                                                return;
                                            }
                                            const rm = rtemp.metrics;
                                            if (rm && (rm.returnPct !== 0 || rm.sellTrade !== 0 || rm.stopLoss !== 0)) {
                                                if (!lastest_rate || rm.returnPct > lastest_rate) {
                                                    lastest_rate = rm.returnPct;
                                                    lastest_type = type;
                                                }
                                            }
                                        });
                                    });
                                }
                                const loopShow = index => {
                                    if (index >= 0) {
                                        return resultShow(index).then(result => {
                                            if (result) {
                                                return handleError(new HoError(`${items[0].index} data miss!!!`));
                                            } else {
                                                return loopShow(index - 1);
                                            }
                                        });
                                    } else {
                                        return Promise.resolve();
                                    }
                                }
                                //return loopShow(31).then(() => {
                                return loopShow(0).then(() => {
                                    results.forEach(r => console.log(r.str));
                                    console.log(lastest_type);
                                    console.log('done');
                                    const sorted = results.filter(r => r.metrics);
                                    sorted.sort((a, b) => b.rate - a.rate);
                                    const bestIdx = sorted.length > 0 ? Math.ceil(sorted.length / 2) - 1 : -1;
                                    const bestStr = bestIdx >= 0 ? sorted[bestIdx].str : 'no less than mid point';
                                    const bestMetrics = bestIdx >= 0 ? sorted[bestIdx].metrics : null;
                                    return [interval_data, bestStr, lastest_type, bestMetrics];
                                });
                            });
                            return Mongo('find', TOTALDB, {index: items[0].index}).then(item => {
                                const recur_web = (index, type) => {
                                    if (index >= item.length) {
                                        return Promise.resolve();
                                    } else {
                                        const newWeb = adjustWeb(web.arr, web.mid, item[index].orig, true);
                                        return Mongo('update', TOTALDB, {_id: item[index]._id}, {$set: {
                                            web: newWeb.arr,
                                            mid: newWeb.mid,
                                            times: newWeb.times,
                                            wType: type,
                                            extrem: web.extrem,
                                            metrics: web.metrics || null,
                                        }}).then(() => recur_web(index + 1));
                                    }
                                }
                                return restTest().then(([result, index, type, metrics]) => {
                                    web.type = type;
                                    if (metrics) web.metrics = metrics;
                                    return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => recur_web(0, type).then(() => [result, index]));
                                });
                            });
                        })
                        });
                    }
                    const getTpexList = () => Api('url', `https://www.tpex.org.tw//www/zh-tw/afterTrading/tradingStock?code=4966&date=${year}/${month_str}/01&id=&response=utf-8&_=${_dateFactory().getTime()}`).then(raw_data => {
                        const { high, low, vol, day: dayArr, isStop } = parseStockCsv(raw_data, year, month_str);
                        return isStop ? [2, {high, low, vol, day: dayArr}, true] : [2, {high, low, vol, day: dayArr}];
                    });
                    const getTwseList = () => new Promise((resolve, reject) => setTimeout(() => resolve(), _twseDelay)).then(() => Api('url', `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=${year}${month_str}01&stockNo=${items[0].index}`).then(raw_data => {
                        const { high, low, vol, day: dayArr, isStop } = parseStockCsv(raw_data, year, month_str);
                        return isStop ? [3, {high, low, vol, day: dayArr}, true] : [3, {high, low, vol, day: dayArr}];
                    }));
                    const recur_mi = (type, index) => {
                        const getList = () => {
                            if (type === 2) {
                                return getTpexList();
                            } else if (type === 3) {
                                return getTwseList();
                            } else {
                                const getType = () => getTwseList().then(([type, list]) => (list.high.length > 0) ? [type, list] : getTpexList().then(([type, list]) => (list.high.length > 0) ? [type, list] : [1, list]));
                                return getType();
                            }
                        }
                        if (start_month && raw_list && raw_list[year] && raw_list[year][month_str]) {
                            raw_arr = raw_arr.concat(raw_list[year][month_str].raw.slice().reverse());
                            if (raw_list[year][month_str].max > max) {
                                max = raw_list[year][month_str].max;
                            }
                            if (!min || raw_list[year][month_str].min < min) {
                                min = raw_list[year][month_str].min;
                            }
                            if (!interval_data) {
                                interval_data = {};
                            }
                            if (!interval_data[year]) {
                                interval_data[year] = {};
                            }
                            interval_data[year][month_str] = {
                                raw: raw_list[year][month_str].raw,
                                max: raw_list[year][month_str].max,
                                min: raw_list[year][month_str].min,
                            };
                            return rest_interval(type, index);
                        } else {
                            return getList().then(([type, list, is_stop]) => {
                                if (list.high.length > 0) {
                                    if (!start_month) {
                                        start_month = `${year}${month_str}`;
                                    }
                                    let tmp_interval = [];
                                    let tmp_max = 0;
                                    let tmp_min = 0;
                                    for (let i in list.high) {
                                        if (list.high[i] > max) {
                                            max = list.high[i];
                                        }
                                        if (!min || list.low[i] < min) {
                                            min = list.low[i];
                                        }
                                        if (list.high[i] > tmp_max) {
                                            tmp_max = list.high[i];
                                        }
                                        if (!tmp_min || list.low[i] < tmp_min) {
                                            tmp_min = list.low[i];
                                        }
                                        tmp_interval.push({
                                            h: list.high[i],
                                            l: list.low[i],
                                            v: list.vol[i],
                                            d: list.day && list.day[i] ? list.day[i] : Number(i) + 1,
                                        });
                                    }
                                    if (!interval_data) {
                                        interval_data = {};
                                    }
                                    if (!interval_data[year]) {
                                        interval_data[year] = {};
                                    }
                                    interval_data[year][month_str] = {
                                        raw: tmp_interval,
                                        max: tmp_max,
                                        min: tmp_min,
                                    };
                                    raw_arr = raw_arr.concat(tmp_interval.slice().reverse());
                                }
                                return rest_interval(type, index, is_stop);
                            });
                        }
                    }
                    const exGet = () => (etime === -1 || !etime || etime < (_dateFactory().getTime()/1000)) ? recur_mi(1, 0) : Promise.resolve([null, ret_obj]);
                    return exGet().then(([raw_list, ret_obj]) => {
                        if (raw_list) {
                            Redis('hmset', `interval: ${items[0].type}${items[0].index}`, {
                                raw_list: JSON.stringify(raw_list),
                                adjustments: JSON.stringify(latestAdjustments),
                                ret_obj,
                                etime: Math.round(_dateFactory().getTime()/1000 + CACHE_EXPIRE),
                            }).catch(err => handleError(err, 'Redis'));
                        }
                        return [ret_obj, items[0].index];
                    });
                });
                break;
                case 'usse':
                StockTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
                return Redis('hgetall', `interval: ${items[0].type}${items[0].index}`).then(item => {
                    const getInit = () => item ? [JSON.parse(item.raw_list), item.adjustments ? JSON.parse(item.adjustments) : [], item.ret_obj, item.etime] : [null, [], 0, -1];
                    return getInit();
                }).then(([raw_list, cached_adjustments, ret_obj, etime]) => {
                    let interval_data = null;
                    /*if (month === 1) {
                        year--;
                        month = 12;
                        month_str = completeZero(month.toString(), 2);
                    } else {
                        month--;
                        month_str = completeZero(month.toString(), 2);
                    }*/
                    let start_get = new Date(year, month - 1, day, 12).getTime() / 1000;
                    let end_get = new Date(year - 5, month - 1, day, 12).getTime() / 1000;
                    let start_month = `${year}${month_str}`;
                    let max = 0;
                    let min = 0;
                    let raw_arr = [];
                    let min_vol = 0;
                    let latestAdjustments = cached_adjustments;
                    const rest_interval = () => {
                        console.log(max);
                        console.log(min);
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year] && interval_data[vol_year][vol_month_str]; i--) {
                            //min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
                            interval_data[vol_year][vol_month_str].raw.forEach(v => {
                                if (!min_vol || (v.v && v.v < min_vol)) {
                                    min_vol = v.v;
                                }
                            });
                            if (vol_month === 1) {
                                vol_month = 12;
                                vol_year--;
                                vol_month_str = completeZero(vol_month.toString(), 2);
                            } else {
                                vol_month--;
                                vol_month_str = completeZero(vol_month.toString(), 2);
                            }
                        }
                        console.log(min_vol);
                        const bins = computeBinCount(raw_arr);
                        const loga = logArray(max, min, bins);
                        const web = calStair(raw_arr, loga, min, 0, USSE_FEE);
                        console.log(web);
                        return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => {
                            console.log(item);
                            if (!web) {
                                return [interval_data, 'no profit'];
                            }
                            //update total
                            const restTest = () => getStockPrice(items[0].type, items[0].index).then(price => {
                                const results = [];
                                let lastest_type = 0;
                                let lastest_rate = 0;
                                const pricePct = Math.round((+price - web.mid) / web.mid * 10000) / 100;
                                const resultShow = type => {
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, raw_arr.length - 1, false, 0, RANGE_INTERVAL, USSE_FEE)).then(temp => {
                                        if (temp === 'data miss') {
                                            return Promise.resolve(true);
                                        }
                                        const m = temp.metrics;
                                        if (!m || (m.returnPct === 0 && m.sellTrade === 0 && m.stopLoss === 0)) {
                                            results.push({ type, str: 'no less than mid point', metrics: null, rate: -Infinity });
                                            return;
                                        }
                                        const winLoss = m.avgLoss > 0 ? Math.round(m.avgWin / m.avgLoss * 100) / 100 : 0;
                                        const str = `${pricePct}% ${m.sortino} ${m.profitFactor}`;
                                        //const str = `${pricePct}% ${m.maxAmount} ${m.returnPct}% ${m.buyHoldPct}% ${m.sharpe} ${m.sortino} ${m.maxDrawdownPct}% ${m.maxDrawdownDuration} ${m.winRate}% ${winLoss} ${m.profitFactor} ${m.tradesPerYear} ${m.calmar} ${raw_arr.length} ${min_vol}`;
                                        results.push({ type, str, metrics: m, rate: m.returnPct });
                                        return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, 0, true, 200, RANGE_INTERVAL, USSE_FEE)).then(rtemp => {
                                            if (rtemp === 'data miss') {
                                                return;
                                            }
                                            const rm = rtemp.metrics;
                                            if (rm && (rm.returnPct !== 0 || rm.sellTrade !== 0 || rm.stopLoss !== 0)) {
                                                if (!lastest_rate || rm.returnPct > lastest_rate) {
                                                    lastest_rate = rm.returnPct;
                                                    lastest_type = type;
                                                }
                                            }
                                        });
                                    });
                                }
                                const loopShow = index => {
                                    if (index >= 0) {
                                        return resultShow(index).then(result => {
                                            if (result) {
                                                return handleError(new HoError(`${items[0].index} data miss!!!`));
                                            } else {
                                                return loopShow(index - 1);
                                            }
                                        });
                                    } else {
                                        return Promise.resolve();
                                    }
                                }
                                //return loopShow(31).then(() => {
                                return loopShow(0).then(() => {
                                    results.forEach(r => console.log(r.str));
                                    console.log(lastest_type);
                                    console.log('done');
                                    const sorted = results.filter(r => r.metrics);
                                    sorted.sort((a, b) => b.rate - a.rate);
                                    const bestIdx = sorted.length > 0 ? Math.ceil(sorted.length / 2) - 1 : -1;
                                    const bestStr = bestIdx >= 0 ? sorted[bestIdx].str : 'no less than mid point';
                                    const bestMetrics = bestIdx >= 0 ? sorted[bestIdx].metrics : null;
                                    return [interval_data, bestStr, lastest_type, bestMetrics];
                                });
                            });
                            return Mongo('find', TOTALDB, {index: items[0].index}).then(item => {
                                const recur_web = (index, type) => {
                                    if (index >= item.length) {
                                        return Promise.resolve();
                                    } else {
                                        const newWeb = adjustWeb(web.arr, web.mid, item[index].orig, true);
                                        return Mongo('update', TOTALDB, {_id: item[index]._id}, {$set: {
                                            web: newWeb.arr,
                                            mid: newWeb.mid,
                                            times: newWeb.times,
                                            wType: type,
                                            extrem: web.extrem,
                                            metrics: web.metrics || null,
                                        }}).then(() => recur_web(index + 1));
                                    }
                                }
                                return restTest().then(([result, index, type, metrics]) => {
                                    web.type = type;
                                    if (metrics) web.metrics = metrics;
                                    return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => recur_web(0, type).then(() => [result, index]));
                                });
                            });
                        })
                    }
                    const get_mi = index => {
                        if (raw_list) {
                            let isEnd = false;
                            for (let i = 0; i < 60; i++) {
                                if (raw_list[year] && raw_list[year][month_str]) {
                                    if (!isEnd) {
                                        isEnd = true;
                                        end_get = new Date(year, month - 1, 1, 12).getTime() / 1000;
                                    }
                                    if (!interval_data) {
                                        interval_data = {};
                                    }
                                    if (!interval_data[year]) {
                                        interval_data[year] = {};
                                    }
                                    interval_data[year][month_str] = {
                                        raw: raw_list[year][month_str].raw,
                                        max: raw_list[year][month_str].max,
                                        min: raw_list[year][month_str].min,
                                    };
                                }
                                if (month === 1) {
                                    year--;
                                    month = 12;
                                    month_str = completeZero(month.toString(), 2);
                                } else {
                                    month--;
                                    month_str = completeZero(month.toString(), 2);
                                }
                            }
                        }
                        const getFinance = () => yahooFinance.chart(items[0].index, {
                            period1: end_get,
                            period2: start_get,
                            events:'capitalGain|div|split',
                            includeAdjustedClose: true,
                            interval: "1d",
                            useYfid: true,
                            lang:"en-US",
                            return: "object"
                        }).then(stockData => {
                            const timestamps = stockData.timestamp;
                            const quotes = stockData.indicators.quote[0];

                            // Extract adjustment events from Yahoo response
                            const newAdjustments = extractUsseAdjustments(stockData, timestamps, quotes);
                            if (newAdjustments.length > 0 || cached_adjustments.length > 0) {
                                // Merge: use new events (they are authoritative for the fetched range)
                                latestAdjustments = newAdjustments;
                            }

                            // Store RAW unadjusted data with day field
                            let y = '';
                            let m = '';
                            let tmp_interval = [];
                            let tmp_max = 0;
                            let tmp_min = 0;
                            for (let i = 0; i < timestamps.length - 1; i++) {
                                const sDate = convertTimestampToDate(timestamps[i]);
                                if (sDate.year !== y || sDate.month !== m) {
                                    if (y && m) {
                                        if (!interval_data) {
                                            interval_data = {};
                                        }
                                        if (!interval_data[y]) {
                                            interval_data[y] = {};
                                        }
                                        interval_data[y][m] = {
                                            raw: tmp_interval.slice().reverse(),
                                            max: tmp_max,
                                            min: tmp_min,
                                        };
                                        tmp_interval = [];
                                        tmp_max = 0;
                                        tmp_min = 0;
                                    }
                                    y = sDate.year;
                                    m = sDate.month;
                                }
                                const rawHigh = Number(quotes.high[i]);
                                const rawLow = Number(quotes.low[i]);
                                tmp_interval.push({
                                    h: rawHigh,
                                    l: rawLow,
                                    v: Number(quotes.volume[i]),
                                    d: Number(sDate.day),
                                });
                                if (rawHigh > tmp_max) {
                                    tmp_max = rawHigh;
                                }
                                if (!tmp_min || rawLow < tmp_min) {
                                    tmp_min = rawLow;
                                }
                            }
                            if (y && m) {
                                if (!interval_data) {
                                    interval_data = {};
                                }
                                if (!interval_data[y]) {
                                    interval_data[y] = {};
                                }
                                interval_data[y][m] = {
                                    raw: tmp_interval.slice().reverse(),
                                    max: tmp_max,
                                    min: tmp_min,
                                };
                            }

                            // Apply adjustments to raw data
                            const { raw_arr: adjArr, max: adjMax, min: adjMin } = applyAdjustments(interval_data, latestAdjustments);
                            raw_arr = adjArr;
                            max = adjMax;
                            min = adjMin;

                            validateIntervalData(interval_data, raw_arr, latestAdjustments);
                            return rest_interval();
                        });
                        return getFinance();
                    }
                    const exGet = () => (etime === -1 || !etime || etime < (_dateFactory().getTime()/1000)) ? get_mi() : Promise.resolve([null, ret_obj]);
                    return exGet().then(([raw_list, ret_obj]) => {
                        if (raw_list) {
                            Redis('hmset', `interval: ${items[0].type}${items[0].index}`, {
                                raw_list: JSON.stringify(raw_list),
                                adjustments: JSON.stringify(latestAdjustments),
                                ret_obj,
                                etime: Math.round(_dateFactory().getTime()/1000 + CACHE_EXPIRE),
                            }).catch(err => handleError(err, 'Redis'));
                        }
                        return [ret_obj, items[0].index];
                    });
                });
                break;
                default:
                return handleError(new HoError('stock type unknown!!!'));
            }
        });
    },
    getIntervalWarp: function(id, session) {
        if (stockIntervaling) {
            return handleError(new HoError('there is another inverval running'));
        }
        stockIntervaling = true;
        return this.getIntervalV2(id, session).then(([result, index]) => {
            stockIntervaling = false;
            return [result, index];
        }).catch(err => {
            stockIntervaling = false;
            return handleError(err);
        });
    },
    stockFilterV4: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        const date = _dateFactory();
        let updateyear = date.getFullYear();
        let updatequarter = 3;
        const month = date.getMonth() + 1;
        if (month < 4) {
            updatequarter = 4;
            updateyear--;
        } else if (month < 7) {
            updatequarter = 1;
        } else if (month < 10) {
            updatequarter = 2;
        }
        const web = option ? true : false;
        if (!option) {
            option = STOCK_FILTER;
        }
        console.log(`filter update: ${updateyear}q${updatequarter}`);
        let last = false;
        let queried = 0;
        let filterList = [];
        const etfList = [];
        const marketcapList = [];
        const clearName = () => StockTagTool.tagQuery(queried, option.name, true, 0, option.sortName, option.sortType, user, {}, STOCK_FILTER_LIMIT).then(result => {
            console.log(result.items.length);
            const delFilter = index => (index < result.items.length) ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(del_result => {
                sendWs({
                    type: 'stock',
                    data: del_result.id,
                }, 0, 1);
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${result.items[index].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
                sendWs(`stock filter: ${(err.message || err.msg)}`, 0, 0, true);
            }).then(() => delFilter(index+1)) : Promise.resolve();
            return delFilter(0);
        });
        const recur_query = () => StockTagTool.tagQuery(queried, `${updateyear}q${updatequarter}`, true, 0, option.sortName, option.sortType, user, session, STOCK_FILTER_LIMIT).then(result => {
            console.log(queried);
            if (result.items.length < STOCK_FILTER_LIMIT) {
                last = true;
            }
            queried += result.items.length;
            if (result.items.length < 1) {
                return filterList;
            }
            const recur_ETFMcap = index => {
                if (index < result.items.length) {
                    const i = result.items[index];
                    console.log(i.type + ' ' + i.index);
                    return getStockPrice(i.type, i.index).then(price => {
                        etfList.push(i.type + ' ' + i.index);
                        i.mcap = (i.equity && price) ? i.equity * price : 0;
                        console.log(i.mcap);
                        marketcapList.push(i.mcap);
                        if (i.tags.indexOf('tw50') !== -1) {
                            i.etf = 5;
                        } else if (i.tags.indexOf('tw100') !== -1) {
                            i.etf = 4;
                        } else if (i.tags.indexOf('dow jones') !== -1) {
                            i.etf = 3;
                        } else if (i.tags.indexOf('nasdaq 100') !== -1) {
                            i.etf = 2;
                        } else if (i.tags.indexOf('s&p 500') !== -1) {
                            i.etf = 1;
                        } else {
                            i.etf = 0;
                        }
                        console.log(i.etf);
                        filterList.push(i);
                        return recur_ETFMcap(index + 1);
                    });
                } else {
                    if (!last) {
                        return recur_query();
                    }
                    return filterList;
                }
            }
            return recur_ETFMcap(0);
        });
        return clearName().then(() => recur_query()).then(filterList => {
            filterList.sort((a, b) => (a.etf !== b.etf) ? (b.etf - a.etf) : (b.mcap - a.mcap));
            const filterList1 = [];
            let tw50 = 0;
            let tw100 = 0;
            let dow = 0;
            let nas = 0;
            let sp = 0;
            const twseNum = Math.floor(TWSE_NUM / 2);
            const usseNum = Math.floor(USSE_NUM / 3);
            const stage3 = iIndex => {
                if (iIndex < filterList.length) {
                    console.log(filterList[iIndex].index);
                    console.log(filterList[iIndex].etf);
                    console.log(filterList[iIndex].mcap);
                    if (filterList[iIndex].etf === 5 && tw50 < twseNum) {
                        tw50++;
                    } else if (filterList[iIndex].etf === 4 && tw100 < twseNum) {
                        tw100++;
                    } else if (filterList[iIndex].etf === 3 && dow < usseNum) {
                        dow++;
                    } else if (filterList[iIndex].etf === 2 && nas < usseNum) {
                        nas++;
                    } else if (filterList[iIndex].etf === 1 && sp < usseNum) {
                        sp++;
                    } else {
                        return stage3(iIndex + 1);
                    }
                    return this.getIntervalWarp(filterList[iIndex]._id, session).then(([result, index]) => {
                        console.log(filterList[iIndex].name);
                        console.log(result);
                        filterList[iIndex].name = filterList[iIndex].name + result;
                        filterList1.push(filterList[iIndex]);
                    }).catch(err => {
                        if (web) {
                            sendWs({
                                type: user.username,
                                data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                            }, 0);
                        }
                        handleError(err, 'Stock filter');
                        sendWs(`stock filter: ${(err.message || err.msg)}`, 0, 0, true);
                    }).then(() => stage3(iIndex + 1));
                } else {
                    return Promise.resolve();
                }
            }
            console.log('stage three');
            return stage3(0).then(() => filterList1);
        }).then(filterList => {
            const addFilter = index => (index < filterList.length) ? StockTagTool.addTag(filterList[index]._id, option.name, user).then(add_result => {
                sendWs({
                    type: 'stock',
                    data: add_result.id,
                }, 0, 1);
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[index].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
                sendWs(`stock filter: ${(err.message || err.msg)}`, 0, 0, true);
            }).then(() => addFilter(index+1)) : Promise.resolve(filterList);
            return addFilter(0);
        }).then(filterList => Mongo('find', USERDB, {perm: 1}).then(userlist => {
            //檢查現有total中的stock名單
            const inList = [];
            const outList = [];
            const compare_list = cIndex => (cIndex < userlist.length) ? Mongo('find', TOTALDB, {owner: userlist[cIndex]._id, sType: {$exists: false}}).then(items => {
                let isIn = '';
                let isOut = '';
                const totalTwseMarketcapList = [];
                const totalUsseMarketcapList = [];
                const inListIndex = [];
                items.forEach(stock => {
                    let mcap = 0;
                    if (stock.type !== 'total') {
                        let isEtf = etfList.indexOf(stock.setype + ' ' + stock.index);
                        if (isEtf !== -1) {
                            if (stock.setype === 'twse') {
                                if (marketcapList[isEtf] > 0) {
                                    mcap = Math.round(marketcapList[isEtf] / 1000);
                                    totalTwseMarketcapList.push({mc: marketcapList[isEtf], _id: stock._id, extrem: stock.extrem});
                                }
                            } else if (stock.setype === 'usse') {
                                if (marketcapList[isEtf] > 0) {
                                    mcap = Math.round(marketcapList[isEtf] / 1000);
                                    totalUsseMarketcapList.push({mc: marketcapList[isEtf], _id: stock._id, extrem: stock.extrem});
                                }
                            }
                        }
                        let notIn = true;
                        for (let i = 0; i < filterList.length; i++) {
                            if (stock.index === filterList[i].index && stock.setype === filterList[i].type) {
                                notIn = false;
                                inListIndex.push(i);
                                break;
                            }
                        }
                        if (notIn) {
                            isOut = isOut + ' ' + stock.name + ' ' + mcap;
                        }
                    }
                });
                if (inListIndex.length > 0) {
                    for (let i = 0; i < filterList.length; i++) {
                        if (inListIndex.indexOf(i) === -1) {
                            let isEtf = etfList.indexOf(filterList[i].type + ' ' + filterList[i].index);
                            let mcap = 0;
                            if (isEtf !== -1) {
                                mcap = Math.round(marketcapList[isEtf] / 1000);
                            }
                            isIn = isIn + ' ' + filterList[i].type + ' ' + filterList[i].index + ' ' + mcap;
                        }
                    }
                } else {
                    isIn = ' all';
                }
                if (!isOut) {
                    isOut = ' none';
                }
                inList.push(userlist[cIndex].username + ' In trade list are' + isIn);
                outList.push(userlist[cIndex].username + ' Out trade list are' + isOut);
                totalTwseMarketcapList.sort((a, b) => {
                    if (a.mc < b.mc) {
                        return 1;
                    } else if (a.mc > b.mc) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                if (totalTwseMarketcapList.length > 2) {
                    const mcMiddle = Math.round(totalTwseMarketcapList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        const mul = totalTwseMarketcapList[i].mc / totalTwseMarketcapList[mcMiddle].mc;
                        totalTwseMarketcapList[i].mul = (mul > 5) ? 5 : mul;
                    }
                }
                totalUsseMarketcapList.sort((a, b) => {
                    if (a.mc < b.mc) {
                        return 1;
                    } else if (a.mc > b.mc) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                if (totalUsseMarketcapList.length > 2) {
                    const mcMiddle = Math.round(totalUsseMarketcapList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        const mul = totalUsseMarketcapList[i].mc / totalUsseMarketcapList[mcMiddle].mc;
                        totalUsseMarketcapList[i].mul = (mul > 5) ? 5 : mul;
                    }
                }
                totalTwseMarketcapList.forEach(i => console.log(i));
                totalUsseMarketcapList.forEach(i => console.log(i));
                // §9b Volatility-normalized position size: mul = mcMul + volMul, cap at 5, default = 1
                const calcFinalMul = (item) => {
                    const volValue = 1 + Math.max(0, 1 - (item.extrem || 0) / 0.4);
                    const mcMul = item.mul || 1;
                    return (mcMul > volValue) ? mcMul : volValue;
                };
                const updmulTwse = mIndex => (mIndex < totalTwseMarketcapList.length) ? Mongo('update', TOTALDB, {_id: totalTwseMarketcapList[mIndex]._id}, {$set: {mul: calcFinalMul(totalTwseMarketcapList[mIndex])}}).then(mitems => {
                    console.log(mitems);
                    return updmulTwse(mIndex + 1);
                }) : Promise.resolve();
                const updmulUsse = mIndex => (mIndex < totalUsseMarketcapList.length) ? Mongo('update', TOTALDB, {_id: totalUsseMarketcapList[mIndex]._id}, {$set: {mul: calcFinalMul(totalUsseMarketcapList[mIndex])}}).then(mitems => {
                    console.log(mitems);
                    return updmulUsse(mIndex + 1);
                }) : Promise.resolve();
                return updmulTwse(0).then(() => updmulUsse(0).then(() => compare_list(cIndex + 1)));
            }) : Promise.resolve({filter: filterList, in: inList, out: outList});
            return compare_list(0);
        }));
    },
    stockFilterWarp: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        if (stockFiltering) {
            return handleError(new HoError('there is another filter running'));
        }
        stockFiltering = true;
        return this.stockFilterV4(option, user, session).then(obj => {
            stockFiltering = false;
            const number = obj.filter.length;
            console.log(`End: ${number}`);
            sendWs(`stock filter: ${number}`, 0, 0, true);
            obj.filter.forEach(i => {
                sendWs(i.type + ' ' + i.index + ' ' + i.name, 0, 0, true);
            });
            obj.in.forEach(i => {
                sendWs(i, 0, 0, true);
            });
            obj.out.forEach(i => {
                sendWs(i, 0, 0, true);
            });
            return number;
        }).catch(err => {
            stockFiltering = false;
            return handleError(err);
        });
    },
    getStockTotal: function(user) {
        return Mongo('find', TOTALDB, {owner: user._id, sType: {$exists: false}}).then(items => {
            if (items.length < 1) {
                //new user
                return Mongo('insert', TOTALDB, {
                    owner: user._id,
                    index: 0,
                    name: 'twse 投資部位',
                    type: 'total',
                    amount: 0,
                    count: 1,
                    setype: 'twse',
                }).then(item => Mongo('insert', TOTALDB, {
                    owner: user._id,
                    index: 0,
                    name: 'usse 投資部位',
                    type: 'total',
                    amount: 0,
                    count: 1,
                    setype: 'usse',
                }).then(item1 => {
                    return ({
                    se: [{
                        type: item[0].setype,
                        remain: item[0].amount,
                        total: item[0].amount,
                    },
                    {
                        type: item1[0].setype,
                        remain: item1[0].amount,
                        total: item1[0].amount,
                    }],
                    stock: [{
                        name: item[0].name,
                        type: item[0].type,
                        remain: 0,
                        price: 0,
                        profit: 0,
                        count: 1,
                        mid: 0,
                        //plus: 0,
                        //minus: 0,
                        current: 0,
                        str: '',
                        se: 0,
                    },
                    {
                        name: item1[0].name,
                        type: item1[0].type,
                        remain: 0,
                        price: 0,
                        profit: 0,
                        count: 1,
                        mid: 0,
                        current: 0,
                        str: '',
                        se: 1,
                    }],
                })}));
            }
            let remain = 0;
            let totalName = '';
            let totalType = '';
            let profit = 0;
            let totalPrice = 0;
            let remain1 = 0;
            let totalName1 = '';
            let totalType1 = '';
            let profit1 = 0;
            let totalPrice1 = 0;
            //let plus = 0;
            //let minus = 0;
            const stock = [];
            const getStock = v => {
                if (v.type === 'total') {
                    if (v.setype === 'usse') {
                        remain1 = v.amount;
                        totalName1 = v.name;
                        totalType1 = v.type;
                    } else {
                        remain = v.amount;
                        totalName = v.name;
                        totalType = v.type;
                    }
                    return Promise.resolve();
                } else {
                    //return getStockPrice(v.setype ? v.setype : 'twse', v.index).then(price => {
                        let current = v.price * v.count;
                        v.amount = v.profit ? (v.amount - v.profit) : v.amount;
                        let p = current + v.amount - (v.mul ? v.orig * v.mul : v.orig);
                        let y = v.previousPrice ? ((v.price - v.previousPrice) * v.count) : 0;
                        let se = 0;
                        if (v.setype === 'usse') {
                            totalPrice1 += current;
                            profit1 += y;
                            se = 1;
                        } else {
                            totalPrice += current;
                            profit += y;
                        }
                        //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                        //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                        //plus += p;
                        //minus += m;
                        if (v.clear) {
                            v.str = v.str ? `Clearing ${v.str}` : 'Clearing';
                        }
                        if (v.ing === 2) {
                            v.str = v.str ? `Deleting ${v.str}` : 'Deleting';
                        }
                        stock.push({
                            name: v.name,
                            type: v.type,
                            //cost: v.cost,
                            price: v.price,
                            mid: v.mid,
                            mul: Math.round(v.mul * 100) / 100,
                            count: (v.setype === 'usse') ? v.count : v.count / 100,
                            remain: Math.round(v.amount * 100) / 100,
                            profit: p,
                            //top: v.top,
                            //bottom: v.bottom,
                            //plus: p,
                            //minus: m,
                            current,
                            str: v.str ? v.str : '',
                            se,
                            order: v.order,
                        });
                        return Promise.resolve();
                    //});
                }
            }
            const recurGet = index => {
                if (index >= items.length) {
                    if (totalName1) {
                        stock.unshift({
                            name: totalName1,
                            type: totalType1,
                            profit: profit1,
                            price: Math.round(totalPrice1 * 100) / 100,
                            mid: 1,
                            remain: `${(totalPrice1 + remain1 > 0) ? Math.round(profit1 / (totalPrice1 + remain1) * 10000) / 100 : 0}%`,
                            count: 1,
                            //plus: Math.floor(plus * 100) / 100,
                            //minus: Math.floor(minus * 100) / 100,
                            current: totalPrice1,
                            str: '',
                            se: 1,
                        })
                    }
                    if (totalName) {
                        stock.unshift({
                            name: totalName,
                            type: totalType,
                            profit,
                            price: Math.round(totalPrice * 100) / 100,
                            mid: 1,
                            remain: `${(totalPrice + remain > 0) ? Math.round(profit / (totalPrice + remain) * 10000) / 100 : 0}%`,
                            count: 1,
                            //plus: Math.floor(plus * 100) / 100,
                            //minus: Math.floor(minus * 100) / 100,
                            current: totalPrice,
                            str: '',
                            se: 0,
                        })
                    }
                    const orderbyStock = () => {
                        const twseS = [];
                        const usseS = [];
                        const totalS = [];
                        stock.forEach(v => {
                            if (v.type === 'total') {
                                totalS.push(v);
                            } else if (v.se === 1) {
                                let is_insert = false;
                                for (let i in usseS) {
                                    if (v.current > usseS[i].current) {
                                        usseS.splice(i, 0, v);
                                        is_insert = true;
                                        break;
                                    }
                                }
                                if (!is_insert) {
                                    usseS.push(v);
                                }
                            } else {
                                let is_insert = false;
                                for (let i in twseS) {
                                    if (v.current > twseS[i].current) {
                                        twseS.splice(i, 0, v);
                                        is_insert = true;
                                        break;
                                    }
                                }
                                if (!is_insert) {
                                    twseS.push(v);
                                }
                            }
                        });
                        return totalS.concat(twseS).concat(usseS);
                    }
                    return {
                        se: [{
                            type: 'TWSE',
                            remain,
                            total: totalPrice + remain,
                        },
                        {
                            type: 'USSE',
                            remain: remain1,
                            total: totalPrice1 + remain1,
                        }],
                        //total: totalPrice + remain,
                        stock: orderbyStock(),
                    };
                } else {
                    return getStock(items[index]).then(() => recurGet(index + 1))
                }
            }
            return recurGet(0);
        });
    },
    updateStockTotal: function(user, info, real = false) {
        //remaintwse 800 重設remain
        //delete twse2330 刪除股票
        //twse2330 (-)0.5 增減張數
        //twse2330 5000 amount 新增股票(設定最大金額)
        //twse2330 2 50 輸入交易股價
        //twse2330 2 450 cost 重設cost
        //#2330 300 220
        return Mongo('find', TOTALDB, {owner: user._id, sType: {$exists: false}}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('No user data!!!'));
            }
            let remain = 0;
            let totalName = '';
            let totalType = '';
            let totalId = null;
            let remain1 = 0;
            let totalName1 = '';
            let totalType1 = '';
            let totalId1 = null;

            for (let v of items) {
                //if (v.name === '投資部位' && v.type === 'total') {
                if (v.type === 'total') {
                    if (v.setype === 'usse') {
                        remain1 = v.amount;
                        totalName1 = v.name;
                        totalType1 = v.type;
                        totalId1 = v._id;
                    } else {
                        remain = v.amount;
                        totalName = v.name;
                        totalType = v.type;
                        totalId = v._id;
                    }
                }
            }
            const updateTotal = {};
            const removeTotal = [];
            const single = v => {
                //const cmd = v.match(/(\d+|remain|delete)\s+(\-?\d+\.?\d*)\s*(\d+\.?\d*|amount)?\s*(cost)?/)
                const cmd = v.match(/^([\da-zA-Z\-]+)\s+([\da-zA-Z\-]+|\-?\d+\.?\d*)\s*(\d+\.?\d*|amount)?\s*(cost)?$/);
                if (cmd) {
                    let remainM = null;
                    if (remainM = cmd[1].match(/^remain(.*)$/)) {
                        switch(remainM[1]) {
                            case 'twse':
                            remain = +cmd[2];
                            updateTotal[totalId] = {amount: remain};
                            break;
                            case 'usse':
                            remain1 = +cmd[2];
                            updateTotal[totalId1] = {amount: remain1};
                            break;
                        }
                    } else if (cmd[1] === 'delete') {
                        const setype = cmd[2].substring(0, 4);
                        const index = cmd[2].substring(4);
                        for (let i in items) {
                            if (index === items[i].index && setype === items[i].setype) {
                                return getStockPrice(setype, items[i].index).then(price => {
                                    switch(setype) {
                                        case 'twse':
                                        if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
                                            items[i].ing = 2;
                                            if (items[i]._id) {
                                                if (updateTotal[items[i]._id]) {
                                                    updateTotal[items[i]._id].ing = items[i].ing;
                                                } else {
                                                    updateTotal[items[i]._id] = {ing: items[i].ing};
                                                }
                                            }
                                        } else {
                                            remain += (price * items[i].count * (1 - TRADE_FEE));
                                            updateTotal[totalId] = {amount: remain};
                                            if (items[i]._id) {
                                                removeTotal.push(items[i]._id);
                                            }
                                            items.splice(i, 1);
                                        }
                                        break;
                                        case 'usse':
                                        if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
                                            items[i].ing = 2;
                                            if (items[i]._id) {
                                                if (updateTotal[items[i]._id]) {
                                                    updateTotal[items[i]._id].ing = items[i].ing;
                                                } else {
                                                    updateTotal[items[i]._id] = {ing: items[i].ing};
                                                }
                                            }
                                        } else {
                                            remain1 += (price * items[i].count * (1 - USSE_FEE));
                                            updateTotal[totalId1] = {amount: remain1};
                                            if (items[i]._id) {
                                                removeTotal.push(items[i]._id);
                                            }
                                            items.splice(i, 1);
                                        }
                                        break;
                                    }
                                    /*if (items[i]._id) {
                                        removeTotal.push(items[i]._id);
                                    }
                                    items.splice(i, 1);*/
                                });
                            }
                        }
                    } else if (cmd[1] === 'clear') {
                        const setype = cmd[2].substring(0, 4);
                        const index = cmd[2].substring(4);
                        for (let i in items) {
                            if (index === items[i].index && setype === items[i].setype) {
                                items[i].clear = true;
                                if (items[i]._id) {
                                    if (updateTotal[items[i]._id]) {
                                        updateTotal[items[i]._id].clear = items[i].clear;
                                    } else {
                                        updateTotal[items[i]._id] = {clear: items[i].clear};
                                    }
                                }
                                break;
                            }
                        }
                    } else {
                        let is_find = false;
                        const setype = cmd[1].substring(0, 4);
                        const index = cmd[1].substring(4);
                        for (let i in items) {
                            if (index === items[i].index && setype === items[i].setype) {
                                is_find = true;
                                if (cmd[3] === 'amount') {
                                    const newWeb = adjustWeb(items[i].web, items[i].mid, +cmd[2]);
                                    if (!newWeb) {
                                        return handleError(new HoError(`Amount need large than ${Math.ceil(items[i].mid * (items[i].web.length - 1) / 3)}`));
                                    }
                                    items[i].web = newWeb.arr;
                                    items[i].mid = newWeb.mid;
                                    items[i].times = newWeb.times;
                                    items[i].amount = items[i].amount + +cmd[2] - (items[i].mul ? items[i].orig * items[i].mul : items[i].orig);
                                    items[i].orig = +cmd[2];
                                    if (items[i].ing === 2) {
                                        items[i].ing = 0;
                                    }
                                    items[i].clear = false;
                                    if (items[i]._id) {
                                        if (updateTotal[items[i]._id]) {
                                            updateTotal[items[i]._id].web = items[i].web;
                                            updateTotal[items[i]._id].mid = items[i].mid;
                                            updateTotal[items[i]._id].times = items[i].times;
                                            updateTotal[items[i]._id].amount = items[i].amount;
                                            updateTotal[items[i]._id].orig = items[i].orig;
                                            updateTotal[items[i]._id].ing = items[i].ing;
                                            updateTotal[items[i]._id].clear = items[i].clear;
                                        } else {
                                            updateTotal[items[i]._id] = {
                                                web: items[i].web,
                                                mid: items[i].mid,
                                                times: items[i].times,
                                                amount: items[i].amount,
                                                orig: items[i].orig,
                                                ing: items[i].ing,
                                                clear: items[i].clear,
                                            };
                                        }
                                    }
                                } else if (+cmd[2] >= 0 && +cmd[3] >= 0 && cmd[4]) {
                                //} else if (cmd[4]) {
                                    items[i].count = +cmd[2];
                                    switch(setype) {
                                        case 'twse':
                                        remain = remain + (items[i].mul ? items[i].orig * items[i].mul : items[i].orig) - items[i].amount - +cmd[3];
                                        updateTotal[totalId] = {amount: remain};
                                        break;
                                        case 'usse':
                                        remain1 = remain1 + (items[i].mul ? items[i].orig * items[i].mul : items[i].orig) - items[i].amount - +cmd[3];
                                        updateTotal[totalId1] = {amount: remain1};
                                        break;
                                    }
                                    items[i].amount = (items[i].mul ? items[i].orig * items[i].mul : items[i].orig) - +cmd[3];
                                    if (items[i]._id) {
                                        if (updateTotal[items[i]._id]) {
                                            updateTotal[items[i]._id].count = items[i].count;
                                            updateTotal[items[i]._id].amount = items[i].amount;
                                        } else {
                                            updateTotal[items[i]._id] = {count: items[i].count, amount: items[i].amount};
                                        }
                                    }
                                } else if (!isNaN(+cmd[2])) {
                                    const orig_count = items[i].count;
                                    items[i].count += +cmd[2];
                                    if (items[i].count < 0) {
                                        cmd[2] = -orig_count;
                                        items[i].count = 0;
                                    }
                                    return getStockPrice(setype, items[i].index).then(price => {
                                        price = !isNaN(+cmd[3]) ? +cmd[3] : price;
                                        let new_cost = 0;
                                        switch(setype) {
                                            case 'twse':
                                            new_cost = (+cmd[2] > 0) ? price * +cmd[2] : (1 - TRADE_FEE) * price * +cmd[2];
                                            remain -= new_cost;
                                            updateTotal[totalId] = {amount: remain};
                                            break;
                                            case 'usse':
                                            new_cost = (+cmd[2] > 0) ? price * +cmd[2] : (1 - USSE_FEE) * price * +cmd[2];
                                            remain1 -= new_cost;
                                            updateTotal[totalId1] = {amount: remain1};
                                            break;
                                        }
                                        items[i].amount -= new_cost;
                                        const time = Math.round(_dateFactory().getTime() / 1000);
                                        const tradeType = (+cmd[2] > 0) ? 'buy' : 'sell';
                                        if (tradeType === 'buy') {
                                            let is_insert = false;
                                            for (let k = 0; k < items[i].previous.buy.length; k++) {
                                                if (price < items[i].previous.buy[k].price) {
                                                    items[i].previous.buy.splice(k, 0, {price, time});
                                                    is_insert = true;
                                                    break;
                                                }
                                            }
                                            if (!is_insert) {
                                                items[i].previous.buy.push({price, time});
                                            }
                                            items[i].previous = {
                                                price,
                                                time,
                                                type: 'buy',
                                                buy: items[i].previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                sell: items[i].previous.sell,
                                            }
                                        } else if (tradeType === 'sell') {
                                            let is_insert = false;
                                            for (let k = 0; k < items[i].previous.sell.length; k++) {
                                                if (price > items[i].previous.sell[k].price) {
                                                    items[i].previous.sell.splice(k, 0, {price, time});
                                                    is_insert = true;
                                                    break;
                                                }
                                            }
                                            if (!is_insert) {
                                                items[i].previous.sell.push({price, time});
                                            }
                                            items[i].previous = {
                                                price,
                                                time,
                                                type: 'sell',
                                                sell: items[i].previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                buy: items[i].previous.buy,
                                            }
                                        }
                                        if (items[i]._id) {
                                            if (updateTotal[items[i]._id]) {
                                                updateTotal[items[i]._id].count = items[i].count;
                                                updateTotal[items[i]._id].amount = items[i].amount;
                                                updateTotal[items[i]._id].previous = items[i].previous;
                                            } else {
                                                updateTotal[items[i]._id] = {count: items[i].count,
                                                    amount: items[i].amount,
                                                    previous: items[i].previous,
                                                };
                                            }
                                        }
                                    });
                                /*} else {
                                    if (+cmd[2] > +cmd[3]) {
                                        items[i].top = +cmd[2];
                                        items[i].bottom = +cmd[3];
                                    } else {
                                        items[i].top = +cmd[3];
                                        items[i].bottom = +cmd[2];
                                    }
                                    if (items[i]._id) {
                                        if (updateTotal[items[i]._id]) {
                                            updateTotal[items[i]._id].top = items[i].top;
                                            updateTotal[items[i]._id].bottom = items[i].bottom;
                                        } else {
                                            updateTotal[items[i]._id] = {top: items[i].top, bottom: items[i].bottom};
                                        }
                                    }*/
                                }
                                break;
                            }
                        }
                        if (!is_find) {
                            if (+cmd[2] >= 0 && cmd[3] === 'amount') {
                                //init amount
                                //get web? arr mid count
                                const setype = cmd[1].substring(0, 4);
                                const index = cmd[1].substring(4);
                                return Mongo('find', STOCKDB, {type: setype, index}, {limit: 1}).then(item => {
                                    if (item.length < 1) {
                                        return handleError(new HoError('No stock data!!!'));
                                    }
                                    if (!item[0].web) {
                                        return handleError(new HoError('No web data!!!'));
                                    }
                                    const newWeb = adjustWeb(item[0].web.arr, item[0].web.mid, +cmd[2]);
                                    if (!newWeb) {
                                        return handleError(new HoError(`Amount need large than ${Math.ceil(item[0].web.mid * (item[0].web.arr.length - 1) / 3)}`));
                                    }
                                    return getBasicStockData(setype, index).then(basic => getStockPrice(setype, basic.stock_index).then(price => {
                                        console.log(basic);
                                        items.push({
                                            //加setype ind name加setype
                                            owner: user._id,
                                            setype,
                                            index: basic.stock_index,
                                            name: `${setype} ${basic.stock_index} ${basic.stock_name}`,
                                            type: basic.stock_ind ? `${basic.stock_class} ${basic.stock_ind}` : `${basic.stock_class}`,
                                            //cost: 0,
                                            count: 0,
                                            web: newWeb.arr,
                                            wType: item[0].web.type,
                                            mid: newWeb.mid,
                                            times: newWeb.times,
                                            extrem: item[0].web.extrem,
                                            amount: +cmd[2],
                                            orig: +cmd[2],
                                            //top: Math.floor(price * 1.2 * 100) / 100,
                                            //bottom: Math.floor(price * 0.95 * 100) / 100,
                                            price,
                                            previous: {buy: [], sell: []},
                                            newMid: [],
                                            ing: 0,
                                            //high: price,
                                        })
                                        //remain -= cost;
                                        //updateTotal[totalId] = {cost: remain};
                                    }));
                                });
                            /*} else if (cmd[4] && +cmd[2] > 0) {
                                return getBasicStockData('twse', cmd[1]).then(basic => getStockPrice('twse', basic.stock_index).then(price => {
                                    console.log(basic);
                                    const cost = (+cmd[3] > 0) ? +cmd[3] : 0;
                                    items.push({
                                        owner: user._id,
                                        index: basic.stock_index,
                                        name: `${basic.stock_index} ${basic.stock_name}`,
                                        type: basic.stock_class,
                                        cost,
                                        count: +cmd[2],
                                        top: Math.floor(price * 1.2 * 100) / 100,
                                        bottom: Math.floor(price * 0.95 * 100) / 100,
                                        price,
                                        high: price,
                                    })
                                    remain -= cost;
                                    updateTotal[totalId] = {cost: remain};
                                }));*/
                            }
                        }
                    }
                }
            }
            const updateReal = () => {
                console.log(updateTotal);
                console.log(removeTotal);
                console.log(remain);
                console.log(remain1);
                console.log(items);
                const singleUpdate = v => {
                    if (!v._id) {
                        return Mongo('insert', TOTALDB, v);
                    } else if (updateTotal[v._id]) {
                        return Mongo('update', TOTALDB, {_id: v._id}, {$set : updateTotal[v._id]});
                    } else {
                        return Promise.resolve();
                    }
                }
                const recurUpdate = index => (index >= items.length) ? recurRemove(0) : singleUpdate(items[index]).then(() => recurUpdate(index + 1));
                const recurRemove = index => (index >= removeTotal.length) ? rest() : Mongo('deleteMany', TOTALDB, {_id: removeTotal[index]}).then(() => recurRemove(index + 1));
                return real ? recurUpdate(0) : rest();
            }
            const rest = () => {
                let profit = 0;
                let totalPrice = 0;
                let profit1 = 0;
                let totalPrice1 = 0;
                //let plus = 0;
                //let minus = 0;
                const stock = [];
                const getStock = v => {
                    if (v.type === 'total') {
                        return Promise.resolve();
                    } else {
                        //return getStockPrice(v.setype ? v.setype : 'twse', v.index).then(price => {
                            let se = 0;
                            let current = v.price * v.count;
                            v.amount = v.profit ? (v.amount - v.profit) : v.amount;
                            let p = current + v.amount - (v.mul ? v.orig * v.mul : v.orig);
                            let y = v.previousPrice ? ((v.price - v.previousPrice) * v.count) : 0;
                            if (v.setype === 'usse') {
                                totalPrice1 += current;
                                profit1 += y;
                                se = 1;
                            } else {
                                totalPrice += current;
                                profit += y;
                            }
                            //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                            //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                            //plus += p;
                            //minus += m;
                            if (v.clear) {
                                v.str = v.str ? `Clearing ${v.str}` : 'Clearing';
                            }
                            if (v.ing === 2) {
                                v.str = v.str ? `Deleting ${v.str}` : 'Deleting';
                            }
                            stock.push({
                                name: v.name,
                                type: v.type,
                                //cost: v.cost,
                                price: v.price,
                                mid: v.mid,
                                mul: Math.round(v.mul * 100) / 100,
                                count: (v.setype === 'usse') ? v.count : v.count / 100,
                                remain: Math.round(v.amount * 100) / 100,
                                profit: p,
                                //top: v.top,
                                //bottom: v.bottom,
                                //plus: p,
                                //minus: m,
                                current,
                                str: v.str ? v.str : '',
                                se,
                                order: v.order,
                            });
                            return Promise.resolve();
                        //});
                    }
                }
                const recurGet = index => {
                    if (index >= items.length) {
                        if (totalName1) {
                            stock.unshift({
                                name: totalName1,
                                type: totalType1,
                                profit: profit1,
                                price: Math.round(totalPrice1 * 100) / 100,
                                mid: 1,
                                remain: `${(totalPrice1 + remain1 > 0) ? Math.round(profit1 / (totalPrice1 + remain1) * 10000) / 100 : 0}%`,
                                count: 1,
                                //plus: Math.floor(plus * 100) / 100,
                                //minus: Math.floor(minus * 100) / 100,
                                current: totalPrice1,
                                str: '',
                                se: 1,
                            })
                        }
                        if (totalName) {
                            stock.unshift({
                                name: totalName,
                                type: totalType,
                                profit,
                                price: Math.round(totalPrice * 100) / 100,
                                mid: 1,
                                remain: `${(totalPrice + remain > 0) ? Math.round(profit / (totalPrice + remain) * 10000) / 100 : 0}%`,
                                count: 1,
                                //plus: Math.floor(plus * 100) / 100,
                                //minus: Math.floor(minus * 100) / 100,
                                current: totalPrice,
                                str: '',
                                se: 0,
                            })
                        }
                        const orderbyStock = () => {
                            const twseS = [];
                            const usseS = [];
                            const totalS = [];
                            stock.forEach(v => {
                                if (v.type === 'total') {
                                    totalS.push(v);
                                } else if (v.se === 1) {
                                    let is_insert = false;
                                    for (let i in usseS) {
                                        if (v.current > usseS[i].current) {
                                            usseS.splice(i, 0, v);
                                            is_insert = true;
                                            break;
                                        }
                                    }
                                    if (!is_insert) {
                                        usseS.push(v);
                                    }
                                } else {
                                    let is_insert = false;
                                    for (let i in twseS) {
                                        if (v.current > twseS[i].current) {
                                            twseS.splice(i, 0, v);
                                            is_insert = true;
                                            break;
                                        }
                                    }
                                    if (!is_insert) {
                                        twseS.push(v);
                                    }
                                }
                            });
                            return totalS.concat(twseS).concat(usseS);
                        }
                        return {
                            se: [{
                                type: 'TWSE',
                                remain,
                                total: totalPrice + remain,
                            },
                            {
                                type: 'USSE',
                                remain: remain1,
                                total: totalPrice1 + remain1,
                            }],
                            //total: totalPrice + remain,
                            stock: orderbyStock(),
                        };
                    } else {
                        return getStock(items[index]).then(() => recurGet(index + 1))
                    }
                }
                return recurGet(0);
            }
            const checkTotal = () => {
                if (!totalId1) {
                    return Mongo('insert', TOTALDB, {
                        owner: user._id,
                        index: 0,
                        name: 'usse 投資部位',
                        type: 'total',
                        amount: 0,
                        count: 1,
                        setype: 'usse',
                    }).then(item => {
                        remain1 = item[0].amount;
                        totalName1 = item[0].name;
                        totalType1 = item[0].type;
                        totalId1 = item[0]._id;
                        if (!totalId) {
                            return Mongo('insert', TOTALDB, {
                                owner: user._id,
                                index: 0,
                                name: 'twse 投資部位',
                                type: 'total',
                                amount: 0,
                                count: 1,
                                setype: 'twse',
                            }).then(item1 => {
                                remain = item1[0].amount;
                                totalName = item1[0].name;
                                totalType = item1[0].type;
                                totalId = item1[0]._id;
                            });
                        } else {
                            return Promise.resolve();
                        }
                    });
                } else if (!totalId) {
                    return Mongo('insert', TOTALDB, {
                        owner: user._id,
                        index: 0,
                        name: 'twse 投資部位',
                        type: 'total',
                        amount: 0,
                        count: 1,
                        setype: 'twse',
                    }).then(item => {
                        remain = item[0].amount;
                        totalName = item[0].name;
                        totalType = item[0].type;
                        totalId = item[0]._id;
                    });
                } else {
                    return Promise.resolve();
                }
            }
            const recur = index => (index >= info.length) ? updateReal() : Promise.resolve(single(info[index])).then(() => recur(index + 1));
            return checkTotal().then(() => recur(0));
        });
    },
}

export const parseStockCsv = (raw_data, year, month_str) => {
    const high = [];
    const low = [];
    const vol = [];
    const day = [];
    if (raw_data.length <= 200) {
        return { high, low, vol, day, isStop: true };
    }
    const year_str = year - 1911;
    const data_list = raw_data.match(new RegExp('"' + year_str + '\\/' + month_str + '.*', 'g'));
    if (data_list && data_list.length > 0) {
        let tmp_index = -1;
        let tmp_number = '';
        for (let i of data_list) {
            let tmp_list_1 = [];
            const tmp_list = i.split(',');
            for (let j in tmp_list) {
                if (tmp_list[j].match(/^".*"$/)) {
                    tmp_list_1.push(tmp_list[j].replace(/"/g, ''));
                } else if (tmp_list[j].match(/^"/)) {
                    tmp_index = j;
                    tmp_list[j] = tmp_list[j].replace(/"/g, '');
                } else if (tmp_list[j].match(/"$/)) {
                    tmp_list[j] = tmp_list[j].replace(/"/g, '');
                    for (let k = +tmp_index; k <= j; k++) {
                        tmp_number = `${tmp_number}${tmp_list[k]}`;
                    }
                    tmp_list_1.push(tmp_number);
                    tmp_index = -1;
                    tmp_number = '';
                } else {
                    if (tmp_index === -1) {
                        tmp_list_1.push(tmp_list[j]);
                    }
                }
            }
            if (tmp_list_1[4] !== '--' && tmp_list_1[5] !== '--') {
                high.push(Number(tmp_list_1[4]));
                low.push(Number(tmp_list_1[5]));
                vol.push(Number(tmp_list_1[8]));
                // Extract day from date field "YYY/MM/DD"
                const dateParts = tmp_list_1[0].trim().split('/');
                day.push(dateParts.length >= 3 ? Number(dateParts[2]) : 0);
            }
        }
    }
    return { high, low, vol, day, isStop: false };
};

// Parse ROC date strings: "113年03月18日" or "113/01/22" → "2024-03-18" or "2024-01-22"
export const parseTwseRocDate = (dateStr) => {
    let m;
    if ((m = dateStr.match(/(\d+)年(\d+)月(\d+)日/))) {
        return `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    if ((m = dateStr.match(/(\d+)\/(\d+)\/(\d+)/))) {
        return `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    }
    return null;
};

// Fetch TWSE/TPEx adjustment events (dividends, rights, capital reductions)
// stockType: 2=TPEx, 3=TWSE, other=try both
// Returns: [{ date: 'YYYY-MM-DD', ratio: number, type: string }] sorted by date ascending
export const fetchTwseAdjustments = (stockIndex, stockType) => {
    const adjustments = [];
    const date = _dateFactory();
    const endDate = `${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`;
    const startDate = `${date.getFullYear() - 5}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`;
    const startDateTpex = `${date.getFullYear() - 5}/${completeZero(date.getMonth() + 1, 2)}/${completeZero(date.getDate(), 2)}`;
    const endDateTpex = `${date.getFullYear()}/${completeZero(date.getMonth() + 1, 2)}/${completeZero(date.getDate(), 2)}`;

    const fetchTwseExRight = () => {
        if (stockType === 2) return Promise.resolve();
        return Api('url', `https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${startDate}&endDate=${endDate}&selectType=ALL&response=json`).then(raw => {
            const data = JSON.parse(raw);
            if (data.stat === 'OK' && data.data) {
                for (const row of data.data) {
                    if (row[1] === stockIndex) {
                        const d = parseTwseRocDate(row[0]);
                        const prevClose = parseFloat(row[3].replace(/,/g, ''));
                        const refPrice = parseFloat(row[4].replace(/,/g, ''));
                        if (d && prevClose > 0 && refPrice > 0) {
                            adjustments.push({ date: d, ratio: refPrice / prevClose, type: row[6] === '息' ? 'dividend' : row[6] === '權' ? 'rights' : 'both' });
                        }
                    }
                }
            }
        }).catch(err => handleError(err, 'TWSE TWT49U'));
    };

    const fetchTwseReduction = () => {
        if (stockType === 2) return Promise.resolve();
        return Api('url', `https://www.twse.com.tw/rwd/zh/reducation/TWTAUU?startDate=${startDate}&endDate=${endDate}&response=json`).then(raw => {
            const data = JSON.parse(raw);
            if (data.stat === 'OK' && data.data) {
                for (const row of data.data) {
                    if (row[1].trim() === stockIndex) {
                        const d = parseTwseRocDate(row[0]);
                        const prevClose = parseFloat(row[3].replace(/,/g, ''));
                        const refPrice = parseFloat(row[4].replace(/,/g, ''));
                        if (d && prevClose > 0 && refPrice > 0) {
                            adjustments.push({ date: d, ratio: prevClose / refPrice, type: 'reduction' });
                        }
                    }
                }
            }
        }).catch(err => handleError(err, 'TWSE TWTAUU'));
    };

    const fetchTpexExRight = () => {
        if (stockType === 3) return Promise.resolve();
        return Api('url', `https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=${startDateTpex}&endDate=${endDateTpex}&response=json`).then(raw => {
            const data = JSON.parse(raw);
            if (data.stat === 'OK' && data.tables && data.tables[0] && data.tables[0].data) {
                for (const row of data.tables[0].data) {
                    if (row[1].trim() === stockIndex) {
                        const d = parseTwseRocDate(row[0]);
                        const prevClose = parseFloat(row[3].replace(/,/g, ''));
                        const refPrice = parseFloat(row[4].replace(/,/g, ''));
                        if (d && prevClose > 0 && refPrice > 0) {
                            adjustments.push({ date: d, ratio: refPrice / prevClose, type: row[8].includes('息') ? 'dividend' : row[8].includes('權') ? 'rights' : 'both' });
                        }
                    }
                }
            }
        }).catch(err => handleError(err, 'TPEx exDailyQ'));
    };

    return fetchTwseExRight()
        .then(() => fetchTwseReduction())
        .then(() => fetchTpexExRight())
        .then(() => adjustments.sort((a, b) => a.date.localeCompare(b.date)));
};

// Extract adjustment events from Yahoo Finance chart response (for USSE)
// Returns: [{ date: 'YYYY-MM-DD', ratio: number, type: string }] sorted by date ascending
export const extractUsseAdjustments = (stockData, timestamps, quotes) => {
    const adjustments = [];
    if (!stockData || !stockData.events) return adjustments;

    const findCloseBefore = (eventTs) => {
        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i] < eventTs && quotes.close[i]) {
                return quotes.close[i];
            }
        }
        return null;
    };

    if (stockData.events.dividends) {
        for (const ev of stockData.events.dividends) {
            const closeBefore = findCloseBefore(ev.date);
            if (closeBefore && ev.amount > 0) {
                const d = convertTimestampToDate(ev.date);
                adjustments.push({
                    date: `${d.year}-${d.month}-${d.day}`,
                    ratio: (closeBefore - ev.amount) / closeBefore,
                    type: 'dividend',
                });
            }
        }
    }

    if (stockData.events.splits) {
        for (const ev of stockData.events.splits) {
            if (ev.numerator && ev.denominator) {
                const d = convertTimestampToDate(ev.date);
                adjustments.push({
                    date: `${d.year}-${d.month}-${d.day}`,
                    ratio: ev.denominator / ev.numerator,
                    type: 'split',
                });
            }
        }
    }

    if (stockData.events.capitalGains) {
        for (const ev of stockData.events.capitalGains) {
            const closeBefore = findCloseBefore(ev.date);
            if (closeBefore && ev.amount > 0) {
                const d = convertTimestampToDate(ev.date);
                adjustments.push({
                    date: `${d.year}-${d.month}-${d.day}`,
                    ratio: (closeBefore - ev.amount) / closeBefore,
                    type: 'capitalGain',
                });
            }
        }
    }

    return adjustments.sort((a, b) => a.date.localeCompare(b.date));
};

// Apply backward adjustments to raw interval_data
// Each data point {h, l, v, d} in month raw[] is date-ascending (d=day of month)
// Returns { adjustedData (cloned), raw_arr, max, min }
export const applyAdjustments = (interval_data, adjustments) => {
    if (!interval_data) return { adjustedData: null, raw_arr: [], max: 0, min: 0 };

    const adjData = JSON.parse(JSON.stringify(interval_data));

    if (adjustments && adjustments.length > 0) {
        // Sort events by date descending for cumulative application
        const sorted = [...adjustments].sort((a, b) => b.date.localeCompare(a.date));

        for (const y in adjData) {
            for (const m in adjData[y]) {
                let tmp_max = 0;
                let tmp_min = 0;
                adjData[y][m].raw.forEach(v => {
                    const pointDate = `${y}-${m}-${String(v.d).padStart(2, '0')}`;
                    // Compute cumulative ratio: product of all event ratios where event.date > pointDate
                    let cumRatio = 1;
                    for (const ev of sorted) {
                        if (ev.date <= pointDate) break;
                        cumRatio *= ev.ratio;
                    }
                    v.h = v.h * cumRatio;
                    v.l = v.l * cumRatio;
                    if (v.h > tmp_max) tmp_max = v.h;
                    if (!tmp_min || v.l < tmp_min) tmp_min = v.l;
                });
                adjData[y][m].max = tmp_max;
                adjData[y][m].min = tmp_min;
            }
        }
    }

    // Build raw_arr (most recent first) and compute global max/min
    const months = [];
    for (const y in adjData) {
        for (const m in adjData[y]) months.push({ y: Number(y), m });
    }
    months.sort((a, b) => a.y !== b.y ? b.y - a.y : b.m.localeCompare(a.m));

    let raw_arr = [];
    let max = 0;
    let min = 0;
    for (const { y, m } of months) {
        raw_arr = raw_arr.concat(adjData[y][m].raw.slice().reverse());
        if (adjData[y][m].max > max) max = adjData[y][m].max;
        if (!min || adjData[y][m].min < min) min = adjData[y][m].min;
    }

    return { adjustedData: adjData, raw_arr, max, min };
};

// Validate interval data quality
// Returns { valid: boolean, warnings: string[] }
export const validateIntervalData = (interval_data, raw_arr, adjustments) => {
    const warnings = [];

    if (!interval_data || !raw_arr || raw_arr.length === 0) {
        return { valid: false, warnings: ['No interval data or empty raw_arr'] };
    }

    // Check data point validity
    let zeroPrice = 0;
    let highLowInversion = 0;
    let zeroVolume = 0;
    let nanCount = 0;
    for (const pt of raw_arr) {
        if (isNaN(pt.h) || isNaN(pt.l)) nanCount++;
        if (pt.h <= 0 || pt.l <= 0) zeroPrice++;
        if (pt.h < pt.l) highLowInversion++;
        if (pt.v === 0) zeroVolume++;
    }
    if (nanCount > 0) warnings.push(`${nanCount} data points with NaN prices`);
    if (zeroPrice > 0) warnings.push(`${zeroPrice} data points with zero/negative prices`);
    if (highLowInversion > 0) warnings.push(`${highLowInversion} data points where high < low`);
    if (zeroVolume > raw_arr.length * 0.5) warnings.push(`${zeroVolume}/${raw_arr.length} data points with zero volume`);

    // Check for large price gaps without adjustment events
    const adjDates = new Set((adjustments || []).map(a => a.date));
    let gapCount = 0;
    for (let i = 1; i < raw_arr.length; i++) {
        const prevMid = (raw_arr[i - 1].h + raw_arr[i - 1].l) / 2;
        const currMid = (raw_arr[i].h + raw_arr[i].l) / 2;
        if (prevMid > 0 && Math.abs(currMid - prevMid) / prevMid > 0.5) {
            gapCount++;
        }
    }
    if (gapCount > 0) warnings.push(`${gapCount} price gaps > 50% detected`);

    // Validate adjustment ratios
    if (adjustments) {
        for (const adj of adjustments) {
            if (adj.ratio <= 0.05 || adj.ratio > 20) {
                warnings.push(`Unusual adjustment ratio ${adj.ratio} on ${adj.date} (type: ${adj.type})`);
            }
        }
    }

    // Check data completeness
    let monthCount = 0;
    for (const y in interval_data) {
        for (const m in interval_data[y]) monthCount++;
    }
    if (monthCount < 6) warnings.push(`Only ${monthCount} months of data (expected 12+)`);

    const valid = nanCount === 0 && zeroPrice === 0;
    if (warnings.length > 0) console.log('Data validation warnings:', warnings);
    return { valid, warnings };
};

const getTwseAnnual = (index, year, filePath) => Api('url', `https://doc.twse.com.tw/server-java/t57sb01?id=&key=&step=1&co_id=${index}&year=${year-1911}&seamon=&mtype=F&dtype=F04`, {referer: 'https://doc.twse.com.tw/'}).then(raw_data => {
    const center = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0];
    if (!center) {
        console.log(raw_data);
        return handleError(new HoError('cannot find form'));
    }
    const form = findTag(center, 'form')[0];
    if (!form) {
        console.log(raw_data);
        return handleError(new HoError('cannot find form'));
    }
    const tds = findTag(findTag(findTag(findTag(form, 'table')[0], 'table')[0], 'tr')[1], 'td');
    let filename = false;
    for (let t of tds) {
        const a = findTag(t, 'a')[0];
        if (a) {
            filename = findTag(a)[0];
            break;
        }
    }
    if (!filename) {
        return handleError(new HoError('cannot find annual location'));
    }
    console.log(filename);
    if (getExtname(filename).ext === '.zip') {
        return Api('url', `https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=${index}&filename=${filename}`, {referer: 'https://doc.twse.com.tw/'}, {filePath}).then(() => filename);
    } else {
        return Api('url', `https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=${index}&filename=${filename}`, {referer: 'https://doc.twse.com.tw/'}).then(raw_data => {
            return Api('url', addPre(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'a')[0].attribs.href, 'https://doc.twse.com.tw'), {filePath}).then(() => filename);
        });
    }
});

export const getSingleAnnual = (year, folder, index) => {
    let annual_list = [];
    const recur_annual = (cYear, annual_folder) => {
        if (!annual_list.includes(cYear.toString()) && !annual_list.includes(`read${cYear}`)) {
            const folderPath = `/mnt/stock/twse/${index}`;
            const filePath = `${folderPath}/tmp`;
            const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : Mkdirp(folderPath);
            return mkfolder().then(() => getTwseAnnual(index, cYear, filePath).then(filename => GoogleApi('upload', {
                type: 'auto',
                name: `${cYear}${getExtname(filename).ext}`,
                filePath,
                parent: annual_folder,
                rest: () => {
                    cYear--;
                    if (cYear > year - 5) {
                        return new Promise((resolve, reject) => setTimeout(() => resolve(recur_annual(cYear, annual_folder)), _annualDelay));
                    }
                },
                errhandle: err => handleError(err),
            })).catch(err => {
                handleError(err, 'get annual');
                cYear--;
                if (cYear > year - 5) {
                    return new Promise((resolve, reject) => setTimeout(() => resolve(recur_annual(cYear, annual_folder)), _annualDelay));
                }
            }));
        } else {
            cYear--;
            if (cYear > year - 5) {
                return recur_annual(cYear, annual_folder);
            }
        }
    }
    return GoogleApi('list folder', {
        folderId: folder,
        name: `tw${index}`,
    }).then(annualList => (annualList.length < 1) ? GoogleApi('create', {
        name: `tw${index}`,
        parent: folder,
    }).then(metadata => recur_annual(year, metadata.id)) : GoogleApi('list file', {folderId: annualList[0].id}).then(metadataList => {
        for (let i of metadataList) {
            annual_list.push(getExtname(i.title).front);
        }
        console.log(annual_list);
        return recur_annual(year, annualList[0].id);
    }));
}

export const stockStatus = newStr => Mongo('find', TOTALDB, {sType: {$exists: false}}).then(items => {
    /*const gp = getUssePrice();
    const addStock = [];
    items.forEach(t => {
        if (t.setype === 'usse' && !gp[t.index]) {
            addStock.push(t.index);
        }
    });
    if (addStock.length > 0) {
        usseSubStock(addStock, false);
    }*/
    const ussePosition = getUssePosition();
    const usseOrder = getUsseOrder();
    console.log(ussePosition);
    console.log(usseOrder);
    const twsePosition = getTwsePosition();
    const twseOrder = getTwseOrder();
    console.log(twsePosition);
    console.log(twseOrder);
    const recur_price = index => {
        if (index >= items.length) {
            if (newStr && (!stringSent || stringSent !== _dateFactory().getDay() + 1)) {
                stringSent = _dateFactory().getDay() + 1;
            }
            return Promise.resolve();
        } else {
            return (items[index].index === 0 || !items[index].index) ? recur_price(index + 1) : getStockPrice(items[index].setype, items[index].index, true).then(([price, previousPrice]) => {
                if (price === 0) {
                    return 0;
                }
                return Mongo('find', TOTALDB, {_id: items[index]._id}).then(sitems => {
                    if (sitems.length < 1) {
                        return handleError(new HoError(`miss ${items[index].index}`));
                    }
                    const item = sitems[0];
                    let change_previous = false;
                    //market cap multiple
                    if (item.mul) {
                        item.orig = item.orig * item.mul;
                        item.times = Math.floor(item.times * item.mul);
                    }
                    item.count = 0;
                    if (item.profit) {
                        item.orig += item.profit;
                    }
                    item.amount = item.orig;
                    if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'usse') {
                        for (let i = 0; i < ussePosition.length; i++) {
                            if (ussePosition[i].symbol === item.index) {
                                item.pricecost = ussePosition[i].price;
                                item.pl = ussePosition[i].amount * (price - ussePosition[i].price);
                                item.orig += item.pl;
                                item.count = ussePosition[i].amount;
                                item.amount = item.orig - ussePosition[i].amount * ussePosition[i].price;
                                break;
                            }
                        }
                        item.order = [];
                        for (let i = 0; i < usseOrder.length; i++) {
                            //console.log(usseOrder[i].symbol);
                            //console.log(item.index);
                            if (usseOrder[i].symbol === item.index) {
                                const time = new Date(usseOrder[i].time * 1000);
                                item.order.push(`${usseOrder[i].amount} ${usseOrder[i].type === 'MARKET' ? 'MARKET' : usseOrder[i].price} ${time.getMonth() + 1}/${time.getDate()}`);
                            }
                        }
                    } else if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'twse') {
                        for (let i = 0; i < twsePosition.length; i++) {
                            if (twsePosition[i].symbol === item.index) {
                                item.pricecost = twsePosition[i].price;
                                item.pl = twsePosition[i].amount * (price - twsePosition[i].price);
                                item.orig += item.pl;
                                item.count = twsePosition[i].amount;
                                item.amount = item.orig - twsePosition[i].amount * twsePosition[i].price;
                                break;
                            }
                        }
                        item.order = [];
                        for (let i = 0; i < twseOrder.length; i++) {
                            //console.log(twseOrder[i].symbol);
                            //console.log(item.index);
                            if (twseOrder[i].symbol === item.index) {
                                const time = new Date(twseOrder[i].time * 1000);
                                item.order.push(`${twseOrder[i].type.match(/IntradayOdd$/) ? twseOrder[i].amount / 1000 : twseOrder[i].amount} ${!twseOrder[i].type.match(/^LMT/) ? 'MARKET' : twseOrder[i].price} ${time.getMonth() + 1}/${time.getDate()}`);
                            }
                        }
                    }
                    console.log(item);
                    const fee = items[index].setype === 'usse' ? USSE_FEE : TRADE_FEE;
                    //new mid
                    let newArr = resolveNewMidStack(item.newMid, price, item.mid, item.web, (nm) => {
                        console.log(nm);
                    });
                    let suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, item.pricecost, item.pl, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                    const processResetWeb = (recalcCount) => {
                        if (!suggestion.resetWeb) return Promise.resolve();
                        item.newMid.push(suggestion.newMid);
                        // Stack depth limit: recalculate from half history
                        if (item.newMid.length >= MAX_NEWMID_STACK) {
                            recalcCount++;
                            if (recalcCount > 2) {
                                item.newMid = [];
                                newArr = item.web;
                                return Promise.resolve();
                            }
                            return Redis('hgetall', `interval: ${items[index].setype}${items[index].index}`).then(cached => {
                                if (cached && cached.raw_list) {
                                    const rawData = JSON.parse(cached.raw_list);
                                    const adjList = cached.adjustments ? JSON.parse(cached.adjustments) : [];
                                    const { raw_arr, max, min } = applyAdjustments(rawData, adjList);
                                    if (raw_arr.length > 0 && max > 0 && min > 0) {
                                        let fraction = 2;
                                        let recalcWeb = null;
                                        while (fraction <= 8) {
                                            const halfLen = Math.max(Math.floor(raw_arr.length / fraction), 20);
                                            const bins = computeBinCount(raw_arr, 0, halfLen);
                                            const loga = logArray(max, min, bins);
                                            recalcWeb = calStair(raw_arr, loga, min, 0, fee, halfLen);
                                            if (recalcWeb) break;
                                            fraction *= 2;
                                        }
                                        if (recalcWeb) {
                                            item.mid = recalcWeb.mid;
                                            item.web = recalcWeb.arr;
                                            item.newMid = [];
                                            newArr = item.web;
                                        } else {
                                            // Fallback: ratio-based
                                            const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                                            item.mid = item.newMid[item.newMid.length - 1];
                                            item.web = item.web.map(v => v * ratio);
                                            item.newMid = [];
                                            newArr = item.web;
                                        }
                                    } else {
                                        // Fallback: ratio-based
                                        const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                                        item.mid = item.newMid[item.newMid.length - 1];
                                        item.web = item.web.map(v => v * ratio);
                                        item.newMid = [];
                                        newArr = item.web;
                                    }
                                } else {
                                    // No cached data: ratio-based fallback
                                    const ratio = item.newMid[item.newMid.length - 1] / item.mid;
                                    item.mid = item.newMid[item.newMid.length - 1];
                                    item.web = item.web.map(v => v * ratio);
                                    item.newMid = [];
                                    newArr = item.web;
                                }
                                suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, item.pricecost, item.pl, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                                return processResetWeb(recalcCount);
                            });
                        } else {
                            newArr = scaleWebArr(item.newMid, item.mid, item.web);
                        }
                        suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, item.pricecost, item.pl, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                        return processResetWeb(recalcCount);
                    };
                    return processResetWeb(0).then(() => {
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
                    suggestion.buy = suggestion.buy + (item.bquantity ? item.bquantity : 0) + (item.boddquantity ? item.boddquantity : 0);
                    suggestion.sell = suggestion.sell + (item.squantity ? item.squantity : 0) + (item.soddquantity ? item.soddquantity : 0);
                    if (!item.clear) {
                        let count = 0;
                        let amount = item.amount;
                        if (item.newMid.length > 0 && item.newMid[item.newMid.length - 1] <= item.mid) {
                            if (suggestion.buy > 0 && amount > item.orig * 5 / 8) {
                                let tmpAmount = amount - item.orig / 2;
                                while ((tmpAmount - suggestion.buy) > 0) {
                                    amount -= suggestion.buy;
                                    tmpAmount = amount - item.orig / 2;
                                    count++;
                                }
                                if (count > suggestion.bCount) {
                                    suggestion.bCount = count;
                                }
                                suggestion.str += `[new buy ${count}] `;
                            }
                        } else if (item.newMid.length <= 0) {
                            if (suggestion.buy > 0) {
                                if (suggestion.type === 7) {
                                    if (amount > item.orig * 7 / 8) {
                                        let tmpAmount = amount - item.orig * 3 / 4;
                                        while ((tmpAmount - suggestion.buy) > 0) {
                                            amount -= suggestion.buy;
                                            tmpAmount = amount - item.orig * 3 / 4;
                                            count++;
                                        }
                                        if (count > suggestion.bCount) {
                                            suggestion.bCount = count;
                                        }
                                        suggestion.str += `[new buy ${count}] `;
                                    } else {
                                        suggestion.str += '[new buy no need] ';
                                    }
                                } else if (suggestion.type === 3) {
                                    if (amount > item.orig * 5 / 8) {
                                        let tmpAmount = amount - item.orig / 2;
                                        while ((tmpAmount - suggestion.buy) > 0) {
                                            amount -= suggestion.buy;
                                            tmpAmount = amount - item.orig / 2;
                                            count++;
                                        }
                                        if (count > suggestion.bCount) {
                                            suggestion.bCount = count;
                                        }
                                        suggestion.str += `[new buy ${count}] `;
                                    } else {
                                        suggestion.str += '[new buy no need] ';
                                    }
                                } else if (suggestion.type === 6) {
                                    if (amount > item.orig * 3 / 8) {
                                        let tmpAmount = amount - item.orig / 4;
                                        while ((tmpAmount - suggestion.buy) > 0) {
                                            amount -= suggestion.buy;
                                            tmpAmount = amount - item.orig / 4;
                                            count++;
                                        }
                                        if (count > suggestion.bCount) {
                                            suggestion.bCount = count;
                                        }
                                        suggestion.str += `[new buy ${count}] `;
                                    } else {
                                        suggestion.str += '[new buy no need] ';
                                    }
                                }
                            }
                        }
                        count = 0;
                        amount = item.amount;
                        if (item.newMid.length > 0 && item.newMid[item.newMid.length - 1] >= item.mid) {
                            if (suggestion.sell > 0 && amount < item.orig * 3 / 8) {
                                let tmpAmount = item.orig / 2 - amount;
                                while ((tmpAmount - suggestion.sell * (1 - fee)) > 0) {
                                    amount += (suggestion.sell * (1 - fee));
                                    tmpAmount = item.orig / 2 - amount;
                                    count++;
                                }
                                if (count > suggestion.sCount) {
                                    suggestion.sCount = count;
                                }
                                suggestion.str += `[new sell ${count}] `;
                            }
                        } else if (item.newMid.length <= 0) {
                            if (suggestion.sell > 0) {
                                if (suggestion.type === 9) {
                                    if (amount < item.orig / 8) {
                                        let tmpAmount = item.orig / 4 - amount;
                                        while ((tmpAmount - suggestion.sell * (1 - fee)) > 0) {
                                            amount += (suggestion.sell * (1 - fee));
                                            tmpAmount = item.orig / 4 - amount;
                                            count++;
                                        }
                                        if (count > suggestion.sCount) {
                                            suggestion.sCount = count;
                                        }
                                        suggestion.str += `[new sell ${count}] `;
                                    } else {
                                        suggestion.str += '[new sell no need] ';
                                    }
                                } else if (suggestion.type === 5) {
                                    if (amount < item.orig * 3 / 8) {
                                        let tmpAmount = item.orig / 2 - amount;
                                        while ((tmpAmount - suggestion.sell * (1 - fee)) > 0) {
                                            amount += (suggestion.sell * (1 - fee));
                                            tmpAmount = item.orig / 2 - amount;
                                            count++;
                                        }
                                        if (count > suggestion.sCount) {
                                            suggestion.sCount = count;
                                        }
                                        suggestion.str += `[new sell ${count}] `;
                                    } else {
                                        suggestion.str += '[new sell no need] ';
                                    }
                                } else if (suggestion.type === 8) {
                                    if (amount < item.orig * 5 / 8) {
                                        let tmpAmount = item.orig * 3 / 4 - amount;
                                        while ((tmpAmount - suggestion.sell * (1 - fee)) > 0) {
                                            amount += (suggestion.sell * (1 - fee));
                                            tmpAmount = item.orig * 3 / 4 - amount;
                                            count++;
                                        }
                                        if (count > suggestion.sCount) {
                                            suggestion.sCount = count;
                                        }
                                        suggestion.str += `[new sell ${count}] `;
                                    } else {
                                        suggestion.str += '[new sell no need] ';
                                    }
                                }
                            }
                        }
                    }
                    console.log(suggestion.str);
                    if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'usse') {
                    } else if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'twse') {
                    } else if (newStr && (!stringSent || stringSent !== _dateFactory().getDay() + 1)) {
                        sendWs(`${item.name} ${suggestion.str}`, 0, 0, true);
                    }
                    if (item.count < suggestion.sCount * 4 / 3) {
                        suggestion.sCount = Math.floor(item.count);
                    }
                    if (item.amount < suggestion.bCount * suggestion.buy * 4 / 3) {
                        if (item.amount < suggestion.bCount * suggestion.buy * 2 / 3) {
                            suggestion.bCount = 0;
                            suggestion.buy = 0;
                        } else {
                            suggestion.bCount = (item.amount < 0) ? 0 : Math.floor(item.amount / suggestion.buy);
                        }
                    }
                    if (item.setype === 'usse') {
                        suggestionData['usse'][item.index] = suggestion;
                    } else {
                        suggestionData['twse'][item.index] = suggestion;
                    }
                    /*if (suggestion.type === 2) {
                        if (Math.abs(suggestion.buy - item.bCurrent) + item.bCurrent > (1 + fee) * (1 + fee) * item.bCurrent) {
                            item.bTarget = item.bCurrent;
                            item.bCurrent = suggestion.buy;
                        }
                    } else if (price > item.bTarget * 1.05) {
                        item.bCurrent = 0;
                        item.bTarget = 0;
                    }
                    if (suggestion.type === 4) {
                        if (Math.abs(suggestion.sell - item.sCurrent) + item.sCurrent > (1 + fee) * (1 + fee) * item.sCurrent) {
                            item.sTarget = item.sCurrent;
                            item.sCurrent = suggestion.sell;
                        }
                    } else if (price < item.sTarget * 0.95) {
                        item.sCurrent = 0;
                        item.sTarget = 0;
                    }
                    if (item.count > 0 && suggestion.type === 1 && price < item.price) {
                        sendWs(`${item.name} SELL ALL NOW!!!`, 0, 0, true);
                    }
                    if (item.bTarget && price >= item.bTarget && price > item.price && item.amount >= price) {
                        sendWs(`${item.name} BUY NOW!!!`, 0, 0, true);
                    }
                    if (item.sTarget && price <= item.sTarget && price < item.price && item.count > 0) {
                        sendWs(`${item.name} SELL NOW!!!`, 0, 0, true);
                    }*/
                    /*
                    const high = (!item.high || price > item.high) ? price : item.high;
                    if (price > item.price) {
                        if (price <= item.bottom * 1.05 && price >= item.bottom) {
                            sendWs(`${item.name} BUY!!!`, 0, 0, true);
                        }
                    } else if (item.count > 0 && price < item.price) {
                        if (high > item.top && price < item.top) {
                            sendWs(`${item.name} SELL!!!`, 0, 0, true);
                        } else {
                            let midB = item.bottom;
                            let midT = item.bottom * 1.2;
                            while(midB < item.top) {
                                if (high < midT) {
                                    if (price < midB * 0.95 || price < high*0.9) {
                                        sendWs(`${item.name} SELL!!!`, 0, 0, true);
                                    }
                                    break;
                                }
                                midB = midT;
                                midT = midB * 1.2;
                            }
                        }
                    }*/
                    return Mongo('update', TOTALDB, {_id: item._id}, {$set : Object.assign({
                        price,
                        previousPrice,
                        str: suggestion.str,
                        //sent: item.sent,
                        //bTarget: item.bTarget,
                        //bCurrent: item.bCurrent,
                        //sTarget: item.sTarget,
                        //sCurrent: item.sCurrent,
                        newMid: item.newMid,
                        mid: item.mid,
                        web: item.web,
                        count: item.count,
                        amount: item.amount,
                        order: item.order,
                    }, change_previous ? {
                        previous: item.previous,
                    } : {})});
                    });
                });
            }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(recur_price(index + 1)), _statusDelay)))
            //}).then(() => recur_price(index + 1));
        }
    }
    return recur_price(0).then(() => {
        // §6d Emergency Stop: if >EMERGENCY_STOP_THRESHOLD% of items have non-empty newMid, force all to fakeOrder
        const activeItems = items.filter(it => it.index !== 0 && it.index);
        if (activeItems.length > 0) {
            const shiftedCount = activeItems.filter(it => it.newMid && it.newMid.length > 0).length;
            if (shiftedCount > activeItems.length * EMERGENCY_STOP_THRESHOLD / 100) {
                console.log(`[emergency stop] ${shiftedCount}/${activeItems.length} items have non-empty newMid — forcing fakeOrder`);
                ['twse', 'usse'].forEach(setype => {
                    Object.keys(suggestionData[setype]).forEach(key => {
                        suggestionData[setype][key].bCount = 0;
                        suggestionData[setype][key].sCount = 0;
                    });
                });
            }
        }
        if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
            return Mongo('update', TOTALDB, {index: 0, setype: 'usse'}, {$set : {
                amount: ussePosition[ussePosition.length -1].price,
            }}).then(() => {
                if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
                    return Mongo('update', TOTALDB, {index: 0, setype: 'twse'}, {$set : {
                        amount: twsePosition[twsePosition.length -1].price,
                    }});
                } else {
                    return Promise.resolve();
                }
            });
        } else if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
            return Mongo('update', TOTALDB, {index: 0, setype: 'twse'}, {$set : {
                amount: twsePosition[twsePosition.length -1].price,
            }});
        } else {
            return Promise.resolve();
        }
    });
});

export const getStockListV2 = (type, year, month) => {
    switch(type) {
        case 'twse':
        let quarter = 3;
        if (month < 4) {
            quarter = 4;
            year--;
        } else if (month < 7) {
            quarter = 1;
        } else if (month < 10) {
            quarter = 2;
        }
        return Api('url', 'https://mopsov.twse.com.tw/mops/web/ajax_t78sb04', {post: {
            encodeURIComponent: '1',
            TYPEK: 'all',
            step: '1',
            run: 'Y',
            firstin: 'true',
            FUNTYPE: '02',
            year: year - 1911,
            season: completeZero(quarter, 2),
            fund_no: '0',
        }}).then(raw_data => {
            const stock_list = [];
            const tables = findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'table');
            let tag = false;
            tables.forEach(table => {
                if (table.attribs.class === 'noBorder') {
                    const name = findTag(findTag(findTag(table, 'tr')[0], 'td')[1])[0];
                    tag = false;
                    for (let i = 0; i < STOCK_INDEX[type].length; i++) {
                        if (name === STOCK_INDEX[type][i].name) {
                            tag = STOCK_INDEX[type][i].tag;
                            break;
                        }
                    }
                } else {
                    if (tag) {
                        findTag(table, 'tr').forEach(tr => {
                            if (tr.attribs.class === 'even' || tr.attribs.class === 'odd') {
                                const index = findTag(findTag(tr, 'td')[0])[0];
                                if (Number(index)) {
                                    if (index != '2888') {
                                        let exist = false;
                                        for (let i = 0; i < stock_list.length; i++) {
                                            if (stock_list[i].index === index) {
                                                exist = true;
                                                tag.forEach(v => stock_list[i].tag.push(v));
                                                break;
                                            }
                                        }
                                        if (!exist) {
                                            stock_list.push({
                                                index,
                                                tag: tag.map(v => v),
                                                type: 'twse',
                                            });
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            });
            console.log(stock_list);
            return stock_list;
        });
        case 'usse':
        const list = ['Dow_Jones_Industrial_Average', 'Nasdaq-100', 'List_of_S%26P_500_companies'];
        const stock_list = [];
        const recur_get = index => {
            if (index >= list.length) {
                console.log(stock_list.length);
                console.log(stock_list);
                return stock_list;
            } else {
                return Api('url', `https://en.wikipedia.org/wiki/${list[index]}`).then(raw_data => {
                    findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'mw-page-container')[0], 'div', 'mw-page-container-inner')[0], 'div', 'mw-content-container')[0], 'main', 'content')[0], 'div', 'bodyContent')[0], 'div', 'mw-content-text')[0], 'div', 'mw-content-ltr mw-parser-output')[0], 'table', 'constituents')[0], 'tbody')[0], 'tr').forEach(t => {
                        let name = null;
                        let sIndex = null;
                        if (list[index] === 'Dow_Jones_Industrial_Average') {
                            const a = findTag(findTag(t, 'th')[0], 'a')[0];
                            if (a) {
                                name = toValidName(findTag(a)[0]).replace('&amp;', '&').replace('&#x27;', "'");
                                sIndex = findTag(findTag(findTag(t, 'td')[1], 'a')[0])[0].replace('.', '-');
                            }
                        } else {
                            const d = findTag(t, 'td')[0];
                            if (d) {
                                const a = findTag(findTag(t, 'td')[1], 'a')[0];
                                if (a) {
                                    name = findTag(a)[0].replace('&amp;', '&').replace('&#x27;', "'");
                                } else {
                                    name = findTag(findTag(t, 'td')[1])[0].replace('&amp;', '&').replace('&#x27;', "'");
                                }
                                const a1 = findTag(d, 'a')[0];
                                if (a1) {
                                    sIndex = findTag(a1)[0].replace('.', '-');
                                } else {
                                    sIndex = findTag(d)[0].replace('.', '-');
                                }
                            }
                        }
                        if (name && sIndex) {
                            let is_exit = false;
                            for (let i = 0; i < stock_list.length; i++) {
                                if (stock_list[i].index === sIndex) {
                                    is_exit = true;
                                    stock_list[i].tag.push(list[index] === 'Dow_Jones_Industrial_Average' ? 'dow jones' : list[index] === 'Nasdaq-100' ? 'nasdaq 100' : 's&p 500');
                                    break;
                                }
                            }
                            if (!is_exit && sIndex !== 'ETFC' && sIndex !== 'MRP-W' && sIndex.length <= 6) {
                                stock_list.push({
                                    index: sIndex,
                                    tag: [name, list[index] === 'Dow_Jones_Industrial_Average' ? 'dow jones' : list[index] === 'Nasdaq-100' ? 'nasdaq 100' : 's&p 500'],
                                    type: 'usse',
                                });
                            }
                        }
                    });
                    return recur_get(index + 1);
                });
            }
        }
        return recur_get(0);
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

// Scale web array by the current newMid stack
export const scaleWebArr = (stack, mid, webArr) =>
    stack.length > 0 ? webArr.map(v => v * stack[stack.length - 1] / mid) : webArr;

// Calculate the new midpoint when price breaks out of the web array
// Uses σ boundary from the normal distribution structure
// stackDepth: current newMid stack length → graduated shift (1σ → 1.5σ → 2σ ...)
export const calcResetMid = (priceArray, fee, direction, stackDepth = 0) => {
    // Collect σ-boundary prices (negative markers in the array)
    const boundaries = [];
    for (let i = 0; i < priceArray.length; i++) {
        if (priceArray[i] < 0) boundaries.push(Math.abs(priceArray[i]));
    }
    // Mid = 4th boundary from top
    const midIdx = Math.min(3, boundaries.length - 1);
    const midPrice = boundaries[midIdx];
    // Graduated multiplier: 1σ, 1.5σ, 2σ, 2.5σ, ...
    const multiplier = 1 + 0.5 * stackDepth;
    if (direction === 1) {
        // Price below array → shift mid down
        const sigma1Idx = midIdx + 1;
        const sigma1Price = sigma1Idx < boundaries.length ? boundaries[sigma1Idx] : midPrice * (1 - fee * 10);
        const sigma1Dist = midPrice - sigma1Price;
        let newMid = midPrice - sigma1Dist * multiplier;
        const cap = midPrice * (1 - fee * 10);
        if (newMid > cap) newMid = cap;
        return newMid;
    } else {
        // Price above array → shift mid up
        const sigma1Idx = midIdx - 1;
        const sigma1Price = sigma1Idx >= 0 ? boundaries[sigma1Idx] : midPrice * (1 + fee * 10);
        const sigma1Dist = sigma1Price - midPrice;
        let newMid = midPrice + sigma1Dist * multiplier;
        const cap = midPrice * (1 + fee * 10);
        if (newMid < cap) newMid = cap;
        return newMid;
    }
};

// Unwind the newMid stack when price returns towards original mid
export const resolveNewMidStack = (stack, price, mid, webArr, onPop) => {
    while (stack.length > 0) {
        const nm = stack[stack.length - 1];
        const checkMid = stack.length > 1 ? stack[stack.length - 2] : mid;
        if (!((nm > checkMid && (price < checkMid || nm <= mid)) ||
              (nm <= checkMid && (price > checkMid || nm > mid)))) break;
        stack.pop();
        if (onPop) onPop(nm);
    }
    return scaleWebArr(stack, mid, webArr);
};

export const stockProcess = (price, priceArray, priceTimes = 1, previous = {buy:[], sell:[]}, pOrig, pAmount, pCount, pPricecost, pPl, upLimit, pType = 0, sType = 0, fee = TRADE_FEE, ttime = TRADE_TIME, tinterval = TRADE_INTERVAL, now = Math.round(_dateFactory().getTime() / 1000), newMidDepth = 0) => {
    priceTimes = priceTimes ? priceTimes : 1;
    //const now = Math.round(_dateFactory().getTime() / 1000);
    //const t5 = (pType|16) === pType ? true : false;
    let is_buy = true;
    let is_sell = true;
    let bTimes = 1;
    let sTimes = 1;
    let bP = 8;
    let nowBP = priceArray.length - 1;
    //let bAdd = sType === 0 ? 0 : 1;
    //let sAdd = sType === 0 ? 0 : 1;
    let bAdd = 0;
    let sAdd = 0;
    //let tmpB = 0;
    for (; nowBP >= 0; nowBP--) {
        if (Math.abs(priceArray[nowBP]) * (sType === 0 ? 1.001 : 1.0001) >= price) {
            break;
        }
        if (priceArray[nowBP] < 0) {
            bP--;
        }
    }
    if (nowBP === priceArray.length - 1) {
    //if (bP > 6) {
        const newMid = calcResetMid(priceArray, fee, 1, newMidDepth);
        return {
            resetWeb: 1,
            newMid,
        }
        //return {
        //    str: 'SELL ALL',
        //    type: 1,
        //};
    }
    let sP = 0;
    let nowSP = 0;
    for (; nowSP < priceArray.length; nowSP++) {
        /*if ((sP < 6) && (priceArray[nowSP] < 0)) {
            tmpB = Math.abs(priceArray[nowSP]);
        }*/
        if (Math.abs(priceArray[nowSP]) * (sType === 0 ? 0.999 : 0.9999) <= price) {
            break;
        }
        if (priceArray[nowSP] < 0) {
            sP++;
        }
    }
    if (nowSP === 0) {
    //if (sP < 2) {
        const newMid = calcResetMid(priceArray, fee, 2, newMidDepth);
        return {
            resetWeb: 2,
            newMid,
        }
    }
    if (previous.time) {
        if (previous.price >= price) {
            let previousP = priceArray.length - 1;
            let pP = 8;
            let pPrice = ((previous.tprice && previous.tprice < previous.price) ? previous.tprice : previous.price) * (2 - (1 + fee) * (1 + fee));
            //let pPrice = (previous.type === 'sell') ? previous.price * (2 - (1 + fee) * (1 + fee)) : previous.price;
            for (; previousP >= 0; previousP--) {
                if (Math.abs(priceArray[previousP]) * (sType === 0 ? 1.001 : 1.0001) >= pPrice) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP--;
                }
            }
            if (pCount !== 0 || bP < 5) {
                nowBP = previousP > nowBP ? previousP : nowBP;
                bP = pP > bP ? pP : bP;
            }
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'buy') {
                if ((now - previous.time) >= (ttime + (nowBP - previousP) * tinterval)) {
                    is_buy = true;
                    bTimes = bTimes * (nowBP - previousP + 1);
                } else {
                    is_buy = false;
                }
                if ((now - previous.time) >= ttime) {
                    is_sell = true;
                } else {
                    is_sell = false;
                }
                /*if (!previous.real) {
                    is_buy = true;
                    is_sell = true;
                }*/
            } else if (previous.type === 'sell') {
                if ((now - previous.time) >= ttime) {
                    is_buy = true;
                    is_sell = true;
                } else {
                    is_sell = false;
                    is_buy = false;
                }
                /*if (!previous.real) {
                    is_buy = true;
                    is_sell = true;
                }*/
            }
            pPrice = ((previous.tprice && previous.tprice > previous.price) ? previous.tprice : previous.price) * (1 + fee) * (1 + fee);
            //pPrice = (previous.type === 'buy') ? previous.price * (1 + fee) * (1 + fee) : previous.price;
            previousP = 0;
            pP = 0;
            for (; previousP < priceArray.length; previousP++) {
                if (Math.abs(priceArray[previousP]) * (sType === 0 ? 0.999 : 0.9999) <= pPrice) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP++;
                }
            }
            //if (pAmount > 0) {
                nowSP = previousP < nowSP ? previousP : nowSP;
                sP = pP < sP ? pP : sP;
            //}
        }
        if (previous.price < price) {
            let previousP = 0;
            let pP = 0;
            let pPrice = ((previous.tprice && previous.tprice > previous.price) ? previous.tprice : previous.price) * (1 + fee) * (1 + fee);
            //let pPrice = (previous.type === 'buy') ? previous.price * (1 + fee) * (1 + fee) : previous.price;
            for (; previousP < priceArray.length; previousP++) {
                if (Math.abs(priceArray[previousP]) * (sType === 0 ? 0.999 : 0.9999) <= pPrice) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP++;
                }
            }
            if (pAmount > 0) {
                nowSP = previousP < nowSP ? previousP : nowSP;
                sP = pP < sP ? pP : sP;
            }
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'sell') {
                if ((now - previous.time) >= (ttime + (previousP - nowSP) * tinterval)) {
                    is_sell = true;
                    sTimes = sTimes * (previousP - nowSP + 1);
                } else {
                    is_sell = false;
                }
                if ((now - previous.time) >= ttime) {
                    is_buy = true;
                } else {
                    is_buy = false;
                }
                /*if (!previous.real) {
                    is_buy = true;
                    is_sell = true;
                }*/
            } else if (previous.type === 'buy') {
                if ((now - previous.time) >= ttime) {
                    is_buy = true;
                    is_sell = true;
                } else {
                    is_buy = false;
                    is_sell = false;
                }
                /*if (!previous.real) {
                    is_buy = true;
                    is_sell = true;
                }*/
            }
            pPrice = ((previous.tprice && previous.tprice < previous.price) ? previous.tprice : previous.price) * (2 - (1 + fee) * (1 + fee));
            //pPrice = (previous.type === 'sell') ? previous.price * (2 - (1 + fee) * (1 + fee)) : previous.price;
            previousP = priceArray.length - 1;
            pP = 8;
            for (; previousP >= 0; previousP--) {
                if (Math.abs(priceArray[previousP]) * (sType === 0 ? 1.001 : 1.0001) >= pPrice) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP--;
                }
            }
            if (pCount !== 0 || bP < 5) {
                nowBP = previousP > nowBP ? previousP : nowBP;
                bP = pP > bP ? pP : bP;
            }
        }
        //if (pType === 0 && previous.buy && previous.sell) {
        /*if (previous.buy.length > 0 && previous.sell.length > 0) {
            if (!t5) {
                if (previous.buy[0].price * 1.01 < Math.abs(priceArray[nowBP + 1])) {
                    bAdd--;
                }*//* else if (previous.buy[0].price * 0.99 > Math.abs(priceArray[nowBP + 1])) {
                    bAdd++;
                }
                if (previous.sell[0].price * 1.01 < Math.abs(priceArray[nowSP - 1])) {
                    sAdd++;
                } else *//*if (previous.sell[0].price * 0.99 > Math.abs(priceArray[nowSP - 1])) {
                    sAdd--;
                }
            } else {
                *//*if (previous.buy[0].price * 1.01 < Math.abs(priceArray[nowBP + 1])) {
                    bAdd++;
                } else*/ /*if (previous.buy[0].price * 0.99 > Math.abs(priceArray[nowBP + 1])) {
                    bAdd--;
                }
                if (previous.sell[0].price * 1.01 < Math.abs(priceArray[nowSP - 1])) {
                    sAdd--;
                }*/ /*else if (previous.sell[0].price * 0.99 > Math.abs(priceArray[nowSP - 1])) {
                    sAdd++;
                }*/
            //}
            //console.log(previous);
            /*console.log(Math.abs(priceArray[nowBP + 1]));
            console.log(bAdd);
            console.log(Math.abs(priceArray[nowSP - 1]));
            console.log(sAdd);*/
        //}
    }
    /*console.log(nowBP);
    console.log(nowSP);
    console.log(bP);
    console.log(sP);*/
    let buy = 0;
    let sell = 0;
    let str = '';
    let bCount = 1;
    let sCount = 1;
    let type = 0;
    bCount = bTimes * bCount * priceTimes;
    sCount = sTimes * sCount * priceTimes;
    const finalSell = () => {
        /*if (pAmount <= sell * priceTimes * 2) {
            sCount = Math.floor(pOrig / sell / 4 / priceTimes) * priceTimes;
            if (type === 8 || type === 5 || type === 9) {
                type = 0;
            }
        } else {*/
            /*if (sCount < (2 * priceTimes) && (pAmount / price) < (2 * priceTimes)) {
                sCount = 2 * priceTimes;
            } else if (pCount <= (2 * priceTimes) && sCount > priceTimes) {
                sCount = priceTimes;
            }*/
            if (pPricecost && pPl && pPl < 0 && -pPl < (pOrig * 1 / 4) && sCount > 0 && ((pAmount - pPl) / pOrig) > (3 / 4)) {
                if (sell >= pPricecost) {
                    //sCount = sTimes * priceTimes;
                } else {
                    sCount = 0;
                    //sell = 0;
                    if (type === 8 || type === 5 || type === 9) {
                        type = 0;
                    }
                }
            }
        //}
        if (pCount === 0) {
            sCount = 0;
            //sell = 0;
            if (type === 8 || type === 5 || type === 9) {
                type = 0;
            }
        }
        //維持賣掉後至剩1/4
        if (pAmount > 0 && ((pAmount + sCount * sell) > (pOrig * 3 / 4))) {
            let count = 0;
            let tmpAmount = pOrig * 3 / 4 - pAmount;
            while ((tmpAmount - sell * (1 - fee)) > 0) {
                pAmount += (sell * (1 - fee));
                tmpAmount = pOrig * 3 / 4 - pAmount;
                count++;
            }
            if (count < sCount) {
                sCount = count;
            }
        }
        if (pAmount == 0) {
            sCount = 4 * priceTimes;
        }
        /*if (pAmount && sCount) {
            const remain = pCount - sCount;
            if (pCount < 3 * priceTimes) {
                sCount = priceTimes;
            } else if (pCount < 5 * priceTimes) {
                sCount = 2 * priceTimes;
            } else if (remain < 2 * priceTimes) {
                sCount = sCount - 2 * priceTimes + remain;
            }
        }*/
    }
    const finalBuy = () => {
        /*if (bCount < (2 * priceTimes) && pCount <= (2 * priceTimes)) {
            bCount = 2 * priceTimes;
        }*/
        /*if (pPricecost && pPl && pPl < 0 && bCount > 0 && (pRemain < (1 / 4) || (!sType && pAmount < price))) {
            if (buy <= pPricecost) {
                //bCount = bTimes * priceTimes;
            } else {
                bCount = 0;
                buy = 0;
            }
        }*/
        if (pCount < priceTimes * 2) {
            bCount = Math.floor(pOrig / buy / 4 / priceTimes) * priceTimes;
            if (buy > upLimit) {
                buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(upLimit, false) : usseTicker(upLimit, false) : (sType === 1) ? bitfinexTicker(upLimit, false) : upLimit;
            }
            if (type === 6 || type === 3 || type === 7) {
                type = 0;
            }
        }
        if (pAmount <= 0 || ((pAmount / price * 10000) < 1) || (!sType && pAmount < price)) {
            bCount = 0;
            if (type === 6 || type === 3 || type === 7) {
                type = 0;
            }
            //buy = 0;
        }
        /*if (pAmount && bCount) {
            const nowC = Math.floor(pAmount / buy)
            const remain = nowC - bCount;
            if (nowC < 3 * priceTimes) {
                bCount = priceTimes;
            } else if (nowC < 5 * priceTimes) {
                bCount = 2 * priceTimes;
            } else if (remain < 2 * priceTimes) {
                bCount = bCount - 2 * priceTimes + remain;
            }
        }*/
    }
    if (is_buy) {
        /*if (bP > 4) {
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            bCount = bCount * 2;
            str += `Buy ${buy} ( ${bCount} ) `;
        } else {
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            if (pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            str += `Buy ${buy} ( ${bCount} ) `;
        }*/
        if (bP < 3) {
            str += 'Buy too high ';
            bCount = 0;
        } else if (bP > 6) {
            //type = 2;
            //type = 3;
            type = 6;
            //buy = Math.round(Math.abs(priceArray[nowBP]) * 100) / 100;
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
            //buy = Math.round(tmpB * 100) / 100;
            finalBuy();
            str += `Buy 3/4 ${buy} ( ${bCount} ) `;
        } else if (bP > 5) {
            type = 3;
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
            finalBuy();
            str += `Buy 1/2 ${buy} ( ${bCount} ) `;
        } else if (bP > 4) {
            type = 7;
            //type = 3;
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
            finalBuy();
            str += `Buy 1/4 ${buy} ( ${bCount} ) `;
        } else {
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            /*if (pType === 0) {
                bCount = bCount * (2 + bAdd);
            } else if (pType === 4 || pType === 3) {
                bCount = bCount * 2;
            }*/
            bCount = bCount * (1 + bAdd);
            finalBuy();
            str += `Buy ${buy} ( ${bCount} ) `;
        }
    } else {
        bCount = 0;
    }
    if (is_sell) {
        /*if (sP < 4) {
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            if (pType === 5 || pType === 4) {
                sCount = sCount * 2;
            }
            str += `Sell ${sell} ( ${sCount} ) `;
        } else {
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            if (pType === 2 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            str += `Sell ${sell} ( ${sCount} ) `;
        }*/
        if (sP > 5) {
            str += 'Sell too low ';
            sCount = 0;
        } else if (sP < 2) {
            //type = 4;
            //type = 5;
            type = 8;
            //sell = Math.round(Math.abs(priceArray[nowSP]) * 100) / 100;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 5 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }*/
            sCount = sCount * (1 + sAdd);
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            finalSell();
            str += `Sell 3/4 ${sell} ( ${sCount} ) `;
        } else if (sP < 3) {
            type = 5;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 5 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }*/
            sCount = sCount * (1 + sAdd);
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            finalSell();
            str += `Sell 1/2 ${sell} ( ${sCount} ) `;
        } else if (sP < 4) {
            type = 9;
            //type = 5;
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 5 || pType === 4) {
                sCount = sCount * 2;
            }*/
            sCount = sCount * (1 + sAdd);
            finalSell();
            str += `Sell 1/4 ${sell} ( ${sCount} ) `;
        } else {
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 2 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }*/
            sCount = sCount * (1 + sAdd);
            finalSell();
            str += `Sell ${sell} ( ${sCount} ) `;
        }
    } else {
        sCount = 0;
    }
    // Fee-aware dead zone (§3c): suppress signals too close to previous trade price
    if (previous.time && previous.price) {
        const deadZone = previous.price * fee * 3;
        if (buy > 0 && bCount > 0 && Math.abs(buy - previous.price) <= deadZone) {
            bCount = 0;
            str += '[dead zone] ';
        }
        if (sell > 0 && sCount > 0 && Math.abs(sell - previous.price) <= deadZone) {
            sCount = 0;
            str += '[dead zone] ';
        }
    }
    return {
        price,
        str,
        buy,
        sell,
        type,
        bCount,
        sCount,
    };
}

export const stockTest = (his_arr, loga, min, pType = 0, start = 0, reverse = false, len = 200, rinterval = RANGE_INTERVAL, fee = TRADE_FEE, ttime = TRADE_TIME, tinterval = TRADE_INTERVAL, resetWeb = 5, sType = 0) => {
    const now = Math.round(_dateFactory().getTime() / 1000);
    const fullRun = len <= 0;
    let count = 0;
    let privious = {};
    let priviousTrade = {buy:[], sell:[]};
    let buyTrade = 0;
    let sellTrade = 0;
    let stopLoss = 0;
    let newMid = [];
    let price = 0;
    let startI = fullRun
        ? Math.min(start, his_arr.length - 2)
        : ((start < (his_arr.length - len - 1)) ? start : (his_arr.length - len - 1));
    let checkweb = resetWeb;
    let web = null;
    let maxAmount = 0;
    let amount = 0;
    // Metrics tracking
    const equityCurve = [];
    const buyLog = [];   // { price, count, idx }
    const sellLog = [];  // { price, count, idx, profit }
    let peakEquity = 0;
    let maxDrawdown = 0;
    let drawdownStart = 0;
    let maxDrawdownDuration = 0;
    let currentDrawdownStart = -1;
    let grossProfit = 0;
    let grossLoss = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalWin = 0;
    let totalLoss = 0;

    // ── Phase 1: Find start position ──
    const scanLimit = fullRun ? 0 : (len - 1);
    const calStairLen = sType === 0 ? false : (fullRun ? false : (len * 3));
    if (!reverse) {
        for (; startI > scanLimit; startI--) {
            if (checkweb > resetWeb - 1) {
                checkweb = 0;
                web = calStair(his_arr, loga, min, startI, fee, calStairLen);
                maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                amount = maxAmount;
            } else {
                checkweb++;
            }
            if (his_arr[startI].h < web.mid) {
                privious = his_arr[startI + 1];
                if (his_arr[startI + 1].h === null) {
                    console.log(startI);
                    console.log(his_arr[startI + 1]);
                    return 'data miss';
                }
                break;
            }
        }
        if (startI <= scanLimit) {
            return {
                start: 0,
                metrics: {
                    maxAmount: 0, returnPct: 0, returnAnnualPct: 0,
                    buyHoldPct: 0, sharpe: 0, sortino: 0, calmar: 0,
                    maxDrawdownPct: 0, maxDrawdownDuration: 0,
                    winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
                    buyTrade: 0, sellTrade: 0, stopLoss: 0, tradeDays: 0,
                    tradesPerYear: 0,
                },
            }
        }
    } else {
        let next = 0;
        startI = start + len - 1;
        for (; startI < his_arr.length - len - 1; startI++) {
            if (checkweb > resetWeb - 1) {
                checkweb = 0;
                web = calStair(his_arr, loga, min, startI, fee, calStairLen);
                maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                amount = maxAmount;
            } else {
                checkweb++;
            }
            if (next && his_arr[startI].h < web.mid) {
                next = 2;
            }
            if ((!next && his_arr[startI].h < web.mid) || (next === 2 && his_arr[startI].h > web.mid)) {
                startI++;
                privious = his_arr[startI + 1];
                if (his_arr[startI + 1].h === null) {
                    console.log(startI);
                    console.log(his_arr[startI + 1]);
                    return 'data miss';
                }
                break;
            }
            if (!next) {
                next = 1;
            }
        }
    }

    // ── Helpers ──
    const newPrevious = (tradeType, tradePrice, time = Math.round(_dateFactory().getTime() / 1000)) => {
        if (tradeType === 'buy') {
            let is_insert = false;
            for (let k = 0; k < priviousTrade.buy.length; k++) {
                if (tradePrice < priviousTrade.buy[k].price) {
                    priviousTrade.buy.splice(k, 0, {price: tradePrice, time});
                    is_insert = true;
                    break;
                }
            }
            if (!is_insert) {
                priviousTrade.buy.push({price: tradePrice, time});
            }
            priviousTrade = {
                price: tradePrice, time, type: 'buy',
                buy: priviousTrade.buy.filter(v => (time - v.time < rinterval)),
                sell: priviousTrade.sell,
            }
        } else if (tradeType === 'sell') {
            let is_insert = false;
            for (let k = 0; k < priviousTrade.sell.length; k++) {
                if (tradePrice > priviousTrade.sell[k].price) {
                    priviousTrade.sell.splice(k, 0, {price: tradePrice, time});
                    is_insert = true;
                    break;
                }
            }
            if (!is_insert) {
                priviousTrade.sell.push({price: tradePrice, time});
            }
            priviousTrade = {
                price: tradePrice, time, type: 'sell',
                sell: priviousTrade.sell.filter(v => (time - v.time < rinterval)),
                buy: priviousTrade.buy,
            }
        }
    }

    const runSignal = (p, i, newArr) => {
        let suggest = stockProcess(p, newArr, web.times, priviousTrade, maxAmount, amount, count, 0, 0, Math.abs(web.arr[0]), pType, sType, fee, ttime, tinterval, now - (i * tinterval), newMid.length);
        let recalcCount = 0;
        while (suggest.resetWeb) {
            if (suggest.resetWeb === 1) stopLoss++;
            newMid.push(suggest.newMid);
            // Stack depth limit: recalculate from recent history
            if (newMid.length >= MAX_NEWMID_STACK) {
                recalcCount++;
                if (recalcCount > 2) {
                    // Safety: stop after 3 recalculations to prevent infinite loop
                    newMid = [];
                    newArr = web.arr;
                    break;
                }
                let fraction = 2;
                let recalcWeb = null;
                while (fraction <= 8) {
                    const halfLen = Math.max(Math.floor(his_arr.length / fraction), 20);
                    recalcWeb = calStair(his_arr, loga, min, 0, fee, halfLen);
                    if (recalcWeb) break;
                    fraction *= 2;
                }
                if (recalcWeb) {
                    web = recalcWeb;
                    maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                    newMid = [];
                    newArr = web.arr;
                } else {
                    newMid = [];
                    newArr = web.arr;
                    break;
                }
            } else {
                newArr = scaleWebArr(newMid, web.mid, web.arr);
            }
            suggest = stockProcess(p, newArr, web.times, priviousTrade, maxAmount, amount, count, 0, 0, Math.abs(web.arr[0]), pType, sType, fee, ttime, tinterval, now - (i * tinterval), newMid.length);
        }
        return { suggest, newArr };
    };

    const tryExecute = (suggest, i, candle) => {
        const tradeTime = now - (i * tinterval) + ttime / 6;
        const prevCount = count;
        if (newMid.length <= 0 || newMid[newMid.length - 1] <= web.mid) {
            if (suggest.buy > 0 && suggest.buy && candle.l <= suggest.buy) {
                if (suggest.bCount === 0 && suggest.buy) newPrevious('buy', suggest.buy, tradeTime);
                const r = executeBuy(suggest, amount, maxAmount, count, fee);
                if (r.didBuy) {
                    const bought = r.count - count;
                    buyLog.push({ price: suggest.buy, count: bought, idx: i });
                    newPrevious('buy', suggest.buy, tradeTime);
                }
                amount = r.amount; count = r.count; buyTrade += r.buyTrade;
            }
        } else if (suggest.buy && candle.l <= suggest.buy) {
            if (suggest.bCount === 0 && suggest.buy) newPrevious('buy', suggest.buy, tradeTime);
            const r = executeBuy({ ...suggest, type: 0 }, amount, maxAmount, count, fee);
            if (r.didBuy) {
                const bought = r.count - count;
                buyLog.push({ price: suggest.buy, count: bought, idx: i });
                newPrevious('buy', suggest.buy, tradeTime);
            }
            amount = r.amount; count = r.count; buyTrade += r.buyTrade;
        }

        if (newMid.length <= 0 || newMid[newMid.length - 1] >= web.mid) {
            if (suggest.sell > 0 && count > 0 && suggest.sell && candle.h >= suggest.sell) {
                const prevC = count;
                const r = executeSell(suggest, amount, maxAmount, count, fee);
                const sold = prevC - r.count;
                if (sold > 0) recordSell(suggest.sell, sold, i);
                amount = r.amount; count = r.count; sellTrade += r.sellTrade;
                newPrevious('sell', suggest.sell, tradeTime);
            }
        } else if (count > 0 && suggest.sell && candle.h >= suggest.sell) {
            const prevC = count;
            const r = executeSell({ ...suggest, type: 0 }, amount, maxAmount, count, fee);
            const sold = prevC - r.count;
            if (sold > 0) recordSell(suggest.sell, sold, i);
            amount = r.amount; count = r.count; sellTrade += r.sellTrade;
            newPrevious('sell', suggest.sell, tradeTime);
        }
    };

    const recordSell = (sellPrice, soldCount, idx) => {
        let remaining = soldCount;
        const netSell = sellPrice * (1 - fee);
        while (remaining > 0 && buyLog.length > 0) {
            const oldest = buyLog[0];
            const matched = Math.min(remaining, oldest.count);
            const profit = (netSell - oldest.price) * matched;
            if (profit >= 0) {
                grossProfit += profit;
                winCount++;
                totalWin += profit;
            } else {
                grossLoss += Math.abs(profit);
                lossCount++;
                totalLoss += Math.abs(profit);
            }
            sellLog.push({ price: sellPrice, count: matched, idx, profit });
            oldest.count -= matched;
            remaining -= matched;
            if (oldest.count <= 0) buyLog.shift();
        }
    };

    // ── Phase 2: Main simulation loop with OHLC two-pass ──
    const tlength = fullRun ? 1 : Math.max(startI - len + 1, 1);
    const lastNode = his_arr[tlength];
    peakEquity = maxAmount;
    let prevClose = privious.h || privious.l || 0;

    for (let i = startI; i > tlength; i--) {
        if (checkweb > resetWeb - 1) {
            checkweb = 0;
            web = calStair(his_arr, loga, min, i, fee, calStairLen);
            const newWeb = adjustWeb(web.arr, web.mid, maxAmount, true);
            web.arr = newWeb.arr;
            web.mid = newWeb.mid;
            web.times = newWeb.times;
            maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
            newMid = [];
        } else {
            checkweb++;
        }
        if (his_arr[i].h === null || his_arr[i].l === null) {
            console.log(i);
            console.log(his_arr[i]);
            return 'data miss';
        }

        // OHLC two-pass: determine which extreme to visit first
        const h = his_arr[i].h;
        const l = his_arr[i].l;
        const candle = his_arr[i - 1] || his_arr[i];
        let prices;
        if (h && l) {
            // Visit the extreme closer to prevClose first, then the other
            const distH = Math.abs(prevClose - h);
            const distL = Math.abs(prevClose - l);
            prices = (distH <= distL) ? [h, l] : [l, h];
        } else if (h) {
            prices = [h];
        } else if (l) {
            prices = [l];
        } else {
            prices = prevClose ? [prevClose] : [];
        }

        for (const p of prices) {
            price = p;
            let newArr = resolveNewMidStack(newMid, price, web.mid, web.arr, () => {
                stopLoss = stopLoss > 0 ? stopLoss - 1 : 0;
            });
            const { suggest, newArr: updatedArr } = runSignal(price, i, newArr);
            tryExecute(suggest, i, candle);
        }

        prevClose = l || h || prevClose;
        privious = his_arr[i];

        // Track equity
        const equity = amount + ((his_arr[i].l || 0) * count * (1 - fee));
        equityCurve.push(equity);
        if (equity > peakEquity) {
            peakEquity = equity;
            if (currentDrawdownStart >= 0) {
                const ddDuration = equityCurve.length - 1 - currentDrawdownStart;
                if (ddDuration > maxDrawdownDuration) maxDrawdownDuration = ddDuration;
                currentDrawdownStart = -1;
            }
        } else {
            const dd = (peakEquity - equity) / peakEquity;
            if (dd > maxDrawdown) maxDrawdown = dd;
            if (currentDrawdownStart < 0) currentDrawdownStart = equityCurve.length - 1;
        }
    }
    // Close remaining drawdown duration
    if (currentDrawdownStart >= 0) {
        const ddDuration = equityCurve.length - currentDrawdownStart;
        if (ddDuration > maxDrawdownDuration) maxDrawdownDuration = ddDuration;
    }

    // ── Phase 3: Liquidate remaining position ──
    amount += (lastNode.l * count * (1 - fee));
    // Record forced liquidation as sells for round-trip matching
    if (count > 0 && lastNode.l) {
        recordSell(lastNode.l, count, tlength);
    }
    count = 0;

    // ── Phase 4: Compute metrics ──
    const tradeDays = equityCurve.length;
    const returnPct = maxAmount > 0 ? Math.round((amount / maxAmount - 1) * 10000) / 100 : 0;
    const buyHoldPct = his_arr[startI].l ? (Math.round((lastNode.h / his_arr[startI].l - 1) * 10000) / 100) : 0;

    // Annualize (assume ~250 trading days/year)
    const years = tradeDays / 250;
    const returnAnnualPct = years > 0 ? Math.round(((amount / maxAmount) ** (1 / years) - 1) * 10000) / 100 : 0;
    const tradesPerYear = years > 0 ? Math.round(sellTrade / years * 100) / 100 : 0;

    // Daily returns for Sharpe/Sortino
    let sharpe = 0;
    let sortino = 0;
    if (equityCurve.length > 1) {
        const dailyReturns = [];
        for (let k = 1; k < equityCurve.length; k++) {
            dailyReturns.push(equityCurve[k] / equityCurve[k - 1] - 1);
        }
        const meanReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length;
        const stdDev = Math.sqrt(variance);
        const downVariance = dailyReturns.reduce((s, r) => s + (r < 0 ? r ** 2 : 0), 0) / dailyReturns.length;
        const downDev = Math.sqrt(downVariance);
        sharpe = stdDev > 0 ? Math.round(meanReturn / stdDev * Math.sqrt(250) * 100) / 100 : 0;
        sortino = downDev > 0 ? Math.round(meanReturn / downDev * Math.sqrt(250) * 100) / 100 : 0;
    }

    const maxDrawdownPct = Math.round(maxDrawdown * 10000) / 100;
    const calmar = maxDrawdown > 0 ? Math.round(returnAnnualPct / maxDrawdownPct * 100) / 100 : 0;

    const totalRoundTrips = winCount + lossCount;
    const winRate = totalRoundTrips > 0 ? Math.round(winCount / totalRoundTrips * 10000) / 100 : 0;
    const avgWin = winCount > 0 ? Math.round(totalWin / winCount * 100) / 100 : 0;
    const avgLoss = lossCount > 0 ? Math.round(totalLoss / lossCount * 100) / 100 : 0;
    const profitFactor = grossLoss > 0 ? Math.round(grossProfit / grossLoss * 100) / 100 : (grossProfit > 0 ? Infinity : 0);

    const metrics = {
        maxAmount: Math.ceil(maxAmount),
        returnPct,
        returnAnnualPct,
        buyHoldPct,
        sharpe,
        sortino,
        calmar,
        maxDrawdownPct,
        maxDrawdownDuration,
        winRate,
        avgWin,
        avgLoss,
        profitFactor,
        buyTrade,
        sellTrade,
        stopLoss,
        tradeDays,
        tradesPerYear,
    };

    return {
        start: fullRun ? 0 : (startI - len + 1),
        metrics,
    };
}

export const computeBinCount = (raw_arr, stair_start = 0, len = false) => {
    const maxlen = (len && ((stair_start + len) < raw_arr.length)) ? (stair_start + len) : raw_arr.length;
    const n = maxlen - stair_start;
    if (n < 4) return MIN_BINS;
    const closes = [];
    for (let i = stair_start; i < maxlen; i++) {
        closes.push((raw_arr[i].h + raw_arr[i].l) / 2);
    }
    closes.sort((a, b) => a - b);
    const q1 = closes[Math.floor(n * 0.25)];
    const q3 = closes[Math.floor(n * 0.75)];
    const iqr = q3 - q1;
    if (iqr <= 0) return MIN_BINS;
    const binWidth = 2 * iqr * Math.pow(n, -1 / 3);
    const range = closes[n - 1] - closes[0];
    const bins = Math.round(range / binWidth);
    return Math.max(MIN_BINS, Math.min(MAX_BINS, bins));
}

export const logArray = (max, min, pos=100) => {
    const logMax = Math.log(max);
    const logMin = Math.log(min);
    const scale = (logMax - logMin) / pos;
    const posArr = [min];
    for (let i = 1; i < pos; i++) {
        posArr.push(posArr[posArr.length - 1] * (1 + scale));
    }
    return {
        arr: posArr,
        diff: scale,
    }
}

export const calStair = (raw_arr, loga, min, stair_start = 0, fee = TRADE_FEE, len = false) => {
    const binCount = loga.arr.length;
    const single_arr = [];
    const final_arr = [];
    for (let i = 0; i < binCount; i++) {
        final_arr[i] = 0;
    }
    let volsum = 0;
    let maxlen = (len && ((stair_start + len) < raw_arr.length)) ? (stair_start + len) : raw_arr.length;
    const totalDays = maxlen - stair_start;
    for (let i = stair_start; i < maxlen; i++) {
        let s = 0;
        let e = binCount;
        for (let j = 0; j < binCount; j++) {
        if (raw_arr[i].l >= loga.arr[j]) {
                s = j;
            }
            if (raw_arr[i].h <= loga.arr[j]) {
                e = j;
                break;
            }
        }
        // §2b Volume-time decay: recent data weighted more heavily
        const dayAge = i - stair_start;
        const monthsAgo = dayAge / 21;
        const decayWeight = Math.exp(-VOLUME_DECAY_LAMBDA * monthsAgo);
        const weightedVol = raw_arr[i].v * decayWeight;
        volsum += weightedVol;
        single_arr.push((raw_arr[i].h - raw_arr[i].l) / raw_arr[i].h * 100);
        if ((e - s) === 0) {
            final_arr[s] += weightedVol;
        } else {
            const v = weightedVol / (e - s);
            for (let j = s; j < e; j++) {
                final_arr[j] += v;
            }
        }
    }
    let vol = 0;
    let j = 0;
    const nd = [];
    final_arr.forEach((v, i) => {
        vol += v;
        while (vol >= (volsum / 100 * NORMAL_DISTRIBUTION[j]) && j < NORMAL_DISTRIBUTION.length) {
            //console.log(i);
            nd.push(i);
            //nd.push(Math.pow(1 + loga.diff, i) * min);
            j++;
        }
    });
    const sort_arr = [...single_arr].sort((a,b) => a - b);
    //console.log(final_arr);
    // Extrem fallback chain (§2d): NORMAL_DISTRIBUTION[len-3] → [len-2] → [len-1] → false
    const ndLen = NORMAL_DISTRIBUTION.length;
    let extremIdx = ndLen - 3;
    const web = {
        mid: Math.pow(1 + loga.diff, nd[3]) * min,
        up: nd[4] - nd[3],
        down: nd[3] - nd[2],
        extrem: sort_arr[Math.round(sort_arr.length * NORMAL_DISTRIBUTION[extremIdx] / 100) - 1] / 100,
        single: loga.diff,
    }
    let dsCount = 0;
    while ((1 + web.extrem) < (1 + fee) * (1 + fee)) {
        extremIdx++;
        if (extremIdx >= ndLen) {
            return false;
        }
        dsCount++;
        web.extrem = sort_arr[Math.round(sort_arr.length * NORMAL_DISTRIBUTION[extremIdx] / 100) - 1] / 100;
        web.ds = dsCount;
    }
    const calWeb = () => {
        const stair = Math.ceil(Math.log(1 + web.extrem) / Math.log(1 + web.single));
        const buildSteps = (range) => {
            const arr = [];
            if (range <= 0) return arr;
            let pos = stair;
            while (pos < range) {
                arr.push(pos);
                pos += stair;
            }
            if ((pos - range) < (stair / 2)) {
                arr.push(range);
            } else if (arr.length > 0) {
                arr[arr.length - 1] = range;
            } else {
                arr.push(range);
            }
            return arr;
        };
        // use actual distribution data for each σ layer
        const upLayers = [
            buildSteps(nd[4] - nd[3]),  // mid → 1σ
            buildSteps(nd[5] - nd[4]),  // 1σ → 2σ
            buildSteps(nd[6] - nd[5]),  // 2σ → 3σ
        ];
        const downLayers = [
            buildSteps(nd[3] - nd[2]),  // mid → 1σ
            buildSteps(nd[2] - nd[1]),  // 1σ → 2σ
            buildSteps(nd[1] - nd[0]),  // 2σ → 3σ
        ];
        const result = [-web.mid];
        let temp = web.mid;
        upLayers.forEach(arr => {
            if (arr.length > 0) {
                arr.forEach(v => result.splice(0, 0, temp * Math.pow(1 + web.single, v)));
                temp = result[0];
                result[0] = -result[0];
            } else {
                result.splice(0, 0, -temp);
            }
        });
        temp = web.mid;
        downLayers.forEach(arr => {
            if (arr.length > 0) {
                arr.forEach(v => result.push(temp / Math.pow(1 + web.single, v)));
                temp = result[result.length - 1];
                result[result.length - 1] = -result[result.length - 1];
            } else {
                result.push(-temp);
            }
        });
        return result;
    }
    web.arr = calWeb();
    //console.log(web);
    return web;
}

const adjustWeb = (webArr, webMid, amount = 0, force = false) => {
    if (amount === 0) {
        return {
            arr: webArr,
            mid: webMid,
        };
    }
    const maxAmount = webMid * (webArr.length - 1) / 3 * 2;
    if (amount >= maxAmount) {
        const count = Math.floor(amount / maxAmount);
        const newWeb = {
            arr: webArr,
            mid: webMid,
        }
        if (count > 1) {
            newWeb.times = count;
        }
        return newWeb;
    }
    if (amount < (maxAmount / 2)) {
        if (force) {
            amount = maxAmount / 2 + 1;
        } else {
            return false;
        }
    }
    // Parse array into σ-boundary markers and step layers
    const boundaries = [];
    const layers = [];
    let current = [];
    for (const val of webArr) {
        if (val < 0) {
            layers.push(current);
            boundaries.push(val);
            current = [];
        } else {
            current.push(val);
        }
    }
    layers.push(current);
    if (boundaries.length === 0) {
        return { arr: webArr, mid: webMid };
    }
    // Mid boundary = 4th negative (or last if fewer than 4)
    const midIdx = Math.min(3, boundaries.length - 1);
    // Normal distribution probability per σ band
    const sigmaProbs = [34.13, 13.59, 2.15];
    // Weight each layer by σ-band probability (closer to mid = higher weight = keep more)
    const weights = layers.map((_, i) => {
        const dist = i <= midIdx ? midIdx - i : i - midIdx - 1;
        return dist < sigmaProbs.length ? sigmaProbs[dist] : 0.5;
    });
    const totalSteps = layers.reduce((sum, l) => sum + l.length, 0);
    if (totalSteps === 0) {
        return { arr: webArr, mid: webMid };
    }
    const totalWeight = weights.reduce((sum, w, i) => sum + (layers[i].length > 0 ? w : 0), 0);
    const totalToKeep = Math.max(1, Math.round(totalSteps * amount / maxAmount));
    // Allocate kept steps per layer proportionally to probability weight
    const keepCounts = layers.map((layer, i) => {
        if (layer.length === 0) return 0;
        return Math.min(layer.length, Math.max(1, Math.round(totalToKeep * weights[i] / totalWeight)));
    });
    // Evenly space kept steps within each layer
    const thinLayer = (steps, keep) => {
        if (keep >= steps.length) return steps;
        if (keep <= 0) return [];
        if (keep === 1) return [steps[Math.floor(steps.length / 2)]];
        const result = [];
        for (let j = 0; j < keep; j++) {
            result.push(steps[Math.round(j * (steps.length - 1) / (keep - 1))]);
        }
        return result;
    };
    // Reassemble: layers[0] boundary[0] layers[1] boundary[1] ... boundary[N-1] layers[N]
    const new_arr = [];
    for (let i = 0; i < layers.length; i++) {
        thinLayer(layers[i], keepCounts[i]).forEach(v => new_arr.push(v));
        if (i < boundaries.length) {
            new_arr.push(boundaries[i]);
        }
    }
    return {
        arr: new_arr,
        mid: webMid,
    };
}

const bitfinexTicker = (price, large = true) => {
    if (price < 100) {
        if (large) {
            return Math.ceil(price * 10000) / 10000;
        } else {
            return Math.floor(price * 10000) / 10000;
        }
    } else if (price < 1000) {
        if (large) {
            return Math.ceil(price * 100) / 100;
        } else {
            return Math.floor(price * 100) / 100;
        }
    } else {
        if (large) {
            return Math.ceil(price);
        } else {
            return Math.floor(price);
        }
    }
}

const usseTicker = (price, large = true) => {
    if (price < 1) {
        if (large) {
            return Math.ceil(price * 10000) / 10000;
        } else {
            return Math.floor(price * 10000) / 10000;
        }
    } else {
        if (large) {
            return Math.ceil(price * 100) / 100;
        } else {
            return Math.floor(price * 100) / 100;
        }
    }
}

const twseTicker = (price, large = true) => {
    if (price < 10) {
        if (large) {
            return Math.ceil(price * 100) / 100;
        } else {
            return Math.floor(price * 100) / 100;
        }
    } else if (price < 50) {
        if (large) {
            return Math.ceil(price * 20) / 20;
        } else {
            return Math.floor(price * 20) / 20;
        }
    } else if (price < 100) {
        if (large) {
            return Math.ceil(price * 10) / 10;
        } else {
            return Math.floor(price * 10) / 10;
        }
    } else if (price < 500) {
        if (large) {
            return Math.ceil(price * 2) / 2;
        } else {
            return Math.floor(price * 2) / 2;
        }
    } else if (price < 1000) {
        if (large) {
            return Math.ceil(price);
        } else {
            return Math.floor(price);
        }
    } else {
        if (large) {
            return Math.ceil(price / 5) * 5;
        } else {
            return Math.floor(price / 5) * 5;
        }
    }
}

export const parseMacrotrendsMarketCap = raw_data => {
    let cap = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main_content_container')[0], 'div', 'sub_main_content_container')[0], 'div', 'main_content')[0], 'div')[1], 'span')[0];
    let m;
    if (findTag(cap, 'p')[0]) {
        m = findTag(findTag(findTag(cap, 'p')[0], 'strong')[0])[0].match(/^\$([\d\,]+\.?\d*)([a-zA-Z])?$/);
    } else {
        m = findTag(findTag(cap, 'strong')[0])[0].match(/^\$([\d\,]+\.?\d*)([a-zA-Z])?$/);
    }
    if (!m) {
        return 0;
    }
    const base = Number(m[1].replace(/,/g, ''));
    const suffix = m[2] ? m[2].toLowerCase() : '';
    switch (suffix) {
        case 'k': return base * 1000;
        case 'm': return base * 1000000;
        case 'b': return base * 1000000000;
        case 't': return base * 1000000000000;
        default: return base;
    }
};

export const parseMacrotrendsRatio = raw_data => {
    let r = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main_content_container')[0], 'div', 'sub_main_content_container')[0], 'div', 'main_content')[0], 'div')[1], 'span')[0];
    let m;
    if (findTag(r, 'p')[0]) {
        m = findTag(findTag(findTag(r, 'p')[0], 'strong')[0])[0].match(/\d+\.?\d*/);
    } else {
        m = findTag(findTag(r, 'strong')[0])[0].match(/\d+\.?\d*/);
    }
    return m ? Number(m[0]) : 9999;
};

export const getUsStock = (index, stat = ['price'], single = false) => {
    const ret = {};
    let count = 0;
    //Market Cap (intraday) Trailing P/E Price/Book (mrq)
    const fetchPer = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/pe-ratio`).then(raw => { ret['per'] = parseMacrotrendsRatio(raw); });
    const fetchPbr = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/price-book`).then(raw => { ret['pbr'] = parseMacrotrendsRatio(raw); });
    const fetchEquity = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/net-worth`).then(raw => {
        const marketCap = parseMacrotrendsMarketCap(raw);
        ret['equity'] = (marketCap && ret['price']) ? marketCap / ret['price'] : 0;
    });
    const real = () => yahooFinance.quote(index).then(result => {
        if (!result) {
            console.log(`getUsStock result ${index} empty`);
            return Promise.resolve(ret);
        }
        if (stat.indexOf('price') !== -1) {
            ret['price'] = result['regularMarketPrice'];
            ret['previous'] = result['regularMarketPreviousClose'];
        }
        if (stat.indexOf('per') !== -1 || stat.indexOf('pbr') !== -1 || stat.indexOf('pdr') !== -1 || stat.indexOf('equity') !== -1) {
            if (stat.indexOf('pdr') !== -1) {
                ret['pdr'] = 9999;
            }
            const marketCap = result['marketCap'];
            if (!marketCap) {
                const wantEquity = stat.indexOf('equity') !== -1;
                const wantPer = stat.indexOf('per') !== -1;
                const wantPbr = stat.indexOf('pbr') !== -1;
                if (!wantEquity && !wantPer && !wantPbr) {
                    return handleError(new HoError(`usa stock parse NA ${index}`));
                }
                const idx = (index === 'BRK-B') ? 'BRK.B' : index;
                let chain = Promise.resolve();
                if (wantEquity) {
                    chain = chain.then(() => fetchEquity(idx));
                }
                if (wantPer) {
                    chain = chain.then(() => fetchPer(idx));
                }
                if (wantPbr) {
                    chain = chain.then(() => fetchPbr(idx));
                }
                return chain.then(() => ret);
            }
            if (stat.indexOf('equity') !== -1) {
                ret['equity'] = ret['price'] ? marketCap / ret['price'] : 0;
            }
            if (stat.indexOf('per') !== -1) {
                ret['per'] = result['trailingPE'] ? (Math.round(result['trailingPE'] * 100) / 100) : 9999;
                ret['per'] = (ret['per'] > 0) ? ret['per'] : 9999;
            }
            if (stat.indexOf('pbr') !== -1) {
                ret['pbr'] = result['priceToBook'] ? (Math.round(result['priceToBook'] * 100) / 100) : 9999;
                ret['pbr'] = (ret['pbr'] > 0) ? ret['pbr'] : 9999;
            }
        }
        return Promise.resolve(ret);
    }).catch(err => {
        console.log(`${index} ${count}`);
        return (single || (++count > _maxRetry)) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), _retryDelay));
    });
    return real();
}

export const getSuggestionData = (type = 'twse') => suggestionData[type];

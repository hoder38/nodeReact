import { ENV_TYPE } from '../../../ver.js'
import { CHECK_STOCK, USSE_TICKER, TWSE_TICKER } from '../config.js'
import { STOCKDB, CACHE_EXPIRE, STOCK_FILTER_LIMIT, STOCK_FILTER, MAX_RETRY, TOTALDB, STOCK_INDEX, NORMAL_DISTRIBUTION, TRADE_FEE, TRADE_INTERVAL, RANGE_INTERVAL, TRADE_TIME, USSE_FEE, USERDB, TWSE_NUM, USSE_NUM, MAX_NEWMID_STACK, EMERGENCY_STOP_THRESHOLD, MIN_BINS, MAX_BINS, VOLUME_DECAY_LAMBDA } from '../constants.js'
import Htmlparser from 'htmlparser2'
import * as cheerio from 'cheerio/slim'
import yahooFinance from 'yahoo-finance2'
import Mkdirp from 'mkdirp'
import Redis from '../models/redis-tool.js'
import Mongo from '../models/mongo-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import Api from './api-tool.js'
import { getUssePosition, getUsseOrder } from '../models/tdameritrade-tool.js'
import { getTwsePosition, getTwseOrder } from '../models/shioaji-tool.js'
import { handleError, HoError, completeZero, addPre, isValidString, toValidName, convertTimestampToDate, fsExists } from '../util/utility.js'
import { getExtname } from '../util/mime.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js'

const log = createLogger('stock')
const StockTagTool = TagTool(STOCKDB);

let stockFiltering = false;
let stockIntervaling = false;
let stockPredicting = false;
const suggestionData = {
    twse: {},
    usse: {},
}
let stringSent = 0;

// Fetches the latest stock price; type/index identify the symbol, and previous returns [currentPrice, previousClose].
export const getStockPrice = (type='twse', index, previous = false) => {
    switch(type) {
        case 'twse':
        let count = 0;
        const real = () => Api('url', `https://tw.stock.yahoo.com/quote/${index}`).then(raw_data => {
            // Yahoo Taiwan sometimes serves the legacy center/table markup and sometimes the newer app layout.
            const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
            const $div = $('div[id="main-0-QuoteHeader-Proxy"]')
                        .children('div').first()
                        .children('div').eq(1)
                        .children('div').first()
                        .children('div').first();
            let price = $div.children('span').first().text().trim();
            price = price === '-' ? 0 : Number(price.replace(/,/g, ''));
            if (previous) {
                let previousPrice = 0;
                // The overview widget can move when Yahoo injects an extra lightbox wrapper.
                const $lis = $('div[id="main-2-QuoteOverview-Proxy"]')
                        .children('div').first()
                        .children('section').first()
                        .children('div').eq(1)
                        .children('div').eq(1)
                        .children('div').first()
                        .children('ul').first()
                        .children('li');
                $lis.each((_, l) => {
                    if ($(l).children('span').first().text().trim() === '昨收') {
                        const raw = $(l).children('span').eq(1).text().trim();
                        previousPrice = raw === '-' ? 0 : Number(raw.replace(/,/g, ''));
                    }
                });
                log.debug({ price, previousPrice }, 'getStockPrice result');
                return [price, previousPrice];
            } else {
                log.debug({ price }, 'getStockPrice single');
                return price;
            }
        }).catch(err => {
            log.debug({ count }, 'retry count');
            return (++count > _maxRetry) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), count * 1000));
        });
        return real();
        case 'usse':
        return getUsStock(index).then(ret => {
            if (!ret.price) {
                if (previous) {
                    return [0, 0];
                } else {
                    return 0;
                }
            }
            if (previous) {
                log.debug({ price: ret.price, previous: ret.previous }, 'yahoo price result');
                return [ret.price, ret.previous];
            } else {
                log.debug({ price: ret.price }, 'yahoo price fallback');
                return ret.price;
            }
        });
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

// Fetches basic stock metadata for the given market/code and returns the fields used by search, tags, and filters.
export const getBasicStockData = (type, index) => {
    let count = 0;
    switch(type) {
        case 'twse':
        const real = () => Api('url', `https://mopsov.twse.com.tw/mops/web/ajax_quickpgm?encodeURIComponent=1&step=4&firstin=1&off=1&keyword4=${index}&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&co_id=${index}`).then(raw_data => {
            let result = {stock_location: ['tw', '台灣', '臺灣']};
            const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
            const $form = $('body').children('form').first();
            let $table = $form.children('table[id="zoom"]').first();
            if ($table.length === 0) $table = $form.children('table').first().children('table[id="zoom"]').first();
            // MOPS uses a fixed column order here, so each populated anchor cell maps by position.
            $table.children('tr').eq(1).children('td').each((i, d) => {
                const $as = $(d).children('a');
                if ($as.length > 0) {
                    let texts = [];
                    $as.each((_, a) => {
                        const text = $(a).text().trim();
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
                        // F-share naming needs extra China-related location tags for downstream search.
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
                        // TWSE lists the year in the ROC calendar, so convert it to Gregorian.
                        result.stock_time = (Number(texts[0].match(/\d+$/)[0]) + 1911).toString();
                        break;
                    }
                }
            });
            return result;
        }).catch(err => {
            log.debug({ count }, 'basic data retry');
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
            log.debug({ index, count }, 'basic data attempt');
            return (++count > _maxRetry) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real1()), _retryDelay));
        });
        return real1();
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

// Builds normalized stock tags from market/code metadata and precomputed indexTag entries, returning [primaryStockName, validTags].
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
        // Re-validate and normalize every candidate tag before it is stored or compared.
        const valid_name = isValidString(i, 'name');
        if (valid_name) {
            valid_tags.push(valid_name.replace('&amp;', '&'));
        }
    });
    return [basic.stock_name[0], valid_tags];
});

// Extracts signed numeric values from the row named by type/text in raw data, returning an array or false.
export const getParameterV2 = (data, type, text = null) => {
    const matchProfit = data.match(new RegExp('\\>' + type + '\\<\\/td\\>([\\s\\S]+?)\\<\\/tr\\>'));
    if (!matchProfit) {
        return false;
    }
    if (text && !matchProfit[1].match(new RegExp(text))) {
        return false;
    }
    return matchProfit[1].match(/[^\>\<]*(\>[\d,]+\<)/g).map(v => {
        // The source marks negative values with sign="-", so preserve the sign after stripping markup.
        const ret = Number(v.match(/\>[\d,]+\</)[0].replace(/[\>\<,]/g, ''))
        return v.match(/sign\=\"\-\"/) ? -ret : ret;
    });
}

// Test hooks for overriding retry and timing knobs in unit tests.
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

// Returns the first parsed value that matches any fallback code/label pair in raw_data.
export const findFirstParameter = (raw_data, codes, label) => {
    for (const code of codes) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result[0];
    }
    return null;
};

// Returns the first full parsed row across fallback row codes.
// TWSE filings often pack cumulative and prior-period values into the same row,
// so callers sometimes need the untouched array instead of just the first value.
export const findFirstParameterArray = (raw_data, codes, label) => {
    for (const code of codes) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result;
    }
    return null;
};

// Tries explicit [code, label] combinations for statement layouts that changed both
// the numeric item code and the visible Chinese label between report templates.
export const findFirstParameterPairs = (raw_data, pairs) => {
    for (const [code, label] of pairs) {
        const result = getParameterV2(raw_data, code, label);
        if (result) return result[0];
    }
    return null;
};

// Fallback row identifiers seen across TWSE/MOPS statement variants.
// The filter walks these lists in order until it finds a compatible filing layout.
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

// Position-control thresholds keyed by suggestion type.
// Each tuple is [trigger cash ratio, target cash ratio] relative to maxAmount.
export const BUY_THRESHOLDS = { 7: [7/8, 3/4], 3: [5/8, 1/2], 6: [3/8, 1/4] };
export const SELL_THRESHOLDS = { 9: [1/8, 1/4], 5: [3/8, 1/2], 8: [5/8, 3/4] };

// Applies the suggested buy count, then keeps buying until idle cash falls back inside
// the configured reserve band for the current strategy type.
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
        // Pull excess cash down toward the strategy's target reserve level.
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

// Applies the suggested sell count, then forces extra sells if cash would otherwise stay
// below the configured reserve band after fees.
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
        // Raise cash back toward the target reserve after applying sell fees.
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
    // Test helper: clears module-level flags and cached suggestion results.
    _resetFlags: function() {
        stockFiltering = false;
        stockIntervaling = false;
        stockPredicting = false;
        stringSent = 0;
        suggestionData.twse = {};
        suggestionData.usse = {};
    },
    // Test helper: exposes module-level flags for assertions.
    _getFlags: function() {
        return { stockFiltering, stockIntervaling, stockPredicting, stringSent };
    },
    // Refreshes one stock's fundamentals and tags.
    // TWSE data is reconstructed from MOPS filings, while USSE data comes from getUsStock.
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
                        // Keep manually managed tags and track only the defaults derived during
                        // this refresh, so future runs can merge without duplicating user tags.
                        for (let t of tags) {
                            const normal = normalize(t);
                            if (!isDefaultTag(normal)) {
                                if (normal_tags.indexOf(normal) === -1) {
                                    normal_tags.push(normal);
                                    stock_default.push(normal);
                                }
                            }
                        }
                        // profit / dividends / netValue are stored as per-share values, so the
                        // existing pipeline scales them by equity before turning them into ratios.
                        const per = (profit <= 0) ? 9999 : Math.round(price / profit * equity * 10) / 100;
                        const pdr = (dividends <= 0) ? 9999 : Math.round(price / dividends * equity * 10) / 100;
                        const pbr = (netValue <= 0) ? 9999 : Math.round(price / netValue * equity * 10) / 100;
                        log.debug({ per, pdr, pbr }, 'valuation ratios');
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
                // Walk backward through MOPS filings until we can reconstruct the latest
                // trailing fundamentals. Missing reports first try the alternate report type.
                const recur_getTwseProfit = () => {
                    log.debug({ year, quarter }, 'financial quarter');
                    return Api('url', `https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=${index}&SYEAR=${year}&SSEASON=${quarter}&REPORT_ID=${reportType}`, {big5: true}).then(raw_data => {
                        if (cheerio.load(Htmlparser.parseDOM(raw_data))('h4').length > 0) {
                            if (latestQuarter) {
                                return handleError(new HoError('too short stock data'));
                            } else {
                                not++;
                                if (not > 8) {
                                    return handleError(new HoError('cannot find stock data'));
                                } else {
                                    // MOPS may expose the same quarter under C or A reports.
                                    // Only step back a quarter after both layouts fail.
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
                                // Overrun is the TWSE throttle page; wait and retry the same request.
                                wait_count++;
                                log.debug({ wait_count }, 'waiting for TWSE throttle');
                                return new Promise((resolve, reject) => setTimeout(() => resolve(recur_getTwseProfit()), _overrunDelay));
                            }
                        } else {
                            wait_count = 0;
                            // Statement row identifiers drift between filing templates, so each
                            // lookup uses the fallback code lists declared above.
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
                            // Quarterly statements are cumulative. Convert them back into
                            // single-quarter contributions before summing a trailing-year profit.
                            switch (quarter) {
                                case 4:
                                profit += profitArr[0];
                                log.debug({ profit, equity, netValue, dividends }, 'financial data');
                                if (!latestQuarter) {
                                    latestQuarter = quarter;
                                    latestYear = year;
                                }
                                // Some annual filings lag on dividends, so fall back to Q3 only
                                // to collect the latest dividend row before finishing.
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
                                    log.debug({ profit, equity, netValue, dividends }, 'financial data retry');
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
                            // After the first matched quarter, continue from the previous Q4 so
                            // the remaining walk stays aligned to full-year cumulative filings.
                            quarter = 4;
                            year--;
                            return recur_getTwseProfit();
                        }
                    });
                }
                return Mongo('find', STOCKDB, {type, index}, {limit: 1}).then(items => {
                    if (items.length > 0) {
                        id_db = items[0]._id;
                        // Preserve previously saved non-default tags before refreshing derived ones.
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
                        // Preserve previously saved non-default tags before refreshing derived ones.
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
                        log.debug({ ret }, 'filter v4 step result');
                        let stock_default = [];
                        // US stocks follow the same tag merge rule as TWSE: keep manual tags and
                        // record only newly derived defaults in stock_default.
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
    // Recomputes PER/PDR/PBR with the latest live price while keeping the stored
    // statement period so callers know which quarter the ratios were based on.
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
    // Validates cached interval payloads and clears Redis entries that contain
    // incomplete OHLC points, forcing a rebuild on the next interval request.
    testData: function() {
        return Mongo('find', STOCKDB, {}).then(items => {
            const recur_test = index => (index >= items.length) ? Promise.resolve() : Redis('hgetall', `interval: ${items[index].type}${items[index].index}`).then(item => {
                const getInit = () => item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                return getInit();
            }).then(([raw_list, ret_obj, etime]) => {
                log.debug({ stock: items[index].index + items[index].name }, 'processing stock');
                if (!raw_list) {
                    log.warn({ type: items[index].type, index: items[index].index }, 'data empty');
                } else {
                    let isnull = false;
                    for (let i in raw_list) {
                        log.debug({ i }, 'interval year');
                        for (let j in raw_list[i]) {
                            for (let k = 0; k < raw_list[i][j].raw.length; k++) {
                                if (!raw_list[i][j].raw[k].h || !raw_list[i][j].raw[k].l) {
                                    log.warn({ type: items[index].type, index: items[index].index, i: j, k, raw: raw_list[i][j].raw[k] }, 'interval data missing');
                                    Redis('hmset', `interval: ${items[index].type}${items[index].index}`, {
                                            raw_list: false,
                                            ret_obj: 0,
                                            etime: -1,
                                            adjustments: [],
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
    // Removes stocks that were not refreshed in the latest screening cycle unless they
    // still exist in TOTALDB. dryRun only prints the candidates.
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
        // The quarterly tag is appended during filtering; missing it means this stock was not
        // touched in the latest run and is a cleanup candidate.
        const latestQuarter = `${updateyear}q${updatequarter}`;
        const keepList = [];
        log.info({ latestQuarter }, 'keep tag');
        return Mongo('find', STOCKDB, {tags:{$nin:[latestQuarter]}}).then(items => {
            const recur_remove = index => (index >= items.length) ? Promise.resolve() : Mongo('find', TOTALDB, {index: items[index].index, setype: items[index].type}, {limit: 1}).then(stock => {
                if (stock.length < 1) {
                    if (dryRun) {
                        log.info({ type: items[index].type, index: items[index].index, name: items[index].name }, 'dry run skip');
                        return recur_remove(index + 1);
                    } else {
                        log.info({ type: items[index].type, index: items[index].index, name: items[index].name }, 'removing stock');
                        return Mongo('deleteMany', STOCKDB, {_id: items[index]._id}).then(() => recur_remove(index + 1));
                    }
                } else {
                    keepList.push(`${items[index].type} ${items[index].index} ${items[index].name}`);
                    return recur_remove(index + 1);
                }
            });
            return recur_remove(0).then(() => {
                if (keepList.length > 0) {
                    log.info({ keepList }, 'stocks in total but out of filter list');
                }
            });
        });
    },
    // Builds interval data, applies corporate-action adjustments, and prepares the
    // derived stair-step web used by the backtest and suggestion pipeline.
    getIntervalV2: function(id, session) {
        const date = _dateFactory();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let month_str = completeZero(month.toString(), 2);
        let vol_year = year;
        let vol_month = month;
        let vol_month_str = month_str;
        log.debug({ year, month_str }, 'interval data period');
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
                        log.debug({ year, month_str }, 'recur interval period');
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
                        log.debug({ max, min }, 'price range');
                        // Track the recent liquidity floor for the debug output below.
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year] && interval_data[vol_year][vol_month_str]; i--) {
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
                        log.debug({ min_vol }, 'min volume');
                        const bins = computeBinCount(raw_arr);
                        const loga = logArray(max, min, bins);
                        const web = calStair(raw_arr, loga, min);
                        log.debug({ web }, 'computed web');
                        return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(_n => {
                            log.debug({ n: _n }, 'web update result');
                            if (!web) {
                                return [interval_data, 'no profit'];
                            }
                            // Re-run the segmented backtest so STOCKDB and TOTALDB stay aligned on the
                            // ladder type and metrics persisted for this symbol.
                            const restTest = () => getStockPrice(items[0].type, items[0].index).then(price => {
                                const results = [];
                                let lastest_type = 0;
                                let lastest_rate = 0;
                                // pricePct = live distance to mid (field 1); not aggregated over groups.
                                const pricePct = Math.round((+price - web.mid) / web.mid * 10000) / 100;
                                // One segmented backtest per pType. lastest_type is chosen from the same result
                                // (G10 returnPct); a second pass is no longer needed since start/reverse/len
                                // are superseded and both calls would return identical results.
                                const resultShow = type => {
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type)).then(temp => {
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
                                    results.forEach(r => log.debug({ str: r.str }, 'backtest result'));
                                    log.debug({ lastest_type }, 'backtest done');
                                    // Use the middle profitable result for display so one extreme backtest
                                    // does not dominate the label shown in the UI.
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
                                            newMid: [],
                                        }}).then(() => recur_web(index + 1));
                                    }
                                }
                                return restTest().then(([result, index, type, metrics]) => {
                                    web.type = type;
                                    if (metrics) web.metrics = metrics;
                                    return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(() => recur_web(0, type).then(() => [result, index]));
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
                    let start_get = new Date(year, month - 1, day, 12).getTime() / 1000;
                    let end_get = new Date(year - 5, month - 1, day, 12).getTime() / 1000;
                    const originalEndGet = end_get;
                    let start_month = `${year}${month_str}`;
                    let max = 0;
                    let min = 0;
                    let raw_arr = [];
                    let min_vol = 0;
                    let latestAdjustments = cached_adjustments;
                    // Drift detection state: saved when first cached month is loaded in get_mi.
                    let overlapY = null;
                    let overlapM = null;
                    let overlapH = 0;
                    let fullRefetchDone = false;
                    const rest_interval = () => {
                        log.debug({ max, min }, 'price range');
                        // Track the recent liquidity floor for the debug output below.
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year] && interval_data[vol_year][vol_month_str]; i--) {
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
                        log.debug({ min_vol }, 'min volume');
                        const bins = computeBinCount(raw_arr);
                        const loga = logArray(max, min, bins);
                        const web = calStair(raw_arr, loga, min, 0, USSE_FEE);
                        log.debug({ web }, 'computed web');
                        return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(_n => {
                            log.debug({ n: _n }, 'web update result');
                            if (!web) {
                                return [interval_data, 'no profit'];
                            }
                            // Re-run the segmented backtest so STOCKDB and TOTALDB stay aligned on the
                            // ladder type and metrics persisted for this symbol.
                            const restTest = () => getStockPrice(items[0].type, items[0].index).then(price => {
                                const results = [];
                                let lastest_type = 0;
                                let lastest_rate = 0;
                                // pricePct = live distance to mid (field 1); not aggregated over groups.
                                const pricePct = Math.round((+price - web.mid) / web.mid * 10000) / 100;
                                // One segmented backtest per pType. lastest_type is chosen from the same result
                                // (G10 returnPct); a second pass is no longer needed since start/reverse/len
                                // are superseded and both calls would return identical results.
                                const resultShow = type => {
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => stockTest(raw_arr, loga, min, type, RANGE_INTERVAL, USSE_FEE)).then(temp => {
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
                                    results.forEach(r => log.debug({ str: r.str }, 'backtest result'));
                                    log.debug({ lastest_type }, 'backtest done');
                                    // Use the middle profitable result for display so one extreme backtest
                                    // does not dominate the label shown in the UI.
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
                                           newMid: [],
                                       }}).then(() => recur_web(index + 1));
                                    }
                                }
                                return restTest().then(([result, index, type, metrics]) => {
                                    web.type = type;
                                    if (metrics) web.metrics = metrics;
                                    return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(() => recur_web(0, type).then(() => [result, index]));
                                });
                            });
                        })
                    }
                    const get_mi = index => {
                        if (raw_list) {
                            // Reuse cached monthly buckets first so Yahoo only fills the missing older window.
                            let isEnd = false;
                            for (let i = 0; i < 60; i++) {
                                if (raw_list[year] && raw_list[year][month_str]) {
                                    if (!isEnd) {
                                        isEnd = true;
                                        end_get = new Date(year, month - 1, 1, 12).getTime() / 1000;
                                        // Save this month as the overlap boundary for drift detection.
                                        overlapY = String(year);
                                        overlapM = month_str;
                                        overlapH = raw_list[year][month_str]?.raw?.[0]?.h || 0;
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
                            const quotes = stockData.indicators?.quote?.[0];
                            if (!timestamps || !timestamps.length || !quotes) {
                                throw new HoError('Yahoo Finance returned no chart data');
                            }

                            // Use Yahoo's pre-computed adjClose to build per-candle adjustment
                            // ratios (adjClose / rawClose). Applying these to H and L gives
                            // fully split- and dividend-adjusted prices without manual event parsing.
                            const adjcloseArr = stockData.indicators?.adjclose?.[0]?.adjclose;
                            latestAdjustments = []; // adjustments are baked in; no post-processing needed

                            // Store adjClose-adjusted data with day field
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
                                const rawClose = (quotes.close && quotes.close[i] != null) ? Number(quotes.close[i]) : 0;
                                const adjClose = adjcloseArr ? Number(adjcloseArr[i]) : 0;
                                const ratio = (adjClose && rawClose) ? adjClose / rawClose : 1;
                                const adjH = Number(quotes.high[i]) * ratio;
                                const adjL = Number(quotes.low[i]) * ratio;
                                tmp_interval.push({
                                    h: adjH,
                                    l: adjL,
                                    v: Number(quotes.volume[i]),
                                    d: Number(sDate.day),
                                });
                                if (adjH > tmp_max) {
                                    tmp_max = adjH;
                                }
                                if (!tmp_min || adjL < tmp_min) {
                                    tmp_min = adjL;
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

                            // Drift check: if Yahoo's fresh adjClose ratio for the overlap month
                            // differs from the cached price by >0.5%, a split/dividend since the
                            // last full fetch has back-adjusted all historical ratios.  Discard the
                            // stale cached months and re-fetch the full 5-year window once.
                            if (!fullRefetchDone && overlapY && overlapH) {
                                const newH = interval_data?.[overlapY]?.[overlapM]?.raw?.[0]?.h || 0;
                                if (newH && Math.abs(newH - overlapH) / overlapH > 0.005) {
                                    fullRefetchDone = true;
                                    interval_data = null;
                                    end_get = originalEndGet;
                                    return getFinance();
                                }
                            }

                            // Flatten interval_data → raw_arr (latestAdjustments is [] so no price changes)
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
    // Serialize interval recalculation so each stock's ladder snapshot is refreshed atomically.
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
    // Rebuild the quarterly trade list, then sync each admin portfolio with the new candidates.
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
        log.info({ year: updateyear, quarter: updatequarter }, 'filter update');
        let last = false;
        let queried = 0;
        let filterList = [];
        const etfList = [];
        const marketcapList = [];
        // Remove the previous filter tag set first; this job always rebuilds it from scratch.
        const clearName = () => StockTagTool.tagQuery(queried, option.name, true, 0, option.sortName, option.sortType, user, {}, STOCK_FILTER_LIMIT).then(result => {
            log.debug({ count: result.items.length }, 'MOPS query result count');
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
        // Pull the quarter tag page by page and annotate each candidate with ETF priority and market cap.
        const recur_query = () => StockTagTool.tagQuery(queried, `${updateyear}q${updatequarter}`, true, 0, option.sortName, option.sortType, user, session, STOCK_FILTER_LIMIT).then(result => {
            log.debug({ queried }, 'queried stock count');
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
                    log.debug({ type: i.type, index: i.index }, 'filter candidate');
                    return getStockPrice(i.type, i.index).then(price => {
                        etfList.push(i.type + ' ' + i.index);
                        i.mcap = (i.equity && price) ? i.equity * price : 0;
                        log.debug({ mcap: i.mcap }, 'market cap');
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
                        log.debug({ etf: i.etf }, 'ETF flag');
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
            // Apply the per-index ETF quotas before recalculating each survivor's interval label.
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
                    log.debug({ index: filterList[iIndex].index, etf: filterList[iIndex].etf, mcap: filterList[iIndex].mcap }, 'filter candidate');
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
                        log.debug({ name: filterList[iIndex].name, result }, 'filter upsert result');
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
            log.info('filter stage three');
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
            // 比對管理者目前 total 持股與最新篩選名單，產出進出清單並重算部位倍率。
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
                // Give the top ~20% market-cap names a larger base multiplier before §9b adds
                // the volatility floor.
                if (totalTwseMarketcapList.length > 2) {
                    const mcMiddle = Math.round(totalTwseMarketcapList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        const mul = totalTwseMarketcapList[i].mc / totalTwseMarketcapList[mcMiddle].mc;
                        totalTwseMarketcapList[i].mul = (mul > 5) ? 5 : mul;
                    }
                }
                totalTwseMarketcapList.sort((a, b) => {
                    if (a.extrem > b.extrem) {
                        return 1;
                    } else if (a.extrem < b.extrem) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                if (totalTwseMarketcapList.length > 2) {
                    const mcMiddle = Math.round(totalTwseMarketcapList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        if (!totalTwseMarketcapList[i].mc || totalTwseMarketcapList[i].mc < 2) {
                            totalTwseMarketcapList[i].mc = 2;
                        }
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
                totalUsseMarketcapList.sort((a, b) => {
                    if (a.extrem > b.extrem) {
                        return 1;
                    } else if (a.extrem < b.extrem) {
                        return -1;
                    } else {
                        return 0;
                    }
                });
                if (totalUsseMarketcapList.length > 2) {
                    const mcMiddle = Math.round(totalUsseMarketcapList.length / 5);
                    for (let i = 0; i < mcMiddle; i++) {
                        if (!totalUsseMarketcapList[i].mc || totalUsseMarketcapList[i].mc < 2) {
                            totalUsseMarketcapList[i].mc = 2;
                        }
                    }
                }
                log.debug({ twseList: totalTwseMarketcapList, usseList: totalUsseMarketcapList }, 'marketcap lists');
                const updmulTwse = mIndex => (mIndex < totalTwseMarketcapList.length) ? Mongo('update', TOTALDB, {_id: totalTwseMarketcapList[mIndex]._id}, {$set: {mul: totalTwseMarketcapList[mIndex].mul}}).then(mitems => {
                    log.debug({ mitems }, 'twse mul update');
                    return updmulTwse(mIndex + 1);
                }) : Promise.resolve();
                const updmulUsse = mIndex => (mIndex < totalUsseMarketcapList.length) ? Mongo('update', TOTALDB, {_id: totalUsseMarketcapList[mIndex]._id}, {$set: {mul: totalUsseMarketcapList[mIndex].mul}}).then(mitems => {
                    log.debug({ mitems }, 'usse mul update');
                    return updmulUsse(mIndex + 1);
                }) : Promise.resolve();
                return updmulTwse(0).then(() => updmulUsse(0).then(() => compare_list(cIndex + 1)));
            }) : Promise.resolve({filter: filterList, in: inList, out: outList});
            return compare_list(0);
        }));
    },
    // Prevent overlapping filter jobs and broadcast the rebuilt trade list when it finishes.
    stockFilterWarp: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        if (stockFiltering) {
            return handleError(new HoError('there is another filter running'));
        }
        stockFiltering = true;
        return this.stockFilterV4(option, user, session).then(obj => {
            stockFiltering = false;
            const number = obj.filter.length;
            log.info({ number }, 'filter complete');
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
    // Aggregate a user's total rows and create the two exchange buckets on first access.
    getStockTotal: function(user) {
        return Mongo('find', TOTALDB, {owner: user._id, sType: {$exists: false}}).then(items => {
            // Build the portfolio summary from TOTALDB rows and ensure each exchange
            // has a top-level cash bucket before formatting the response.
            if (items.length < 1) {
                // First-time users start with empty TWSE/USSE summary rows so the
                // portfolio response always contains both exchange sections.
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
            // twse accumulators
            let remain = 0;
            let totalName = '';
            let totalType = '';
            let profit = 0;
            let totalPrice = 0;
            // usse accumulators
            let remain1 = 0;
            let totalName1 = '';
            let totalType1 = '';
            let profit1 = 0;
            let totalPrice1 = 0;
            // Count stocks with non-empty newMid per exchange for "X of stock out of range" display
            let newMidCountTwse = 0;
            let newMidCountUsse = 0;
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
                    // Track stocks whose price has broken out of their web range (non-empty newMid stack)
                    if (v.newMid && v.newMid.length > 0) {
                        if (v.setype === 'usse') {
                            newMidCountUsse++;
                        } else {
                            newMidCountTwse++;
                        }
                    }
                    let current = v.price * v.count;
                    // Cleared positions may stash realized profit separately; normalize the
                    // remaining cash basis before calculating the open-position summary.
                    //v.amount = v.profit ? (v.amount - v.profit) : v.amount;
                    v.amount = (v.mul ? v.orig * v.mul : v.orig) + (v.profit ? v.profit : 0);
                    // p: lifetime P/L versus original allocation, y: day-over-day change.
                    //let p = current + v.amount - (v.mul ? v.orig * v.mul : v.orig);
                    let p = (v.profit ? v.profit : 0) + current;
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
                    if (v.clear) {
                        v.str = v.str ? `Clearing ${v.str}` : 'Clearing';
                    }
                    if (v.ing === 2) {
                        v.str = v.str ? `Deleting ${v.str}` : 'Deleting';
                    }
                    stock.push({
                        name: v.name,
                        type: v.type,
                        price: v.price,
                        mid: v.mid,
                        mul: Math.round(v.mul * 100) / 100,
                        count: (v.setype === 'usse') ? v.count : v.count / 100,
                        remain: Math.round(v.amount * 100) / 100,
                        profit: p,
                        current,
                        str: v.str ? v.str : '',
                        se,
                        order: v.order,
                    });
                    return Promise.resolve();
                }
            }
            const recurGet = index => {
                if (index >= items.length) {
                    // Prepend usse total summary row
                    if (totalName1) {
                        stock.unshift({
                            name: totalName1,
                            type: totalType1,
                            profit: profit1,
                            price: Math.round(totalPrice1 * 100) / 100,
                            mid: 1,
                            remain: `${(totalPrice1 + remain1 > 0) ? Math.round(profit1 / (totalPrice1 + remain1) * 10000) / 100 : 0}%`,
                            count: 1,
                            current: totalPrice1,
                            str: newMidCountUsse > 0 ? `${newMidCountUsse} of stock out of range` : '',
                            se: 1,
                        })
                    }
                    // Prepend twse total summary row (inserted after usse so it appears first)
                    if (totalName) {
                        stock.unshift({
                            name: totalName,
                            type: totalType,
                            profit,
                            price: Math.round(totalPrice * 100) / 100,
                            mid: 1,
                            remain: `${(totalPrice + remain > 0) ? Math.round(profit / (totalPrice + remain) * 10000) / 100 : 0}%`,
                            count: 1,
                            current: totalPrice,
                            str: newMidCountTwse > 0 ? `${newMidCountTwse} of stock out of range` : '',
                            se: 0,
                        })
                    }
                    // Sort stocks by current market value descending within each exchange, totals first
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
                        stock: orderbyStock(),
                    };
                } else {
                    return getStock(items[index]).then(() => recurGet(index + 1))
                }
            }
            return recurGet(0);
        });
    },
    /**
     * Parse portfolio maintenance commands, stage the resulting mutations, and
     * optionally persist them back to TOTALDB when real=true.
     */
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
            // Collect inserts/updates/deletes first so a batch of commands can be
            // previewed and then committed in one pass when real=true.
            const updateTotal = {};
            const removeTotal = [];
            const single = v => {
                // Command shape: "<target> <value> [extra] [cost]" where target is
                // remaintwse/remainusse/delete/clear/<setype+index>.
                const cmd = v.match(/^([\da-zA-Z\-]+)\s+([\da-zA-Z\-]+|\-?\d+\.?\d*)\s*(\d+\.?\d*|amount)?\s*(cost)?$/);
                if (cmd) {
                    let remainM = null;
                    // remaintwse/remainusse directly overwrite the unallocated cash bucket.
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
                        // delete <setype+index>: either mark the position for async cleanup
                        // or liquidate it immediately, depending on the current runtime mode.
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
                                });
                            }
                        }
                    } else if (cmd[1] === 'clear') {
                        // clear <setype+index> keeps the position but flags it for the
                        // cleanup flow that presents the "Clearing" status in summaries.
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
                                    // "... amount" resets the capital allocation and rebuilds
                                    // the web grid around the new target budget.
                                    const newWeb = adjustWeb(items[i].web, items[i].mid, +cmd[2]);
                                    if (!newWeb) {
                                        return handleError(new HoError(`Amount need large than ${Math.ceil(webMaxAmount(items[i].web, items[i].mid) / 2)}`));
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
                                    // "... <count> <cost> cost" rewrites the current position
                                    // into an exact count/cost basis without recording a trade.
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
                                    // Numeric updates are treated as buy/sell commands; they
                                    // adjust cash, position size, and the recent trade history
                                    // used by the range logic.
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
                                }
                                break;
                            }
                        }
                        if (!is_find) {
                            if (+cmd[2] >= 0 && cmd[3] === 'amount') {
                                // For a brand-new position, clone the stock's web template and
                                // seed the allocation without executing a buy/sell trade yet.
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
                                        return handleError(new HoError(`Amount need large than ${Math.ceil(webMaxAmount(item[0].web.arr, item[0].web.mid) / 2)}`));
                                    }
                                    return getBasicStockData(setype, index).then(basic => getStockPrice(setype, basic.stock_index).then(price => {
                                        log.debug({ basic }, 'basic stock data');
                                        items.push({
                                            owner: user._id,
                                            setype,
                                            index: basic.stock_index,
                                            // Keep the exchange prefix in the display name because
                                            // update commands address positions as "<setype><index>".
                                            name: `${setype} ${basic.stock_index} ${basic.stock_name}`,
                                            type: basic.stock_ind ? `${basic.stock_class} ${basic.stock_ind}` : `${basic.stock_class}`,
                                            count: 0,
                                            web: newWeb.arr,
                                            wType: item[0].web.type,
                                            mid: newWeb.mid,
                                            times: newWeb.times,
                                            extrem: item[0].web.extrem,
                                            amount: +cmd[2],
                                            orig: +cmd[2],
                                            price,
                                            previous: {buy: [], sell: []},
                                            newMid: [],
                                            ing: 0,
                                        })
                                    }));
                                });
                            }
                        }
                    }
                }
            }
            // Apply staged mutations only after every command has been parsed successfully.
            const updateReal = () => {
                log.debug({ updateTotal, removeTotal, remain, remain1, items }, 'updateStockTotal reconciliation');
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
            // Reuse the same formatter as getStockTotal so preview mode and persisted
            // mode return identical portfolio summaries.
            const rest = () => {
                let profit = 0;
                let totalPrice = 0;
                let profit1 = 0;
                let totalPrice1 = 0;
                // Count stocks with non-empty newMid per exchange for "X of stock out of range" display
                let newMidCountTwse = 0;
                let newMidCountUsse = 0;
                const stock = [];
                const getStock = v => {
                    if (v.type === 'total') {
                        return Promise.resolve();
                    } else {
                        // Track stocks whose price has broken out of their web range (non-empty newMid stack)
                        if (v.newMid && v.newMid.length > 0) {
                            if (v.setype === 'usse') {
                                newMidCountUsse++;
                            } else {
                                newMidCountTwse++;
                            }
                        }
                        let se = 0;
                        let current = v.price * v.count;
                        // Cleared positions may stash realized profit separately; normalize the
                        // remaining cash basis before calculating the open-position summary.
                        //v.amount = v.profit ? (v.amount - v.profit) : v.amount;
                        // p: lifetime P/L versus original allocation, y: day-over-day change.
                        //let p = current + v.amount - (v.mul ? v.orig * v.mul : v.orig);
                        v.amount = (v.mul ? v.orig * v.mul : v.orig) + (v.profit ? v.profit : 0);
                        let p = (v.profit ? v.profit : 0) + current;
                        let y = v.previousPrice ? ((v.price - v.previousPrice) * v.count) : 0;
                        if (v.setype === 'usse') {
                            totalPrice1 += current;
                            profit1 += y;
                            se = 1;
                        } else {
                            totalPrice += current;
                            profit += y;
                        }
                        if (v.clear) {
                            v.str = v.str ? `Clearing ${v.str}` : 'Clearing';
                        }
                        if (v.ing === 2) {
                            v.str = v.str ? `Deleting ${v.str}` : 'Deleting';
                        }
                        stock.push({
                            name: v.name,
                            type: v.type,
                            price: v.price,
                            mid: v.mid,
                            mul: Math.round(v.mul * 100) / 100,
                            count: (v.setype === 'usse') ? v.count : v.count / 100,
                            remain: Math.round(v.amount * 100) / 100,
                            profit: p,
                            current,
                            str: v.str ? v.str : '',
                            se,
                            order: v.order,
                        });
                        return Promise.resolve();
                    }
                }
                const recurGet = index => {
                    if (index >= items.length) {
                        // Prepend usse total summary row
                        if (totalName1) {
                            stock.unshift({
                                name: totalName1,
                                type: totalType1,
                                profit: profit1,
                                price: Math.round(totalPrice1 * 100) / 100,
                                mid: 1,
                                remain: `${(totalPrice1 + remain1 > 0) ? Math.round(profit1 / (totalPrice1 + remain1) * 10000) / 100 : 0}%`,
                                count: 1,
                                current: totalPrice1,
                                str: newMidCountUsse > 0 ? `${newMidCountUsse} of stock out of range` : '',
                                se: 1,
                            })
                        }
                        // Prepend twse total summary row (inserted after usse so it appears first)
                        if (totalName) {
                            stock.unshift({
                                name: totalName,
                                type: totalType,
                                profit,
                                price: Math.round(totalPrice * 100) / 100,
                                mid: 1,
                                remain: `${(totalPrice + remain > 0) ? Math.round(profit / (totalPrice + remain) * 10000) / 100 : 0}%`,
                                count: 1,
                                current: totalPrice,
                                str: newMidCountTwse > 0 ? `${newMidCountTwse} of stock out of range` : '',
                                se: 0,
                            })
                        }
                        // Sort stocks by current market value descending within each exchange, totals first
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
                            stock: orderbyStock(),
                        };
                    } else {
                        return getStock(items[index]).then(() => recurGet(index + 1))
                    }
                }
                return recurGet(0);
            }
            // Guarantee both exchange summary rows exist before applying any commands.
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

// Parse one month of TWSE CSV rows into the high/low/volume/day arrays used by interval_data.
// Parse a TWSE monthly CSV payload, including quoted numeric fields that
// contain commas, into per-day high/low/volume arrays.
export const parseStockCsv = (raw_data, year, month_str) => {
    const high = [];
    const low = [];
    const vol = [];
    const day = [];
    if (!raw_data || raw_data.length <= 200) {
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
            // TWSE CSV rows may contain quoted numeric fields with embedded commas,
            // so rebuild quoted segments before indexing into the parsed columns.
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
                } else if (tmp_index === -1) {
                    tmp_list_1.push(tmp_list[j]);
                }
            }
            if (tmp_list_1[4] !== '--' && tmp_list_1[5] !== '--') {
                high.push(Number(tmp_list_1[4]));
                low.push(Number(tmp_list_1[5]));
                vol.push(Number(tmp_list_1[8]));
                // Keep only the day-of-month because the caller already groups data by year/month.
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

    // TWT49U exposes TWSE ex-right / ex-dividend reference prices; convert them into
    // backward-adjustment ratios so older bars stay comparable with post-event trading.
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

    // Capital reductions shrink share count and usually lift the reference price,
    // so the backward ratio is inverted relative to ex-dividend adjustments.
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

    // TPEx uses a different payload shape (`tables[0].data`) but the same idea:
    // derive a price ratio from pre-event close versus exchange-published reference price.
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

    // Yahoo events are timestamped at the action date, so use the latest earlier close
    // as the baseline for dividend/capital-gain ratio calculations.
    const findCloseBefore = (eventTs) => {
        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i] < eventTs && quotes.close[i]) {
                return quotes.close[i];
            }
        }
        return null;
    };

    if (stockData.events.dividends) {
        for (const ev of Object.values(stockData.events.dividends)) {
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

    // Yahoo split events already provide the share conversion, so convert directly to
    // the backward price ratio applied to pre-split data points.
    if (stockData.events.splits) {
        for (const ev of Object.values(stockData.events.splits)) {
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
        for (const ev of Object.values(stockData.events.capitalGains)) {
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
                // Refresh each month's range from adjusted prices so downstream web generation
                // sees the same extrema as the flattened raw_arr.
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

    // Flag unusually large step changes; callers can compare the warning list with known
    // corporate-action dates when deciding whether the interval series is trustworthy.
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
    if (warnings.length > 0) log.warn({ warnings }, 'data validation warnings');
    return { valid, warnings };
};

// Download a single TWSE annual report file to the staging path before Drive upload.
const getTwseAnnual = (index, year, filePath) => Api('url', `https://doc.twse.com.tw/server-java/t57sb01?id=&key=&step=1&co_id=${index}&year=${year-1911}&seamon=&mtype=F&dtype=F04`, {referer: 'https://doc.twse.com.tw/'}).then(raw_data => {
    const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
    const $center = $('body').children('center').first();
    if ($center.length === 0) {
        log.debug({ raw_data }, 'annual report step1 response');
        return handleError(new HoError('cannot find form'));
    }
    const $form = $center.children('form').first();
    if ($form.length === 0) {
        log.debug({ raw_data }, 'annual report step2 response');
        return handleError(new HoError('cannot find form'));
    }
    let filename = false;
    $form.children('table').first().children('table').first().children('tr').eq(1).children('td').each((_, t) => {
        if (!filename) {
            const $a = $(t).children('a').first();
            if ($a.length > 0) {
                filename = $a.text().trim();
            }
        }
    });
    if (!filename) {
        return handleError(new HoError('cannot find annual location'));
    }
    log.info({ filename }, 'downloading annual report');
    if (getExtname(filename).ext === '.zip') {
        return Api('url', `https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=${index}&filename=${filename}`, {referer: 'https://doc.twse.com.tw/'}, {filePath}).then(() => filename);
    } else {
        return Api('url', `https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=${index}&filename=${filename}`, {referer: 'https://doc.twse.com.tw/'}).then(raw_data => {
            const $2 = cheerio.load(Htmlparser.parseDOM(raw_data));
            return Api('url', addPre($2('html body center a').first().attr('href'), 'https://doc.twse.com.tw'), {filePath}).then(() => filename);
        });
    }
});

// Fetch up to five years of TWSE annual reports for one company into its Drive folder.
export const getSingleAnnual = (year, folder, index) => {
    let annual_list = [];
    const recur_annual = (cYear, annual_folder) => {
        // Walk backward year by year, skipping reports that are already uploaded or marked as read.
        if (!annual_list.includes(cYear.toString()) && !annual_list.includes(`read${cYear}`)) {
            const folderPath = `/mnt/stock/twse/${index}`;
            const filePath = `${folderPath}/tmp`;
            const mkfolder = () => fsExists(folderPath).then(exists => exists ? Promise.resolve() : Mkdirp(folderPath));
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
        log.debug({ annual_list }, 'annual report list');
        return recur_annual(year, annualList[0].id);
    }));
}
// Refresh live price/status data for every tracked stock, recompute trade suggestions,
// and persist the latest portfolio snapshot for downstream order generation.
export const stockStatus = newStr => Mongo('find', TOTALDB, {sType: {$exists: false}}).then(items => {
    // Broker positions/orders are loaded once per refresh cycle so every item uses the same snapshot.
    const ussePosition = getUssePosition();
    const usseOrder = getUsseOrder();
    log.debug({ ussePosition, usseOrder }, 'USSE portfolio state');
    const twsePosition = getTwsePosition();
    const twseOrder = getTwseOrder();
    log.debug({ twsePosition, twseOrder }, 'TWSE portfolio state');
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
                    // Some entries store scaled fundamentals; normalize them before computing suggestions.
                    if (item.mul) {
                        item.orig = item.orig * item.mul;
                        item.times = Math.floor(item.times * item.mul);
                    }
                    //item.pricecost = 0;
                    //item.pl = 0;
                    item.count = 0;
                    if (item.profit) {
                        item.orig += item.profit;
                    }
                    item.amount = item.orig;
                    if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'usse') {
                        for (let i = 0; i < ussePosition.length; i++) {
                            if (ussePosition[i].symbol === item.index) {
                                //item.pricecost = ussePosition[i].price;
                                //item.pl = ussePosition[i].amount * (price - ussePosition[i].price);
                                //item.orig += item.pl;
                                item.orig += (ussePosition[i].amount * price);
                                item.count = ussePosition[i].amount;
                                //item.amount = item.orig - ussePosition[i].amount * ussePosition[i].price;
                                break;
                            }
                        }
                        // Keep a compact, human-readable pending-order summary on each stock item.
                        item.order = [];
                        for (let i = 0; i < usseOrder.length; i++) {
                            if (usseOrder[i].symbol === item.index) {
                                const time = new Date(usseOrder[i].time * 1000);
                                item.order.push(`${usseOrder[i].amount} ${usseOrder[i].type === 'MARKET' ? 'MARKET' : usseOrder[i].price} ${time.getMonth() + 1}/${time.getDate()}`);
                            }
                        }
                    } else if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE) && item.setype === 'twse') {
                        for (let i = 0; i < twsePosition.length; i++) {
                            if (twsePosition[i].symbol === item.index) {
                                //item.pricecost = twsePosition[i].price;
                                //item.pl = twsePosition[i].amount * (price - twsePosition[i].price);
                                //item.orig += item.pl;
                                item.orig += (twsePosition[i].amount * price);
                                item.count = twsePosition[i].amount;
                                //item.amount = item.orig - twsePosition[i].amount * twsePosition[i].price;
                                break;
                            }
                        }
                        // TWSE orders use the same summary format, with odd-lot quantities normalized.
                        item.order = [];
                        for (let i = 0; i < twseOrder.length; i++) {
                            if (twseOrder[i].symbol === item.index) {
                                const time = new Date(twseOrder[i].time * 1000);
                                item.order.push(`${twseOrder[i].type.match(/StockOrderLot\.IntradayOdd$/) ? twseOrder[i].amount / 1000 : twseOrder[i].amount} ${!twseOrder[i].type.match(/^PriceType\.LMT/) ? 'MARKET' : twseOrder[i].price} ${time.getMonth() + 1}/${time.getDate()}`);
                            }
                        }
                    }
                    if (item.orig < 1000) {
                        item.orig = 1000;
                    }
                    log.debug({ item }, 'stock status item');
                    const fee = items[index].setype === 'usse' ? USSE_FEE : TRADE_FEE;
                    // Resolve any breakout-driven midpoint shifts before generating fresh buy/sell guidance.
                    let newArr = resolveNewMidStack(item.newMid, price, item.mid, item.web, (nm) => {
                        log.debug({ nm }, 'newMid value');
                    });
                    let suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                    // Re-run the web whenever repeated breakouts push too many provisional mids onto the stack.
                    // The preferred path rebuilds from cached interval data; the ratio fallback preserves behavior
                    // when the cache is missing or the recalculation cannot produce a stable stair array.
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
                                suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                                return processResetWeb(recalcCount);
                            });
                        } else {
                            newArr = scaleWebArr(item.newMid, item.mid, item.web);
                        }
                        suggestion = stockProcess(price, newArr, item.times, item.previous, item.orig, item.clear ? 0 : item.amount, item.count, Math.abs(item.web[0]), item.wType, 0, fee, undefined, undefined, undefined, item.newMid.length);
                        return processResetWeb(recalcCount);
                    };
                    return processResetWeb(0).then(() => {
                    // §9a Kelly Criterion: boost trade count when the measured edge is strong enough
                    // to justify one extra unit on both sides of the web.
                    if (item.metrics && item.metrics.winRate > 0 && item.metrics.avgLoss > 0) {
                        const p = item.metrics.winRate / 100;
                        const b = item.metrics.avgWin / item.metrics.avgLoss;
                        const kelly = p - (1 - p) / b;
                        if (kelly > 0.5) {
                            if (suggestion.buy > 0) suggestion.bCount++;
                            if (suggestion.sell > 0) suggestion.sCount++;
                        }
                    }
                    // Fold already queued manual quantities into the next suggested order size.
                    suggestion.buy = suggestion.buy + (item.bquantity ? item.bquantity : 0) + (item.boddquantity ? item.boddquantity : 0);
                    suggestion.sell = suggestion.sell + (item.squantity ? item.squantity : 0) + (item.soddquantity ? item.soddquantity : 0);
                    if (!item.clear) {
                        // When the midpoint has shifted, rebalance toward the new target cash/holding band
                        // by increasing the count of repeated buys or sells rather than altering unit size.
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
                    log.info({ str: suggestion.str }, 'trade suggestion');
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
                    // Persist the derived suggestion snapshot used by UI displays and later order placement.
                    return Mongo('update', TOTALDB, {_id: item._id}, {$set : {
                        price,
                        previousPrice,
                        str: suggestion.str,
                        newMid: item.newMid,
                        mid: item.mid,
                        web: item.web,
                        count: item.count,
                        amount: item.amount,
                        order: item.order,
                    }});
                    });
                });
            }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(recur_price(index + 1)), _statusDelay)))
        }
    }
    return recur_price(0).then(() => {
        // §6d Emergency Stop: when too many active holdings have broken out of their web price range
        // (non-empty newMid stack), zero all buy/sell counts to prevent trading until market stabilizes.
        // Clearing/deleting items are excluded since they are already winding down positions.
        const activeItems = items.filter(it => it.index !== 0 && it.index && !it.clear && it.ing !== 2);
        if (activeItems.length > 0) {
            const shiftedCount = activeItems.filter(it => it.newMid && it.newMid.length > 0).length;
            if (shiftedCount > activeItems.length * EMERGENCY_STOP_THRESHOLD / 100) {
                log.warn({ shiftedCount, total: activeItems.length }, 'emergency stop triggered — forcing fakeOrder');
                // Zero out suggestion counts to convert real orders into fake orders,
                // but exempt clearing/deleting items so they can finish winding down.
                const exemptKeys = new Set(
                    items.filter(it => it.clear || it.ing === 2).map(it => `${it.setype}:${it.index}`)
                );
                ['twse', 'usse'].forEach(setype => {
                    Object.keys(suggestionData[setype]).forEach(key => {
                        if (exemptKeys.has(`${setype}:${key}`)) return;
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

// Fetch the tracked stock universe for TWSE sector pages or major US index constituents.
export const getStockListV2 = (type, year, month) => {
    switch(type) {
        case 'twse':
        // MOPS sector membership is published by reporting quarter, so map the current
        // month to the latest completed quarter before requesting the roster.
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
            const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
            const tables = $('body').children('div').first().children('table').toArray();
            let tag = false;
            tables.forEach(table => {
                if ($(table).attr('class') === 'noBorder') {
                    const name = $(table).children('tr').first().children('td').eq(1).text().trim();
                    tag = false;
                    for (let i = 0; i < STOCK_INDEX[type].length; i++) {
                        if (name === STOCK_INDEX[type][i].name) {
                            tag = STOCK_INDEX[type][i].tag;
                            break;
                        }
                    }
                } else {
                    if (tag) {
                        $(table).children('tr').each((_, tr) => {
                            const cls = $(tr).attr('class');
                            if (cls === 'even' || cls === 'odd') {
                                const index = $(tr).children('td').first().text().trim();
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
            log.debug({ stock_list }, 'fetched stock list');
            return stock_list;
        });
        case 'usse':
        // Build one deduplicated US list from the three reference index pages.
        // Each source exposes slightly different table shapes, so the parser branches per page.
        const list = ['Dow_Jones_Industrial_Average', 'Nasdaq-100', 'List_of_S%26P_500_companies'];
        const stock_list = [];
        const recur_get = index => {
            if (index >= list.length) {
                log.debug({ count: stock_list.length, stock_list }, 'stock list parsed');
                return stock_list;
            } else {
                return Api('url', `https://en.wikipedia.org/wiki/${list[index]}`).then(raw_data => {
                    const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
                    $('table[id="constituents"]')
                        .children('tbody').first()
                        .children('tr').each((_, t) => {
                        let name = null;
                        let sIndex = null;
                        if (list[index] === 'Dow_Jones_Industrial_Average') {
                            const $a = $(t).children('th').first().children('a').first();
                            if ($a.length > 0) {
                                name = toValidName($a.text().trim()).replace('&amp;', '&').replace('&#x27;', "'");
                                sIndex = $(t).children('td').eq(1).children('a').first().text().trim().replace('.', '-');
                            }
                        } else {
                            const $d = $(t).children('td').first();
                            if ($d.length > 0) {
                                const $a = $(t).children('td').eq(1).children('a').first();
                                if ($a.length > 0) {
                                    name = $a.text().trim().replace('&amp;', '&').replace('&#x27;', "'");
                                } else {
                                    name = $(t).children('td').eq(1).text().trim().replace('&amp;', '&').replace('&#x27;', "'");
                                }
                                const $a1 = $d.children('a').first();
                                if ($a1.length > 0) {
                                    sIndex = $a1.text().trim().replace('.', '-');
                                } else {
                                    sIndex = $d.text().trim().replace('.', '-');
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

// Generate buy/sell suggestions for a single price probe against the current web.
// Returns resetWeb when price escapes the ladder and a new midpoint must be derived.
export const stockProcess = (price, priceArray, priceTimes = 1, previous = {buy:[], sell:[]}, pOrig, pAmount, pCount, upLimit, pType = 0, sType = 0, fee = TRADE_FEE, ttime = TRADE_TIME, tinterval = TRADE_INTERVAL, now = Math.round(_dateFactory().getTime() / 1000), newMidDepth = 0) => {
    priceTimes = priceTimes ? priceTimes : 1;
    let is_buy = true;
    let is_sell = true;
    let bTimes = 1;
    let sTimes = 1;
    let bP = 8;
    let nowBP = priceArray.length - 1;
    let bAdd = 0;
    let sAdd = 0;

    // Walk downward through the web to find the nearest buy band and its σ depth.
    for (; nowBP >= 0; nowBP--) {
        if (Math.abs(priceArray[nowBP]) * (sType === 0 ? 1.001 : 1.0001) >= price) {
            break;
        }
        if (priceArray[nowBP] < 0) {
            bP--;
        }
    }
    if (nowBP === priceArray.length - 1) {
        const newMid = calcResetMid(priceArray, fee, 1, newMidDepth);
        return {
            resetWeb: 1,
            newMid,
        }
    }

    let sP = 0;
    let nowSP = 0;
    // Walk upward through the web to find the nearest sell band and its σ depth.
    for (; nowSP < priceArray.length; nowSP++) {
        if (Math.abs(priceArray[nowSP]) * (sType === 0 ? 0.999 : 0.9999) <= price) {
            break;
        }
        if (priceArray[nowSP] < 0) {
            sP++;
        }
    }
    if (nowSP === 0) {
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
            if (previous.type === 'buy') {
                // Buying again must wait longer when price has fallen deeper into the web.
                if ((now - previous.time) >= (ttime + (nowBP - previousP) * tinterval)) {
                    is_buy = true;
                    bTimes = bTimes * (nowBP - previousP + 1);
                } else {
                    is_buy = false;
                }
                is_sell = (now - previous.time) >= ttime;
            } else if (previous.type === 'sell') {
                // After a sell, both sides stay locked until the base cooldown expires.
                if ((now - previous.time) >= ttime) {
                    is_buy = true;
                    is_sell = true;
                } else {
                    is_sell = false;
                    is_buy = false;
                }
            }
            pPrice = ((previous.tprice && previous.tprice > previous.price) ? previous.tprice : previous.price) * (1 + fee) * (1 + fee);
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
            // Mirror the previous trade into the sell-side band so near-repeat sells are delayed too.
            nowSP = previousP < nowSP ? previousP : nowSP;
            sP = pP < sP ? pP : sP;
        }
        if (previous.price < price) {
            let previousP = 0;
            let pP = 0;
            let pPrice = ((previous.tprice && previous.tprice > previous.price) ? previous.tprice : previous.price) * (1 + fee) * (1 + fee);
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
            if (previous.type === 'sell') {
                // Selling again must wait longer when price has risen deeper into the web.
                if ((now - previous.time) >= (ttime + (previousP - nowSP) * tinterval)) {
                    is_sell = true;
                    sTimes = sTimes * (previousP - nowSP + 1);
                } else {
                    is_sell = false;
                }
                is_buy = (now - previous.time) >= ttime;
            } else if (previous.type === 'buy') {
                if ((now - previous.time) >= ttime) {
                    is_buy = true;
                    is_sell = true;
                } else {
                    is_buy = false;
                    is_sell = false;
                }
            }
            pPrice = ((previous.tprice && previous.tprice < previous.price) ? previous.tprice : previous.price) * (2 - (1 + fee) * (1 + fee));
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
    }

    let buy = 0;
    let sell = 0;
    let str = '';
    let bCount = 1;
    let sCount = 1;
    let type = 0;
    bCount = bTimes * bCount * priceTimes;
    sCount = sTimes * sCount * priceTimes;

    const finalSell = () => {
        if (pCount === 0) {
            sCount = 0;
            if (type === 8 || type === 5 || type === 9) {
                type = 0;
            }
        }
        // Cap the liquidation so the strategy keeps at least one-quarter of the original capital deployed.
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
        /*if (pAmount == 0) {
            sCount = 4 * priceTimes;
        }*/
    }

    const finalBuy = () => {
        // When the position is nearly empty, re-anchor the refill size to one quarter of the original capital.
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
        }
    }

    if (is_buy) {
        // Deeper buy bands accumulate larger tranches as price moves further below the midpoint.
        if (bP < 3) {
            str += 'Buy too high ';
            bCount = 0;
        } else if (bP > 6) {
            type = 6;
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
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
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
            finalBuy();
            str += `Buy 1/4 ${buy} ( ${bCount} ) `;
        } else {
            buy = (nowBP > priceArray.length - 2) ? Math.abs(priceArray[priceArray.length - 1]) : Math.abs(priceArray[nowBP + 1]);
            buy = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(buy, false) : usseTicker(buy, false) : (sType === 1) ? bitfinexTicker(buy, false) : buy;
            bCount = bCount * (1 + bAdd);
            finalBuy();
            str += `Buy ${buy} ( ${bCount} ) `;
        }
    } else {
        bCount = 0;
    }

    if (is_sell) {
        // Deeper sell bands unload larger tranches as price moves further above the midpoint.
        if (sP > 5) {
            str += 'Sell too low ';
            sCount = 0;
        } else if (sP < 2) {
            type = 8;
            sCount = sCount * (1 + sAdd);
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            finalSell();
            str += `Sell 3/4 ${sell} ( ${sCount} ) `;
        } else if (sP < 3) {
            type = 5;
            sCount = sCount * (1 + sAdd);
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            finalSell();
            str += `Sell 1/2 ${sell} ( ${sCount} ) `;
        } else if (sP < 4) {
            type = 9;
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            sCount = sCount * (1 + sAdd);
            finalSell();
            str += `Sell 1/4 ${sell} ( ${sCount} ) `;
        } else {
            sell = (nowSP < 1) ? Math.abs(priceArray[0]) : Math.abs(priceArray[nowSP - 1]);
            sell = (sType === 0) ? (fee === TRADE_FEE) ? twseTicker(sell) : usseTicker(sell) : (sType === 1) ? bitfinexTicker(sell) : sell;
            sCount = sCount * (1 + sAdd);
            finalSell();
            str += `Sell ${sell} ( ${sCount} ) `;
        }
    } else {
        sCount = 0;
    }

    // Fee-aware dead zone (§3c): suppress signals too close to previous trade price.
    if (previous.time && previous.price) {
        const deadZone = previous.price * fee * 3;
        if (buy > 0 && bCount > 0 && Math.abs(buy - previous.price) <= deadZone) {
            bCount = 0;
            buy = 0;
            str += '[dead zone] ';
        }
        if (sell > 0 && sCount > 0 && Math.abs(sell - previous.price) <= deadZone) {
            sCount = 0;
            sell = 0;
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

// Segmented walk-forward backtest of the web strategy against full historical candles.
// Splits his_arr into 5 chronological segments, builds 10 out-of-sample test groups,
// and aggregates per-group metrics into a summary. Parameters start/reverse/len are
// superseded (kept only for call-site backward compat) — all calls run the full dataset.
export const stockTest = (his_arr, loga, min, pType = 0, rinterval = RANGE_INTERVAL, fee = TRADE_FEE, ttime = TRADE_TIME, tinterval = TRADE_INTERVAL, sType = 0) => {
    const now = Math.round(_dateFactory().getTime() / 1000);
    const N = his_arr.length;

    const ZERO_METRICS = {
        maxAmount: 0, returnPct: 0, returnAnnualPct: 0,
        buyHoldPct: 0, sharpe: 0, sortino: 0, calmar: 0,
        maxDrawdownPct: 0, maxDrawdownDuration: 0,
        winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: 0,
        buyTrade: 0, sellTrade: 0, stopLoss: 0, tradeDays: 0, tradesPerYear: 0,
    };
    const ZERO_SUMMARY = {
        avgReturnAnnualPct: 0, avgBuyHoldPct: 0,
        avgSortino: 0, avgProfitFactor: 0, maxDrawdownPct: 0,
    };

    // ── §1.1 Split into 5 chronological segments ─────────────────────────────
    // his_arr is newest-first: index 0 = most recent, index N-1 = oldest.
    // S1 (oldest) occupies the high-index end; S5 (newest) the low-index end.
    // Remainder candles are appended to S5 so no data is dropped.
    const segLen = Math.floor(N / 5);
    if (segLen < 5) {
        // Too few candles for meaningful segmentation; return all-zero early result.
        return { start: 0, metrics: ZERO_METRICS, groups: [], summary: ZERO_SUMMARY };
    }

    // Segment bounds [lo, hi) in newest-first his_arr (high index = older):
    //   S1 (oldest):  [N-segLen, N)
    //   S2:           [N-2*segLen, N-segLen)
    //   S3:           [N-3*segLen, N-2*segLen)
    //   S4:           [N-4*segLen, N-3*segLen)
    //   S5 (newest):  [0, N-4*segLen)   — includes the floor() remainder
    const s1Lo = N - segLen,    s1Hi = N;
    const s2Lo = N - 2*segLen,  s2Hi = s1Lo;
    const s3Lo = N - 3*segLen,  s3Hi = s2Lo;
    const s4Lo = N - 4*segLen,  s4Hi = s3Lo;
    const s5Lo = 0,              s5Hi = s4Lo;

    // ── §1.2–1.3 Initial web from S1; freeze max amount once ─────────────────
    const web0 = calStair(his_arr, loga, min, s1Lo, fee, segLen);
    if (!web0) {
        return { start: 0, metrics: ZERO_METRICS, groups: [], summary: ZERO_SUMMARY };
    }
    // ── §2.2 Build cumulative web snapshots ──────────────────────────────────
    // webStates[k] = web snapshot after all candles through Sk have been walked:
    //   webStates[1] = S1 only (= web0)
    //   webStates[2] = S1+S2
    //   webStates[3] = S1+S2+S3
    //   webStates[4] = S1+S2+S3+S4
    // webStates evolve naturally (no adjustWeb scaling) so that
    // webMaxAmount(webStates[k]) reflects the true capital implied by k segments.
    const cloneWeb = w => ({ ...w, arr: [...w.arr] });

    // Walk a segment in chronological order (hi-1 → lo inclusive), rebuilding the web
    // every 5 candles using the accumulating window his_arr[i .. N).
    const walkSegment = (prevWeb, segLo, segHi) => {
        let web = cloneWeb(prevWeb);
        let checkweb = 0;
        for (let i = segHi - 1; i >= segLo; i--) {
            checkweb++;
            if (checkweb >= 5) {
                checkweb = 0;
                const nw = calStair(his_arr, loga, min, i, fee, N - i);
                if (nw) {
                    web = cloneWeb(nw);
                }
            }
        }
        return web;
    };

    const webStates = [null]; // 1-indexed; webStates[0] unused
    webStates[1] = cloneWeb(web0);
    webStates[2] = cloneWeb(walkSegment(webStates[1], s2Lo, s2Hi));
    webStates[3] = cloneWeb(walkSegment(webStates[2], s3Lo, s3Hi));
    webStates[4] = cloneWeb(walkSegment(webStates[3], s4Lo, s4Hi));

    // ── §1.3 Per-seed max amounts ─────────────────────────────────────────────
    // Each seed's capital base = webMaxAmount of the web at the end of its history window.
    //   seedIdx=1 → S1 history only
    //   seedIdx=2 → S1+S2 cumulative history
    //   seedIdx=3 → S1+S2+S3
    //   seedIdx=4 → S1+S2+S3+S4
    // This is frozen for each group at the moment simulation begins.
    const maxAmountBySeed = [0]; // 1-indexed
    for (let k = 1; k <= 4; k++) {
        maxAmountBySeed.push(webMaxAmount(webStates[k].arr, webStates[k].mid));
    }

    // ── §2.1 10-Group definitions ─────────────────────────────────────────────
    // Each entry: { seedIdx, tradedLo, tradedHi, segCount }
    // tradedLo..tradedHi is the range traded; seedIdx → webStates[seedIdx].
    const groupDefs = [
        { seedIdx: 1, tradedLo: s2Lo, tradedHi: s2Hi, segCount: 1 }, // G1:  S2
        { seedIdx: 2, tradedLo: s3Lo, tradedHi: s3Hi, segCount: 1 }, // G2:  S3
        { seedIdx: 3, tradedLo: s4Lo, tradedHi: s4Hi, segCount: 1 }, // G3:  S4
        { seedIdx: 4, tradedLo: s5Lo, tradedHi: s5Hi, segCount: 1 }, // G4:  S5
        { seedIdx: 1, tradedLo: s3Lo, tradedHi: s2Hi, segCount: 2 }, // G5:  S2+S3
        { seedIdx: 2, tradedLo: s4Lo, tradedHi: s3Hi, segCount: 2 }, // G6:  S3+S4
        { seedIdx: 3, tradedLo: s5Lo, tradedHi: s4Hi, segCount: 2 }, // G7:  S4+S5
        { seedIdx: 1, tradedLo: s4Lo, tradedHi: s2Hi, segCount: 3 }, // G8:  S2+S3+S4
        { seedIdx: 2, tradedLo: s5Lo, tradedHi: s3Hi, segCount: 3 }, // G9:  S3+S4+S5
        { seedIdx: 1, tradedLo: s5Lo, tradedHi: s2Hi, segCount: 4 }, // G10: S2+S3+S4+S5
    ];

    // ── §2.3 runGroup: single-group trading simulation ────────────────────────
    const runGroup = ({ seedIdx, tradedLo, tradedHi, segCount }) => {
        if (tradedHi - tradedLo < 2) return null;

        // Freeze capital at the seed-derived max amount for this group.
        const FIXED_MAX_AMOUNT = maxAmountBySeed[seedIdx];

        let web = cloneWeb(webStates[seedIdx]);
        let newMid = [];
        let count = 0;
        let amount = FIXED_MAX_AMOUNT;
        let priviousTrade = { buy: [], sell: [] };
        let buyTrade = 0;
        let sellTrade = 0;
        let stopLoss = 0;
        const equityCurve = [];
        const buyLog = [];
        const sellLog = []; // kept for future use
        let peakEquity = FIXED_MAX_AMOUNT;
        let maxDrawdown = 0;
        let currentDrawdownStart = -1;
        let maxDrawdownDuration = 0;
        let grossProfit = 0;
        let grossLoss = 0;
        let winCount = 0;
        let lossCount = 0;
        let totalWin = 0;
        let totalLoss = 0;

        // §3.1 Initial position: 25% of FIXED_MAX_AMOUNT deployed, 75% held as cash.
        // referencePrice = midpoint of the oldest (first traded) candle.
        const firstCandle = his_arr[tradedHi - 1];
        const referencePrice = firstCandle
            ? ((firstCandle.h + firstCandle.l) / 2 || firstCandle.h || firstCandle.l) : 0;
        // initialValue: fractional (dollar-value) position when one whole share cannot be
        // afforded with 25% of FIXED_MAX_AMOUNT.  It tracks 1/4 buy-hold return without
        // interacting with the integer buy/sell logic.
        let initialValue = 0;
        if (referencePrice > 0) {
            const count0 = Math.floor(FIXED_MAX_AMOUNT * 0.25 / referencePrice);
            if (count0 > 0) {
                const buyPrice = referencePrice * (1 + fee);
                amount = FIXED_MAX_AMOUNT - count0 * buyPrice;
                count = count0;
                // Seed buyLog so FIFO round-trip attribution starts correctly.
                buyLog.push({ price: buyPrice, count: count0, idx: -1 });
            } else {
                // Price too high for even one share at 25% of capital base.
                // Deploy a virtual dollar-value position so the group captures
                // 1/4 of buy-hold return even when no integer trades fire.
                initialValue = FIXED_MAX_AMOUNT * 0.25;
                amount = FIXED_MAX_AMOUNT - initialValue;
            }
        }

        // §3.4 Hold & Buy baseline: deploy 100% at first candle, hold until last.
        const bhFirstPrice = firstCandle ? (firstCandle.l || firstCandle.h || 0) : 0;
        const holdCount = bhFirstPrice > 0 ? Math.floor(FIXED_MAX_AMOUNT / bhFirstPrice) : 0;
        const holdCash = FIXED_MAX_AMOUNT - holdCount * bhFirstPrice * (1 + fee);

        const lastNode = his_arr[tradedLo];
        let prevClose = firstCandle ? (firstCandle.h || firstCandle.l || 0) : 0;
        let checkweb = 0;

        const recordSell = (sellPrice, soldCount, idx) => {
            let remaining = soldCount;
            const netSell = sellPrice * (1 - fee);
            while (remaining > 0 && buyLog.length > 0) {
                const oldest = buyLog[0];
                const matched = Math.min(remaining, oldest.count);
                const profit = (netSell - oldest.price) * matched;
                if (profit >= 0) { grossProfit += profit; winCount++; totalWin += profit; }
                else { grossLoss += Math.abs(profit); lossCount++; totalLoss += Math.abs(profit); }
                sellLog.push({ price: sellPrice, count: matched, idx, profit });
                oldest.count -= matched;
                remaining -= matched;
                if (oldest.count <= 0) buyLog.shift();
            }
        };

        const newPreviousFn = (tradeType, tradePrice, tradeTime) => {
            if (tradeType === 'buy') {
                let inserted = false;
                for (let k = 0; k < priviousTrade.buy.length; k++) {
                    if (tradePrice < priviousTrade.buy[k].price) {
                        priviousTrade.buy.splice(k, 0, { price: tradePrice, time: tradeTime });
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) priviousTrade.buy.push({ price: tradePrice, time: tradeTime });
                priviousTrade = {
                    price: tradePrice, time: tradeTime, type: 'buy',
                    buy: priviousTrade.buy.filter(v => tradeTime - v.time < rinterval),
                    sell: priviousTrade.sell,
                };
            } else if (tradeType === 'sell') {
                let inserted = false;
                for (let k = 0; k < priviousTrade.sell.length; k++) {
                    if (tradePrice > priviousTrade.sell[k].price) {
                        priviousTrade.sell.splice(k, 0, { price: tradePrice, time: tradeTime });
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) priviousTrade.sell.push({ price: tradePrice, time: tradeTime });
                priviousTrade = {
                    price: tradePrice, time: tradeTime, type: 'sell',
                    sell: priviousTrade.sell.filter(v => tradeTime - v.time < rinterval),
                    buy: priviousTrade.buy,
                };
            }
        };

        const runSignalFn = (p, i, newArr) => {
            // §3.2 Mirror live-engine signal generation, preserving newMid/resetWeb handling.
            let suggest = stockProcess(p, newArr, web.times, priviousTrade, FIXED_MAX_AMOUNT, amount, count, Math.abs(web.arr[0]), pType, sType, fee, ttime, tinterval, now - (i * tinterval), newMid.length);
            let recalcCount = 0;
            while (suggest.resetWeb) {
                if (suggest.resetWeb === 1) stopLoss++;
                newMid.push(suggest.newMid);
                if (newMid.length >= MAX_NEWMID_STACK) {
                    recalcCount++;
                    if (recalcCount > 2) { newMid = []; newArr = web.arr; break; }
                    let fraction = 2;
                    let recalcWeb = null;
                    while (fraction <= 8) {
                        const halfLen = Math.max(Math.floor(N / fraction), 20);
                        recalcWeb = calStair(his_arr, loga, min, 0, fee, halfLen);
                        if (recalcWeb) break;
                        fraction *= 2;
                    }
                    if (recalcWeb) { web = recalcWeb; newMid = []; newArr = web.arr; }
                    else { newMid = []; newArr = web.arr; break; }
                } else {
                    newArr = scaleWebArr(newMid, web.mid, web.arr);
                }
                suggest = stockProcess(p, newArr, web.times, priviousTrade, FIXED_MAX_AMOUNT, amount, count, Math.abs(web.arr[0]), pType, sType, fee, ttime, tinterval, now - (i * tinterval), newMid.length);
            }
            return { suggest, newArr };
        };

        const tryExecuteFn = (suggest, i, candle) => {
            // §3.3 Order fills against the execution candle's High/Low.
            const tradeTime = now - (i * tinterval) + ttime / 6;
            if (newMid.length <= 0 || newMid[newMid.length - 1] <= web.mid) {
                if (suggest.buy > 0 && candle.l <= suggest.buy) {
                    if (suggest.bCount === 0) newPreviousFn('buy', suggest.buy, tradeTime);
                    const r = executeBuy(suggest, amount, FIXED_MAX_AMOUNT, count, fee);
                    if (r.didBuy) {
                        buyLog.push({ price: suggest.buy, count: r.count - count, idx: i });
                        newPreviousFn('buy', suggest.buy, tradeTime);
                    }
                    amount = r.amount; count = r.count; buyTrade += r.buyTrade;
                }
            } else if (suggest.buy && candle.l <= suggest.buy) {
                if (suggest.bCount === 0) newPreviousFn('buy', suggest.buy, tradeTime);
                const r = executeBuy({ ...suggest, type: 0 }, amount, FIXED_MAX_AMOUNT, count, fee);
                if (r.didBuy) {
                    buyLog.push({ price: suggest.buy, count: r.count - count, idx: i });
                    newPreviousFn('buy', suggest.buy, tradeTime);
                }
                amount = r.amount; count = r.count; buyTrade += r.buyTrade;
            }
            if (newMid.length <= 0 || newMid[newMid.length - 1] >= web.mid) {
                if (suggest.sell > 0 && count > 0 && candle.h >= suggest.sell) {
                    const prevC = count;
                    const r = executeSell(suggest, amount, FIXED_MAX_AMOUNT, count, fee);
                    const sold = prevC - r.count;
                    if (sold > 0) recordSell(suggest.sell, sold, i);
                    amount = r.amount; count = r.count; sellTrade += r.sellTrade;
                    newPreviousFn('sell', suggest.sell, tradeTime);
                }
            } else if (count > 0 && suggest.sell && candle.h >= suggest.sell) {
                const prevC = count;
                const r = executeSell({ ...suggest, type: 0 }, amount, FIXED_MAX_AMOUNT, count, fee);
                const sold = prevC - r.count;
                if (sold > 0) recordSell(suggest.sell, sold, i);
                amount = r.amount; count = r.count; sellTrade += r.sellTrade;
                newPreviousFn('sell', suggest.sell, tradeTime);
            }
        };

        // §1.4 Candle loop — chronological (high-index → low-index in newest-first array).
        // Every 5 candles: calStair over the growing window his_arr[i..N) appends traded candles
        // to the seed history without rebuilding from scratch.
        for (let i = tradedHi - 1; i > tradedLo; i--) {
            checkweb++;
            if (checkweb >= 5) {
                checkweb = 0;
                const nw = calStair(his_arr, loga, min, i, fee, N - i);
                if (nw) {
                    const adj = adjustWeb(nw.arr, nw.mid, FIXED_MAX_AMOUNT, true);
                    web = { ...nw, arr: adj.arr, mid: adj.mid };
                    newMid = [];
                }
            }

            if (his_arr[i].h === null || his_arr[i].l === null) {
                log.debug({ i }, 'backtest candle null in group');
                return null; // data miss for this group; caller skips it
            }

            const h = his_arr[i].h;
            const l = his_arr[i].l;
            const candle = his_arr[i - 1] || his_arr[i];
            let prices;
            if (h && l) {
                const distH = Math.abs(prevClose - h);
                const distL = Math.abs(prevClose - l);
                prices = distH <= distL ? [h, l] : [l, h];
            } else if (h) {
                prices = [h];
            } else if (l) {
                prices = [l];
            } else {
                prices = prevClose ? [prevClose] : [];
            }

            for (const p of prices) {
                let newArr = resolveNewMidStack(newMid, p, web.mid, web.arr, () => {
                    stopLoss = stopLoss > 0 ? stopLoss - 1 : 0;
                });
                const { suggest } = runSignalFn(p, i, newArr);
                tryExecuteFn(suggest, i, candle);
            }

            prevClose = l || h || prevClose;

            // Mark-to-market at candle low (conservative for drawdown tracking).
            const virtualMtm = (initialValue > 0 && referencePrice > 0)
                ? initialValue * ((his_arr[i].l || referencePrice) / referencePrice) * (1 - fee)
                : 0;
            const equity = amount + ((his_arr[i].l || 0) * count * (1 - fee)) + virtualMtm;
            equityCurve.push(equity);
            if (equity > peakEquity) {
                peakEquity = equity;
                if (currentDrawdownStart >= 0) {
                    const ddDur = equityCurve.length - 1 - currentDrawdownStart;
                    if (ddDur > maxDrawdownDuration) maxDrawdownDuration = ddDur;
                    currentDrawdownStart = -1;
                }
            } else {
                const dd = (peakEquity - equity) / peakEquity;
                if (dd > maxDrawdown) maxDrawdown = dd;
                if (currentDrawdownStart < 0) currentDrawdownStart = equityCurve.length - 1;
            }
        }
        if (currentDrawdownStart >= 0) {
            const ddDur = equityCurve.length - currentDrawdownStart;
            if (ddDur > maxDrawdownDuration) maxDrawdownDuration = ddDur;
        }

        // Phase 3: liquidate remaining position at last candle's low.
        amount += (lastNode && lastNode.l ? lastNode.l : 0) * count * (1 - fee);
        if (count > 0 && lastNode && lastNode.l) {
            recordSell(lastNode.l, count, tradedLo);
        }
        count = 0;
        // Liquidate virtual fractional position (1/4 buy-hold when no whole share was affordable).
        if (initialValue > 0 && referencePrice > 0) {
            const finalPrice = lastNode && lastNode.l ? lastNode.l : referencePrice;
            amount += initialValue * (finalPrice / referencePrice) * (1 - fee);
        }

        // §4.1 Per-group metrics — all formulas match the existing single-run stockTest.
        const tradeDays = equityCurve.length;
        const returnPct = FIXED_MAX_AMOUNT > 0 ? Math.round((amount / FIXED_MAX_AMOUNT - 1) * 10000) / 100 : 0;

        // §3.4 Hold & Buy final value using same fee model and FIXED_MAX_AMOUNT basis.
        const bhLastPrice = lastNode ? (lastNode.h || lastNode.l || 0) : 0;
        const holdFinalValue = holdCount * bhLastPrice * (1 - fee) + holdCash;
        const rawBuyHoldPct = FIXED_MAX_AMOUNT > 0 ? (holdFinalValue / FIXED_MAX_AMOUNT - 1) * 100 : 0;

        // §4.2 Annualization: single-segment groups use raw return; multi-segment use CAGR.
        // tradeDays/250 is consistent with the project's existing annual-return convention.
        let returnAnnualPct, buyHoldPct;
        if (segCount === 1) {
            returnAnnualPct = returnPct;
            buyHoldPct = Math.round(rawBuyHoldPct * 100) / 100;
        } else {
            const years = tradeDays > 0 ? tradeDays / 250 : 0;
            returnAnnualPct = years > 0
                ? Math.round(((amount / FIXED_MAX_AMOUNT) ** (1 / years) - 1) * 10000) / 100
                : returnPct;
            const holdRatio = FIXED_MAX_AMOUNT > 0 ? holdFinalValue / FIXED_MAX_AMOUNT : 1;
            buyHoldPct = years > 0
                ? Math.round((holdRatio ** (1 / years) - 1) * 10000) / 100
                : Math.round(rawBuyHoldPct * 100) / 100;
        }

        let sharpe = 0, sortino = 0;
        if (equityCurve.length > 1) {
            const dr = [];
            for (let k = 1; k < equityCurve.length; k++) dr.push(equityCurve[k] / equityCurve[k - 1] - 1);
            const mean = dr.reduce((s, r) => s + r, 0) / dr.length;
            const variance = dr.reduce((s, r) => s + (r - mean) ** 2, 0) / dr.length;
            const stdDev = Math.sqrt(variance);
            const downVariance = dr.reduce((s, r) => s + (r < 0 ? r ** 2 : 0), 0) / dr.length;
            const downDev = Math.sqrt(downVariance);
            sharpe = stdDev > 0 ? Math.round(mean / stdDev * Math.sqrt(250) * 100) / 100 : 0;
            sortino = downDev > 0 ? Math.round(mean / downDev * Math.sqrt(250) * 100) / 100 : 0;
        }

        const maxDrawdownPct = Math.round(maxDrawdown * 10000) / 100;
        const calmar = maxDrawdown > 0 ? Math.round(returnAnnualPct / maxDrawdownPct * 100) / 100 : 0;
        const totalRoundTrips = winCount + lossCount;
        const winRate = totalRoundTrips > 0 ? Math.round(winCount / totalRoundTrips * 10000) / 100 : 0;
        const avgWin = winCount > 0 ? Math.round(totalWin / winCount * 100) / 100 : 0;
        const avgLoss = lossCount > 0 ? Math.round(totalLoss / lossCount * 100) / 100 : 0;
        const profitFactor = grossLoss > 0
            ? Math.round(grossProfit / grossLoss * 100) / 100
            : (grossProfit > 0 ? Infinity : 0);
        const tradesPerYear = tradeDays > 0 ? Math.round(sellTrade / (tradeDays / 250) * 100) / 100 : 0;

        return {
            maxAmount: Math.ceil(FIXED_MAX_AMOUNT),
            returnPct, returnAnnualPct, buyHoldPct,
            sharpe, sortino, calmar,
            maxDrawdownPct, maxDrawdownDuration,
            winRate, avgWin, avgLoss, profitFactor,
            buyTrade, sellTrade, stopLoss, tradeDays, tradesPerYear,
        };
    };

    // ── §4.3 Run all 10 groups, then aggregate ────────────────────────────────
    const groups = groupDefs.map(runGroup);
    const validGroups = groups.filter(g => g !== null);

    if (validGroups.length === 0) {
        return { start: 0, metrics: ZERO_METRICS, groups, summary: ZERO_SUMMARY };
    }

    const n = validGroups.length;
    const avgReturnAnnualPct = Math.round(validGroups.reduce((s, g) => s + g.returnAnnualPct, 0) / n * 100) / 100;
    const avgBuyHoldPct = Math.round(validGroups.reduce((s, g) => s + g.buyHoldPct, 0) / n * 100) / 100;
    const avgSortino = Math.round(validGroups.reduce((s, g) => s + g.sortino, 0) / n * 100) / 100;

    // Profit factor guard: Infinity/NaN values are excluded from the average.
    // If ALL groups are Infinity (zero total loss across all groups), report Infinity.
    const finitePFs = validGroups.map(g => g.profitFactor).filter(pf => isFinite(pf) && !isNaN(pf));
    const avgProfitFactor = finitePFs.length > 0
        ? Math.round(finitePFs.reduce((s, pf) => s + pf, 0) / finitePFs.length * 100) / 100
        : (validGroups.every(g => g.profitFactor === Infinity) ? Infinity : 0);

    // MDD = worst single-group drawdown (§0 field 6: max, not average).
    const maxDrawdownPct = Math.max(...validGroups.map(g => g.maxDrawdownPct));

    const summary = { avgReturnAnnualPct, avgBuyHoldPct, avgSortino, avgProfitFactor, maxDrawdownPct };

    // Primary `metrics` = widest available group (G10 or last valid group).
    // Existing consumers of { start, metrics } keep working; groups/summary are additive.
    const primaryMetrics = validGroups[validGroups.length - 1];

    return { start: 0, metrics: primaryMetrics, groups, summary };
}

// Choose a histogram size with the Freedman–Diaconis rule so the stair adapts to data density.
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

// Build a logarithmically spaced ladder so equal step counts represent equal percentage moves.
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

// Construct the staircase web from OHLCV history by distributing decayed volume across log-price bins.
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
        // §2b Volume-time decay: recent data weighted more heavily.
        const dayAge = i - stair_start;
        const monthsAgo = dayAge / 21;
        const decayWeight = Math.exp(-VOLUME_DECAY_LAMBDA * monthsAgo);
        const weightedVol = raw_arr[i].v * decayWeight;
        volsum += weightedVol;
        single_arr.push((raw_arr[i].h - raw_arr[i].l) / raw_arr[i].h * 100);
        if ((e - s) === 0) {
            final_arr[s] += weightedVol;
        } else {
            // Spread each candle's volume uniformly across the bins its price range traversed.
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
        // Convert cumulative volume into σ cut points using NORMAL_DISTRIBUTION thresholds.
        while (vol >= (volsum / 100 * NORMAL_DISTRIBUTION[j]) && j < NORMAL_DISTRIBUTION.length) {
            nd.push(i);
            j++;
        }
    });
    const sort_arr = [...single_arr].sort((a,b) => a - b);
    // Extrem fallback chain (§2d): NORMAL_DISTRIBUTION[len-3] → [len-2] → [len-1] → false.
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
        // Use the innermost σ band width uniformly for all three layers so the web
        // extends outward with equal step density regardless of the actual outer-σ data.
        const upUnit = nd[4] - nd[3];
        const downUnit = nd[3] - nd[2];
        const upLayers = [
            buildSteps(upUnit), // mid → 1σ
            buildSteps(upUnit), // 1σ → 2σ
            buildSteps(upUnit), // 2σ → 3σ
        ];
        const downLayers = [
            buildSteps(downUnit), // mid → 1σ
            buildSteps(downUnit), // 1σ → 2σ
            buildSteps(downUnit), // 2σ → 3σ
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
    return web;
}

// Capital baseline for a web: exact sum of all buy-side (below-mid) prices.
// This stays correct for both uniform and non-uniform σ band widths from calStair.
const webMaxAmount = (webArr, webMid) => {
    const layers = [];
    let cur = [];
    let bCount = 0;
    for (const val of webArr) {
        if (val < 0) { layers.push(cur); cur = []; bCount++; } else { cur.push(val); }
    }
    layers.push(cur);
    if (bCount === 0) return webMid;
    const midIdx = Math.min(3, bCount - 1);
    const buyAmount = layers.slice(midIdx + 1).flat().reduce((s, p) => s + p, 0);
    return buyAmount > 0 ? buyAmount : webMid;
};

// Resize the web when capital changes so step density still matches available position size.
const adjustWeb = (webArr, webMid, amount = 0, force = false) => {
    if (amount === 0) {
        return {
            arr: webArr,
            mid: webMid,
        };
    }

    // Parse boundaries and layers first so maxAmount uses the exact buy-side price sum
    // rather than a webArr.length proxy (which breaks when calStair uses uniform band widths).
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

    const midIdx = Math.min(3, boundaries.length - 1);
    const buyAmount = layers.slice(midIdx + 1).flat().reduce((s, p) => s + p, 0);
    const maxAmount = buyAmount > 0 ? buyAmount : webMid;

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

    const sigmaProbs = [34.13, 13.59, 2.15];
    // Keep more steps near the midpoint because those σ bands carry most of the distribution mass.
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
    const keepCounts = layers.map((layer, i) => {
        if (layer.length === 0) return 0;
        return Math.min(layer.length, Math.max(1, Math.round(totalToKeep * weights[i] / totalWeight)));
    });
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

    // Reassemble the web with the original σ boundaries preserved and each layer thinned in place.
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

// Bitfinex quote precision helper.
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

// US quote precision helper.
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

// TWSE tick-size helper.
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

// Parse Macrotrends market-cap text and normalize K/M/B/T suffixes into raw dollar values.
export const parseMacrotrendsMarketCap = raw_data => {
    const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
    const $cap = $('div[id="main_content"]')
        .children('div').eq(1).children('span').first();
    let m;
    if ($cap.children('p').length > 0) {
        m = $cap.children('p').first().children('strong').first().text().trim().match(/^\$([\d\,]+\.?\d*)([a-zA-Z])?$/);
    } else {
        m = $cap.children('strong').first().text().trim().match(/^\$([\d\,]+\.?\d*)([a-zA-Z])?$/);
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

// Parse a single Macrotrends ratio card and return its numeric value.
export const parseMacrotrendsRatio = raw_data => {
    const $ = cheerio.load(Htmlparser.parseDOM(raw_data));
    const $r = $('div[id="main_content"]')
        .children('div').eq(1).children('span').first();
    let m;
    if ($r.children('p').length > 0) {
        m = $r.children('p').first().children('strong').first().text().trim().match(/\d+\.?\d*/);
    } else {
        m = $r.children('strong').first().text().trim().match(/\d+\.?\d*/);
    }
    return m ? Number(m[0]) : 9999;
};

// Fetch US quote data and fall back to Macrotrends when Yahoo omits valuation fields.
export const getUsStock = (index, stat = ['price'], single = false) => {
    const ret = {};
    let count = 0;
    const fetchPer = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/pe-ratio`).then(raw => { ret['per'] = parseMacrotrendsRatio(raw); });
    const fetchPbr = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/price-book`).then(raw => { ret['pbr'] = parseMacrotrendsRatio(raw); });
    const fetchEquity = idx => Api('url', `https://www.macrotrends.net/stocks/charts/${idx}/${idx}/net-worth`).then(raw => {
        const marketCap = parseMacrotrendsMarketCap(raw);
        ret['equity'] = (marketCap && ret['price']) ? marketCap / ret['price'] : 0;
    });
    const real = () => yahooFinance.quote(index).then(result => {
        if (!result) {
            log.warn({ index }, 'getUsStock result empty');
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
                // BRK-B is the Yahoo symbol, while Macrotrends expects BRK.B.
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
        log.debug({ index, count }, 'getUsStock attempt');
        return (single || (++count > _maxRetry)) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), _retryDelay));
    });
    return real();
}

// Return cached suggestion data for the requested market.
export const getSuggestionData = (type = 'twse') => suggestionData[type];

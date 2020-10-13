'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.calStair = exports.logArray = exports.stockTest = exports.stockProcess = exports.getStockListV2 = exports.stockShow = exports.stockStatus = exports.getSingleAnnual = exports.getStockList = exports.initXml = undefined;

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _constants = require('../constants');

var _htmlparser = require('htmlparser2');

var _htmlparser2 = _interopRequireDefault(_htmlparser);

var _fs = require('fs');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _xml2js = require('xml2js');

var _xml2js2 = _interopRequireDefault(_xml2js);

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _apiTool = require('./api-tool');

var _apiTool2 = _interopRequireDefault(_apiTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var StockTagTool = (0, _tagTool2.default)(_constants.STOCKDB);
var Xmlparser = new _xml2js2.default.Parser();

var stockFiltering = false;
var stockIntervaling = false;
var stockPredicting = false;

var show = function show(first, second) {
    var b = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 2;
    var a = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    return Math.ceil(first / second * Math.pow(10, b)) / Math.pow(10, a);
};

var caculateEven = function caculateEven(data, is_dot) {
    var dataSum = [];
    var dataEven = [];
    for (var i = 2; i < data.length; i++) {
        var Sum = 0;
        for (var j = 0; j <= i; j++) {
            Sum += data[j];
        }
        dataSum.push(Sum);
    }
    for (var _i in dataSum) {
        dataEven.push(is_dot ? show(dataSum[_i], Number(_i) + 3, 3, 3) : show(dataSum[_i], Number(_i) + 3, 0, 0));
    }
    return dataEven;
};

var caculateVariance = function caculateVariance(data, dataEven, is_dot) {
    var dataVariance = [];
    for (var i = 2; i < data.length; i++) {
        var Variance = 0;
        for (var j = 0; j <= i; j++) {
            Variance += (data[j] - dataEven[i - 2]) * (data[j] - dataEven[i - 2]);
        }
        dataVariance.push(is_dot ? show(Math.sqrt(Variance), 1, 3, 3) : show(Math.sqrt(Variance), 1, 0, 0));
    }
    return dataVariance;
};

var caculateRelativeLine = function caculateRelativeLine(data, dataEven, data2, data2Even, data2Variance) {
    var Relative = 0;
    for (var i = 0; i < data2.length; i++) {
        Relative += (data[i] - dataEven[data2Even.length - 1]) * (data2[i] - data2Even[data2Even.length - 1]);
    }
    var b = Relative / data2Variance[data2Even.length - 1] / data2Variance[data2Even.length - 1];
    var a = dataEven[dataEven.length - 1] - b * data2Even[data2Even.length - 1];
    return { a: a, b: b };
};

var getXmlDate = function getXmlDate(xml, name, index) {
    if (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['$'] && xml.xbrl[name][index]['$'].contextRef) {
        var result = xml.xbrl[name][index]['$'].contextRef.match(/^AsOf(\d\d\d\d)(\d\d)\d\d$/);
        if (!result) {
            result = xml.xbrl[name][index]['$'].contextRef.match(/^From\d\d\d\d01\d\dTo(\d\d\d\d)(\d\d)\d\d$/);
            if (!result) {
                return false;
            }
        }
        var year = Number(result[1]);
        var quarter = 0;
        if (result[2] === '01') {
            quarter = 4;
            year--;
        } else if (result[2] === '03') {
            quarter = 1;
        } else if (result[2] === '06') {
            quarter = 2;
        } else if (result[2] === '09') {
            quarter = 3;
        } else if (result[2] === '12') {
            quarter = 4;
        } else {
            return false;
        }
        return { year: year, quarter: quarter };
    } else {
        return false;
    }
};

//const getParameter = (xml, name, index) => (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['_']) ? Number(xml.xbrl[name][index]['_']) : 0;

var getParameter = function getParameter(xml, name, index) {
    if (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['_']) {
        var ret = 0;
        if (Number(xml.xbrl[name][index]['_']) === Number(xml.xbrl[name][index]['_'])) {
            ret = Number(xml.xbrl[name][index]['_']);
        } else {
            var num = xml.xbrl[name][index]['_'].match(/\d+/g);
            ret = num ? num.reduce(function (a, n) {
                return a * 1000 + +n;
            }, 0) : 0;
        }
        return xml.xbrl[name][index]['$'] && xml.xbrl[name][index]['$']['scale'] > 0 ? ret * Math.pow(10, xml.xbrl[name][index]['$']['scale']) : ret;
    } else {
        return 0;
    }
};

var quarterIsEmpty = function quarterIsEmpty(quarter) {
    if (!quarter) {
        return true;
    }
    for (var i in quarter) {
        if (quarter[i]) {
            return false;
        }
    }
    return true;
};

var getStockPrice = function getStockPrice(type, index) {
    var price_only = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

    var _ret = function () {
        switch (type) {
            case 'twse':
                var count = 0;
                var real = function real() {
                    return (0, _apiTool2.default)('url', 'https://tw.stock.yahoo.com/q/q?s=' + index).then(function (raw_data) {
                        var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'table')[1], 'tr')[0], 'td')[0], 'table')[0];
                        if (!table) {
                            return (0, _utility.handleError)(new _utility.HoError('stock ' + index + ' price get fail'));
                        }
                        var price = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[1], 'td')[2], 'b')[0])[0].match(/^(\d+(\.\d+)?|\-)/);
                        if (!price || !price[0]) {
                            console.log(raw_data);
                            return (0, _utility.handleError)(new _utility.HoError('stock ' + index + ' price get fail'));
                        }
                        if (price[0] === '-') {
                            var last_price = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[1], 'td')[5], 'font')[0], 'td')[1])[0].match(/^(\d+(\.\d+)?|\-)/);
                            if (!last_price || !last_price[0]) {
                                return (0, _utility.handleError)(new _utility.HoError('stock ' + index + ' price get fail'));
                            }
                            if (price[0] === '-') {
                                last_price[0] = 0;
                            }
                            price[0] = last_price[0];
                        }
                        price[0] = +price[0];
                        if (!price_only) {
                            var up = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[1], 'td')[5], 'font')[0])[0].match(/^(.?\d+(\.\d+)?|\-)/);
                            if (up && up[0]) {
                                price[0] = price[0] + ' ' + up[0];
                            }
                        }
                        console.log(price[0]);
                        return price[0];
                    }).catch(function (err) {
                        console.log(count);
                        return ++count > _constants.MAX_RETRY ? (0, _utility.handleError)(err) : new _promise2.default(function (resolve, reject) {
                            return setTimeout(function () {
                                return resolve(real());
                            }, count * 1000);
                        });
                    });
                };
                return {
                    v: real()
                };
                break;
            case 'usse':
                return {
                    v: getUsStock(index).then(function (ret) {
                        console.log(ret.price);
                        return ret.price;
                    })
                };
                break;
            default:
                return {
                    v: (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'))
                };
        }
    }();

    if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
};

var getEPS = function getEPS(sales) {
    var year = new Date().getFullYear();
    while (!sales[year] && year > 2000) {
        year--;
    }
    var eps = 0;
    var start = '';
    for (var i = 3; i >= 0; i--) {
        if (sales[year][i]) {
            if (i === 3) {
                start = (0, _utility.completeZero)(12, 2);
                eps = sales[year][i].eps;
                break;
            } else {
                if (sales[year - 1] && sales[year - 1][3] && sales[year - 1][i]) {
                    start = (0, _utility.completeZero)((i + 1) * 3, 2);
                    eps = sales[year][i].eps + sales[year - 1][3].eps - sales[year - 1][i].eps;
                    break;
                }
            }
        }
    }
    console.log(eps);
    return {
        eps: eps,
        start: '' + year + start
    };
};

var getCashStatus = function getCashStatus(cash, asset) {
    var cashStatus = {};
    for (var i in cash) {
        for (var j in cash[i]) {
            if (cash[i][j]) {
                //去除差異太大的
                if ((j === '1' || j === '2' || j === '3') && cash[i][j - 1] || j === '0') {
                    if (!cashStatus[i]) {
                        cashStatus[i] = [];
                    }
                    cashStatus[i][j] = {
                        end: cash[i][j].end,
                        begin: show(cash[i][j].begin, cash[i][j].end)
                    };
                    if (j === '0') {
                        cashStatus[i][j].profitBT = show(cash[i][j].profitBT, cash[i][j].end);
                        cashStatus[i][j].real = show(cash[i][j].change, cash[i][j].end);
                        cashStatus[i][j].operation = show(cash[i][j].operation, cash[i][j].end);
                        cashStatus[i][j].invest = show(cash[i][j].invest, cash[i][j].end);
                        cashStatus[i][j].dividends = show(cash[i][j].dividends, cash[i][j].end);
                        cashStatus[i][j].without_dividends = show(cash[i][j].finance - cash[i][j].dividends, cash[i][j].end);
                        cashStatus[i][j].minor = show(cash[i][j].change - cash[i][j].operation - cash[i][j].invest - cash[i][j].finance, cash[i][j].end);
                        cashStatus[i][j].investPerProperty = show(cash[i][j].operation, asset[i][j].property);
                        cashStatus[i][j].financePerLiabilities = show(cash[i][j].finance - cash[i][j].dividends, asset[i][j].current_liabilities + asset[i][j].noncurrent_liabilities);
                    } else {
                        cashStatus[i][j].profitBT = show(cash[i][j].profitBT - cash[i][j - 1].profitBT, cash[i][j].end);
                        cashStatus[i][j].real = show(cash[i][j].change - cash[i][j - 1].change, cash[i][j].end);
                        cashStatus[i][j].operation = show(cash[i][j].operation - cash[i][j - 1].operation, cash[i][j].end);
                        cashStatus[i][j].invest = show(cash[i][j].invest - cash[i][j - 1].invest, cash[i][j].end);
                        cashStatus[i][j].dividends = show(cash[i][j].dividends - cash[i][j - 1].dividends, cash[i][j].end);
                        cashStatus[i][j].without_dividends = show(cash[i][j].finance - cash[i][j].dividends - (cash[i][j - 1].finance - cash[i][j - 1].dividends), cash[i][j].end);
                        cashStatus[i][j].minor = show(cash[i][j].change - cash[i][j].operation - cash[i][j].invest - cash[i][j].finance - (cash[i][j - 1].change - cash[i][j - 1].operation - cash[i][j - 1].invest - cash[i][j - 1].finance), cash[i][j].end);
                        cashStatus[i][j].investPerProperty = show(cash[i][j].operation - cash[i][j - 1].operation, asset[i][j].property);
                        cashStatus[i][j].financePerLiabilities = show(cash[i][j].finance - cash[i][j].dividends - (cash[i][j - 1].finance - cash[i][j - 1].dividends), asset[i][j].current_liabilities + asset[i][j].noncurrent_liabilities);
                    }
                }
            }
        }
    }
    return cashStatus;
};

var getSalesStatus = function getSalesStatus(sales, asset) {
    var salesStatus = {};
    for (var i in sales) {
        for (var j in sales[i]) {
            if (sales[i][j]) {
                //去除差異太大的
                if ((j === '1' || j === '2' || j === '3') && sales[i][j - 1] || j === '0') {
                    if (!sales[i][j].revenue || sales[i][j].revenue < 0) {
                        sales[i][j].revenue = sales[i][j].profit ? Math.abs(sales[i][j].profit / 100000) : 1000;
                    }
                    if (!salesStatus[i]) {
                        salesStatus[i] = [];
                    }
                    salesStatus[i][j] = {
                        revenue: sales[i][j].revenue,
                        cost: show(sales[i][j].cost, sales[i][j].revenue, 3, 1),
                        expenses: show(sales[i][j].expenses, sales[i][j].revenue, 3, 1),
                        finance_cost: show(sales[i][j].finance_cost, sales[i][j].revenue, 3, 1),
                        nonoperating_without_FC: show(sales[i][j].nonoperating + sales[i][j].finance_cost, sales[i][j].revenue, 3, 1),
                        tax: show(sales[i][j].tax, sales[i][j].revenue, 3, 1),
                        comprehensive: show(sales[i][j].comprehensive, sales[i][j].revenue, 3, 1),
                        profit: show(sales[i][j].profit, sales[i][j].revenue, 3, 1),
                        profit_comprehensive: show(sales[i][j].profit + sales[i][j].comprehensive, sales[i][j].revenue, 3, 1),
                        eps: sales[i][j].eps
                    };
                    if (j === '0') {
                        salesStatus[i][j].quarterRevenue = sales[i][j].revenue;
                        salesStatus[i][j].quarterGross = show(sales[i][j].gross_profit, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterOperating = show(sales[i][j].operating, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterProfit = show(sales[i][j].profit, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterTax = show(sales[i][j].tax, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterEPS = sales[i][j].eps;
                    } else {
                        salesStatus[i][j].quarterRevenue = sales[i][j].revenue - sales[i][j - 1].revenue;
                        /*if (!salesStatus[i][j].quarterRevenue || salesStatus[i][j].quarterRevenue < 0) {
                            salesStatus[i][j].quarterRevenue = sales[i][j].profit ? (sales[i][j - 1].profit && (sales[i][j].profit - sales[i][j - 1].profit)) ? Math.abs((sales[i][j].profit - sales[i][j - 1].profit) / 100000) : Math.abs(sales[i][j].profit / 100000) : 1000;
                        }*/
                        if (!salesStatus[i][j].quarterRevenue) {
                            salesStatus[i][j].quarterRevenue = 1000;
                        }
                        salesStatus[i][j].quarterGross = show(sales[i][j].gross_profit - sales[i][j - 1].gross_profit, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterOperating = show(sales[i][j].operating - sales[i][j - 1].operating, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterProfit = show(sales[i][j].profit - sales[i][j - 1].profit, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterTax = show(sales[i][j].tax - sales[i][j - 1].tax, salesStatus[i][j].quarterRevenue, 3, 1);
                        salesStatus[i][j].quarterEPS = show(sales[i][j].eps - sales[i][j - 1].eps, 1, 3, 3);
                    }
                    salesStatus[i][j].salesPerAsset = show(sales[i][j].revenue, asset[i][j].total, 3, 1);
                    salesStatus[i][j].quarterSalesPerAsset = show(salesStatus[i][j].quarterRevenue, asset[i][j].total, 3, 3);
                }
            }
        }
    }
    return salesStatus;
};

var getAssetStatus = function getAssetStatus(asset) {
    var assetStatus = {};
    for (var i in asset) {
        for (var j in asset[i]) {
            if (asset[i][j]) {
                //去除差異太大的
                if ((j === '1' || j === '2' || j === '3') && asset[i][j - 1] || j === '0') {
                    if (!assetStatus[i]) {
                        assetStatus[i] = [];
                    }
                    if (!asset[i][j].property) {
                        asset[i][j].property = asset[i][j].total / 100000;
                    }
                    assetStatus[i][j] = {
                        total: asset[i][j].total,
                        receivable: show(asset[i][j].receivable, asset[i][j].total, 3, 1),
                        cash: show(asset[i][j].cash, asset[i][j].total, 3, 1),
                        inventories: show(asset[i][j].inventories, asset[i][j].total, 3, 1),
                        property: show(asset[i][j].property, asset[i][j].total, 3, 1),
                        longterm: show(asset[i][j].longterm, asset[i][j].total, 3, 1),
                        other: show(asset[i][j].total - asset[i][j].cash - asset[i][j].inventories - asset[i][j].receivable - asset[i][j].property - asset[i][j].longterm, asset[i][j].total, 3, 1),
                        equityChild: show(asset[i][j].equityChild, asset[i][j].total, 3, 1),
                        equityParent: show(asset[i][j].equityParent, asset[i][j].total, 3, 1),
                        noncurrent_liabilities: show(asset[i][j].noncurrent_liabilities, asset[i][j].total, 3, 1),
                        current_liabilities_without_payable: show(asset[i][j].current_liabilities - asset[i][j].payable, asset[i][j].total, 3, 1),
                        payable: show(asset[i][j].payable, asset[i][j].total, 3, 1)
                    };
                }
            }
        }
    }
    return assetStatus;
};

var getProfitStatus = function getProfitStatus(salesStatus, cashStatus, asset) {
    var profitStatus = {};
    for (var i in salesStatus) {
        profitStatus[i] = [];
        for (var j in salesStatus[i]) {
            profitStatus[i][j] = {
                gross_profit: salesStatus[i][j].quarterGross,
                operating_profit: salesStatus[i][j].quarterOperating,
                profit: salesStatus[i][j].quarterProfit,
                turnover: salesStatus[i][j].quarterSalesPerAsset,
                leverage: show(asset[i][j].equityParent + asset[i][j].equityChild, asset[i][j].total, 3, 3),
                asset_growth: show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterSalesPerAsset, 1, 3, 3),
                roe: show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterSalesPerAsset * (asset[i][j].total / (asset[i][j].equityParent + asset[i][j].equityChild)), 1, 3, 3),
                operatingP: show(cashStatus[i][j].operation * cashStatus[i][j].end, salesStatus[i][j].quarterRevenue, 1, 1),
                operationAG: show(cashStatus[i][j].operation * cashStatus[i][j].end, asset[i][j].total, 3, 3),
                operationRoe: show(cashStatus[i][j].operation * cashStatus[i][j].end * (asset[i][j].total / (asset[i][j].equityParent + asset[i][j].equityChild)), asset[i][j].total, 3, 3),
                oiP: show((cashStatus[i][j].operation + cashStatus[i][j].invest) * cashStatus[i][j].end, salesStatus[i][j].quarterRevenue, 1, 1),
                oiAG: show((cashStatus[i][j].operation + cashStatus[i][j].invest) * cashStatus[i][j].end, asset[i][j].total, 3, 3),
                oiRoe: show((cashStatus[i][j].operation + cashStatus[i][j].invest) * cashStatus[i][j].end * (asset[i][j].total / (asset[i][j].equityParent + asset[i][j].equityChild)), asset[i][j].total, 3, 3),
                realP: show(cashStatus[i][j].real * cashStatus[i][j].end, salesStatus[i][j].quarterRevenue, 1, 1),
                realAG: show(cashStatus[i][j].real * cashStatus[i][j].end, asset[i][j].total, 3, 3),
                realRoe: show(cashStatus[i][j].real * cashStatus[i][j].end * (asset[i][j].total / (asset[i][j].equityParent + asset[i][j].equityChild)), asset[i][j].total, 3, 3),
                realP_dividends: show((cashStatus[i][j].real - cashStatus[i][j].dividends) * cashStatus[i][j].end, salesStatus[i][j].quarterRevenue, 1, 1),
                realAG_dividends: show((cashStatus[i][j].real - cashStatus[i][j].dividends) * cashStatus[i][j].end, asset[i][j].total, 3, 3),
                realRoe_dividends: show((cashStatus[i][j].real - cashStatus[i][j].dividends) * cashStatus[i][j].end * (asset[i][j].total / (asset[i][j].equityParent + asset[i][j].equityChild)), asset[i][j].total, 3, 3),
                salesPerShare: show(salesStatus[i][j].quarterRevenue, salesStatus[i][j].quarterEPS, 0, 0),
                quarterSales: salesStatus[i][j].quarterRevenue
            };
        }
    }
    return profitStatus;
};

var getSafetyStatus = function getSafetyStatus(salesStatus, cashStatus, asset) {
    var safetyStatus = {};
    var length = 0;
    for (var i in salesStatus) {
        length++;
    }
    for (var _i2 in salesStatus) {
        if (length <= 5) {
            safetyStatus[_i2] = [];
            for (var j in salesStatus[_i2]) {
                safetyStatus[_i2][j] = {
                    prMinusProfit: Math.ceil(asset[_i2][j].payable / asset[_i2][j].receivable * 1000 - 1000 + salesStatus[_i2][j].quarterProfit * 10) / 10,
                    prRatio: show(asset[_i2][j].payable, asset[_i2][j].receivable, 3, 1),
                    shortCash: show(asset[_i2][j].receivable - asset[_i2][j].payable * 2 + asset[_i2][j].current_liabilities - salesStatus[_i2][j].quarterProfit * asset[_i2][j].receivable / 100 - cashStatus[_i2][j].invest * cashStatus[_i2][j].end / 100, asset[_i2][j].cash, 3, 1),
                    shortCashWithoutCL: show(asset[_i2][j].receivable - asset[_i2][j].payable - salesStatus[_i2][j].quarterProfit * asset[_i2][j].receivable / 100 - cashStatus[_i2][j].invest * cashStatus[_i2][j].end / 100, asset[_i2][j].cash, 3, 1),
                    shortCashWithoutInvest: show(asset[_i2][j].receivable - asset[_i2][j].payable * 2 + asset[_i2][j].current_liabilities - salesStatus[_i2][j].quarterProfit * asset[_i2][j].receivable / 100, asset[_i2][j].cash, 3, 1)
                };
            }
        }
        length--;
    }
    return safetyStatus;
};

var getManagementStatus = function getManagementStatus(salesStatus, asset) {
    var managementStatus = {};
    var revenue = [];
    var profit = [];
    var cash = [];
    var inventories = [];
    var receivable = [];
    var payable = [];
    var startY = 0;
    var startQ = 0;
    var realY = 0;
    var realQ = 0;
    for (var i in salesStatus) {
        for (var j in salesStatus[i]) {
            if (salesStatus[i][j - 1]) {
                if (!startY && !startQ) {
                    startY = i;
                    startQ = j;
                }
                revenue.push(salesStatus[i][j].quarterRevenue);
                profit.push(show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterRevenue, 1, 0, 2));
                cash.push(asset[i][j].cash);
                inventories.push(asset[i][j].inventories);
                receivable.push(asset[i][j].receivable);
                payable.push(asset[i][j].payable);
                if (!managementStatus[i]) {
                    managementStatus[i] = [];
                }
                managementStatus[i][j] = {
                    revenue: salesStatus[i][j].quarterRevenue,
                    profit: show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterRevenue, 1, 0, 2),
                    cash: asset[i][j].cash,
                    inventories: asset[i][j].inventories,
                    receivable: asset[i][j].receivable,
                    payable: asset[i][j].payable,
                    share: asset[i][j].share
                };
            } else if (j === '0') {
                if (!startY && !startQ) {
                    startY = i;
                    startQ = j;
                }
                revenue.push(salesStatus[i][j].quarterRevenue);
                profit.push(show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterRevenue, 1, 0, 2));
                cash.push(asset[i][j].cash);
                inventories.push(asset[i][j].inventories);
                receivable.push(asset[i][j].receivable);
                payable.push(asset[i][j].payable);
                if (!managementStatus[i]) {
                    managementStatus[i] = [];
                }
                managementStatus[i][j] = {
                    revenue: salesStatus[i][j].quarterRevenue,
                    profit: show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterRevenue, 1, 0, 2),
                    cash: asset[i][j].cash,
                    inventories: asset[i][j].inventories,
                    receivable: asset[i][j].receivable,
                    payable: asset[i][j].payable,
                    share: asset[i][j].share
                };
            } else {
                startY = 0;
                startQ = 0;
                revenue = [];
                profit = [];
                cash = [];
                inventories = [];
                receivable = [];
                payable = [];
            }
        }
    }
    realY = Number(startY);
    realQ = Number(startQ);
    if (startQ === '0') {
        startQ = 2;
        startY = Number(startY);
    } else if (startQ === '2') {
        startQ = 0;
        startY = Number(startY) + 1;
    } else if (startQ === '3') {
        startQ = 1;
        startY = Number(startY) + 1;
    } else {
        return false;
    }

    var revenueEven = caculateEven(revenue);
    var revenueVariance = caculateVariance(revenue, revenueEven);
    var profitEven = caculateEven(profit);
    var profitVariance = caculateVariance(profit, profitEven);
    var cashEven = caculateEven(cash);
    var cashVariance = caculateVariance(cash, cashEven);
    var inventoriesEven = caculateEven(inventories);
    var inventoriesVariance = caculateVariance(inventories, inventoriesEven);
    var receivableEven = caculateEven(receivable);
    var receivableVariance = caculateVariance(receivable, receivableEven);
    var payableEven = caculateEven(payable);
    var payableVariance = caculateVariance(payable, payableEven);

    var revenueRelative = function revenueRelative(data, dataEven, dataVariance, dataRelative) {
        var Y = startY;
        var Q = startQ;
        var Relative = 0;
        var bY = realY;
        var bQ = realQ;
        for (var _i3 = 0; _i3 < 8; _i3++) {
            if (bQ > 3) {
                bQ = 0;
                bY++;
            }
            if (managementStatus[bY] && managementStatus[bY][bQ]) {
                managementStatus[bY][bQ][dataRelative] = 0;
            }
            bQ++;
        }
        for (var _i4 = 2; _i4 < revenue.length; _i4++) {
            if (Q > 3) {
                Q = 0;
                Y++;
            }
            if (managementStatus[Y][Q]) {
                Relative = 0;
                for (var _j = 0; _j <= _i4; _j++) {
                    Relative += (revenue[_j] - revenueEven[_i4 - 2]) * (data[_j] - dataEven[_i4 - 2]);
                }
                if (dataVariance[_i4 - 2] && revenueVariance[_i4 - 2]) {
                    managementStatus[Y][Q][dataRelative] = show(Relative, dataVariance[_i4 - 2] * revenueVariance[_i4 - 2], 3, 3);
                } else {
                    managementStatus[Y][Q][dataRelative] = 0;
                }
                if (dataRelative === 'profitRelative') {
                    managementStatus.b = Relative / revenueVariance[_i4 - 2] / revenueVariance[_i4 - 2];
                    managementStatus.a = dataEven[_i4 - 2] - managementStatus.b * revenueEven[_i4 - 2];
                }
            } else {
                _i4--;
            }
            Q++;
        }
    };

    revenueRelative(profit, profitEven, profitVariance, 'profitRelative');
    revenueRelative(cash, cashEven, cashVariance, 'cashRelative');
    revenueRelative(inventories, inventoriesEven, inventoriesVariance, 'inventoriesRelative');
    revenueRelative(receivable, receivableEven, receivableVariance, 'receivableRelative');
    revenueRelative(payable, payableEven, payableVariance, 'payableRelative');

    return managementStatus;
};

var getProfitIndex = function getProfitIndex(profitStatus, startYear, endYear) {
    if (endYear - 4 > startYear) {
        startYear = endYear - 4;
    }
    var index = 0;
    var denominator = 1;
    for (var i = endYear; i >= startYear; i--) {
        for (var j = 3; j >= 0; j--) {
            if (profitStatus[i] && profitStatus[i][j]) {
                index += (profitStatus[i][j].profit * 3 + profitStatus[i][j].operating_profit * 2 + profitStatus[i][j].gross_profit) * profitStatus[i][j].turnover / profitStatus[i][j].leverage / denominator;
                denominator++;
            }
        }
    }
    return Math.ceil(index * 1000) / 1000;
};

var getSafetyIndex = function getSafetyIndex(safetyStatus) {
    var index = 0;
    var multiple = 0;
    for (var i in safetyStatus) {
        for (var j in safetyStatus[i]) {
            multiple++;
            index += (safetyStatus[i][j].shortCash + safetyStatus[i][j].shortCashWithoutCL + safetyStatus[i][j].shortCashWithoutInvest) * multiple;
        }
    }
    return -Math.ceil(index / (1 + multiple) / multiple * 2000) / 1000;
};

var getManagementIndex = function getManagementIndex(managementStatus, year, quarter) {
    var real_year = year;
    if (managementStatus) {
        while ((!managementStatus[real_year] || !managementStatus[real_year][quarter - 1]) && real_year > year - 5) {
            if (quarter === 1) {
                quarter = 4;
                real_year--;
            } else {
                quarter--;
            }
        }
        return !managementStatus[real_year] || !managementStatus[real_year][quarter - 1] ? -10 : show(managementStatus[real_year][quarter - 1].profitRelative + managementStatus[real_year][quarter - 1].cashRelative + managementStatus[real_year][quarter - 1].inventoriesRelative + managementStatus[real_year][quarter - 1].receivableRelative + managementStatus[real_year][quarter - 1].payableRelative, 1, 3, 3);
    } else {
        return -10;
    }
};

var initXml = exports.initXml = function initXml(filelocation) {
    return new _promise2.default(function (resolve, reject) {
        return (0, _fs.readFile)(filelocation, 'utf8', function (err, data) {
            return err ? reject(err) : resolve(data);
        });
    }).then(function (data) {
        return new _promise2.default(function (resolve, reject) {
            return Xmlparser.parseString(data, function (err, result) {
                if (err) {
                    console.log(err.code);
                    console.log(err.message);
                    console.log(data);
                    return reject(err);
                } else {
                    if (result.html) {
                        var _ret2 = function () {
                            var ixbrl = { xbrl: {} };
                            var enumerate = function enumerate(obj) {
                                for (var o in obj) {
                                    if ((0, _typeof3.default)(obj[o]) === 'object') {
                                        if (o.match(/^ix\:/)) {
                                            for (var j in obj[o]) {
                                                if (obj[o][j]['$'] && obj[o][j]['$']['name'].match(/^(tifrs|ifrs)/)) {
                                                    if (!ixbrl['xbrl'][obj[o][j]['$']['name']]) {
                                                        ixbrl['xbrl'][obj[o][j]['$']['name']] = [obj[o][j]];
                                                    } else {
                                                        ixbrl['xbrl'][obj[o][j]['$']['name']].push(obj[o][j]);
                                                    }
                                                }
                                            }
                                        }
                                        enumerate(obj[o]);
                                    }
                                }
                            };
                            enumerate(result.html.body);
                            return {
                                v: resolve(ixbrl)
                            };
                        }();

                        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                    } else {
                        return resolve(result);
                    }
                }
            });
        });
    });
};

var getCashflow = function getCashflow(xml, cash, no_cover) {
    if (!xml.xbrl) {
        for (var i in xml) {
            xml.xbrl = xml[i];
            break;
        }
        if (!xml.xbrl) {
            console.log('xml lost');
            return false;
        }
    }
    if (!cash) {
        cash = {};
    }
    var year = 0;
    var quarter = 0;
    var type = 0;
    var xmlDate = {};
    if (xml.xbrl['tifrs-notes:Year']) {
        type = 1;
        year = Number(xml.xbrl['tifrs-notes:Year'][0]['_']);
        quarter = Number(xml.xbrl['tifrs-notes:Quarter'][0]['_']);
    } else {
        if (xmlDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ar:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
            if (year === 2010 && quarter === 1 && (xml.xbrl.context[0].entity[0].identifier[0]['_'] === '5315' || xml.xbrl.context[0].entity[0].identifier[0]['_'] === '6148')) {
                return cash;
            }
        } else {
            console.log('umknown date');
            return false;
        }
    }
    var califrsCash = function califrsCash(ci, no_cover) {
        var xmlDate = {};
        if (xmlDate = getXmlDate(xml, 'tifrs-SCF:ProfitLossBeforeTax', ci)) {
            var y = xmlDate.year;
            var q = xmlDate.quarter - 1;
            var parseResult = null;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tifrs-SCF:ProfitLossBeforeTax', ci),
                    operation: getParameter(xml, 'ifrs:CashFlowsFromUsedInOperatingActivities', ci),
                    invest: getParameter(xml, 'tifrs-SCF:NetCashFlowsFromUsedInInvestingActivities', ci),
                    finance: getParameter(xml, 'tifrs-SCF:CashFlowsFromUsedInFinancingActivities', ci),
                    dividends: getParameter(xml, 'tifrs-SCF:CashDividendsPaid', ci),
                    change: getParameter(xml, 'ifrs:IncreaseDecreaseInCashAndCashEquivalents', ci),
                    begin: getParameter(xml, 'tifrs-SCF:CashAndCashEquivalentsAtBeginningOfPeriod', ci),
                    end: getParameter(xml, 'tifrs-SCF:CashAndCashEquivalentsAtEndOfPeriod', ci)
                };
            }
            if (!quarterIsEmpty(parseResult)) {
                if (!cash[y]) {
                    cash[y] = [];
                }
                cash[y][q] = parseResult;
            }
        } else {
            return false;
        }
        return xmlDate;
    };
    var calgaapCash = function calgaapCash(ci, no_cover) {
        var xmlDate = {};
        var cashBegin = 0;
        var cashEnd = 0;
        var bq = 0;
        var eq = 5;
        var i = 0;
        var parseResult = null;
        var y = 0;
        var q = 0;
        if ((xmlDate = getXmlDate(xml, 'tw-gaap-ci:ConsolidatedTotalIncome_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ci:NetIncomeLoss_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ci:ConsolidatedTotalIncome', ci))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-ci:ConsolidatedTotalIncome', ci) + getParameter(xml, 'tw-gaap-ci:ConsolidatedTotalIncome_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ci:NetIncomeLoss_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ci:IncomeTaxExpenseBenefit', ci),
                    operation: getParameter(xml, 'tw-gaap-ci:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-ci:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-ci:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-ci:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-ci:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var cashDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        var _temp = getParameter(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                        if (_temp && cashDate.quarter < eq) {
                            cashEnd = _temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === y - 1) {
                        var _temp2 = getParameter(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                        if (_temp2 && cashDate.quarter > bq) {
                            cashBegin = _temp2;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:CurrentConsolidatedTotalIncome', ci)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-fh:CurrentConsolidatedTotalIncome', ci) - getParameter(xml, 'tw-gaap-fh:IncomeTaxExpenseBenefit', ci),
                    operation: getParameter(xml, 'tw-gaap-fh:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-fh:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-fh:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-fh:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-fh:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var _cashDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                while (_cashDate) {
                    if (_cashDate.year === y) {
                        var _temp3 = getParameter(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                        if (_temp3 && _cashDate.quarter < eq) {
                            cashEnd = _temp3;
                            eq = _cashDate.quarter;
                        }
                    } else if (_cashDate.year === y - 1) {
                        var _temp4 = getParameter(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                        if (_temp4 && _cashDate.quarter > bq) {
                            cashBegin = _temp4;
                            bq = _cashDate.quarter;
                        }
                    }
                    i++;
                    _cashDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                }
            }
        } else if ((xmlDate = getXmlDate(xml, 'tw-gaap-basi:ConsolidatedTotalIncome_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-basi:NetIncomeLoss_StatementCashFlows', ci))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-basi:ConsolidatedTotalIncome_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-basi:NetIncomeLoss_StatementCashFlows', ci) - getParameter(xml, 'tw-gaap-basi:IncomeTaxExpenseBenefitContinuingOperations', ci),
                    operation: getParameter(xml, 'tw-gaap-basi:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-basi:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-basi:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-basi:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-basi:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var _cashDate2 = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                while (_cashDate2) {
                    if (_cashDate2.year === y) {
                        var _temp5 = getParameter(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                        if (_temp5 && _cashDate2.quarter < eq) {
                            cashEnd = _temp5;
                            eq = _cashDate2.quarter;
                        }
                    } else if (_cashDate2.year === y - 1) {
                        var _temp6 = getParameter(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                        if (_temp6 && _cashDate2.quarter > bq) {
                            cashBegin = _temp6;
                            bq = _cashDate2.quarter;
                        }
                    }
                    i++;
                    _cashDate2 = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:ConsolidatedTotalIncome-CashFlowStatement', ci)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-mim:ConsolidatedTotalIncome-CashFlowStatement', ci) + getParameter(xml, 'tw-gaap-mim:IncomeTaxExpenses', ci),
                    operation: getParameter(xml, 'tw-gaap-mim:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-mim:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-mim:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-mim:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-mim:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var _cashDate3 = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                while (_cashDate3) {
                    if (_cashDate3.year === y) {
                        var _temp7 = getParameter(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                        if (_temp7 && _cashDate3.quarter < eq) {
                            cashEnd = _temp7;
                            eq = _cashDate3.quarter;
                        }
                    } else if (_cashDate3.year === y - 1) {
                        temp = getParameter(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                        if (temp && _cashDate3.quarter > bq) {
                            cashBegin = temp;
                            bq = _cashDate3.quarter;
                        }
                    }
                    i++;
                    _cashDate3 = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                }
            }
        } else if ((xmlDate = getXmlDate(xml, 'tw-gaap-bd:ConsolidatedTotalIncome_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-bd:NetIncomeLoss-CashFlowStatement', ci))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-bd:NetIncomeLoss-CashFlowStatement', ci) + getParameter(xml, 'tw-gaap-bd:ConsolidatedTotalIncome_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-bd:IncomeTaxExpense', ci),
                    operation: getParameter(xml, 'tw-gaap-bd:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-bd:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-bd:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-bd:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-bd:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var _cashDate4 = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                while (_cashDate4) {
                    if (_cashDate4.year === y) {
                        var _temp8 = getParameter(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                        if (_temp8 && _cashDate4.quarter < eq) {
                            cashEnd = _temp8;
                            eq = _cashDate4.quarter;
                        }
                    } else if (_cashDate4.year === y - 1) {
                        var _temp9 = getParameter(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                        if (_temp9 && _cashDate4.quarter > bq) {
                            cashBegin = _temp9;
                            bq = _cashDate4.quarter;
                        }
                    }
                    i++;
                    _cashDate4 = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                }
            }
        } else if ((xmlDate = getXmlDate(xml, 'tw-gaap-ins:ConsolidatedTotalIncome_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLoss_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLoss-StatementCashFlows', ci))) {
            var _y = xmlDate.year;
            var _q = xmlDate.quarter - 1;
            if (!cash[_y] || !cash[_y][_q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-ins:ConsolidatedTotalIncome_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ins:NetIncomeLoss_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ins:IncomeTaxExpenseBenefit', ci) + getParameter(xml, 'tw-gaap-ins:NetIncomeLoss-StatementCashFlows', ci),
                    operation: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-ins:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-ins:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0
                };
                var _cashDate5 = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                while (_cashDate5) {
                    if (_cashDate5.year === _y) {
                        var _temp10 = getParameter(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                        if (_temp10 && _cashDate5.quarter < eq) {
                            cashEnd = _temp10;
                            eq = _cashDate5.quarter;
                        }
                    } else if (_cashDate5.year === _y - 1) {
                        var _temp11 = getParameter(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                        if (_temp11 && _cashDate5.quarter > bq) {
                            cashBegin = _temp11;
                            bq = _cashDate5.quarter;
                        }
                    }
                    i++;
                    _cashDate5 = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                }
            }
        } else {
            return false;
        }
        if (!quarterIsEmpty(parseResult)) {
            if (cashBegin && cashEnd || parseResult.change) {
                parseResult.begin = cashBegin;
                parseResult.end = cashEnd;
                if (!cash[y]) {
                    cash[y] = [];
                }
                cash[y][q] = parseResult;
            } else {
                parseResult = null;
            }
        }
        return xmlDate;
    };
    var isOk = false;
    for (var _i5 = 0; _i5 < 4; _i5++) {
        if (type === 1) {
            if (xmlDate = califrsCash(_i5, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapCash(_i5, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        }
    }
    if (!isOk) {
        console.log('unknown finance data');
        return false;
    }
    return cash;
};

var getAsset = function getAsset(xml, asset, no_cover) {
    if (!xml.xbrl) {
        for (var i in xml) {
            xml.xbrl = xml[i];
            break;
        }
        if (!xml.xbrl) {
            console.log('xml lost');
            return false;
        }
    }
    if (!asset) {
        asset = {};
    }
    var year = 0;
    var quarter = 0;
    var type = 0;
    var xmlDate = {};
    if (xml.xbrl['tifrs-notes:Year']) {
        type = 1;
        year = Number(xml.xbrl['tifrs-notes:Year'][0]['_']);
        quarter = Number(xml.xbrl['tifrs-notes:Quarter'][0]['_']);
    } else {
        if (xmlDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ar:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
            if (year === 2010 && quarter === 1 && (xml.xbrl.context[0].entity[0].identifier[0]['_'] === '5315' || xml.xbrl.context[0].entity[0].identifier[0]['_'] === '6148')) {
                return asset;
            }
        } else {
            console.log('umknown date');
            return false;
        }
    }
    var califrsAsset = function califrsAsset(ai, no_cover) {
        var xmlDate = {};
        var y = 0;
        var q = 0;
        var parseResult = null;
        if (xmlDate = getXmlDate(xml, 'tifrs-bsci-ci:CapitalStock', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-ci:AccountsReceivableNet', ai) + getParameter(xml, 'tifrs-bsci-ci:OtherReceivables', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesReceivableNet', ai) + getParameter(xml, 'tifrs-bsci-ci:ConstructionContractsReceivable', ai) + getParameter(xml, 'tifrs-bsci-ci:Prepayments', ai),
                    payable: getParameter(xml, 'tifrs-bsci-ci:AccountsPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:AccountsPayableToRelatedParties', ai) + getParameter(xml, 'tifrs-bsci-ci:OtherPayables', ai) + getParameter(xml, 'tifrs-bsci-ci:ShorttermNotesAndBillsPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesPayableToRelatedParties', ai) + getParameter(xml, 'tifrs-bsci-ci:ConstructionContractsPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:ReceiptsUnderCustody', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'ifrs:Inventories', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai),
                    current_liabilities: getParameter(xml, 'ifrs:CurrentLiabilities', ai),
                    noncurrent_liabilities: 0,
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-ci:CapitalStock', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai)
                };
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-fh:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-fh:ReceivablesNet', ai) + getParameter(xml, 'tifrs-bsci-fh:DueFromTheCentralBankAndCallLoansToBanks', ai),
                    payable: getParameter(xml, 'tifrs-bsci-fh:Payables', ai) + getParameter(xml, 'tifrs-bsci-fh:DepositsFromTheCentralBankAndBanks', ai) + getParameter(xml, 'tifrs-bsci-fh:Deposits', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'ifrs:FinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-fh:AvailableForSaleFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-fh:SecuritiesPurchasedUnderResellAgreements', ai) + getParameter(xml, 'tifrs-bsci-fh:LoansDiscountedNet', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: 0,
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-fh:Capital', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: getParameter(xml, 'tifrs-bsci-fh:ReinsuranceContractAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-fh:HeldToMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-fh:InvestmentsAccountedForUsingEquityMethodNet', ai) + getParameter(xml, 'ifrs:OtherFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai)
                };
                parseResult.current_liabilities = parseResult.payable + getParameter(xml, 'tifrs-bsci-fh:DueToTheCentralBankAndBanks', ai) + getParameter(xml, 'ifrs:FinancialLiabilitiesAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-fh:SecuritiesSoldUnderRepurchaseAgreements', ai) + getParameter(xml, 'tifrs-bsci-fh:CommercialPapersIssuedNet', ai) + getParameter(xml, 'tifrs-bsci-fh:DerivativeFinancialLiabilitiesForHedging', ai) + getParameter(xml, 'ifrs:CurrentTaxLiabilities', ai);
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-basi:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-basi:Receivables', ai) + getParameter(xml, 'tifrs-bsci-basi:DueFromTheCentralBankAndCallLoansToBanks', ai),
                    payable: getParameter(xml, 'tifrs-bsci-basi:Payables', ai) + getParameter(xml, 'tifrs-bsci-basi:DepositsFromTheCentralBankAndBanks', ai) + getParameter(xml, 'tifrs-bsci-basi:DepositsAndRemittances', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'tifrs-bsci-basi:DiscountsAndLoansNet', ai) + getParameter(xml, 'ifrs:FinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'ifrs:FinancialAssetsAvailableforsale', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: 0,
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-basi:Capital', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: getParameter(xml, 'tifrs-bsci-basi:HeldToMaturityFinancialAssets', ai) + getParameter(xml, 'ifrs:OtherFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai)
                };
                parseResult.current_liabilities = parseResult.payable + getParameter(xml, 'tifrs-bsci-basi:DueToTheCentralBankAndBanks', ai) + getParameter(xml, 'ifrs:FinancialLiabilitiesAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-basi:NotesAndBondsIssuedUnderRepurchaseAgreement', ai) + getParameter(xml, 'ifrs:CurrentTaxLiabilities', ai);
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-bd:CapitalStock', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-bd:MarginLoansReceivable', ai) + getParameter(xml, 'tifrs-bsci-bd:NotesReceivable', ai) + getParameter(xml, 'tifrs-bsci-bd:AccountsReceivable', ai) + getParameter(xml, 'tifrs-bsci-bd:Prepayments', ai) + getParameter(xml, 'tifrs-bsci-bd:OtherReceivables', ai) + getParameter(xml, 'tifrs-bsci-bd:SecurityBorrowingCollateralPrice', ai) + getParameter(xml, 'tifrs-bsci-bd:SecurityBorrowingMargin', ai) + getParameter(xml, 'tifrs-bsci-bd:RefinancingMargin', ai) + getParameter(xml, 'tifrs-bsci-bd:RefinancingCollateralReceivable', ai),
                    payable: getParameter(xml, 'tifrs-bsci-bd:CommercialPaperPayable', ai) + getParameter(xml, 'tifrs-bsci-bd:SecuritiesFinancingRefundableDeposits', ai) + getParameter(xml, 'tifrs-bsci-bd:DepositsPayableForSecuritiesFinancing', ai) + getParameter(xml, 'tifrs-bsci-bd:SecuritiesLendingRefundableDeposits', ai) + getParameter(xml, 'tifrs-bsci-bd:AccountsPayable', ai) + getParameter(xml, 'tifrs-bsci-bd:AdvanceReceipts', ai) + getParameter(xml, 'tifrs-bsci-bd:ReceiptsUnderCustody', ai) + getParameter(xml, 'tifrs-bsci-bd:OtherPayables', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'tifrs-bsci-bd:CurrentFinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-bd:AvailableForSaleCurrentFinancialAssets', ai) + getParameter(xml, 'tifrs-bsci-bd:BondInvestmentsUnderResaleAgreements', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai) + getParameter(xml, 'tifrs-bsci-bd:PropertyAndEquipment', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: getParameter(xml, 'ifrs:NoncurrentLiabilities', ai),
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-bd:CapitalStock', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai) + getParameter(xml, 'tifrs-bsci-bd:NoncurrentFinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-bd:NoncurrentFinancialAssetsAtCost', ai) + getParameter(xml, 'tifrs-bsci-bd:AvailableForSaleNoncurrentFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai)
                };
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs:NoncurrentLiabilities', ai);
                parseResult.current_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-mim:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-mim:ReceivablesNet', ai) + getParameter(xml, 'tifrs-bsci-mim:ReceivablesDueFromRelatedParties', ai) + getParameter(xml, 'tifrs-bsci-mim:DueFromTheCentralBankAndCallLoansToBanks', ai) + getParameter(xml, 'tifrs-bsci-mim:Prepayments', ai),
                    payable: getParameter(xml, 'tifrs-bsci-mim:Payables', ai) + getParameter(xml, 'tifrs-bsci-mim:PayablesToRelatedParties', ai) + getParameter(xml, 'tifrs-bsci-mim:DepositsFromTheCentralBankAndBanks', ai) + getParameter(xml, 'tifrs-bsci-mim:DepositsAndRemittances', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'tifrs-bsci-mim:CurrentFinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'ifrs:Inventories', ai) + getParameter(xml, 'tifrs-bsci-mim:SecuritiesPurchasedUnderResellAgreements', ai) + getParameter(xml, 'tifrs-bsci-mim:DiscountsAndLoansNet', ai) + getParameter(xml, 'tifrs-bsci-mim:NoncurrentAssetsClassifiedAsHeldForSaleNet', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai),
                    current_liabilities: getParameter(xml, 'ifrs:CurrentLiabilities', ai),
                    noncurrent_liabilities: 0,
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-mim:Capital', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: getParameter(xml, 'tifrs-bsci-mim:NoncurrentAvailableForSaleFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-mim:NoncurrentHeldToMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-mim:NoncurrentFinancialAssetsAtCostNet', ai) + getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai)
                };
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-ins:ShareCapital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-ins:Receivables', ai) + getParameter(xml, 'tifrs-bsci-ins:Prepayments', ai) + getParameter(xml, 'tifrs-bsci-ins:GuaranteeDepositsPaid', ai) + getParameter(xml, 'tifrs-bsci-ins:ReinsuranceLiabilityReserveContributed', ai),
                    payable: getParameter(xml, 'tifrs-bsci-ins:AccountsPayable', ai) + getParameter(xml, 'tifrs-bsci-ins:AdvanceReceipts', ai) + getParameter(xml, 'tifrs-bsci-ins:GuaranteeDepositsAndMarginsReceived', ai) + getParameter(xml, 'tifrs-bsci-ins:ReinsuranceLiabilityReserveReceived', ai),
                    cash: getParameter(xml, 'ifrs:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'tifrs-bsci-ins:Loans', ai) + getParameter(xml, 'tifrs-bsci-ins:InvestmentsInNotesAndBondsWithResaleAgreement', ai) + getParameter(xml, 'ifrs:FinancialAssetsAtFairValueThroughProfitOrLoss', ai),
                    property: getParameter(xml, 'ifrs:PropertyPlantAndEquipment', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: getParameter(xml, 'tifrs-bsci-ins:LiabilitiesOnInsuranceProductSeparatedAccountAbstract', ai) + getParameter(xml, 'tifrs-bsci-ins:InsuranceLiabilities', ai) + getParameter(xml, 'tifrs-bsci-ins:ReserveForInsuranceWithNatureOfFinancialInstrument', ai) + getParameter(xml, 'tifrs-bsci-ins:PreferenceShareLiabilities', ai) + getParameter(xml, 'tifrs-bsci-ins:BondsPayable', ai) + getParameter(xml, 'tifrs-bsci-ins:FinancialLiabilitiesAtCost', ai),
                    equityParent: getParameter(xml, 'ifrs:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'tifrs-bsci-ins:ShareCapital', ai),
                    total: getParameter(xml, 'ifrs:Assets', ai),
                    longterm: 0
                };
                parseResult.longterm = getParameter(xml, 'tifrs-bsci-ins:Investments', ai) - parseResult.inventories + getParameter(xml, 'tifrs-bsci-ins:ReinsuranceAssets', ai);
                parseResult.current_liabilities = getParameter(xml, 'ifrs:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs:Equity', ai);
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'ifrs-full:Equity', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tifrs-bsci-ci:AccountsReceivableNet', ai) + getParameter(xml, 'ifrs-full:OtherCurrentReceivables', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesReceivableNet', ai) + getParameter(xml, 'ifrs-full:CurrentPrepayments', ai) + getParameter(xml, 'tifrs-bsci-ci:ConstructionContractsReceivable', ai),
                    payable: getParameter(xml, 'ifrs-full:TradeAndOtherCurrentPayablesToTradeSuppliers', ai) + getParameter(xml, 'tifrs-bsci-ci:AccountsPayableToRelatedParties', ai) + getParameter(xml, 'ifrs-full:OtherCurrentPayables', ai) + getParameter(xml, 'tifrs-bsci-ci:ShorttermNotesAndBillsPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:NotesPayableToRelatedParties', ai) + getParameter(xml, 'tifrs-bsci-ci:ConstructionContractsPayable', ai) + getParameter(xml, 'tifrs-bsci-ci:ReceiptsUnderCustody', ai),
                    cash: getParameter(xml, 'ifrs-full:CashAndCashEquivalents', ai),
                    inventories: getParameter(xml, 'ifrs-full:Inventories', ai),
                    property: getParameter(xml, 'ifrs-full:PropertyPlantAndEquipment', ai),
                    current_liabilities: getParameter(xml, 'ifrs-full:CurrentLiabilities', ai) + getParameter(xml, 'ifrs-full:OtherCurrentLiabilities', ai),
                    noncurrent_liabilities: 0,
                    equityParent: getParameter(xml, 'ifrs-full:EquityAttributableToOwnersOfParent', ai) + getParameter(xml, 'tifrs-bsci-ci:EquityAttributableToFomerOwnerOfBusinessCombinationUnderCommonControl', ai),
                    equityChild: getParameter(xml, 'ifrs-full:NoncontrollingInterests', ai),
                    share: getParameter(xml, 'ifrs-full:Equity', ai),
                    total: getParameter(xml, 'ifrs-full:Assets', ai),
                    longterm: getParameter(xml, 'ifrs-full:NoncurrentAssets', ai)
                };
                parseResult.noncurrent_liabilities = getParameter(xml, 'ifrs-full:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.equityParent === 0) {
                    parseResult.equityParent = getParameter(xml, 'ifrs-full:Equity', ai);
                }
            }
        } else {
            return false;
        }
        if (!quarterIsEmpty(parseResult)) {
            if (!asset[y]) {
                asset[y] = [];
            }
            asset[y][q] = parseResult;
        }
        return xmlDate;
    };
    var calgaapAsset = function calgaapAsset(ai, no_cover) {
        var xmlDate = {};
        var y = 0;
        var q = 0;
        var parseResult = null;
        if (xmlDate = getXmlDate(xml, 'tw-gaap-ci:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tw-gaap-ci:NetAccountsReceivable', ai) + getParameter(xml, 'tw-gaap-ci:OtherReceivables', ai) + getParameter(xml, 'tw-gaap-ci:NetNotesReceivable', ai) + getParameter(xml, 'tw-gaap-ci:NetAccountsReceivableRelatedParties', ai) + getParameter(xml, 'tw-gaap-ci:OtherReceivablesRelatedParties', ai) + getParameter(xml, 'tw-gaap-ci:NetNotesReceivableRelatedParties', ai) + getParameter(xml, 'tw-gaap-ci:OtherPrepayments', ai),
                    payable: getParameter(xml, 'tw-gaap-ci:AccountsPayable', ai) + getParameter(xml, 'tw-gaap-ci:NotesPayable', ai) + getParameter(xml, 'tw-gaap-ci:IncomeTaxPayable', ai) + getParameter(xml, 'tw-gaap-ci:AccruedExpenses', ai) + getParameter(xml, 'tw-gaap-ci:OtherPayables', ai) + getParameter(xml, 'tw-gaap-ci:BillingsConstructionProcess_2264yy', ai) + getParameter(xml, 'tw-gaap-ci:AdvanceReceipts', ai) + getParameter(xml, 'tw-gaap-ci:AccountsPayableRelatedParties', ai) + getParameter(xml, 'tw-gaap-ci:NotesPayableRelatedParties', ai) + getParameter(xml, 'tw-gaap-ci:ReceiptsCustody', ai),
                    cash: getParameter(xml, 'tw-gaap-ci:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-ci:Inventories', ai),
                    property: getParameter(xml, 'tw-gaap-ci:FixedAssets', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: getParameter(xml, 'tw-gaap-ci:LongTermLiabilities', ai),
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-ci:MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-ci:Capital', ai),
                    total: getParameter(xml, 'tw-gaap-ci:Assets', ai),
                    longterm: getParameter(xml, 'tw-gaap-ci:LongtermInvestments', ai)
                };
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-ci:Liabilities', ai) - parseResult.noncurrent_liabilities;
                parseResult.equityParent = getParameter(xml, 'tw-gaap-ci:StockholdersEquities', ai) - parseResult.equityChild;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tw-gaap-fh:ReceivablesNet', ai) + getParameter(xml, 'tw-gaap-fh:DueCentralBankCallLoansBanks', ai),
                    payable: getParameter(xml, 'tw-gaap-fh:DepositsCentralBankBanks', ai) + getParameter(xml, 'tw-gaap-fh:Deposits', ai) + getParameter(xml, 'tw-gaap-fh:Payables', ai),
                    cash: getParameter(xml, 'tw-gaap-fh:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-fh:FinancialAssetsMeasuredFairValueProfitLoss', ai) + getParameter(xml, 'tw-gaap-fh:SecuritiesPurchasedResellAgreements', ai) + getParameter(xml, 'tw-gaap-fh:LoansDiscountedNet', ai) + getParameter(xml, 'tw-gaap-fh:AvailableSaleFinancialAssetsNet', ai),
                    property: getParameter(xml, 'tw-gaap-fh:FixAssetsNet', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: 0,
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-fh:OtherEquity-MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-fh:Capital', ai),
                    total: getParameter(xml, 'tw-gaap-fh:Assets', ai),
                    longterm: getParameter(xml, 'tw-gaap-fh:HeldMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-fh:EquityInvestmentsEquityMethodNet', ai) + getParameter(xml, 'tw-gaap-fh:OtherFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-fh:InvestmentsRealEstateNet', ai)
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-fh:StockholdersEquity', ai) - parseResult.equityChild;
                parseResult.current_liabilities = parseResult.payable + getParameter(xml, 'tw-gaap-fh:CommercialPapersIssued', ai) + getParameter(xml, 'tw-gaap-fh:FinancialLiabilitiesMeasuredFairValueProfitLoss', ai) + getParameter(xml, 'tw-gaap-fh:SecuritiesSoldRepurchaseAgreements', ai) + getParameter(xml, 'tw-gaap-fh:DueCentralBankOtherBanks', ai);
                parseResult.noncurrent_liabilities = getParameter(xml, 'tw-gaap-fh:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-basi:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tw-gaap-basi:ReceivablesNet', ai) + getParameter(xml, 'tw-gaap-basi:DueTheCentralBankCallLoansBanks-BalanceSheet', ai),
                    payable: getParameter(xml, 'tw-gaap-basi:DepositsTheCentralBankBanks', ai) + getParameter(xml, 'tw-gaap-basi:DepositsRemittances', ai) + getParameter(xml, 'tw-gaap-basi:Payables', ai),
                    cash: getParameter(xml, 'tw-gaap-basi:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-basi:DiscountsLoansNet', ai) + getParameter(xml, 'tw-gaap-basi:FinancialAssetsMeasuredFairValueProfitLoss', ai) + getParameter(xml, 'tw-gaap-basi:AvailableSaleFinancialAssetsNet', ai),
                    property: getParameter(xml, 'tw-gaap-basi:FixedAssets-Net', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: 0,
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-basi:MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-basi:Capital', ai),
                    total: getParameter(xml, 'tw-gaap-basi:Assets', ai),
                    longterm: getParameter(xml, 'tw-gaap-basi:HeldMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-basi:OtherFinancialAssetsNet', ai)
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-basi:StockholdersEquity', ai) - parseResult.equityChild;
                parseResult.current_liabilities = parseResult.payable + getParameter(xml, 'tw-gaap-basi:FinancialLiabilitiesMeasuredFairValueProfitLoss', ai) + getParameter(xml, 'tw-gaap-basi:NotesBondsIssuedRepurchaseAgreement', ai);
                parseResult.noncurrent_liabilities = getParameter(xml, 'tw-gaap-basi:Liabilities', ai) - parseResult.current_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-bd:CapitalStock', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tw-gaap-bd:MarginLoansReceivable', ai) + getParameter(xml, 'tw-gaap-bd:NotesReceivable', ai) + getParameter(xml, 'tw-gaap-bd:AccountsReceivable', ai) + getParameter(xml, 'tw-gaap-bd:Prepayments', ai) + getParameter(xml, 'tw-gaap-bd:OtherReceivables', ai) + getParameter(xml, 'tw-gaap-bd:SecurityBorrowingCollateralPrice', ai) + getParameter(xml, 'tw-gaap-bd:SecurityBorrowingMargin', ai) + getParameter(xml, 'tw-gaap-bd:RefinancingMargin', ai) + getParameter(xml, 'tw-gaap-bd:RefinancingCollateralReceivable', ai) + getParameter(xml, 'tw-gaap-bd:PrepaidPensionCurrent', ai),
                    payable: getParameter(xml, 'tw-gaap-bd:CommercialPaperPayable', ai) + getParameter(xml, 'tw-gaap-bd:SecuritiesFinancingRefundableDeposits', ai) + getParameter(xml, 'tw-gaap-bd:DepositsPayableSecuritiesFinancing', ai) + getParameter(xml, 'tw-gaap-bd:SecuritiesLendingRefundableDeposits', ai) + getParameter(xml, 'tw-gaap-bd:AccountsPayable', ai) + getParameter(xml, 'tw-gaap-bd:AmountsReceivedAdvance', ai) + getParameter(xml, 'tw-gaap-bd:ReceiptsCustody', ai) + getParameter(xml, 'tw-gaap-bd:OtherPayable', ai),
                    cash: getParameter(xml, 'tw-gaap-bd:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-bd:FinancialAssetsMeasuredFairValueProfitLossCurrent', ai) + getParameter(xml, 'tw-gaap-bd:AvailableSaleFinancialAssetsCurrent-BalanceSheet', ai) + getParameter(xml, 'tw-gaap-bd:BondInvestmentsResaleAgreements', ai),
                    property: getParameter(xml, 'tw-gaap-bd:FixedAssets', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: getParameter(xml, 'tw-gaap-bd:LongTermLiability', ai),
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-bd:MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-bd:CapitalStock', ai),
                    total: getParameter(xml, 'tw-gaap-bd:Assets', ai),
                    longterm: getParameter(xml, 'tw-gaap-bd:FundsLongTermInvestments', ai)
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-bd:StockholdersEquities', ai) - parseResult.equityChild;
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-bd:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: getParameter(xml, 'tw-gaap-mim:Receivables', ai) + getParameter(xml, 'tw-gaap-mim:DueCentralBankCallLoansBanks', ai) + getParameter(xml, 'tw-gaap-ci:OtherPrepayments', ai),
                    payable: getParameter(xml, 'tw-gaap-mim:Payables', ai) + getParameter(xml, 'tw-gaap-mim:DepositsCentralBankBanks', ai) + getParameter(xml, 'tw-gaap-mim:DepositsRemittances', ai),
                    cash: getParameter(xml, 'tw-gaap-mim:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-mim:FinancialAssetsMeasuredFairValueProfitLossCurrent', ai) + getParameter(xml, 'tw-gaap-mim:AvailableSaleFinancialAssetsCurrent', ai) + getParameter(xml, 'tw-gaap-mim:SecuritiesPurchasedResellAgreements', ai) + getParameter(xml, 'tw-gaap-mim:Inventories', ai) + getParameter(xml, 'tw-gaap-mim:DiscountsLoansNet', ai),
                    property: getParameter(xml, 'tw-gaap-mim:FixedAssets', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: getParameter(xml, 'tw-gaap-mim:LongtermLiabilities', ai),
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-mim:MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-mim:Capital', ai),
                    total: getParameter(xml, 'tw-gaap-mim:Assets', ai),
                    longterm: getParameter(xml, 'tw-gaap-mim:FundsInvestments', ai)
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-mim:StockholdersEquity', ai) - parseResult.equityChild;
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-mim:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:CommonStock', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!asset[y] || !asset[y][q] || !no_cover) {
                parseResult = {
                    receivable: 0,
                    payable: 0,
                    cash: getParameter(xml, 'tw-gaap-ins:CashCashEquivalents', ai),
                    inventories: getParameter(xml, 'tw-gaap-ins:FinancialAssetsMeasuredFairValueProfitLoss', ai) + getParameter(xml, 'tw-gaap-ins:InvestmentsNotesBondsResaleAgreement', ai) + getParameter(xml, 'tw-gaap-ins:Loans', ai) + getParameter(xml, 'tw-gaap-ins:AvailableSaleFinancialAssets', ai),
                    property: getParameter(xml, 'tw-gaap-ins:FixedAssets', ai),
                    current_liabilities: 0,
                    noncurrent_liabilities: 0,
                    equityParent: 0,
                    equityChild: getParameter(xml, 'tw-gaap-ins:MinorityInterest', ai),
                    share: getParameter(xml, 'tw-gaap-ins:CommonStock', ai),
                    total: getParameter(xml, 'tw-gaap-ins:Assets', ai),
                    longterm: 0
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-ins:StockholdersEquity', ai) - parseResult.equityChild;
                if (getParameter(xml, 'tw-gaap-ins:Receivables', ai)) {
                    parseResult.receivable = getParameter(xml, 'tw-gaap-ins:Receivables', ai) + getParameter(xml, 'tw-gaap-ins:PrepaidAccounts', ai) + getParameter(xml, 'tw-gaap-ins:ReinsuranceLiabilityReserveContributed', ai);
                    parseResult.longterm = getParameter(xml, 'tw-gaap-ins:Investments', ai) - parseResult.inventories + getParameter(xml, 'tw-gaap-ins:ReinsuranceReservesAssets-Net', ai);
                    parseResult.payable = getParameter(xml, 'tw-gaap-ins:AccountsPayable', ai) + getParameter(xml, 'tw-gaap-ins:AdvanceReceipts', ai) + getParameter(xml, 'tw-gaap-ins:GuaranteeDepositsMarginsReceived', ai);
                    parseResult.noncurrent_liabilities = getParameter(xml, 'tw-gaap-ins:LiabilitiesInsuranceProductSeparatedAccount', ai) + getParameter(xml, 'tw-gaap-ins:LiabilitiesReserves', ai) + getParameter(xml, 'tw-gaap-ins:BondsPayable', ai) + getParameter(xml, 'tw-gaap-ins:PreferredStockLiabilities', ai) + getParameter(xml, 'tw-gaap-ins:FinancialLiabilitiesCarriedCost', ai);
                } else {
                    parseResult.receivable = getParameter(xml, 'tw-gaap-ins:GuaranteeDepositsPaid', ai) + getParameter(xml, 'tw-gaap-ins:NotesReceivableNet', ai) + getParameter(xml, 'tw-gaap-ins:NotesReceivableRelatedPartiesNet', ai) + getParameter(xml, 'tw-gaap-ins:PremiumsReceivableNet', ai) + getParameter(xml, 'tw-gaap-ins:ClaimsRecoverableReinsurers', ai) + getParameter(xml, 'tw-gaap-ins:DueReinsurersCedingCompaniesNet', ai) + getParameter(xml, 'tw-gaap-ins:PrepaymentReinsuranceExpenses', ai) + getParameter(xml, 'tw-gaap-ins:ReinsuranceReceivable', ai) + getParameter(xml, 'tw-gaap-ins:OtherReceivables', ai) + getParameter(xml, 'tw-gaap-ins:Prepayments', ai);
                    parseResult.longterm = getParameter(xml, 'tw-gaap-ins:HeldMaturityFinancialAssets', ai) + getParameter(xml, 'tw-gaap-ins:FinancialAssetsCarriedCostCurrent', ai) + getParameter(xml, 'tw-gaap-ins:DebtInvestmentsWithoutActiveMarket', ai) + getParameter(xml, 'tw-gaap-ins:OtherFinancialAssetsCurrent', ai) + getParameter(xml, 'tw-gaap-ins:FundsInvestments', ai);
                    parseResult.payable = getParameter(xml, 'tw-gaap-ins:NotesPayable', ai) + getParameter(xml, 'tw-gaap-ins:CommissionsPayable', ai) + getParameter(xml, 'tw-gaap-ins:ClaimsPayable', ai) + getParameter(xml, 'tw-gaap-ins:CurrentLiabilities-DueReinsurersCedingCompanies', ai) + getParameter(xml, 'tw-gaap-ins:ReinsurancePremiumsPayable', ai) + getParameter(xml, 'tw-gaap-ins:OtherPayables', ai) + getParameter(xml, 'tw-gaap-ins:AdvanceReceipts', ai) + getParameter(xml, 'tw-gaap-ins:GuaranteeDepositsMarginsReceived', ai);
                    parseResult.noncurrent_liabilities = getParameter(xml, 'tw-gaap-ins:ReserveOperationsLiabilities', ai) + getParameter(xml, 'tw-gaap-ins:LongTermLiabilities', ai);
                }
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-ins:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else {
            return false;
        }
        if (!quarterIsEmpty(parseResult)) {
            if (!asset[y]) {
                asset[y] = [];
            }
            asset[y][q] = parseResult;
        }
        return xmlDate;
    };
    var isOk = false;
    for (var _i6 = 0; _i6 < 4; _i6++) {
        if (type === 1) {
            if (xmlDate = califrsAsset(_i6, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapAsset(_i6, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        }
    }
    if (!isOk) {
        console.log('unknown finance data');
        return false;
    }
    return asset;
};

var getSales = function getSales(xml, sales, cash, no_cover) {
    if (!xml.xbrl) {
        for (var i in xml) {
            xml.xbrl = xml[i];
            break;
        }
        if (!xml.xbrl) {
            console.log('xml lost');
            return false;
        }
    }
    if (!sales) {
        sales = {};
    }
    var year = 0;
    var quarter = 0;
    var type = 0;
    if (xml.xbrl['tifrs-notes:Year']) {
        type = 1;
        year = Number(xml.xbrl['tifrs-notes:Year'][0]['_']);
        quarter = Number(xml.xbrl['tifrs-notes:Quarter'][0]['_']);
    } else {
        if (xmlDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ar:CashCashEquivalents', 0)) {
            year = xmlDate.year;
            quarter = xmlDate.quarter;
            if (year === 2010 && quarter === 1 && (xml.xbrl.context[0].entity[0].identifier[0]['_'] === '5315' || xml.xbrl.context[0].entity[0].identifier[0]['_'] === '6148')) {
                return sales;
            }
        } else {
            console.log('umknown date');
            return false;
        }
    }
    var califrsSales = function califrsSales(si, no_cover) {
        var xmlDate = {};
        var y = 0;
        var q = 0;
        var parseResult = null;
        if ((xmlDate = getXmlDate(xml, 'tifrs-bsci-ci:OperatingRevenue', si)) || (xmlDate = getXmlDate(xml, 'tifrs-bsci-ci:OperatingExpenses', si))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: getParameter(xml, 'tifrs-bsci-ci:GrossProfitLossFromOperations', si),
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'tifrs-bsci-ci:OperatingRevenue', si),
                    expenses: getParameter(xml, 'tifrs-bsci-ci:OperatingExpenses', si),
                    tax: getParameter(xml, 'ifrs:IncomeTaxExpenseContinuingOperations', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: getParameter(xml, 'tifrs-bsci-ci:NonoperatingIncomeAndExpenses', si),
                    finance_cost: getParameter(xml, 'ifrs:FinanceCosts', si),
                    cost: getParameter(xml, 'tifrs-bsci-ci:OperatingCosts', si),
                    operating: getParameter(xml, 'tifrs-bsci-ci:NetOperatingIncomeLoss', si)
                };
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-fh:NetInterestIncomeExpense', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'ifrs:RevenueFromInterest', si) + getParameter(xml, 'tifrs-bsci-fh:NetIncomeLossOfInsuranceOperations', si) + getParameter(xml, 'tifrs-bsci-fh:NetServiceFeeChargeAndCommissionsIncomeLoss', si) + getParameter(xml, 'tifrs-bsci-fh:GainsOnFinancialAssetsLiabilitiesAtFairValueThroughProfitOrLoss', si) + getParameter(xml, 'tifrs-bsci-fh:GainLossOnInvestmentProperty', si) + getParameter(xml, 'tifrs-bsci-fh:RealizedGainsOnAvailableForSaleFinancialAssets', si) + getParameter(xml, 'tifrs-bsci-fh:RealizedGainsOnHeldToMaturityFinancialAssets', si),
                    expenses: getParameter(xml, 'tifrs-bsci-fh:OperatingExpenses', si),
                    tax: -getParameter(xml, 'tifrs-bsci-fh:TaxExpenseIncome', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tifrs-bsci-fh:BadDebtExpensesAndGuaranteeLiabilityProvisions', si),
                    cost: getParameter(xml, 'ifrs:InterestExpense', si) + getParameter(xml, 'tifrs-bsci-fh:NetChangeInProvisionsForInsuranceLiabilities', si) + getParameter(xml, 'tifrs-bsci-fh:LossesOnFinancialAssetsLiabilitiesAtFairValueThroughProfitOrLoss', si) + getParameter(xml, 'tifrs-bsci-fh:RealizedLossesOnAvailableForSaleFinancialAssets', si) + getParameter(xml, 'tifrs-bsci-fh:RealizedLossesOnHeldToMaturityFinancialAssets', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-basi:NetIncomeLossOfInterest', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'ifrs:RevenueFromInterest', si) + getParameter(xml, 'tifrs-bsci-basi:ServiceFee', si) + getParameter(xml, 'tifrs-bsci-basi:GainsOnFinancialAssetsOrLiabilitiesMeasuredAtFairValueThroughProfitOrLoss', si) + getParameter(xml, 'tifrs-bsci-basi:GainsOnDisposalOfAvailableForSaleFinancialAssets', si),
                    expenses: getParameter(xml, 'tifrs-bsci-basi:OperatingExpense', si),
                    tax: -getParameter(xml, 'tifrs-bsci-basi:TaxIncomeExpenseRelatedToComponentsOfNetIncome', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tifrs-bsci-basi:BadDebtExpensesAndGuaranteeLiabilityProvision', si),
                    cost: getParameter(xml, 'ifrs:InterestExpense', si) + getParameter(xml, 'tifrs-bsci-basi:ServiceCharge', si) + getParameter(xml, 'tifrs-bsci-basi:LossesOnFinancialAssetsOrLiabilitiesMeasuredAtFairValueThroughProfitOrLoss', si) + getParameter(xml, 'tifrs-bsci-basi:RealizedLossesOnAvailableForSaleFinancialAssets', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-bd:TotalRevenue', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'tifrs-bsci-bd:TotalRevenue', si),
                    expenses: getParameter(xml, 'ifrs:EmployeeBenefitsExpense', si) + getParameter(xml, 'ifrs:DepreciationAndAmortisationExpense', si),
                    tax: -getParameter(xml, 'tifrs-bsci-bd:IncomeTaxBenefitExpense', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'ifrs:FinanceCosts', si),
                    cost: 0,
                    operating: 0
                };
                parseResult.cost = getParameter(xml, 'tifrs-bsci-bd:TotalExpenditureAndExpense', si) - parseResult.expenses - parseResult.finance_cost;
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-mim:OperatingExpenses', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'ifrs:Revenue', si) - getParameter(xml, 'ifrs:OtherIncome', si) - getParameter(xml, 'tifrs-bsci-mim:ForeignExchangeGains', si) - getParameter(xml, 'tifrs-bsci-mim:ReversalOfImpairmentLossOnAssets', si) - getParameter(xml, 'tifrs-bsci-mim:ShareOfProfitOfAssociatesAndJointVenturesAccountedForUsingEquityMethod', si),
                    expenses: getParameter(xml, 'tifrs-bsci-mim:OperatingExpenses', si),
                    tax: getParameter(xml, 'ifrs:TaxExpenseIncome', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tifrs-bsci-mim:BadDebtExpensesAndGuaranteeLiabilityProvisions', si),
                    cost: 0,
                    operating: 0
                };
                parseResult.cost = getParameter(xml, 'tifrs-bsci-mim:Expenses', si) - getParameter(xml, 'tifrs-bsci-mim:OtherExpenses', si) - getParameter(xml, 'tifrs-bsci-mim:ShareOfLossOfAssociatesAndJointVenturesAccountedForUsingEquityMethod', si) - parseResult.expenses;
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tifrs-bsci-ins:OperatingRevenue', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'tifrs-bsci-ins:OperatingRevenue', si),
                    expenses: getParameter(xml, 'tifrs-bsci-ins:OperatingExpenses', si),
                    tax: getParameter(xml, 'ifrs:IncomeTaxExpenseContinuingOperations', si),
                    eps: getParameter(xml, 'ifrs:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'ifrs:InterestExpense', si),
                    cost: getParameter(xml, 'tifrs-bsci-ins:OperatingCosts', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else {
            xmlDate = getXmlDate(xml, 'ifrs-full:Revenue', si);
            if (!xmlDate) {
                xmlDate = getXmlDate(xml, 'ifrs-full:OperatingExpense', si);
            }
            if (!xmlDate) {
                return false;
            }
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'ifrs-full:ProfitLoss', si),
                    comprehensive: getParameter(xml, 'ifrs-full:OtherComprehensiveIncome', si),
                    revenue: getParameter(xml, 'ifrs-full:Revenue', si),
                    expenses: getParameter(xml, 'ifrs-full:OperatingExpense', si),
                    tax: getParameter(xml, 'ifrs-full:IncomeTaxExpenseContinuingOperations', si),
                    eps: getParameter(xml, 'ifrs-full:BasicEarningsLossPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'ifrs-full:FinanceCosts', si),
                    cost: getParameter(xml, 'tifrs-bsci-ci:OperatingCosts', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        }
        if (!quarterIsEmpty(parseResult)) {
            if (!sales[y]) {
                sales[y] = [];
            }
            sales[y][q] = parseResult;
        }
        return xmlDate;
    };
    var calgaapSales = function calgaapSales(si, no_cover) {
        var xmlDate = {};
        var y = 0;
        var q = 0;
        var parseResult = null;
        if ((xmlDate = getXmlDate(xml, 'tw-gaap-ci:ConsolidatedTotalIncome', si)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ci:NetIncomeLoss', si))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: getParameter(xml, 'tw-gaap-ci:GrossProfitLossOperations', si),
                    profit: getParameter(xml, 'tw-gaap-ci:ConsolidatedTotalIncome', si) + getParameter(xml, 'tw-gaap-ci:NetIncomeLoss', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-ci:OperatingRevenue', si),
                    expenses: getParameter(xml, 'tw-gaap-ci:OperatingExpenses', si),
                    tax: getParameter(xml, 'tw-gaap-ci:IncomeTaxExpenseBenefit', si),
                    eps: getParameter(xml, 'tw-gaap-ci:PrimaryEarningsPerShare', si),
                    nonoperating: getParameter(xml, 'tw-gaap-ci:NonOperatingIncomeGains', si) - getParameter(xml, 'tw-gaap-ci:NonOperatingExpenses', si),
                    finance_cost: getParameter(xml, 'tw-gaap-ci:InterestExpense', si),
                    cost: getParameter(xml, 'tw-gaap-ci:OperatingCosts', si),
                    operating: getParameter(xml, 'tw-gaap-ci:OperatingIncomeLoss', si)
                };
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:ConsolidatedIncomeLossContinuingOperationsNetIncomeTax', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'tw-gaap-fh:ConsolidatedIncomeLossContinuingOperationsNetIncomeTax', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-fh:InterestIncomes', si) + getParameter(xml, 'tw-gaap-fh:NetIncomeLossInsuranceOperations', si) + getParameter(xml, 'tw-gaap-fh:NetServiceFeeChargeCommissionsIncomeLoss', si) + getParameter(xml, 'tw-gaap-fh:GainsFinancialAassetsLiabilitiesMeasuredFairValueProfitLoss', si) + getParameter(xml, 'tw-gaap-fh:RealizedGainsAvailableSaleFinancialAssets', si) + getParameter(xml, 'tw-gaap-fh:RealizedGainsHeldMaturityFinancialAassets', si) + getParameter(xml, 'tw-gaap-fh:GainsRealEstateInvestments', si),
                    expenses: getParameter(xml, 'tw-gaap-fh:OperatingExpenses', si),
                    tax: -getParameter(xml, 'tw-gaap-fh:IncomeTaxExpenseBenefit', si),
                    eps: getParameter(xml, 'tw-gaap-fh:PrimaryEarningsPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tw-gaap-fh:BadDebtExpensesLoan', si),
                    cost: getParameter(xml, 'tw-gaap-fh:InterestExpenses', si) - getParameter(xml, 'tw-gaap-fh:NetChangeInReservesForLiabilities', si) - getParameter(xml, 'tw-gaap-fh:RecoveredProvisionMiscellaneousInsuranceReserve', si) + getParameter(xml, 'tw-gaap-fh:GainsFinancialAassetsLiabilitiesMeasuredFairValueProfitLoss', si) + getParameter(xml, 'tw-gaap-fh:RealizedLossesAvailableSaleFinancialAssets', si) + getParameter(xml, 'tw-gaap-fh:RealizedLossesHeldMaturityFinancialAssets', si) + getParameter(xml, 'tw-gaap-fh:LossesRealEstateInvestments', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-basi:IncomeLossContinuingOperations', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'tw-gaap-basi:IncomeLossContinuingOperations', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-basi:InterestIncomes', si) + getParameter(xml, 'tw-gaap-basi:ServiceFee', si) + getParameter(xml, 'tw-gaap-basi:GainsFinancialAssetsLiabilitiesMeasuredFairValueProfitLoss', si) + getParameter(xml, 'tw-gaap-basi:RealizedGainsAvailableSaleFinancialAssets', si),
                    expenses: getParameter(xml, 'tw-gaap-basi:PersonnelExpenses', si) + getParameter(xml, 'tw-gaap-basi:DepreciationAmortizationExpense', si) + getParameter(xml, 'tw-gaap-basi:OtherGeneralAdministrativeExpenses', si),
                    tax: -getParameter(xml, 'tw-gaap-basi:IncomeTaxExpenseBenefitContinuingOperations', si),
                    eps: getParameter(xml, 'tw-gaap-basi:PrimaryEarningsPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tw-gaap-basi:BadDebtExpensesLoan', si),
                    cost: getParameter(xml, 'tw-gaap-basi:InterestExpenses', si) + getParameter(xml, 'tw-gaap-basi:ServiceCharge', si) + getParameter(xml, 'tw-gaap-basi:LossesFinancialAssetsLiabilitiesMeasuredFairValueProfitLoss', si) + getParameter(xml, 'tw-gaap-basi:RealizedLossesAvailableSaleFinancialAssets', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if ((xmlDate = getXmlDate(xml, 'tw-gaap-bd:ConsolidatedNetIncome', si)) || (xmlDate = getXmlDate(xml, 'tw-gaap-bd:NetIncomeLoss-CashFlowStatement', si))) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'tw-gaap-bd:ConsolidatedNetIncome', si) + getParameter(xml, 'tw-gaap-bd:NetIncomeLoss-CashFlowStatement', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-bd:Revenue', si) - getParameter(xml, 'tw-gaap-bd:NonOperatingRevenuesGains', si),
                    expenses: getParameter(xml, 'tw-gaap-bd:OperatingExpenses', si),
                    tax: getParameter(xml, 'tw-gaap-bd:IncomeTaxExpense', si),
                    eps: getParameter(xml, 'tw-gaap-bd:PrimaryEarningsPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tw-gaap-bd:InterestExpenses', si),
                    cost: 0,
                    operating: 0
                };
                parseResult.cost = getParameter(xml, 'tw-gaap-bd:Expenditure', si) - parseResult.expenses - getParameter(xml, 'tw-gaap-bd:NonOperatingExpenseLoss', si);
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:ConsolidatedTotalIncome-IncomeStatement', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'tw-gaap-mim:ConsolidatedTotalIncome-IncomeStatement', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-mim:Revenues', si) - getParameter(xml, 'tw-gaap-mim:OtherIncome', si) - getParameter(xml, 'tw-gaap-mim:ForeignExchangeGains', si) - getParameter(xml, 'tw-gaap-mim:ReversalImpairmentLossAssets', si) - getParameter(xml, 'tw-gaap-mim:InvestmentIncomeEquityMethodInvestees', si) - getParameter(xml, 'tw-gaap-mim:GainDisposalFixedAssets', si),
                    expenses: getParameter(xml, 'tw-gaap-mim:OperatingExpenses', si),
                    tax: getParameter(xml, 'tw-gaap-mim:IncomeTaxExpenses', si),
                    eps: getParameter(xml, 'tw-gaap-mim:PrimaryEarningsPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tw-gaap-mim:BadDebtExpensesLoan', si),
                    cost: 0,
                    operating: 0
                };
                parseResult.cost = getParameter(xml, 'tw-gaap-mim:Expenses', si) - getParameter(xml, 'tw-gaap-mim:OtherExpenses', si) - getParameter(xml, 'tw-gaap-mim:ForeignExchangeLosses', si) - getParameter(xml, 'tw-gaap-mim:ImpairmentLosses', si) - getParameter(xml, 'tw-gaap-mim:LossDisposalFixedAssets', si) - getParameter(xml, 'tw-gaap-mim:InvestmentLossEquityMethodInvestee', si) - parseResult.expenses;
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLossContinuingOperations', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter - 1;
            if (!sales[y] || !sales[y][q] || !no_cover) {
                parseResult = {
                    gross_profit: 0,
                    profit: getParameter(xml, 'tw-gaap-ins:NetIncomeLossContinuingOperations', si),
                    comprehensive: 0,
                    revenue: getParameter(xml, 'tw-gaap-ins:OperatingIncomes', si),
                    expenses: getParameter(xml, 'tw-gaap-ins:OperatingExpenses', si),
                    tax: getParameter(xml, 'tw-gaap-ins:IncomeTaxExpenseBenefit', si),
                    eps: getParameter(xml, 'tw-gaap-ins:EarningsPerShare', si),
                    nonoperating: 0,
                    finance_cost: getParameter(xml, 'tw-gaap-ins:InterestExpense', si),
                    cost: getParameter(xml, 'tw-gaap-ins:OperatingCosts', si),
                    operating: 0
                };
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else {
            return false;
        }
        if (!quarterIsEmpty(parseResult) && !quarterIsEmpty(cash[y][q])) {
            if (!sales[y]) {
                sales[y] = [];
            }
            sales[y][q] = parseResult;
        }
        return xmlDate;
    };
    var xmlDate = {};
    var isOk = false;
    for (var _i7 = 0; _i7 < 4; _i7++) {
        if (type === 1) {
            if (xmlDate = califrsSales(_i7, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapSales(_i7, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        }
    }
    if (!isOk && (year !== 2009 || quarter !== 4 || xml.xbrl.context[0].entity[0].identifier[0]['_'] !== '3664')) {
        console.log('unknown finance data');
        return false;
    }
    return sales;
};

var getTwseXml = function getTwseXml(stockCode, year, quarter, filePath) {
    var post = {
        step: 9,
        co_id: stockCode,
        year: year,
        season: quarter,
        functionName: year > 2012 ? 't164sb01' : 't147sb02',
        report_id: year > 2012 ? 'C' : 'B'
    };
    return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath }).catch(function (err) {
        if (err.code === 'HPE_INVALID_CONSTANT') {
            post.report_id = post.report_id === 'C' ? 'B' : 'A';
            return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath }).catch(function (err) {
                if (err.code === 'HPE_INVALID_CONSTANT') {
                    post.report_id = 'A';
                    return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath });
                } else {
                    return (0, _utility.handleError)(err);
                }
            });
        } else {
            return (0, _utility.handleError)(err);
        }
    });
};

var trans_tag = function trans_tag(item, append) {
    switch (item) {
        case 'receivable':
            return '\u61C9\u6536\u8CC7\u7522' + append;
        case 'cash':
            return '\u73FE\u91D1\u8CC7\u7522' + append;
        /*case 'OCFA':
        return `其他流動資產${append}`;*/
        case 'inventories':
            return '\u5B58\u8CA8\u8CC7\u7522' + append;
        case 'property':
            return '\u4E0D\u52D5\u8CC7\u7522' + append;
        case 'longterm':
            return '\u9577\u671F\u6295\u8CC7\u8CC7\u7522' + append;
        case 'other':
            return '\u5176\u4ED6\u8CC7\u7522' + append;
        case 'equityChild':
            return '\u975E\u63A7\u5236\u6B0A\u76CA' + append;
        case 'equityParent':
            return '\u6BCD\u516C\u53F8\u6B0A\u76CA' + append;
        case 'noncurrent_liabilities':
            return '\u975E\u6D41\u52D5\u8CA0\u50B5' + append;
        case 'current_liabilities_without_payable':
            return '\u6D41\u52D5\u4E0D\u5305\u542B\u61C9\u4ED8\u5E33\u6B3E\u8CA0\u50B5' + append;
        case 'payable':
            return '\u61C9\u4ED8\u5E33\u6B3E\u8CA0\u50B5' + append;
    }
};

var getBasicStockData = function getBasicStockData(type, index) {
    switch (type) {
        case 'twse':
            return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/mops/web/ajax_quickpgm?encodeURIComponent=1&step=4&firstin=1&off=1&keyword4=' + index + '&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&co_id=' + index).then(function (raw_data) {
                var result = { stock_location: ['tw', '台灣', '臺灣'] };
                var i = 0;
                var form = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0];
                var table = (0, _utility.findTag)(form, 'table', 'zoom')[0] ? (0, _utility.findTag)(form, 'table', 'zoom')[0] : (0, _utility.findTag)((0, _utility.findTag)(form, 'table')[0], 'table', 'zoom')[0];
                (0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[1], 'td').forEach(function (d) {
                    var as = (0, _utility.findTag)(d, 'a');
                    if (as.length > 0) {
                        (function () {
                            var texts = [];
                            as.forEach(function (a) {
                                var text = (0, _utility.findTag)(a)[0];
                                if (text) {
                                    texts.push(text);
                                }
                            });
                            switch (i) {
                                case 0:
                                    result.stock_index = texts[0];
                                    break;
                                case 1:
                                    result.stock_name = texts;
                                    var _iteratorNormalCompletion = true;
                                    var _didIteratorError = false;
                                    var _iteratorError = undefined;

                                    try {
                                        for (var _iterator = (0, _getIterator3.default)(texts), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                            var t = _step.value;

                                            if (t.match(/^F/)) {
                                                result.stock_location.push('大陸');
                                                result.stock_location.push('中國');
                                                result.stock_location.push('中國大陸');
                                                result.stock_location.push('china');
                                                break;
                                            }
                                        }
                                    } catch (err) {
                                        _didIteratorError = true;
                                        _iteratorError = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion && _iterator.return) {
                                                _iterator.return();
                                            }
                                        } finally {
                                            if (_didIteratorError) {
                                                throw _iteratorError;
                                            }
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
                        })();
                    }
                    i++;
                });
                return result;
            });
            break;
        case 'usse':
            return (0, _apiTool2.default)('url', 'https://finance.yahoo.com/quote/' + index + '/profile?p=' + index).then(function (raw_data) {
                var result = { stock_location: ['us', '美國'], stock_index: index };
                var app = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'app')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0];
                var market = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(app, 'div')[1], 'div')[0], 'div')[0], 'div')[3], 'div')[0], 'div')[0], 'div')[0], 'div')[1], 'div')[0], 'div')[1], 'span')[0])[0];
                result.stock_market = market.substring(0, market.indexOf('-')).trim();
                var info = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(app, 'div')[2], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0], 'section')[0];
                var section = (0, _utility.findTag)((0, _utility.findTag)(info, 'div')[0], 'div')[0];
                result.stock_full = (0, _utility.findTag)((0, _utility.findTag)(section, 'h3')[0])[0];
                result.stock_name = [result.stock_full];
                result.stock_class = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(section, 'div')[0], 'p')[1], 'span')[1])[0];
                result.stock_ind = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(section, 'div')[0], 'p')[1], 'span')[3])[0];
                result.stock_executive = [];
                (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(info, 'section')[0], 'table')[0], 'tbody')[0], 'tr').forEach(function (t) {
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0], 'span')[0]).forEach(function (n) {
                        if (n.match(/^M/)) {
                            result.stock_executive.push(n);
                        }
                    });
                });
                return result;
            });
            break;
        default:
            return (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'));
    }
};

var handleStockTagV2 = function handleStockTagV2(type, index, indexTag) {
    return getBasicStockData(type, index).then(function (basic) {
        var tags = new _set2.default();
        indexTag.forEach(function (v) {
            return tags.add(v);
        });
        tags.add(type).add(basic.stock_index).add(basic.stock_full).add(basic.stock_market).add(basic.stock_class);
        if (basic.stock_market_e) {
            tags.add(basic.stock_market_e);
        }
        if (basic.stock_time) {
            tags.add(basic.stock_time);
        }
        if (basic.stock_ind) {
            tags.add(basic.stock_ind);
        }
        basic.stock_name.forEach(function (i) {
            return tags.add(i);
        });
        basic.stock_location.forEach(function (i) {
            return tags.add(i);
        });
        if (basic.stock_executive && basic.stock_executive.length > 0) {
            basic.stock_executive.forEach(function (i) {
                return tags.add(i);
            });
        }
        var valid_tags = [];
        tags.forEach(function (i) {
            var valid_name = (0, _utility.isValidString)(i, 'name');
            if (valid_name) {
                valid_tags.push(valid_name);
            }
        });
        return [basic.stock_name[0], valid_tags];
    });
};

var handleStockTag = function handleStockTag(type, index, latestYear, latestQuarter, assetStatus, cashStatus, safetyStatus, profitStatus, salesStatus, managementStatus) {
    return getBasicStockData(type, index).then(function (basic) {
        var tags = new _set2.default();
        tags.add(type).add(basic.stock_index).add(basic.stock_full).add(basic.stock_market).add(basic.stock_market_e).add(basic.stock_class).add(basic.stock_time);
        basic.stock_name.forEach(function (i) {
            return tags.add(i);
        });
        basic.stock_location.forEach(function (i) {
            return tags.add(i);
        });
        var ly = latestYear;
        var lq = latestQuarter - 1;
        for (var i = 0; i < 20; i++) {
            if (assetStatus[ly] && assetStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        for (var _i8 in assetStatus[ly][lq]) {
            if (_i8 !== 'total' && assetStatus[ly][lq][_i8] > 25) {
                tags.add(trans_tag(_i8, '較多'));
            }
        }
        tags.add(assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent'] >= 50 ? '權益較多' : '負債較多');
        var diff_obj = { d: [], p: [] };
        var ey = ly - 5;
        var eq = lq;
        for (var _i9 = 0; _i9 < 20; _i9++) {
            if (assetStatus[ey] && assetStatus[ey][eq]) {
                break;
            } else {
                if (eq < 3) {
                    eq++;
                } else {
                    eq = 0;
                    ey++;
                }
            }
        }
        var threshold = assetStatus[ey][eq]['total'] * 10;
        for (var _i10 in assetStatus[ey][eq]) {
            if (_i10 !== 'total') {
                var diff = assetStatus[ly][lq][_i10] * assetStatus[ly][lq]['total'] - assetStatus[ey][eq][_i10] * assetStatus[ey][eq]['total'];
                if (Math.abs(diff) > threshold) {
                    _i10 === 'equityChild' || _i10 === 'equityParent' || _i10 === 'noncurrent_liabilities' || _i10 === 'current_liabilities_without_payable' || _i10 === 'payable' ? diff_obj.d.push({ i: _i10, n: diff }) : diff_obj.p.push({ i: _i10, n: diff });
                }
            }
        }
        if (diff_obj.d.length > 0) {
            diff_obj.d.sort(function (a, b) {
                return Math.abs(a.n) - Math.abs(b.n);
            });
        }
        if (diff_obj.p.length > 0) {
            diff_obj.p.sort(function (a, b) {
                return Math.abs(a.n) - Math.abs(b.n);
            });
        }
        if (diff_obj.d[0]) {
            tags.add(trans_tag(diff_obj.d[0].i, diff_obj.d[0].n > 0 ? '成長' : '減少'));
            if (diff_obj.d[1]) {
                tags.add(trans_tag(diff_obj.d[1].i, diff_obj.d[1].n > 0 ? '成長' : '減少'));
            }
        }
        if (diff_obj.p[0]) {
            tags.add(trans_tag(diff_obj.p[0].i, diff_obj.p[0].n > 0 ? '成長' : '減少'));
            if (diff_obj.p[1]) {
                tags.add(trans_tag(diff_obj.p[1].i, diff_obj.p[1].n > 0 ? '成長' : '減少'));
                if (diff_obj.p[2]) {
                    tags.add(trans_tag(diff_obj.p[2].i, diff_obj.p[2].n > 0 ? '成長' : '減少'));
                }
            }
        }
        var total_diff = assetStatus[ly][lq]['total'] - assetStatus[ey][eq]['total'];
        if (total_diff > assetStatus[ey][eq]['total'] * 0.2) {
            tags.add('總資產成長');
            var _diff = (assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ly][lq]['total'] - (assetStatus[ey][eq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ey][eq]['total'];
            tags.add(_diff > total_diff - _diff ? '總權益成長' : '總負債成長');
        } else if (total_diff < -0.2 * assetStatus[ey][eq]['total']) {
            tags.add('總資產減少');
            var _diff2 = (assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ly][lq]['total'] - (assetStatus[ey][eq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ey][eq]['total'];
            tags.add(_diff2 < total_diff - _diff2 ? '總權益減少' : '總負債減少');
        }
        ly = latestYear;
        lq = latestQuarter - 1;
        for (var _i11 = 0; _i11 < 20; _i11++) {
            if (cashStatus[ly] && cashStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        var y = ly - 5;
        var q = lq;
        ey = ly - 5;
        eq = lq;
        var operation = 0;
        var financial = 0;
        var minor = 0;
        var profit_flow = 0;
        var divided_flow = 0;
        for (var _i12 = 0; _i12 < 100; _i12++) {
            if (cashStatus[ly] && cashStatus[ly][lq]) {
                operation = operation + (cashStatus[ly][lq].operation + cashStatus[ly][lq].invest) * cashStatus[ly][lq].end;
                financial += cashStatus[ly][lq].without_dividends * cashStatus[ly][lq].end;
                minor += cashStatus[ly][lq].minor * cashStatus[ly][lq].end;
                if (salesStatus[ly] && salesStatus[ly][lq]) {
                    profit_flow = profit_flow + cashStatus[ly][lq].profitBT * cashStatus[ly][lq].end - salesStatus[ly][lq].quarterTax * salesStatus[ly][lq].quarterRevenue;
                } else {
                    profit_flow += cashStatus[ly][lq].profitBT * cashStatus[ly][lq].end;
                }
                divided_flow += cashStatus[ly][lq].dividends * cashStatus[ly][lq].end;
            }
            if (ly === y && q === lq) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        for (var _i13 = 0; _i13 < 20; _i13++) {
            if (cashStatus[ey] && cashStatus[ey][eq]) {
                break;
            } else {
                if (eq < 3) {
                    eq++;
                } else {
                    eq = 0;
                    ey++;
                }
            }
        }
        var cash_flow = operation + financial + minor;
        if (cash_flow > cashStatus[ey][eq].end * 20) {
            tags.add('現金流入');
        } else if (cash_flow < cashStatus[ey][eq].end * -20) {
            tags.add('現金流出');
        }
        if (Math.abs(operation) > Math.abs(financial) * 1.2) {
            tags.add(operation > 0 ? '營運現金流入' : '營運現金流出');
        } else if (Math.abs(financial) > Math.abs(operation) * 1.2) {
            tags.add(financial > 0 ? '融資現金流入' : '融資現金流出');
        }
        divided_flow /= -100;
        profit_flow /= 100;
        cash_flow /= 100;
        var value_flow = divided_flow + total_diff;
        tags.add(value_flow > 0 ? '價值增加' : '價值減少');
        tags.add(profit_flow > 0 ? '累積獲利' : '累積虧損');
        if (Math.abs(value_flow - profit_flow) > Math.abs(profit_flow * 0.2)) {
            tags.add(value_flow - profit_flow > 0 ? '非獲利價值增加過高' : '非獲利價值減少過高');
        }
        if (Math.abs(cash_flow) > 0.5 * Math.abs(value_flow)) {
            tags.add(cash_flow > 0 ? '現金價值增加' : '現金價值減少');
        }
        if (Math.abs(total_diff - cash_flow) > 0.5 * Math.abs(value_flow)) {
            tags.add(total_diff - cash_flow > 0 ? '非現金價值增加' : '非現金價值減少');
        }
        if (divided_flow > 0.2 * Math.abs(value_flow)) {
            tags.add('股利價值增加');
        }
        ly = latestYear;
        lq = latestQuarter - 1;
        for (var _i14 = 0; _i14 < 20; _i14++) {
            if (safetyStatus[ly] && safetyStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        y = ly - 5;
        q = lq;
        var opcash = [];
        var cdcash = [];
        var shortcash = [];
        var time = [];
        var t = 100;
        for (var _i15 = 0; _i15 < 100; _i15++) {
            if (safetyStatus[ly] && safetyStatus[ly][lq]) {
                opcash.push(safetyStatus[ly][lq].prMinusProfit);
                cdcash.push(safetyStatus[ly][lq].shortCashWithoutInvest);
                shortcash.push(safetyStatus[ly][lq].shortCash);
                time.push(t);
                t--;
            }
            if (ly === y && q === lq) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        var timeEven = caculateEven(time, true);
        var timeVariance = caculateVariance(time, timeEven, true);
        var periodChange = function periodChange(data, name, speed, reverse, interval1, d1, d2) {
            var interval2 = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : null;
            var d3 = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : null;
            var interval3 = arguments.length > 9 && arguments[9] !== undefined ? arguments[9] : null;
            var d4 = arguments.length > 10 && arguments[10] !== undefined ? arguments[10] : null;
            var interval4 = arguments.length > 11 && arguments[11] !== undefined ? arguments[11] : null;
            var d5 = arguments.length > 12 && arguments[12] !== undefined ? arguments[12] : null;

            var even = caculateEven(data, true);
            var line = caculateRelativeLine(data, even, time, timeEven, timeVariance);
            var start = line.a + line.b * time[time.length - 1];
            var end = line.a + line.b * time[0];
            var append = name;

            if (reverse) {
                if (line.b > speed) {
                    name += '快速減少';
                } else if (line.b > 0) {
                    name += '逐漸減少';
                } else if (line.b > -speed) {
                    name += '逐漸增加';
                } else {
                    name += '快速增加';
                }
            } else {
                if (line.b > speed) {
                    append += '快速增加';
                } else if (line.b > 0) {
                    append += '逐漸增加';
                } else if (line.b > -speed) {
                    append += '逐漸減少';
                } else {
                    append += '快速減少';
                }
            }
            tags.add(append);
            append = name;
            if (interval2) {
                if (interval3) {
                    if (start > interval1) {
                        append = append + '\u5F9E' + d1;
                    } else if (start > interval2) {
                        append = append + '\u5F9E' + d2;
                    } else if (start > interval3) {
                        append = '';
                    } else if (start > interval4) {
                        append = append + '\u5F9E' + d4;
                    } else {
                        append = append + '\u5F9E' + d5;
                    }
                    if (append) {
                        tags.add(append);
                    }
                    append = name;
                    if (end > interval1) {
                        tags.add(append + '\u8B8A\u5F97' + d1);
                    } else if (end > interval2) {
                        tags.add(append + '\u8B8A\u5F97' + d2);
                    } else if (end > interval3) {} else if (end > interval4) {
                        tags.add(append + '\u8B8A\u5F97' + d4);
                    } else {
                        tags.add(append + '\u8B8A\u5F97' + d5);
                    }
                } else {
                    if (start > interval1) {
                        append = append + '\u5F9E' + d1;
                    } else if (start > interval2) {
                        append = '';
                    } else {
                        append = append + '\u5F9E' + d3;
                    }
                    if (append) {
                        tags.add(append);
                    }
                    append = name;
                    if (end > interval1) {
                        tags.add(append + '\u8B8A\u5F97' + d1);
                    } else if (end > interval2) {} else {
                        tags.add(append + '\u8B8A\u5F97' + d3);
                    }
                }
            } else {
                tags.add(append + '\u5F9E' + (start > interval1 ? d1 : d2));
                tags.add(append + '\u8B8A\u5F97' + (end > interval1 ? d1 : d2));
            }
        };
        periodChange(opcash, '營運資金', 5, false, 0, '充足', '不足');
        periodChange(cdcash, '短債資金', 5, true, 100, '不足', '充足');
        periodChange(shortcash, '安全資金', 5, true, 100, '不足', '充足');

        ly = latestYear;
        lq = latestQuarter - 1;
        for (var _i16 = 0; _i16 < 20; _i16++) {
            if (profitStatus[ly] && profitStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        y = ly - 5;
        q = lq;
        var gross_profit = [];
        var operating_profit = [];
        var profit = [];
        var roe = [];
        var leverage = [];
        var turnover = [];
        time = [];
        t = 100;
        for (var _i17 = 0; _i17 < 100; _i17++) {
            if (profitStatus[ly] && profitStatus[ly][lq]) {
                gross_profit.push(profitStatus[ly][lq].gross_profit);
                operating_profit.push(profitStatus[ly][lq].operating_profit);
                profit.push(profitStatus[ly][lq].profit);
                roe.push(profitStatus[ly][lq].roe);
                leverage.push(profitStatus[ly][lq].leverage);
                turnover.push(profitStatus[ly][lq].turnover);
                time.push(t);
                t--;
            }
            if (ly === y && q === lq) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        timeEven = caculateEven(time, true);
        timeVariance = caculateVariance(time, timeEven, true);

        periodChange(gross_profit, '毛利率', 1, false, 20, '高', '中', 10, '低');
        periodChange(operating_profit, '營益率', 0.5, false, 10, '高', '中', 5, '低');
        periodChange(profit, '淨利率', 0.5, false, 10, '高', '中', 5, '低');
        periodChange(roe, 'ROE', 0.1, false, 4, '高', '中', 2, '低');
        periodChange(leverage, '槓桿', 0.02, true, 0.6, '低', '中', 0.3, '高');
        periodChange(turnover, '週轉率', 0.015, false, 0.5, '極高', '高', 0.25, '中', 0.125, '低', 0.0625, '極低');

        ly = latestYear;
        lq = latestQuarter - 1;
        for (var _i18 = 0; _i18 < 20; _i18++) {
            if (salesStatus[ly] && salesStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        y = ly - 5;
        q = lq;
        var nonoperating = { p: 0, m: 0 };
        var tax = { p: 0, m: 0 };
        var comprehensive = { p: 0, m: 0 };
        t = 0;
        for (var _i19 = 0; _i19 < 100; _i19++) {
            if (salesStatus[ly] && salesStatus[ly][lq]) {
                if (Math.abs(salesStatus[ly][lq].nonoperating_without_FC - salesStatus[ly][lq].finance_cost) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                    salesStatus[ly][lq].nonoperating_without_FC - salesStatus[ly][lq].finance_cost > 0 ? nonoperating.p++ : nonoperating.m++;
                }
                if (Math.abs(salesStatus[ly][lq].tax) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                    salesStatus[ly][lq].tax < 0 ? tax.p++ : tax.m++;
                }
                if (Math.abs(salesStatus[ly][lq].comprehensive) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                    salesStatus[ly][lq].comprehensive > 0 ? comprehensive.p++ : comprehensive.m++;
                }
                t++;
            }
            if (ly === y && q === lq) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }

        if (nonoperating.p + nonoperating.m > 0.5 * t) {
            if (nonoperating.p > nonoperating.m * 1.5) {
                tags.add('非營業佔比過高並多數是增加');
            } else if (nonoperating.m > nonoperating.p * 1.5) {
                tags.add('非營業佔比過高並多數是減少');
            } else {
                tags.add('非營業佔比過高');
            }
        }

        if (tax.p + tax.m > 0.5 * t) {
            if (tax.p > tax.m * 1.5) {
                tags.add('稅率佔獲利過高並多數是增加');
            } else if (tax.m > tax.p * 1.5) {
                tags.add('稅率佔獲利過高並多數是減少');
            } else {
                tags.add('稅率佔獲利過高');
            }
        }

        if (comprehensive.p + comprehensive.m > 0.3 * t) {
            if (comprehensive.p > comprehensive.m * 1.5) {
                tags.add('其他綜合佔獲利過高並多數是增加');
            } else if (comprehensive.m > comprehensive.p * 1.5) {
                tags.add('其他綜合佔獲利過高並多數是減少');
            } else {
                tags.add('其他綜合佔獲利過高');
            }
        }

        ly = latestYear;
        lq = latestQuarter - 1;
        for (var _i20 = 0; _i20 < 20; _i20++) {
            if (managementStatus[ly] && managementStatus[ly][lq]) {
                break;
            } else {
                if (lq > 0) {
                    lq--;
                } else {
                    lq = 3;
                    ly--;
                }
            }
        }
        if (managementStatus[ly] && managementStatus[ly][lq]) {
            if (managementStatus[ly][lq].profitRelative > 0.7) {
                tags.add('獲利跟營收高相關');
            }
            if (managementStatus[ly][lq].cashRelative > 0.7) {
                tags.add('現金跟營收高相關');
            }
            if (managementStatus[ly][lq].inventoriesRelative > 0.7) {
                tags.add('存貨跟營收高相關');
            }
            if (managementStatus[ly][lq].receivableRelative > 0.7) {
                tags.add('應收跟營收高相關');
            }
            if (managementStatus[ly][lq].payableRelative > 0.7) {
                tags.add('應付跟營收高相關');
            }
            var revenue = [];
            var revenueP = [];
            var revenueN = [];
            var revenueF = [];
            y = ly - 5;
            q = lq;
            for (var _i21 = 0; _i21 < 100; _i21++) {
                if (managementStatus[ly] && managementStatus[ly][lq]) {
                    revenueN.push(managementStatus[ly][lq].revenue);
                    if (revenue[lq]) {
                        revenueP.push(Math.pow(revenue[lq].n / managementStatus[ly][lq].revenue, 1 / (revenue[lq].y - ly)) - 1);
                    } else {
                        revenue[lq] = {
                            y: ly,
                            n: managementStatus[ly][lq].revenue
                        };
                    }
                }
                if (ly === y && lq === q) {
                    break;
                } else {
                    if (lq > 0) {
                        lq--;
                    } else {
                        lq = 3;
                        ly--;
                    }
                }
            }
            var getSD = function getSD(p, pp, name) {
                var even = caculateEven(pp, true);
                var sd = 0;
                var start = 0;
                var end = 0;
                var yearp = 0;
                if (pp.length < 16) {
                    for (var _i22 = 0; _i22 < pp.length; _i22++) {
                        sd = sd + (pp[_i22] - even[pp.length - 3]) * (pp[_i22] - even[pp.length - 3]);
                    }
                    sd = Math.sqrt(sd / pp.length);
                    var yy = Math.floor(p.length / 4);
                    if (yy > 1) {
                        start = p[yy * 4 - 1] + p[yy * 4 - 2] + p[yy * 4 - 3] + p[yy * 4 - 4];
                        end = p[0] + p[1] + p[2] + p[3];
                        yearp = Math.pow(end / start, 1 / yy) - 1;
                        if (yearp > 0.1) {
                            tags.add(name + '\u5FEB\u901F\u6210\u9577');
                        } else if (yearp > 0.05) {
                            tags.add(name + '\u6210\u9577');
                        } else if (yearp < -0.05) {
                            tags.add(name + '\u8870\u9000');
                        }
                    }
                    tags.add(sd < 0.1 ? name + '\u7A69\u5B9A' : name + '\u4E0D\u7A69\u5B9A');
                } else {
                    for (var _i23 = 0; _i23 < 16; _i23++) {
                        sd = sd + (pp[_i23] - even[13]) * (pp[_i23] - even[13]);
                    }
                    sd = Math.sqrt(sd / 16);
                    start = p[16] + p[17] + p[18] + p[19];
                    end = p[0] + p[1] + p[2] + p[3];
                    yearp = Math.pow(end / start, 1 / 5) - 1;
                    if (yearp > 0.1) {
                        tags.add(name + '\u5FEB\u901F\u6210\u9577');
                    } else if (yearp > 0.05) {
                        tags.add(name + '\u6210\u9577');
                    } else if (yearp < -0.05) {
                        tags.add(name + '\u8870\u9000');
                    }
                    tags.add(sd < 0.1 ? name + '\u7A69\u5B9A' : name + '\u4E0D\u7A69\u5B9A');
                }
            };
            getSD(revenueN, revenueP, '營收');
        }
        var valid_tags = [];
        tags.forEach(function (i) {
            var valid_name = (0, _utility.isValidString)(i, 'name');
            if (valid_name) {
                valid_tags.push(valid_name);
            }
        });
        return [basic.stock_name[0], valid_tags];
    });
};

var getParameterV2 = function getParameterV2(data, type) {
    var text = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

    var matchProfit = data.match(new RegExp('\\>' + type + '\\<\\/td\\>([\\s\\S]+?)\\<\\/tr\\>'));
    if (!matchProfit) {
        return false;
    }
    if (text && !matchProfit[1].match(new RegExp(text))) {
        return false;
    }
    return matchProfit[1].match(/\>[\d,]+\</g).map(function (v) {
        return Number(v.replace(/[\>\<,]/g, ''));
    });
};

exports.default = {
    getSingleStockV2: function getSingleStockV2(type, obj) {
        var stage = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

        var index = obj.index;

        var _ret4 = function () {
            switch (type) {
                case 'twse':
                    var date = new Date();
                    var year = date.getFullYear();
                    var month = date.getMonth() + 1;
                    var reportType = 'C';
                    var quarter = 3;
                    if (month < 4) {
                        quarter = 4;
                        year--;
                    } else if (month < 7) {
                        quarter = 1;
                    } else if (month < 10) {
                        quarter = 2;
                    }
                    var latestQuarter = 0;
                    var latestYear = 0;
                    if (stage === 0) {
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('no finance data'))
                        };
                    } else {
                        var _ret5 = function () {
                            var id_db = null;
                            var normal_tags = [];
                            var not = 0;
                            var profit = 0;
                            var equity = 0;
                            var netValue = 0;
                            var dividends = 0;
                            var needDividends = false;
                            var final_stage = function final_stage(price) {
                                return handleStockTagV2(type, index, obj.tag).then(function (_ref) {
                                    var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
                                        name = _ref2[0],
                                        tags = _ref2[1];

                                    var stock_default = [];
                                    var _iteratorNormalCompletion2 = true;
                                    var _didIteratorError2 = false;
                                    var _iteratorError2 = undefined;

                                    try {
                                        for (var _iterator2 = (0, _getIterator3.default)(tags), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                            var t = _step2.value;

                                            var normal = (0, _tagTool.normalize)(t);
                                            if (!(0, _tagTool.isDefaultTag)(normal)) {
                                                if (normal_tags.indexOf(normal) === -1) {
                                                    normal_tags.push(normal);
                                                    stock_default.push(normal);
                                                }
                                            }
                                        }
                                    } catch (err) {
                                        _didIteratorError2 = true;
                                        _iteratorError2 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                                                _iterator2.return();
                                            }
                                        } finally {
                                            if (_didIteratorError2) {
                                                throw _iteratorError2;
                                            }
                                        }
                                    }

                                    var per = profit === 0 ? 0 : Math.round(price / profit * equity * 10) / 100;
                                    var pdr = dividends === 0 ? 0 : Math.round(price / dividends * equity * 10) / 100;
                                    var pbr = netValue === 0 ? 0 : Math.round(price / netValue * equity * 10) / 100;
                                    console.log(per);
                                    console.log(pdr);
                                    console.log(pbr);
                                    var retObj = function retObj() {
                                        return id_db ? (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id_db }, { $set: {
                                                price: price,
                                                profit: profit,
                                                equity: equity,
                                                dividends: dividends,
                                                netValue: netValue,
                                                per: per,
                                                pdr: pdr,
                                                pbr: pbr,
                                                latestQuarter: latestQuarter,
                                                latestYear: latestYear,
                                                tags: normal_tags,
                                                name: name,
                                                stock_default: stock_default
                                            } }).then(function (item) {
                                            return id_db;
                                        }) : (0, _mongoTool2.default)('insert', _constants.STOCKDB, {
                                            type: type,
                                            index: index,
                                            name: name,
                                            price: price,
                                            profit: profit,
                                            equity: equity,
                                            dividends: dividends,
                                            netValue: netValue,
                                            per: per,
                                            pdr: pdr,
                                            pbr: pbr,
                                            latestQuarter: latestQuarter,
                                            latestYear: latestYear,
                                            //tags: normal_tags,
                                            important: 0,
                                            stock_default: stock_default
                                        }).then(function (item) {
                                            return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: item[0]._id }, { $set: { tags: normal_tags } }).then(function () {
                                                return item[0]._id;
                                            });
                                        });
                                    };
                                    return retObj().then(function (id) {
                                        return {
                                            per: per,
                                            pdr: pdr,
                                            pbr: pbr,
                                            latestQuarter: latestQuarter,
                                            latestYear: latestYear,
                                            stockName: type + ' ' + index + ' ' + name,
                                            id: id
                                        };
                                    });
                                });
                            };
                            var wait_count = 0;
                            var recur_getTwseProfit = function recur_getTwseProfit() {
                                console.log(year);
                                console.log(quarter);
                                return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/server-java/t164sb01?step=1&CO_ID=' + index + '&SYEAR=' + year + '&SSEASON=' + quarter + '&REPORT_ID=' + reportType).then(function (raw_data) {
                                    if ((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'h4')[0]) {
                                        if (latestQuarter) {
                                            return (0, _utility.handleError)(new _utility.HoError('too short stock data'));
                                        } else {
                                            not++;
                                            if (not > 8) {
                                                return (0, _utility.handleError)(new _utility.HoError('cannot find stock data'));
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
                                            return (0, _utility.handleError)(new _utility.HoError('too much wait'));
                                        } else {
                                            wait_count++;
                                            console.log('wait');
                                            console.log(wait_count);
                                            return new _promise2.default(function (resolve, reject) {
                                                return setTimeout(function () {
                                                    return resolve(recur_getTwseProfit());
                                                }, 20000);
                                            });
                                        }
                                    } else {
                                        wait_count = 0;
                                        var profitArr = getParameterV2(raw_data, 7900, '繼續營業單位稅前淨利（淨損）');
                                        if (!profitArr) {
                                            profitArr = getParameterV2(raw_data, 6100, '繼續營業單位稅前淨利（淨損）');
                                            if (!profitArr) {
                                                profitArr = getParameterV2(raw_data, 61001, '繼續營業單位稅前淨利（淨損）');
                                                if (!profitArr) {
                                                    profitArr = getParameterV2(raw_data, 62000, '繼續營業單位稅前淨利（淨損）');
                                                    if (!profitArr) {
                                                        profitArr = getParameterV2(raw_data, 61000, '繼續營業單位稅前淨利（淨損）');
                                                        if (!profitArr) {
                                                            return (0, _utility.handleError)(new _utility.HoError('cannot find stock profit'));
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        if (!equity) {
                                            equity = getParameterV2(raw_data, 3100, '股本合計');
                                            if (!equity) {
                                                equity = getParameterV2(raw_data, 31100, '股本合計');
                                                if (!equity) {
                                                    equity = getParameterV2(raw_data, 31000, '股本合計');
                                                    if (!equity) {
                                                        return (0, _utility.handleError)(new _utility.HoError('cannot find stock equity'));
                                                    } else {
                                                        equity = equity[0];
                                                    }
                                                } else {
                                                    equity = equity[0];
                                                }
                                            } else {
                                                equity = equity[0];
                                            }
                                        }
                                        if (!netValue) {
                                            netValue = getParameterV2(raw_data, '3XXX', '權益總計');
                                            if (!netValue) {
                                                netValue = getParameterV2(raw_data, 30000, '權益總計');
                                                if (!netValue) {
                                                    netValue = getParameterV2(raw_data, '3XXXX', '權益總額');
                                                    if (!netValue) {
                                                        netValue = getParameterV2(raw_data, 39999, '權益總計');
                                                        if (!netValue) {
                                                            netValue = getParameterV2(raw_data, 39999, '權益總額');
                                                            if (!netValue) {
                                                                netValue = getParameterV2(raw_data, '3XXX', '權益總額');
                                                                if (!netValue) {
                                                                    netValue = getParameterV2(raw_data, '3XXXX', '權益總計');
                                                                    if (!netValue) {
                                                                        return (0, _utility.handleError)(new _utility.HoError('cannot find stock net value'));
                                                                    } else {
                                                                        netValue = netValue[0];
                                                                    }
                                                                } else {
                                                                    netValue = netValue[0];
                                                                }
                                                            } else {
                                                                netValue = netValue[0];
                                                            }
                                                        } else {
                                                            netValue = netValue[0];
                                                        }
                                                    } else {
                                                        netValue = netValue[0];
                                                    }
                                                } else {
                                                    netValue = netValue[0];
                                                }
                                            } else {
                                                netValue = netValue[0];
                                            }
                                        }
                                        var matchDividends = getParameterV2(raw_data, 'C04500');
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
                                                    return getStockPrice(type, index).then(function (price) {
                                                        return final_stage(price);
                                                    });
                                                }
                                                break;
                                            case 3:
                                            case 2:
                                                if (needDividends) {
                                                    console.log(profit);
                                                    console.log(equity);
                                                    console.log(netValue);
                                                    console.log(dividends);
                                                    return getStockPrice(type, index).then(function (price) {
                                                        return final_stage(price);
                                                    });
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
                            };
                            return {
                                v: {
                                    v: (0, _mongoTool2.default)('find', _constants.STOCKDB, { type: type, index: index }, { limit: 1 }).then(function (items) {
                                        if (items.length > 0) {
                                            id_db = items[0]._id;
                                            var _iteratorNormalCompletion3 = true;
                                            var _didIteratorError3 = false;
                                            var _iteratorError3 = undefined;

                                            try {
                                                for (var _iterator3 = (0, _getIterator3.default)(items[0].tags), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                                    var i = _step3.value;

                                                    if (items[0].stock_default) {
                                                        if (!items[0].stock_default.includes(i)) {
                                                            normal_tags.push(i);
                                                        }
                                                    } else {
                                                        normal_tags.push(i);
                                                    }
                                                }
                                            } catch (err) {
                                                _didIteratorError3 = true;
                                                _iteratorError3 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                                        _iterator3.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError3) {
                                                        throw _iteratorError3;
                                                    }
                                                }
                                            }
                                        }
                                        return recur_getTwseProfit();
                                    })
                                }
                            };
                        }();

                        if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
                    }
                    break;
                case 'usse':
                    if (stage === 0) {
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('no finance data'))
                        };
                    } else {
                        var _ret6 = function () {
                            var id_db = null;
                            var normal_tags = [];
                            return {
                                v: {
                                    v: (0, _mongoTool2.default)('find', _constants.STOCKDB, { type: type, index: index }, { limit: 1 }).then(function (items) {
                                        if (items.length > 0) {
                                            id_db = items[0]._id;
                                            var _iteratorNormalCompletion4 = true;
                                            var _didIteratorError4 = false;
                                            var _iteratorError4 = undefined;

                                            try {
                                                for (var _iterator4 = (0, _getIterator3.default)(items[0].tags), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                                    var i = _step4.value;

                                                    if (items[0].stock_default) {
                                                        if (!items[0].stock_default.includes(i)) {
                                                            normal_tags.push(i);
                                                        }
                                                    } else {
                                                        normal_tags.push(i);
                                                    }
                                                }
                                            } catch (err) {
                                                _didIteratorError4 = true;
                                                _iteratorError4 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                                                        _iterator4.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError4) {
                                                        throw _iteratorError4;
                                                    }
                                                }
                                            }
                                        }
                                        return getUsStock(index, ['price', 'per', 'pdr', 'pbr']).then(function (ret) {
                                            return handleStockTagV2(type, index, obj.tag).then(function (_ref3) {
                                                var _ref4 = (0, _slicedToArray3.default)(_ref3, 2),
                                                    name = _ref4[0],
                                                    tags = _ref4[1];

                                                console.log(ret);
                                                var stock_default = [];
                                                var _iteratorNormalCompletion5 = true;
                                                var _didIteratorError5 = false;
                                                var _iteratorError5 = undefined;

                                                try {
                                                    for (var _iterator5 = (0, _getIterator3.default)(tags), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                                        var t = _step5.value;

                                                        var normal = (0, _tagTool.normalize)(t);
                                                        if (!(0, _tagTool.isDefaultTag)(normal)) {
                                                            if (normal_tags.indexOf(normal) === -1) {
                                                                normal_tags.push(normal);
                                                                stock_default.push(normal);
                                                            }
                                                        }
                                                    }
                                                } catch (err) {
                                                    _didIteratorError5 = true;
                                                    _iteratorError5 = err;
                                                } finally {
                                                    try {
                                                        if (!_iteratorNormalCompletion5 && _iterator5.return) {
                                                            _iterator5.return();
                                                        }
                                                    } finally {
                                                        if (_didIteratorError5) {
                                                            throw _iteratorError5;
                                                        }
                                                    }
                                                }

                                                var retObj = function retObj() {
                                                    return id_db ? (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id_db }, { $set: {
                                                            price: ret.price,
                                                            per: ret.per,
                                                            pdr: ret.pdr,
                                                            pbr: ret.pbr,
                                                            latestQuarter: ret.latestQuarter,
                                                            latestYear: ret.latestYear,
                                                            tags: normal_tags,
                                                            name: name,
                                                            stock_default: stock_default
                                                        } }).then(function (item) {
                                                        return id_db;
                                                    }) : (0, _mongoTool2.default)('insert', _constants.STOCKDB, {
                                                        type: type,
                                                        index: index,
                                                        name: name,
                                                        price: ret.price,
                                                        per: ret.per,
                                                        pdr: ret.pdr,
                                                        pbr: ret.pbr,
                                                        latestQuarter: ret.latestQuarter,
                                                        latestYear: ret.latestYear,
                                                        //tags: normal_tags,
                                                        important: 0,
                                                        stock_default: stock_default
                                                    }).then(function (item) {
                                                        return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: item[0]._id }, { $set: { tags: normal_tags } }).then(function () {
                                                            return item[0]._id;
                                                        });
                                                    });
                                                };
                                                return retObj().then(function (id) {
                                                    return {
                                                        per: ret.per,
                                                        pdr: ret.pdr,
                                                        pbr: ret.pbr,
                                                        latestQuarter: ret.latestQuarter,
                                                        latestYear: ret.latestYear,
                                                        stockName: type + ' ' + index + ' ' + name,
                                                        id: id
                                                    };
                                                });
                                            });
                                        });
                                    })
                                }
                            };
                        }();

                        if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
                    }
                    break;
                default:
                    return {
                        v: (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'))
                    };
            }
        }();

        if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
    },
    getSingleStock: function getSingleStock(type, index) {
        var stage = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var quarter = 3;
        if (month < 4) {
            quarter = 4;
            year--;
        } else if (month < 7) {
            quarter = 1;
        } else if (month < 10) {
            quarter = 2;
        }
        var latestQuarter = 0;
        var latestYear = 0;
        var cash = {};
        var asset = {};
        var sales = {};
        if (stage === 0) {
            return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: type }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
                }
                cash = items[0].cash;
                asset = items[0].asset;
                sales = items[0].sales;
                var cashStatus = getCashStatus(cash, asset);
                var salesStatus = getSalesStatus(sales, asset);
                var earliestYear = 0;
                var earliestQuarter = 0;
                for (var i in cashStatus) {
                    if (!earliestYear) {
                        earliestYear = Number(i);
                    }
                    latestYear = Number(i);
                    for (var j in cashStatus[i]) {
                        if (cash[i][j]) {
                            if (!earliestQuarter) {
                                earliestQuarter = Number(j) + 1;
                            }
                            latestQuarter = Number(j) + 1;
                        }
                    }
                }
                StockTagTool.setLatest(items[0]._id, index).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Set latest');
                });
                return {
                    cash: cash,
                    asset: asset,
                    sales: sales,
                    cashStatus: cashStatus,
                    assetStatus: getAssetStatus(asset),
                    salesStatus: salesStatus,
                    profitStatus: getProfitStatus(salesStatus, cashStatus, asset),
                    safetyStatus: getSafetyStatus(salesStatus, cashStatus, asset),
                    managementStatus: getManagementStatus(salesStatus, asset),
                    latestYear: latestYear,
                    latestQuarter: latestQuarter,
                    earliestYear: earliestYear,
                    earliestQuarter: earliestQuarter,
                    profitIndex: items[0].profitIndex,
                    managementIndex: items[0].managementIndex,
                    safetyIndex: items[0].safetyIndex,
                    stockName: items[0].type + ' ' + items[0].index + ' ' + items[0].name
                };
            });
        } else {
            var _ret7 = function () {
                var id_db = null;
                var normal_tags = [];
                var is_start = false;
                var not = 0;
                var wait = 0;
                var recur_getTwseXml = function recur_getTwseXml() {
                    console.log(year);
                    console.log(quarter);
                    var final_stage = function final_stage() {
                        var cashStatus = getCashStatus(cash, asset);
                        var assetStatus = getAssetStatus(asset);
                        var salesStatus = getSalesStatus(sales, asset);
                        var profitStatus = getProfitStatus(salesStatus, cashStatus, asset);
                        var safetyStatus = getSafetyStatus(salesStatus, cashStatus, asset);
                        var managementStatus = getManagementStatus(salesStatus, asset);
                        var earliestYear = 0;
                        var earliestQuarter = 0;
                        for (var i in cashStatus) {
                            earliestYear = Number(i);
                            for (var j in cashStatus[i]) {
                                if (cashStatus[i][j]) {
                                    earliestQuarter = Number(j) + 1;
                                    break;
                                }
                            }
                            break;
                        }
                        if (!cashStatus || !cashStatus[earliestYear] || cashStatus[earliestYear].length === 0) {
                            console.log('stock finance data not exist');
                            return false;
                        }
                        var profitIndex = getProfitIndex(profitStatus, earliestYear, latestYear);
                        var safetyIndex = getSafetyIndex(safetyStatus, earliestYear, latestYear);
                        var managementIndex = getManagementIndex(managementStatus, latestYear, latestQuarter);
                        return handleStockTag(type, index, latestYear, latestQuarter, assetStatus, cashStatus, safetyStatus, profitStatus, salesStatus, managementStatus).then(function (_ref5) {
                            var _ref6 = (0, _slicedToArray3.default)(_ref5, 2),
                                name = _ref6[0],
                                tags = _ref6[1];

                            var stock_default = [];
                            var _iteratorNormalCompletion6 = true;
                            var _didIteratorError6 = false;
                            var _iteratorError6 = undefined;

                            try {
                                for (var _iterator6 = (0, _getIterator3.default)(tags), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                                    var t = _step6.value;

                                    var normal = (0, _tagTool.normalize)(t);
                                    if (!(0, _tagTool.isDefaultTag)(normal)) {
                                        if (normal_tags.indexOf(normal) === -1) {
                                            normal_tags.push(normal);
                                            stock_default.push(normal);
                                        }
                                    }
                                }
                            } catch (err) {
                                _didIteratorError6 = true;
                                _iteratorError6 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion6 && _iterator6.return) {
                                        _iterator6.return();
                                    }
                                } finally {
                                    if (_didIteratorError6) {
                                        throw _iteratorError6;
                                    }
                                }
                            }

                            var retObj = function retObj() {
                                return id_db ? (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id_db }, { $set: {
                                        cash: cash,
                                        asset: asset,
                                        sales: sales,
                                        profitIndex: profitIndex,
                                        safetyIndex: safetyIndex,
                                        managementIndex: managementIndex,
                                        tags: normal_tags,
                                        name: name,
                                        stock_default: stock_default
                                    } }).then(function (item) {
                                    return id_db;
                                }) : (0, _mongoTool2.default)('insert', _constants.STOCKDB, {
                                    type: type,
                                    index: index,
                                    name: name,
                                    cash: cash,
                                    asset: asset,
                                    sales: sales,
                                    profitIndex: profitIndex,
                                    safetyIndex: safetyIndex,
                                    managementIndex: managementIndex,
                                    //tags: normal_tags,
                                    important: 0,
                                    stock_default: stock_default
                                }).then(function (item) {
                                    return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: item[0]._id }, { $set: { tags: normal_tags } }).then(function () {
                                        return item[0]._id;
                                    });
                                });
                            };
                            return retObj().then(function (id) {
                                return {
                                    cash: cash,
                                    asset: asset,
                                    sales: sales,
                                    cashStatus: cashStatus,
                                    assetStatus: assetStatus,
                                    salesStatus: salesStatus,
                                    profitStatus: profitStatus,
                                    safetyStatus: safetyStatus,
                                    managementStatus: managementStatus,
                                    latestYear: latestYear,
                                    latestQuarter: latestQuarter,
                                    earliestYear: earliestYear,
                                    earliestQuarter: earliestQuarter,
                                    profitIndex: profitIndex,
                                    managementIndex: managementIndex,
                                    safetyIndex: safetyIndex,
                                    stockName: type + ' ' + index + ' ' + name,
                                    id: id
                                };
                            });
                        });
                    };
                    var xml_path = '/mnt/stock/' + type + '/' + index + '/' + year + quarter + '.xml';
                    var parseXml = function parseXml() {
                        return initXml(xml_path).then(function (xml) {
                            cash = getCashflow(xml, cash, is_start);
                            if (!cash) {
                                return (0, _utility.handleError)(new _utility.HoError('xml cash parse error!!!'));
                            }
                            asset = getAsset(xml, asset, is_start);
                            if (!asset) {
                                return (0, _utility.handleError)(new _utility.HoError('xml asset parse error!!!'));
                            }
                            sales = getSales(xml, sales, cash, is_start);
                            if (!sales) {
                                return (0, _utility.handleError)(new _utility.HoError('xml sales parse error!!!'));
                            }
                            wait = 0;
                            is_start = true;
                            if (!latestQuarter && !latestYear) {
                                latestQuarter = quarter;
                                latestYear = year;
                            }
                            quarter--;
                            if (quarter < 1) {
                                quarter = 4;
                                year--;
                            }
                            return recur_getTwseXml();
                        });
                    };
                    if (stage < 3 && is_start && (0, _fs.existsSync)(xml_path) && (0, _fs.statSync)(xml_path)['size'] >= 10000) {
                        console.log('exist');
                        if (stage < 2 && cash[year - 1] && cash[year - 1][quarter - 1] && asset[year - 1] && asset[year - 1][quarter - 1] && sales[year - 1] && sales[year - 1][quarter - 1]) {
                            console.log('done');
                            if (!latestQuarter && !latestYear) {
                                latestQuarter = quarter;
                                latestYear = year;
                            }
                            wait = 0;
                            quarter--;
                            if (quarter < 1) {
                                quarter = 4;
                                year--;
                            }
                            return recur_getTwseXml();
                        } else {
                            console.log('parse');
                            /*if (year === 2018 && quarter === 3) {
                                return final_stage();
                            } else {*/
                            return parseXml();
                            //}
                        }
                    } else {
                        return getTwseXml(index, year, quarter, xml_path).catch(function (err) {
                            return err.code !== 'HPE_INVALID_CONSTANT' ? (0, _utility.handleError)(err) : _promise2.default.resolve(err);
                        }).then(function (err) {
                            var filesize = err ? 0 : (0, _fs.statSync)(xml_path)['size'];
                            console.log(filesize);
                            if (wait > 150000 || filesize === 350 || err) {
                                if (err) {
                                    (0, _utility.handleError)(err, 'Get Twse Xml');
                                }
                                if (wait > 150000 || filesize === 350 || err.code === 'HPE_INVALID_CONSTANT') {
                                    if (filesize === 350) {
                                        (0, _fs.unlinkSync)(xml_path);
                                    }
                                    if (is_start) {
                                        return final_stage();
                                    } else {
                                        console.log('not');
                                        if (not > 4) {
                                            console.log('stock finance data not exist');
                                        } else {
                                            not++;
                                            quarter--;
                                            if (quarter < 1) {
                                                quarter = 4;
                                                year--;
                                            }
                                            wait = 0;
                                            return recur_getTwseXml();
                                        }
                                    }
                                }
                            } else {
                                if (filesize < 10000) {
                                    (0, _fs.unlinkSync)(xml_path);
                                    wait += 10000;
                                    console.log(wait);
                                    return new _promise2.default(function (resolve, reject) {
                                        return setTimeout(function () {
                                            return resolve(recur_getTwseXml());
                                        }, wait);
                                    });
                                } else {
                                    console.log('ok');
                                    return parseXml();
                                }
                            }
                        });
                    }
                };
                return {
                    v: (0, _mongoTool2.default)('find', _constants.STOCKDB, { type: type, index: index }, { limit: 1 }).then(function (items) {
                        if (items.length > 0) {
                            id_db = items[0]._id;
                            var _iteratorNormalCompletion7 = true;
                            var _didIteratorError7 = false;
                            var _iteratorError7 = undefined;

                            try {
                                for (var _iterator7 = (0, _getIterator3.default)(items[0].tags), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                                    var i = _step7.value;

                                    if (items[0].stock_default) {
                                        if (!items[0].stock_default.includes(i)) {
                                            normal_tags.push(i);
                                        }
                                    } else {
                                        normal_tags.push(i);
                                    }
                                }
                            } catch (err) {
                                _didIteratorError7 = true;
                                _iteratorError7 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion7 && _iterator7.return) {
                                        _iterator7.return();
                                    }
                                } finally {
                                    if (_didIteratorError7) {
                                        throw _iteratorError7;
                                    }
                                }
                            }

                            if (stage < 2) {
                                cash = items[0].cash;
                                asset = items[0].asset;
                                sales = items[0].sales;
                            }
                        }
                        var mkfolder = function mkfolder(folderPath) {
                            return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                                return (0, _mkdirp2.default)(folderPath, function (err) {
                                    return err ? reject(err) : resolve();
                                });
                            });
                        };
                        return mkfolder('/mnt/stock/' + type + '/' + index).then(function () {
                            return recur_getTwseXml();
                        });
                    })
                };
            }();

            if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
        }
    },
    getStockPERV2: function getStockPERV2(id) {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }
            var start = items[0].latestQuarter === 0 ? items[0].latestYear - 1912 + '12' : '' + (items[0].latestYear - 1911) + (0, _utility.completeZero)(items[0].latestQuarter * 3, 2);
            switch (items[0].type) {
                case 'twse':
                    return getStockPrice(items[0].type, items[0].index).then(function (price) {
                        var per = items[0].profit === 0 ? 0 : Math.round(price / items[0].profit * items[0].equity * 10) / 100;
                        var pdr = items[0].dividends === 0 ? 0 : Math.round(price / items[0].dividends * items[0].equity * 10) / 100;
                        var pbr = items[0].netValue === 0 ? 0 : Math.round(price / items[0].netValue * items[0].equity * 10) / 100;
                        return [per, pdr, pbr, items[0].index, start];
                    });
                    break;
                case 'usse':
                    return [items[0].per, items[0].pdr, items[0].pbr, items[0].index, start];
                    break;
                default:
                    return (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getStockPER: function getStockPER(id) {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }
            var yearEPS = getEPS(items[0].sales);
            return yearEPS.eps > 0 ? getStockPrice(items[0].type, items[0].index).then(function (price) {
                return [Math.ceil(price / yearEPS.eps * 1000) / 1000, items[0].index, yearEPS.start];
            }) : [-Math.floor(-yearEPS.eps * 1000) / 1000, items[0].index, yearEPS.start];
        });
    },
    getStockYield: function getStockYield(id) {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }

            var _ret8 = function () {
                switch (items[0].type) {
                    case 'twse':
                        var count = 0;
                        var getTable = function getTable(index) {
                            return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/mops/web/ajax_t05st09?encodeURIComponent=1&step=1&firstin=1&off=1&keyword4=' + items[0].index + '&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&isnew=true&co_id=' + items[0].index).then(function (raw_data) {
                                var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'table', 'hasBorder')[0];
                                if (!table) {
                                    return (0, _utility.handleError)(new _utility.HoError('heavy query'));
                                }
                                return table;
                            }).catch(function (err) {
                                if (err.name === 'HoError' && err.message === 'heavy query') {
                                    console.log(count);
                                    (0, _utility.handleError)(err, 'Stock yield');
                                    if (++count > _constants.MAX_RETRY) {
                                        return (0, _utility.handleError)(new _utility.HoError('twse yield fail'));
                                    }
                                    return new _promise2.default(function (resolve, reject) {
                                        return setTimeout(function () {
                                            return resolve(getTable(count + 1));
                                        }, 60000);
                                    });
                                } else {
                                    return (0, _utility.handleError)(err);
                                }
                            });
                        };
                        return {
                            v: getTable(0).then(function (table) {
                                var dividends = 0;
                                (0, _utility.findTag)((0, _utility.findTag)(table, 'tr', 'odd')[0], 'td').forEach(function (d) {
                                    var t = (0, _utility.findTag)(d)[0];
                                    if (t) {
                                        var dMatch = t.match(/^\d+\.\d+/);
                                        if (dMatch) {
                                            dividends += Number(dMatch[0]);
                                        }
                                    }
                                });
                                console.log(dividends);
                                return getStockPrice(items[0].type, items[0].index).then(function (price) {
                                    return dividends > 0 ? Math.ceil(price / dividends * 1000) / 1000 : 0;
                                });
                            })
                        };
                    default:
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'))
                        };
                }
            }();

            if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
        });
    },
    getPredictPER: function getPredictPER(id, session) {
        var is_latest = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

        var date = new Date();
        var year = date.getFullYear() - 1911;
        var month = date.getMonth() + 1;
        var month_str = (0, _utility.completeZero)(month.toString(), 2);
        var latest_date = '' + year + month_str;
        console.log(year);
        console.log(month_str);
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }
            switch (items[0].type) {
                case 'twse':
                    StockTagTool.setLatest(items[0]._id, session).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Set latest');
                    });
                    return (0, _redisTool2.default)('hgetall', 'sales: ' + items[0].type + items[0].index).then(function (item) {
                        var getInit = function getInit() {
                            return item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                        };
                        return getInit();
                    }).then(function (_ref7) {
                        var _ref8 = (0, _slicedToArray3.default)(_ref7, 3),
                            raw_list = _ref8[0],
                            ret_obj = _ref8[1],
                            etime = _ref8[2];

                        var sales_data = null;
                        var sales_per = [];
                        var sales_num = [];
                        var sales_pre = [];
                        var start_month = '';
                        var rest_predict = function rest_predict(index) {
                            if (month === 1) {
                                year--;
                                month = 12;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            } else {
                                month--;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            }
                            console.log(year);
                            console.log(month_str);
                            if (index < 30 && sales_num.length < 24) {
                                return recur_mp(index + 1);
                            }
                            var predict_index = 0;
                            if (sales_num.length < 6) {
                                predict_index = -9999;
                            } else {
                                var season_adjust = function season_adjust(start, end, list) {
                                    var year_sales = 0;
                                    var previous_sales = 0;
                                    var j = 0;
                                    for (var i in sales_num) {
                                        if (i < start) {
                                            continue;
                                        }
                                        if (i > end) {
                                            break;
                                        }
                                        year_sales += sales_num[i];
                                        previous_sales += sales_pre[i];
                                        j++;
                                    }
                                    console.log(j);
                                    var year_diff = (year_sales - previous_sales) / (j * (j - 1) / 2);
                                    var k = 0;
                                    for (var _i24 in sales_num) {
                                        if (_i24 < start) {
                                            continue;
                                        }
                                        if (_i24 > end) {
                                            break;
                                        }
                                        var expect = Math.round(previous_sales / j + year_diff * (j - 1 - _i24));
                                        list[k] = list[k] ? Math.round((list[k] + (sales_num[_i24] / expect - 1) * 100) / 2 * 10) / 10 : Math.round((sales_num[_i24] / expect - 1) * 1000) / 10;
                                        k++;
                                    }
                                    return {
                                        list: list,
                                        per: Math.round((year_sales / previous_sales - 1) * 1000) / 10
                                    };
                                };
                                var result = season_adjust(0, 11, []);
                                var year_per = result.per;
                                var season_list = season_adjust(12, 23, result.list).list;
                                var month_per = Math.round((sales_num[0] * (100 + season_list[0]) / (sales_num[1] * (100 + season_list[1])) - 1) * 1000) / 10;
                                var quarter_per = Math.round(((sales_num[0] * (100 + season_list[0]) + sales_num[1] * (100 + season_list[1]) + sales_num[2] * (100 + season_list[2])) / (sales_num[3] * (100 + season_list[3]) + sales_num[4] * (100 + season_list[4]) + sales_num[5] * (100 + season_list[5])) - 1) * 1000) / 10;
                                console.log(month_per);
                                console.log(quarter_per);
                                console.log(year_per);
                                predict_index = month_per - quarter_per > 0 ? Math.pow(month_per - quarter_per, 2) : -Math.pow(month_per - quarter_per, 2);
                                predict_index = month_per - year_per > 0 ? predict_index + Math.pow(month_per - year_per, 2) : predict_index - Math.pow(month_per - year_per, 2);
                                predict_index = year_per - quarter_per > 0 ? predict_index + Math.pow(year_per - quarter_per, 2) : predict_index - Math.pow(year_per - quarter_per, 2);
                                predict_index = predict_index > 0 ? Math.round(Math.sqrt(predict_index) * 10) / 10 : -Math.round(Math.sqrt(-predict_index) * 10) / 10;
                            }
                            console.log('done');
                            return _promise2.default.resolve([sales_data, predict_index + ' ' + start_month + ' ' + sales_num.length]);
                        };
                        var recur_mp = function recur_mp(index) {
                            if (raw_list && raw_list[year] && raw_list[year][month_str]) {
                                if (!start_month) {
                                    start_month = '' + year + month_str;
                                }
                                sales_num.push(raw_list[year][month_str].num);
                                sales_per.push(raw_list[year][month_str].per);
                                sales_pre.push(raw_list[year][month_str].pre);
                                if (!sales_data) {
                                    sales_data = {};
                                }
                                if (!sales_data[year]) {
                                    sales_data[year] = {};
                                }
                                sales_data[year][month_str] = {
                                    num: raw_list[year][month_str].num,
                                    per: raw_list[year][month_str].per,
                                    pre: raw_list[year][month_str].pre
                                };
                                return rest_predict(index);
                            } else {
                                var _ret9 = function () {
                                    var count = 0;
                                    var getTable = function getTable() {
                                        return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/mops/web/ajax_t05st10_ifrs?encodeURIComponent=1&run=Y&step=0&yearmonth=' + year + month_str + '&colorchg=&TYPEK=all&co_id=' + items[0].index + '&off=1&year=' + year + '&month=' + month_str + '&firstin=true').then(function (raw_data) {
                                            if (raw_data.length > 400) {
                                                var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                                                var table = (0, _utility.findTag)(body, 'table', 'hasBorder')[0];
                                                if (!table) {
                                                    if (raw_data.match(/(資料庫中查無需求資料|外國發行人免申報本項資訊)/)) {
                                                        return false;
                                                    } else {
                                                        return (0, _utility.handleError)(new _utility.HoError('heavy query'));
                                                    }
                                                }
                                                return table;
                                            } else if (raw_data.length > 300) {
                                                console.log(raw_data);
                                                /*if (sales_data) {
                                                    Redis('hmset', `sales: ${items[0].type}${items[0].index}`, {
                                                        raw_list: JSON.stringify(sales_data),
                                                        ret_obj,
                                                        etime,
                                                    }).catch(err => handleError(err, 'Redis'));
                                                }*/
                                                return (0, _utility.handleError)(new _utility.HoError('heavy query'));
                                            } else {
                                                return false;
                                            }
                                        }).catch(function (err) {
                                            if (err.name === 'HoError' && err.message === 'heavy query') {
                                                console.log(count);
                                                (0, _utility.handleError)(err, 'Stock predict');
                                                if (++count > _constants.MAX_RETRY) {
                                                    return (0, _utility.handleError)(new _utility.HoError('twse predict fail'));
                                                }
                                                return new _promise2.default(function (resolve, reject) {
                                                    return setTimeout(function () {
                                                        return resolve(getTable());
                                                    }, 60000);
                                                });
                                            } else {
                                                return (0, _utility.handleError)(err);
                                            }
                                        });
                                    };
                                    return {
                                        v: getTable().then(function (table) {
                                            if (table) {
                                                if (!start_month) {
                                                    start_month = '' + year + month_str;
                                                }
                                                (0, _utility.findTag)(table, 'tr').forEach(function (t) {
                                                    var th = (0, _utility.findTag)(t, 'th')[0];
                                                    var td = (0, _utility.findTag)(t, 'td');
                                                    var text = th && td[0] ? (0, _utility.findTag)(th)[0] : td[0] ? (0, _utility.findTag)(td[0])[0] : '';
                                                    var number = th && td[0] ? (0, _utility.findTag)(td[0])[0] : td[0] ? (0, _utility.findTag)(td[1])[0] : '';
                                                    switch (text) {
                                                        case '本月':
                                                            sales_num.push(Number(number.match(/[0-9,]+/)[0].replace(/,/g, '')));
                                                            break;
                                                        case '去年同期':
                                                            sales_pre.push(Number(number.match(/[0-9,]+/)[0].replace(/,/g, '')));
                                                            break;
                                                        case '增減百分比':
                                                            sales_per.push(Number(number.match(/-?[0-9\.]+/)[0]));
                                                            break;
                                                    }
                                                });
                                                if (!sales_data) {
                                                    sales_data = {};
                                                }
                                                if (!sales_data[year]) {
                                                    sales_data[year] = {};
                                                }
                                                sales_data[year][month_str] = {
                                                    num: sales_num[sales_num.length - 1],
                                                    per: sales_per[sales_per.length - 1],
                                                    pre: sales_pre[sales_pre.length - 1]
                                                };
                                            }
                                            return rest_predict(index);
                                        })
                                    };
                                }();

                                if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
                            }
                        };
                        var exGet = function exGet() {
                            return etime === -1 || !etime || etime < new Date().getTime() / 1000 ? recur_mp(0) : _promise2.default.resolve([null, ret_obj]);
                        };
                        return exGet().then(function (_ref9) {
                            var _ref10 = (0, _slicedToArray3.default)(_ref9, 2),
                                raw_list = _ref10[0],
                                ret_obj = _ref10[1];

                            if (raw_list) {
                                (0, _redisTool2.default)('hmset', 'sales: ' + items[0].type + items[0].index, {
                                    raw_list: (0, _stringify2.default)(raw_list),
                                    ret_obj: ret_obj,
                                    etime: Math.round(new Date().getTime() / 1000 + _constants.CACHE_EXPIRE)
                                }).catch(function (err) {
                                    return (0, _utility.handleError)(err, 'Redis');
                                });
                            }
                            //先拿掉 觀察一陣子看看
                            /*if (is_latest) {
                                const uDate = ret_obj.match(/(\d+) (\d+)$/);
                                if (!uDate || uDate[1] !== latest_date) {
                                    ret_obj = `-9999 ${latest_date} ${uDate[2]}`;
                                }
                            }*/
                            return [ret_obj, items[0].index];
                        });
                    });
                default:
                    return (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getPredictPERWarp: function getPredictPERWarp(id, session) {
        var is_latest = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

        if (stockPredicting) {
            return (0, _utility.handleError)(new _utility.HoError('there is another predict running'));
        }
        stockPredicting = true;
        return this.getPredictPER(id, session, is_latest).then(function (_ref11) {
            var _ref12 = (0, _slicedToArray3.default)(_ref11, 2),
                result = _ref12[0],
                index = _ref12[1];

            stockPredicting = false;
            return [result, index];
        }).catch(function (err) {
            stockPredicting = false;
            return (0, _utility.handleError)(err);
        });
    },
    /*getStockPoint: function(id, price, session) {
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            const getPrice = () => price ? Promise.resolve(price) : getStockPrice(items[0].type, items[0].index);
            return getPrice().then(price => {
                const getRange = () => {
                    const yearEPS = getEPS(items[0].sales);
                    if (yearEPS.eps > 0) {
                        const range = Math.floor(price / yearEPS.eps / 5);
                        if (range > 1) {
                            return `${5 * (range - 1)} ${Math.floor(50 * yearEPS.eps * (range - 1)) / 10}, ${Math.floor(50 * yearEPS.eps * range) / 10}, ${Math.floor(50 * yearEPS.eps * (range + 1)) / 10}, ${Math.floor(50 * yearEPS.eps * (range + 2)) / 10} ${yearEPS.start}`;
                        } else if (range > 0) {
                            return `${5 * range} ${Math.floor(50 * yearEPS.eps * range) / 10}, ${Math.floor(50 * yearEPS.eps * (range + 1)) / 10}, ${Math.floor(50 * yearEPS.eps * (range + 2)) / 10} ${yearEPS.start}`;
                        } else {
                            return `${5 * (range + 1)} ${Math.floor(50 * yearEPS.eps * (range + 1)) / 10}, ${Math.floor(50 * yearEPS.eps * (range + 2)) / 10} ${yearEPS.start}`;
                        }
                    } else {
                        return `${-Math.floor(-yearEPS.eps * 1000) / 1000} ${yearEPS.start}`;
                    }
                }
                const epsRange = getRange();
                StockTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
                return [`${items[0].index}: ${Math.floor(price * 9.5) / 10}, ${Math.floor(price * 10.5) / 10}, ${Math.floor(price * 12) / 10}`, epsRange];
            });
        });
    },*/
    testData: function testData() {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, {}).then(function (items) {
            var recur_test = function recur_test(index) {
                return index >= items.length ? _promise2.default.resolve() : (0, _redisTool2.default)('hgetall', 'interval: ' + items[index].type + items[index].index).then(function (item) {
                    var getInit = function getInit() {
                        return item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                    };
                    return getInit();
                }).then(function (_ref13) {
                    var _ref14 = (0, _slicedToArray3.default)(_ref13, 3),
                        raw_list = _ref14[0],
                        ret_obj = _ref14[1],
                        etime = _ref14[2];

                    console.log(items[index].index + items[index].name);
                    if (!raw_list) {
                        console.log(items[index].type + ' ' + items[index].index + ' data empty');
                    } else {
                        var isnull = false;
                        for (var i in raw_list) {
                            console.log(i);
                            for (var j in raw_list[i]) {
                                for (var k = 0; k < raw_list[i][j].raw.length; k++) {
                                    if (!raw_list[i][j].raw[k].h || !raw_list[i][j].raw[k].l) {
                                        console.log(j);
                                        console.log(k);
                                        console.log(raw_list[i][j].raw[k]);
                                        console.log(items[index].type + ' ' + items[index].index + ' data miss');
                                        (0, _redisTool2.default)('hmset', 'interval: ' + items[index].type + items[index].index, {
                                            raw_list: false,
                                            ret_obj: 0,
                                            etime: -1
                                        }).catch(function (err) {
                                            return (0, _utility.handleError)(err, 'Redis');
                                        });
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
            };
            return recur_test(0);
        });
    },
    getIntervalV2: function getIntervalV2(id, session) {
        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var day = date.getDate();
        var month_str = (0, _utility.completeZero)(month.toString(), 2);
        var vol_year = year;
        var vol_month = month;
        var vol_month_str = month_str;
        console.log(year);
        console.log(month_str);
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }
            switch (items[0].type) {
                case 'twse':
                    StockTagTool.setLatest(items[0]._id, session).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Set latest');
                    });
                    return (0, _redisTool2.default)('hgetall', 'interval: ' + items[0].type + items[0].index).then(function (item) {
                        var getInit = function getInit() {
                            return item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                        };
                        return getInit();
                    }).then(function (_ref15) {
                        var _ref16 = (0, _slicedToArray3.default)(_ref15, 3),
                            raw_list = _ref16[0],
                            ret_obj = _ref16[1],
                            etime = _ref16[2];

                        var interval_data = null;
                        var start_month = '';
                        var max = 0;
                        var min = 0;
                        var raw_arr = [];
                        var rest_interval = function rest_interval(type, index) {
                            var is_stop = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                            index++;
                            if (month === 1) {
                                year--;
                                month = 12;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            } else {
                                month--;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            }
                            console.log(year);
                            console.log(month_str);
                            if (!is_stop && index < 70 && raw_arr.length <= 1150) {
                                return recur_mi(type, index);
                            }
                            console.log(max);
                            console.log(min);
                            var min_vol = 0;
                            for (var i = 12; i > 0 && interval_data[vol_year][vol_month_str]; i--) {
                                //min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
                                interval_data[vol_year][vol_month_str].raw.forEach(function (v) {
                                    if (!min_vol || v.v < min_vol) {
                                        min_vol = v.v;
                                    }
                                });
                                if (vol_month === 1) {
                                    vol_month = 12;
                                    vol_year--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                } else {
                                    vol_month--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                }
                            }
                            console.log(min_vol);
                            var loga = logArray(max, min);
                            var web = calStair(raw_arr, loga, min);
                            console.log(web);
                            return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id }, { $set: { web: web } }).then(function (item) {
                                console.log(item);
                                if (!web) {
                                    return [interval_data, 'no profit'];
                                }
                                //update total
                                var restTest = function restTest() {
                                    return getStockPrice(items[0].type, items[0].index).then(function (price) {
                                        var year = [];
                                        var ret_str1 = [];
                                        var ret_str = '';
                                        var best_rate = 0;
                                        var lastest_type = 0;
                                        var lastest_rate = 0;
                                        var resultShow = function resultShow(type) {
                                            var str = '';
                                            var testResult = [];
                                            var match = [];
                                            var j = raw_arr.length - 1;
                                            while (j > 249) {
                                                var _temp12 = stockTest(raw_arr, loga, min, type, j);
                                                if (_temp12 === 'data miss') {
                                                    return true;
                                                }
                                                var tempM = _temp12.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                                                if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                                                    testResult.push(_temp12);
                                                    match.push(tempM);
                                                }
                                                j = _temp12.start + 1;
                                            }
                                            if (testResult.length > 0) {
                                                var _ret10 = function () {
                                                    testResult.forEach(function (v, i) {
                                                        if (!year[i]) {
                                                            year[i] = [];
                                                        }
                                                        year[i].push(v);
                                                    });
                                                    var rate = 1;
                                                    var real = 1;
                                                    var count = 0;
                                                    var times = 0;
                                                    var stoploss = 0;
                                                    var maxloss = 0;
                                                    match.forEach(function (v, i) {
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
                                                    str = Math.round((+price - web.mid) / web.mid * 10000) / 100 + '% ' + Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2);
                                                    rate = Math.round(rate * 10000 - 10000) / 100;
                                                    real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                                    times = Math.round(times / count * 100) / 100;
                                                    str += ' ' + rate + '% ' + real + '% ' + times + ' ' + stoploss + ' ' + maxloss + '% ' + raw_arr.length + ' ' + min_vol;
                                                    if (!best_rate || rate > best_rate) {
                                                        best_rate = rate;
                                                        ret_str = str;
                                                    }
                                                    var temp = stockTest(raw_arr, loga, min, type, 0, true);
                                                    if (temp === 'data miss') {
                                                        return {
                                                            v: true
                                                        };
                                                    }
                                                    var tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                                                    if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                                                        if (!lastest_rate || Number(tempM[3]) > lastest_rate) {
                                                            lastest_rate = Number(tempM[3]);
                                                            lastest_type = type;
                                                        }
                                                    }
                                                }();

                                                if ((typeof _ret10 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret10)) === "object") return _ret10.v;
                                            } else {
                                                str = 'no less than mid point';
                                            }
                                            ret_str1.push(str);
                                        };
                                        for (var _i25 = 31; _i25 >= 0; _i25--) {
                                            if (resultShow(_i25)) {
                                                return (0, _utility.handleError)(new _utility.HoError(items[0].index + ' data miss!!!'));
                                            }
                                        }
                                        year.forEach(function (v, i) {
                                            console.log('year' + (+i + 1));
                                            v.forEach(function (k) {
                                                return console.log(k.str);
                                            });
                                        });
                                        ret_str1.forEach(function (v) {
                                            return console.log(v);
                                        });
                                        if (!ret_str) {
                                            ret_str = 'no less than mid point';
                                        }
                                        console.log(lastest_type);
                                        //amount real strategy times stoploss (no less than mid point)
                                        console.log('done');
                                        return [interval_data, ret_str, lastest_type];
                                    });
                                };
                                return (0, _mongoTool2.default)('find', _constants.TOTALDB, { index: items[0].index }).then(function (item) {
                                    var recur_web = function recur_web(index, type) {
                                        if (index >= item.length) {
                                            return _promise2.default.resolve();
                                        } else {
                                            var newWeb = adjustWeb(web.arr, web.mid, item[index].orig, true);
                                            return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[index]._id }, { $set: {
                                                    web: newWeb.arr,
                                                    mid: newWeb.mid,
                                                    times: newWeb.times,
                                                    wType: type
                                                } }).then(function () {
                                                return recur_web(index + 1);
                                            });
                                        }
                                    };
                                    return restTest().then(function (_ref17) {
                                        var _ref18 = (0, _slicedToArray3.default)(_ref17, 3),
                                            result = _ref18[0],
                                            index = _ref18[1],
                                            type = _ref18[2];

                                        web.type = type;
                                        return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id }, { $set: { web: web } }).then(function (item) {
                                            return recur_web(0, type).then(function () {
                                                return [result, index];
                                            });
                                        });
                                    });
                                });
                            });
                        };
                        var getTpexList = function getTpexList() {
                            return (0, _apiTool2.default)('url', 'https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=' + (year - 1911) + '/' + month_str + '&stkno=' + items[0].index + '&_=' + new Date().getTime()).then(function (raw_data) {
                                var json_data = (0, _utility.getJson)(raw_data);
                                if (json_data === false) {
                                    return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                                }
                                var high = [];
                                var low = [];
                                var vol = [];
                                if (json_data && json_data['iTotalRecords'] > 0) {
                                    var _iteratorNormalCompletion8 = true;
                                    var _didIteratorError8 = false;
                                    var _iteratorError8 = undefined;

                                    try {
                                        for (var _iterator8 = (0, _getIterator3.default)(json_data['aaData']), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                                            var i = _step8.value;

                                            high.push(Number(i[4].replace(/,/g, '')));
                                            low.push(Number(i[5].replace(/,/g, '')));
                                            vol.push(Number(i[8].replace(/,/g, '')));
                                        }
                                    } catch (err) {
                                        _didIteratorError8 = true;
                                        _iteratorError8 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion8 && _iterator8.return) {
                                                _iterator8.return();
                                            }
                                        } finally {
                                            if (_didIteratorError8) {
                                                throw _iteratorError8;
                                            }
                                        }
                                    }
                                }
                                return [2, { high: high, low: low, vol: vol }];
                            });
                        };
                        var getTwseList = function getTwseList() {
                            return new _promise2.default(function (resolve, reject) {
                                return setTimeout(function () {
                                    return resolve();
                                }, 5000);
                            }).then(function () {
                                return (0, _apiTool2.default)('url', 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=' + year + month_str + '01&stockNo=' + items[0].index).then(function (raw_data) {
                                    var high = [];
                                    var low = [];
                                    var vol = [];
                                    if (raw_data.length > 200) {
                                        var year_str = year - 1911;
                                        var data_list = raw_data.match(new RegExp('"' + year_str + '\\/' + month_str + '.*', 'g'));
                                        if (data_list && data_list.length > 0) {
                                            var tmp_index = -1;
                                            var tmp_number = '';
                                            var _iteratorNormalCompletion9 = true;
                                            var _didIteratorError9 = false;
                                            var _iteratorError9 = undefined;

                                            try {
                                                for (var _iterator9 = (0, _getIterator3.default)(data_list), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                                                    var i = _step9.value;

                                                    var tmp_list_1 = [];
                                                    var tmp_list = i.split(',');
                                                    for (var j in tmp_list) {
                                                        if (tmp_list[j].match(/^".*"$/)) {
                                                            tmp_list_1.push(tmp_list[j].replace(/"/g, ''));
                                                        } else if (tmp_list[j].match(/^"/)) {
                                                            tmp_index = j;
                                                            tmp_list[j] = tmp_list[j].replace(/"/g, '');
                                                        } else if (tmp_list[j].match(/"$/)) {
                                                            tmp_list[j] = tmp_list[j].replace(/"/g, '');
                                                            for (var k = +tmp_index; k <= j; k++) {
                                                                tmp_number = '' + tmp_number + tmp_list[k];
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
                                                    }
                                                }
                                            } catch (err) {
                                                _didIteratorError9 = true;
                                                _iteratorError9 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion9 && _iterator9.return) {
                                                        _iterator9.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError9) {
                                                        throw _iteratorError9;
                                                    }
                                                }
                                            }
                                        }
                                        return [3, { high: high, low: low, vol: vol }];
                                    } else {
                                        return [3, { high: high, low: low, vol: vol }, true];
                                    }
                                });
                            });
                        };
                        var recur_mi = function recur_mi(type, index) {
                            var getList = function getList() {
                                if (type === 2) {
                                    return getTpexList();
                                } else if (type === 3) {
                                    return getTwseList();
                                } else {
                                    var getType = function getType() {
                                        return getTpexList().then(function (_ref19) {
                                            var _ref20 = (0, _slicedToArray3.default)(_ref19, 2),
                                                type = _ref20[0],
                                                list = _ref20[1];

                                            return list.high.length > 0 ? [type, list] : getTwseList().then(function (_ref21) {
                                                var _ref22 = (0, _slicedToArray3.default)(_ref21, 2),
                                                    type = _ref22[0],
                                                    list = _ref22[1];

                                                return list.high.length > 0 ? [type, list] : [1, list];
                                            });
                                        });
                                    };
                                    return getType();
                                }
                            };
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
                                    min: raw_list[year][month_str].min
                                };
                                return rest_interval(type, index);
                            } else {
                                return getList().then(function (_ref23) {
                                    var _ref24 = (0, _slicedToArray3.default)(_ref23, 3),
                                        type = _ref24[0],
                                        list = _ref24[1],
                                        is_stop = _ref24[2];

                                    if (list.high.length > 0) {
                                        if (!start_month) {
                                            start_month = '' + year + month_str;
                                        }
                                        var tmp_interval = [];
                                        var tmp_max = 0;
                                        var tmp_min = 0;
                                        for (var i in list.high) {
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
                                                v: list.vol[i]
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
                                            min: tmp_min
                                        };
                                        raw_arr = raw_arr.concat(tmp_interval.slice().reverse());
                                    }
                                    return rest_interval(type, index, is_stop);
                                });
                            }
                        };
                        var exGet = function exGet() {
                            return (/*(etime === -1 || !etime || etime < (new Date().getTime()/1000)) ?*/recur_mi(1, 0)
                            );
                        }; /*: Promise.resolve([null, ret_obj]);*/
                        return exGet().then(function (_ref25) {
                            var _ref26 = (0, _slicedToArray3.default)(_ref25, 2),
                                raw_list = _ref26[0],
                                ret_obj = _ref26[1];

                            if (raw_list) {
                                (0, _redisTool2.default)('hmset', 'interval: ' + items[0].type + items[0].index, {
                                    raw_list: (0, _stringify2.default)(raw_list),
                                    ret_obj: ret_obj,
                                    etime: Math.round(new Date().getTime() / 1000 + _constants.CACHE_EXPIRE)
                                }).catch(function (err) {
                                    return (0, _utility.handleError)(err, 'Redis');
                                });
                            }
                            return [ret_obj, items[0].index];
                        });
                    });
                    break;
                case 'usse':
                    StockTagTool.setLatest(items[0]._id, session).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Set latest');
                    });
                    return (0, _redisTool2.default)('hgetall', 'interval: ' + items[0].type + items[0].index).then(function (item) {
                        var getInit = function getInit() {
                            return item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                        };
                        return getInit();
                    }).then(function (_ref27) {
                        var _ref28 = (0, _slicedToArray3.default)(_ref27, 3),
                            raw_list = _ref28[0],
                            ret_obj = _ref28[1],
                            etime = _ref28[2];

                        var interval_data = null;
                        /*if (month === 1) {
                            year--;
                            month = 12;
                            month_str = completeZero(month.toString(), 2);
                        } else {
                            month--;
                            month_str = completeZero(month.toString(), 2);
                        }*/
                        var start_get = new Date(year, month - 1, day, 12).getTime() / 1000;
                        var end_get = new Date(year - 5, month - 1, day, 12).getTime() / 1000;
                        var start_month = '' + year + month_str;
                        var max = 0;
                        var min = 0;
                        var raw_arr = [];
                        var min_vol = 0;
                        var rest_interval = function rest_interval() {
                            console.log(max);
                            console.log(min);
                            var min_vol = 0;
                            for (var i = 12; i > 0 && interval_data[vol_year][vol_month_str]; i--) {
                                //min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
                                interval_data[vol_year][vol_month_str].raw.forEach(function (v) {
                                    if (!min_vol || v.v < min_vol) {
                                        min_vol = v.v;
                                    }
                                });
                                if (vol_month === 1) {
                                    vol_month = 12;
                                    vol_year--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                } else {
                                    vol_month--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                }
                            }
                            console.log(min_vol);
                            var loga = logArray(max, min);
                            var web = calStair(raw_arr, loga, min);
                            console.log(web);
                            return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id }, { $set: { web: web } }).then(function (item) {
                                console.log(item);
                                if (!web) {
                                    return [interval_data, 'no profit'];
                                }
                                //update total
                                var restTest = function restTest() {
                                    return getStockPrice(items[0].type, items[0].index).then(function (price) {
                                        var year = [];
                                        var ret_str1 = [];
                                        var ret_str = '';
                                        var best_rate = 0;
                                        var lastest_type = 0;
                                        var lastest_rate = 0;
                                        var resultShow = function resultShow(type) {
                                            var str = '';
                                            var testResult = [];
                                            var match = [];
                                            var j = raw_arr.length - 1;
                                            while (j > 249) {
                                                var _temp13 = stockTest(raw_arr, loga, min, type, j);
                                                if (_temp13 === 'data miss') {
                                                    return true;
                                                }
                                                var tempM = _temp13.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                                                if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                                                    testResult.push(_temp13);
                                                    match.push(tempM);
                                                }
                                                j = _temp13.start + 1;
                                            }
                                            if (testResult.length > 0) {
                                                var _ret11 = function () {
                                                    testResult.forEach(function (v, i) {
                                                        if (!year[i]) {
                                                            year[i] = [];
                                                        }
                                                        year[i].push(v);
                                                    });
                                                    var rate = 1;
                                                    var real = 1;
                                                    var count = 0;
                                                    var times = 0;
                                                    var stoploss = 0;
                                                    var maxloss = 0;
                                                    match.forEach(function (v, i) {
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
                                                    str = Math.round((+price - web.mid) / web.mid * 10000) / 100 + '% ' + Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2);
                                                    rate = Math.round(rate * 10000 - 10000) / 100;
                                                    real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                                    times = Math.round(times / count * 100) / 100;
                                                    str += ' ' + rate + '% ' + real + '% ' + times + ' ' + stoploss + ' ' + maxloss + '% ' + raw_arr.length + ' ' + min_vol;
                                                    if (!best_rate || rate > best_rate) {
                                                        best_rate = rate;
                                                        ret_str = str;
                                                    }
                                                    var temp = stockTest(raw_arr, loga, min, type, 0, true);
                                                    if (temp === 'data miss') {
                                                        return {
                                                            v: true
                                                        };
                                                    }
                                                    var tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                                                    if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                                                        if (!lastest_rate || Number(tempM[3]) > lastest_rate) {
                                                            lastest_rate = Number(tempM[3]);
                                                            lastest_type = type;
                                                        }
                                                    }
                                                }();

                                                if ((typeof _ret11 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret11)) === "object") return _ret11.v;
                                            } else {
                                                str = 'no less than mid point';
                                            }
                                            ret_str1.push(str);
                                        };
                                        for (var _i26 = 15; _i26 >= 0; _i26--) {
                                            if (resultShow(_i26)) {
                                                return (0, _utility.handleError)(new _utility.HoError(items[0].index + ' data miss!!!'));
                                            }
                                        }
                                        year.forEach(function (v, i) {
                                            console.log('year' + (+i + 1));
                                            v.forEach(function (k) {
                                                return console.log(k.str);
                                            });
                                        });
                                        ret_str1.forEach(function (v) {
                                            return console.log(v);
                                        });
                                        if (!ret_str) {
                                            ret_str = 'no less than mid point';
                                        }
                                        console.log(lastest_type);
                                        //amount real strategy times stoploss (no less than mid point)
                                        console.log('done');
                                        return [interval_data, ret_str, lastest_type];
                                    });
                                };
                                return (0, _mongoTool2.default)('find', _constants.TOTALDB, { index: items[0].index }).then(function (item) {
                                    var recur_web = function recur_web(index, type) {
                                        if (index >= item.length) {
                                            return _promise2.default.resolve();
                                        } else {
                                            var newWeb = adjustWeb(web.arr, web.mid, item[index].orig, true);
                                            return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[index]._id }, { $set: {
                                                    web: newWeb.arr,
                                                    mid: newWeb.mid,
                                                    times: newWeb.times,
                                                    wType: type
                                                } }).then(function () {
                                                return recur_web(index + 1);
                                            });
                                        }
                                    };
                                    return restTest().then(function (_ref29) {
                                        var _ref30 = (0, _slicedToArray3.default)(_ref29, 3),
                                            result = _ref30[0],
                                            index = _ref30[1],
                                            type = _ref30[2];

                                        web.type = type;
                                        return (0, _mongoTool2.default)('update', _constants.STOCKDB, { _id: id }, { $set: { web: web } }).then(function (item) {
                                            return recur_web(0, type).then(function () {
                                                return [result, index];
                                            });
                                        });
                                    });
                                });
                            });
                        };
                        var get_mi = function get_mi(index) {
                            if (raw_list) {
                                var isEnd = false;
                                for (var i = 0; i < 60; i++) {
                                    if (raw_list[year] && raw_list[year][month_str]) {
                                        if (!isEnd) {
                                            isEnd = true;
                                            end_get = new Date(year, month - 1, 1, 12).getTime() / 1000;
                                        }
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
                                            min: raw_list[year][month_str].min
                                        };
                                    }
                                    if (month === 1) {
                                        year--;
                                        month = 12;
                                        month_str = (0, _utility.completeZero)(month.toString(), 2);
                                    } else {
                                        month--;
                                        month_str = (0, _utility.completeZero)(month.toString(), 2);
                                    }
                                }
                            }
                            return (0, _apiTool2.default)('url', 'https://query1.finance.yahoo.com/v7/finance/download/' + items[0].index + '?period1=' + end_get + '&period2=' + start_get + '&interval=1d&events=split').then(function (raw_data) {
                                if (raw_data.split("\n").length > 1) {
                                    raw_arr = [];
                                    interval_data = null;
                                    //min_vol = 0;
                                    max = 0;
                                    min = 0;
                                    end_get = new Date(year - 5, month - 1, day, 12).getTime() / 1000;
                                }
                                return (0, _apiTool2.default)('url', 'https://query1.finance.yahoo.com/v7/finance/download/' + items[0].index + '?period1=' + end_get + '&period2=' + start_get + '&interval=1d&events=history').then(function (raw_data) {
                                    raw_data = raw_data.split("\n").reverse();
                                    var y = '';
                                    var m = '';
                                    var tmp_interval = [];
                                    var tmp_max = 0;
                                    var tmp_min = 0;
                                    for (var _i27 = 0; _i27 < raw_data.length - 1; _i27++) {
                                        var len = raw_data[_i27].split(',');
                                        var match = len[0].match(/^(\d+)\-(\d+)\-/);
                                        if (match[1] !== y || match[2] !== m) {
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
                                                    min: tmp_min
                                                };
                                                tmp_interval = [];
                                                tmp_max = 0;
                                                tmp_min = 0;
                                            }
                                            y = match[1];
                                            m = match[2];
                                        }
                                        raw_arr.push({
                                            h: Number(len[2]),
                                            l: Number(len[3]),
                                            v: Number(len[6])
                                        });
                                        tmp_interval.push({
                                            h: Number(len[2]),
                                            l: Number(len[3]),
                                            v: Number(len[6])
                                        });
                                        if (Number(len[2]) > max) {
                                            max = Number(len[2]);
                                        }
                                        if (!min || Number(len[3]) < min) {
                                            min = Number(len[3]);
                                        }
                                        if (Number(len[2]) > tmp_max) {
                                            tmp_max = Number(len[2]);
                                        }
                                        if (!tmp_min || Number(len[3]) < tmp_min) {
                                            tmp_min = Number(len[3]);
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
                                            min: tmp_min
                                        };
                                        tmp_interval = [];
                                        tmp_max = 0;
                                        tmp_min = 0;
                                    }
                                    return rest_interval();
                                });
                            });
                        };
                        var exGet = function exGet() {
                            return (/*(etime === -1 || !etime || etime < (new Date().getTime()/1000)) ?*/get_mi()
                            );
                        }; /*: Promise.resolve([null, ret_obj]);*/
                        return exGet().then(function (_ref31) {
                            var _ref32 = (0, _slicedToArray3.default)(_ref31, 2),
                                raw_list = _ref32[0],
                                ret_obj = _ref32[1];

                            if (raw_list) {
                                (0, _redisTool2.default)('hmset', 'interval: ' + items[0].type + items[0].index, {
                                    raw_list: (0, _stringify2.default)(raw_list),
                                    ret_obj: ret_obj,
                                    etime: Math.round(new Date().getTime() / 1000 + _constants.CACHE_EXPIRE)
                                }).catch(function (err) {
                                    return (0, _utility.handleError)(err, 'Redis');
                                });
                            }
                            return [ret_obj, items[0].index];
                        });
                    });
                    break;
                default:
                    return (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getInterval: function getInterval(id, session) {
        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var month_str = (0, _utility.completeZero)(month.toString(), 2);
        var vol_year = year;
        var vol_month = month;
        var vol_month_str = month_str;
        console.log(year);
        console.log(month_str);
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('can not find stock!!!'));
            }
            switch (items[0].type) {
                case 'twse':
                    StockTagTool.setLatest(items[0]._id, session).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Set latest');
                    });
                    return (0, _redisTool2.default)('hgetall', 'interval: ' + items[0].type + items[0].index).then(function (item) {
                        var getInit = function getInit() {
                            return item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                        };
                        return getInit();
                    }).then(function (_ref33) {
                        var _ref34 = (0, _slicedToArray3.default)(_ref33, 3),
                            raw_list = _ref34[0],
                            ret_obj = _ref34[1],
                            etime = _ref34[2];

                        var interval_data = null;
                        var start_month = '';
                        var max = 0;
                        var min = 0;
                        var raw_arr = [];
                        var group_interval = function group_interval(level, gap, final_arr, sort_arr) {
                            var group = [];
                            var start = 0;
                            var ig = 0;
                            level = level * 5;
                            for (var i in final_arr) {
                                if (final_arr[i] >= sort_arr[level]) {
                                    if (!start) {
                                        start = i;
                                    }
                                    ig = 0;
                                } else {
                                    if (start) {
                                        if (ig < gap) {
                                            ig++;
                                        } else {
                                            group.push({
                                                start: Number(start),
                                                end: i - 1 - ig
                                            });
                                            start = 0;
                                            ig = 0;
                                        }
                                    }
                                }
                            }
                            if (start) {
                                group.push({
                                    start: Number(start),
                                    end: 99 - ig
                                });
                            }
                            var group_num = 0;
                            var final_group = [];
                            var _iteratorNormalCompletion10 = true;
                            var _didIteratorError10 = false;
                            var _iteratorError10 = undefined;

                            try {
                                for (var _iterator10 = (0, _getIterator3.default)(group), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                                    var _i28 = _step10.value;

                                    if (_i28.end - _i28.start > 33) {
                                        var _iteratorNormalCompletion11 = true;
                                        var _didIteratorError11 = false;
                                        var _iteratorError11 = undefined;

                                        try {
                                            for (var _iterator11 = (0, _getIterator3.default)(group), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                                                var j = _step11.value;

                                                if (j.end - j.start > 13) {
                                                    final_group.push(j);
                                                }
                                            }
                                        } catch (err) {
                                            _didIteratorError11 = true;
                                            _iteratorError11 = err;
                                        } finally {
                                            try {
                                                if (!_iteratorNormalCompletion11 && _iterator11.return) {
                                                    _iterator11.return();
                                                }
                                            } finally {
                                                if (_didIteratorError11) {
                                                    throw _iteratorError11;
                                                }
                                            }
                                        }

                                        return final_group;
                                    } else if (_i28.end - _i28.start > 13) {
                                        group_num++;
                                        if (group_num > 2) {
                                            var _iteratorNormalCompletion12 = true;
                                            var _didIteratorError12 = false;
                                            var _iteratorError12 = undefined;

                                            try {
                                                for (var _iterator12 = (0, _getIterator3.default)(group), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                                                    var _j2 = _step12.value;

                                                    if (_j2.end - _j2.start > 13) {
                                                        final_group.push(_j2);
                                                    }
                                                }
                                            } catch (err) {
                                                _didIteratorError12 = true;
                                                _iteratorError12 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion12 && _iterator12.return) {
                                                        _iterator12.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError12) {
                                                        throw _iteratorError12;
                                                    }
                                                }
                                            }

                                            return final_group;
                                        }
                                    }
                                }
                            } catch (err) {
                                _didIteratorError10 = true;
                                _iteratorError10 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion10 && _iterator10.return) {
                                        _iterator10.return();
                                    }
                                } finally {
                                    if (_didIteratorError10) {
                                        throw _iteratorError10;
                                    }
                                }
                            }

                            return false;
                        };
                        var rest_interval = function rest_interval(type, index) {
                            var is_stop = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

                            index++;
                            if (month === 1) {
                                year--;
                                month = 12;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            } else {
                                month--;
                                month_str = (0, _utility.completeZero)(month.toString(), 2);
                            }
                            console.log(year);
                            console.log(month_str);
                            if (!is_stop && index < 70 && raw_arr.length <= 1150) {
                                return recur_mi(type, index);
                            }
                            console.log(max);
                            console.log(min);
                            var min_vol = 0;
                            for (var i = 12; i > 0 && interval_data[vol_year][vol_month_str]; i--) {
                                min_vol = interval_data[vol_year][vol_month_str].raw.reduce(function (a, v) {
                                    return a && v.v > a ? a : v.v;
                                }, min_vol);
                                if (vol_month === 1) {
                                    vol_month = 12;
                                    vol_year--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                } else {
                                    vol_month--;
                                    vol_month_str = (0, _utility.completeZero)(vol_month.toString(), 2);
                                }
                            }
                            console.log(min_vol);
                            var final_arr = [];
                            for (var _i29 = 0; _i29 < 100; _i29++) {
                                final_arr[_i29] = 0;
                            }
                            var diff = (max - min) / 100;
                            var _iteratorNormalCompletion13 = true;
                            var _didIteratorError13 = false;
                            var _iteratorError13 = undefined;

                            try {
                                for (var _iterator13 = (0, _getIterator3.default)(raw_arr), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                                    var _i32 = _step13.value;

                                    var e = Math.ceil((_i32.h - min) / diff);
                                    var s = Math.floor((_i32.l - min) / diff);
                                    for (var j = s; j < e; j++) {
                                        final_arr[j] += _i32.v;
                                    }
                                }
                            } catch (err) {
                                _didIteratorError13 = true;
                                _iteratorError13 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion13 && _iterator13.return) {
                                        _iterator13.return();
                                    }
                                } finally {
                                    if (_didIteratorError13) {
                                        throw _iteratorError13;
                                    }
                                }
                            }

                            var sort_arr = [].concat(final_arr).sort(function (a, b) {
                                return a - b;
                            });
                            var interval = null;
                            for (var _i30 = 19; _i30 > 0; _i30--) {
                                interval = group_interval(_i30, 5, final_arr, sort_arr);
                                if (interval) {
                                    console.log(interval);
                                    console.log(_i30);
                                    break;
                                }
                            }
                            return getStockPrice('twse', items[0].index).then(function (price) {
                                var llow = Math.ceil(((interval[0].start - 1) * diff + min) * 100) / 100;
                                var lint = Math.abs(Math.ceil(llow / price * 100) - 100);
                                var fint = lint;
                                var ret_str = llow + ' -' + Math.ceil((interval[0].end * diff + min) * 100) / 100;
                                for (var _i31 = 1; _i31 < interval.length; _i31++) {
                                    llow = Math.ceil(((interval[_i31].start - 1) * diff + min) * 100) / 100;
                                    lint = Math.abs(Math.ceil(llow / price * 100) - 100);
                                    fint = lint < fint ? lint : fint;
                                    ret_str = ret_str + ', ' + llow + '-' + Math.ceil((interval[_i31].end * diff + min) * 100) / 100;
                                }
                                ret_str = ret_str + ' ' + start_month + ' ' + raw_arr.length + ' ' + min_vol + ' ' + fint;
                                console.log('done');
                                return [interval_data, ret_str];
                            });
                        };
                        var getTpexList = function getTpexList() {
                            return (0, _apiTool2.default)('url', 'https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=' + (year - 1911) + '/' + month_str + '&stkno=' + items[0].index + '&_=' + new Date().getTime()).then(function (raw_data) {
                                var json_data = (0, _utility.getJson)(raw_data);
                                if (json_data === false) {
                                    return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                                }
                                var high = [];
                                var low = [];
                                var vol = [];
                                if (json_data && json_data['iTotalRecords'] > 0) {
                                    var _iteratorNormalCompletion14 = true;
                                    var _didIteratorError14 = false;
                                    var _iteratorError14 = undefined;

                                    try {
                                        for (var _iterator14 = (0, _getIterator3.default)(json_data['aaData']), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                                            var i = _step14.value;

                                            high.push(Number(i[4].replace(/,/g, '')));
                                            low.push(Number(i[5].replace(/,/g, '')));
                                            vol.push(Number(i[8].replace(/,/g, '')));
                                        }
                                    } catch (err) {
                                        _didIteratorError14 = true;
                                        _iteratorError14 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion14 && _iterator14.return) {
                                                _iterator14.return();
                                            }
                                        } finally {
                                            if (_didIteratorError14) {
                                                throw _iteratorError14;
                                            }
                                        }
                                    }
                                }
                                return [2, { high: high, low: low, vol: vol }];
                            });
                        };
                        var getTwseList = function getTwseList() {
                            return new _promise2.default(function (resolve, reject) {
                                return setTimeout(function () {
                                    return resolve();
                                }, 5000);
                            }).then(function () {
                                return (0, _apiTool2.default)('url', 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=' + year + month_str + '01&stockNo=' + items[0].index).then(function (raw_data) {
                                    var high = [];
                                    var low = [];
                                    var vol = [];
                                    if (raw_data.length > 200) {
                                        var year_str = year - 1911;
                                        var data_list = raw_data.match(new RegExp('"' + year_str + '\\/' + month_str + '.*', 'g'));
                                        if (data_list && data_list.length > 0) {
                                            console.log(data_list.length);
                                            var tmp_index = -1;
                                            var tmp_number = '';
                                            var _iteratorNormalCompletion15 = true;
                                            var _didIteratorError15 = false;
                                            var _iteratorError15 = undefined;

                                            try {
                                                for (var _iterator15 = (0, _getIterator3.default)(data_list), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                                                    var i = _step15.value;

                                                    var tmp_list_1 = [];
                                                    var tmp_list = i.split(',');
                                                    for (var j in tmp_list) {
                                                        if (tmp_list[j].match(/^".*"$/)) {
                                                            tmp_list_1.push(tmp_list[j].replace(/"/g, ''));
                                                        } else if (tmp_list[j].match(/^"/)) {
                                                            tmp_index = j;
                                                            tmp_list[j] = tmp_list[j].replace(/"/g, '');
                                                        } else if (tmp_list[j].match(/"$/)) {
                                                            tmp_list[j] = tmp_list[j].replace(/"/g, '');
                                                            for (var k = tmp_index; k <= j; k++) {
                                                                tmp_number = '' + tmp_number + tmp_list[k];
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
                                                    high.push(Number(tmp_list_1[4]));
                                                    low.push(Number(tmp_list_1[5]));
                                                    vol.push(Number(tmp_list_1[8]));
                                                }
                                            } catch (err) {
                                                _didIteratorError15 = true;
                                                _iteratorError15 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion15 && _iterator15.return) {
                                                        _iterator15.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError15) {
                                                        throw _iteratorError15;
                                                    }
                                                }
                                            }
                                        }
                                        return [3, { high: high, low: low, vol: vol }];
                                    } else {
                                        return [3, { high: high, low: low, vol: vol }, true];
                                    }
                                });
                            });
                        };
                        var recur_mi = function recur_mi(type, index) {
                            var getList = function getList() {
                                if (type === 2) {
                                    return getTpexList();
                                } else if (type === 3) {
                                    return getTwseList();
                                } else {
                                    var getType = function getType() {
                                        return getTpexList().then(function (_ref35) {
                                            var _ref36 = (0, _slicedToArray3.default)(_ref35, 2),
                                                type = _ref36[0],
                                                list = _ref36[1];

                                            return list.high.length > 0 ? [type, list] : getTwseList().then(function (_ref37) {
                                                var _ref38 = (0, _slicedToArray3.default)(_ref37, 2),
                                                    type = _ref38[0],
                                                    list = _ref38[1];

                                                return list.high.length > 0 ? [type, list] : [1, list];
                                            });
                                        });
                                    };
                                    return getType();
                                }
                            };
                            if (start_month && raw_list && raw_list[year] && raw_list[year][month_str]) {
                                raw_arr = raw_arr.concat(raw_list[year][month_str].raw);
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
                                    min: raw_list[year][month_str].min
                                };
                                return rest_interval(type, index);
                            } else {
                                return getList().then(function (_ref39) {
                                    var _ref40 = (0, _slicedToArray3.default)(_ref39, 3),
                                        type = _ref40[0],
                                        list = _ref40[1],
                                        is_stop = _ref40[2];

                                    if (list.high.length > 0) {
                                        if (!start_month) {
                                            start_month = '' + year + month_str;
                                        }
                                        var tmp_interval = [];
                                        var tmp_max = 0;
                                        var tmp_min = 0;
                                        for (var i in list.high) {
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
                                            raw_arr.push({
                                                h: list.high[i],
                                                l: list.low[i],
                                                v: list.vol[i]
                                            });
                                            tmp_interval.push(raw_arr[raw_arr.length - 1]);
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
                                            min: tmp_min
                                        };
                                    }
                                    return rest_interval(type, index, is_stop);
                                });
                            }
                        };
                        var exGet = function exGet() {
                            return etime === -1 || !etime || etime < new Date().getTime() / 1000 ? recur_mi(1, 0) : _promise2.default.resolve([null, ret_obj]);
                        };
                        return exGet().then(function (_ref41) {
                            var _ref42 = (0, _slicedToArray3.default)(_ref41, 2),
                                raw_list = _ref42[0],
                                ret_obj = _ref42[1];

                            if (raw_list) {
                                (0, _redisTool2.default)('hmset', 'interval: ' + items[0].type + items[0].index, {
                                    raw_list: (0, _stringify2.default)(raw_list),
                                    ret_obj: ret_obj,
                                    etime: Math.round(new Date().getTime() / 1000 + _constants.CACHE_EXPIRE)
                                }).catch(function (err) {
                                    return (0, _utility.handleError)(err, 'Redis');
                                });
                            }
                            return [ret_obj, items[0].index];
                        });
                    });
                default:
                    return (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getIntervalWarp: function getIntervalWarp(id, session) {
        if (stockIntervaling) {
            return (0, _utility.handleError)(new _utility.HoError('there is another inverval running'));
        }
        stockIntervaling = true;
        return this.getIntervalV2(id, session).then(function (_ref43) {
            var _ref44 = (0, _slicedToArray3.default)(_ref43, 2),
                result = _ref44[0],
                index = _ref44[1];

            stockIntervaling = false;
            return [result, index];
        }).catch(function (err) {
            stockIntervaling = false;
            return (0, _utility.handleError)(err);
        });
    },
    stockFilterV3: function stockFilterV3() {
        var option = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

        var _this = this;

        var user = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { _id: '000000000000000000000000' };
        var session = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        var web = option ? true : false;
        if (!option) {
            option = _constants.STOCK_FILTER;
        }
        var last = false;
        var queried = 0;
        var filterList = [];
        var clearName = function clearName() {
            return StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                var delFilter = function delFilter(index) {
                    return index < result.items.length ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(function (del_result) {
                        (0, _sendWs2.default)({
                            type: 'stock',
                            data: del_result.id
                        }, 0, 1);
                    }).catch(function (err) {
                        if (web) {
                            (0, _sendWs2.default)({
                                type: user.username,
                                data: 'Filter ' + option.name + ': ' + result.items[iIndex].index + ' Error'
                            }, 0);
                        }
                        (0, _utility.handleError)(err, 'Stock filter');
                    }).then(function () {
                        return delFilter(index + 1);
                    }) : _promise2.default.resolve(result.items.length);
                };
                return delFilter(0);
            });
        };
        var recur_query = function recur_query() {
            return StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                console.log(queried);
                if (result.items.length < _constants.STOCK_FILTER_LIMIT) {
                    last = true;
                }
                queried += result.items.length;
                if (result.items.length < 1) {
                    return filterList;
                }
                var first_stage = [];
                result.items.forEach(function (i) {
                    var eok = option.per ? option.per[1] === '>' && i.per > option.per[2] || option.per[1] === '<' && i.per && i.per < option.per[2] ? true : false : true;
                    var dok = option.pdr ? option.pdr[1] === '>' && i.pdr > option.pdr[2] || option.pdr[1] === '<' && i.pdr && i.pdr < option.pdr[2] ? true : false : true;
                    var bok = option.pbr ? option.pbr[1] === '>' && i.pbr > option.pbr[2] || option.pbr[1] === '<' && i.pbr && i.pbr < option.pbr[2] ? true : false : true;
                    if (eok && dok && bok && i.type === 'twse') {
                        first_stage.push(i);
                    }
                });
                if (first_stage.length < 1) {
                    return filterList;
                }
                var recur_per = function recur_per(index) {
                    var nextFilter = function nextFilter() {
                        index++;
                        if (index < first_stage.length) {
                            return recur_per(index);
                        }
                        if (!last) {
                            return recur_query();
                        }
                        return filterList;
                    };
                    var addFilter = function addFilter() {
                        filterList.push(first_stage[index]);
                        if (filterList.length >= _constants.STOCK_FILTER_LIMIT) {
                            return filterList;
                        }
                        return nextFilter();
                    };
                    return addFilter();
                };
                return recur_per(0);
            });
        };
        return clearName().then(function () {
            return recur_query();
        }).then(function (filterList) {
            var filterList1 = [];
            var stage3 = function stage3(iIndex) {
                return iIndex < filterList.length ? _this.getIntervalWarp(filterList[iIndex]._id, session).then(function (_ref45) {
                    var _ref46 = (0, _slicedToArray3.default)(_ref45, 2),
                        result = _ref46[0],
                        index = _ref46[1];

                    console.log(filterList[iIndex].name);
                    console.log(result);
                    var intervalVal = result.match(/(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\-?\d+\.?\d*) (\d+) (\-?\d+\.?\d*)\% (\d+) (\d+)$/);
                    if (intervalVal) {
                        var cok = option.close ? option.close[1] === '>' && intervalVal[1] > option.close[2] || option.close[1] === '<' && intervalVal[1] < option.close[2] ? true : false : true;
                        var pok = option.profit ? option.profit[1] === '>' && intervalVal[3] > option.profit[2] || option.profit[1] === '<' && intervalVal[3] < option.profit[2] ? true : false : true;
                        var gok = option.gap ? option.gap[1] === '>' && intervalVal[4] > option.gap[2] || option.gap[1] === '<' && intervalVal[4] < option.gap[2] ? true : false : true;
                        var tok = option.times ? option.times[1] === '>' && intervalVal[5] > option.times[2] || option.times[1] === '<' && intervalVal[5] < option.times[2] ? true : false : true;
                        var sok = option.stop ? option.stop[1] === '>' && intervalVal[6] > option.stop[2] || option.stop[1] === '<' && intervalVal[6] < option.stop[2] ? true : false : true;
                        var iok = option.interval ? option.interval[1] === '>' && intervalVal[8] > option.interval[2] || option.interval[1] === '<' && intervalVal[8] < option.interval[2] ? true : false : true;
                        var vok = option.vol ? option.vol[1] === '>' && intervalVal[9] > option.vol[2] || option.vol[1] === '<' && intervalVal[9] < option.vol[2] ? true : false : true;
                        if (iok && vok && cok && pok && gok && tok && sok) {
                            filterList1.push(filterList[iIndex]);
                        }
                    }
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return stage3(iIndex + 1);
                }) : _promise2.default.resolve();
            };
            console.log('stage three');
            return option.interval || option.vol || option.close ? stage3(0).then(function () {
                return filterList1;
            }) : filterList;
        }).then(function (filterList) {
            var addFilter = function addFilter(index) {
                return index < filterList.length ? StockTagTool.addTag(filterList[index]._id, option.name, user).then(function (add_result) {
                    (0, _sendWs2.default)({
                        type: 'stock',
                        data: add_result.id
                    }, 0, 1);
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return addFilter(index + 1);
                }) : _promise2.default.resolve(filterList);
            };
            return addFilter(0);
        });
    },
    stockFilterV2: function stockFilterV2() {
        var option = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

        var _this2 = this;

        var user = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { _id: '000000000000000000000000' };
        var session = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        var web = option ? true : false;
        if (!option) {
            option = _constants.STOCK_FILTER;
        }
        var last = false;
        var queried = 0;
        var filterList = [];
        var clearName = function clearName() {
            return StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                var delFilter = function delFilter(index) {
                    return index < result.items.length ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(function (del_result) {
                        (0, _sendWs2.default)({
                            type: 'stock',
                            data: del_result.id
                        }, 0, 1);
                    }).catch(function (err) {
                        if (web) {
                            (0, _sendWs2.default)({
                                type: user.username,
                                data: 'Filter ' + option.name + ': ' + result.items[iIndex].index + ' Error'
                            }, 0);
                        }
                        (0, _utility.handleError)(err, 'Stock filter');
                    }).then(function () {
                        return delFilter(index + 1);
                    }) : _promise2.default.resolve(result.items.length);
                };
                return delFilter(0);
            });
        };
        var recur_query = function recur_query() {
            return StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                console.log(queried);
                if (result.items.length < _constants.STOCK_FILTER_LIMIT) {
                    last = true;
                }
                queried += result.items.length;
                if (result.items.length < 1) {
                    return filterList;
                }
                var first_stage = [];
                result.items.forEach(function (i) {
                    var eok = option.per ? option.per[1] === '>' && i.per > option.per[2] || option.per[1] === '<' && i.per < option.per[2] ? true : false : true;
                    var dok = option.pdr ? option.pdr[1] === '>' && i.pdr > option.pdr[2] || option.pdr[1] === '<' && i.pdr < option.pdr[2] ? true : false : true;
                    var bok = option.pbr ? option.pbr[1] === '>' && i.pbr > option.pbr[2] || option.pbr[1] === '<' && i.pbr < option.pbr[2] ? true : false : true;
                    if (eok && dok && bok) {
                        first_stage.push(i);
                    }
                });
                if (first_stage.length < 1) {
                    return filterList;
                }
                var recur_per = function recur_per(index) {
                    var nextFilter = function nextFilter() {
                        index++;
                        if (index < first_stage.length) {
                            return recur_per(index);
                        }
                        if (!last) {
                            return recur_query();
                        }
                        return filterList;
                    };
                    var addFilter = function addFilter() {
                        filterList.push(first_stage[index]);
                        if (filterList.length >= _constants.STOCK_FILTER_LIMIT) {
                            return filterList;
                        }
                        return nextFilter();
                    };
                    return addFilter();
                };
                return recur_per(0);
            });
        };
        return clearName().then(function () {
            return recur_query();
        }).then(function (filterList) {
            var filterList1 = [];
            var stage2 = function stage2(pIndex) {
                return pIndex < filterList.length ? _this2.getPredictPERWarp(filterList[pIndex]._id, session, true).then(function (_ref47) {
                    var _ref48 = (0, _slicedToArray3.default)(_ref47, 2),
                        result = _ref48[0],
                        index = _ref48[1];

                    console.log(filterList[pIndex].name);
                    console.log(result);
                    var predictVal = result.match(/^-?\d+.?\d+/);
                    if (predictVal && option.pre[1] === '>' && predictVal[0] > option.pre[2] || option.pre[1] === '<' && predictVal[0] < option.pre[2]) {
                        filterList1.push(filterList[pIndex]);
                    }
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[pIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return stage2(pIndex + 1);
                }) : _promise2.default.resolve();
            };
            console.log('stage two');
            return option.pre ? stage2(0).then(function () {
                return filterList1;
            }) : filterList;
        }).then(function (filterList) {
            var filterList1 = [];
            var stage3 = function stage3(iIndex) {
                return iIndex < filterList.length ? _this2.getIntervalWarp(filterList[iIndex]._id, session).then(function (_ref49) {
                    var _ref50 = (0, _slicedToArray3.default)(_ref49, 2),
                        result = _ref50[0],
                        index = _ref50[1];

                    console.log(filterList[iIndex].name);
                    console.log(result);
                    var intervalVal = result.match(/(\d+) (\d+) (\d+)$/);
                    if (intervalVal) {
                        var iok = option.interval ? option.interval[1] === '>' && intervalVal[1] > option.interval[2] || option.interval[1] === '<' && intervalVal[1] < option.interval[2] ? true : false : true;
                        var vok = option.vol ? option.vol[1] === '>' && intervalVal[2] > option.vol[2] || option.vol[1] === '<' && intervalVal[2] < option.vol[2] ? true : false : true;
                        var cok = option.close ? option.close[1] === '>' && intervalVal[3] > option.close[2] || option.close[1] === '<' && intervalVal[3] < option.close[2] ? true : false : true;
                        if (iok && vok && cok) {
                            filterList1.push(filterList[iIndex]);
                        }
                    }
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return stage3(iIndex + 1);
                }) : _promise2.default.resolve();
            };
            console.log('stage three');
            return option.interval || option.vol || option.close ? stage3(0).then(function () {
                return filterList1;
            }) : filterList;
        }).then(function (filterList) {
            var addFilter = function addFilter(index) {
                return index < filterList.length ? StockTagTool.addTag(filterList[index]._id, option.name, user).then(function (add_result) {
                    (0, _sendWs2.default)({
                        type: 'stock',
                        data: add_result.id
                    }, 0, 1);
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return addFilter(index + 1);
                }) : _promise2.default.resolve(filterList);
            };
            return addFilter(0);
        });
    },
    stockFilter: function stockFilter() {
        var option = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

        var _this3 = this;

        var user = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { _id: '000000000000000000000000' };
        var session = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        var web = option ? true : false;
        if (!option) {
            option = _constants.STOCK_FILTER;
        }
        var last = false;
        var queried = 0;
        var filterList = [];
        var clearName = function clearName() {
            return StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                var delFilter = function delFilter(index) {
                    return index < result.items.length ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(function (del_result) {
                        (0, _sendWs2.default)({
                            type: 'stock',
                            data: del_result.id
                        }, 0, 1);
                    }).catch(function (err) {
                        if (web) {
                            (0, _sendWs2.default)({
                                type: user.username,
                                data: 'Filter ' + option.name + ': ' + result.items[iIndex].index + ' Error'
                            }, 0);
                        }
                        (0, _utility.handleError)(err, 'Stock filter');
                    }).then(function () {
                        return delFilter(index + 1);
                    }) : _promise2.default.resolve(result.items.length);
                };
                return delFilter(0);
            });
        };
        var recur_query = function recur_query() {
            return StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, _constants.STOCK_FILTER_LIMIT).then(function (result) {
                console.log(queried);
                if (result.items.length < _constants.STOCK_FILTER_LIMIT) {
                    last = true;
                }
                queried += result.items.length;
                if (result.items.length < 1) {
                    return filterList;
                }
                var first_stage = [];
                result.items.forEach(function (i) {
                    var pok = option.pp ? option.pp[1] === '>' && i.profitIndex > option.pp[2] || option.pp[1] === '<' && i.profitIndex < option.pp[2] ? true : false : true;
                    var sok = option.ss ? option.ss[1] === '>' && i.safetyIndex > option.ss[2] || option.ss[1] === '<' && i.safetyIndex < option.ss[2] ? true : false : true;
                    var mok = option.mm ? option.mm[1] === '>' && i.managementIndex > option.mm[2] || option.mm[1] === '<' && i.managementIndex < option.mm[2] ? true : false : true;
                    if (pok && sok && mok) {
                        first_stage.push(i);
                    }
                });
                if (first_stage.length < 1) {
                    return filterList;
                }
                var recur_per = function recur_per(index) {
                    var nextFilter = function nextFilter() {
                        index++;
                        if (index < first_stage.length) {
                            return recur_per(index);
                        }
                        if (!last) {
                            return recur_query();
                        }
                        return filterList;
                    };
                    var addFilter = function addFilter() {
                        filterList.push(first_stage[index]);
                        if (filterList.length >= _constants.STOCK_FILTER_LIMIT) {
                            return filterList;
                        }
                        return nextFilter();
                    };
                    if (option.per) {
                        return _this3.getStockPER(first_stage[index]._id).then(function (_ref51) {
                            var _ref52 = (0, _slicedToArray3.default)(_ref51, 1),
                                stockPer = _ref52[0];

                            if (option.per && stockPer > 0 && (option.per[1] === '>' && stockPer > option.per[2] * 2 / 3 || option.per[1] === '<' && stockPer < option.per[2] * 4 / 3)) {
                                console.log(stockPer);
                                console.log(first_stage[index].name);
                                if (option.yieldNumber) {
                                    return _this3.getStockYield(first_stage[index]._id).then(function (stockYield) {
                                        if (option.yieldNumber && stockYield > 0 && (option.yieldNumber[1] === '>' && stockYield > option.yieldNumber[2] * 2 / 3 || option.yieldNumber[1] === '<' && stockYield < option.yieldNumber[2] * 4 / 3)) {
                                            console.log(stockYield);
                                            return addFilter();
                                        } else {
                                            return nextFilter();
                                        }
                                    });
                                } else {
                                    return addFilter();
                                }
                            } else {
                                return nextFilter();
                            }
                        }).catch(function (err) {
                            if (web) {
                                (0, _sendWs2.default)({
                                    type: user.username,
                                    data: 'Filter ' + option.name + ': ' + first_stage[index].index + ' Error'
                                }, 0);
                            }
                            (0, _utility.handleError)(err, 'Stock filter');
                            return nextFilter();
                        });
                    } else if (option.yieldNumber) {
                        return _this3.getStockYield(first_stage[index]._id).then(function (stockYield) {
                            if (option.yieldNumber && stockYield > 0 && (option.yieldNumber[1] === '>' && stockYield > option.yieldNumber[2] * 2 / 3 || option.yieldNumber[1] === '<' && stockYield < option.yieldNumber[2] * 4 / 3)) {
                                console.log(stockYield);
                                console.log(first_stage[index].name);
                                return addFilter();
                            } else {
                                return nextFilter();
                            }
                        }).catch(function (err) {
                            if (web) {
                                (0, _sendWs2.default)({
                                    type: user.username,
                                    data: 'Filter ' + option.name + ': ' + first_stage[index].index + ' Error'
                                }, 0);
                            }
                            (0, _utility.handleError)(err, 'Stock filter');
                            return nextFilter();
                        });
                    } else {
                        return addFilter();
                    }
                };
                return recur_per(0);
            });
        };
        return clearName().then(function () {
            return recur_query();
        }).then(function (filterList) {
            var filterList1 = [];
            var stage2 = function stage2(pIndex) {
                return pIndex < filterList.length ? _this3.getPredictPERWarp(filterList[pIndex]._id, session, true).then(function (_ref53) {
                    var _ref54 = (0, _slicedToArray3.default)(_ref53, 2),
                        result = _ref54[0],
                        index = _ref54[1];

                    console.log(filterList[pIndex].name);
                    console.log(result);
                    var predictVal = result.match(/^-?\d+.?\d+/);
                    if (predictVal && option.pre[1] === '>' && predictVal[0] > option.pre[2] || option.pre[1] === '<' && predictVal[0] < option.pre[2]) {
                        filterList1.push(filterList[pIndex]);
                    }
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[pIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return stage2(pIndex + 1);
                }) : _promise2.default.resolve();
            };
            console.log('stage two');
            return option.pre ? stage2(0).then(function () {
                return filterList1;
            }) : filterList;
        }).then(function (filterList) {
            var filterList1 = [];
            var stage3 = function stage3(iIndex) {
                return iIndex < filterList.length ? _this3.getIntervalWarp(filterList[iIndex]._id, session).then(function (_ref55) {
                    var _ref56 = (0, _slicedToArray3.default)(_ref55, 2),
                        result = _ref56[0],
                        index = _ref56[1];

                    console.log(filterList[iIndex].name);
                    console.log(result);
                    var intervalVal = result.match(/(\d+) (\d+) (\d+)$/);
                    if (intervalVal) {
                        var iok = option.interval ? option.interval[1] === '>' && intervalVal[1] > option.interval[2] || option.interval[1] === '<' && intervalVal[1] < option.interval[2] ? true : false : true;
                        var vok = option.vol ? option.vol[1] === '>' && intervalVal[2] > option.vol[2] || option.vol[1] === '<' && intervalVal[2] < option.vol[2] ? true : false : true;
                        var cok = option.close ? option.close[1] === '>' && intervalVal[3] > option.close[2] || option.close[1] === '<' && intervalVal[3] < option.close[2] ? true : false : true;
                        if (iok && vok && cok) {
                            filterList1.push(filterList[iIndex]);
                        }
                    }
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return stage3(iIndex + 1);
                }) : _promise2.default.resolve();
            };
            console.log('stage three');
            return option.interval || option.vol || option.close ? stage3(0).then(function () {
                return filterList1;
            }) : filterList;
        }).then(function (filterList) {
            var addFilter = function addFilter(index) {
                return index < filterList.length ? StockTagTool.addTag(filterList[index]._id, option.name, user).then(function (add_result) {
                    (0, _sendWs2.default)({
                        type: 'stock',
                        data: add_result.id
                    }, 0, 1);
                }).catch(function (err) {
                    if (web) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: 'Filter ' + option.name + ': ' + filterList[iIndex].index + ' Error'
                        }, 0);
                    }
                    (0, _utility.handleError)(err, 'Stock filter');
                }).then(function () {
                    return addFilter(index + 1);
                }) : _promise2.default.resolve(filterList);
            };
            return addFilter(0);
        });
    },
    stockFilterWarp: function stockFilterWarp() {
        var option = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
        var user = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : { _id: '000000000000000000000000' };
        var session = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

        if (stockFiltering) {
            return (0, _utility.handleError)(new _utility.HoError('there is another filter running'));
        }
        stockFiltering = true;
        return this.stockFilterV3(option, user, session).then(function (list) {
            stockFiltering = false;
            var number = list.length;
            console.log('End: ' + number);
            (0, _sendWs2.default)('stock filter: ' + number, 0, 0, true);
            if (number > 0) {
                (0, _sendWs2.default)(list.reduce(function (a, v) {
                    return a + ' ' + v.name;
                }, ''), 0, 0, true);
            }
            return number;
        }).catch(function (err) {
            stockFiltering = false;
            return (0, _utility.handleError)(err);
        });
    },
    getStockTotal: function getStockTotal(user) {
        return (0, _mongoTool2.default)('find', _constants.TOTALDB, { owner: user._id, sType: { $exists: false } }).then(function (items) {
            if (items.length < 1) {
                //new user
                return (0, _mongoTool2.default)('insert', _constants.TOTALDB, {
                    owner: user._id,
                    index: 0,
                    name: '投資部位',
                    type: 'total',
                    amount: 0,
                    count: 1
                }).then(function (item) {
                    return {
                        remain: item[0].amount,
                        total: 0,
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
                            str: ''
                        }]
                    };
                });
            }
            var remain = 0;
            var totalName = '';
            var totalType = '';
            var profit = 0;
            var totalPrice = 0;
            //let plus = 0;
            //let minus = 0;
            var stock = [];
            var getStock = function getStock(v) {
                if (v.name === '投資部位' && v.type === 'total') {
                    remain = v.amount;
                    totalName = v.name;
                    totalType = v.type;
                    return _promise2.default.resolve();
                } else {
                    return getStockPrice(v.setype ? v.setype : 'twse', v.index).then(function (price) {
                        var current = price * v.count;
                        totalPrice += current;
                        var p = current + v.amount - v.orig;
                        profit += p;
                        //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                        //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                        //plus += p;
                        //minus += m;
                        stock.push({
                            name: v.name,
                            type: v.type,
                            //cost: v.cost,
                            price: price,
                            mid: v.mid,
                            count: v.count,
                            remain: Math.round(v.amount * 100) / 100,
                            profit: p,
                            //top: v.top,
                            //bottom: v.bottom,
                            //plus: p,
                            //minus: m,
                            current: current,
                            str: v.str ? v.str : ''
                        });
                    });
                }
            };
            var recurGet = function recurGet(index) {
                if (index >= items.length) {
                    stock.unshift({
                        name: totalName,
                        type: totalType,
                        profit: profit,
                        price: totalPrice,
                        mid: 1,
                        remain: totalPrice + remain > 0 ? Math.round(profit / (totalPrice + remain) * 10000) / 100 + '%' : '0%',
                        count: 1,
                        //plus: Math.floor(plus * 100) / 100,
                        //minus: Math.floor(minus * 100) / 100,
                        current: totalPrice,
                        str: ''
                    });
                    return {
                        remain: remain,
                        total: totalPrice + remain,
                        stock: stock
                    };
                } else {
                    return getStock(items[index]).then(function () {
                        return recurGet(index + 1);
                    });
                }
            };
            return recurGet(0);
        });
    },
    updateStockTotal: function updateStockTotal(user, info) {
        var real = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

        //remain 800 重設remain
        //delete twse2330 刪除股票
        //twse2330 (-)0.5 增減張數
        //twse2330 5000 amount 新增股票(設定最大金額)
        //twse2330 2 50 輸入交易股價
        //twse2330 2 450 cost 重設cost
        //#2330 300 220
        return (0, _mongoTool2.default)('find', _constants.TOTALDB, { owner: user._id, sType: { $exists: false } }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('No user data!!!'));
            }
            var remain = 0;
            var totalName = '';
            var totalType = '';
            var totalId = null;
            var _iteratorNormalCompletion16 = true;
            var _didIteratorError16 = false;
            var _iteratorError16 = undefined;

            try {
                for (var _iterator16 = (0, _getIterator3.default)(items), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                    var v = _step16.value;

                    if (v.name === '投資部位' && v.type === 'total') {
                        remain = v.amount;
                        totalName = v.name;
                        totalType = v.type;
                        totalId = v._id;
                    }
                }
            } catch (err) {
                _didIteratorError16 = true;
                _iteratorError16 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion16 && _iterator16.return) {
                        _iterator16.return();
                    }
                } finally {
                    if (_didIteratorError16) {
                        throw _iteratorError16;
                    }
                }
            }

            var updateTotal = {};
            var removeTotal = [];
            var single = function single(v) {
                //const cmd = v.match(/(\d+|remain|delete)\s+(\-?\d+\.?\d*)\s*(\d+\.?\d*|amount)?\s*(cost)?/)
                var cmd = v.match(/^([\da-zA-Z]+)\s+([\dA-Z]+|\-?\d+\.?\d*)\s*(\d+\.?\d*|amount)?\s*(cost)?$/);
                if (cmd) {
                    if (cmd[1] === 'remain') {
                        remain = +cmd[2];
                        updateTotal[totalId] = { amount: remain };
                    } else if (cmd[1] === 'delete') {
                        var setype = cmd[2].substring(0, 4);
                        var index = cmd[2].substring(4);

                        var _loop = function _loop(i) {
                            if (index === items[i].index) {
                                return {
                                    v: getStockPrice(setype, items[i].index).then(function (price) {
                                        remain += price * items[i].count * (1 - _constants.TRADE_FEE);
                                        updateTotal[totalId] = { amount: remain };
                                        if (items[i]._id) {
                                            removeTotal.push(items[i]._id);
                                        }
                                        items.splice(i, 1);
                                    })
                                };
                                return 'break';
                            }
                        };

                        _loop2: for (var i in items) {
                            var _ret12 = _loop(i);

                            switch (_ret12) {
                                case 'break':
                                    break _loop2;

                                default:
                                    if ((typeof _ret12 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret12)) === "object") return _ret12.v;
                            }
                        }
                    } else {
                        var is_find = false;
                        var _setype = cmd[1].substring(0, 4);
                        var _index = cmd[1].substring(4);

                        var _loop3 = function _loop3(_i33) {
                            if (_index === items[_i33].index) {
                                is_find = true;
                                if (cmd[3] === 'amount') {
                                    var newWeb = adjustWeb(items[_i33].web, items[_i33].mid, +cmd[2]);
                                    if (!newWeb) {
                                        return {
                                            v: (0, _utility.handleError)(new _utility.HoError('Amount need large than ' + Math.ceil(items[_i33].mid * (items[_i33].web.length - 1) / 3)))
                                        };
                                    }
                                    items[_i33].web = newWeb.arr;
                                    items[_i33].mid = newWeb.mid;
                                    items[_i33].times = newWeb.times;
                                    items[_i33].amount = items[_i33].amount + +cmd[2] - items[_i33].orig;
                                    items[_i33].orig = +cmd[2];
                                    if (items[_i33]._id) {
                                        if (updateTotal[items[_i33]._id]) {
                                            updateTotal[items[_i33]._id].web = items[_i33].web;
                                            updateTotal[items[_i33]._id].mid = items[_i33].mid;
                                            updateTotal[items[_i33]._id].times = items[_i33].times;
                                            updateTotal[items[_i33]._id].amount = items[_i33].amount;
                                            updateTotal[items[_i33]._id].orig = items[_i33].orig;
                                        } else {
                                            updateTotal[items[_i33]._id] = {
                                                web: items[_i33].web,
                                                mid: items[_i33].mid,
                                                times: items[_i33].times,
                                                amount: items[_i33].amount,
                                                orig: items[_i33].orig
                                            };
                                        }
                                    }
                                } else if (+cmd[2] >= 0 && +cmd[3] >= 0 && cmd[4]) {
                                    //} else if (cmd[4]) {
                                    items[_i33].count = +cmd[2];
                                    remain = remain + items[_i33].orig - items[_i33].amount - +cmd[3];
                                    items[_i33].amount = items[_i33].orig - +cmd[3];
                                    updateTotal[totalId] = { amount: remain };
                                    if (items[_i33]._id) {
                                        if (updateTotal[items[_i33]._id]) {
                                            updateTotal[items[_i33]._id].count = items[_i33].count;
                                            updateTotal[items[_i33]._id].amount = items[_i33].amount;
                                        } else {
                                            updateTotal[items[_i33]._id] = { count: items[_i33].count, amount: items[_i33].amount };
                                        }
                                    }
                                } else if (!isNaN(+cmd[2])) {
                                    var orig_count = items[_i33].count;
                                    items[_i33].count += +cmd[2];
                                    if (items[_i33].count < 0) {
                                        cmd[2] = -orig_count;
                                        items[_i33].count = 0;
                                    }
                                    return {
                                        v: getStockPrice(_setype, items[_i33].index).then(function (price) {
                                            price = !isNaN(+cmd[3]) ? +cmd[3] : price;
                                            var new_cost = +cmd[2] > 0 ? price * +cmd[2] : (1 - _constants.TRADE_FEE) * price * +cmd[2];
                                            items[_i33].amount -= new_cost;
                                            remain -= new_cost;
                                            updateTotal[totalId] = { amount: remain };
                                            var time = Math.round(new Date().getTime() / 1000);
                                            var tradeType = +cmd[2] > 0 ? 'buy' : 'sell';
                                            if (tradeType === 'buy') {
                                                var is_insert = false;
                                                for (var k = 0; k < items[_i33].previous.buy.length; k++) {
                                                    if (price < items[_i33].previous.buy[k].price) {
                                                        items[_i33].previous.buy.splice(k, 0, { price: price, time: time });
                                                        is_insert = true;
                                                        break;
                                                    }
                                                }
                                                if (!is_insert) {
                                                    items[_i33].previous.buy.push({ price: price, time: time });
                                                }
                                                items[_i33].previous = {
                                                    price: price,
                                                    time: time,
                                                    type: 'buy',
                                                    buy: items[_i33].previous.buy.filter(function (v) {
                                                        return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                                                    }),
                                                    sell: items[_i33].previous.sell
                                                };
                                            } else if (tradeType === 'sell') {
                                                var _is_insert = false;
                                                for (var _k = 0; _k < items[_i33].previous.sell.length; _k++) {
                                                    if (price > items[_i33].previous.sell[_k].price) {
                                                        items[_i33].previous.sell.splice(_k, 0, { price: price, time: time });
                                                        _is_insert = true;
                                                        break;
                                                    }
                                                }
                                                if (!_is_insert) {
                                                    items[_i33].previous.sell.push({ price: price, time: time });
                                                }
                                                items[_i33].previous = {
                                                    price: price,
                                                    time: time,
                                                    type: 'sell',
                                                    sell: items[_i33].previous.sell.filter(function (v) {
                                                        return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                                                    }),
                                                    buy: items[_i33].previous.buy
                                                };
                                            }
                                            if (items[_i33]._id) {
                                                if (updateTotal[items[_i33]._id]) {
                                                    updateTotal[items[_i33]._id].count = items[_i33].count;
                                                    updateTotal[items[_i33]._id].amount = items[_i33].amount;
                                                    updateTotal[items[_i33]._id].previous = items[_i33].previous;
                                                } else {
                                                    updateTotal[items[_i33]._id] = { count: items[_i33].count,
                                                        amount: items[_i33].amount,
                                                        previous: items[_i33].previous
                                                    };
                                                }
                                            }
                                        })
                                    };
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
                                return 'break';
                            }
                        };

                        _loop4: for (var _i33 in items) {
                            var _ret13 = _loop3(_i33);

                            switch (_ret13) {
                                case 'break':
                                    break _loop4;

                                default:
                                    if ((typeof _ret13 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret13)) === "object") return _ret13.v;
                            }
                        }

                        if (!is_find) {
                            if (+cmd[2] >= 0 && cmd[3] === 'amount') {
                                var _ret14 = function () {
                                    //init amount
                                    //get web? arr mid count
                                    var setype = cmd[1].substring(0, 4);
                                    var index = cmd[1].substring(4);
                                    return {
                                        v: (0, _mongoTool2.default)('find', _constants.STOCKDB, { type: setype, index: index }, { limit: 1 }).then(function (item) {
                                            if (item.length < 1) {
                                                return (0, _utility.handleError)(new _utility.HoError('No stock data!!!'));
                                            }
                                            if (!item[0].web) {
                                                return (0, _utility.handleError)(new _utility.HoError('No web data!!!'));
                                            }
                                            var newWeb = adjustWeb(item[0].web.arr, item[0].web.mid, +cmd[2]);
                                            if (!newWeb) {
                                                return (0, _utility.handleError)(new _utility.HoError('Amount need large than ' + Math.ceil(item[0].web.mid * (item[0].web.arr.length - 1) / 3)));
                                            }
                                            return getBasicStockData(setype, index).then(function (basic) {
                                                return getStockPrice(setype, basic.stock_index).then(function (price) {
                                                    console.log(basic);
                                                    items.push({
                                                        //加setype ind name加setype
                                                        owner: user._id,
                                                        setype: setype,
                                                        index: basic.stock_index,
                                                        name: setype + ' ' + basic.stock_index + ' ' + basic.stock_name,
                                                        type: basic.stock_ind ? basic.stock_class + ' ' + basic.stock_ind : '' + basic.stock_class,
                                                        //cost: 0,
                                                        count: 0,
                                                        web: newWeb.arr,
                                                        wType: item[0].web.type,
                                                        mid: newWeb.mid,
                                                        times: newWeb.times,
                                                        amount: +cmd[2],
                                                        orig: +cmd[2],
                                                        //top: Math.floor(price * 1.2 * 100) / 100,
                                                        //bottom: Math.floor(price * 0.95 * 100) / 100,
                                                        price: price,
                                                        previous: { buy: [], sell: [] },
                                                        newMid: []
                                                    });
                                                    //remain -= cost;
                                                    //updateTotal[totalId] = {cost: remain};
                                                });
                                            });
                                        })
                                    };
                                    /*} else if (cmd[4] && +cmd[2] > 0) {
                                        return getBasicStockData('twse', cmd[1]).then(basic => getStockPrice('tese', basic.stock_index).then(price => {
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
                                }();

                                if ((typeof _ret14 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret14)) === "object") return _ret14.v;
                            }
                        }
                    }
                }
            };
            var updateReal = function updateReal() {
                console.log(updateTotal);
                console.log(removeTotal);
                console.log(remain);
                console.log(items);
                var singleUpdate = function singleUpdate(v) {
                    if (!v._id) {
                        return (0, _mongoTool2.default)('insert', _constants.TOTALDB, v);
                    } else if (updateTotal[v._id]) {
                        return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: v._id }, { $set: updateTotal[v._id] });
                    } else {
                        return _promise2.default.resolve();
                    }
                };
                var recurUpdate = function recurUpdate(index) {
                    return index >= items.length ? recurRemove(0) : singleUpdate(items[index]).then(function () {
                        return recurUpdate(index + 1);
                    });
                };
                var recurRemove = function recurRemove(index) {
                    return index >= removeTotal.length ? rest() : (0, _mongoTool2.default)('remove', _constants.TOTALDB, { _id: removeTotal[index], $isolated: 1 }).then(function () {
                        return recurRemove(index + 1);
                    });
                };
                return real ? recurUpdate(0) : rest();
            };
            var rest = function rest() {
                var profit = 0;
                var totalPrice = 0;
                //let plus = 0;
                //let minus = 0;
                var stock = [];
                var getStock = function getStock(v) {
                    if (v.name === '投資部位' && v.type === 'total') {
                        return _promise2.default.resolve();
                    } else {
                        return getStockPrice(v.setype ? v.setype : 'twse', v.index).then(function (price) {
                            var current = price * v.count;
                            totalPrice += current;
                            var p = current + v.amount - v.orig;
                            profit += p;
                            //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                            //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                            //plus += p;
                            //minus += m;
                            stock.push({
                                name: v.name,
                                type: v.type,
                                //cost: v.cost,
                                price: price,
                                mid: v.mid,
                                count: v.count,
                                remain: Math.round(v.amount * 100) / 100,
                                profit: p,
                                //top: v.top,
                                //bottom: v.bottom,
                                //plus: p,
                                //minus: m,
                                current: current,
                                str: v.str ? v.str : ''
                            });
                        });
                    }
                };
                var recurGet = function recurGet(index) {
                    if (index >= items.length) {
                        stock.unshift({
                            name: totalName,
                            type: totalType,
                            profit: profit,
                            price: totalPrice,
                            mid: 1,
                            remain: totalPrice + remain > 0 ? Math.round(profit / (totalPrice + remain) * 10000) / 100 + '%' : '0%',
                            count: 1,
                            //plus: Math.floor(plus * 100) / 100,
                            //minus: Math.floor(minus * 100) / 100,
                            current: totalPrice,
                            str: ''
                        });
                        return {
                            remain: remain,
                            total: totalPrice + remain,
                            stock: stock
                        };
                    } else {
                        return getStock(items[index]).then(function () {
                            return recurGet(index + 1);
                        });
                    }
                };
                return recurGet(0);
            };
            var recur = function recur(index) {
                return index >= info.length ? updateReal() : _promise2.default.resolve(single(info[index])).then(function () {
                    return recur(index + 1);
                });
            };
            return recur(0);
        });
    }
};

//抓上市及上櫃

var getStockList = exports.getStockList = function getStockList(type) {
    var stocktype = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    var _ret15 = function () {
        switch (type) {
            case 'twse':
                //1: sii(odd) 2: sii(even)
                //3: otc(odd) 4: odd(even)
                var getList = function getList(stocktype) {
                    return (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/mops/web/ajax_t51sb01?encodeURIComponent=1&step=1&firstin=1&code=&TYPEK=' + (stocktype === 3 || stocktype === 4 ? 'otc' : 'sii')).then(function (raw_data) {
                        return (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[1], 'tr', stocktype === 2 || stocktype === 4 ? 'even' : 'odd').map(function (t) {
                            return (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0])[0].match(/\d+/)[0];
                        });
                    });
                };
                return {
                    v: stocktype ? getList(stocktype) : getList(1).then(function (list) {
                        return getList(2).then(function (list2) {
                            list = list.concat(list2);
                            return getList(3).then(function (list3) {
                                list = list.concat(list3);
                                return getList(4).then(function (list4) {
                                    return list.concat(list4);
                                });
                            });
                        });
                    })
                };
            default:
                return {
                    v: (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'))
                };
        }
    }();

    if ((typeof _ret15 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret15)) === "object") return _ret15.v;
};

var getTwseAnnual = function getTwseAnnual(index, year, filePath) {
    return (0, _apiTool2.default)('url', 'https://doc.twse.com.tw/server-java/t57sb01?id=&key=&step=1&co_id=' + index + '&year=' + (year - 1911) + '&seamon=&mtype=F&dtype=F04', { referer: 'https://doc.twse.com.tw/' }).then(function (raw_data) {
        var center = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0];
        if (!center) {
            console.log(raw_data);
            return (0, _utility.handleError)(new _utility.HoError('cannot find form'));
        }
        var form = (0, _utility.findTag)(center, 'form')[0];
        if (!form) {
            console.log(raw_data);
            return (0, _utility.handleError)(new _utility.HoError('cannot find form'));
        }
        var tds = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(form, 'table')[0], 'table')[0], 'tr')[1], 'td');
        var filename = false;
        var _iteratorNormalCompletion17 = true;
        var _didIteratorError17 = false;
        var _iteratorError17 = undefined;

        try {
            for (var _iterator17 = (0, _getIterator3.default)(tds), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                var t = _step17.value;

                var a = (0, _utility.findTag)(t, 'a')[0];
                if (a) {
                    filename = (0, _utility.findTag)(a)[0];
                    break;
                }
            }
        } catch (err) {
            _didIteratorError17 = true;
            _iteratorError17 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion17 && _iterator17.return) {
                    _iterator17.return();
                }
            } finally {
                if (_didIteratorError17) {
                    throw _iteratorError17;
                }
            }
        }

        if (!filename) {
            return (0, _utility.handleError)(new _utility.HoError('cannot find annual location'));
        }
        console.log(filename);
        if ((0, _mime.getExtname)(filename).ext === '.zip') {
            return (0, _apiTool2.default)('url', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=' + index + '&filename=' + filename, { referer: 'https://doc.twse.com.tw/' }, { filePath: filePath }).then(function () {
                return filename;
            });
        } else {
            return (0, _apiTool2.default)('url', 'https://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=' + index + '&filename=' + filename, { referer: 'https://doc.twse.com.tw/' }).then(function (raw_data) {
                return (0, _apiTool2.default)('url', (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'a')[0].attribs.href, 'https://doc.twse.com.tw'), { filePath: filePath }).then(function () {
                    return filename;
                });
            });
        }
    });
};

var getSingleAnnual = exports.getSingleAnnual = function getSingleAnnual(year, folder, index) {
    var annual_list = [];
    var recur_annual = function recur_annual(cYear, annual_folder) {
        if (!annual_list.includes(cYear.toString()) && !annual_list.includes('read' + cYear)) {
            var _ret16 = function () {
                var folderPath = '/mnt/stock/twse/' + index;
                var filePath = folderPath + '/tmp';
                var mkfolder = function mkfolder() {
                    return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                        return (0, _mkdirp2.default)(folderPath, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    });
                };
                return {
                    v: mkfolder().then(function () {
                        return getTwseAnnual(index, cYear, filePath).then(function (filename) {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: '' + cYear + (0, _mime.getExtname)(filename).ext,
                                filePath: filePath,
                                parent: annual_folder,
                                rest: function rest() {
                                    cYear--;
                                    if (cYear > year - 5) {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve(recur_annual(cYear, annual_folder));
                                            }, 5000);
                                        });
                                    }
                                },
                                errhandle: function errhandle(err) {
                                    return (0, _utility.handleError)(err);
                                }
                            });
                        }).catch(function (err) {
                            (0, _utility.handleError)(err, 'get annual');
                            cYear--;
                            if (cYear > year - 5) {
                                return new _promise2.default(function (resolve, reject) {
                                    return setTimeout(function () {
                                        return resolve(recur_annual(cYear, annual_folder));
                                    }, 5000);
                                });
                            }
                        });
                    })
                };
            }();

            if ((typeof _ret16 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret16)) === "object") return _ret16.v;
        } else {
            cYear--;
            if (cYear > year - 5) {
                return recur_annual(cYear, annual_folder);
            }
        }
    };
    return (0, _apiToolGoogle2.default)('list folder', {
        folderId: folder,
        name: 'tw' + index
    }).then(function (annualList) {
        return annualList.length < 1 ? (0, _apiToolGoogle2.default)('create', {
            name: 'tw' + index,
            parent: folder
        }).then(function (metadata) {
            return recur_annual(year, metadata.id);
        }) : (0, _apiToolGoogle2.default)('list file', { folderId: annualList[0].id }).then(function (metadataList) {
            var _iteratorNormalCompletion18 = true;
            var _didIteratorError18 = false;
            var _iteratorError18 = undefined;

            try {
                for (var _iterator18 = (0, _getIterator3.default)(metadataList), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                    var i = _step18.value;

                    annual_list.push((0, _mime.getExtname)(i.title).front);
                }
            } catch (err) {
                _didIteratorError18 = true;
                _iteratorError18 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion18 && _iterator18.return) {
                        _iterator18.return();
                    }
                } finally {
                    if (_didIteratorError18) {
                        throw _iteratorError18;
                    }
                }
            }

            console.log(annual_list);
            return recur_annual(year, annualList[0].id);
        });
    });
};

var stockStatus = exports.stockStatus = function stockStatus(newStr) {
    return (0, _mongoTool2.default)('find', _constants.TOTALDB, { sType: { $exists: false } }).then(function (items) {
        var recur_price = function recur_price(index) {
            return index >= items.length ? _promise2.default.resolve() : items[index].index === 0 ? recur_price(index + 1) : getStockPrice(items[index].setype, items[index].index).then(function (price) {
                if (price === 0) {
                    return 0;
                }
                var item = items[index];
                console.log(item);
                //new mid
                var newArr = item.newMid.length > 0 ? item.web.map(function (v) {
                    return v * item.newMid[item.newMid.length - 1] / item.mid;
                }) : item.web;
                var checkMid = item.newMid.length > 1 ? item.newMid[item.newMid.length - 2] : item.mid;
                while (item.newMid.length > 0 && (item.newMid[item.newMid.length - 1] > checkMid && price < checkMid || item.newMid[item.newMid.length - 1] <= checkMid && price > checkMid)) {
                    item.newMid.pop();
                    if (item.newMid.length === 0 && Math.round(new Date().getTime() / 1000) - item.tmpPT.time < _constants.RANGE_INTERVAL) {
                        item.previous.price = item.tmpPT.price;
                        item.previous.time = item.tmpPT.time;
                        item.previous.type = item.tmpPT.type;
                    } else {
                        item.previous.time = 0;
                    }
                    newArr = item.newMid.length > 0 ? item.web.map(function (v) {
                        return v * item.newMid[item.newMid.length - 1] / item.mid;
                    }) : item.web;
                    checkMid = item.newMid.length > 1 ? item.newMid[item.newMid.length - 2] : item.mid;
                }
                var suggestion = stockProcess(price, newArr, item.times, item.previous, item.amount, item.count, item.wType);
                while (suggestion.resetWeb) {
                    if (item.newMid.length === 0) {
                        item.tmpPT = {
                            price: item.previous.price,
                            time: item.previous.time,
                            type: item.previous.type
                        };
                    }
                    item.previous.time = 0;
                    item.newMid.push(suggestion.newMid);
                    newArr = item.newMid.length > 0 ? item.web.map(function (v) {
                        return v * item.newMid[item.newMid.length - 1] / item.mid;
                    }) : item.web;
                    suggestion = stockProcess(price, newArr, item.times, item.previous, item.amount, item.count, item.wType);
                }
                var count = 0;
                var amount = item.amount;
                if (suggestion.type === 7) {
                    if (amount > item.orig * 7 / 8) {
                        var tmpAmount = amount - item.orig * 3 / 4;
                        while (tmpAmount - suggestion.buy > 0) {
                            amount -= suggestion.buy;
                            tmpAmount = amount - item.orig * 3 / 4;
                            count++;
                        }
                        suggestion.str += '[new buy ' + count + '] ';
                    } else {
                        suggestion.str += '[new buy no need] ';
                    }
                } else if (suggestion.type === 3) {
                    if (amount > item.orig * 5 / 8) {
                        var _tmpAmount = amount - item.orig / 2;
                        while (_tmpAmount - suggestion.buy > 0) {
                            amount -= suggestion.buy;
                            _tmpAmount = amount - item.orig / 2;
                            count++;
                        }
                        suggestion.str += '[new buy ' + count + '] ';
                    } else {
                        suggestion.str += '[new buy no need] ';
                    }
                } else if (suggestion.type === 6) {
                    if (amount > item.orig * 3 / 8) {
                        var _tmpAmount2 = amount - item.orig / 4;
                        while (_tmpAmount2 - suggestion.buy > 0) {
                            amount -= suggestion.buy;
                            _tmpAmount2 = amount - item.orig / 4;
                            count++;
                        }
                        suggestion.str += '[new buy ' + count + '] ';
                    } else {
                        suggestion.str += '[new buy no need] ';
                    }
                }
                count = 0;
                amount = item.amount;
                if (suggestion.type === 9) {
                    if (amount < item.orig / 8) {
                        var _tmpAmount3 = item.orig / 4 - amount;
                        while (_tmpAmount3 - suggestion.sell * (1 - _constants.TRADE_FEE) > 0) {
                            amount += suggestion.sell * (1 - _constants.TRADE_FEE);
                            _tmpAmount3 = item.orig / 4 - amount;
                            count++;
                        }
                        suggestion.str += '[new sell ' + count + '] ';
                    } else {
                        suggestion.str += '[new sell no need] ';
                    }
                } else if (suggestion.type === 5) {
                    if (amount < item.orig * 3 / 8) {
                        var _tmpAmount4 = item.orig / 2 - amount;
                        while (_tmpAmount4 - suggestion.sell * (1 - _constants.TRADE_FEE) > 0) {
                            amount += suggestion.sell * (1 - _constants.TRADE_FEE);
                            _tmpAmount4 = item.orig / 2 - amount;
                            count++;
                        }
                        suggestion.str += '[new sell ' + count + '] ';
                    } else {
                        suggestion.str += '[new sell no need] ';
                    }
                } else if (suggestion.type === 8) {
                    if (amount < item.orig * 5 / 8) {
                        var _tmpAmount5 = item.orig * 3 / 4 - amount;
                        while (_tmpAmount5 - suggestion.sell * (1 - _constants.TRADE_FEE) > 0) {
                            amount += suggestion.sell * (1 - _constants.TRADE_FEE);
                            _tmpAmount5 = item.orig * 3 / 4 - amount;
                            count++;
                        }
                        suggestion.str += '[new sell ' + count + '] ';
                    } else {
                        suggestion.str += '[new sell no need] ';
                    }
                }
                console.log(suggestion.str);
                if (newStr && (!item.sent || item.sent !== new Date().getDay() + 1)) {
                    item.sent = new Date().getDay() + 1;
                    (0, _sendWs2.default)(item.name + ' ' + suggestion.str, 0, 0, true);
                }
                if (suggestion.type === 2) {
                    if (Math.abs(suggestion.buy - item.bCurrent) + item.bCurrent > (1 + _constants.TRADE_FEE) * (1 + _constants.TRADE_FEE) * item.bCurrent) {
                        item.bTarget = item.bCurrent;
                        item.bCurrent = suggestion.buy;
                    }
                } else if (price > item.bTarget * 1.05) {
                    item.bCurrent = 0;
                    item.bTarget = 0;
                }
                if (suggestion.type === 4) {
                    if (Math.abs(suggestion.sell - item.sCurrent) + item.sCurrent > (1 + _constants.TRADE_FEE) * (1 + _constants.TRADE_FEE) * item.sCurrent) {
                        item.sTarget = item.sCurrent;
                        item.sCurrent = suggestion.sell;
                    }
                } else if (price < item.sTarget * 0.95) {
                    item.sCurrent = 0;
                    item.sTarget = 0;
                }
                if (item.count > 0 && suggestion.type === 1 && price < item.price) {
                    (0, _sendWs2.default)(item.name + ' SELL ALL NOW!!!', 0, 0, true);
                }
                if (item.bTarget && price >= item.bTarget && price > item.price && item.amount >= price) {
                    (0, _sendWs2.default)(item.name + ' BUY NOW!!!', 0, 0, true);
                }
                if (item.sTarget && price <= item.sTarget && price < item.price && item.count > 0) {
                    (0, _sendWs2.default)(item.name + ' SELL NOW!!!', 0, 0, true);
                }
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
                return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: {
                        price: price,
                        str: suggestion.str,
                        sent: item.sent,
                        bTarget: item.bTarget,
                        bCurrent: item.bCurrent,
                        sTarget: item.sTarget,
                        sCurrent: item.sCurrent,
                        newMid: item.newMid,
                        tmpPT: item.tmpPT,
                        previous: item.previous
                    } });
            }).then(function () {
                return recur_price(index + 1);
            });
        };
        return recur_price(0);
    });
};

var stockShow = exports.stockShow = function stockShow() {
    return (0, _mongoTool2.default)('find', _constants.TOTALDB, { sType: { $exists: false } }).then(function (items) {
        var recur_price = function recur_price(index, ret) {
            return index >= items.length ? _promise2.default.resolve(ret) : items[index].index === 0 ? recur_price(index + 1, ret) : getStockPrice(items[index].setype, items[index].index, false).then(function (price) {
                return ret + '\n' + items[index].name + ' ' + price;
            }).then(function (ret) {
                return recur_price(index + 1, ret);
            });
        };
        return recur_price(0, '');
    });
};

var getStockListV2 = exports.getStockListV2 = function getStockListV2(type, year, month) {
    var _ret17 = function () {
        switch (type) {
            case 'twse':
                var quarter = 3;
                if (month < 4) {
                    quarter = 4;
                } else if (month < 7) {
                    quarter = 1;
                } else if (month < 10) {
                    quarter = 2;
                }
                return {
                    v: (0, _apiTool2.default)('url', 'https://mops.twse.com.tw/mops/web/ajax_t78sb04', { post: {
                            encodeURIComponent: '1',
                            TYPEK: 'all',
                            step: '1',
                            run: 'Y',
                            firstin: 'true',
                            FUNTYPE: '02',
                            year: year - 1911,
                            season: (0, _utility.completeZero)(quarter, 2),
                            fund_no: '0'
                        } }).then(function (raw_data) {
                        var stock_list = [];
                        var tables = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table');
                        var tag = false;
                        tables.forEach(function (table) {
                            if (table.attribs.class === 'noBorder') {
                                var name = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[0], 'td')[1])[0];
                                tag = false;
                                for (var i = 0; i < _constants.STOCK_INDEX[type].length; i++) {
                                    if (name === _constants.STOCK_INDEX[type][i].name) {
                                        tag = _constants.STOCK_INDEX[type][i].tag;
                                        break;
                                    }
                                }
                            } else {
                                if (tag) {
                                    (0, _utility.findTag)(table, 'tr').forEach(function (tr) {
                                        if (tr.attribs.class === 'even' || tr.attribs.class === 'odd') {
                                            var index = (0, _utility.findTag)((0, _utility.findTag)(tr, 'td')[0])[0];
                                            if (Number(index)) {
                                                var exist = false;

                                                var _loop5 = function _loop5(_i34) {
                                                    if (stock_list[_i34].index === index) {
                                                        exist = true;
                                                        tag.forEach(function (v) {
                                                            return stock_list[_i34].tag.push(v);
                                                        });
                                                        return 'break';
                                                    }
                                                };

                                                for (var _i34 = 0; _i34 < stock_list.length; _i34++) {
                                                    var _ret18 = _loop5(_i34);

                                                    if (_ret18 === 'break') break;
                                                }
                                                if (!exist) {
                                                    stock_list.push({
                                                        index: index,
                                                        tag: tag.map(function (v) {
                                                            return v;
                                                        })
                                                    });
                                                }
                                            }
                                        }
                                    });
                                }
                            }
                        });
                        console.log(stock_list);
                        return stock_list;
                    })
                };
                break;
            case 'usse':
                //const list = ['dowjones', 'nasdaq100', 'sp500'];
                var list = ['dowjones'];
                var stock_list = [];
                var recur_get = function recur_get(index) {
                    if (index >= list.length) {
                        console.log(stock_list.length);
                        console.log(stock_list);
                        return stock_list;
                    } else {
                        return (0, _apiTool2.default)('url', 'https://www.slickcharts.com/' + list[index]).then(function (raw_data) {
                            (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div', 'row')[2], 'div')[0], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr').forEach(function (t) {
                                var sIndex = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[2], 'a')[0])[0].replace('.', '-');
                                var name = (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1], 'a')[0])[0]).replace('&amp;', '&').replace('&#x27;', "'");
                                var is_exit = false;
                                for (var i = 0; i < stock_list.length; i++) {
                                    if (stock_list[i].index === sIndex) {
                                        is_exit = true;
                                        stock_list[i].tag.push(list[index] === 'dowjones' ? 'dow jones' : list[index] === 'nasdaq100' ? 'nasdaq 100' : 's&p 500');
                                        break;
                                    }
                                }
                                if (!is_exit) {
                                    stock_list.push({
                                        index: sIndex,
                                        tag: [name, list[index] === 'dowjones' ? 'dow jones' : list[index] === 'nasdaq100' ? 'nasdaq 100' : 's&p 500']
                                    });
                                }
                            });
                            return recur_get(index + 1);
                        });
                    }
                };
                return {
                    v: recur_get(0)
                };
                break;
            default:
                return {
                    v: (0, _utility.handleError)(new _utility.HoError('stock type unknown!!!'))
                };
        }
    }();

    if ((typeof _ret17 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret17)) === "object") return _ret17.v;
};

var stockProcess = exports.stockProcess = function stockProcess(price, priceArray) {
    var priceTimes = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
    var previous = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : { buy: [], sell: [] };
    var pAmount = arguments[4];
    var pCount = arguments[5];
    var pType = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 0;
    var sType = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : 0;
    var fee = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : _constants.TRADE_FEE;
    var ttime = arguments.length > 9 && arguments[9] !== undefined ? arguments[9] : _constants.TRADE_TIME;
    var tinterval = arguments.length > 10 && arguments[10] !== undefined ? arguments[10] : _constants.TRADE_INTERVAL;
    var now = arguments.length > 11 && arguments[11] !== undefined ? arguments[11] : Math.round(new Date().getTime() / 1000);

    priceTimes = priceTimes ? priceTimes : 1;
    //const now = Math.round(new Date().getTime() / 1000);
    var t1 = (pType | 1) === pType ? true : false;
    var t2 = (pType | 2) === pType ? true : false;
    var t3 = (pType | 4) === pType ? true : false;
    var t4 = (pType | 8) === pType ? true : false;
    var t5 = (pType | 16) === pType ? true : false;
    var is_buy = true;
    var is_sell = true;
    var bTimes = 1;
    var sTimes = 1;
    var bP = 8;
    var nowBP = priceArray.length - 1;
    //let bAdd = sType === 0 ? 0 : 1;
    //let sAdd = sType === 0 ? 0 : 1;
    var bAdd = 0;
    var sAdd = 0;
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
        var newMid = 0;
        var count = 0;
        for (nowBP = priceArray.length - 1; nowBP >= 0; nowBP--) {
            if (priceArray[nowBP] < 0) {
                if (++count === 3) {
                    newMid = Math.abs(priceArray[nowBP]);
                    break;
                }
            }
        }
        console.log('newMid ' + newMid + ' ' + price);
        return {
            resetWeb: 1,
            newMid: newMid
        };
        //return {
        //    str: 'SELL ALL',
        //    type: 1,
        //};
    }
    var sP = 0;
    var nowSP = 0;
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
        var _newMid = 0;
        var _count = 0;
        for (nowSP = 0; nowSP < priceArray.length; nowSP++) {
            if (priceArray[nowSP] < 0) {
                if (++_count === 3) {
                    _newMid = Math.abs(priceArray[nowSP]);
                    break;
                }
            }
        }
        return {
            resetWeb: 2,
            newMid: _newMid
        };
    }
    if (previous.time) {
        if (previous.price >= price) {
            var previousP = priceArray.length - 1;
            var pP = 8;
            var pPrice = previous.type === 'sell' ? previous.price * (2 - (1 + fee) * (1 + fee)) : previous.price;
            for (; previousP >= 0; previousP--) {
                if (Math.abs(priceArray[previousP]) * (sType === 0 ? 1.001 : 1.0001) >= pPrice) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP--;
                }
            }
            nowBP = previousP > nowBP ? previousP : nowBP;
            bP = pP > bP ? pP : bP;
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'buy') {
                if (now - previous.time >= ttime + (nowBP - previousP) * tinterval) {
                    is_buy = true;
                    bTimes = bTimes * (nowBP - previousP + 1);
                } else {
                    is_buy = false;
                }
            } else if (previous.type === 'sell') {
                if (now - previous.time >= ttime) {
                    is_sell = true;
                } else {
                    is_sell = false;
                }
            }
            pPrice = previous.type === 'buy' ? previous.price * (1 + fee) * (1 + fee) : previous.price;
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
            nowSP = previousP < nowSP ? previousP : nowSP;
            sP = pP < sP ? pP : sP;
        }
        if (previous.price < price) {
            var _previousP = 0;
            var _pP = 0;
            var _pPrice = previous.type === 'buy' ? previous.price * (1 + fee) * (1 + fee) : previous.price;
            for (; _previousP < priceArray.length; _previousP++) {
                if (Math.abs(priceArray[_previousP]) * (sType === 0 ? 0.999 : 0.9999) <= _pPrice) {
                    break;
                }
                if (priceArray[_previousP] < 0) {
                    _pP++;
                }
            }
            nowSP = _previousP < nowSP ? _previousP : nowSP;
            sP = _pP < sP ? _pP : sP;
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'sell') {
                if (now - previous.time >= ttime + (_previousP - nowSP) * tinterval) {
                    is_sell = true;
                    sTimes = sTimes * (_previousP - nowSP + 1);
                } else {
                    is_sell = false;
                }
            } else if (previous.type === 'buy') {
                if (now - previous.time >= ttime) {
                    is_buy = true;
                } else {
                    is_buy = false;
                }
            }
            _pPrice = previous.type === 'sell' ? previous.price * (2 - (1 + fee) * (1 + fee)) : previous.price;
            _previousP = priceArray.length - 1;
            _pP = 8;
            for (; _previousP >= 0; _previousP--) {
                if (Math.abs(priceArray[_previousP]) * (sType === 0 ? 1.001 : 1.0001) >= _pPrice) {
                    break;
                }
                if (priceArray[_previousP] < 0) {
                    _pP--;
                }
            }
            nowBP = _previousP > nowBP ? _previousP : nowBP;
            bP = _pP > bP ? _pP : bP;
        }
        //if (pType === 0 && previous.buy && previous.sell) {
        if (previous.buy.length > 0 && previous.sell.length > 0) {
            if (!t5) {
                if (previous.buy[0].price * 1.01 < Math.abs(priceArray[nowBP + 1])) {
                    bAdd--;
                } /* else if (previous.buy[0].price * 0.99 > Math.abs(priceArray[nowBP + 1])) {
                     bAdd++;
                  }
                  if (previous.sell[0].price * 1.01 < Math.abs(priceArray[nowSP - 1])) {
                     sAdd++;
                  } else */if (previous.sell[0].price * 0.99 > Math.abs(priceArray[nowSP - 1])) {
                    sAdd--;
                }
            } else {
                /*if (previous.buy[0].price * 1.01 < Math.abs(priceArray[nowBP + 1])) {
                    bAdd--;
                } else*/if (previous.buy[0].price * 0.99 > Math.abs(priceArray[nowBP + 1])) {
                    bAdd--;
                }
                if (previous.sell[0].price * 1.01 < Math.abs(priceArray[nowSP - 1])) {
                    sAdd--;
                } /*else if (previous.sell[0].price * 0.99 > Math.abs(priceArray[nowSP - 1])) {
                    sAdd--;
                  }*/
            }
            //console.log(previous);
            /*console.log(Math.abs(priceArray[nowBP + 1]));
            console.log(bAdd);
            console.log(Math.abs(priceArray[nowSP - 1]));
            console.log(sAdd);*/
        }
    }
    /*console.log(nowBP);
    console.log(nowSP);
    console.log(bP);
    console.log(sP);*/
    var buy = 0;
    var sell = 0;
    var str = '';
    var bCount = 1;
    var sCount = 1;
    var type = 0;
    bCount = bTimes * bCount * priceTimes;
    sCount = sTimes * sCount * priceTimes;
    var finalSell = function finalSell() {
        if (pAmount && sCount) {
            var remain = pCount - sCount;
            if (pCount < 3 * priceTimes) {
                sCount = priceTimes;
            } else if (pCount < 5 * priceTimes) {
                sCount = 2 * priceTimes;
            } else if (remain < 2 * priceTimes) {
                sCount = sCount - 2 * priceTimes + remain;
            }
        }
    };
    var finalBuy = function finalBuy() {
        if (pAmount && bCount) {
            var nowC = Math.floor(pAmount / buy);
            var remain = nowC - bCount;
            if (nowC < 3 * priceTimes) {
                bCount = priceTimes;
            } else if (nowC < 5 * priceTimes) {
                bCount = 2 * priceTimes;
            } else if (remain < 2 * priceTimes) {
                bCount = bCount - 2 * priceTimes + remain;
            }
        }
    };
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
        } else if (bP > 6) {
            //type = 2;
            //type = 3;
            type = 6;
            //buy = Math.round(Math.abs(priceArray[nowBP]) * 100) / 100;
            buy = Math.abs(priceArray[nowBP + 1]);
            buy = sType === 0 ? twseTicker(buy, false) : sType === 1 ? bitfinexTicker(buy, false) : buy;
            if (t2) {
                bCount = bCount * (2 + bAdd);
            } else {
                bCount = bCount * (1 + bAdd);
            }
            //buy = Math.round(tmpB * 100) / 100;
            //finalBuy();
            str += 'Buy 3/4 ' + buy + ' ( ' + bCount + ' ) ';
        } else if (bP > 5) {
            type = 3;
            buy = Math.abs(priceArray[nowBP + 1]);
            buy = sType === 0 ? twseTicker(buy, false) : sType === 1 ? bitfinexTicker(buy, false) : buy;
            if (t2) {
                bCount = bCount * (2 + bAdd);
            } else {
                bCount = bCount * (1 + bAdd);
            }
            //finalBuy();
            str += 'Buy 1/2 ' + buy + ' ( ' + bCount + ' ) ';
        } else if (bP > 4) {
            type = 7;
            //type = 3;
            buy = Math.abs(priceArray[nowBP + 1]);
            buy = sType === 0 ? twseTicker(buy, false) : sType === 1 ? bitfinexTicker(buy, false) : buy;
            if (t2) {
                bCount = bCount * (2 + bAdd);
            } else {
                bCount = bCount * (1 + bAdd);
            }
            //finalBuy();
            str += 'Buy 1/4 ' + buy + ' ( ' + bCount + ' ) ';
        } else {
            buy = Math.abs(priceArray[nowBP + 1]);
            buy = sType === 0 ? twseTicker(buy, false) : sType === 1 ? bitfinexTicker(buy, false) : buy;
            /*if (pType === 0) {
                bCount = bCount * (2 + bAdd);
            } else if (pType === 4 || pType === 3) {
                bCount = bCount * 2;
            }*/
            if (t1) {
                bCount = bCount * (2 + bAdd);
            } else {
                bCount = bCount * (1 + bAdd);
            }
            //finalBuy();
            str += 'Buy ' + buy + ' ( ' + bCount + ' ) ';
        }
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
            if (t3) {
                sCount = sCount * (2 + sAdd);
            } else {
                sCount = sCount * (1 + sAdd);
            }
            sell = Math.abs(priceArray[nowSP - 1]);
            sell = sType === 0 ? twseTicker(sell) : sType === 1 ? bitfinexTicker(sell) : sell;
            //finalSell();
            str += 'Sell 3/4 ' + sell + ' ( ' + sCount + ' ) ';
        } else if (sP < 3) {
            type = 5;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 5 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }*/
            if (t3) {
                sCount = sCount * (2 + sAdd);
            } else {
                sCount = sCount * (1 + sAdd);
            }
            sell = Math.abs(priceArray[nowSP - 1]);
            sell = sType === 0 ? twseTicker(sell) : sType === 1 ? bitfinexTicker(sell) : sell;
            //finalSell();
            str += 'Sell 1/2 ' + sell + ' ( ' + sCount + ' ) ';
        } else if (sP < 4) {
            type = 9;
            //type = 5;
            sell = Math.abs(priceArray[nowSP - 1]);
            sell = sType === 0 ? twseTicker(sell) : sType === 1 ? bitfinexTicker(sell) : sell;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 5 || pType === 4) {
                sCount = sCount * 2;
            }*/
            if (t3) {
                sCount = sCount * (2 + sAdd);
            } else {
                sCount = sCount * (1 + sAdd);
            }
            //finalSell();
            str += 'Sell 1/4 ' + sell + ' ( ' + sCount + ' ) ';
        } else {
            sell = Math.abs(priceArray[nowSP - 1]);
            sell = sType === 0 ? twseTicker(sell) : sType === 1 ? bitfinexTicker(sell) : sell;
            /*if (pType === 0) {
                sCount = sCount * (2 + sAdd);
            } else if (pType === 2 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }*/
            if (t4) {
                sCount = sCount * (2 + sAdd);
            } else {
                sCount = sCount * (1 + sAdd);
            }
            //finalSell();
            str += 'Sell ' + sell + ' ( ' + sCount + ' ) ';
        }
    }
    return {
        price: price,
        str: str,
        buy: buy,
        sell: sell,
        type: type,
        bCount: bCount,
        sCount: sCount
    };
};

var stockTest = exports.stockTest = function stockTest(his_arr, loga, min) {
    var pType = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    var start = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 0;
    var reverse = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;
    var len = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : 250;
    var rinterval = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : _constants.RANGE_INTERVAL;
    var fee = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : _constants.TRADE_FEE;
    var ttime = arguments.length > 9 && arguments[9] !== undefined ? arguments[9] : _constants.TRADE_TIME;
    var tinterval = arguments.length > 10 && arguments[10] !== undefined ? arguments[10] : _constants.TRADE_INTERVAL;
    var resetWeb = arguments.length > 11 && arguments[11] !== undefined ? arguments[11] : 5;
    var sType = arguments.length > 12 && arguments[12] !== undefined ? arguments[12] : 0;

    var now = Math.round(new Date().getTime() / 1000);
    //let is_start = false;
    var count = 0;
    var privious = {};
    var priviousTrade = { buy: [], sell: [] };
    var tmpPT = null;
    //let maxCount = 0;
    var buyTrade = 0;
    var sellTrade = 0;
    var stopLoss = 0;
    var newMid = [];
    var price = 0;
    //console.log('stock test');
    //console.log(amount);
    //console.log(count);
    //let startI = start + len - 1;
    var startI = start < his_arr.length - len - 1 ? start : his_arr.length - len - 1;
    var checkweb = resetWeb;
    var web = null;
    var maxAmount = 0;
    var amount = 0;
    var maxLost = 0;
    var maxGain = 0;
    var startMid = 0;
    //let minus = false;
    if (!reverse) {
        for (; startI > len - 1; startI--) {
            if (checkweb > resetWeb - 1) {
                checkweb = 0;
                web = calStair(his_arr, loga, min, startI, fee, sType === 0 ? false : len * 3);
                maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                amount = maxAmount;
            } else {
                checkweb++;
            }
            //console.log(startI);
            //console.log(web.mid);
            //console.log(his_arr[startI].h);
            //if (his_arr[startI].h < mid * 0.9) {
            //if (his_arr[startI].h < web.mid) {
            if (his_arr[startI].h < web.mid) {
                //minus = true;
                //} else if (minus) {
                startMid = Math.round((his_arr[startI].h - web.mid) / web.mid * 10000) / 100;
                //console.log('max');
                //console.log(web);
                //console.log(web.arr.length);
                privious = his_arr[startI + 1];
                if (his_arr[startI + 1].h === null) {
                    console.log(startI);
                    console.log(his_arr[startI + 1]);
                    return 'data miss';
                }
                /*let tmpAmount = amount - maxAmount / 2;
                while ((tmpAmount - his_arr[startI + 1].h) > 0) {
                    amount -= his_arr[startI + 1].h;
                    tmpAmount = amount - maxAmount / 2;
                    count++;
                }*/
                //console.log(his_arr[startI + 1].h);
                //console.log(amount);
                //console.log(maxAmount);
                //console.log(count);
                break;
            }
        }
        if (startI <= len - 1) {
            return {
                str: '0% 0 0% 0% 0 0 0%',
                start: 0
            };
        }
    } else {
        var next = 0;
        startI = start + len - 1;
        for (; startI < his_arr.length - len - 1; startI++) {
            if (checkweb > resetWeb - 1) {
                checkweb = 0;
                web = calStair(his_arr, loga, min, startI, fee, sType === 0 ? false : len * 3);
                maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                amount = maxAmount;
            } else {
                checkweb++;
            }
            if (next && his_arr[startI].h < web.mid) {
                next = 2;
            }
            if (!next && his_arr[startI].h < web.mid || next === 2 && his_arr[startI].h > web.mid) {
                startI++;
                startMid = Math.round((his_arr[startI].h - web.mid) / web.mid * 10000) / 100;
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
    //console.log('start');
    //console.log(pType);
    //console.log(startI);
    var tlength = startI - len + 1;
    var lastNode = his_arr[startI - len + 1];
    for (var i = startI; i > tlength; i--) {
        //console.log(his_arr[i]);
        /*if (his_arr[i].l <= web.mid) {
            is_start = true;
            privious = his_arr[i + 1];
        }*/
        //if (is_start) {
        if (checkweb > resetWeb - 1) {
            checkweb = 0;
            web = calStair(his_arr, loga, min, i, fee, sType === 0 ? false : len * 3);
            var newWeb = adjustWeb(web.arr, web.mid, maxAmount, true);
            web.arr = newWeb.arr;
            web.mid = newWeb.mid;
            web.times = newWeb.times;
        } else {
            checkweb++;
        }
        if (his_arr[i].h === null || his_arr[i].l === null) {
            console.log(i);
            console.log(his_arr[i]);
            return 'data miss';
        }
        if (his_arr[i].h && his_arr[i].l && privious.h && privious.l) {
            var hh = privious.h - his_arr[i].h;
            var ll = his_arr[i].l - privious.l;
            if (hh >= 0 && ll >= 0 || hh <= 0 && ll <= 0) {
                price = Math.abs(hh) > Math.abs(ll) ? his_arr[i].h : his_arr[i].l;
            } else {
                price = hh < 0 ? his_arr[i].h : his_arr[i].l;
            }
        } else if (!price) {
            if (his_arr[i].h) {
                price = his_arr[i].h;
            } else if (his_arr[i].l) {
                price = his_arr[i].list;
            } else if (privious.h) {
                price = privious.h;
            } else if (privious.l) {
                price = privious.l;
            }
        }
        var suggest = null;
        var checkMid = newMid.length > 1 ? newMid[newMid.length - 2] : web.mid;
        var newArr = newMid.length > 0 ? web.arr.map(function (v) {
            return v * newMid[newMid.length - 1] / web.mid;
        }) : web.arr;
        while (newMid.length > 0 && (newMid[newMid.length - 1] > checkMid && price < checkMid || newMid[newMid.length - 1] <= checkMid && price > checkMid)) {
            newMid.pop();
            if (newMid.length === 0 && now - tmpPT.time < rinterval) {
                priviousTrade.price = tmpPT.price;
                priviousTrade.time = tmpPT.time;
                priviousTrade.type = tmpPT.type;
            } else {
                priviousTrade.time = 0;
            }
            stopLoss = stopLoss > 0 ? stopLoss - 1 : 0;
            newArr = newMid.length > 0 ? web.arr.map(function (v) {
                return v * newMid[newMid.length - 1] / web.mid;
            }) : web.arr;
            checkMid = newMid.length > 1 ? newMid[newMid.length - 2] : web.mid;
        }
        suggest = stockProcess(price, newArr, web.times, priviousTrade, amount, count, pType, sType, fee, ttime, tinterval, now - i * tinterval);
        while (suggest.resetWeb) {
            if (newMid.length === 0) {
                tmpPT = {
                    price: priviousTrade.price,
                    time: priviousTrade.time,
                    type: priviousTrade.type
                };
            }
            priviousTrade.time = 0;
            //console.log(amount);
            //console.log(count);
            if (suggest.resetWeb === 1) {
                stopLoss++;
            }
            newMid.push(suggest.newMid);
            newArr = newMid.length > 0 ? web.arr.map(function (v) {
                return v * newMid[newMid.length - 1] / web.mid;
            }) : web.arr;
            suggest = stockProcess(price, newArr, web.times, priviousTrade, amount, count, pType, sType, fee, ttime, tinterval, now - i * tinterval);
            //console.log(price);
            //console.log(suggest);
            //console.log(newArr);
        }
        //console.log(privious);
        //console.log(his_arr[i]);
        //console.log(his_arr[i - 1]);
        //console.log(i);
        //console.log(price);
        //console.log(suggest);
        //console.log(suggest.str);
        var newPrevious = function newPrevious(tradeType, tradePrice) {
            var time = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : Math.round(new Date().getTime() / 1000);

            if (tradeType === 'buy') {
                var is_insert = false;
                for (var k = 0; k < priviousTrade.buy.length; k++) {
                    if (tradePrice < priviousTrade.buy[k].price) {
                        priviousTrade.buy.splice(k, 0, { price: tradePrice, time: time });
                        is_insert = true;
                        break;
                    }
                }
                if (!is_insert) {
                    priviousTrade.buy.push({ price: tradePrice, time: time });
                }
                priviousTrade = {
                    price: tradePrice,
                    time: time,
                    type: 'buy',
                    buy: priviousTrade.buy.filter(function (v) {
                        return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                    }),
                    sell: priviousTrade.sell
                };
            } else if (tradeType === 'sell') {
                var _is_insert2 = false;
                for (var _k2 = 0; _k2 < priviousTrade.sell.length; _k2++) {
                    if (tradePrice > priviousTrade.sell[_k2].price) {
                        priviousTrade.sell.splice(_k2, 0, { price: tradePrice, time: time });
                        _is_insert2 = true;
                        break;
                    }
                }
                if (!_is_insert2) {
                    priviousTrade.sell.push({ price: tradePrice, time: time });
                }
                /*if (count === 0) {
                    priviousTrade = {
                        sell: priviousTrade.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                        buy: priviousTrade.buy,
                    }
                } else {*/
                priviousTrade = {
                    price: tradePrice,
                    time: time,
                    type: 'sell',
                    sell: priviousTrade.sell.filter(function (v) {
                        return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                    }),
                    buy: priviousTrade.buy
                };
                //}
            }
        };
        /*if (suggest.type === 1) {
            amount += (his_arr[i - 1].l * count * (1 - TRADE_FEE));
            if (count > 0) {
                stopLoss++;
            }
            count = 0;
            priviousTrade = {
                price: his_arr[i - 1].l,
                time: now - (i * 86400) + 3600,
                type: 'sell',
            }
        }*/
        /*if (suggest.type === 2) {
            if (suggest.buy && (his_arr[i - 1].h <= suggest.buy)) {
                while ((amount - suggest.buy) > 0) {
                    amount -= suggest.buy;
                    count++;
                    priviousTrade = {
                        price: suggest.buy,
                        time: now - (i * 86400) + 3600,
                        type: 'buy',
                    }
                    buyTrade++;
                }
            }
        } else*/if (suggest.type === 7) {
            if (suggest.buy && his_arr[i - 1].l <= suggest.buy) {
                var origCount = count;
                for (var j = 0; j < suggest.bCount; j++) {
                    if (amount - suggest.buy <= 0) {
                        break;
                    } else {
                        amount -= suggest.buy;
                        count++;
                        buyTrade++;
                    }
                }
                if (amount > maxAmount * 7 / 8) {
                    var tmpAmount = amount - maxAmount * 3 / 4;
                    while (tmpAmount - suggest.buy > 0) {
                        amount -= suggest.buy;
                        tmpAmount = amount - maxAmount * 3 / 4;
                        count++;
                        buyTrade++;
                    }
                }
                if (count > origCount) {
                    newPrevious('buy', suggest.buy, now - i * tinterval + ttime / 6);
                }
            }
        } else if (suggest.type === 3) {
            if (suggest.buy && his_arr[i - 1].l <= suggest.buy) {
                var _origCount = count;
                for (var _j3 = 0; _j3 < suggest.bCount; _j3++) {
                    if (amount - suggest.buy <= 0) {
                        break;
                    } else {
                        amount -= suggest.buy;
                        count++;
                        buyTrade++;
                    }
                }
                if (amount > maxAmount * 5 / 8) {
                    var _tmpAmount6 = amount - maxAmount / 2;
                    while (_tmpAmount6 - suggest.buy > 0) {
                        amount -= suggest.buy;
                        _tmpAmount6 = amount - maxAmount / 2;
                        count++;
                        buyTrade++;
                    }
                }
                if (count > _origCount) {
                    newPrevious('buy', suggest.buy, now - i * tinterval + ttime / 6);
                }
            }
        } else if (suggest.type === 6) {
            if (suggest.buy && his_arr[i - 1].l <= suggest.buy) {
                var _origCount2 = count;
                for (var _j4 = 0; _j4 < suggest.bCount; _j4++) {
                    if (amount - suggest.buy <= 0) {
                        break;
                    } else {
                        amount -= suggest.buy;
                        count++;
                        buyTrade++;
                    }
                }
                if (amount > maxAmount * 3 / 8) {
                    var _tmpAmount7 = amount - maxAmount / 4;
                    while (_tmpAmount7 - suggest.buy > 0) {
                        amount -= suggest.buy;
                        _tmpAmount7 = amount - maxAmount / 4;
                        count++;
                        buyTrade++;
                    }
                }
                if (count > _origCount2) {
                    newPrevious('buy', suggest.buy, now - i * tinterval + ttime / 6);
                }
            }
        } else if (suggest.buy && his_arr[i - 1].l <= suggest.buy) {
            var _origCount3 = count;
            for (var _j5 = 0; _j5 < suggest.bCount; _j5++) {
                if (amount - suggest.buy <= 0) {
                    break;
                } else {
                    amount -= suggest.buy;
                    count++;
                    buyTrade++;
                }
            }
            if (count > _origCount3) {
                newPrevious('buy', suggest.buy, now - i * tinterval + ttime / 6);
            }
        }

        /*if (suggest.type === 4) {
            if ((count > 0) && suggest.sell && (his_arr[i - 1].h >= suggest.sell)) {
                amount += (suggest.sell * count * (1 - TRADE_FEE));
                sellTrade = sellTrade + count;
                count = 0;
                priviousTrade = {
                    price: suggest.sell,
                    time: now - (i * 86400) + 3600,
                    type: 'sell',
                }
            }
        } else */if (suggest.type === 9) {
            if (count > 0 && suggest.sell && his_arr[i - 1].h >= suggest.sell) {
                for (var _j6 = 0; _j6 < suggest.sCount; _j6++) {
                    amount += suggest.sell * (1 - fee);
                    sellTrade++;
                    count--;
                    if (count <= 0) {
                        break;
                    }
                }
                if (amount < maxAmount / 8) {
                    var _tmpAmount8 = maxAmount / 4 - amount;
                    while (_tmpAmount8 - suggest.sell * (1 - fee) > 0) {
                        amount += suggest.sell * (1 - fee);
                        _tmpAmount8 = maxAmount / 4 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                }
                newPrevious('sell', suggest.sell, now - i * tinterval + ttime / 6);
                //console.log(priviousTrade.win);
            }
        } else if (suggest.type === 5) {
            if (count > 0 && suggest.sell && his_arr[i - 1].h >= suggest.sell) {
                for (var _j7 = 0; _j7 < suggest.sCount; _j7++) {
                    amount += suggest.sell * (1 - fee);
                    sellTrade++;
                    count--;
                    if (count <= 0) {
                        break;
                    }
                }
                if (amount < maxAmount * 3 / 8) {
                    var _tmpAmount9 = maxAmount / 2 - amount;
                    while (_tmpAmount9 - suggest.sell * (1 - fee) > 0) {
                        amount += suggest.sell * (1 - fee);
                        _tmpAmount9 = maxAmount / 2 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                }
                newPrevious('sell', suggest.sell, now - i * tinterval + ttime / 6);
                //console.log(priviousTrade.win);
            }
        } else if (suggest.type === 8) {
            if (count > 0 && suggest.sell && his_arr[i - 1].h >= suggest.sell) {
                for (var _j8 = 0; _j8 < suggest.sCount; _j8++) {
                    amount += suggest.sell * (1 - fee);
                    sellTrade++;
                    count--;
                    if (count <= 0) {
                        break;
                    }
                }
                if (amount < maxAmount * 5 / 8) {
                    var _tmpAmount10 = maxAmount * 3 / 4 - amount;
                    while (_tmpAmount10 - suggest.sell * (1 - fee) > 0) {
                        amount += suggest.sell * (1 - fee);
                        _tmpAmount10 = maxAmount * 3 / 4 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                }
                newPrevious('sell', suggest.sell, now - i * tinterval + ttime / 6);
                //console.log(priviousTrade.win);
            }
        } else if (count > 0 && suggest.sell && his_arr[i - 1].h >= suggest.sell) {
            for (var _j9 = 0; _j9 < suggest.sCount; _j9++) {
                amount += suggest.sell * (1 - fee);
                count--;
                sellTrade++;
                if (count <= 0) {
                    break;
                }
            }
            newPrevious('sell', suggest.sell, now - i * tinterval + ttime / 6);
            //console.log(priviousTrade.win);
        }
        //console.log(amount);
        //console.log(count);
        privious = his_arr[i];
        //}
        var testAmount = amount + his_arr[i].l * count * (1 - fee);
        if (!maxLost || maxLost > testAmount) {
            maxLost = testAmount;
        }
        if (!maxGain || maxGain < testAmount) {
            maxGain = testAmount;
        }
    }
    //console.log(amount);
    //console.log(count);
    amount += lastNode.l * count * (1 - fee);
    count = 0;
    //console.log('result');
    //console.log(amount);
    //console.log(maxAmount);
    //console.log(buyTrade);
    //console.log(sellTrade);
    //console.log(stopLoss);
    var str = startMid + '% ' + Math.ceil(maxAmount) + ' ' + Math.round((amount / maxAmount - 1) * 10000) / 100 + '% ' + (his_arr[startI].l ? Math.round((lastNode.h / his_arr[startI].l - 1) * 10000) / 100 : 0) + '% ' + sellTrade + ' ' + stopLoss + ' ' + Math.round((maxLost / maxAmount - 1) * 10000) / 100 + '% ' + Math.round((maxGain / maxAmount - 1) * 10000) / 100 + '%';
    //const str = is_start ? `${Math.ceil(maxAmount)} ${Math.round((his_arr[start].h / his_arr[start + len - 1].l - 1) * 10000) / 100}% ${Math.round((amount / maxAmount - 1) * 10000) / 100}% ${sellTrade} ${stopLoss}` : `${Math.ceil(maxAmount)} ${Math.round((his_arr[start].h / his_arr[start + len - 1].l - 1) * 10000) / 100}% 0% 0 0`;
    return {
        str: str,
        start: startI - len + 1
    };
};

var logArray = exports.logArray = function logArray(max, min) {
    var pos = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 100;

    var logMax = Math.log(max);
    var logMin = Math.log(min);
    var scale = (logMax - logMin) / pos;
    var posArr = [min];
    for (var i = 1; i < pos; i++) {
        posArr.push(posArr[posArr.length - 1] * (1 + scale));
    }
    return {
        arr: posArr,
        diff: scale
    };
};

var calStair = exports.calStair = function calStair(raw_arr, loga, min) {
    var stair_start = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    var fee = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : _constants.TRADE_FEE;
    var len = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : false;

    var single_arr = [];
    var final_arr = [];
    for (var i = 0; i < 100; i++) {
        final_arr[i] = 0;
    }
    var volsum = 0;
    var maxlen = len && stair_start + len < raw_arr.length ? stair_start + len : raw_arr.length;
    for (var _i35 = stair_start; _i35 < maxlen; _i35++) {
        var s = 0;
        var e = 100;
        for (var _j10 = 0; _j10 < 100; _j10++) {
            if (raw_arr[_i35].l >= loga.arr[_j10]) {
                s = _j10;
            }
            if (raw_arr[_i35].h <= loga.arr[_j10]) {
                e = _j10;
                break;
            }
        }
        volsum += raw_arr[_i35].v;
        single_arr.push((raw_arr[_i35].h - raw_arr[_i35].l) / raw_arr[_i35].h * 100);
        if (e - s === 0) {
            final_arr[s] += raw_arr[_i35].v;
        } else {
            var v = raw_arr[_i35].v / (e - s);
            for (var _j11 = s; _j11 < e; _j11++) {
                final_arr[_j11] += v;
            }
        }
    }
    var vol = 0;
    var j = 0;
    var nd = [];
    final_arr.forEach(function (v, i) {
        vol += v;
        while (vol >= volsum / 100 * _constants.NORMAL_DISTRIBUTION[j] && j < _constants.NORMAL_DISTRIBUTION.length) {
            //console.log(i);
            nd.push(i);
            //nd.push(Math.pow(1 + loga.diff, i) * min);
            j++;
        }
    });
    var sort_arr = [].concat(single_arr).sort(function (a, b) {
        return a - b;
    });
    //console.log(final_arr);
    var web = {
        mid: Math.pow(1 + loga.diff, nd[3]) * min,
        up: nd[4] - nd[3],
        down: nd[3] - nd[2],
        extrem: sort_arr[Math.round(sort_arr.length * _constants.NORMAL_DISTRIBUTION[_constants.NORMAL_DISTRIBUTION.length - 3] / 100) - 1] / 100,
        single: loga.diff
    };
    if (1 + web.extrem < (1 + fee) * (1 + fee)) {
        web.extrem = sort_arr[Math.round(sort_arr.length * _constants.NORMAL_DISTRIBUTION[_constants.NORMAL_DISTRIBUTION.length - 2] / 100) - 1] / 100;
        web.ds = 2;
        if (1 + web.extrem < (1 + fee) * (1 + fee)) {
            return false;
        }
    }
    var calWeb = function calWeb() {
        var stair = Math.ceil(Math.log(1 + web.extrem) / Math.log(1 + web.single));
        var upArray = [];
        var up = stair;
        while (up < web.up) {
            upArray.push(up);
            up += stair;
        }
        if (up - web.up < stair / 2) {
            upArray.push(web.up);
        } else {
            if (upArray.length > 0) {
                upArray[upArray.length - 1] = web.up;
            } else {
                upArray.push(web.up);
            }
        }
        //console.log(upArray);
        var downArray = [];
        var down = stair;
        while (down < web.down) {
            downArray.push(down);
            down += stair;
        }
        if (down - web.down < stair / 2) {
            downArray.push(web.down);
        } else {
            if (downArray.length > 0) {
                downArray[downArray.length - 1] = web.down;
            } else {
                downArray.push(web.down);
            }
        }
        //console.log(downArray);
        var result = [-web.mid];
        var temp = web.mid;
        upArray.forEach(function (v) {
            return result.splice(0, 0, temp * Math.pow(1 + web.single, v));
        });
        temp = result[0];
        result[0] = -result[0];
        upArray.forEach(function (v) {
            return result.splice(0, 0, temp * Math.pow(1 + web.single, v));
        });
        temp = result[0];
        result[0] = -result[0];
        upArray.forEach(function (v) {
            return result.splice(0, 0, temp * Math.pow(1 + web.single, v));
        });
        result[0] = -result[0];
        temp = web.mid;
        downArray.forEach(function (v) {
            return result.push(temp / Math.pow(1 + web.single, v));
        });
        temp = result[result.length - 1];
        result[result.length - 1] = -result[result.length - 1];
        downArray.forEach(function (v) {
            return result.push(temp / Math.pow(1 + web.single, v));
        });
        temp = result[result.length - 1];
        result[result.length - 1] = -result[result.length - 1];
        downArray.forEach(function (v) {
            return result.push(temp / Math.pow(1 + web.single, v));
        });
        result[result.length - 1] = -result[result.length - 1];
        return result;
    };
    web.arr = calWeb();
    //console.log(web);
    return web;
};

var adjustWeb = function adjustWeb(webArr, webMid) {
    var amount = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var force = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

    if (amount === 0) {
        return {
            arr: webArr,
            mid: webMid
        };
    }
    var maxAmount = webMid * (webArr.length - 1) / 3 * 2;
    if (amount >= maxAmount) {
        var _count2 = Math.floor(amount / maxAmount);
        var newWeb = {
            arr: webArr,
            mid: webMid
        };
        if (_count2 > 1) {
            newWeb.times = _count2;
        }
        return newWeb;
    }
    if (amount < maxAmount / 2) {
        if (force) {
            amount = maxAmount / 2 + 1;
        } else {
            return false;
        }
    }
    var ignore = Math.floor(maxAmount / (maxAmount - amount));
    var neg = 0;
    var mid = 0;
    for (; mid < webArr.length; mid++) {
        if (webArr[mid] < 0) {
            neg++;
        }
        if (neg === 4) {
            break;
        }
    }
    var new_arr = [];
    var count = 0;
    //console.log(mid);
    for (var i = mid; i < webArr.length; i++) {
        if (webArr[i] >= 0) {
            count++;
            if (count === ignore) {
                count = 0;
            } else {
                new_arr.push(webArr[i]);
            }
        } else {
            new_arr.push(webArr[i]);
        }
    }
    count = 0;
    for (var _i36 = mid - 1; _i36 >= 0; _i36--) {
        if (webArr[_i36] >= 0) {
            count++;
            if (count === ignore) {
                count = 0;
            } else {
                new_arr.splice(0, 0, webArr[_i36]);
            }
        } else {
            new_arr.splice(0, 0, webArr[_i36]);
        }
    }
    return {
        arr: webArr,
        mid: webMid
    };
};

var bitfinexTicker = function bitfinexTicker(price) {
    var large = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

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
};

var twseTicker = function twseTicker(price) {
    var large = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

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
};

var getUsStock = function getUsStock(index) {
    var stat = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ['price'];

    var ret = {};
    if (!Array.isArray(stat) || stat.length < 1) {
        return _promise2.default.resolve(ret);
    }
    var count = 0;
    var real = function real() {
        return (0, _apiTool2.default)('url', 'https://finance.yahoo.com/quote/' + index + '/key-statistics?p=' + index).then(function (raw_data) {
            var app = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'app')[0], 'div')[0], 'div')[0], 'div')[0], 'div')[0];
            if (stat.indexOf('price') !== -1) {
                var price = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(app, 'div', 'YDC-Lead')[0], 'div')[0], 'div')[0], 'div')[3], 'div')[0], 'div')[0], 'div')[0], 'div')[2], 'div')[0], 'div')[0], 'span')[0])[0];
                ret['price'] = Number(price);
            }
            if (stat.indexOf('per') !== -1 || stat.indexOf('pbr') !== -1 || stat.indexOf('pdr') !== -1) {
                var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(app, 'div')[2], 'div', 'YDC-Col1')[0], 'div', 'Main')[0], 'div')[0], 'div')[0], 'div')[0], 'section')[0], 'div')[2];
                var table1 = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'div')[0], 'div')[1], 'div')[0], 'div')[0], 'div')[0], 'table')[0];
                (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table1, 'thead')[0], 'tr')[0], 'th')[1], 'span')[0], 'span')[0]).forEach(function (d) {
                    var m = d.match(/^As of Date\: (\d+)\/\d+\/(\d+)$/);
                    if (m) {
                        ret['latestYear'] = Number(m[2]);
                        var q = Number(m[1]);
                        if (q < 4) {
                            ret['latestQuarter'] = 1;
                        } else if (q < 7) {
                            ret['latestQuarter'] = 2;
                        } else if (q < 10) {
                            ret['latestQuarter'] = 3;
                        } else {
                            ret['latestQuarter'] = 0;
                            ret['latestYear']++;
                        }
                    }
                });
                if (stat.indexOf('per') !== -1 || stat.indexOf('pbr') !== -1) {
                    var trs = (0, _utility.findTag)((0, _utility.findTag)(table1, 'tbody')[0], 'tr');
                    if (stat.indexOf('per') !== -1) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(trs[2], 'td')[1], 'span')[0]) {
                            ret['per'] = 0;
                        } else {
                            ret['per'] = Number((0, _utility.findTag)((0, _utility.findTag)(trs[2], 'td')[1])[0]);
                        }
                    }
                    if (stat.indexOf('pbr') !== -1) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(trs[6], 'td')[1], 'span')[0]) {
                            ret['pbr'] = 0;
                        } else {
                            ret['pbr'] = Number((0, _utility.findTag)((0, _utility.findTag)(trs[6], 'td')[1])[0]);
                        }
                    }
                }
                if (stat.indexOf('pdr') !== -1) {
                    var trs1 = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'div')[1], 'div')[0], 'div')[2], 'div')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr');
                    if ((0, _utility.findTag)((0, _utility.findTag)(trs1[3], 'td')[1], 'span')[0]) {
                        ret['pdr'] = 0;
                    } else {
                        var stockYield = (0, _utility.findTag)((0, _utility.findTag)(trs1[3], 'td')[1])[0];
                        stockYield = Number(stockYield.substring(0, stockYield.length - 1));
                        ret['pdr'] = Math.round(100 / stockYield * 100) / 100;
                    }
                }
            }
            return _promise2.default.resolve(ret);
        }).catch(function (err) {
            console.log(count);
            return ++count > _constants.MAX_RETRY ? (0, _utility.handleError)(err) : new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(real());
                }, count * 1000);
            });
        });
    };
    return real();
};
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getSingleAnnual = exports.getStockList = undefined;

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var StockTagTool = (0, _tagTool2.default)(_constants.STOCKDB);
var Xmlparser = new _xml2js2.default.Parser();

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

var getParameter = function getParameter(xml, name, index) {
    return xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['_'] ? Number(xml.xbrl[name][index]['_']) : 0;
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
    var name = type === 'twse' ? index + '.tw+' + index + '.two' : index;
    return (0, _apiTool2.default)('url', 'http://download.finance.yahoo.com/d/quotes.csv?s=' + name + '&f=l1').then(function (raw_data) {
        var price = raw_data.match(/\d+\.\d+/);
        if (!price) {
            console.log(raw_data);
            return (0, _utility.handleReject)(new _utility.HoError('stock price get fail'));
        }
        console.log(price[0]);
        return price[0];
    });
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
                        if (!salesStatus[i][j].quarterRevenue || salesStatus[i][j].quarterRevenue < 0) {
                            salesStatus[i][j].quarterRevenue = sales[i][j].profit ? sales[i][j - 1].profit && sales[i][j].profit - sales[i][j - 1].profit ? Math.abs((sales[i][j].profit - sales[i][j - 1].profit) / 100000) : Math.abs(sales[i][j].profit / 100000) : 1000;
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

var initXml = function initXml(filelocation) {
    return new _promise2.default(function (resolve, reject) {
        return (0, _fs.readFile)(filelocation, 'utf8', function (err, data) {
            return err ? reject(err) : resolve(data);
        });
    }).then(function (data) {
        return new _promise2.default(function (resolve, reject) {
            return Xmlparser.parseString(data, function (err, result) {
                return err ? reject(err) : resolve(result);
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
                parseResult.equityParent = getParameter(xml, 'tw-gaap-fh:StockholdersEquity', ai) - asset[y][q].equityChild;
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
            return false;
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
                parseResult.nonoperating = parseResult.profit + parseResult.tax - sales[y][q].operating;
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
    return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath }).catch(function (err) {
        if (err.code === 'HPE_INVALID_CONSTANT') {
            post.report_id = post.report_id === 'C' ? 'B' : 'A';
            return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath }).catch(function (err) {
                if (err.code === 'HPE_INVALID_CONSTANT') {
                    post.report_id = 'A';
                    return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/server-java/FileDownLoad', { post: post, filePath: filePath });
                } else {
                    return (0, _utility.handleReject)(err);
                }
            });
        } else {
            return (0, _utility.handleReject)(err);
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
            return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/mops/web/ajax_quickpgm?encodeURIComponent=1&step=4&firstin=1&off=1&keyword4=' + index + '&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&co_id=' + index).then(function (raw_data) {
                var result = { stock_location: ['tw', '台灣', '臺灣'] };
                var i = 0;
                (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form')[0], 'table')[0], 'table', 'zoom')[0], 'tr')[1], 'td').forEach(function (d) {
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
        default:
            return (0, _utility.handleReject)(new _utility.HoError('stock type unknown!!!'));
    }
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

exports.default = {
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
                    return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
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
                    stockName: '' + items[0].type + items[0].index + items[0].name
                };
            });
        } else {
            var _ret2 = function () {
                var id_db = null;
                var normal_tags = [];
                var is_start = false;
                var not = 0;
                var wait = 0;
                var recur_getTwseXml = function recur_getTwseXml() {
                    console.log(year);
                    console.log(quarter);
                    var xml_path = '/mnt/stock/' + type + '/' + index + '/' + year + quarter + '.xml';
                    var parseXml = function parseXml() {
                        return initXml(xml_path).then(function (xml) {
                            cash = getCashflow(xml, cash, is_start);
                            if (!cash) {
                                return (0, _utility.handleReject)(new _utility.HoError('xml cash parse error!!!'));
                            }
                            asset = getAsset(xml, asset, is_start);
                            if (!asset) {
                                return (0, _utility.handleReject)(new _utility.HoError('xml asset parse error!!!'));
                            }
                            sales = getSales(xml, sales, cash, is_start);
                            if (!sales) {
                                return (0, _utility.handleReject)(new _utility.HoError('xml sales parse error!!!'));
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
                    if (stage < 3 && is_start && (0, _fs.existsSync)(xml_path)) {
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
                            return parseXml();
                        }
                    } else {
                        return getTwseXml(index, year, quarter, xml_path).catch(function (err) {
                            return err.code !== 'HPE_INVALID_CONSTANT' ? (0, _utility.handleReject)(err) : _promise2.default.resolve(err);
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
                                        var _ret3 = function () {
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
                                            if (cashStatus[earliestYear].length === 0) {
                                                console.log('stock finance data not exist');
                                                return {
                                                    v: false
                                                };
                                            }
                                            var profitIndex = getProfitIndex(profitStatus, earliestYear, latestYear);
                                            var safetyIndex = getSafetyIndex(safetyStatus, earliestYear, latestYear);
                                            var managementIndex = getManagementIndex(managementStatus, latestYear, latestQuarter);
                                            return {
                                                v: handleStockTag(type, index, latestYear, latestQuarter, assetStatus, cashStatus, safetyStatus, profitStatus, salesStatus, managementStatus).then(function (_ref) {
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
                                                            tags: normal_tags,
                                                            important: 0,
                                                            stock_default: stock_default
                                                        }).then(function (item) {
                                                            return item[0]._id;
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
                                                            stockName: '' + type + index + name,
                                                            id: id
                                                        };
                                                    });
                                                })
                                            };
                                        }();

                                        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
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

            if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
        }
    },
    getStockPER: function getStockPER(id) {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
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
                return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
            }
            switch (items[0].type) {
                case 'twse':
                    return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/mops/web/ajax_t05st09?encodeURIComponent=1&step=1&firstin=1&off=1&keyword4=' + items[0].index + '&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&isnew=true&co_id=' + items[0].index).then(function (raw_data) {
                        var dividends = 0;
                        var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'table', 'hasBorder')[0];
                        if (!table) {
                            return (0, _utility.handleReject)(new _utility.HoError('查詢過於頻繁,請稍後再試!!'));
                        }
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
                    });
                default:
                    return (0, _utility.handleReject)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getPredictPER: function getPredictPER(id, session) {
        var date = new Date();
        var year = date.getFullYear() - 1911;
        var month = date.getMonth() + 1;
        var month_str = (0, _utility.completeZero)(month.toString(), 2);
        console.log(year);
        console.log(month_str);
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
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
                    }).then(function (_ref3) {
                        var _ref4 = (0, _slicedToArray3.default)(_ref3, 3),
                            raw_list = _ref4[0],
                            ret_obj = _ref4[1],
                            etime = _ref4[2];

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
                            return [sales_data, predict_index + ' ' + start_month + ' ' + sales_num.length];
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
                                return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/mops/web/ajax_t05st10_ifrs?encodeURIComponent=1&run=Y&step=0&yearmonth=' + year + month_str + '&colorchg=&TYPEK=all&co_id=' + items[0].index + '&off=1&year=' + year + '&month=' + month_str + '&firstin=true').then(function (raw_data) {
                                    if (raw_data.length > 500) {
                                        if (!start_month) {
                                            start_month = '' + (year + 1911) + month_str;
                                        }
                                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table', 'hasBorder')[0], 'tr').forEach(function (t) {
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
                                    } else if (raw_data.length > 400) {
                                        console.log(raw_data);
                                        if (sales_data) {
                                            (0, _redisTool2.default)('hmset', 'sales: ' + items[0].type + items[0].index, {
                                                raw_list: (0, _stringify2.default)(sales_data),
                                                ret_obj: ret_obj,
                                                etime: etime
                                            }).catch(function (err) {
                                                return (0, _utility.handleError)(err, 'Redis');
                                            });
                                        }
                                        return (0, _utility.handleReject)(new _utility.HoError('' + items[0].type + items[0].index + ' \u7A0D\u5F8C\u518D\u67E5\u8A62!!'));
                                    }
                                    return rest_predict(index);
                                });
                            }
                        };
                        var exGet = function exGet() {
                            return etime === -1 || !etime || etime < new Date().getTime() / 1000 ? recur_mp(0) : _promise2.default.resolve([null, ret_obj]);
                        };
                        return exGet().then(function (_ref5) {
                            var _ref6 = (0, _slicedToArray3.default)(_ref5, 2),
                                raw_list = _ref6[0],
                                ret_obj = _ref6[1];

                            if (raw_list) {
                                (0, _redisTool2.default)('hmset', 'sales: ' + items[0].type + items[0].index, {
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
                    return (0, _utility.handleReject)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    },
    getStockPoint: function getStockPoint(id, price, session) {
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
            }
            var getPrice = function getPrice() {
                return price ? _promise2.default.resolve(price) : getStockPrice(items[0].type, items[0].index);
            };
            return getPrice().then(function (price) {
                var getRange = function getRange() {
                    var yearEPS = getEPS(items[0].sales);
                    if (yearEPS.eps > 0) {
                        var range = Math.floor(price / yearEPS.eps / 5);
                        if (range > 1) {
                            return 5 * (range - 1) + ' ' + Math.floor(50 * yearEPS.eps * (range - 1)) / 10 + ', ' + Math.floor(50 * yearEPS.eps * range) / 10 + ', ' + Math.floor(50 * yearEPS.eps * (range + 1)) / 10 + ', ' + Math.floor(50 * yearEPS.eps * (range + 2)) / 10 + ' ' + yearEPS.start;
                        } else if (range > 0) {
                            return 5 * range + ' ' + Math.floor(50 * yearEPS.eps * range) / 10 + ', ' + Math.floor(50 * yearEPS.eps * (range + 1)) / 10 + ', ' + Math.floor(50 * yearEPS.eps * (range + 2)) / 10 + ' ' + yearEPS.start;
                        } else {
                            return 5 * (range + 1) + ' ' + Math.floor(50 * yearEPS.eps * (range + 1)) / 10 + ', ' + Math.floor(50 * yearEPS.eps * (range + 2)) / 10 + ' ' + yearEPS.start;
                        }
                    } else {
                        return -Math.floor(-yearEPS.eps * 1000) / 1000 + ' ' + yearEPS.start;
                    }
                };
                var epsRange = getRange();
                StockTagTool.setLatest(items[0]._id, session).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Set latest');
                });
                return [items[0].index + ': ' + Math.floor(price * 9.5) / 10 + ', ' + Math.floor(price * 10.5) / 10 + ', ' + Math.floor(price * 12) / 10, epsRange];
            });
        });
    },
    getInterval: function getInterval(id, session) {
        var date = new Date();
        var year = date.getFullYear();
        var month = date.getMonth() + 1;
        var month_str = (0, _utility.completeZero)(month.toString(), 2);
        console.log(year);
        console.log(month_str);
        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('can not find stock!!!'));
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
                    }).then(function (_ref7) {
                        var _ref8 = (0, _slicedToArray3.default)(_ref7, 3),
                            raw_list = _ref8[0],
                            ret_obj = _ref8[1],
                            etime = _ref8[2];

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
                            var _iteratorNormalCompletion4 = true;
                            var _didIteratorError4 = false;
                            var _iteratorError4 = undefined;

                            try {
                                for (var _iterator4 = (0, _getIterator3.default)(group), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                    var _i25 = _step4.value;

                                    if (_i25.end - _i25.start > 33) {
                                        var _iteratorNormalCompletion5 = true;
                                        var _didIteratorError5 = false;
                                        var _iteratorError5 = undefined;

                                        try {
                                            for (var _iterator5 = (0, _getIterator3.default)(group), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                                var j = _step5.value;

                                                if (j.end - j.start > 13) {
                                                    final_group.push(j);
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

                                        return final_group;
                                    } else if (_i25.end - _i25.start > 13) {
                                        group_num++;
                                        if (group_num > 2) {
                                            var _iteratorNormalCompletion6 = true;
                                            var _didIteratorError6 = false;
                                            var _iteratorError6 = undefined;

                                            try {
                                                for (var _iterator6 = (0, _getIterator3.default)(group), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                                                    var _j2 = _step6.value;

                                                    if (_j2.end - _j2.start > 13) {
                                                        final_group.push(_j2);
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

                                            return final_group;
                                        }
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
                            var final_arr = [];
                            for (var i = 0; i < 100; i++) {
                                final_arr[i] = 0;
                            }
                            var diff = (max - min) / 100;
                            var _iteratorNormalCompletion7 = true;
                            var _didIteratorError7 = false;
                            var _iteratorError7 = undefined;

                            try {
                                for (var _iterator7 = (0, _getIterator3.default)(raw_arr), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                                    var _i28 = _step7.value;

                                    var e = Math.ceil((_i28.h - min) / diff);
                                    var s = Math.floor((_i28.l - min) / diff);
                                    for (var j = s; j < e; j++) {
                                        final_arr[j] += _i28.v;
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

                            var sort_arr = [].concat(final_arr).sort(function (a, b) {
                                return a - b;
                            });
                            var interval = null;
                            for (var _i26 = 19; _i26 > 0; _i26--) {
                                interval = group_interval(_i26, 5, final_arr, sort_arr);
                                if (interval) {
                                    console.log(interval);
                                    console.log(_i26);
                                    break;
                                }
                            }
                            var ret_str = Math.ceil(((interval[0].start - 1) * diff + min) * 100) / 100 + ' -' + Math.ceil((interval[0].end * diff + min) * 100) / 100;
                            for (var _i27 = 1; _i27 < interval.length; _i27++) {
                                ret_str = ret_str + ', ' + Math.ceil(((interval[_i27].start - 1) * diff + min) * 100) / 100 + '-' + Math.ceil((interval[_i27].end * diff + min) * 100) / 100;
                            }
                            ret_str = ret_str + ' ' + start_month + ' ' + raw_arr.length;
                            console.log('done');
                            return [interval_data, ret_str];
                        };
                        var getTpexList = function getTpexList() {
                            return (0, _apiTool2.default)('url', 'http://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=' + (year - 1911) + '/' + month_str + '&stkno=' + items[0].index + '&_=' + new Date().getTime()).then(function (raw_data) {
                                var json_data = (0, _utility.getJson)(raw_data);
                                if (json_data === false) {
                                    return (0, _utility.handleReject)(new _utility.HoError('json parse error!!!'));
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
                            return (0, _apiTool2.default)('url', 'http://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=' + year + month_str + '01&stockNo=' + items[0].index).then(function (raw_data) {
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
                        };
                        var recur_mi = function recur_mi(type, index) {
                            var getList = function getList() {
                                if (type === 2) {
                                    return getTpexList();
                                } else if (type === 3) {
                                    return getTwseList();
                                } else {
                                    var getType = function getType() {
                                        return getTpexList().then(function (_ref9) {
                                            var _ref10 = (0, _slicedToArray3.default)(_ref9, 2),
                                                type = _ref10[0],
                                                list = _ref10[1];

                                            return list.high.length > 0 ? [type, list] : getTwseList().then(function (_ref11) {
                                                var _ref12 = (0, _slicedToArray3.default)(_ref11, 2),
                                                    type = _ref12[0],
                                                    list = _ref12[1];

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
                                return getList().then(function (_ref13) {
                                    var _ref14 = (0, _slicedToArray3.default)(_ref13, 3),
                                        type = _ref14[0],
                                        list = _ref14[1],
                                        is_stop = _ref14[2];

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
                        return exGet().then(function (_ref15) {
                            var _ref16 = (0, _slicedToArray3.default)(_ref15, 2),
                                raw_list = _ref16[0],
                                ret_obj = _ref16[1];

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
                    return (0, _utility.handleReject)(new _utility.HoError('stock type unknown!!!'));
            }
        });
    }
};

//抓上市及上櫃

var getStockList = exports.getStockList = function getStockList(type) {
    var stocktype = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    var _ret4 = function () {
        switch (type) {
            case 'twse':
                //1: sii(odd) 2: sii(even)
                //3: otc(odd) 4: odd(even)
                var getList = function getList(stocktype) {
                    return (0, _apiTool2.default)('url', 'http://mops.twse.com.tw/mops/web/ajax_t51sb01?encodeURIComponent=1&step=1&firstin=1&code=&TYPEK=' + (stocktype === 3 || stocktype === 4 ? 'otc' : 'sii')).then(function (raw_data) {
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
                    v: (0, _utility.handleReject)(new _utility.HoError('stock type unknown!!!'))
                };
        }
    }();

    if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
};

var getTwseAnnual = function getTwseAnnual(index, year, filePath) {
    return (0, _apiTool2.default)('url', 'http://doc.twse.com.tw/server-java/t57sb01?id=&key=&step=1&co_id=' + index + '&year=' + (year - 1911) + '&seamon=&mtype=F&dtype=F04', { referer: 'http://doc.twse.com.tw/' }).then(function (raw_data) {
        var form = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'form')[0];
        if (!form) {
            console.log(raw_data);
            return (0, _utility.handleReject)(new _utility.HoError('cannot find form'));
        }
        var tds = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(form, 'table')[0], 'table')[0], 'tr')[1], 'td');
        var filename = false;
        var _iteratorNormalCompletion10 = true;
        var _didIteratorError10 = false;
        var _iteratorError10 = undefined;

        try {
            for (var _iterator10 = (0, _getIterator3.default)(tds), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                var t = _step10.value;

                var a = (0, _utility.findTag)(t, 'a')[0];
                if (a) {
                    filename = (0, _utility.findTag)(a)[0];
                    break;
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

        if (!filename) {
            return (0, _utility.handleReject)(new _utility.HoError('cannot find annual location'));
        }
        console.log(filename);
        return (0, _apiTool2.default)('url', 'http://doc.twse.com.tw/server-java/t57sb01?step=9&kind=F&co_id=' + index + '&filename=' + filename, { referer: 'http://doc.twse.com.tw/' }).then(function (raw_data) {
            return (0, _apiTool2.default)('url', (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'a')[0].attribs.href, 'http://doc.twse.com.tw'), {
                filePath: filePath }).then(function () {
                return filename;
            });
        });
    });
};

var getSingleAnnual = exports.getSingleAnnual = function getSingleAnnual(year, folder, index) {
    var annual_list = [];
    var recur_annual = function recur_annual(cYear, annual_folder) {
        if (!annual_list.includes(cYear.toString()) && !annual_list.includes('read' + cYear)) {
            var _ret5 = function () {
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
                                        return recur_annual(cYear, annual_folder);
                                    }
                                },
                                errhandle: function errhandle(err) {
                                    return (0, _utility.handleReject)(err);
                                }
                            });
                        });
                    })
                };
            }();

            if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
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
            var _iteratorNormalCompletion11 = true;
            var _didIteratorError11 = false;
            var _iteratorError11 = undefined;

            try {
                for (var _iterator11 = (0, _getIterator3.default)(metadataList), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                    var i = _step11.value;

                    annual_list.push((0, _mime.getExtname)(i.title).front);
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

            console.log(annual_list);
            return recur_annual(year, annualList[0].id);
        });
    });
};
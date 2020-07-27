import { STOCKDB, CACHE_EXPIRE, STOCK_FILTER_LIMIT, STOCK_FILTER, MAX_RETRY, TOTALDB, STOCK_INDEX, NORMAL_DISTRIBUTION, GAIN_LOSS, TRADE_FEE, TRADE_INTERVAL/*, MINIMAL_EXTREM_RATE, MINIMAL_DS_RATE*/ } from '../constants'
import Htmlparser from 'htmlparser2'
import { existsSync as FsExistsSync, readFile as FsReadFile, statSync as FsStatSync, unlinkSync as FsUnlinkSync } from 'fs'
import Mkdirp from 'mkdirp'
import Xml2js from 'xml2js'
import Redis from '../models/redis-tool'
import Mongo from '../models/mongo-tool'
import GoogleApi from '../models/api-tool-google'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import Api from './api-tool'
import { handleError, HoError, findTag, completeZero, getJson, addPre, isValidString } from '../util/utility'
import { getExtname } from '../util/mime'
import sendWs from '../util/sendWs'

const StockTagTool = TagTool(STOCKDB);
const Xmlparser = new Xml2js.Parser();

let stockFiltering = false;
let stockIntervaling = false;
let stockPredicting = false;

const show = (first, second, b=2, a=0) => Math.ceil(first / second * Math.pow(10, b)) / Math.pow(10, a);

const caculateEven = (data, is_dot) => {
    let dataSum = [];
    let dataEven = [];
    for (let i = 2; i < data.length; i++) {
        let Sum = 0;
        for (let j = 0; j <= i; j++) {
            Sum += data[j];
        }
        dataSum.push(Sum);
    }
    for (let i in dataSum) {
        dataEven.push(is_dot ? show(dataSum[i], Number(i) + 3, 3, 3) : show(dataSum[i], Number(i) + 3, 0, 0));
    }
    return dataEven;
}

const caculateVariance = (data, dataEven, is_dot) => {
    let dataVariance = [];
    for (let i = 2; i < data.length; i++) {
        let Variance = 0;
        for (let j = 0; j <= i; j++) {
            Variance += (data[j] - dataEven[i - 2]) * (data[j] - dataEven[i - 2]);
        }
        dataVariance.push(is_dot ? show(Math.sqrt(Variance), 1, 3, 3) : show(Math.sqrt(Variance), 1, 0, 0));
    }
    return dataVariance;
}

const caculateRelativeLine = (data, dataEven, data2, data2Even, data2Variance) => {
    let Relative = 0;
    for (let i = 0; i < data2.length; i++) {
        Relative += (data[i] - dataEven[data2Even.length - 1]) * (data2[i] - data2Even[data2Even.length - 1]);
    }
    let b = Relative / data2Variance[data2Even.length - 1] / data2Variance[data2Even.length - 1];
    let a = dataEven[dataEven.length - 1] - b * data2Even[data2Even.length - 1];
    return {a, b};
}

const getXmlDate = (xml, name, index) => {
    if (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['$'] && xml.xbrl[name][index]['$'].contextRef) {
        let result = xml.xbrl[name][index]['$'].contextRef.match(/^AsOf(\d\d\d\d)(\d\d)\d\d$/);
        if (!result) {
            result = xml.xbrl[name][index]['$'].contextRef.match(/^From\d\d\d\d01\d\dTo(\d\d\d\d)(\d\d)\d\d$/);
            if (!result) {
                return false;
            }
        }
        let year = Number(result[1]);
        let quarter = 0;
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
        return {year, quarter};
    } else {
        return false;
    }
}

//const getParameter = (xml, name, index) => (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['_']) ? Number(xml.xbrl[name][index]['_']) : 0;

const getParameter = (xml, name, index) => {
    if (xml.xbrl[name] && xml.xbrl[name][index] && xml.xbrl[name][index]['_']) {
        let ret = 0;
        if (Number(xml.xbrl[name][index]['_']) === Number(xml.xbrl[name][index]['_'])) {
            ret = Number(xml.xbrl[name][index]['_']);
        } else {
            const num = xml.xbrl[name][index]['_'].match(/\d+/g);
            ret = num ? num.reduce((a, n) => (a * 1000) + +n, 0) : 0;
        }
        return (xml.xbrl[name][index]['$'] && xml.xbrl[name][index]['$']['scale'] > 0) ? ret * Math.pow(10, xml.xbrl[name][index]['$']['scale']) : ret;
    } else {
        return 0;
    }
}

const quarterIsEmpty = quarter => {
    if (!quarter) {
        return true;
    }
    for (let i in quarter) {
        if (quarter[i]) {
            return false;
        }
    }
    return true;
}


const getStockPrice = (type, index, price_only = true) => {
    let count = 0;
    const real = () => Api('url', `https://tw.stock.yahoo.com/q/q?s=${index}`).then(raw_data => {
        const table = findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'table')[1], 'tr')[0], 'td')[0], 'table')[0];
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
        if (!price_only) {
            const up = findTag(findTag(findTag(findTag(table, 'tr')[1], 'td')[5], 'font')[0])[0].match(/^(.?\d+(\.\d+)?|\-)/);
            if (up && up[0]) {
                price[0] = `${price[0]} ${up[0]}`;
            }
        }
        console.log(price[0]);
        return price[0];
    }).catch(err => {
        console.log(count);
        return (++count > MAX_RETRY) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(real()), count * 1000));
    });
    return real();
}

const getEPS = sales => {
    let year = new Date().getFullYear();
    while (!sales[year] && year > 2000) {
        year--;
    }
    let eps = 0;
    let start = '';
    for (let i = 3; i >= 0; i--) {
        if (sales[year][i]) {
            if (i === 3) {
                start = completeZero(12, 2);
                eps = sales[year][i].eps;
                break;
            } else {
                if (sales[year - 1] && sales[year - 1][3] && sales[year - 1][i]) {
                    start = completeZero((i + 1) * 3, 2);
                    eps = sales[year][i].eps + sales[year - 1][3].eps - sales[year - 1][i].eps;
                    break;
                }
            }
        }
    }
    console.log(eps);
    return {
        eps,
        start: `${year}${start}`,
    };
}

const getCashStatus = (cash, asset) => {
    let cashStatus = {};
    for (let i in cash) {
        for (let j in cash[i]) {
            if (cash[i][j]) {
                //去除差異太大的
                if (((j === '1' || j === '2' || j === '3') && cash[i][j - 1]) || j === '0') {
                    if (!cashStatus[i]) {
                        cashStatus[i] = [];
                    }
                    cashStatus[i][j] = {
                        end: cash[i][j].end,
                        begin: show(cash[i][j].begin, cash[i][j].end),
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
                        cashStatus[i][j].without_dividends = show((cash[i][j].finance - cash[i][j].dividends) - (cash[i][j - 1].finance - cash[i][j - 1].dividends), cash[i][j].end);
                        cashStatus[i][j].minor = show((cash[i][j].change - cash[i][j].operation - cash[i][j].invest - cash[i][j].finance) - (cash[i][j - 1].change - cash[i][j - 1].operation - cash[i][j - 1].invest - cash[i][j - 1].finance), cash[i][j].end);
                        cashStatus[i][j].investPerProperty = show(cash[i][j].operation - cash[i][j - 1].operation, asset[i][j].property);
                        cashStatus[i][j].financePerLiabilities = show((cash[i][j].finance - cash[i][j].dividends) - (cash[i][j - 1].finance - cash[i][j - 1].dividends), asset[i][j].current_liabilities + asset[i][j].noncurrent_liabilities);
                    }
                }
            }
        }
    }
    return cashStatus;
}

const getSalesStatus = (sales, asset) => {
    let salesStatus = {};
    for (let i in sales) {
        for (let j in sales[i]) {
            if (sales[i][j]) {
                //去除差異太大的
                if (((j === '1' || j === '2' || j === '3') && sales[i][j - 1]) || j === '0') {
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
                        eps: sales[i][j].eps,
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
                            salesStatus[i][j].quarterRevenue =  1000;
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
}

const getAssetStatus =asset => {
    let assetStatus = {};
    for (let i in asset) {
        for (let j in asset[i]) {
            if (asset[i][j]) {
                //去除差異太大的
                if (((j === '1' || j === '2' || j === '3') && asset[i][j - 1]) || j === '0') {
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
                        payable: show(asset[i][j].payable, asset[i][j].total, 3, 1),
                    };
                }
            }
        }
    }
    return assetStatus;
}

const getProfitStatus = (salesStatus, cashStatus, asset) => {
    let profitStatus = {};
    for (let i in salesStatus) {
        profitStatus[i] = [];
        for (let j in salesStatus[i]) {
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
                quarterSales: salesStatus[i][j].quarterRevenue,
            };
        }
    }
    return profitStatus;
}

const getSafetyStatus = (salesStatus, cashStatus, asset) => {
    let safetyStatus = {};
    let length = 0
    for (let i in salesStatus) {
        length++;
    }
    for (let i in salesStatus) {
        if (length <= 5) {
            safetyStatus[i] = [];
            for (let j in salesStatus[i]) {
                safetyStatus[i][j] = {
                    prMinusProfit: Math.ceil(asset[i][j].payable / asset[i][j].receivable * 1000 - 1000 + salesStatus[i][j].quarterProfit * 10) / 10,
                    prRatio: show(asset[i][j].payable, asset[i][j].receivable, 3, 1),
                    shortCash: show(asset[i][j].receivable - asset[i][j].payable * 2 + asset[i][j].current_liabilities - salesStatus[i][j].quarterProfit * asset[i][j].receivable / 100 - cashStatus[i][j].invest * cashStatus[i][j].end / 100, asset[i][j].cash, 3, 1),
                    shortCashWithoutCL: show(asset[i][j].receivable - asset[i][j].payable - salesStatus[i][j].quarterProfit * asset[i][j].receivable / 100 - cashStatus[i][j].invest * cashStatus[i][j].end / 100, asset[i][j].cash, 3, 1),
                    shortCashWithoutInvest: show(asset[i][j].receivable - asset[i][j].payable * 2 + asset[i][j].current_liabilities - salesStatus[i][j].quarterProfit * asset[i][j].receivable / 100, asset[i][j].cash, 3, 1),
                };
            }
        }
        length--;
    }
    return safetyStatus;
}

const getManagementStatus = (salesStatus, asset) => {
    let managementStatus = {};
    let revenue = [];
    let profit = [];
    let cash = [];
    let inventories = [];
    let receivable = [];
    let payable = [];
    let startY = 0;
    let startQ = 0;
    let realY = 0;
    let realQ = 0;
    for (let i in salesStatus) {
        for (let j in salesStatus[i]) {
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
                    share: asset[i][j].share,
                };
            } else if (j === '0'){
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
                    profit: show(salesStatus[i][j].quarterProfit * salesStatus[i][j].quarterRevenue, 1, 0 , 2),
                    cash: asset[i][j].cash,
                    inventories: asset[i][j].inventories,
                    receivable: asset[i][j].receivable,
                    payable: asset[i][j].payable,
                    share: asset[i][j].share,
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

    const revenueEven = caculateEven(revenue);
    const revenueVariance = caculateVariance(revenue, revenueEven);
    const profitEven = caculateEven(profit);
    const profitVariance = caculateVariance(profit, profitEven);
    const cashEven = caculateEven(cash);
    const cashVariance = caculateVariance(cash, cashEven);
    const inventoriesEven = caculateEven(inventories);
    const inventoriesVariance = caculateVariance(inventories, inventoriesEven);
    const receivableEven = caculateEven(receivable);
    const receivableVariance = caculateVariance(receivable, receivableEven);
    const payableEven = caculateEven(payable);
    const payableVariance = caculateVariance(payable, payableEven);

    const revenueRelative = (data, dataEven, dataVariance, dataRelative) => {
        let Y = startY;
        let Q = startQ;
        let Relative = 0;
        let bY = realY;
        let bQ = realQ;
        for (let i = 0; i < 8; i++) {
            if (bQ > 3) {
                bQ = 0;
                bY++;
            }
            if (managementStatus[bY] && managementStatus[bY][bQ]) {
                managementStatus[bY][bQ][dataRelative] = 0;
            }
            bQ++;
        }
        for (let i = 2; i < revenue.length; i++) {
            if (Q > 3) {
                Q = 0;
                Y++;
            }
            if (managementStatus[Y][Q]) {
                Relative = 0;
                for (let j = 0; j <= i; j++) {
                    Relative += (revenue[j] - revenueEven[i - 2]) * (data[j] - dataEven[i - 2]);
                }
                if (dataVariance[i - 2] && revenueVariance[i - 2]) {
                    managementStatus[Y][Q][dataRelative] = show(Relative, dataVariance[i - 2] * revenueVariance[i - 2], 3, 3);
                } else {
                    managementStatus[Y][Q][dataRelative] = 0;
                }
                if (dataRelative === 'profitRelative') {
                    managementStatus.b = Relative / revenueVariance[i - 2] / revenueVariance[i - 2];
                    managementStatus.a = dataEven[i - 2] - managementStatus.b * revenueEven[i - 2];
                }
            } else {
                i--;
            }
            Q++;
        }
    }

    revenueRelative(profit, profitEven, profitVariance, 'profitRelative');
    revenueRelative(cash, cashEven, cashVariance, 'cashRelative');
    revenueRelative(inventories, inventoriesEven, inventoriesVariance, 'inventoriesRelative');
    revenueRelative(receivable, receivableEven, receivableVariance, 'receivableRelative');
    revenueRelative(payable, payableEven, payableVariance, 'payableRelative');

    return managementStatus;
}

const getProfitIndex = (profitStatus, startYear, endYear) => {
    if (endYear - 4 > startYear) {
        startYear = endYear - 4;
    }
    let index = 0;
    let denominator = 1;
    for (let i = endYear; i >= startYear; i--) {
        for (let j = 3; j >=0; j--) {
            if (profitStatus[i] && profitStatus[i][j]) {
                index += (profitStatus[i][j].profit * 3 + profitStatus[i][j].operating_profit * 2 + profitStatus[i][j].gross_profit) * profitStatus[i][j].turnover / profitStatus[i][j].leverage / denominator;
                denominator++;
            }
        }
    }
    return Math.ceil(index * 1000) / 1000;
}

const getSafetyIndex = safetyStatus => {
    let index = 0;
    let multiple = 0;
    for (let i in safetyStatus) {
        for (let j in safetyStatus[i]) {
            multiple++;
            index += (safetyStatus[i][j].shortCash + safetyStatus[i][j].shortCashWithoutCL + safetyStatus[i][j].shortCashWithoutInvest) * multiple;
        }
    }
    return -Math.ceil(index / (1 + multiple) / multiple * 2000) / 1000;
}

const getManagementIndex = (managementStatus, year, quarter) => {
    let real_year = year;
    if (managementStatus) {
        while ((!managementStatus[real_year] || !managementStatus[real_year][quarter - 1]) && real_year > (year - 5)) {
            if (quarter === 1) {
                quarter = 4;
                real_year--;
            } else {
                quarter--;
            }
        }
        return (!managementStatus[real_year] || !managementStatus[real_year][quarter - 1]) ? -10 : show(managementStatus[real_year][quarter - 1].profitRelative + managementStatus[real_year][quarter - 1].cashRelative + managementStatus[real_year][quarter - 1].inventoriesRelative + managementStatus[real_year][quarter - 1].receivableRelative + managementStatus[real_year][quarter - 1].payableRelative, 1, 3, 3);
    } else {
        return -10;
    }
}

export const initXml = filelocation => new Promise((resolve, reject) => FsReadFile(filelocation, 'utf8', (err, data) => err ? reject(err) : resolve(data))).then(data => new Promise((resolve, reject) => Xmlparser.parseString(data, (err, result) => {
    if (err) {
        console.log(err.code);
        console.log(err.message);
        console.log(data);
        return reject(err);
    } else {
        if (result.html) {
            const ixbrl = {xbrl:{}};
            const enumerate = obj => {
                for (let o in obj) {
                    if (typeof obj[o] === 'object') {
                        if (o.match(/^ix\:/)) {
                            for (let j in obj[o]) {
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
            }
            enumerate(result.html.body);
            return resolve(ixbrl);
        } else {
            return resolve(result);
        }
    }
})));

const getCashflow = (xml, cash, no_cover) => {
    if (!xml.xbrl) {
        for (let i in xml) {
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
    let year = 0;
    let quarter = 0;
    let type = 0;
    let xmlDate = {};
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
    const califrsCash = (ci, no_cover) => {
        let xmlDate = {};
        if (xmlDate = getXmlDate(xml, 'tifrs-SCF:ProfitLossBeforeTax', ci)) {
            let y = xmlDate.year;
            let q = xmlDate.quarter - 1;
            let parseResult = null;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tifrs-SCF:ProfitLossBeforeTax', ci),
                    operation: getParameter(xml, 'ifrs:CashFlowsFromUsedInOperatingActivities', ci),
                    invest: getParameter(xml, 'tifrs-SCF:NetCashFlowsFromUsedInInvestingActivities', ci),
                    finance: getParameter(xml, 'tifrs-SCF:CashFlowsFromUsedInFinancingActivities', ci),
                    dividends: getParameter(xml, 'tifrs-SCF:CashDividendsPaid', ci),
                    change: getParameter(xml, 'ifrs:IncreaseDecreaseInCashAndCashEquivalents', ci),
                    begin: getParameter(xml, 'tifrs-SCF:CashAndCashEquivalentsAtBeginningOfPeriod', ci),
                    end: getParameter(xml, 'tifrs-SCF:CashAndCashEquivalentsAtEndOfPeriod', ci),
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
    }
    const calgaapCash = (ci, no_cover) => {
        let xmlDate = {};
        let cashBegin = 0;
        let cashEnd = 0;
        let bq = 0;
        let eq = 5;
        let i = 0;
        let parseResult = null;
        let y = 0;
        let q = 0;
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
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        const temp = getParameter(xml, 'tw-gaap-ci:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
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
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        const temp = getParameter(xml, 'tw-gaap-fh:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-fh:CashCashEquivalents', i);
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
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        const temp = getParameter(xml, 'tw-gaap-basi:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-basi:CashCashEquivalents', i);
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
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        temp = getParameter(xml, 'tw-gaap-mim:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-mim:CashCashEquivalents', i);
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
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        const temp = getParameter(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-bd:CashCashEquivalents', i);
                }
            }
        } else if ((xmlDate = getXmlDate(xml, 'tw-gaap-ins:ConsolidatedTotalIncome_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLoss_StatementCashFlows', ci)) || (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLoss-StatementCashFlows', ci))) {
            let y = xmlDate.year;
            let q = xmlDate.quarter - 1;
            if (!cash[y] || !cash[y][q] || !no_cover) {
                parseResult = {
                    profitBT: getParameter(xml, 'tw-gaap-ins:ConsolidatedTotalIncome_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ins:NetIncomeLoss_StatementCashFlows', ci) + getParameter(xml, 'tw-gaap-ins:IncomeTaxExpenseBenefit', ci) + getParameter(xml, 'tw-gaap-ins:NetIncomeLoss-StatementCashFlows', ci),
                    operation: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedOperatingActivities', ci),
                    invest: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedInvestingActivities', ci),
                    finance: getParameter(xml, 'tw-gaap-ins:NetCashProvidedUsedFinancingActivities', ci),
                    dividends: getParameter(xml, 'tw-gaap-ins:CashDividends', ci),
                    change: getParameter(xml, 'tw-gaap-ins:NetChangesCashCashEquivalents', ci),
                    begin: 0,
                    end: 0,
                };
                let cashDate = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                while (cashDate) {
                    if (cashDate.year === y) {
                        const temp = getParameter(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                        if (temp && cashDate.quarter < eq) {
                            cashEnd = temp;
                            eq = cashDate.quarter;
                        }
                    } else if (cashDate.year === (y - 1)) {
                        const temp = getParameter(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                        if (temp && cashDate.quarter > bq) {
                            cashBegin = temp;
                            bq = cashDate.quarter;
                        }
                    }
                    i++;
                    cashDate = getXmlDate(xml, 'tw-gaap-ins:CashCashEquivalents', i);
                }
            }
        } else {
            return false;
        }
        if (!quarterIsEmpty(parseResult)) {
            if ((cashBegin && cashEnd) || parseResult.change) {
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
    }
    let isOk = false;
    for (let i = 0; i < 4; i++) {
        if (type === 1) {
            if (xmlDate = califrsCash(i, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapCash(i, no_cover)) {
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
}

const getAsset = (xml, asset, no_cover) => {
    if (!xml.xbrl) {
        for (let i in xml) {
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
    let year = 0;
    let quarter = 0;
    let type = 0;
    let xmlDate = {};
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
    const califrsAsset = (ai, no_cover) => {
        let xmlDate = {};
        let y = 0;
        let q = 0;
        let parseResult = null;
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
                    longterm: getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai),
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
                    longterm: getParameter(xml, 'tifrs-bsci-fh:ReinsuranceContractAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-fh:HeldToMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-fh:InvestmentsAccountedForUsingEquityMethodNet', ai) + getParameter(xml, 'ifrs:OtherFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai),
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
                    longterm: getParameter(xml, 'tifrs-bsci-basi:HeldToMaturityFinancialAssets', ai) + getParameter(xml, 'ifrs:OtherFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai),
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
                    longterm: getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai) + getParameter(xml, 'tifrs-bsci-bd:NoncurrentFinancialAssetsAtFairValueThroughProfitOrLoss', ai) + getParameter(xml, 'tifrs-bsci-bd:NoncurrentFinancialAssetsAtCost', ai) + getParameter(xml, 'tifrs-bsci-bd:AvailableForSaleNoncurrentFinancialAssets', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai),
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
                    longterm: getParameter(xml, 'tifrs-bsci-mim:NoncurrentAvailableForSaleFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-mim:NoncurrentHeldToMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tifrs-bsci-mim:NoncurrentFinancialAssetsAtCostNet', ai) + getParameter(xml, 'ifrs:InvestmentAccountedForUsingEquityMethod', ai) + getParameter(xml, 'ifrs:InvestmentProperty', ai),
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
                    longterm: 0,
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
                    longterm: getParameter(xml, 'ifrs-full:NoncurrentAssets', ai),
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
    }
    const calgaapAsset = (ai, no_cover) => {
        let xmlDate = {};
        let y = 0;
        let q = 0;
        let parseResult = null;
        if (xmlDate = getXmlDate(xml, 'tw-gaap-ci:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    longterm: getParameter(xml, 'tw-gaap-ci:LongtermInvestments', ai),
                };
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-ci:Liabilities', ai) - parseResult.noncurrent_liabilities;
                parseResult.equityParent = getParameter(xml, 'tw-gaap-ci:StockholdersEquities', ai) - parseResult.equityChild;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-fh:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    longterm: getParameter(xml, 'tw-gaap-fh:HeldMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-fh:EquityInvestmentsEquityMethodNet', ai) + getParameter(xml, 'tw-gaap-fh:OtherFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-fh:InvestmentsRealEstateNet', ai),
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
            q = xmlDate.quarter-1;
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
                    longterm: getParameter(xml, 'tw-gaap-basi:HeldMaturityFinancialAssetsNet', ai) + getParameter(xml, 'tw-gaap-basi:OtherFinancialAssetsNet', ai),
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
            q = xmlDate.quarter-1;
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
                    longterm: getParameter(xml, 'tw-gaap-bd:FundsLongTermInvestments', ai),
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-bd:StockholdersEquities', ai) - parseResult.equityChild;
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-bd:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:Capital', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    longterm: getParameter(xml, 'tw-gaap-mim:FundsInvestments', ai),
                };
                parseResult.equityParent = getParameter(xml, 'tw-gaap-mim:StockholdersEquity', ai) - parseResult.equityChild;
                parseResult.current_liabilities = getParameter(xml, 'tw-gaap-mim:Liabilities', ai) - parseResult.noncurrent_liabilities;
                if (parseResult.total === 0) {
                    parseResult = null;
                }
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:CommonStock', ai)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    longterm: 0,
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
    }
    let isOk = false;
    for (let i = 0; i < 4; i++) {
        if (type === 1) {
            if (xmlDate = califrsAsset(i, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapAsset(i, no_cover)) {
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
}

const getSales = (xml, sales, cash, no_cover) => {
    if (!xml.xbrl) {
        for (let i in xml) {
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
    let year = 0;
    let quarter = 0;
    let type = 0;
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
    const califrsSales = (si, no_cover) => {
        let xmlDate = {};
        let y = 0;
        let q = 0;
        let parseResult = null;
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
                    operating: getParameter(xml, 'tifrs-bsci-ci:NetOperatingIncomeLoss', si),
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
                    operating: 0,
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
                    operating: 0,
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
                    operating: 0,
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
                    operating: 0,
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
                    operating: 0,
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
                    operating: 0,
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
    }
    const calgaapSales = (si, no_cover) =>{
        let xmlDate = {};
        let y = 0;
        let q = 0;
        let parseResult = null;
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
                    operating: getParameter(xml, 'tw-gaap-ci:OperatingIncomeLoss', si),
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
                    operating: 0,
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
                    operating: 0,
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
                    operating: 0,
                };
                parseResult.cost = getParameter(xml, 'tw-gaap-bd:Expenditure', si) - parseResult.expenses - getParameter(xml, 'tw-gaap-bd:NonOperatingExpenseLoss', si);
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-mim:ConsolidatedTotalIncome-IncomeStatement', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    operating: 0,
                };
                parseResult.cost = getParameter(xml, 'tw-gaap-mim:Expenses', si) - getParameter(xml, 'tw-gaap-mim:OtherExpenses', si) - getParameter(xml, 'tw-gaap-mim:ForeignExchangeLosses', si) - getParameter(xml, 'tw-gaap-mim:ImpairmentLosses', si) - getParameter(xml, 'tw-gaap-mim:LossDisposalFixedAssets', si) - getParameter(xml, 'tw-gaap-mim:InvestmentLossEquityMethodInvestee', si) - parseResult.expenses;
                parseResult.gross_profit = parseResult.revenue - parseResult.cost;
                parseResult.operating = parseResult.gross_profit - parseResult.expenses;
                parseResult.nonoperating = parseResult.profit + parseResult.tax - parseResult.operating;
            }
        } else if (xmlDate = getXmlDate(xml, 'tw-gaap-ins:NetIncomeLossContinuingOperations', si)) {
            y = xmlDate.year;
            q = xmlDate.quarter-1;
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
                    operating: 0,
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
    }
    let xmlDate = {};
    let isOk = false;
    for (let i = 0; i < 4; i++) {
        if (type === 1) {
            if (xmlDate = califrsSales(i, no_cover)) {
                if (xmlDate.year === year && xmlDate.quarter === quarter) {
                    isOk = true;
                }
            }
        } else {
            if (xmlDate = calgaapSales(i, no_cover)) {
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
}

const getTwseXml = (stockCode, year, quarter, filePath) => {
    const post = {
        step: 9,
        co_id: stockCode,
        year,
        season: quarter,
        functionName: (year > 2012) ? 't164sb01' : 't147sb02',
        report_id: (year > 2012) ? 'C' : 'B',
    };
    return Api('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', {post, filePath}).catch(err => {
        if (err.code === 'HPE_INVALID_CONSTANT') {
            post.report_id = (post.report_id === 'C') ? 'B' : 'A';
            return Api('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', {post, filePath}).catch(err => {
                if (err.code === 'HPE_INVALID_CONSTANT') {
                    post.report_id = 'A';
                    return Api('url', 'https://mops.twse.com.tw/server-java/FileDownLoad', {post, filePath});
                } else {
                    return handleError(err);
                }
            })
        } else {
            return handleError(err);
        }
    });
}

const trans_tag = (item, append) => {
    switch (item) {
        case 'receivable':
        return `應收資產${append}`;
        case 'cash':
        return `現金資產${append}`;
        /*case 'OCFA':
        return `其他流動資產${append}`;*/
        case 'inventories':
        return `存貨資產${append}`;
        case 'property':
        return `不動資產${append}`;
        case 'longterm':
        return `長期投資資產${append}`;
        case 'other':
        return `其他資產${append}`;
        case 'equityChild':
        return `非控制權益${append}`;
        case 'equityParent':
        return `母公司權益${append}`;
        case 'noncurrent_liabilities':
        return `非流動負債${append}`;
        case 'current_liabilities_without_payable':
        return `流動不包含應付帳款負債${append}`;
        case 'payable':
        return `應付帳款負債${append}`;
    }
}

const getBasicStockData = (type, index) => {
    switch(type) {
        case 'twse':
        return Api('url', `https://mops.twse.com.tw/mops/web/ajax_quickpgm?encodeURIComponent=1&step=4&firstin=1&off=1&keyword4=${index}&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&co_id=${index}`).then(raw_data => {
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
        });
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

const handleStockTagV2 = (type, index, indexTag) => getBasicStockData(type, index).then(basic => {
    let tags = new Set();
    indexTag.forEach(v => tags.add(v));
    tags.add(type).add(basic.stock_index).add(basic.stock_full).add(basic.stock_market).add(basic.stock_market_e).add(basic.stock_class).add(basic.stock_time);
    basic.stock_name.forEach(i => tags.add(i));
    basic.stock_location.forEach(i => tags.add(i));
    let valid_tags = [];
    tags.forEach(i => {
        const valid_name = isValidString(i, 'name');
        if (valid_name) {
            valid_tags.push(valid_name);
        }
    });
    return [basic.stock_name[0], valid_tags];
});

const handleStockTag = (type, index, latestYear, latestQuarter, assetStatus, cashStatus, safetyStatus, profitStatus, salesStatus, managementStatus) => getBasicStockData(type, index).then(basic => {
    let tags = new Set();
    tags.add(type).add(basic.stock_index).add(basic.stock_full).add(basic.stock_market).add(basic.stock_market_e).add(basic.stock_class).add(basic.stock_time);
    basic.stock_name.forEach(i => tags.add(i));
    basic.stock_location.forEach(i => tags.add(i));
    let ly = latestYear;
    let lq = latestQuarter - 1;
    for (let i = 0; i < 20; i++) {
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
    for (let i in assetStatus[ly][lq]) {
        if (i !== 'total' && assetStatus[ly][lq][i] > 25) {
            tags.add(trans_tag(i, '較多'));
        }
    }
    tags.add((assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent'] >= 50) ? '權益較多' : '負債較多');
    let diff_obj = {d: [], p: []};
    let ey = ly - 5;
    let eq = lq;
    for (let i = 0; i < 20; i++) {
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
    const threshold = assetStatus[ey][eq]['total'] * 10;
    for (let i in assetStatus[ey][eq]) {
        if (i !== 'total') {
            const diff = assetStatus[ly][lq][i] * assetStatus[ly][lq]['total'] - assetStatus[ey][eq][i] * assetStatus[ey][eq]['total'];
            if (Math.abs(diff) > threshold) {
                (i === 'equityChild' || i === 'equityParent' || i === 'noncurrent_liabilities' || i === 'current_liabilities_without_payable' || i === 'payable') ? diff_obj.d.push({i: i, n: diff}) : diff_obj.p.push({i: i, n: diff});
            }
        }
    }
    if (diff_obj.d.length > 0) {
        diff_obj.d.sort((a, b) => Math.abs(a.n) - Math.abs(b.n));
    }
    if (diff_obj.p.length > 0) {
        diff_obj.p.sort((a, b) => Math.abs(a.n) - Math.abs(b.n));
    }
    if (diff_obj.d[0]) {
        tags.add(trans_tag(diff_obj.d[0].i, (diff_obj.d[0].n > 0) ? '成長' : '減少'));
        if (diff_obj.d[1]) {
            tags.add(trans_tag(diff_obj.d[1].i, (diff_obj.d[1].n > 0) ? '成長' : '減少'));
        }
    }
    if (diff_obj.p[0]) {
        tags.add(trans_tag(diff_obj.p[0].i, (diff_obj.p[0].n > 0) ? '成長' : '減少'));
        if (diff_obj.p[1]) {
            tags.add(trans_tag(diff_obj.p[1].i, (diff_obj.p[1].n > 0) ? '成長' : '減少'));
            if (diff_obj.p[2]) {
                tags.add(trans_tag(diff_obj.p[2].i, (diff_obj.p[2].n > 0) ? '成長' : '減少'));
            }
        }
    }
    let total_diff = assetStatus[ly][lq]['total'] - assetStatus[ey][eq]['total'];
    if (total_diff > (assetStatus[ey][eq]['total'] * 0.2)) {
        tags.add('總資產成長');
        const diff = (assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ly][lq]['total'] - (assetStatus[ey][eq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ey][eq]['total'];
        tags.add((diff > (total_diff - diff)) ? '總權益成長' : '總負債成長');
    } else if (total_diff < (-0.2 * assetStatus[ey][eq]['total'])){
        tags.add('總資產減少');
        const diff = (assetStatus[ly][lq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ly][lq]['total'] - (assetStatus[ey][eq]['equityChild'] + assetStatus[ly][lq]['equityParent']) * assetStatus[ey][eq]['total'];
        tags.add((diff < (total_diff - diff)) ? '總權益減少' : '總負債減少');
    }
    ly = latestYear;
    lq = latestQuarter - 1;
    for (let i = 0; i < 20; i++) {
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
    let y = ly - 5;
    let q = lq;
    ey = ly - 5;
    eq = lq;
    let operation = 0;
    let financial = 0;
    let minor = 0;
    let profit_flow = 0;
    let divided_flow = 0;
    for (let i = 0; i < 100; i++) {
        if (cashStatus[ly] && cashStatus[ly][lq]) {
            operation = operation + (cashStatus[ly][lq].operation + cashStatus[ly][lq].invest) * cashStatus[ly][lq].end;
            financial += (cashStatus[ly][lq].without_dividends * cashStatus[ly][lq].end);
            minor += (cashStatus[ly][lq].minor * cashStatus[ly][lq].end);
            if (salesStatus[ly] && salesStatus[ly][lq]) {
                profit_flow = profit_flow + cashStatus[ly][lq].profitBT * cashStatus[ly][lq].end - salesStatus[ly][lq].quarterTax * salesStatus[ly][lq].quarterRevenue;
            } else {
                profit_flow += (cashStatus[ly][lq].profitBT * cashStatus[ly][lq].end);
            }
            divided_flow += (cashStatus[ly][lq].dividends * cashStatus[ly][lq].end);
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
    for (let i = 0; i < 20; i++) {
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
    let cash_flow = operation + financial + minor;
    if (cash_flow > (cashStatus[ey][eq].end * 20)) {
        tags.add('現金流入');
    } else if (cash_flow < (cashStatus[ey][eq].end * -20)){
        tags.add('現金流出');
    }
    if (Math.abs(operation) > Math.abs(financial) * 1.2) {
        tags.add((operation > 0) ? '營運現金流入' : '營運現金流出');
    } else if (Math.abs(financial) > Math.abs(operation) * 1.2) {
        tags.add((financial > 0) ? '融資現金流入' : '融資現金流出');
    }
    divided_flow /= -100;
    profit_flow /= 100;
    cash_flow /= 100;
    const value_flow = divided_flow + total_diff;
    tags.add((value_flow > 0) ? '價值增加' : '價值減少');
    tags.add((profit_flow > 0) ? '累積獲利' : '累積虧損');
    if (Math.abs(value_flow - profit_flow) > Math.abs(profit_flow * 0.2)) {
        tags.add((value_flow - profit_flow > 0) ? '非獲利價值增加過高' : '非獲利價值減少過高');
    }
    if (Math.abs(cash_flow) > 0.5 * Math.abs(value_flow)) {
        tags.add((cash_flow > 0) ? '現金價值增加' : '現金價值減少');
    }
    if (Math.abs(total_diff - cash_flow) > 0.5 * Math.abs(value_flow)) {
        tags.add((total_diff - cash_flow > 0) ? '非現金價值增加' : '非現金價值減少');
    }
    if (divided_flow > 0.2 * Math.abs(value_flow)) {
        tags.add('股利價值增加');
    }
    ly = latestYear;
    lq = latestQuarter - 1;
    for (let i = 0; i < 20; i++) {
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
    let opcash = [];
    let cdcash = [];
    let shortcash = [];
    let time = [];
    let t = 100;
    for (let i = 0; i < 100; i++) {
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
    let timeEven = caculateEven(time, true);
    let timeVariance = caculateVariance(time, timeEven, true);
    const periodChange = (data, name, speed, reverse, interval1, d1, d2, interval2=null, d3=null, interval3=null, d4=null, interval4=null, d5=null) => {
        const even = caculateEven(data, true);
        const line = caculateRelativeLine(data, even, time, timeEven, timeVariance);
        const start = line.a + line.b * time[time.length - 1];
        const end = line.a + line.b * time[0];
        let append = name;

        if (reverse) {
            if (line.b > speed) {
                name += '快速減少';
            } else if (line.b > 0) {
                name += '逐漸減少';
            } else if (line.b > -speed){
                name += '逐漸增加';
            } else {
                name += '快速增加';
            }
        } else {
            if (line.b > speed) {
                append += '快速增加';
            } else if (line.b > 0) {
                append += '逐漸增加';
            } else if (line.b > -speed){
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
                    append = `${append}從${d1}`;
                } else if (start > interval2) {
                    append = `${append}從${d2}`;
                } else if (start > interval3) {
                    append = '';
                } else if (start > interval4) {
                    append = `${append}從${d4}`;
                } else {
                    append = `${append}從${d5}`;
                }
                if (append) {
                    tags.add(append);
                }
                append = name;
                if (end > interval1) {
                    tags.add(`${append}變得${d1}`);
                } else if (end > interval2) {
                    tags.add(`${append}變得${d2}`);
                } else if (end > interval3) {
                } else if (end > interval4) {
                    tags.add(`${append}變得${d4}`);
                } else {
                    tags.add(`${append}變得${d5}`);
                }
            } else {
                if (start > interval1) {
                    append = `${append}從${d1}`;
                } else if (start > interval2) {
                    append = '';
                } else {
                    append = `${append}從${d3}`;
                }
                if (append) {
                    tags.add(append);
                }
                append = name;
                if (end > interval1) {
                    tags.add(`${append}變得${d1}`);
                } else if (end > interval2) {
                } else {
                    tags.add(`${append}變得${d3}`);
                }
            }
        } else {
            tags.add(`${append}從${(start > interval1) ? d1 : d2}`);
            tags.add(`${append}變得${(end > interval1) ? d1 : d2}`);
        }
    }
    periodChange(opcash, '營運資金', 5, false, 0, '充足', '不足');
    periodChange(cdcash, '短債資金', 5, true, 100, '不足', '充足');
    periodChange(shortcash, '安全資金', 5, true, 100, '不足', '充足');

    ly = latestYear;
    lq = latestQuarter - 1;
    for (let i = 0; i < 20; i++) {
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
    let gross_profit = [];
    let operating_profit = [];
    let profit = [];
    let roe = [];
    let leverage = [];
    let turnover = [];
    time = [];
    t = 100;
    for (let i = 0; i < 100; i++) {
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
    for (let i = 0; i < 20; i++) {
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
    let nonoperating = {p: 0, m: 0};
    let tax = {p: 0, m: 0};
    let comprehensive = {p: 0, m: 0};
    t = 0;
    for (let i = 0; i < 100; i++) {
        if (salesStatus[ly] && salesStatus[ly][lq]) {
            if (Math.abs(salesStatus[ly][lq].nonoperating_without_FC - salesStatus[ly][lq].finance_cost) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                (salesStatus[ly][lq].nonoperating_without_FC - salesStatus[ly][lq].finance_cost > 0) ? nonoperating.p++ : nonoperating.m++;
            }
            if (Math.abs(salesStatus[ly][lq].tax) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                (salesStatus[ly][lq].tax < 0) ? tax.p++ : tax.m++;
            }
            if (Math.abs(salesStatus[ly][lq].comprehensive) > Math.abs(0.3 * salesStatus[ly][lq].profit)) {
                (salesStatus[ly][lq].comprehensive > 0) ? comprehensive.p++ : comprehensive.m++;
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

    if (nonoperating.p + nonoperating.m > 0.5 * (t)) {
        if (nonoperating.p > nonoperating.m * 1.5) {
            tags.add('非營業佔比過高並多數是增加');
        } else if (nonoperating.m > nonoperating.p * 1.5) {
            tags.add('非營業佔比過高並多數是減少');
        } else {
            tags.add('非營業佔比過高');
        }
    }

    if (tax.p + tax.m > 0.5 * (t)) {
        if (tax.p > tax.m * 1.5) {
            tags.add('稅率佔獲利過高並多數是增加');
        } else if (tax.m > tax.p * 1.5) {
            tags.add('稅率佔獲利過高並多數是減少');
        } else {
            tags.add('稅率佔獲利過高');
        }
    }

    if (comprehensive.p + comprehensive.m > 0.3 * (t)) {
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
    for (let i = 0; i < 20; i++) {
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
        let revenue = [];
        let revenueP = [];
        let revenueN = [];
        let revenueF = [];
        y = ly - 5;
        q = lq;
        for (let i = 0; i < 100; i++) {
            if (managementStatus[ly] && managementStatus[ly][lq]) {
                revenueN.push(managementStatus[ly][lq].revenue);
                if (revenue[lq]) {
                    revenueP.push(Math.pow(revenue[lq].n / managementStatus[ly][lq].revenue,1 / (revenue[lq].y - ly)) - 1);
                } else {
                    revenue[lq] = {
                        y: ly,
                        n: managementStatus[ly][lq].revenue,
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
        const getSD = (p, pp, name) => {
            const even = caculateEven(pp, true);
            let sd = 0;
            let start = 0;
            let end = 0;
            let yearp = 0
            if (pp.length < 16) {
                for (let i = 0; i < pp.length; i++) {
                    sd = sd + (pp[i] - even[pp.length - 3]) * (pp[i] - even[pp.length - 3]);
                }
                sd = Math.sqrt(sd / pp.length);
                const yy = Math.floor(p.length / 4);
                if (yy > 1) {
                    start = p[yy * 4 - 1] + p [yy * 4 - 2] + p[yy * 4 - 3] + p [yy * 4 - 4];
                    end = p[0] + p[1] + p[2] + p[3];
                    yearp = Math.pow(end / start, 1 / yy) - 1;
                    if (yearp > 0.1) {
                        tags.add(`${name}快速成長`);
                    } else if (yearp > 0.05) {
                        tags.add(`${name}成長`);
                    } else if (yearp < -0.05) {
                        tags.add(`${name}衰退`);
                    }
                }
                tags.add((sd < 0.1) ? `${name}穩定` : `${name}不穩定`);
            } else {
                for (let i = 0; i < 16; i++) {
                    sd = sd + (pp[i] - even[13]) * (pp[i] - even[13]);
                }
                sd = Math.sqrt(sd / 16);
                start = p[16] + p [17] + p[18] + p [19];
                end = p[0] + p[1] + p[2] + p[3];
                yearp = Math.pow(end / start,1 / 5) - 1;
                if (yearp > 0.1) {
                    tags.add(`${name}快速成長`);
                } else if (yearp > 0.05) {
                    tags.add(`${name}成長`);
                } else if (yearp < -0.05) {
                    tags.add(`${name}衰退`);
                }
                tags.add((sd < 0.1) ? `${name}穩定` : `${name}不穩定`);
            }
        }
        getSD(revenueN, revenueP, '營收');
    }
    let valid_tags = [];
    tags.forEach(i => {
        const valid_name = isValidString(i, 'name');
        if (valid_name) {
            valid_tags.push(valid_name);
        }
    });
    return [basic.stock_name[0], valid_tags];
});

const getParameterV2 = (data, type, text = null) => {
    const matchProfit = data.match(new RegExp('\\>' + type + '\\<\\/td\\>([\\s\\S]+?)\\<\\/tr\\>'));
    if (!matchProfit) {
        return false;
    }
    if (text && !matchProfit[1].match(new RegExp(text))) {
        return false;
    }
    return matchProfit[1].match(/\>[\d,]+\</g).map(v => Number(v.replace(/[\>\<,]/g, '')));
}

export default {
    getSingleStockV2: function(type, obj, stage=0) {
        const index = obj.index;
        const date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
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
                    const per = (profit === 0) ? 0 : Math.round(price / profit * equity * 10) / 100;
                    const pdr = (dividends === 0) ? 0 : Math.round(price / dividends * equity * 10) / 100;
                    const pbr = (netValue === 0) ? 0 : Math.round(price / netValue * equity * 10) / 100;
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
                        return {
                            per,
                            pdr,
                            pbr,
                            latestQuarter,
                            latestYear,
                            stockName: `${type}${index}${name}`,
                            id,
                        }
                    });
                });
            }
            let wait_count = 0;
            const recur_getTwseProfit = () => {
                console.log(year);
                console.log(quarter);
                return Api('url', `https://mops.twse.com.tw/server-java/t164sb01?step=1&CO_ID=${index}&SYEAR=${year}&SSEASON=${quarter}&REPORT_ID=${reportType}`).then(raw_data => {
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
                            return new Promise((resolve, reject) => setTimeout(() => resolve(recur_getTwseProfit()), 20000));
                        }
                    } else {
                        wait_count = 0;
                        let profitArr = getParameterV2(raw_data, 7900, '繼續營業單位稅前淨利（淨損）');
                        if (!profitArr) {
                            profitArr = getParameterV2(raw_data, 6100, '繼續營業單位稅前淨利（淨損）');
                            if (!profitArr) {
                                profitArr = getParameterV2(raw_data, 61001, '繼續營業單位稅前淨利（淨損）');
                                if (!profitArr) {
                                    profitArr = getParameterV2(raw_data, 62000, '繼續營業單位稅前淨利（淨損）');
                                    if (!profitArr) {
                                        profitArr = getParameterV2(raw_data, 61000, '繼續營業單位稅前淨利（淨損）');
                                        if (!profitArr) {
                                            return handleError(new HoError('cannot find stock profit'));
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
                                        return handleError(new HoError('cannot find stock equity'));
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
                                            netValue = getParameterV2(raw_data, '3XXX', '權益總額');
                                            if (!netValue) {
                                                return handleError(new HoError('cannot find stock net value'));
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
    },
    getSingleStock: function(type, index, stage=0) {
        const date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let quarter = 3;
        if (month < 4) {
            quarter = 4;
            year-- ;
        } else if (month < 7) {
            quarter = 1;
        } else if (month < 10) {
            quarter = 2;
        }
        let latestQuarter = 0;
        let latestYear = 0;
        let cash = {};
        let asset = {};
        let sales = {};
        if (stage === 0) {
            return Mongo('find', STOCKDB, {_id: type}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('can not find stock!!!'));
                }
                cash = items[0].cash;
                asset = items[0].asset;
                sales = items[0].sales;
                const cashStatus = getCashStatus(cash, asset);
                const salesStatus = getSalesStatus(sales, asset);
                let earliestYear = 0;
                let earliestQuarter = 0;
                for (let i in cashStatus) {
                    if (!earliestYear) {
                        earliestYear = Number(i);
                    }
                    latestYear = Number(i);
                    for (let j in cashStatus[i]) {
                        if (cash[i][j]) {
                            if (!earliestQuarter) {
                                earliestQuarter = Number(j) + 1;
                            }
                            latestQuarter = Number(j) + 1;
                        }
                    }
                }
                StockTagTool.setLatest(items[0]._id, index).catch(err => handleError(err, 'Set latest'));
                return {
                    cash,
                    asset,
                    sales,
                    cashStatus,
                    assetStatus: getAssetStatus(asset),
                    salesStatus,
                    profitStatus: getProfitStatus(salesStatus, cashStatus, asset),
                    safetyStatus: getSafetyStatus(salesStatus, cashStatus, asset),
                    managementStatus: getManagementStatus(salesStatus, asset),
                    latestYear,
                    latestQuarter,
                    earliestYear,
                    earliestQuarter,
                    profitIndex: items[0].profitIndex,
                    managementIndex: items[0].managementIndex,
                    safetyIndex: items[0].safetyIndex,
                    stockName: `${items[0].type}${items[0].index}${items[0].name}`,
                };
            });
        } else {
            let id_db = null;
            let normal_tags = [];
            let is_start = false;
            let not = 0;
            let wait = 0;
            const recur_getTwseXml = () => {
                console.log(year);
                console.log(quarter);
                const final_stage = () => {
                    const cashStatus = getCashStatus(cash, asset);
                    const assetStatus = getAssetStatus(asset);
                    const salesStatus = getSalesStatus(sales, asset);
                    const profitStatus = getProfitStatus(salesStatus, cashStatus, asset);
                    const safetyStatus = getSafetyStatus(salesStatus, cashStatus, asset);
                    const managementStatus = getManagementStatus(salesStatus, asset);
                    let earliestYear = 0;
                    let earliestQuarter = 0;
                    for (let i in cashStatus) {
                        earliestYear = Number(i);
                        for (let j in cashStatus[i]) {
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
                    const profitIndex = getProfitIndex(profitStatus, earliestYear, latestYear);
                    const safetyIndex = getSafetyIndex(safetyStatus, earliestYear, latestYear);
                    const managementIndex = getManagementIndex(managementStatus, latestYear, latestQuarter);
                    return handleStockTag(type, index, latestYear, latestQuarter, assetStatus, cashStatus, safetyStatus, profitStatus, salesStatus, managementStatus).then(([name, tags]) => {
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
                            cash,
                            asset,
                            sales,
                            profitIndex,
                            safetyIndex,
                            managementIndex,
                            tags: normal_tags,
                            name,
                            stock_default,
                        }}).then(item => id_db) : Mongo('insert', STOCKDB, {
                            type,
                            index,
                            name,
                            cash,
                            asset,
                            sales,
                            profitIndex,
                            safetyIndex,
                            managementIndex,
                            //tags: normal_tags,
                            important: 0,
                            stock_default,
                        }).then(item => Mongo('update', STOCKDB, {_id: item[0]._id}, {$set: {tags: normal_tags}}).then(() => item[0]._id));
                        return retObj().then(id => ({
                            cash,
                            asset,
                            sales,
                            cashStatus,
                            assetStatus,
                            salesStatus,
                            profitStatus,
                            safetyStatus,
                            managementStatus,
                            latestYear,
                            latestQuarter,
                            earliestYear,
                            earliestQuarter,
                            profitIndex,
                            managementIndex,
                            safetyIndex,
                            stockName: `${type}${index}${name}`,
                            id,
                        }));
                    });
                }
                const xml_path = `/mnt/stock/${type}/${index}/${year}${quarter}.xml`;
                const parseXml = () => initXml(xml_path).then(xml => {
                    cash = getCashflow(xml, cash, is_start);
                    if (!cash) {
                        return handleError(new HoError('xml cash parse error!!!'));
                    }
                    asset = getAsset(xml, asset, is_start)
                    if (!asset) {
                        return handleError(new HoError('xml asset parse error!!!'));
                    }
                    sales = getSales(xml, sales, cash, is_start)
                    if (!sales) {
                        return handleError(new HoError('xml sales parse error!!!'));
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
                if (stage < 3 && is_start && FsExistsSync(xml_path) && FsStatSync(xml_path)['size'] >= 10000) {
                    console.log('exist');
                    if (stage < 2 && cash[year-1] && cash[year-1][quarter-1] && asset[year-1] && asset[year-1][quarter-1] && sales[year-1] && sales[year-1][quarter-1]) {
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
                    return getTwseXml(index, year, quarter, xml_path).catch(err => (err.code !== 'HPE_INVALID_CONSTANT') ? handleError(err) : Promise.resolve(err)).then(err => {
                        const filesize = err ? 0 : FsStatSync(xml_path)['size'];
                        console.log(filesize);
                        if (wait > 150000 || filesize === 350 || err) {
                            if (err) {
                                handleError(err, 'Get Twse Xml');
                            }
                            if (wait > 150000 || filesize === 350 || err.code === 'HPE_INVALID_CONSTANT') {
                                if (filesize === 350) {
                                    FsUnlinkSync(xml_path);
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
                                FsUnlinkSync(xml_path);
                                wait += 10000;
                                console.log(wait);
                                return new Promise((resolve, reject) => setTimeout(() => resolve(recur_getTwseXml()), wait));
                            } else {
                                console.log('ok');
                                return parseXml();
                            }
                        }
                    });
                }
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
                    if (stage < 2) {
                        cash = items[0].cash;
                        asset = items[0].asset;
                        sales = items[0].sales;
                    }
                }
                const mkfolder = folderPath => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
                return mkfolder(`/mnt/stock/${type}/${index}`).then(() => recur_getTwseXml());
            });
        }
    },
    getStockPERV2: function(id) {
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            const start = (items[0].latestQuarter === 0) ? `${items[0].latestYear - 1912}12` : `${items[0].latestYear - 1911}${completeZero(items[0].latestQuarter*3, 2)}`;
            return getStockPrice(items[0].type, items[0].index).then(price => {
                const per = (items[0].profit === 0) ? 0 : Math.round(price / items[0].profit * items[0].equity * 10) / 100;
                const pdr = (items[0].dividends === 0) ? 0 : Math.round(price / items[0].dividends * items[0].equity * 10) / 100;
                const pbr = (items[0].netValue === 0) ? 0 : Math.round(price / items[0].netValue * items[0].equity * 10) / 100;
                return [per, pdr, pbr, items[0].index, start];
            });
        });
    },
    getStockPER: function(id) {
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            const yearEPS = getEPS(items[0].sales);
            return (yearEPS.eps > 0) ? getStockPrice(items[0].type, items[0].index).then(price => [Math.ceil(price / yearEPS.eps * 1000) / 1000, items[0].index, yearEPS.start]) : [-Math.floor(-yearEPS.eps*1000)/1000, items[0].index, yearEPS.start];
        });
    },
    getStockYield: function(id) {
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            switch(items[0].type) {
                case 'twse':
                let count = 0;
                const getTable = index => Api('url', `https://mops.twse.com.tw/mops/web/ajax_t05st09?encodeURIComponent=1&step=1&firstin=1&off=1&keyword4=${items[0].index}&code1=&TYPEK2=&checkbtn=1&queryName=co_id&TYPEK=all&isnew=true&co_id=${items[0].index}`).then(raw_data => {
                    const table = findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'center')[0], 'table', 'hasBorder')[0];
                    if (!table) {
                        return handleError(new HoError('heavy query'));
                    }
                    return table;
                }).catch(err => {
                    if (err.name === 'HoError' && err.message === 'heavy query') {
                        console.log(count);
                        handleError(err, 'Stock yield');
                        if (++count > MAX_RETRY) {
                            return handleError(new HoError('twse yield fail'));
                        }
                        return new Promise((resolve, reject) => setTimeout(() => resolve(getTable(count + 1)), 60000));
                    } else {
                        return handleError(err);
                    }
                });
                return getTable(0).then(table => {
                    let dividends = 0;
                    findTag(findTag(table, 'tr', 'odd')[0], 'td').forEach(d => {
                        const t = findTag(d)[0];
                        if (t) {
                            const dMatch = t.match(/^\d+\.\d+/);
                            if (dMatch) {
                                dividends += Number(dMatch[0]);
                            }
                        }
                    });
                    console.log(dividends);
                    return getStockPrice(items[0].type, items[0].index).then(price => (dividends > 0) ? Math.ceil(price / dividends * 1000) / 1000 : 0);
                });
                default:
                return handleError(new HoError('stock type unknown!!!'));
            }
        });
    },
    getPredictPER: function(id, session, is_latest=false) {
        const date = new Date();
        let year = date.getFullYear() - 1911;
        let month = date.getMonth() + 1;
        let month_str = completeZero(month.toString(), 2);
        let latest_date = `${year}${month_str}`;
        console.log(year);
        console.log(month_str);
        return Mongo('find', STOCKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find stock!!!'));
            }
            switch(items[0].type) {
                case 'twse':
                StockTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
                return Redis('hgetall', `sales: ${items[0].type}${items[0].index}`).then(item => {
                    const getInit = () => item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                    return getInit();
                }).then(([raw_list, ret_obj, etime]) => {
                    let sales_data = null;
                    let sales_per = [];
                    let sales_num = [];
                    let sales_pre = [];
                    let start_month = '';
                    const rest_predict = index => {
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
                        if (index < 30 && sales_num.length < 24) {
                            return recur_mp(index+1);
                        }
                        let predict_index = 0;
                        if (sales_num.length < 6) {
                            predict_index = -9999;
                        } else {
                            const season_adjust = (start, end, list) => {
                                let year_sales = 0;
                                let previous_sales = 0;
                                let j = 0;
                                for (let i in sales_num) {
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
                                const year_diff = (year_sales - previous_sales) / (j * (j - 1) / 2);
                                let k = 0;
                                for (let i in sales_num) {
                                    if (i < start) {
                                        continue;
                                    }
                                    if (i > end) {
                                        break;
                                    }
                                    const expect = Math.round(previous_sales / j + year_diff * (j - 1 - i));
                                    list[k] = list[k] ? Math.round((list[k] + (sales_num[i] / expect - 1) * 100) / 2 * 10) / 10 : Math.round((sales_num[i] / expect - 1) * 1000) / 10;
                                    k++;
                                }
                                return {
                                    list: list,
                                    per: Math.round((year_sales / previous_sales - 1) * 1000) / 10,
                                };
                            }
                            const result = season_adjust(0, 11, []);
                            const year_per = result.per;
                            const season_list = season_adjust(12, 23, result.list).list;
                            const month_per = Math.round((sales_num[0] * (100 + season_list[0]) / (sales_num[1] * (100 + season_list[1])) - 1) * 1000) / 10;
                            const quarter_per = Math.round(((sales_num[0] * (100 + season_list[0]) + sales_num[1] * (100 + season_list[1]) + sales_num[2] * (100 + season_list[2])) / (sales_num[3] * (100 + season_list[3]) + sales_num[4] * (100 + season_list[4]) + sales_num[5] * (100 + season_list[5])) - 1) * 1000) / 10;
                            console.log(month_per);
                            console.log(quarter_per);
                            console.log(year_per);
                            predict_index = (month_per - quarter_per > 0) ? Math.pow(month_per - quarter_per, 2) : -Math.pow(month_per - quarter_per, 2);
                            predict_index = (month_per - year_per > 0) ? predict_index + Math.pow(month_per - year_per, 2) : predict_index - Math.pow(month_per - year_per, 2);
                            predict_index = (year_per - quarter_per > 0) ? predict_index + Math.pow(year_per - quarter_per, 2) : predict_index - Math.pow(year_per - quarter_per, 2);
                            predict_index = (predict_index > 0) ? Math.round(Math.sqrt(predict_index) * 10) / 10 : -Math.round(Math.sqrt(-predict_index) * 10) / 10;
                        }
                        console.log('done');
                        return Promise.resolve([sales_data, `${predict_index} ${start_month} ${sales_num.length}`]);
                    }
                    const recur_mp = index => {
                        if (raw_list && raw_list[year] && raw_list[year][month_str]) {
                            if (!start_month) {
                                start_month = `${year}${month_str}`;
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
                                pre: raw_list[year][month_str].pre,
                            };
                            return rest_predict(index);
                        } else {
                            let count = 0;
                            const getTable = () => Api('url', `https://mops.twse.com.tw/mops/web/ajax_t05st10_ifrs?encodeURIComponent=1&run=Y&step=0&yearmonth=${year}${month_str}&colorchg=&TYPEK=all&co_id=${items[0].index}&off=1&year=${year}&month=${month_str}&firstin=true`).then(raw_data => {
                                if (raw_data.length > 400) {
                                    const body = findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0];
                                    const table = findTag(body, 'table', 'hasBorder')[0];
                                    if (!table) {
                                        if (raw_data.match(/(資料庫中查無需求資料|外國發行人免申報本項資訊)/)) {
                                            return false;
                                        } else {
                                            return handleError(new HoError('heavy query'));
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
                                    return handleError(new HoError('heavy query'));
                                } else {
                                    return false;
                                }
                            }).catch(err => {
                                if (err.name === 'HoError' && err.message === 'heavy query') {
                                    console.log(count);
                                    handleError(err, 'Stock predict');
                                    if (++count > MAX_RETRY) {
                                        return handleError(new HoError('twse predict fail'));
                                    }
                                    return new Promise((resolve, reject) => setTimeout(() => resolve(getTable()), 60000));
                                } else {
                                    return handleError(err);
                                }
                            });
                            return getTable().then(table => {
                                if (table) {
                                    if (!start_month) {
                                        start_month = `${year}${month_str}`;
                                    }
                                    findTag(table, 'tr').forEach(t => {
                                        const th = findTag(t, 'th')[0];
                                        const td = findTag(t, 'td');
                                        const text = (th && td[0]) ? findTag(th)[0] : td[0] ? findTag(td[0])[0] : '';
                                        const number = (th && td[0]) ? findTag(td[0])[0] : td[0] ? findTag(td[1])[0] : '';
                                        switch(text) {
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
                                        pre: sales_pre[sales_pre.length - 1],
                                    };
                                }
                                return rest_predict(index);
                            });
                        }
                    }
                    const exGet = () => (etime === -1 || !etime || etime < (new Date().getTime()/1000)) ? recur_mp(0) : Promise.resolve([null, ret_obj]);
                    return exGet().then(([raw_list, ret_obj]) => {
                        if (raw_list) {
                            Redis('hmset', `sales: ${items[0].type}${items[0].index}`, {
                                raw_list: JSON.stringify(raw_list),
                                ret_obj,
                                etime: Math.round(new Date().getTime()/1000 + CACHE_EXPIRE),
                            }).catch(err => handleError(err, 'Redis'));
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
                return handleError(new HoError('stock type unknown!!!'));
            }
        });
    },
    getPredictPERWarp: function(id, session, is_latest=false) {
        if (stockPredicting) {
            return handleError(new HoError('there is another predict running'));
        }
        stockPredicting = true;
        return this.getPredictPER(id, session, is_latest).then(([result, index]) => {
            stockPredicting = false;
            return [result, index];
        }).catch(err => {
            stockPredicting = false;
            return handleError(err);
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
    getIntervalV2: function(id, session) {
        const date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
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
                    const getInit = () => item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                    return getInit();
                }).then(([raw_list, ret_obj, etime]) => {
                    let interval_data = null;
                    let start_month = '';
                    let max = 0;
                    let min = 0;
                    let raw_arr = [];
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
                        if (!is_stop && index < 70 && raw_arr.length <= 1150) {
                            return recur_mi(type, index);
                        }
                        console.log(max);
                        console.log(min);
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year][vol_month_str]; i--) {
                            min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
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
                        const loga = logArray(max, min);
                        //console.log(loga);
                        const calStair = (stair_start = 0) => {
                            const single_arr = [];
                            const final_arr = [];
                            for (let i = 0; i < 100; i++) {
                                final_arr[i] = 0;
                            }
                            let volsum = 0;
                            for (let i = stair_start; i < raw_arr.length; i++) {
                                let s = 0;
                                let e = 100;
                                for (let j = 0; j < 100; j++) {
                                    if (raw_arr[i].l >= loga.arr[j]) {
                                        s = j;
                                    }
                                    if (raw_arr[i].h <= loga.arr[j]) {
                                        e = j;
                                        break;
                                    }
                                }
                                volsum += raw_arr[i].v;
                                single_arr.push((raw_arr[i].h - raw_arr[i].l) / raw_arr[i].h * 100);
                                if ((e - s) === 0) {
                                    final_arr[s] += raw_arr[i].v;
                                } else {
                                    const v = raw_arr[i].v / (e - s);
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
                            const web = {
                                mid: Math.pow(1 + loga.diff, nd[3]) * min,
                                up: nd[4] - nd[3],
                                down: nd[3] - nd[2],
                                extrem: sort_arr[Math.round(sort_arr.length * NORMAL_DISTRIBUTION[NORMAL_DISTRIBUTION.length - 3] / 100) - 1] / 100,
                                single: loga.diff,
                            }
                            if ((1 + web.extrem) < (1 + TRADE_FEE) * (1 + TRADE_FEE)) {
                                web.extrem = sort_arr[Math.round(sort_arr.length * NORMAL_DISTRIBUTION[NORMAL_DISTRIBUTION.length - 2] / 100) - 1] / 100;
                                web.ds = 2;
                                if ((1 + web.extrem) < (1 + TRADE_FEE) * (1 + TRADE_FEE)) {
                                    return false;
                                }
                            }
                            const calWeb = () => {
                                const stair = Math.ceil(Math.log(1 + web.extrem) / Math.log(1 + web.single));
                                const upArray = [];
                                let up = stair;
                                while (up < web.up) {
                                    upArray.push(up);
                                    up += stair;
                                }
                                if ((up - web.up) < (stair / 2)) {
                                    upArray.push(web.up);
                                } else {
                                    if (upArray.length > 0) {
                                        upArray[upArray.length - 1] = web.up;
                                    } else {
                                        upArray.push(web.up);
                                    }
                                }
                                console.log(upArray);
                                const downArray = [];
                                let down = stair;
                                while (down < web.down) {
                                    downArray.push(down);
                                    down += stair;
                                }
                                if ((down - web.down) < (stair / 2)) {
                                    downArray.push(web.down);
                                } else {
                                    if (downArray.length > 0) {
                                        downArray[downArray.length - 1] = web.down;
                                    } else {
                                        downArray.push(web.down);
                                    }
                                }
                                console.log(downArray);
                                const result = [-web.mid];
                                let temp = web.mid;
                                upArray.forEach(v => result.splice(0, 0, temp * Math.pow(1 + web.single, v)));
                                temp = result[0];
                                result[0] = -result[0];
                                upArray.forEach(v => result.splice(0, 0, temp * Math.pow(1 + web.single, v)));
                                temp = result[0];
                                result[0] = -result[0];
                                upArray.forEach(v => result.splice(0, 0, temp * Math.pow(1 + web.single, v)));
                                result[0] = -result[0];
                                temp = web.mid;
                                downArray.forEach(v => result.push(temp / Math.pow(1 + web.single, v)));
                                temp = result[result.length - 1];
                                result[result.length - 1] = -result[result.length - 1];
                                downArray.forEach(v => result.push(temp / Math.pow(1 + web.single, v)));
                                temp = result[result.length - 1];
                                result[result.length - 1] = -result[result.length - 1];
                                downArray.forEach(v => result.push(temp / Math.pow(1 + web.single, v)));
                                result[result.length - 1] = -result[result.length - 1];
                                return result;
                            }
                            web.arr = calWeb();
                            console.log(web);
                            return web;
                        }
                        const web = calStair();
                        return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => {
                            console.log(item);
                            if (!web) {
                                return [interval_data, 'no profit'];
                            }
                            //update total
                            const restTest = () => {
                                let web1 = null;
                                if (raw_arr.length >= 250) {
                                    web1 = calStair(250);
                                }
                                let web2 = null;
                                if (raw_arr.length >= 500) {
                                    web2 = calStair(500);
                                }
                                let web3 = null;
                                if (raw_arr.length >= 750) {
                                    web3 = calStair(750);
                                }
                                return getStockPrice('twse', items[0].index).then(price => {
                                    let ret_str = '';
                                    let best_rate = 0;
                                    let lastest_type = 4;
                                    let lastest_rate = 0;
                                    let ret_str1 = '';
                                    let ret_str2 = '';
                                    let ret_str3 = '';
                                    let ret_str4 = '';
                                    let ret_str5 = '';
                                    let testResult1 = null;
                                    if (web1) {
                                        testResult1 = stockTest(raw_arr, web1, 4);
                                    }
                                    let testResult2 = null;
                                    if (web2) {
                                        testResult2 = stockTest(raw_arr, web2, 4, testResult1.start + 1);
                                    }
                                    let testResult3 = null;
                                    if (web3) {
                                        testResult3 = stockTest(raw_arr, web3, 4, testResult2.start + 1);
                                    }
                                    let testResult4 = null;
                                    if (web1) {
                                        testResult4 = stockTest(raw_arr, web1, 3);
                                    }
                                    let testResult5 = null;
                                    if (web2) {
                                        testResult5 = stockTest(raw_arr, web2, 3, testResult4.start + 1);
                                    }
                                    let testResult6 = null;
                                    if (web3) {
                                        testResult6 = stockTest(raw_arr, web3, 3, testResult5.start + 1);
                                    }
                                    let testResult7 = null;
                                    if (web1) {
                                        testResult7 = stockTest(raw_arr, web1, 2);
                                    }
                                    let testResult8 = null;
                                    if (web2) {
                                        testResult8 = stockTest(raw_arr, web2, 2, testResult7.start + 1);
                                    }
                                    let testResult9 = null;
                                    if (web3) {
                                        testResult9 = stockTest(raw_arr, web3, 2, testResult8.start + 1);
                                    }
                                    let testResult10 = null;
                                    if (web1) {
                                        testResult10 = stockTest(raw_arr, web1, 1);
                                    }
                                    let testResult11 = null;
                                    if (web2) {
                                        testResult11 = stockTest(raw_arr, web2, 1, testResult10.start + 1);
                                    }
                                    let testResult12 = null;
                                    if (web3) {
                                        testResult12 = stockTest(raw_arr, web3, 1, testResult11.start + 1);
                                    }
                                    let testResult13 = null;
                                    if (web1) {
                                        testResult13 = stockTest(raw_arr, web1, 5);
                                    }
                                    let testResult14 = null;
                                    if (web2) {
                                        testResult14 = stockTest(raw_arr, web2, 5, testResult13.start + 1);
                                    }
                                    let testResult15 = null;
                                    if (web3) {
                                        testResult15 = stockTest(raw_arr, web3, 5, testResult14.start + 1);
                                    }
                                    if (testResult1) {
                                        console.log('year1');
                                        console.log(testResult1.str);
                                        console.log(testResult4.str);
                                        console.log(testResult7.str);
                                        console.log(testResult10.str);
                                        console.log(testResult13.str);
                                    }
                                    if (testResult2) {
                                        console.log('year2');
                                        console.log(testResult2.str);
                                        console.log(testResult5.str);
                                        console.log(testResult8.str);
                                        console.log(testResult11.str);
                                        console.log(testResult14.str);
                                    }
                                    if (testResult3) {
                                        console.log('year3');
                                        console.log(testResult3.str);
                                        console.log(testResult6.str);
                                        console.log(testResult9.str);
                                        console.log(testResult12.str);
                                        console.log(testResult15.str);
                                    }
                                    if (testResult1) {
                                        const match = testResult1.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        let match1 = null;
                                        let match2 = null;
                                        if (testResult2) {
                                            match1 = testResult2.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        if (testResult3) {
                                            match2 = testResult3.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        let rate = 1;
                                        let real = 1;
                                        let count = 0;
                                        if (match && (match[3] !== '0' || match[5] !== '0' || match[6] !== '0')) {
                                            rate = rate * (Number(match[3]) + 100) / 100;
                                            lastest_rate = rate;
                                            real = real * (Number(match[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match1 && (match1[3] !== '0' || match1[5] !== '0' || match1[6] !== '0')) {
                                            rate = rate * (Number(match1[3]) + 100) / 100;
                                            real = real * (Number(match1[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match2 && (match2[3] !== '0' || match2[5] !== '0' || match2[6] !== '0')) {
                                            rate = rate * (Number(match2[3]) + 100) / 100;
                                            real = real * (Number(match2[4]) + 100) / 100;
                                            count++;
                                        }
                                        ret_str1 = `${Math.round((price - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}000`;
                                        if (count !== 0) {
                                            rate = Math.round(rate * 10000 - 10000) / 100;
                                            real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                            best_rate = rate;
                                            const times = Math.round((Number(match ? match[5] : 0) + Number(match1 ? match1[5] : 0) + Number(match2 ? match2[5] : 0)) / count * 100) / 100;
                                            const stoploss = Number(match ? match[6] : 0) + Number(match1 ? match1[6] : 0) + Number(match2 ? match2[6] : 0);
                                            ret_str1 += ` ${rate}% ${real}% ${times} ${stoploss} ${raw_arr.length} ${min_vol}`;
                                        } else {
                                            ret_str1 += ' no less than mid point';
                                        }
                                    } else {
                                        ret_str1 = 'less than a year';
                                    }
                                    ret_str = ret_str1;
                                    console.log(ret_str1);
                                    if (testResult4) {
                                        const match = testResult4.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        let match1 = null;
                                        let match2 = null;
                                        if (testResult5) {
                                            match1 = testResult5.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        if (testResult6) {
                                            match2 = testResult6.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        let rate = 1;
                                        let real = 1;
                                        let count = 0;
                                        if (match && (match[3] !== '0' || match[5] !== '0' || match[6] !== '0')) {
                                            rate = rate * (Number(match[3]) + 100) / 100;
                                            if (rate > lastest_rate) {
                                                lastest_rate = rate;
                                                lastest_type = 3;
                                            }
                                            real = real * (Number(match[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match1 && (match1[3] !== '0' || match1[5] !== '0' || match1[6] !== '0')) {
                                            rate = rate * (Number(match1[3]) + 100) / 100;
                                            real = real * (Number(match1[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match2 && (match2[3] !== '0' || match2[5] !== '0' || match2[6] !== '0')) {
                                            rate = rate * (Number(match2[3]) + 100) / 100;
                                            real = real * (Number(match2[4]) + 100) / 100;
                                            count++;
                                        }
                                        ret_str2 = `${Math.round((price - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}000`;
                                        if (count !== 0) {
                                            rate = Math.round(rate * 10000 - 10000) / 100;
                                            real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                            const times = Math.round((Number(match ? match[5] : 0) + Number(match1 ? match1[5] : 0) + Number(match2 ? match2[5] : 0)) / count * 100) / 100;
                                            const stoploss = Number(match ? match[6] : 0) + Number(match1 ? match1[6] : 0) + Number(match2 ? match2[6] : 0);
                                            ret_str2 += ` ${rate}% ${real}% ${times} ${stoploss} ${raw_arr.length} ${min_vol}`;
                                            if (rate > best_rate) {
                                                best_rate = rate;
                                                ret_str = ret_str2;
                                            }
                                        } else {
                                            ret_str2 += ' no less than mid point';
                                        }
                                    } else {
                                        ret_str2 = 'less than a year';
                                    }
                                    console.log(ret_str2);
                                    if (testResult7) {
                                        const match = testResult7.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        let match1 = null;
                                        let match2 = null;
                                        if (testResult8) {
                                            match1 = testResult8.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        if (testResult9) {
                                            match2 = testResult9.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        let rate = 1;
                                        let real = 1;
                                        let count = 0;
                                        if (match && (match[3] !== '0' || match[5] !== '0' || match[6] !== '0')) {
                                            rate = rate * (Number(match[3]) + 100) / 100;
                                            if (rate > lastest_rate) {
                                                lastest_rate = rate;
                                                lastest_type = 2;
                                            }
                                            real = real * (Number(match[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match1 && (match1[3] !== '0' || match1[5] !== '0' || match1[6] !== '0')) {
                                            rate = rate * (Number(match1[3]) + 100) / 100;
                                            real = real * (Number(match1[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match2 && (match2[3] !== '0' || match2[5] !== '0' || match2[6] !== '0')) {
                                            rate = rate * (Number(match2[3]) + 100) / 100;
                                            real = real * (Number(match2[4]) + 100) / 100;
                                            count++;
                                        }
                                        ret_str3 = `${Math.round((price - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}000`;
                                        if (count !== 0) {
                                            rate = Math.round(rate * 10000 - 10000) / 100;
                                            real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                            const times = Math.round((Number(match ? match[5] : 0) + Number(match1 ? match1[5] : 0) + Number(match2 ? match2[5] : 0)) / count * 100) / 100;
                                            const stoploss = Number(match ? match[6] : 0) + Number(match1 ? match1[6] : 0) + Number(match2 ? match2[6] : 0);
                                            ret_str3 += ` ${rate}% ${real}% ${times} ${stoploss} ${raw_arr.length} ${min_vol}`;
                                            if (rate > best_rate) {
                                                best_rate = rate;
                                                ret_str = ret_str3;
                                            }
                                        } else {
                                            ret_str3 += ' no less than mid point';
                                        }
                                    } else {
                                        ret_str3 = 'less than a year';
                                    }
                                    console.log(ret_str3);
                                    if (testResult10) {
                                        const match = testResult10.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        let match1 = null;
                                        let match2 = null;
                                        if (testResult11) {
                                            match1 = testResult11.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        if (testResult12) {
                                            match2 = testResult12.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        let rate = 1;
                                        let real = 1;
                                        let count = 0;
                                        if (match && (match[3] !== '0' || match[5] !== '0' || match[6] !== '0')) {
                                            rate = rate * (Number(match[3]) + 100) / 100;
                                            real = real * (Number(match[4]) + 100) / 100;
                                            if (rate > lastest_rate) {
                                                lastest_rate = rate;
                                                lastest_type = 1;
                                            }
                                            count++;
                                        }
                                        if (match1 && (match1[3] !== '0' || match1[5] !== '0' || match1[6] !== '0')) {
                                            rate = rate * (Number(match1[3]) + 100) / 100;
                                            real = real * (Number(match1[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match2 && (match2[3] !== '0' || match2[5] !== '0' || match2[6] !== '0')) {
                                            rate = rate * (Number(match2[3]) + 100) / 100;
                                            real = real * (Number(match2[4]) + 100) / 100;
                                            count++;
                                        }
                                        ret_str4 = `${Math.round((price - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}000`;
                                        if (count !== 0) {
                                            rate = Math.round(rate * 10000 - 10000) / 100;
                                            real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                            const times = Math.round((Number(match ? match[5] : 0) + Number(match1 ? match1[5] : 0) + Number(match2 ? match2[5] : 0)) / count * 100) / 100;
                                            const stoploss = Number(match ? match[6] : 0) + Number(match1 ? match1[6] : 0) + Number(match2 ? match2[6] : 0);
                                            ret_str4 += ` ${rate}% ${real}% ${times} ${stoploss} ${raw_arr.length} ${min_vol}`;
                                            if (rate > best_rate) {
                                                best_rate = rate;
                                                ret_str = ret_str4;
                                            }
                                        } else {
                                            ret_str4 += ' no less than mid point';
                                        }
                                    } else {
                                        ret_str4 = 'less than a year';
                                    }
                                    console.log(ret_str4);
                                    if (testResult13) {
                                        const match = testResult13.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        let match1 = null;
                                        let match2 = null;
                                        if (testResult14) {
                                            match1 = testResult14.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        if (testResult15) {
                                            match2 = testResult15.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+)/);
                                        }
                                        let rate = 1;
                                        let real = 1;
                                        let count = 0;
                                        if (match && (match[3] !== '0' || match[5] !== '0' || match[6] !== '0')) {
                                            rate = rate * (Number(match[3]) + 100) / 100;
                                            if (rate > lastest_rate) {
                                                lastest_rate = rate;
                                                lastest_type = 5;
                                            }
                                            real = real * (Number(match[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match1 && (match1[3] !== '0' || match1[5] !== '0' || match1[6] !== '0')) {
                                            rate = rate * (Number(match1[3]) + 100) / 100;
                                            real = real * (Number(match1[4]) + 100) / 100;
                                            count++;
                                        }
                                        if (match2 && (match2[3] !== '0' || match2[5] !== '0' || match2[6] !== '0')) {
                                            rate = rate * (Number(match2[3]) + 100) / 100;
                                            real = real * (Number(match2[4]) + 100) / 100;
                                            count++;
                                        }
                                        ret_str5 = `${Math.round((price - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2)}000`;
                                        if (count !== 0) {
                                            rate = Math.round(rate * 10000 - 10000) / 100;
                                            real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                                            const times = Math.round((Number(match ? match[5] : 0) + Number(match1 ? match1[5] : 0) + Number(match2 ? match2[5] : 0)) / count * 100) / 100;
                                            const stoploss = Number(match ? match[6] : 0) + Number(match1 ? match1[6] : 0) + Number(match2 ? match2[6] : 0);
                                            ret_str5 += ` ${rate}% ${real}% ${times} ${stoploss} ${raw_arr.length} ${min_vol}`;
                                            if (rate > best_rate) {
                                                best_rate = rate;
                                                ret_str = ret_str5;
                                            }
                                        } else {
                                            ret_str5 += ' no less than mid point';
                                        }
                                    } else {
                                        ret_str5 = 'less than a year';
                                    }
                                    console.log(ret_str5);
                                    //amount real strategy times stoploss (no less than mid point)
                                    console.log('done');
                                    return [interval_data, ret_str, lastest_type];
                                });
                            }
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
                                        }}).then(() => recur_web(index + 1));
                                    }
                                }
                                return restTest().then(([result, index, type]) => {
                                    web.type = type;
                                    return Mongo('update', STOCKDB, {_id: id}, {$set: {web}}).then(item => recur_web(0, type).then(() => [result, index]));
                                });
                            });
                        })
                    }
                    const getTpexList = () => Api('url', `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${year - 1911}/${month_str}&stkno=${items[0].index}&_=${new Date().getTime()}`).then(raw_data => {
                        const json_data = getJson(raw_data);
                        if (json_data === false) {
                            return handleError(new HoError('json parse error!!!'));
                        }
                        let high = [];
                        let low = [];
                        let vol = [];
                        if (json_data && json_data['iTotalRecords'] > 0) {
                            for (let i of json_data['aaData']) {
                                high.push(Number(i[4].replace(/,/g, '')));
                                low.push(Number(i[5].replace(/,/g, '')));
                                vol.push(Number(i[8].replace(/,/g, '')));
                            }
                        }
                        return [2, {high, low, vol}];
                    });
                    const getTwseList = () => new Promise((resolve, reject) => setTimeout(() => resolve(), 5000)).then(() => Api('url', `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=${year}${month_str}01&stockNo=${items[0].index}`).then(raw_data => {
                        let high = [];
                        let low = [];
                        let vol = [];
                        if (raw_data.length > 200) {
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
                                    high.push(Number(tmp_list_1[4]));
                                    low.push(Number(tmp_list_1[5]));
                                    vol.push(Number(tmp_list_1[8]));
                                }
                            }
                            return [3, {high, low, vol}];
                        } else {
                            return [3, {high, low, vol}, true];
                        }
                    }));
                    const recur_mi = (type, index) => {
                        const getList = () => {
                            if (type === 2) {
                                return getTpexList();
                            } else if (type === 3) {
                                return getTwseList();
                            } else {
                                const getType = () => getTpexList().then(([type, list]) => (list.high.length > 0) ? [type, list] : getTwseList().then(([type, list]) => (list.high.length > 0) ? [type, list] : [1, list]));
                                return getType();
                            }
                        }
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
                                        raw_arr.push({
                                            h: list.high[i],
                                            l: list.low[i],
                                            v: list.vol[i],
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
                                        min: tmp_min,
                                    };
                                }
                                return rest_interval(type, index, is_stop);
                            });
                        }
                    }
                    const exGet = () => (etime === -1 || !etime || etime < (new Date().getTime()/1000)) ? recur_mi(1, 0) : Promise.resolve([null, ret_obj]);
                    return exGet().then(([raw_list, ret_obj]) => {
                        if (raw_list) {
                            Redis('hmset', `interval: ${items[0].type}${items[0].index}`, {
                                raw_list: JSON.stringify(raw_list),
                                ret_obj,
                                etime: Math.round(new Date().getTime()/1000 + CACHE_EXPIRE),
                            }).catch(err => handleError(err, 'Redis'));
                        }
                        return [ret_obj, items[0].index];
                    });
                });
                default:
                return handleError(new HoError('stock type unknown!!!'));
            }
        });
    },
    getInterval: function(id, session) {
        const date = new Date();
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
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
                    const getInit = () => item ? [JSON.parse(item.raw_list), item.ret_obj, item.etime] : [null, 0, -1];
                    return getInit();
                }).then(([raw_list, ret_obj, etime]) => {
                    let interval_data = null;
                    let start_month = '';
                    let max = 0;
                    let min = 0;
                    let raw_arr = [];
                    const group_interval = (level, gap, final_arr, sort_arr) => {
                        let group = [];
                        let start = 0;
                        let ig = 0;
                        level = level * 5;
                        for (let i in final_arr) {
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
                                            end: i - 1 - ig,
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
                                end: 99 - ig,
                            });
                        }
                        let group_num = 0;
                        let final_group = [];
                        for (let i of group) {
                            if (i.end - i.start > 33) {
                                for (let j of group) {
                                    if (j.end - j.start > 13) {
                                        final_group.push(j);
                                    }
                                }
                                return final_group;
                            } else if (i.end - i.start > 13) {
                                group_num++;
                                if (group_num > 2) {
                                    for (let j of group) {
                                        if (j.end - j.start > 13) {
                                            final_group.push(j);
                                        }
                                    }
                                    return final_group;
                                }
                            }
                        }
                        return false;
                    }
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
                        if (!is_stop && index < 70 && raw_arr.length <= 1150) {
                            return recur_mi(type, index);
                        }
                        console.log(max);
                        console.log(min);
                        let min_vol = 0;
                        for (let i = 12; (i > 0) && interval_data[vol_year][vol_month_str]; i--) {
                            min_vol = interval_data[vol_year][vol_month_str].raw.reduce((a,v) => (a && v.v > a) ? a: v.v, min_vol);
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
                        let final_arr = [];
                        for (let i = 0; i < 100; i++) {
                            final_arr[i] = 0;
                        }
                        const diff = (max - min) / 100;
                        for (let i of raw_arr) {
                            const e = Math.ceil((i.h - min) / diff);
                            const s = Math.floor((i.l - min) / diff);
                            for (let j = s; j < e; j++) {
                                final_arr[j] += i.v;
                            }
                        }
                        const sort_arr = [...final_arr].sort((a,b) => a - b);
                        let interval = null;
                        for (let i = 19; i > 0; i--) {
                            interval = group_interval(i, 5, final_arr, sort_arr);
                            if (interval) {
                                console.log(interval);
                                console.log(i);
                                break;
                            }
                        }
                        return getStockPrice('twse', items[0].index).then(price => {
                            let llow = Math.ceil(((interval[0].start - 1) * diff + min) * 100) / 100;
                            let lint = Math.abs(Math.ceil(llow / price * 100) - 100);
                            let fint = lint;
                            let ret_str = `${llow} -${Math.ceil((interval[0].end * diff + min) * 100) / 100}`;
                            for (let i = 1; i < interval.length; i++) {
                                llow = Math.ceil(((interval[i].start - 1) * diff + min) * 100) / 100;
                                lint = Math.abs(Math.ceil(llow / price * 100) - 100);
                                fint = lint < fint ? lint : fint;
                                ret_str = `${ret_str}, ${llow}-${Math.ceil((interval[i].end * diff + min) * 100) / 100}`;
                            }
                            ret_str = `${ret_str} ${start_month} ${raw_arr.length} ${min_vol} ${fint}`;
                            console.log('done');
                            return [interval_data, ret_str];
                        });
                    }
                    const getTpexList = () => Api('url', `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${year - 1911}/${month_str}&stkno=${items[0].index}&_=${new Date().getTime()}`).then(raw_data => {
                        const json_data = getJson(raw_data);
                        if (json_data === false) {
                            return handleError(new HoError('json parse error!!!'));
                        }
                        let high = [];
                        let low = [];
                        let vol = [];
                        if (json_data && json_data['iTotalRecords'] > 0) {
                            for (let i of json_data['aaData']) {
                                high.push(Number(i[4].replace(/,/g, '')));
                                low.push(Number(i[5].replace(/,/g, '')));
                                vol.push(Number(i[8].replace(/,/g, '')));
                            }
                        }
                        return [2, {high, low, vol}];
                    });
                    const getTwseList = () => new Promise((resolve, reject) => setTimeout(() => resolve(), 5000)).then(() => Api('url', `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=csv&date=${year}${month_str}01&stockNo=${items[0].index}`).then(raw_data => {
                        let high = [];
                        let low = [];
                        let vol = [];
                        if (raw_data.length > 200) {
                            const year_str = year - 1911;
                            const data_list = raw_data.match(new RegExp('"' + year_str + '\\/' + month_str + '.*', 'g'));
                            if (data_list && data_list.length > 0) {
                                console.log(data_list.length);
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
                                            for (let k = tmp_index; k <= j; k++) {
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
                                    high.push(Number(tmp_list_1[4]));
                                    low.push(Number(tmp_list_1[5]));
                                    vol.push(Number(tmp_list_1[8]));
                                }
                            }
                            return [3, {high, low, vol}];
                        } else {
                            return [3, {high, low, vol}, true];
                        }
                    }));
                    const recur_mi = (type, index) => {
                        const getList = () => {
                            if (type === 2) {
                                return getTpexList();
                            } else if (type === 3) {
                                return getTwseList();
                            } else {
                                const getType = () => getTpexList().then(([type, list]) => (list.high.length > 0) ? [type, list] : getTwseList().then(([type, list]) => (list.high.length > 0) ? [type, list] : [1, list]));
                                return getType();
                            }
                        }
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
                                        raw_arr.push({
                                            h: list.high[i],
                                            l: list.low[i],
                                            v: list.vol[i],
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
                                        min: tmp_min,
                                    };
                                }
                                return rest_interval(type, index, is_stop);
                            });
                        }
                    }
                    const exGet = () => (etime === -1 || !etime || etime < (new Date().getTime()/1000)) ? recur_mi(1, 0) : Promise.resolve([null, ret_obj]);
                    return exGet().then(([raw_list, ret_obj]) => {
                        if (raw_list) {
                            Redis('hmset', `interval: ${items[0].type}${items[0].index}`, {
                                raw_list: JSON.stringify(raw_list),
                                ret_obj,
                                etime: Math.round(new Date().getTime()/1000 + CACHE_EXPIRE),
                            }).catch(err => handleError(err, 'Redis'));
                        }
                        return [ret_obj, items[0].index];
                    });
                });
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
    stockFilterV3: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        const web = option ? true : false;
        if (!option) {
            option = STOCK_FILTER;
        }
        let last = false;
        let queried = 0;
        let filterList = [];
        const clearName = () => StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, STOCK_FILTER_LIMIT).then(result => {
            const delFilter = index => (index < result.items.length) ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(del_result => {
                sendWs({
                    type: 'stock',
                    data: del_result.id,
                }, 0, 1);
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${result.items[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => delFilter(index+1)) : Promise.resolve(result.items.length);
            return delFilter(0);
        });
        const recur_query = () => StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, STOCK_FILTER_LIMIT).then(result => {
            console.log(queried);
            if (result.items.length < STOCK_FILTER_LIMIT) {
                last = true;
            }
            queried += result.items.length;
            if (result.items.length < 1) {
                return filterList;
            }
            let first_stage = [];
            result.items.forEach(i => {
                const eok = option.per ? ((option.per[1] === '>' && i.per > option.per[2]) || (option.per[1] === '<' && i.per < option.per[2])) ? true : false : true;
                const dok = option.pdr ? ((option.pdr[1] === '>' && i.pdr > option.pdr[2]) || (option.pdr[1] === '<' && i.pdr < option.pdr[2])) ? true : false : true;
                const bok = option.pbr ? ((option.pbr[1] === '>' && i.pbr > option.pbr[2]) || (option.pbr[1] === '<' && i.pbr < option.pbr[2])) ? true : false : true;
                if (eok && dok && bok) {
                    first_stage.push(i);
                }
            });
            if (first_stage.length < 1) {
                return filterList;
            }
            const recur_per = index => {
                const nextFilter = () => {
                    index++;
                    if (index < first_stage.length) {
                        return recur_per(index);
                    }
                    if (!last) {
                        return recur_query();
                    }
                    return filterList;
                }
                const addFilter = () => {
                    filterList.push(first_stage[index]);
                    if (filterList.length >= STOCK_FILTER_LIMIT) {
                        return filterList;
                    }
                    return nextFilter();
                };
                return addFilter();
            }
            return recur_per(0);
        });
        return clearName().then(() => recur_query()).then(filterList => {
            let filterList1 = [];
            const stage3 = iIndex => (iIndex < filterList.length) ? this.getIntervalWarp(filterList[iIndex]._id, session).then(([result, index]) => {
                console.log(filterList[iIndex].name);
                console.log(result);
                const intervalVal = result.match(/(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\-?\d+\.?\d*) (\d+) (\d+) (\d+)$/);
                if (intervalVal) {
                    const cok = option.close ? ((option.close[1] === '>' && intervalVal[1] > option.close[2]) || (option.close[1] === '<' && intervalVal[1] < option.close[2])) ? true : false : true;
                    const pok = option.profit ? ((option.profit[1] === '>' && intervalVal[3] > option.profit[2]) || (option.profit[1] === '<' && intervalVal[3] < option.profit[2])) ? true : false : true;
                    const gok = option.gap ? ((option.gap[1] === '>' && intervalVal[4] > option.gap[2]) || (option.gap[1] === '<' && intervalVal[4] < option.gap[2])) ? true : false : true;
                    const tok = option.times ? ((option.times[1] === '>' && intervalVal[5] > option.times[2]) || (option.times[1] === '<' && intervalVal[5] < option.times[2])) ? true : false : true;
                    const sok = option.stop ? ((option.stop[1] === '>' && intervalVal[6] > option.stop[2]) || (option.stop[1] === '<' && intervalVal[6] < option.stop[2])) ? true : false : true;
                    const iok = option.interval ? ((option.interval[1] === '>' && intervalVal[7] > option.interval[2]) || (option.interval[1] === '<' && intervalVal[7] < option.interval[2])) ? true : false : true;
                    const vok = option.vol ? ((option.vol[1] === '>' && intervalVal[8] > option.vol[2]) || (option.vol[1] === '<' && intervalVal[8] < option.vol[2])) ? true : false : true;
                    if (iok && vok && cok && pok && gok && tok && sok) {
                        filterList1.push(filterList[iIndex]);
                    }
                }
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => stage3(iIndex + 1)) : Promise.resolve();
            console.log('stage three');
            return (option.interval || option.vol || option.close) ? stage3(0).then(() => filterList1) : filterList;
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
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => addFilter(index+1)) : Promise.resolve(filterList);
            return addFilter(0);
        });
    },
    stockFilterV2: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        const web = option ? true : false;
        if (!option) {
            option = STOCK_FILTER;
        }
        let last = false;
        let queried = 0;
        let filterList = [];
        const clearName = () => StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, STOCK_FILTER_LIMIT).then(result => {
            const delFilter = index => (index < result.items.length) ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(del_result => {
                sendWs({
                    type: 'stock',
                    data: del_result.id,
                }, 0, 1);
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${result.items[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => delFilter(index+1)) : Promise.resolve(result.items.length);
            return delFilter(0);
        });
        const recur_query = () => StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, STOCK_FILTER_LIMIT).then(result => {
            console.log(queried);
            if (result.items.length < STOCK_FILTER_LIMIT) {
                last = true;
            }
            queried += result.items.length;
            if (result.items.length < 1) {
                return filterList;
            }
            let first_stage = [];
            result.items.forEach(i => {
                const eok = option.per ? ((option.per[1] === '>' && i.per > option.per[2]) || (option.per[1] === '<' && i.per < option.per[2])) ? true : false : true;
                const dok = option.pdr ? ((option.pdr[1] === '>' && i.pdr > option.pdr[2]) || (option.pdr[1] === '<' && i.pdr < option.pdr[2])) ? true : false : true;
                const bok = option.pbr ? ((option.pbr[1] === '>' && i.pbr > option.pbr[2]) || (option.pbr[1] === '<' && i.pbr < option.pbr[2])) ? true : false : true;
                if (eok && dok && bok) {
                    first_stage.push(i);
                }
            });
            if (first_stage.length < 1) {
                return filterList;
            }
            const recur_per = index => {
                const nextFilter = () => {
                    index++;
                    if (index < first_stage.length) {
                        return recur_per(index);
                    }
                    if (!last) {
                        return recur_query();
                    }
                    return filterList;
                }
                const addFilter = () => {
                    filterList.push(first_stage[index]);
                    if (filterList.length >= STOCK_FILTER_LIMIT) {
                        return filterList;
                    }
                    return nextFilter();
                };
                return addFilter();
            }
            return recur_per(0);
        });
        return clearName().then(() => recur_query()).then(filterList => {
            let filterList1 = [];
            const stage2 = pIndex => (pIndex < filterList.length) ? this.getPredictPERWarp(filterList[pIndex]._id, session, true).then(([result, index]) => {
                console.log(filterList[pIndex].name);
                console.log(result);
                const predictVal = result.match(/^-?\d+.?\d+/);
                if (predictVal && (option.pre[1] === '>' && predictVal[0] > option.pre[2]) || (option.pre[1] === '<' && predictVal[0] < option.pre[2])) {
                    filterList1.push(filterList[pIndex]);
                }
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[pIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => stage2(pIndex + 1)) : Promise.resolve();
            console.log('stage two');
            return option.pre ? stage2(0).then(() => filterList1) : filterList;
        }).then(filterList => {
            let filterList1 = [];
            const stage3 = iIndex => (iIndex < filterList.length) ? this.getIntervalWarp(filterList[iIndex]._id, session).then(([result, index]) => {
                console.log(filterList[iIndex].name);
                console.log(result);
                const intervalVal = result.match(/(\d+) (\d+) (\d+)$/);
                if (intervalVal) {
                    const iok = option.interval ? ((option.interval[1] === '>' && intervalVal[1] > option.interval[2]) || (option.interval[1] === '<' && intervalVal[1] < option.interval[2])) ? true : false : true;
                    const vok = option.vol ? ((option.vol[1] === '>' && intervalVal[2] > option.vol[2]) || (option.vol[1] === '<' && intervalVal[2] < option.vol[2])) ? true : false : true;
                    const cok = option.close ? ((option.close[1] === '>' && intervalVal[3] > option.close[2]) || (option.close[1] === '<' && intervalVal[3] < option.close[2])) ? true : false : true;
                    if (iok && vok && cok) {
                        filterList1.push(filterList[iIndex]);
                    }
                }
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => stage3(iIndex + 1)) : Promise.resolve();
            console.log('stage three');
            return (option.interval || option.vol || option.close) ? stage3(0).then(() => filterList1) : filterList;
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
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => addFilter(index+1)) : Promise.resolve(filterList);
            return addFilter(0);
        });
    },
    stockFilter: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        const web = option ? true : false;
        if (!option) {
            option = STOCK_FILTER;
        }
        let last = false;
        let queried = 0;
        let filterList = [];
        const clearName = () => StockTagTool.tagQuery(queried, option.name, false, 0, option.sortName, option.sortType, user, {}, STOCK_FILTER_LIMIT).then(result => {
            const delFilter = index => (index < result.items.length) ? StockTagTool.delTag(result.items[index]._id, option.name, user).then(del_result => {
                sendWs({
                    type: 'stock',
                    data: del_result.id,
                }, 0, 1);
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${result.items[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => delFilter(index+1)) : Promise.resolve(result.items.length);
            return delFilter(0);
        });
        const recur_query = () => StockTagTool.tagQuery(queried, '', false, 0, option.sortName, option.sortType, user, session, STOCK_FILTER_LIMIT).then(result => {
            console.log(queried);
            if (result.items.length < STOCK_FILTER_LIMIT) {
                last = true;
            }
            queried += result.items.length;
            if (result.items.length < 1) {
                return filterList;
            }
            let first_stage = [];
            result.items.forEach(i => {
                const pok = option.pp ? ((option.pp[1] === '>' && i.profitIndex > option.pp[2]) || (option.pp[1] === '<' && i.profitIndex < option.pp[2])) ? true : false : true;
                const sok = option.ss ? ((option.ss[1] === '>' && i.safetyIndex > option.ss[2]) || (option.ss[1] === '<' && i.safetyIndex < option.ss[2])) ? true : false : true;
                const mok = option.mm ? ((option.mm[1] === '>' && i.managementIndex > option.mm[2]) || (option.mm[1] === '<' && i.managementIndex < option.mm[2])) ? true : false : true;
                if (pok && sok && mok) {
                    first_stage.push(i);
                }
            });
            if (first_stage.length < 1) {
                return filterList;
            }
            const recur_per = index => {
                const nextFilter = () => {
                    index++;
                    if (index < first_stage.length) {
                        return recur_per(index);
                    }
                    if (!last) {
                        return recur_query();
                    }
                    return filterList;
                }
                const addFilter = () => {
                    filterList.push(first_stage[index]);
                    if (filterList.length >= STOCK_FILTER_LIMIT) {
                        return filterList;
                    }
                    return nextFilter();
                };
                if (option.per) {
                    return this.getStockPER(first_stage[index]._id).then(([stockPer]) => {
                        if (option.per && stockPer > 0 && ((option.per[1] === '>' && stockPer > (option.per[2] * 2 / 3)) || (option.per[1] === '<' && stockPer < (option.per[2] * 4 /3)))) {
                            console.log(stockPer);
                            console.log(first_stage[index].name);
                            if (option.yieldNumber) {
                                return this.getStockYield(first_stage[index]._id).then(stockYield => {
                                    if (option.yieldNumber && stockYield > 0 && ((option.yieldNumber[1] === '>' && stockYield > (option.yieldNumber[2] * 2 / 3)) || (option.yieldNumber[1] === '<' && stockYield < (option.yieldNumber[2] * 4 /3)))) {
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
                    }).catch(err => {
                        if (web) {
                            sendWs({
                                type: user.username,
                                data: `Filter ${option.name}: ${first_stage[index].index} Error`,
                            }, 0);
                        }
                        handleError(err, 'Stock filter');
                        return nextFilter();
                    });
                } else if (option.yieldNumber) {
                    return this.getStockYield(first_stage[index]._id).then(stockYield => {
                        if (option.yieldNumber && stockYield > 0 && ((option.yieldNumber[1] === '>' && stockYield > (option.yieldNumber[2] * 2 / 3)) || (option.yieldNumber[1] === '<' && stockYield < (option.yieldNumber[2] * 4 /3)))) {
                            console.log(stockYield);
                            console.log(first_stage[index].name);
                            return addFilter();
                        } else {
                            return nextFilter();
                        }
                    }).catch(err => {
                        if (web) {
                            sendWs({
                                type: user.username,
                                data: `Filter ${option.name}: ${first_stage[index].index} Error`,
                            }, 0);
                        }
                        handleError(err, 'Stock filter');
                        return nextFilter();
                    });
                } else {
                    return addFilter();
                }
            }
            return recur_per(0);
        });
        return clearName().then(() => recur_query()).then(filterList => {
            let filterList1 = [];
            const stage2 = pIndex => (pIndex < filterList.length) ? this.getPredictPERWarp(filterList[pIndex]._id, session, true).then(([result, index]) => {
                console.log(filterList[pIndex].name);
                console.log(result);
                const predictVal = result.match(/^-?\d+.?\d+/);
                if (predictVal && (option.pre[1] === '>' && predictVal[0] > option.pre[2]) || (option.pre[1] === '<' && predictVal[0] < option.pre[2])) {
                    filterList1.push(filterList[pIndex]);
                }
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[pIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => stage2(pIndex + 1)) : Promise.resolve();
            console.log('stage two');
            return option.pre ? stage2(0).then(() => filterList1) : filterList;
        }).then(filterList => {
            let filterList1 = [];
            const stage3 = iIndex => (iIndex < filterList.length) ? this.getIntervalWarp(filterList[iIndex]._id, session).then(([result, index]) => {
                console.log(filterList[iIndex].name);
                console.log(result);
                const intervalVal = result.match(/(\d+) (\d+) (\d+)$/);
                if (intervalVal) {
                    const iok = option.interval ? ((option.interval[1] === '>' && intervalVal[1] > option.interval[2]) || (option.interval[1] === '<' && intervalVal[1] < option.interval[2])) ? true : false : true;
                    const vok = option.vol ? ((option.vol[1] === '>' && intervalVal[2] > option.vol[2]) || (option.vol[1] === '<' && intervalVal[2] < option.vol[2])) ? true : false : true;
                    const cok = option.close ? ((option.close[1] === '>' && intervalVal[3] > option.close[2]) || (option.close[1] === '<' && intervalVal[3] < option.close[2])) ? true : false : true;
                    if (iok && vok && cok) {
                        filterList1.push(filterList[iIndex]);
                    }
                }
            }).catch(err => {
                if (web) {
                    sendWs({
                        type: user.username,
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => stage3(iIndex + 1)) : Promise.resolve();
            console.log('stage three');
            return (option.interval || option.vol || option.close) ? stage3(0).then(() => filterList1) : filterList;
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
                        data: `Filter ${option.name}: ${filterList[iIndex].index} Error`,
                    }, 0);
                }
                handleError(err, 'Stock filter');
            }).then(() => addFilter(index+1)) : Promise.resolve(filterList);
            return addFilter(0);
        });
    },
    stockFilterWarp: function(option=null, user={_id:'000000000000000000000000'}, session={}) {
        if (stockFiltering) {
            return handleError(new HoError('there is another filter running'));
        }
        stockFiltering = true;
        return this.stockFilterV3(option, user, session).then(list => {
            stockFiltering = false;
            const number = list.length;
            console.log(`End: ${number}`);
            sendWs(`stock filter: ${number}`, 0, 0, true);
            if (number > 0) {
                sendWs(list.reduce((a, v) => `${a} ${v.name}`, ''), 0, 0, true);
            }
            return number;
        }).catch(err => {
            stockFiltering = false;
            return handleError(err);
        });
    },
    getStockTotal: function(user) {
        return Mongo('find', TOTALDB, {owner: user._id}).then(items => {
            if (items.length < 1) {
                //new user
                return Mongo('insert', TOTALDB, {
                    owner: user._id,
                    index: 0,
                    name: '投資部位',
                    type: 'total',
                    amount: 0,
                    count: 1,
                }).then(item => ({
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
                            str: '',
                        }],
                }));
            }
            let remain = 0;
            let totalName = '';
            let totalType = '';
            let profit = 0;
            let totalPrice = 0;
            //let plus = 0;
            //let minus = 0;
            const stock = [];
            const getStock = v => {
                if (v.name === '投資部位' && v.type === 'total') {
                    remain = v.amount;
                    totalName = v.name;
                    totalType = v.type;
                    return Promise.resolve();
                } else {
                    return getStockPrice('twse', v.index).then(price => {
                        let current = price * v.count;
                        totalPrice += current;
                        let p = current + v.amount - v.orig;
                        profit += p;
                        //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                        //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                        //plus += p;
                        //minus += m;
                        stock.push({
                            name: v.name,
                            type: v.type,
                            //cost: v.cost,
                            price,
                            mid: v.mid,
                            count: v.count,
                            remain: Math.round(v.amount * 100) / 100,
                            profit: p,
                            //top: v.top,
                            //bottom: v.bottom,
                            //plus: p,
                            //minus: m,
                            current,
                            str: v.str ? v.str : '',
                        });
                    });
                }
            }
            const recurGet = index => {
                if (index >= items.length) {
                    stock.unshift({
                        name: totalName,
                        type: totalType,
                        profit,
                        price: totalPrice,
                        mid: 1,
                        remain: (totalPrice + remain > 0) ? `${Math.round(profit / (totalPrice + remain) * 10000) / 100}%` : '0%',
                        count: 1,
                        //plus: Math.floor(plus * 100) / 100,
                        //minus: Math.floor(minus * 100) / 100,
                        current: totalPrice,
                        str: '',
                    })
                    return {
                        remain: remain,
                        total: totalPrice + remain,
                        stock,
                    };
                } else {
                    return getStock(items[index]).then(() => recurGet(index + 1))
                }
            }
            return recurGet(0);
        });
    },
    updateStockTotal: function(user, info, real = false) {
        //remain 800 重設remain
        //delete 2330 刪除股票
        //2330 (-)0.5 增減張數
        //2330 5000 amount 新增股票(設定最大金額)
        //2330 2 450 重設cost
        //#2330 2 450 cost
        //#2330 300 220
        return Mongo('find', TOTALDB, {owner: user._id}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('No user data!!!'));
            }
            let remain = 0;
            let totalName = '';
            let totalType = '';
            let totalId = null;
            for (let v of items) {
                if (v.name === '投資部位' && v.type === 'total') {
                    remain = v.amount;
                    totalName = v.name;
                    totalType = v.type;
                    totalId = v._id;
                }
            }
            const updateTotal = {};
            const removeTotal = [];
            const single = v => {
                const cmd = v.match(/(\d+|remain|delete)\s+(\-?\d+\.?\d*)\s*(\d+|amount)?/)
                if (cmd) {
                    if (cmd[1] === 'remain') {
                        remain = +cmd[2];
                        updateTotal[totalId] = {amount: remain};
                    } else if (cmd[1] === 'delete') {
                        for (let i in items) {
                            if (cmd[2] === items[i].index) {
                                return getStockPrice('twse', items[i].index).then(price => {
                                    remain += (price * items[i].count * (1 - TRADE_FEE));
                                    updateTotal[totalId] = {amount: remain};
                                    if (items[i]._id) {
                                        removeTotal.push(items[i]._id);
                                    }
                                    items.splice(i, 1);
                                });
                                break;
                            }
                        }
                    } else {
                        let is_find = false;
                        for (let i in items) {
                            if (cmd[1] === items[i].index) {
                                is_find = true;
                                if (!cmd[3]) {
                                    const orig_count = items[i].count;
                                    items[i].count += +cmd[2];
                                    if (items[i].count < 0) {
                                        cmd[2] = -orig_count;
                                        items[i].count = 0;
                                    }
                                    return getStockPrice('twse', items[i].index).then(price => {
                                        const new_cost = (+cmd[2] > 0) ? price * +cmd[2] : (1 - TRADE_FEE) * price * +cmd[2];
                                        items[i].amount -= new_cost;
                                        remain -= new_cost;
                                        updateTotal[totalId] = {amount: remain};
                                        items[i].privious = {
                                            price,
                                            time: Math.round(new Date().getTime() / 1000),
                                            type: (+cmd[2] > 0) ? 'buy' : 'sell',
                                        }
                                        if (items[i]._id) {
                                            if (updateTotal[items[i]._id]) {
                                                updateTotal[items[i]._id].count = items[i].count;
                                                updateTotal[items[i]._id].amount = items[i].amount;
                                                updateTotal[items[i]._id].privious = items[i].privious;
                                            } else {
                                                updateTotal[items[i]._id] = {count: items[i].count, amount: items[i].amount, privious: items[i].privious};
                                            }
                                        }
                                    });
                                } else if (cmd[3] === 'amount') {
                                    const newWeb = adjustWeb(items[i].web, items[i].mid, +cmd[2]);
                                    if (!newWeb) {
                                        return handleError(new HoError(`Amount need large than ${Math.ceil(items[i].mid * (items[i].web.length - 1) / 3)}`));
                                    }
                                    items[i].web = newWeb.arr;
                                    items[i].mid = newWeb.mid;
                                    items[i].times = newWeb.times;
                                    items[i].amount = items[i].amount + +cmd[2] - items[i].orig;
                                    items[i].orig = +cmd[2];
                                    if (items[i]._id) {
                                        if (updateTotal[items[i]._id]) {
                                            updateTotal[items[i]._id].web = items[i].web;
                                            updateTotal[items[i]._id].mid = items[i].mid;
                                            updateTotal[items[i]._id].times = items[i].times;
                                            updateTotal[items[i]._id].amount = items[i].amount;
                                            updateTotal[items[i]._id].orig = items[i].orig;
                                        } else {
                                            updateTotal[items[i]._id] = {
                                                web: items[i].web,
                                                mid: items[i].mid,
                                                times: items[i].times,
                                                amount: items[i].amount,
                                                orig: items[i].orig,
                                            };
                                        }
                                    }
                                } else if (+cmd[2] >= 0 && +cmd[3] >= 0) {
                                //} else if (cmd[4]) {
                                    items[i].count = +cmd[2];
                                    remain = remain + items[i].orig - items[i].amount - +cmd[3];
                                    items[i].amount = items[i].orig - +cmd[3];
                                    updateTotal[totalId] = {amount: remain};
                                    if (items[i]._id) {
                                        if (updateTotal[items[i]._id]) {
                                            updateTotal[items[i]._id].count = items[i].count;
                                            updateTotal[items[i]._id].amount = items[i].amount;
                                        } else {
                                            updateTotal[items[i]._id] = {count: items[i].count, amount: items[i].amount};
                                        }
                                    }
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
                                return Mongo('find', STOCKDB, {type: 'twse', index: cmd[1]}, {limit: 1}).then(item => {
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
                                    return getBasicStockData('twse', cmd[1]).then(basic => getStockPrice('twse', basic.stock_index).then(price => {
                                        console.log(basic);
                                        items.push({
                                            owner: user._id,
                                            index: basic.stock_index,
                                            name: `${basic.stock_index} ${basic.stock_name}`,
                                            type: basic.stock_class,
                                            //cost: 0,
                                            count: 0,
                                            web: newWeb.arr,
                                            wType: newWeb.type,
                                            mid: newWeb.mid,
                                            times: newWeb.times,
                                            amount: +cmd[2],
                                            orig: +cmd[2],
                                            //top: Math.floor(price * 1.2 * 100) / 100,
                                            //bottom: Math.floor(price * 0.95 * 100) / 100,
                                            price,
                                            //high: price,
                                        })
                                        //remain -= cost;
                                        //updateTotal[totalId] = {cost: remain};
                                    }));
                                });
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
                            }
                        }
                    }
                }
            }
            const updateReal = () => {
                console.log(updateTotal);
                console.log(removeTotal);
                console.log(remain);
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
                const recurRemove = index => (index >= removeTotal.length) ? rest() : Mongo('remove', TOTALDB, {_id: removeTotal[index], $isolated: 1}).then(() => recurRemove(index + 1));
                return real ? recurUpdate(0) : rest();
            }
            const rest = () => {
                let profit = 0;
                let totalPrice = 0;
                //let plus = 0;
                //let minus = 0;
                const stock = [];
                const getStock = v => {
                    if (v.name === '投資部位' && v.type === 'total') {
                        return Promise.resolve();
                    } else {
                        return getStockPrice('twse', v.index).then(price => {
                            let current = price * v.count;
                            totalPrice += current;
                            let p = current + v.amount - v.orig;
                            profit += p;
                            //const p = Math.floor((v.top * v.count - v.cost) * 100) / 100;
                            //const m = Math.floor((v.bottom * v.count - v.cost) * 100) / 100;
                            //plus += p;
                            //minus += m;
                            stock.push({
                                name: v.name,
                                type: v.type,
                                //cost: v.cost,
                                price,
                                mid: v.mid,
                                count: v.count,
                                remain: Math.round(v.amount * 100) / 100,
                                profit: p,
                                //top: v.top,
                                //bottom: v.bottom,
                                //plus: p,
                                //minus: m,
                                current,
                                str: v.str ? v.str : '',
                            });
                        });
                    }
                }
                const recurGet = index => {
                    if (index >= items.length) {
                        stock.unshift({
                            name: totalName,
                            type: totalType,
                            profit,
                            price: totalPrice,
                            mid: 1,
                            remain: (totalPrice + remain > 0) ? `${Math.round(profit / (totalPrice + remain) * 10000) / 100}%` : '0%',
                            count: 1,
                            //plus: Math.floor(plus * 100) / 100,
                            //minus: Math.floor(minus * 100) / 100,
                            current: totalPrice,
                            str: '',
                        })
                        return {
                            remain: remain,
                            total: totalPrice + remain,
                            stock,
                        };
                    } else {
                        return getStock(items[index]).then(() => recurGet(index + 1))
                    }
                }
                return recurGet(0);
            }
            const recur = index => (index >= info.length) ? updateReal() : Promise.resolve(single(info[index])).then(() => recur(index + 1));
            return recur(0);
        });
    },
}

//抓上市及上櫃
export const getStockList = (type, stocktype=0) => {
    switch(type) {
        case 'twse':
        //1: sii(odd) 2: sii(even)
        //3: otc(odd) 4: odd(even)
        const getList = stocktype => Api('url', `https://mops.twse.com.tw/mops/web/ajax_t51sb01?encodeURIComponent=1&step=1&firstin=1&code=&TYPEK=${(stocktype === 3 || stocktype  === 4) ? 'otc' : 'sii'}`).then(raw_data => {
            return findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[1], 'tr', (stocktype === 2 || stocktype === 4) ? 'even' : 'odd').map(t => findTag(findTag(t, 'td')[0])[0].match(/\d+/)[0]);
        });
        return stocktype ? getList(stocktype) : getList(1).then(list => getList(2).then(list2 => {
            list = list.concat(list2);
            return getList(3).then(list3 => {
                list = list.concat(list3);
                return getList(4).then(list4 => list.concat(list4));
            });
        }));
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

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
            const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
            return mkfolder().then(() => getTwseAnnual(index, cYear, filePath).then(filename => GoogleApi('upload', {
                type: 'auto',
                name: `${cYear}${getExtname(filename).ext}`,
                filePath,
                parent: annual_folder,
                rest: () => {
                    cYear--;
                    if (cYear > year - 5) {
                        return new Promise((resolve, reject) => setTimeout(() => resolve(recur_annual(cYear, annual_folder)), 5000));
                    }
                },
                errhandle: err => handleError(err),
            })).catch(err => {
                handleError(err, 'get annual');
                cYear--;
                if (cYear > year - 5) {
                    return new Promise((resolve, reject) => setTimeout(() => resolve(recur_annual(cYear, annual_folder)), 5000));
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

export const stockStatus = newStr => Mongo('find', TOTALDB, {}).then(items => {
    const recur_price = index => (index >= items.length) ? Promise.resolve() : (items[index].index === 0) ? recur_price(index + 1) : getStockPrice('twse', items[index].index).then(price => {
        if (price === 0) {
            return 0;
        }
        const item = items[index];
        const suggestion = stockProcess(price, item.web, item.times, item.previous, item.wType);
        console.log(item);
        console.log(suggestion.str);
        if (newStr && (!item.sent || item.sent !== new Date().getDay())) {
            item.sent = new Date().getDay();
            sendWs(`${item.name} ${suggestion.str}`, 0, 0, true);
        }
        if (suggestion.type === 2) {
            if (Math.abs(suggestion.buy - item.bCurrent) + item.bCurrent > (1 + TRADE_FEE) * (1 + TRADE_FEE) * item.bCurrent) {
                item.bTarget = item.bCurrent;
                item.bCurrent = suggestion.buy;
            }
        } else if (price > item.bTarget * 1.05) {
            item.bCurrent = 0;
            item.bTarget = 0;
        }
        if (suggestion.type === 4) {
            if (Math.abs(suggestion.sell - item.sCurrent) + item.sCurrent > (1 + TRADE_FEE) * (1 + TRADE_FEE) * item.sCurrent) {
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
        return Mongo('update', TOTALDB, {_id: item._id}, {$set : {
            price,
            str: suggestion.str,
            sent: item.sent,
            bTarget: item.bTarget,
            bCurrent: item.bCurrent,
            sTarget: item.sTarget,
            sCurrent: item.sCurrent,
        }});
    }).then(() => recur_price(index + 1));
    return recur_price(0);
});

export const stockShow = () => Mongo('find', TOTALDB, {}).then(items => {
    const recur_price = (index, ret) => (index >= items.length) ? Promise.resolve(ret) : (items[index].index === 0) ? recur_price(index + 1, ret) : getStockPrice('twse', items[index].index, false).then(price => `${ret}\n${items[index].name} ${price}`).then(ret => recur_price(index + 1, ret));
    return recur_price(0, '');
});

export const getStockListV2 = (type, year, month) => {
    switch(type) {
        case 'twse':
        let quarter = 3;
        if (month < 4) {
            quarter = 4;
        } else if (month < 7) {
            quarter = 1;
        } else if (month < 10) {
            quarter = 2;
        }
        return Api('url', 'https://mops.twse.com.tw/mops/web/ajax_t78sb04', {post: {
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
            const tables = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'table');
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
        });
        default:
        return handleError(new HoError('stock type unknown!!!'));
    }
}

const stockProcess = (price, priceArray, priceTimes, previous={}, pType = 4, now = Math.round(new Date().getTime() / 1000)) => {
    //const now = Math.round(new Date().getTime() / 1000);
    let is_buy = true;
    let is_sell = true;
    let bTimes = priceTimes ? priceTimes : 1;
    let sTimes = priceTimes ? priceTimes : 1;
    let bP = 8;
    let nowBP = priceArray.length - 1;
    //let tmpB = 0;
    for (; nowBP >= 0; nowBP--) {
        if (Math.abs(priceArray[nowBP]) * 1.001 >= price) {
            break;
        }
        if (priceArray[nowBP] < 0) {
            bP--;
        }
    }
    if (nowBP === priceArray.length - 1) {
    //if (bP > 6) {
        let newMid = 0;
        let count = 0;
        for (nowBP = priceArray.length - 1; nowBP >= 0; nowBP--) {
            if (priceArray[nowBP] < 0) {
                if (++count === 3) {
                    newMid = Math.abs(priceArray[nowBP]);
                    break;
                }
            }
        }
        return {
            resetWeb: true,
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
        if (Math.abs(priceArray[nowSP]) * 0.999 <= price) {
            break;
        }
        if (priceArray[nowSP] < 0) {
            sP++;
        }
    }
    if (nowSP === 0) {
    //if (sP < 2) {
        let newMid = 0;
        let count = 0;
        for (nowSP = 0; nowSP < priceArray.length; nowSP++) {
            if (priceArray[nowSP] < 0) {
                if (++count === 3) {
                    newMid = Math.abs(priceArray[nowSP]);
                    break;
                }
            }
        }
        return {
            resetWeb: true,
            newMid,
        }
    }
    if (previous.time) {
        if (previous.price >= price) {
            let previousP = priceArray.length - 1;
            let pP = 8;
            for (; previousP >= 0; previousP--) {
                if (Math.abs(priceArray[previousP]) * 1.001 >= previous.price) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP--;
                }
            }
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'buy') {
                if ((now - previous.time) >= ((nowBP - previousP + 1) * TRADE_INTERVAL)) {
                    is_buy = true;
                    bTimes = bTimes * (nowBP - previousP + 1);
                } else {
                    is_buy = false;
                }
            } else if (previous.type === 'sell') {
                if ((now - previous.time) >= TRADE_INTERVAL) {
                    is_sell = true;
                } else {
                    is_sell = false;
                }
            }
            previousP = 0;
            pP = 0;
            for (; previousP < priceArray.length; previousP++) {
                if (Math.abs(priceArray[previousP]) * 0.999 <= previous.price) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP++;
                }
            }
            nowSP = previousP;
            sP = pP;
        }
        if (previous.price < price) {
            let previousP = 0;
            let pP = 0;
            for (; previousP < priceArray.length; previousP++) {
                if (Math.abs(priceArray[previousP]) * 0.999 <= previous.price) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP++;
                }
            }
            //console.log(now);
            //console.log(previous.time);
            //console.log(nowSP);
            //console.log(nowBP);
            //console.log(previousP);
            if (previous.type === 'sell') {
                if ((now - previous.time) >= ((previousP - nowSP + 1) * TRADE_INTERVAL)) {
                    is_sell = true;
                    sTimes = sTimes * (previousP - nowSP + 1);
                } else {
                    is_sell = false;
                }
            } else if (previous.type === 'buy') {
                if ((now - previous.time) >= TRADE_INTERVAL) {
                    is_buy = true;
                } else {
                    is_buy = false;
                }
            }
            previousP = priceArray.length - 1;
            pP = 8;
            for (; previousP >= 0; previousP--) {
                if (Math.abs(priceArray[previousP]) * 1.001 >= previous.price) {
                    break;
                }
                if (priceArray[previousP] < 0) {
                    pP--;
                }
            }
            nowBP = previousP;
            bP = pP;
        }
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
    bCount = bTimes * bCount;
    sCount = sTimes * sCount;
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
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            bCount = bCount * 2;
            //buy = Math.round(tmpB * 100) / 100;
            str += `Buy 3/4 ${buy} ( ${bCount} ) `;
        } else if (bP > 5) {
            type = 3;
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            bCount = bCount * 2;
            str += `Buy 1/2 ${buy} ( ${bCount} ) `;
        } else if (bP > 4) {
            type = 7;
            //type = 3;
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            bCount = bCount * 2;
            str += `Buy 1/4 ${buy} ( ${bCount} ) `;
        } else {
            buy = Math.round(Math.abs(priceArray[nowBP + 1]) * 100) / 100;
            if (pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            str += `Buy ${buy} ( ${bCount} ) `;
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
            if (pType === 5 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            str += `Sell 3/4 ${sell} ( ${sCount} ) `;
        } else if (sP < 3) {
            type = 5;
            if (pType === 5 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            str += `Sell 1/2 ${sell} ( ${sCount} ) `;
        } else if (sP < 4) {
            type = 9;
            //type = 5;
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            if (pType === 5 || pType === 4) {
                sCount = sCount * 2;
            }
            str += `Sell 1/4 ${sell} ( ${sCount} ) `;
        } else {
            sell = Math.round(Math.abs(priceArray[nowSP - 1]) * 100) / 100;
            if (pType === 2 || pType === 4 || pType === 3) {
                sCount = sCount * 2;
            }
            str += `Sell ${sell} ( ${sCount} ) `;
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

const stockTest = (his_arr, web, pType = 1, start=0, len=250) => {
    const now = Math.round(new Date().getTime() / 1000);
    //let is_start = false;
    const maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
    let amount = maxAmount;
    let count = 0;
    let privious = {};
    let priviousTrade = {};
    //let maxCount = 0;
    let buyTrade = 0;
    let sellTrade = 0;
    let stopLoss = 0;
    let newMid = [];
    let newArr = [];
    let newPTrade = {};
    let price = 0;
    //console.log('stock test');
    //console.log(amount);
    //console.log(count);
    let startI = start + len - 1;
    for (; startI < his_arr.length - 1; startI++) {
        //if (his_arr[startI].h < web.mid * 0.9) {
        if (his_arr[startI].h < web.mid) {
            privious = his_arr[startI + 1];
            let tmpAmount = amount - maxAmount / 2;
            while ((tmpAmount - his_arr[startI + 1].h) > 0) {
                amount -= his_arr[startI + 1].h;
                tmpAmount = amount - maxAmount / 2;
                count++;
            }
            break;
        }
    }
    if (startI >= his_arr.length - 1) {
        return {
            str: `0% ${Math.ceil(maxAmount)} 0% 0% 0 0`,
            start: startI,
        }
    }
    console.log(startI);
    for (let i = startI; i > startI - len + 1; i--) {
        /*if (his_arr[i].l <= web.mid) {
            is_start = true;
            privious = his_arr[i + 1];
        }*/
        //if (is_start) {
            if (his_arr[i].h && his_arr[i].l && privious.h && privious.l) {
                const hh = privious.h - his_arr[i].h;
                const ll = his_arr[i].l - privious.l;
                if ((hh >= 0 && ll >= 0) || (hh <= 0 && ll <= 0)) {
                    price = (Math.abs(hh) > Math.abs(ll)) ? his_arr[i].h : his_arr[i].l;
                } else {
                    price = (hh < 0) ? his_arr[i].h : his_arr[i].l;
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
            let suggest = null;
            let checkMid = (newMid.length > 1) ? newMid[newMid.length - 2] : web.mid;
            while ((newMid.length > 0) && ((newMid[newMid.length - 1] > checkMid && price < checkMid) || (newMid[newMid.length - 1] <= checkMid && price > checkMid))) {
                newMid.pop();
                newPTrade = {};
                stopLoss--;
                newArr = web.arr.map(v => v * newMid[newMid.length - 1] / web.mid);
                checkMid = (newMid.length > 1) ? newMid[newMid.length - 2] : web.mid;
            }
            suggest = stockProcess(price, (newMid.length > 0) ? newArr : web.arr, web.times, (newMid.length > 0) ? newPTrade : priviousTrade, pType, now - (i * 86400));
            while(suggest.resetWeb) {
                //console.log(amount);
                //console.log(count);
                stopLoss++;
                newMid.push(suggest.newMid);
                newArr = web.arr.map(v => v * newMid[newMid.length - 1] / web.mid);
                suggest = stockProcess(price, (newMid.length > 0) ? newArr : web.arr, web.times, (newMid.length > 0) ? newPTrade : priviousTrade, pType, now - (i * 86400));
                //console.log(price);
                //console.log(suggest);
                //console.log(newArr);
            }
            //console.log(privious);
            //console.log(his_arr[i]);
            //console.log(his_arr[i - 1]);
            //console.log(price);
            //console.log(priviousTrade);
            //console.log(suggest);
            //console.log(suggest.str);
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
            } else*/ if (suggest.type === 7) {
                if (suggest.buy && (his_arr[i - 1].l <= suggest.buy)) {
                    for (let j = 0; j < suggest.bCount; j++) {
                        if ((amount - suggest.buy) <= 0) {
                            break;
                        } else {
                            amount -= suggest.buy;
                            count++;
                            priviousTrade = {
                                price: suggest.buy,
                                time: now - (i * 86400) + 3600,
                                type: 'buy',
                                win: 0,
                            }
                            buyTrade++;
                        }
                    }
                    let tmpAmount = amount - maxAmount * 3 / 4;
                    while ((tmpAmount - suggest.buy) > 0) {
                        amount -= suggest.buy;
                        tmpAmount = amount - maxAmount * 3 / 4;
                        count++;
                        priviousTrade = {
                            price: suggest.buy,
                            time: now - (i * 86400) + 3600,
                            type: 'buy',
                            win: 0,
                        }
                        buyTrade++;
                    }
                }
            } else if (suggest.type === 3) {
                if (suggest.buy && (his_arr[i - 1].l <= suggest.buy)) {
                    for (let j = 0; j < suggest.bCount; j++) {
                        if ((amount - suggest.buy) <= 0) {
                            break;
                        } else {
                            amount -= suggest.buy;
                            count++;
                            priviousTrade = {
                                price: suggest.buy,
                                time: now - (i * 86400) + 3600,
                                type: 'buy',
                                win: 0,
                            }
                            buyTrade++;
                        }
                    }
                    let tmpAmount = amount - maxAmount / 2;
                    while ((tmpAmount - suggest.buy) > 0) {
                        amount -= suggest.buy;
                        tmpAmount = amount - maxAmount / 2;
                        count++;
                        priviousTrade = {
                            price: suggest.buy,
                            time: now - (i * 86400) + 3600,
                            type: 'buy',
                            win: 0,
                        }
                        buyTrade++;
                    }
                }
            } else if (suggest.type === 6) {
                if (suggest.buy && (his_arr[i - 1].l <= suggest.buy)) {
                    for (let j = 0; j < suggest.bCount; j++) {
                        if ((amount - suggest.buy) <= 0) {
                            break;
                        } else {
                            amount -= suggest.buy;
                            count++;
                            priviousTrade = {
                                price: suggest.buy,
                                time: now - (i * 86400) + 3600,
                                type: 'buy',
                                win: 0,
                            }
                            buyTrade++;
                        }
                    }
                    let tmpAmount = amount - maxAmount / 4;
                    while ((tmpAmount - suggest.buy) > 0) {
                        amount -= suggest.buy;
                        tmpAmount = amount - maxAmount / 4;
                        count++;
                        priviousTrade = {
                            price: suggest.buy,
                            time: now - (i * 86400) + 3600,
                            type: 'buy',
                            win: 0,
                        }
                        buyTrade++;
                    }
                }
            } else if (suggest.buy && (his_arr[i - 1].l <= suggest.buy)) {
                for (let j = 0; j < suggest.bCount; j++) {
                    if ((amount - suggest.buy) <= 0) {
                        break;
                    } else {
                        amount -= suggest.buy;
                        count++;
                        priviousTrade = {
                            price: suggest.buy,
                            time: now - (i * 86400) + 3600,
                            type: 'buy',
                            win: 0,
                        }
                        buyTrade++;
                    }
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
                if ((count > 0) && suggest.sell && (his_arr[i - 1].h >= suggest.sell)) {
                    for (let j = 0; j < suggest.sCount; j++) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    let tmpAmount = maxAmount / 4 - amount;
                    while ((tmpAmount - suggest.sell * (1 - TRADE_FEE)) > 0) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        tmpAmount = maxAmount / 4 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    priviousTrade = {
                        price: suggest.sell,
                        time: now - (i * 86400) + 3600,
                        type: 'sell',
                        win: priviousTrade.win ? priviousTrade.win + 1 : 1,
                    }
                    //console.log(priviousTrade.win);
                }
            } else if (suggest.type === 5) {
                if ((count > 0) && suggest.sell && (his_arr[i - 1].h >= suggest.sell)) {
                    for (let j = 0; j < suggest.sCount; j++) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    let tmpAmount = maxAmount / 2 - amount;
                    while ((tmpAmount - suggest.sell * (1 - TRADE_FEE)) > 0) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        tmpAmount = maxAmount / 2 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    priviousTrade = {
                        price: suggest.sell,
                        time: now - (i * 86400) + 3600,
                        type: 'sell',
                        win: priviousTrade.win ? priviousTrade.win + 1 : 1,
                    }
                    //console.log(priviousTrade.win);
                }
            } else if (suggest.type === 8) {
                if ((count > 0) && suggest.sell && (his_arr[i - 1].h >= suggest.sell)) {
                    for (let j = 0; j < suggest.sCount; j++) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    let tmpAmount = maxAmount * 3 / 4 - amount;
                    while ((tmpAmount - suggest.sell * (1 - TRADE_FEE)) > 0) {
                        amount += (suggest.sell * (1 - TRADE_FEE));
                        tmpAmount = maxAmount * 3 / 4 - amount;
                        sellTrade++;
                        count--;
                        if (count <= 0) {
                            break;
                        }
                    }
                    priviousTrade = {
                        price: suggest.sell,
                        time: now - (i * 86400) + 3600,
                        type: 'sell',
                        win: priviousTrade.win ? priviousTrade.win + 1 : 1,
                    }
                    //console.log(priviousTrade.win);
                }
            } else if ((count > 0) && suggest.sell && (his_arr[i - 1].h >= suggest.sell)) {
                for (let j = 0; j < suggest.sCount; j++) {
                    amount += (suggest.sell * (1 - TRADE_FEE));
                    count--;
                    sellTrade++;
                    if (count <= 0) {
                        break;
                    }
                }
                priviousTrade = {
                    price: suggest.sell,
                    time: now - (i * 86400) + 3600,
                    type: 'sell',
                    win: priviousTrade.win ? priviousTrade.win + 1 : 1,
                }
                //console.log(priviousTrade.win);
            }
            //console.log(amount);
            //console.log(count);
            privious = his_arr[i];
        //}
    }
    console.log(amount);
    console.log(count);
    amount += (his_arr[startI - len + 1].l * count * (1 - TRADE_FEE));
    count = 0;
    //console.log('result');
    //console.log(amount);
    //console.log(maxAmount);
    //console.log(buyTrade);
    //console.log(sellTrade);
    //console.log(stopLoss);
    const str = `${Math.round((his_arr[startI].h - web.mid) / web.mid * 10000) / 100}% ${Math.ceil(maxAmount)} ${Math.round((amount / maxAmount - 1) * 10000) / 100}% ${his_arr[startI].l ? (Math.round((his_arr[startI - len + 1].h / his_arr[startI].l - 1) * 10000) / 100) : 0}% ${sellTrade} ${stopLoss}`;
    //const str = is_start ? `${Math.ceil(maxAmount)} ${Math.round((his_arr[start].h / his_arr[start + len - 1].l - 1) * 10000) / 100}% ${Math.round((amount / maxAmount - 1) * 10000) / 100}% ${sellTrade} ${stopLoss}` : `${Math.ceil(maxAmount)} ${Math.round((his_arr[start].h / his_arr[start + len - 1].l - 1) * 10000) / 100}% 0% 0 0`;
    return {
        str,
        start: startI,
    };
}

const logArray = (max, min, pos=100) => {
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

const adjustWeb = (webArr, webMid, amount = 0, force = false) => {
    if (amount === 0) {
        return {
            arr: webArr,
            mid: webMid,
        };
    }
    amount = amount;
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
    const ignore = Math.floor(maxAmount / (maxAmount - amount));
    let neg = 0;
    let mid = 0;
    for (; mid < webArr.length; mid++) {
        if (webArr[mid] < 0) {
            neg++;
        }
        if (neg === 4) {
            break;
        }
    }
    const new_arr = [];
    let count = 0;
    console.log(mid);
    for (let i = mid; i < webArr.length; i++) {
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
    for (let i = mid - 1; i >= 0; i--) {
        if (webArr[i] >= 0) {
            count++;
            if (count === ignore) {
                count = 0;
            } else {
                new_arr.splice(0, 0, webArr[i]);
            }
        } else {
            new_arr.splice(0, 0, webArr[i]);
        }
    }
    return {
        arr: webArr,
        mid: webMid,
    };
}
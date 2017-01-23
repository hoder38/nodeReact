import React from 'react'
import Chart from 'chart.js'
import Tooltip from './Tooltip'
import { api, killEvent } from '../utility'

function addCommas(nStr) {
    nStr += ''
    let x = nStr.split('.')
    let x1 = x[0]
    let x2 = x.length > 1 ? `.${x[1]}` : ''
    let rgx = /(\d+)(\d{3})/
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, `$1,$2`)
    }
    return `${x1}${x2}`
}

function getRandomColor() {
    let letters = '0123456789ABCDEF'.split('')
    let color = '#'
    for (let i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * 16)]
    }
    return color
}

const optionQuarter = [
    <option value={1} key={0}>One</option>,
    <option value={2} key={1}>Two</option>,
    <option value={3} key={2}>Three</option>,
    <option value={4} key={3}>Four</option>,
]

const StockInfo = React.createClass({
    getInitialState: function() {
        this._parse = null
        this._parseYear = []
        this._assetTotalCommas = 0
        this._asset = null
        this._asset2 = null
        this._salesCom = null
        this._salesTotalCommas = 0
        this._eps = 0
        this._sales = null
        this._cashAcc = null
        this._cash = null
        this._cash2 = null
        this._cash3 = null
        this._safety = null
        this._safetyIndex = 0
        this._profit = null
        this._profit2 = null
        this._profit3 = null
        this._profit4 = null
        this._profitIndex = 0
        this._management = null
        this._management2 = null
        this._managementIndex = 0
        this._managementRev = null
        this._managementPro = null
        this._managementCash = null
        this._managementInv = null
        this._managementRec = null
        this._managementPay = null
        return {
            assetStartYear: 2010,
            assetStartQuarter: 1,
            assetEndYear: 2010,
            assetEndQuarter: 1,
            salesYear: 2010,
            salesQuarter: 1,
            salesCom: true,
            cashStartYear: 2010,
            cashStartQuarter: 1,
            cashEndYear: 2010,
            cashEndQuarter: 1,
            cashMode: 4,
            cashAcc: false,
            safetyStartYear: 2010,
            safetyStartQuarter: 1,
            safetyEndYear: 2010,
            safetyEndQuarter: 1,
            safetyMode: 1,
            salesCom: true,
            profitStartYear: 2010,
            profitStartQuarter: 1,
            profitEndYear: 2010,
            profitEndQuarter: 1,
            profitMode: 1,
            managementStartYear: 2010,
            managementStartQuarter: 1,
            managementEndYear: 2010,
            managementEndQuarter: 1,
            managementMode: 2,
            managementRev: true,
            managementPro: true,
            managementCash: true,
            managementInv: true,
            managementRec: true,
            managementPay: true,
        }
    },
    componentWillMount: function() {
        api(`/api/stock/querySimple/${this.props.item.id}`).then(result => {
            if (result) {
                this._parse = result
                this._safetyIndex = result.safetyIndex
                this._profitIndex = result.profitIndex
                this._managementIndex = result.managementIndex
                this.props.setLatest(this.props.item.id, this.props.bookmark)
                for (let i = this._parse.earliestYear; i <= this._parse.latestYear; i++) {
                    this._parseYear.push(<option value={i} key={i}>{i}</option>)
                }
                this._drawAsset()
                this._drawSales(this.state.salesCom)
                this._drawCash(this.state.cashMode, this.state.cashAcc)
                this._drawSafety(this.state.safetyMode)
                this._drawProfit(this.state.profitMode)
                this._drawManagement(this.state.managementMode, this.state.managementRev, this.state.managementPro, this.state.managementCash, this.state.managementInv, this.state.managementRec, this.state.managementPay)
            } else {
                this.props.addalert('empty stock parse!!!')
            }
        }).catch(err => this.props.addalert(err))
    },
    componentWillUnmount: function() {
        if (this._asset) {
            this._asset.destroy()
        }
        if (this._asset2) {
            this._asset2.destroy()
        }
        if (this._sales) {
            this._sales.destroy()
        }
        if (this._cash) {
            this._cash.destroy()
        }
        if (this._cash2) {
            this._cash2.destroy()
        }
        if (this._cash3) {
            this._cash3.destroy()
        }
        if (this._safety) {
            this._safety.destroy()
        }
    },
    _caculateDate: function(year, quarter, is_start=false) {
        quarter = quarter ? quarter : is_start ? this._parse.earliestQuarter : this._parse.latestQuarter
        year = year ? year : is_start ? this._parse.earliestYear : this._parse.latestYear
        year = year > this._parse.latestYear ? this._parse.latestYear : year < this._parse.earliestYear ? this._parse.earliestYear : year
        quarter = quarter > 4 ? 4 : quarter < 1 ? 1 : quarter
        quarter = (year === this._parse.latestYear && quarter > this._parse.latestQuarter) ? this._parse.latestQuarter : (year === this._parse.earliestYear && quarter < this._parse.earliestQuarter) ? this._parse.earliestQuarter : quarter
        return {
            year,
            quarter,
        }
    },
    _drawAsset: function(startYear=null, startQuarter=null, endYear=null, endQuarter=null) {
        let assetStartDate = this._caculateDate(startYear, startQuarter)
        const assetEndDate = this._caculateDate(endYear, endQuarter)
        if (assetStartDate.year > assetEndDate.year) {
            assetStartDate.year = assetEndDate.year
        }
        assetStartDate = this._caculateDate(assetStartDate.year, assetStartDate.quarter)
        if (assetStartDate.year === assetEndDate.year && assetStartDate.quarter > assetEndDate.quarter) {
            assetStartDate.quarter = assetEndDate.quarter
        }
        let labels = []
        let data = []
        let backgroundColor = []
        this._assetTotalCommas = addCommas(this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1].total)
        if (this._asset) {
            this._asset.destroy()
        }
        if (this._asset2) {
            this._asset2.destroy()
        }
        const assetCompare = (assetStartDate.year !== assetEndDate.year || assetStartDate.quarter !== assetEndDate.quarter) ? true : false
        if (assetCompare) {
            let labels2 = []
            let data2 = []
            let backgroundColor2 = []
            const total_diff = this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1].total - this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1].total
            if (total_diff < 0) {
                labels.push('total_diff')
                data.push(Math.abs(total_diff))
                backgroundColor.push(getRandomColor())
                labels2.push('total_diff')
                data2.push(Math.abs(total_diff))
                backgroundColor2.push(getRandomColor())
            }
            let diff = new Map()
            for(let i in this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1]) {
                if (i !== 'total') {
                    const val = Math.ceil(this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1][i] * this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1].total / 100 - this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1][i] * this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1].total / 100)
                    diff.set(i, {
                        val: val,
                        per: Math.ceil(val / Math.abs(total_diff) * 1000) / 10,
                    })
                }
            }
            diff.forEach((v, i) => {
                if (v.val > 0) {
                    if (i === 'receivable' || i === 'cash' || i === 'inventories' || i === 'property' || i === 'longterm' || i === 'other') {
                        labels.push(`${i}:+${v.per}%`)
                        data.push(Math.abs(v.val))
                        backgroundColor.push(getRandomColor())
                    } else {
                        labels2.push(`${i}:+${v.per}%`)
                        data2.push(Math.abs(v.val))
                        backgroundColor2.push(getRandomColor())
                    }
                }
            })
            diff.forEach((v, i) => {
                if (v.val < 0) {
                    if (i === 'receivable' || i === 'cash' || i === 'inventories' || i === 'property' || i === 'longterm' || i === 'other') {
                        labels.push(`${i}:${v.per}%`)
                        data.push(Math.abs(v.val))
                        backgroundColor.push(getRandomColor())
                    } else {
                        labels2.push(`${i}:${v.per}%`)
                        data2.push(Math.abs(v.val))
                        backgroundColor2.push(getRandomColor())
                    }
                }
            })
            if (total_diff > 0) {
                labels.push('total_diff')
                data.push(Math.abs(total_diff))
                backgroundColor.push(getRandomColor())
                labels2.push('total_diff')
                data2.push(Math.abs(total_diff))
                backgroundColor2.push(getRandomColor())
            }
            const total_diff_percent = Math.ceil(total_diff/this._parse.assetStatus[assetStartDate.year][assetStartDate.quarter-1].total * 1000) / 10
            this._assetTotalCommas = total_diff > 0 ? `${this._assetTotalCommas}:+${total_diff_percent}%:+${addCommas(total_diff)}` : `${this._assetTotalCommas}:${total_diff_percent}%:${addCommas(total_diff)}`
            this._asset2 = new Chart(document.getElementById('assetCompare'), {
                type: 'pie',
                data: {
                    labels: labels2,
                    datasets: [{
                        data: data2,
                        backgroundColor: backgroundColor2,
                        hoverBackgroundColor: backgroundColor2,
                    }]
                },
                options: {
                    animation: {animateRotate: false},
                    legend: {display: false},
                },
            })
        } else {
            for (let i in this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1]) {
                if (i !== 'total') {
                    labels.push(`${i}:${this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1][i]}%`)
                    data.push(Math.abs(Math.ceil(this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1][i] * this._parse.assetStatus[assetEndDate.year][assetEndDate.quarter-1].total / 100)))
                    backgroundColor.push(getRandomColor())
                }
            }
        }
        this._asset = new Chart(document.getElementById('asset'), {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor,
                    hoverBackgroundColor: backgroundColor,
                }]
            },
            options: {
                animation: {animateRotate: false},
                legend: {display: false},
            },
        })
        this.setState(Object.assign({}, this.state, {
            assetStartYear: assetStartDate.year,
            assetStartQuarter: assetStartDate.quarter,
            assetEndYear: assetEndDate.year,
            assetEndQuarter: assetEndDate.quarter,
        }))
    },
    _drawSales: function(comprehensive, year=null, quarter=null) {
        let salesDate = this._caculateDate(year, quarter)
        let salesTotal = 0
        let labels = []
        let data = []
        let backgroundColor = []
        for(let i in this._parse.salesStatus[salesDate.year][salesDate.quarter-1]) {
            if (i === 'cost' || i === 'expenses') {
                labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                backgroundColor.push(getRandomColor())
            } else if (i === 'nonoperating_without_FC' || (i === 'comprehensive' && comprehensive)) {
                if (this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] < 0) {
                    labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                    data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                    backgroundColor.push(getRandomColor())
                }
            } else if (i === 'tax' || i === 'finance_cost') {
                if (this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] > 0) {
                    labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                    data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                    backgroundColor.push(getRandomColor())
                }
            } else if ((i === 'profit_comprehensive' && comprehensive) || (i === 'profit' && !comprehensive)) {
                labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                backgroundColor.push(getRandomColor())
            }
        }
        labels.push('revenue')
        data.push(Math.abs(this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue))
        backgroundColor.push(getRandomColor())
        for (let i in this._parse.salesStatus[salesDate.year][salesDate.quarter-1]) {
            if (i === 'nonoperating_without_FC' || (i === 'comprehensive' && comprehensive)) {
                if (this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] > 0) {
                    salesTotal += Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)
                    labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                    data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                    backgroundColor.push(getRandomColor())
                }
            } else if (i === 'tax' || i === 'finance_cost') {
                if (this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] < 0) {
                    salesTotal -= Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)
                    labels.push(`${i}:${this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i]}%`)
                    data.push(Math.abs(Math.ceil(this._parse.salesStatus[salesDate.year][salesDate.quarter-1][i] * this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue / 100)))
                    backgroundColor.push(getRandomColor())
                }
            }
        }
        salesTotal += this._parse.salesStatus[salesDate.year][salesDate.quarter-1].revenue
        this._salesTotalCommas = addCommas(salesTotal)
        this._eps = this._parse.salesStatus[salesDate.year][salesDate.quarter-1].quarterEPS
        if (this._sales) {
            this._sales.destroy()
        }
        this._sales = new Chart(document.getElementById('sales'), {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor,
                    hoverBackgroundColor: backgroundColor,
                }]
            },
            options: {
                animation: {animateRotate: false},
                legend: {display: false},
            },
        })
        this.setState(Object.assign({}, this.state, {
            salesYear: salesDate.year,
            salesQuarter: salesDate.quarter,
        }))
    },
    _drawCash: function(mode, accumulate, startYear=null, startQuarter=null, endYear=null, endQuarter=null) {
        const cashStartDate = this._caculateDate(startYear, startQuarter, true)
        let cashEndDate = this._caculateDate(endYear, endQuarter)
        if (cashStartDate.year > cashEndDate.year) {
            cashEndDate.year = cashStartDate.year
        }
        if (cashStartDate.year === cashEndDate.year && cashStartDate.quarter > cashEndDate.quarter) {
            cashEndDate.quarter = cashStartDate.quarter
        }
        let labels = []
        let data = []
        let series = []
        let color = []
        let labels2 = []
        let data2 = []
        let series2 = []
        let color2 = []
        let labels3 = []
        let data3 = [[], []]
        const series3 = ['investPerProperty', 'financePerLiabilities']
        const color3 = [getRandomColor(), getRandomColor()]
        switch(mode) {
            case 1:
            data = [[], [], []]
            color = [getRandomColor(), getRandomColor(), getRandomColor()]
            series = ['profitBT', 'real', 'dividends']
            data2 = [[], [], [], []]
            series2 = ['without_dividends', 'minor', 'operation', 'invest']
            color2 = [getRandomColor(), getRandomColor(), getRandomColor(), getRandomColor()]
            break
            case 2:
            data = [[], []]
            color = [getRandomColor(), getRandomColor()]
            series = ['profitBT', 'real+dividends']
            data2 = [[], [], [], []]
            series2 = ['without_dividends', 'minor', 'operation', 'invest']
            color2 = [getRandomColor(), getRandomColor(), getRandomColor(), getRandomColor()]
            break
            case 3:
            data = [[], [], []]
            color = [getRandomColor(), getRandomColor(), getRandomColor()]
            series = ['profitBT', 'real', 'dividends']
            data2 = [[], [], []]
            series2 = ['without_dividends', 'minor', 'operation+invest']
            color2 = [getRandomColor(), getRandomColor(), getRandomColor()]
            break
            case 4:
            default:
            mode = 4
            data = [[], []]
            color = [getRandomColor(), getRandomColor()]
            series = ['profitBT', 'real+dividends']
            data2 = [[], [], []]
            series2 = ['without_dividends', 'minor', 'operation+invest']
            color2 = [getRandomColor(), getRandomColor(), getRandomColor()]
            break
        }
        for(let i = cashStartDate.year; i <= cashEndDate.year; i++) {
            for (let j in this._parse.cashStatus[i]) {
                if (this._parse.cashStatus[i][j]) {
                    if ((i === cashStartDate.year && j < (cashStartDate.quarter-1)) || (i === cashEndDate.year && j > (cashEndDate.quarter-1))) {
                        continue
                    }
                    labels.push(`${i}${Number(j)+1}`)
                    labels2.push(`${i}${Number(j)+1}`)
                    labels3.push(`${i}${Number(j)+1}`)
                    for (let k in this._parse.cashStatus[i][j]) {
                        switch(k) {
                            case 'profitBT':
                            data[0].push(Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data[0].length > 0) ? data[0][data[0].length -1] : 0))
                            break
                            case 'without_dividends':
                            data2[0].push(Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data2[0].length > 0) ? data2[0][data2[0].length -1] : 0))
                            break
                            case 'minor':
                            data2[1].push(Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data2[1].length > 0) ? data2[1][data2[1].length -1] : 0))
                            break
                            case 'real':
                            if (mode === 1 || mode === 3) {
                                data[1].push(Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data[1].length > 0) ? data[1][data[1].length -1] : 0))
                            }
                            break
                            case 'dividends':
                            if (mode === 1 || mode === 3) {
                                data[2].push(-Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data[2].length > 0) ? data[2][data[2].length -1] : 0))
                            }
                            break
                            case 'operation':
                            if (mode === 1 || mode === 2) {
                                data2[2].push(Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data2[2].length > 0) ? data2[2][data2[2].length -1] : 0))
                            }
                            break
                            case 'invest':
                            if (mode === 1 || mode === 2) {
                                data2[3].push(-Math.ceil(this._parse.cashStatus[i][j][k] * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data2[3].length > 0) ? data2[3][data2[3].length -1] : 0))
                            }
                            break
                            case 'investPerProperty':
                            data3[0].push(this._parse.cashStatus[i][j][k])
                            break
                            case 'financePerLiabilities':
                            data3[1].push(this._parse.cashStatus[i][j][k])
                            break
                        }
                    }
                    if (mode === 2 || mode === 4) {
                        data[1].push(Math.ceil((this._parse.cashStatus[i][j].real - this._parse.cashStatus[i][j].dividends) * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data[1].length > 0) ? data[1][data[1].length -1] : 0))
                    }
                    if (mode === 3 || mode === 4) {
                        data2[2].push(Math.ceil((this._parse.cashStatus[i][j].operation + this._parse.cashStatus[i][j].invest) * this._parse.cashStatus[i][j].end/100000000) + ((accumulate && data2[2].length > 0) ? data2[2][data2[2].length -1] : 0))
                    }
                }
            }
        }
        if (this._cash) {
            this._cash.destroy()
        }
        if (this._cash2) {
            this._cash2.destroy()
        }
        if (this._cash3) {
            this._cash3.destroy()
        }
        this._cash = new Chart(document.getElementById('cashSum'), {
            type: 'line',
            data: {
                labels,
                datasets: series.map((v, i) => ({
                    label: v,
                    data: data[i],
                    fill: false,
                    borderColor: color[i],
                    pointBackgroundColor: color[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._cash2 = new Chart(document.getElementById('cash'), {
            type: 'line',
            data: {
                labels: labels2,
                datasets: series2.map((v, i) => ({
                    label: v,
                    data: data2[i],
                    fill: false,
                    borderColor: color2[i],
                    pointBackgroundColor: color2[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._cash3 = new Chart(document.getElementById('cashRatio'), {
            type: 'line',
            data: {
                labels: labels3,
                datasets: series3.map((v, i) => ({
                    label: v,
                    data: data3[i],
                    fill: false,
                    borderColor: color3[i],
                    pointBackgroundColor: color3[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this.setState(Object.assign({}, this.state, {
            cashStartYear: cashStartDate.year,
            cashStartQuarter: cashStartDate.quarter,
            cashEndYear: cashEndDate.year,
            cashEndQuarter: cashEndDate.quarter,
            cashMode: mode,
        }))
    },
    _drawSafety: function(mode, startYear=null, startQuarter=null, endYear=null, endQuarter=null) {
        const safetyStartDate = this._caculateDate(startYear, startQuarter, true)
        let safetyEndDate = this._caculateDate(endYear, endQuarter)
        if (safetyStartDate.year > safetyEndDate.year) {
            safetyEndDate.year = safetyStartDate.year
        }
        if (safetyStartDate.year === safetyEndDate.year && safetyStartDate.quarter > safetyEndDate.quarter) {
            safetyEndDate.quarter = safetyStartDate.quarter
        }
        let labels = []
        let data = [[], [], []]
        const series = ['prMinusProfit', 'prRatio', 'shortCash']
        const color = [getRandomColor(), getRandomColor(), getRandomColor()]
        for(let i = safetyStartDate.year; i <= safetyEndDate.year; i++) {
            for (let j in this._parse.safetyStatus[i]) {
                if (this._parse.safetyStatus[i][j]) {
                    if ((i === safetyStartDate.year && j < (safetyStartDate.quarter-1)) || (i === safetyEndDate.year && j > (safetyEndDate.quarter-1))) {
                        continue
                    }
                    labels.push(`${i}${Number(j)+1}`)
                    for (let k in this._parse.safetyStatus[i][j]) {
                        switch(k) {
                            case 'prMinusProfit':
                            data[0].push(this._parse.safetyStatus[i][j][k])
                            break
                            case 'prRatio':
                            data[1].push(this._parse.safetyStatus[i][j][k])
                            break
                            case 'shortCash':
                            if (mode === 1) {
                                data[2].push(this._parse.safetyStatus[i][j][k])
                            }
                            break
                            case 'shortCashWithoutCL':
                            if (mode === 2) {
                                data[2].push(this._parse.safetyStatus[i][j][k])
                            }
                            break
                            case 'shortCashWithoutInvest':
                            if (mode === 3) {
                                data[2].push(this._parse.safetyStatus[i][j][k])
                            }
                            break
                        }
                    }
                }
            }
        }
        if (this._safety) {
            this._safety.destroy()
        }
        this._safety = new Chart(document.getElementById('safety'), {
            type: 'line',
            data: {
                labels,
                datasets: series.map((v, i) => ({
                    label: v,
                    data: data[i],
                    fill: false,
                    borderColor: color[i],
                    pointBackgroundColor: color[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this.setState(Object.assign({}, this.state, {
            safetyStartYear: safetyStartDate.year,
            safetyStartQuarter: safetyStartDate.quarter,
            safetyEndYear: safetyEndDate.year,
            safetyEndQuarter: safetyEndDate.quarter,
        }))
    },
    _drawProfit: function(mode, startYear=null, startQuarter=null, endYear=null, endQuarter=null) {
        const profitStartDate = this._caculateDate(startYear, startQuarter, true)
        let profitEndDate = this._caculateDate(endYear, endQuarter)
        if (profitStartDate.year > profitEndDate.year) {
            profitEndDate.year = profitStartDate.year
        }
        if (profitStartDate.year === profitEndDate.year && profitStartDate.quarter > profitEndDate.quarter) {
            profitEndDate.quarter = profitStartDate.quarter
        }
        let labels = []
        let data = [[], [], []]
        const series = ['Gross', 'Operating', 'Profit']
        const color = [getRandomColor(), getRandomColor(), getRandomColor()]
        let labels2 = []
        let data2 = [[], [], []]
        const series2 = ['debt', 'turnover', 'Profit']
        const color2 = [getRandomColor(), getRandomColor(), getRandomColor()]
        let labels3 = []
        let data3 = [[], [], []]
        const series3 = ['ROE', 'Asset Growth', 'Profit']
        const color3 = [getRandomColor(), getRandomColor(), getRandomColor()]
        let labels4 = []
        let data4 = [[], []]
        const series4 = ['salesPerShare', 'sales']
        const color4 = [getRandomColor(), getRandomColor()]
        for(let i = profitStartDate.year; i <= profitEndDate.year; i++) {
            for (let j in this._parse.profitStatus[i]) {
                if (this._parse.profitStatus[i][j]) {
                    if ((i === profitStartDate.year && j < (profitStartDate.quarter-1)) || (i === profitEndDate.year && j > (profitEndDate.quarter-1))) {
                        continue
                    }
                    labels.push(`${i}${Number(j)+1}`)
                    labels2.push(`${i}${Number(j)+1}`)
                    labels3.push(`${i}${Number(j)+1}`)
                    labels4.push(`${i}${Number(j)+1}`)
                    for (let k in this._parse.profitStatus[i][j]) {
                        switch(k) {
                            case 'gross_profit':
                            data[0].push(this._parse.profitStatus[i][j][k])
                            break
                            case 'operating_profit':
                            data[1].push(this._parse.profitStatus[i][j][k])
                            break
                            case 'profit':
                            if (mode === 1) {
                                data[2].push(this._parse.profitStatus[i][j][k])
                                data2[2].push(this._parse.profitStatus[i][j][k])
                                data3[2].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'leverage':
                            data2[0].push(Math.ceil(1000 - this._parse.profitStatus[i][j][k]*1000)/10)
                            break
                            case 'turnover':
                            data2[1].push(Math.ceil(this._parse.profitStatus[i][j][k]*1000)/10)
                            break
                            case 'roe':
                            if (mode === 1) {
                                data3[0].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'asset_growth':
                            if (mode === 1) {
                                data3[1].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'salesPerShare':
                            data4[0].push(Math.ceil(this._parse.profitStatus[i][j][k]/1000000))
                            break
                            case 'quarterSales':
                            data4[1].push(Math.ceil(this._parse.profitStatus[i][j][k]/1000000))
                            break
                            case 'operationRoe':
                            if (mode === 2) {
                                data3[0].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'operationAG':
                            if (mode === 2) {
                                data3[1].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'operatingP':
                            if (mode === 2) {
                                data[2].push(this._parse.profitStatus[i][j][k])
                                data2[2].push(this._parse.profitStatus[i][j][k])
                                data3[2].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'oiRoe':
                            if (mode === 3) {
                                data3[0].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'oiAG':
                            if (mode === 3) {
                                data3[1].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'oiP':
                            if (mode === 3) {
                                data[2].push(this._parse.profitStatus[i][j][k])
                                data2[2].push(this._parse.profitStatus[i][j][k])
                                data3[2].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realRoe':
                            if (mode === 4) {
                                data3[0].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realAG':
                            if (mode === 4) {
                                data3[1].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realP':
                            if (mode === 4) {
                                data[2].push(this._parse.profitStatus[i][j][k])
                                data2[2].push(this._parse.profitStatus[i][j][k])
                                data3[2].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realRoe_dividends':
                            if (mode === 5) {
                                data3[0].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realAG_dividends':
                            if (mode === 5) {
                                data3[1].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                            case 'realP_dividends':
                            if (mode === 5) {
                                data[2].push(this._parse.profitStatus[i][j][k])
                                data2[2].push(this._parse.profitStatus[i][j][k])
                                data3[2].push(this._parse.profitStatus[i][j][k])
                            }
                            break
                        }
                    }
                }
            }
        }
        if (this._profit) {
            this._profit.destroy()
        }
        if (this._profit2) {
            this._profit2.destroy()
        }
        if (this._profit3) {
            this._profit3.destroy()
        }
        if (this._profit4) {
            this._profit4.destroy()
        }
        this._profit = new Chart(document.getElementById('profit'), {
            type: 'line',
            data: {
                labels,
                datasets: series.map((v, i) => ({
                    label: v,
                    data: data[i],
                    fill: false,
                    borderColor: color[i],
                    pointBackgroundColor: color[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._profit2 = new Chart(document.getElementById('profitTrio'), {
            type: 'line',
            data: {
                labels: labels2,
                datasets: series2.map((v, i) => ({
                    label: v,
                    data: data2[i],
                    fill: false,
                    borderColor: color2[i],
                    pointBackgroundColor: color2[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._profit3 = new Chart(document.getElementById('profitROE'), {
            type: 'line',
            data: {
                labels: labels3,
                datasets: series3.map((v, i) => ({
                    label: v,
                    data: data3[i],
                    fill: false,
                    borderColor: color3[i],
                    pointBackgroundColor: color3[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._profit4 = new Chart(document.getElementById('profitSales'), {
            type: 'line',
            data: {
                labels: labels4,
                datasets: series4.map((v, i) => ({
                    label: v,
                    data: data4[i],
                    fill: false,
                    borderColor: color4[i],
                    pointBackgroundColor: color4[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this.setState(Object.assign({}, this.state, {
            profitStartYear: profitStartDate.year,
            profitStartQuarter: profitStartDate.quarter,
            profitEndYear: profitEndDate.year,
            profitEndQuarter: profitEndDate.quarter,
        }))
    },
    _drawManagement: function(mode, revenue, profit, cash, inventories, receivable, payable, startYear=null, startQuarter=null, endYear=null, endQuarter=null) {
        const managementStartDate = this._caculateDate(startYear, startQuarter, true)
        let managementEndDate = this._caculateDate(endYear, endQuarter)
        if (managementStartDate.year > managementEndDate.year) {
            managementEndDate.year = managementStartDate.year
        }
        if (managementStartDate.year === managementEndDate.year && managementStartDate.quarter > managementEndDate.quarter) {
            managementEndDate.quarter = managementStartDate.quarter
        }
        let labels = []
        let data = []
        let series = []
        let color = []
        let labels2 = []
        let data2 = []
        let series2 = []
        let color2 = []
        if (revenue) {
            series2.push('revenue')
            data2.push([])
            color2.push(getRandomColor())
        }
        if (profit) {
            series.push('profit')
            data.push([])
            color.push(getRandomColor())
            series2.push('profit')
            data2.push([])
            color2.push(getRandomColor())
        }
        if (cash) {
            series.push('cash')
            data.push([])
            color.push(getRandomColor())
            series2.push('cash')
            data2.push([])
            color2.push(getRandomColor())
        }
        if (inventories) {
            series.push('inventories')
            data.push([])
            color.push(getRandomColor())
            series2.push('inventories')
            data2.push([])
            color2.push(getRandomColor())
        }
        if (receivable) {
            series.push('receivable')
            data.push([])
            color.push(getRandomColor())
            series2.push('receivable')
            data2.push([])
            color2.push(getRandomColor())
        }
        if (payable) {
            series.push('payable')
            data.push([])
            color.push(getRandomColor())
            series2.push('payable')
            data2.push([])
            color2.push(getRandomColor())
        }
        let index = -1, ry = 0, rs = 0
        for(let i = managementStartDate.year; i <= managementEndDate.year; i++) {
            for (let j in this._parse.managementStatus[i]) {
                if (this._parse.managementStatus[i][j]) {
                    if ((i === managementStartDate.year && j < (managementStartDate.quarter-1)) || (i === managementEndDate.year && j > (managementEndDate.quarter-1))) {
                        continue
                    }
                    labels.push(`${i}${Number(j)+1}`)
                    if ((mode === 2 || mode === 4) && j === '0') {
                        labels2.push(i)
                    } else if (mode === 1 || mode === 3) {
                        labels2.push(`${i}${Number(j)+1}`)
                    }
                    for (let k in this._parse.managementStatus[i][j]) {
                        switch (k) {
                            case 'profitRelative':
                            index = series.indexOf('profit')
                            if (index !== -1) {
                                data[index].push(this._parse.managementStatus[i][j][k])
                            }
                            break
                            case 'cashRelative':
                            index = series.indexOf('cash')
                            if (index !== -1) {
                                data[index].push(this._parse.managementStatus[i][j][k])
                            }
                            break
                            case 'inventoriesRelative':
                            index = series.indexOf('inventories')
                            if (index !== -1) {
                                data[index].push(this._parse.managementStatus[i][j][k])
                            }
                            break
                            case 'receivableRelative':
                            index = series.indexOf('receivable')
                            if (index !== -1) {
                                data[index].push(this._parse.managementStatus[i][j][k])
                            }
                            break
                            case 'payableRelative':
                            index = series.indexOf('payable')
                            if (index !== -1) {
                                data[index].push(this._parse.managementStatus[i][j][k])
                            }
                            break
                            case 'cash':
                            index = series2.indexOf('cash')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(this._parse.managementStatus[i][rs][k]/1000000) : Math.ceil(this._parse.managementStatus[i][rs][k]/this._parse.managementStatus[i][rs]['share']*10000)/1000)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 3) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                            case 'inventories':
                            index = series2.indexOf('inventories')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(this._parse.managementStatus[i][rs][k]/1000000) : Math.ceil(this._parse.managementStatus[i][rs][k]/this._parse.managementStatus[i][rs]['share']*10000)/1000)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 3) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                            case 'receivable':
                            index = series.indexOf('receivable')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(this._parse.managementStatus[i][rs][k]/1000000) : Math.ceil(this._parse.managementStatus[i][rs][k]/this._parse.managementStatus[i][rs]['share']*10000)/100)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 3) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                            case 'payable':
                            index = series2.indexOf('payable')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(this._parse.managementStatus[i][rs][k]/1000000) : Math.ceil(this._parse.managementStatus[i][rs][k]/this._parse.managementStatus[i][rs]['share']*10000)/1000)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 3) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                            case 'profit':
                            index = series2.indexOf('profit')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    ry = 0
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                        ry += this._parse.managementStatus[i][l][k]
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(ry/1000000) : Math.ceil(ry/this._parse.managementStatus[i][rs]['share']*10000)/1000)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 3) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                            case 'revenue':
                            index = series2.indexOf('revenue')
                            if (index !== -1) {
                                if ((mode === 2 || mode === 4) && j === '0') {
                                    ry = 0
                                    rs = 0
                                    for (let l in this._parse.managementStatus[i]) {
                                        if (rs < l) {
                                            rs = l
                                        }
                                        ry += this._parse.managementStatus[i][l][k]
                                    }
                                    data2[index].push(mode === 2 ? Math.ceil(ry/1000000) : Math.ceil(ry/this._parse.managementStatus[i][rs]['share']*10000)/1000)
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/1000000))
                                } else if (mode === 1) {
                                    data2[index].push(Math.ceil(this._parse.managementStatus[i][j][k]/this._parse.managementStatus[i][j]['share']*10000)/1000)
                                }
                            }
                            break
                        }
                    }
                }
            }
        }
        if (this._management) {
            this._management.destroy()
        }
        if (this._management2) {
            this._management2.destroy()
        }
        this._management = new Chart(document.getElementById('management'), {
            type: 'line',
            data: {
                labels,
                datasets: series.map((v, i) => ({
                    label: v,
                    data: data[i],
                    fill: false,
                    borderColor: color[i],
                    pointBackgroundColor: color[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this._management2 = new Chart(document.getElementById('managementNumber'), {
            type: 'line',
            data: {
                labels: labels2,
                datasets: series2.map((v, i) => ({
                    label: v,
                    data: data2[i],
                    fill: false,
                    borderColor: color2[i],
                    pointBackgroundColor: color2[i],
                    spanGaps: false,
                })),
                lineTension: 0.1,
            },
            options: {
                tooltips: {mode: 'index'},
            },
        })
        this.setState(Object.assign({}, this.state, {
            managementStartYear: managementStartDate.year,
            managementStartQuarter: managementStartDate.quarter,
            managementEndYear: managementEndDate.year,
            managementEndQuarter: managementEndDate.quarter,
        }))
    },
    _handleSelect: function(e, target) {
        this.setState(Object.assign({}, this.state, {[target]: Number(e.target.value)}))
    },
    _handleChange: function() {
        let data = {}
        if (this._salesCom !== null) {
            data['salesCom'] = this._salesCom.checked
        }
        if (this._cashAcc !== null) {
            data['cashAcc'] = this._cashAcc.checked
        }
        if (this._managementRev !== null) {
            data['managementRev'] = this._managementRev.checked
        }
        if (this._managementPro !== null) {
            data['managementPro'] = this._managementPro.checked
        }
        if (this._managementCash !== null) {
            data['managementCash'] = this._managementCash.checked
        }
        if (this._managementInv !== null) {
            data['managementInv'] = this._managementInv.checked
        }
        if (this._managementRec !== null) {
            data['managementRec'] = this._managementRec.checked
        }
        if (this._managementPay !== null) {
            data['managementPay'] = this._managementPay.checked
        }
        this.setState(Object.assign({}, this.state, data))
    },
    render: function() {
        return (
            <section style={{paddingTop: '50px', overflowX: 'hidden'}} id="stock-info">
                <section className="panel panel-default" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Asset</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'assetStartYear')} value={this.state.assetStartYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'assetStartQuarter')} value={this.state.assetStartQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-1 text-center">
                                <strong>To</strong>
                            </div>
                            <div className="col-md-3">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'assetEndYear')} value={this.state.assetEndYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'assetEndQuarter')} value={this.state.assetEndQuarter}>
                                        {optionQuarter}
                                    </select>
                                    <span className="input-group-btn">
                                        <button className="btn btn-default" type="button" onClick={e => killEvent(e, () => this._drawAsset(this.state.assetStartYear, this.state.assetStartQuarter, this.state.assetEndYear, this.state.assetEndQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <h3>Total: {this._assetTotalCommas}</h3>
                        <div style={{width: '50%', margin: '0 auto'}}>
                            <canvas id="asset"></canvas>
                            <canvas id="assetCompare"></canvas>
                        </div>
                    </div>
                </section>
                <section className="panel panel-primary" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Sales</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-6">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'salesYear')} value={this.state.salesYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-6">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'salesQuarter')} value={this.state.salesQuarter}>
                                        {optionQuarter}
                                    </select>
                                    <span className="input-group-addon">
                                        <Tooltip tip="comprehensive" place="top" />
                                        <input
                                            type="checkbox"
                                            checked={this.state.salesCom}
                                            ref={ref => this._salesCom = ref}
                                            onChange={this._handleChange} />
                                    </span>
                                    <span className="input-group-btn">
                                        <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._drawSales(this.state.salesCom, this.state.salesYear, this.state.salesQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <h3>Revenue + Plus: {this._salesTotalCommas} EPS: {this._eps}</h3>
                        <div style={{width: '50%', margin: '0 auto'}}>
                            <canvas id="sales"></canvas>
                        </div>
                    </div>
                </section>
                <section className="panel panel-info" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Cash</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'cashStartYear')} value={this.state.cashStartYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'cashStartQuarter')} value={this.state.cashStartQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-1 text-center">
                                <strong>To</strong>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'cashEndYear')} value={this.state.cashEndYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'cashEndQuarter')} value={this.state.cashEndQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'cashMode')} value={this.state.cashMode}>
                                        <option value={1} key={0}>R,D,O,I</option>
                                        <option value={2} key={1}>R+D,O,I</option>
                                        <option value={3} key={2}>R,D,O+I</option>
                                        <option value={4} key={3}>R+D,O+I</option>
                                    </select>
                                    <span className="input-group-addon">
                                        <Tooltip tip="accumulate" place="top" />
                                        <input
                                            type="checkbox"
                                            checked={this.state.cashAcc}
                                            ref={ref => this._cashAcc = ref}
                                            onChange={this._handleChange} />
                                    </span>
                                    <span className="input-group-btn">
                                        <button className="btn btn-info" type="button" onClick={e => killEvent(e, () => this._drawCash(this.state.cashMode, this.state.cashAcc, this.state.cashStartYear, this.state.cashStartQuarter, this.state.cashEndYear, this.state.cashEndQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <canvas id="cashSum"></canvas>
                        <canvas id="cash"></canvas>
                        <canvas id="cashRatio"></canvas>
                    </div>
                </section>
                <section className="panel panel-warning" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Safety</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'safetyStartYear')} value={this.state.safetyStartYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'safetyStartQuarter')} value={this.state.safetyStartQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-1 text-center">
                                <strong>To</strong>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'safetyEndYear')} value={this.state.safetyEndYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'safetyEndQuarter')} value={this.state.safetyEndQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'safetyMode')} value={this.state.safetyMode}>
                                        <option value={1} key={0}>CL&Invest</option>
                                        <option value={2} key={1}>Invest</option>
                                        <option value={3} key={2}>CL</option>
                                    </select>
                                    <span className="input-group-btn">
                                        <button className="btn btn-info" type="button" onClick={e => killEvent(e, () => this._drawSafety(this.state.safetyMode, this.state.safetyStartYear, this.state.safetyStartQuarter, this.state.safetyEndYear, this.state.safetyEndQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <h3>Safety Index: {this._safetyIndex}</h3>
                        <canvas id="safety"></canvas>
                    </div>
                </section>
                <section className="panel panel-danger" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Profit</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'profitStartYear')} value={this.state.profitStartYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'profitStartQuarter')} value={this.state.profitStartQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-1 text-center">
                                <strong>To</strong>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'profitEndYear')} value={this.state.profitEndYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'profitEndQuarter')} value={this.state.profitEndQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'profitMode')} value={this.state.profitMode}>
                                        <option value={1} key={0}>Profit</option>
                                        <option value={2} key={1}>Operating</option>
                                        <option value={3} key={2}>O+I</option>
                                        <option value={4} key={3}>Real</option>
                                        <option value={5} key={4}>R+D</option>
                                    </select>
                                    <span className="input-group-btn">
                                        <button className="btn btn-info" type="button" onClick={e => killEvent(e, () => this._drawProfit(this.state.profitMode, this.state.profitStartYear, this.state.profitStartQuarter, this.state.profitEndYear, this.state.profitEndQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <h3>Profit Index: {this._profitIndex}</h3>
                        <canvas id="profit"></canvas>
                        <canvas id="profitTrio"></canvas>
                        <canvas id="profitROE"></canvas>
                        <canvas id="profitSales"></canvas>
                    </div>
                </section>
                <section className="panel panel-success" style={{marginBottom: '0px'}}>
                    <div className="panel-heading">
                        <h2 className="panel-title">Management</h2>
                    </div>
                    <div className="panel-body">
                        <div className="row">
                            <div className="input-group">
                                <span className="form-control">
                                    Item:
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="revenue" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementRev}
                                        ref={ref => this._managementRev = ref}
                                        onChange={this._handleChange} />
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="profit" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementPro}
                                        ref={ref => this._managementPro = ref}
                                        onChange={this._handleChange} />
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="cash" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementCash}
                                        ref={ref => this._managementCash = ref}
                                        onChange={this._handleChange} />
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="inventories" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementInv}
                                        ref={ref => this._managementInv = ref}
                                        onChange={this._handleChange} />
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="receivable" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementRec}
                                        ref={ref => this._managementRec = ref}
                                        onChange={this._handleChange} />
                                </span>
                                <span className="input-group-addon">
                                    <Tooltip tip="payable" place="top" />
                                    <input
                                        type="checkbox"
                                        checked={this.state.managementPay}
                                        ref={ref => this._managementPay = ref}
                                        onChange={this._handleChange} />
                                </span>
                            </div>
                        </div>
                        <div className="row">
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'managementStartYear')} value={this.state.managementStartYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'managementStartQuarter')} value={this.state.managementStartQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-1 text-center">
                                <strong>To</strong>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'managementEndYear')} value={this.state.managementEndYear}>
                                    {this._parseYear}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select className="form-control" onChange={e => this._handleSelect(e, 'managementEndQuarter')} value={this.state.managementEndQuarter}>
                                    {optionQuarter}
                                </select>
                            </div>
                            <div className="col-md-3">
                                <div className="input-group">
                                    <select className="form-control" onChange={e => this._handleSelect(e, 'managementMode')} value={this.state.managementMode}>
                                        <option value={1} key={0}>Season</option>
                                        <option value={2} key={1}>Year</option>
                                        <option value={3} key={2}>SShare</option>
                                        <option value={4} key={3}>YShare</option>
                                    </select>
                                    <span className="input-group-btn">
                                        <button className="btn btn-info" type="button" onClick={e => killEvent(e, () => this._drawManagement(this.state.managementMode, this.state.managementRev, this.state.managementPro, this.state.managementCash, this.state.managementInv, this.state.managementRec, this.state.managementPay, this.state.managementStartYear, this.state.managementStartQuarter, this.state.managementEndYear, this.state.managementEndQuarter))}>
                                            <i className="glyphicon glyphicon-usd"></i>
                                        </button>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <h3>Management Index: {this._managementIndex}</h3>
                        <canvas id="management"></canvas>
                        <canvas id="managementNumber"></canvas>
                    </div>
                </section>
            </section>
        )
    }
})

export default StockInfo
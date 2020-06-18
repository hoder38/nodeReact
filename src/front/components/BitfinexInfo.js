import React from 'react'
import UserInput from './UserInput'
import Tooltip from './Tooltip'
import { killEvent, checkInput, api, isValidString } from '../utility'
import { FILE_ZINDEX } from '../constants'

const BitfinexInfo = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['key', 'secret', 'riskLimit', 'waitTime', 'amountLimit', 'miniRate', 'dynamic', 'keepAmount', 'keepAmountRate1', 'keepAmountMoney1', 'dynamicRate1', 'dynamicDay1', 'dynamicRate2', 'dynamicDay2', 'low_point', 'amount', 'interval', 'loss_stop', 'gain_stop', 'pair', 'leverage'], this._handleSubmit, this._handleChange);
        this._keep = null;
        this._active = null;
        this._advanced = null;
        return Object.assign({
            list: [],
            current: -1,
            keep: false,
            active: false,
            advanced: false,
            trade: false,
            tradable: false,
        }, this._input.initValue());
    },
    componentWillMount: function() {
        api(`${this.props.mainUrl}/api/bitfinex/bot`).then(result => this._setList(result)).catch(err => this.props.addalert(err));
    },
    _handleSubmit: function() {
        const item = this.state.list[this.state.current];
        const keep = this.state.keep !== item.isKeep ? {keep: this.state.keep} : {};
        const active = this.state.active !== item.isActive ? {active: this.state.active} : {}
        const trade = this.state.trade !== item.isTrade ? {trade: this.state.trade} : {}
        let ka1 = {};
        let dr1 = {};
        let dr2 = {};
        if (item.keepAmountRate1 && item.keepAmountMoney1 && (this.state['keepAmountRate1'].toString() !== item.keepAmountRate1.toString() || this.state['keepAmountMoney1'].toString() !== item.keepAmountMoney1.toString())) {
            if (isValidString(this.state['keepAmountRate1'], 'zeroint') && isValidString(this.state['keepAmountMoney1'], 'zeroint')) {
                ka1 = {
                    keepAmountRate1: this.state['keepAmountRate1'],
                    keepAmountMoney1: this.state['keepAmountMoney1'],
                }
            } else {
                this.props.addalert('Reserved Amount 1 not vaild!!!')
            }
        }
        if (item.dynamicRate1 && item.dynamicDay1 && (this.state['dynamicRate1'].toString() !== item.dynamicRate1.toString() || this.state['dynamicDay1'].toString() !== item.dynamicDay1.toString())) {
            if (isValidString(this.state['dynamicRate1'], 'zeroint') && isValidString(this.state['dynamicDay1'], 'zeroint')) {
                dr1 = {
                    dynamicRate1: this.state['dynamicRate1'],
                    dynamicDay1: this.state['dynamicDay1'],
                }
            } else {
                this.props.addalert('Boost Rate 1 not vaild!!!')
            }
        }
        if (item.dynamicRate2 && item.dynamicDay2 && (this.state['dynamicRate2'].toString() !== item.dynamicRate2.toString() || this.state['dynamicDay2'].toString() !== item.dynamicDay2.toString())) {
            if (isValidString(this.state['dynamicRate2'], 'zeroint') && isValidString(this.state['dynamicDay2'], 'zeroint')) {
                dr2 = {
                    dynamicRate2: this.state['dynamicRate2'],
                    dynamicDay2: this.state['dynamicDay2'],
                }
            } else {
                this.props.addalert('Boost Rate 2 not vaild!!!')
            }
        }
        const set_obj = Object.assign({},
            checkInput('key', this.state, this.props.addalert, item.key, 'name'),
            checkInput('secret', this.state, this.props.addalert, item.secret, 'name'),
            checkInput('riskLimit', this.state, this.props.addalert, item.riskLimit, 'int'),
            checkInput('waitTime', this.state, this.props.addalert, item.waitTime, 'int'),
            checkInput('amountLimit', this.state, this.props.addalert, item.amountLimit, 'int'),
            checkInput('miniRate', this.state, this.props.addalert, item.miniRate, 'zeroint'),
            checkInput('dynamic', this.state, this.props.addalert, item.dynamic, 'zeroint'),
            checkInput('keepAmount', this.state, this.props.addalert, item.keepAmount, 'zeroint'),
            checkInput('low_point', this.state, this.props.addalert, item.low_point, 'int'),
            checkInput('amount', this.state, this.props.addalert, item.amount, 'int'),
            checkInput('interval', this.state, this.props.addalert, item.interval, 'int'),
            checkInput('loss_stop', this.state, this.props.addalert, item.loss_stop, 'int'),
            checkInput('gain_stop', this.state, this.props.addalert, item.gain_stop, 'zeroint'),
            checkInput('pair', this.state, this.props.addalert, item.pair, 'name'),
            checkInput('leverage', this.state, this.props.addalert, item.leverage, 'zeroint'),
            ka1, dr1, dr2, keep, active, trade);
        if (Object.keys(set_obj).length > 0) {
            this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/bitfinex/bot`, Object.assign({}, set_obj, {type: item.type}), 'PUT').then(result => {
                this._setList(result, item.type);
                this.props.addalert(`${item.type.substr(1)} Bot update completed`);
            }).catch(err => this.props.addalert(err)), `Would you sure to update ${item.type.substr(1)} Bot?`);
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue(), {
            keep: this._keep.checked,
            active: this._active.checked,
            advanced: this._advanced.checked,
            trade: this._trade.checked,
        }));
    },
    _setList: function(list, type=null) {
        if (!list) {
            return false;
        }
        let current = (list.length > 0) ? 0 : -1;
        if (type) {
            for (let i = 0; i < list.length; i++) {
                if (list[i].type === type) {
                    current = i;
                    break;
                }
            }
        }
        const item = (current === -1) ? {} : list[current];
        this.setState(Object.assign({}, this.state, {
            list,
            current,
            keep: item.isKeep,
            active: item.isActive,
            advanced: (item.keepAmountRate1 || item.dynamicRate1 || item.dynamicRate2) ? true: false,
            tradable: item.tradable,
            trade: item.isTrade,
        }, this._input.initValue(item)));
    },
    _delBot: function() {
        const type = this.state.list[this.state.current].type;
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/bitfinex/bot/del/${type}`).then(result => this._setList(result, type)).catch(err => this.props.addalert(err)), `Would you sure to delete ${this.state.list[this.state.current].type.substr(1)} Bot?`);
    },
    render: function() {
        const advancedDisplay = this.state.advanced ? {} : {display: 'none'};
        const tradableDisplay = this.state.tradable ? {} : {display: 'none'};
        const tradeDisplay = (this.state.tradable && this.state.trade) ? {} : {display: 'none'};
        const list = this.state.list.map((v, i) => {
            const active = (this.state.current === i) ? 'btn-lg' : '';
            const item = this.state.list[i];
            return (
                <button className={`btn btn-primary ${active}`} type="button" key={i} onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {
                    current: i,
                    keep: item.isKeep,
                    active: item.isActive,
                    trade: item.isTrade,
                    advanced: (item.keepAmountRate1 || item.dynamicRate1 || item.dynamicRate2) ? true: false,
                    tradable: item.tradable,
                }, this._input.initValue(item))))}>
                    {v.type.substr(1)}
                </button>
            )
        });
        return (
            <div className="modal-content" style={{
                position: 'fixed',
                zIndex: FILE_ZINDEX,
            }} id="password-section">
                <div className="modal-body panel panel-danger" style={{
                    padding: '0px',
                    marginBottom: '0px',
                }}>
                    <div className="panel-heading" onClick={e => killEvent(e, this.props.onclose)}>
                        <h3 className="panel-title">Bot Details<i className="pull-right glyphicon glyphicon-remove"></i></h3>
                    </div>
                    <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                        <div className="panel-body">
                            <div>設定網址：
                                <span><a href="https://www.bitfinex.com/api#createkey" className="item-point" target="_blank">https://www.bitfinex.com/api#createkey</a></span> & <a className="item-point" href="/public/bitfinex_api_setting.png" target="_blank">權限設定</a>
                            </div>
                            <div>
                                <button className="btn btn-success" type="submit">
                                    <i className="glyphicon glyphicon-ok"></i>
                                </button>
                                <button className="btn btn-danger" type="button" onClick={e => killEvent(e, this._delBot)}>
                                    <i className="glyphicon glyphicon-remove"></i>
                                </button>
                                {list}
                            </div>
                        </div>
                        <div className="panel-footer"  style={{
                            overflowY: 'scroll',
                            maxHeight: '60vh',
                        }}>
                            <table className="table table-user-information">
                                <tbody>
                                    <UserInput
                                        val={this.state.key}
                                        getinput={this._input.getInput('key')}
                                        placeholder="API Key">
                                        <tr>
                                            <td key={0}>API Key:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.secret}
                                        type="password"
                                        getinput={this._input.getInput('secret')}
                                        placeholder="API Secret">
                                        <tr>
                                            <td key={0}>API Secret:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.riskLimit}
                                        getinput={this._input.getInput('riskLimit')}
                                        placeholder="1~10">
                                        <tr>
                                            <td key={0}><Tooltip style={{maxWidth: '400px'}} tip="風險指數設定1~10，會隨著時間或筆數(同時最多10單)降低" place="right" />Risk:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.waitTime}
                                        getinput={this._input.getInput('waitTime')}
                                        placeholder="min.">
                                        <tr>
                                            <td key={0}><Tooltip tip="調降風險指數的時間間隔(分鐘)" place="right" />Time Intervel:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.amountLimit}
                                        getinput={this._input.getInput('amountLimit')}
                                        placeholder=">50">
                                        <tr>
                                            <td key={0}><Tooltip tip="最大單筆金額上限，最小50" place="right" />Amount Limit:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.miniRate}
                                        getinput={this._input.getInput('miniRate')}
                                        placeholder="0.02">
                                        <tr>
                                            <td key={0}><Tooltip tip="掛出最小利率" place="right" />Mini Rate:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.dynamic}
                                        getinput={this._input.getInput('dynamic')}
                                        placeholder="0.05">
                                        <tr>
                                            <td key={0}><Tooltip style={{maxWidth: '400px'}} tip="超過此利率日期變30天，時間間隔減半" place="right" />Boost Rate:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.keepAmount}
                                        getinput={this._input.getInput('keepAmount')}
                                        placeholder="0">
                                        <tr>
                                            <td key={0}><Tooltip tip="保留此金額不貸出" place="right" />Reserved Amount:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <tr>
                                        <td><Tooltip tip="比特幣或以太幣一天跌超過30%就保留資金" place="right" />Keep:</td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-control"
                                                checked={this.state.keep}
                                                ref={ref => this._keep = ref}
                                                onChange={this._handleChange} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Active:</td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-control"
                                                checked={this.state.active}
                                                ref={ref => this._active = ref}
                                                onChange={this._handleChange} />
                                        </td>
                                    </tr>
                                    <tr>
                                        <td>Advanced Settings:</td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-control"
                                                checked={this.state.advanced}
                                                ref={ref => this._advanced = ref}
                                                onChange={this._handleChange} />
                                        </td>
                                    </tr>
                                    <tr style={advancedDisplay}>
                                        <td>Reserved Amount 1:</td>
                                        <td>
                                            <div className="input-group double-input" style={{display: 'block'}}>
                                                <UserInput
                                                    val={this.state.keepAmountRate1}
                                                    getinput={this._input.getInput('keepAmountRate1')}
                                                    placeholder="Rate" />
                                                <UserInput
                                                    val={this.state.keepAmountMoney1}
                                                    getinput={this._input.getInput('keepAmountMoney1')}
                                                    placeholder="Money" />
                                            </div>
                                        </td>
                                    </tr>
                                    <tr style={advancedDisplay}>
                                        <td>Boost Rate 1:</td>
                                        <td>
                                            <div className="input-group double-input" style={{display: 'block'}}>
                                                <UserInput
                                                    val={this.state.dynamicRate1}
                                                    getinput={this._input.getInput('dynamicRate1')}
                                                    placeholder="Rate" />
                                                <UserInput
                                                    val={this.state.dynamicDay1}
                                                    getinput={this._input.getInput('dynamicDay1')}
                                                    placeholder="Day" />
                                            </div>
                                        </td>
                                    </tr>
                                    <tr style={advancedDisplay}>
                                        <td>Boost Rate 2:</td>
                                        <td>
                                            <div className="input-group double-input" style={{display: 'block'}}>
                                                <UserInput
                                                    val={this.state.dynamicRate2}
                                                    getinput={this._input.getInput('dynamicRate2')}
                                                    placeholder="Rate" />
                                                <UserInput
                                                    val={this.state.dynamicDay2}
                                                    getinput={this._input.getInput('dynamicDay2')}
                                                    placeholder="Day" />
                                            </div>
                                        </td>
                                    </tr>
                                    <tr style={tradableDisplay}>
                                        <td>Trade Settings (Beta):</td>
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="form-control"
                                                checked={this.state.trade}
                                                ref={ref => this._trade = ref}
                                                onChange={this._handleChange} />
                                        </td>
                                    </tr>
                                    <UserInput
                                        val={this.state.low_point}
                                        getinput={this._input.getInput('low_point')}
                                        placeholder="取低點的時間區間(分鐘)">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Low Interval:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.amount}
                                        getinput={this._input.getInput('amount')}
                                        placeholder="單次交易金額">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Trade Amount:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.interval}
                                        getinput={this._input.getInput('interval')}
                                        placeholder="每次交易間隔 (分鐘)">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Trade Interval:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.loss_stop}
                                        getinput={this._input.getInput('loss_stop')}
                                        placeholder="停損趴數">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Lost Stop:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.gain_stop}
                                        getinput={this._input.getInput('gain_stop')}
                                        placeholder="停利趴數，如果0為不停利">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Gain Stop:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.pair}
                                        getinput={this._input.getInput('pair')}
                                        placeholder="交易對，用','分隔 例: tBTCUSD,tETHUSD">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Trade Pair:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.leverage}
                                        getinput={this._input.getInput('leverage')}
                                        placeholder="槓桿倍數，0為不開">
                                        <tr style={tradeDisplay}>
                                            <td key={0}>Leverage:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                </tbody>
                            </table>
                        </div>
                    </form>
                </div>
            </div>
        )
    }
})

export default BitfinexInfo
import React from 'react'
import UserInput from './UserInput'
import Tooltip from './Tooltip'
import { killEvent, checkInput, api, isValidString } from '../utility'
import { FILE_ZINDEX } from '../constants'

const BitfinexInfo = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['key', 'secret', 'amountLimit', 'riskLimit', 'waitTime', 'miniRate', 'keepAmount', 'dynamic'], this._handleSubmit, this._handleChange);
        this._keep = null;
        this._active = null;
        return Object.assign({
            list: [],
            current: -1,
            keep: false,
            active: false,
        }, this._input.initValue());
    },
    componentWillMount: function() {
        api('/api/bitfinex/bot').then(result => this._setList(result)).catch(err => this.props.addalert(err));
    },
    _handleSubmit: function() {
        const item = this.state.list[this.state.current];
        const keep = this.state.keep !== item.isKeep ? {keep: this.state.keep} : {};
        const active = this.state.active !== item.isActive ? {active: this.state.active} : {}
        const set_obj = Object.assign({},
            checkInput('key', this.state, this.props.addalert, item.key, 'name'),
            checkInput('secret', this.state, this.props.addalert, item.secret, 'name'),
            checkInput('riskLimit', this.state, this.props.addalert, item.riskLimit, 'int'),
            checkInput('waitTime', this.state, this.props.addalert, item.waitTime, 'int'),
            checkInput('amountLimit', this.state, this.props.addalert, item.amountLimit, 'int'),
            checkInput('miniRate', this.state, this.props.addalert, item.miniRate, 'zeroint'),
            checkInput('dynamic', this.state, this.props.addalert, item.dynamic, 'zeroint'),
            checkInput('keepAmount', this.state, this.props.addalert, item.keepAmount, 'zeroint'),
            keep, active);
        if (Object.keys(set_obj).length > 0) {
            this.props.sendglbcf(() => api('/api/bitfinex/bot', Object.assign({}, set_obj, {type: item.type}), 'PUT').then(result => {
                this._setList(result, item.type);
                this.props.addalert(`${item.type.substr(1)} Bot update completed`);
            }).catch(err => this.props.addalert(err)), `Would you sure to update ${item.type.substr(1)} Bot?`);
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue(), {
            keep: this._keep.checked,
            active: this._active.checked,
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
        }, this._input.initValue(item)));
    },
    _delBot: function() {
        const type = this.state.list[this.state.current].type;
        this.props.sendglbcf(() => api(`/api/bitfinex/bot/del/${type}`).then(result => this._setList(result, type)).catch(err => this.props.addalert(err)), `Would you sure to delete ${this.state.list[this.state.current].type.substr(1)} Bot?`);
    },
    render: function() {
        const list = this.state.list.map((v, i) => {
            const active = (this.state.current === i) ? 'btn-lg' : '';
            const item = this.state.list[i];
            return (
                <button className={`btn btn-primary ${active}`} type="button" key={i} onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {
                    current: i,
                    keep: item.isKeep,
                    active: item.isActive,
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
                            <button className="btn btn-success" type="submit">
                                <i className="glyphicon glyphicon-ok"></i>
                            </button>
                            <button className="btn btn-danger" type="button" onClick={e => killEvent(e, this._delBot)}>
                                <i className="glyphicon glyphicon-remove"></i>
                            </button>
                            {list}
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
                                            <td key={0}><Tooltip tip="調降風險指數的時間區隔(分鐘)" place="right" />Time Intervel:</td>
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
                                        placeholder="5">
                                        <tr>
                                            <td key={0}><Tooltip tip="掛出最小利率" place="right" />Mini Rate:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.dynamic}
                                        getinput={this._input.getInput('dynamic')}
                                        placeholder="20">
                                        <tr>
                                            <td key={0}><Tooltip tip="超過此利率，日期變30天" place="right" />Dynamic Rate:</td>
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
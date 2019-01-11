import React from 'react'
import { FILE_ZINDEX, MEDIA_ZINDEX } from '../constants'
import { killEvent, api, isValidString } from '../utility'
import Tooltip from './Tooltip'
import UserInput from './UserInput'
import Dropdown from './Dropdown'

let key = 0

const StockTotal = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['stock'], this._handleSubmit, this._handleChange)
        this._info = [];
        return Object.assign({
            sending: false,
            totals: null,
        }, this._input.initValue())
    },
    componentWillMount: function() {
        api('/api/stock/getTotal').then(result => this.setState(Object.assign({}, this.state, {total: result}))).catch(err => {
            this.props.addalert(err)
        });
        window.addEventListener("beforeunload", this._routerWillLeave)
    },
    componentWillUnmount: function() {
        if (this._info.length > 0) {
            this.props.sendglbcf(() => api('/api/stock/updateTotal/1', {info: this._info}, 'PUT').catch(err => this.props.addalert(err)), `Would you want to update Stock Total permanently?`)
        }
        window.removeEventListener("beforeunload", this._routerWillLeave)
    },
    _routerWillLeave: function(e) {
        let confirmationMessage = 'You have unupdated changes. Are you sure you want to navigate away from this page?'
        if (this._info.length > 0) {
            e.returnValue = confirmationMessage
            return confirmationMessage
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    },
    _handleSubmit: function() {
        if (!this.state.sending) {
            this._input.allBlur()
            if (!isValidString(this.state.stock, 'name')) {
                this.props.addalert('CMD not vaild!!!');
            } else {
                this._info.push(this.state.stock);
                this._update();
            }
        }
    },
    _update: function(real = false) {
        if (real) {
            this.props.sendglbcf(() => this.setState(Object.assign({}, this.state, {sending: true}), () => {
                api('/api/stock/updateTotal/1', {info: this._info}, 'PUT').then(result => {
                    if (real) {
                        this._info = [];
                    }
                    this.setState(Object.assign({}, this.state, this._input.initValue(), {sending: false, total: result}))
                }).catch(err => {
                    this.props.addalert(err)
                    this.setState(Object.assign({}, this.state, {sending: false}))
                })
            }), `Would you want to update Stock Total permanently?`)
        } else {
            this.setState(Object.assign({}, this.state, {sending: true}), () => {
                api('/api/stock/updateTotal/0', {info: this._info}, 'PUT').then(result => {
                    if (real) {
                        this._info = [];
                    }
                    this.setState(Object.assign({}, this.state, this._input.initValue(), {sending: false, total: result}))
                }).catch(err => {
                    this.props.addalert(err)
                    this.setState(Object.assign({}, this.state, {sending: false}))
                })
            })
        }
    },
    render: function() {
        if(!this.state.total || !this.props.open) {
            return null;
        }
        const totals = this.state.total;
        const rows = totals.stock.map(v => {
            const dropList = [];
            dropList.push({title: `Type: ${v.type}`, onclick: () => {}, key: 0})
            dropList.push({title: `Count: ${v.count}`, onclick: () => {}, key: 1})
            dropList.push({title: `Price: ${v.price}`, onclick: () => {}, key: 2})
            dropList.push({title: `+/-: ${v.plus}/${v.minus}`, onclick: () => {}, key: 3})
            const percent = totals.total === 0 ? 0 : Math.floor(v.current / totals.total * 100);
            return (
                <div className="input-group" key={key++}>
                    <div style={{content: '\A', position: 'absolute', background: 'grey', top: 0, bottom: 0, left:0, width:`${percent}%`, opacity: 0.4, zIndex: MEDIA_ZINDEX}} />
                    <span className="form-control" style={{wordBreak: 'break-all', wordWrap: 'break-word', height: 'auto'}}>{v.name}: {v.current}({percent}%) / {`${Math.floor((v.current - v.cost) * 100) / 100}(${(v.plus - v.minus === 0) ? 0 : Math.floor((v.current - v.cost - v.minus)/(v.plus - v.minus) * 100)}%)`}</span>
                    <Dropdown headelement="span" className="input-group-btn" style={{left: 'auto', right: '0px', top: '0px'}} droplist={dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </div>
            )
        });
        return (
            <section id="stock-total-section" className="panel panel-warning" style={{maxWidth: '500px', marginBottom: '0px', float: 'right', position: 'fixed', bottom: '0px', zIndex: FILE_ZINDEX}}>
                <div className="panel-heading" onClick={e => killEvent(e, this.props.toggle)}>
                    <h4 className="panel-title">
                        Total: {totals.remain}{`(${totals.total === 0 ? 0 : Math.floor(totals.remain / totals.total * 100)}%)`} / {totals.total}<i className="pull-right glyphicon glyphicon-remove"></i>
                    </h4>
                </div>
                <div className="panel-body" style={{overflowX: 'hidden', overflowY: 'auto', minHeight: '40vh', maxHeight: '80vh', padding: '0px'}}>
                    {rows}
                </div>
                <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                    <div className="input-group">
                        <span className="input-group-btn">
                            <Tooltip tip="儲存至後台" place="top" />
                            <button type="button" className="btn btn-default" onClick={() => this._update(true)} disabled={this.state.sending}>
                                <i className="glyphicon glyphicon-ok"></i>
                            </button>
                        </span>
                        <UserInput
                            val={this.state.stock}
                            getinput={this._input.getInput('stock')}
                            placeholder="New stock..." />
                        <span className="input-group-btn">
                            <Tooltip tip="更新股票" place="top" />
                            <button className="btn btn-default" type="submit" disabled={this.state.sending}>
                                <i className="glyphicon glyphicon-plus"></i>
                            </button>
                        </span>
                    </div>
                </form>
            </section>
        )
    }
})

export default StockTotal
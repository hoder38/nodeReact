import React from 'react'
import UserInput from './UserInput'
import Tooltip from './Tooltip'
import { killEvent, checkInput, api } from '../utility'
import { FILE_ZINDEX } from '../constants'

const FitnessInfo = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['name', 'price', 'desc', 'exchange'], this._handleSubmit, this._handleChange);
        return Object.assign({edit: this.props.item.newable ? true : false}, this._input.initValue(this.props.item));
    },
    componentDidMount: function() {
        if (this.props.item.newable) {
            this._input.initFocus()
        }
    },
    componentDidUpdate: function(prevProps, prevState) {
        if (this.state.edit && !prevState.edit) {
            this._input.initFocus()
        }
    },
    _handleSubmit: function() {
        if (this.state.edit) {
            const set_obj = Object.assign({},
                checkInput('name', this.state, this.props.addalert, this.props.item.name, 'name'),
                checkInput('price', this.state, this.props.addalert, this.props.item.price, 'int'),
                checkInput('desc', this.state, this.props.addalert, this.props.item.desc, 'desc'))
            if (this.props.item.newable) {
                if (!set_obj.hasOwnProperty('name')) {
                    this.props.addalert('Please input name!!!')
                } else if (!set_obj.hasOwnProperty('price')) {
                    this.props.addalert('Please input price!!!')
                } else if (!set_obj.hasOwnProperty('desc')) {
                    this.props.addalert('Please input description!!!')
                } else {
                    api('/api/fitness/newRow', set_obj).then(result => this.props.onclose()).catch(err => this.props.addalert(err))
                }
            } else {
                if (Object.keys(set_obj).length > 0) {
                    this.props.setLatest(this.props.item.id, this.props.bookmark)
                    api(`/api/fitness/editRow/${this.props.item.id}`, set_obj, 'PUT').then(info => this.props.onclose()).catch(err => this.props.addalert(err))
                } else {
                    this.props.onclose()
                }
            }
        } else {
            this.props.onclose()
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    },
    _exchange: function(id) {
        const set_obj = checkInput('exchange', this.state, this.props.addalert, '', 'int');
        if (set_obj) {
            api(`/api/fitness/exchange/${id}`, set_obj, 'PUT').then(result => {
                this.props.basicset(result.point);
                this.setState(Object.assign({}, this.state, {exchange: ''}));
            }).catch(err => this.props.addalert(err))
        }
    },
    render: function() {
        const item = this.props.item
        const price = (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button">
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        )
        const desc = item.desc ? (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button">
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        ) : null
        const edit = (!this.props.item.newable && this.props.level === 2) ? (
            <button className="btn btn-warning" type="button" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                <i className="glyphicon glyphicon-edit"></i>
            </button>
        ) : null;
        const exchangee = (
            <div className="input-group">
                <span key={0} />
                <span key={1} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._exchange(this.props.item.id))}>
                        <Tooltip tip="兌換點數" place="top" />
                        <i className="glyphicon glyphicon-usd"></i>
                    </button>
                </span>
            </div>
        )
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
                        <h3 className="panel-title">Item Details<i className="pull-right glyphicon glyphicon-remove"></i></h3>
                    </div>
                    <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                        <div className="panel-body">
                            <button className="btn btn-success" type="submit">
                                <i className="glyphicon glyphicon-ok"></i>
                            </button>
                            {edit}
                        </div>
                        <div className="panel-footer"  style={{
                            overflowY: 'scroll',
                            maxHeight: '60vh',
                        }}>
                            <UserInput
                                val={this.state.name}
                                getinput={this._input.getInput('name')}
                                edit={this.state.edit}
                                placeholder="Name">
                                <strong />
                            </UserInput>
                            <br />
                            <table className="table table-user-information">
                                <tbody>
                                    <UserInput
                                        val={decodeURIComponent(this.state.desc)}
                                        type='textarea'
                                        getinput={this._input.getInput('desc')}
                                        edit={this.state.edit}
                                        placeholder="Description">
                                        <tr>
                                            <td key={0}>Description:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.price}
                                        getinput={this._input.getInput('price')}
                                        edit={this.state.edit}
                                        placeholder="Price">
                                        <tr>
                                            <td key={0}>Price:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.props.item.count}
                                        edit={false}>
                                        <tr>
                                            <td key={0}>Count:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.props.point}
                                        edit={false}>
                                        <tr>
                                            <td key={0}>Point:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.exchange}
                                        getinput={this._input.getInput('exchange')}
                                        tage={exchangee}
                                        placeholder="0">
                                        <tr>
                                            <td key={0}>Exchange:</td>
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
});

export default FitnessInfo
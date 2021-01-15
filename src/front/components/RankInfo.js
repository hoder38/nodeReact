import React from 'react'
import { FILE_ZINDEX, FITNESS } from '../constants.js'
import UserInput from './UserInput.js'
import { killEvent, checkInput, api } from '../utility.js'

class RankInfo extends React.Component {
    constructor(props) {
        super(props);
        this._input = new UserInput.Input(['name'], this._handleSubmit, this._handleChange);
        this.state = Object.assign({
            select: [],
            item: '',
        }, this._input.initValue());
    }
    componentDidMount() {
        api('/api/rank/getItem').then(result => {
            this.setState(Object.assign({}, this.state, {select: result.item.map((v, i) => <option value={v.id} key={i}>{v.name}</option>)}, (result.item.length > 0) ? {item: result.item[0].id} : {}));
        }).catch(err => this.props.addalert(err));
        this._input.initFocus()
    }
    _handleSubmit = () => {
        if (this.props.level !== 2) {
            this.props.addalert('permission denied!!!');
        }
        const set_obj = Object.assign({item: this.state.item},
            checkInput('name', this.state, this.props.addalert));
        if (!set_obj.hasOwnProperty('name')) {
            this.props.addalert('Please input name!!!')
        } else if (!set_obj['item']) {
            this.props.addalert('Please select item!!!')
        } else {
             api('/api/rank/newRow', set_obj).then(result => this.props.onclose()).catch(err => this.props.addalert(err))
        }
    }
    _handleChange = () => {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    }
    _handleOpt = e => {
        this.setState(Object.assign({}, this.state, {item: e.target.value}));
    }
    render() {
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
                        <h3 className="panel-title">Rank Details<i className="pull-right glyphicon glyphicon-remove"></i></h3>
                    </div>
                    <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                        <div className="panel-body">
                            <button className="btn btn-success" type="submit">
                                <i className="glyphicon glyphicon-ok"></i>
                            </button>
                        </div>
                        <div className="panel-footer"  style={{
                            overflowY: 'scroll',
                            maxHeight: '60vh',
                        }}>
                            <UserInput
                                val={this.state.name}
                                getinput={this._input.getInput('name')}
                                placeholder="Name">
                                <strong />
                            </UserInput>
                            <br />
                            <table className="table table-user-information">
                                <tbody>
                                    <tr>
                                        <td>Item:</td>
                                        <td>
                                            <select onChange={this._handleOpt} value={this._item}>
                                                {this.state.select}
                                            </select>
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
}

export default RankInfo
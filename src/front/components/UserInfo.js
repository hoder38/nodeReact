import React from 'react'
import UserInput from './UserInput'
import { isValidString, api, killEvent, checkInput } from '../utility'

const UserInfo = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['name', 'auto', 'kindle', 'perm', 'desc', 'unDay', 'unHit', 'newPwd', 'conPwd'], this._handleSubmit, this._handleChange)
        const edit = this.props.user.newable ? true : false
        return Object.assign({edit}, this._input.initValue(this.props.user))
    },
    componentDidUpdate: function(prevProps, prevState) {
        if (this.state.edit && !prevState.edit) {
            this._input.initFocus()
        }
    },
    _handleSubmit: function() {
        const set_obj = Object.assign({},
            checkInput('name', this.state, this.props.addalert, this.props.user.name, 'name'),
            checkInput('auto', this.state, this.props.addalert, this.props.user.auto, 'url'),
            checkInput('kindle', this.state, this.props.addalert, this.props.user.kindle, 'email'),
            checkInput('perm', this.state, this.props.addalert, this.props.user.perm, 'perm'),
            checkInput('desc', this.state, this.props.addalert, this.props.user.desc, 'desc'),
            checkInput('unDay', this.state, this.props.addalert, this.props.user.unDay, 'int'),
            checkInput('unHit', this.state, this.props.addalert, this.props.user.unHit, 'int'),
            checkInput('newPwd', this.state, this.props.addalert, this.state.conPwd, 'passwd', 'conPwd'))
        if (this.props.user.newable) {
            if (!set_obj.hasOwnProperty('name')) {
                this.props.addalert('Please input username!!!')
            } else if (!set_obj.hasOwnProperty('perm')) {
                this.props.addalert('Please input level!!!')
            } else if (!set_obj.hasOwnProperty('desc')) {
                this.props.addalert('Please input description!!!')
            } else if (!set_obj.hasOwnProperty('newPwd')) {
                this.props.addalert('Please input password!!!')
            } else {
                this.props.sendglbpw(userPW => {
                    if (!isValidString(userPW, 'passwd')) {
                        this.props.addalert('User password not vaild!!!')
                        return Promise.reject('User password not vaild!!!')
                    } else {
                        set_obj['userPW'] = userPW
                        return api('/api/user/act', set_obj)
                        .then(user => {
                            this.props.addUser(user)
                            this.setState(Object.assign({}, this.state, this._input.initValue(this.props.user)))
                        }).catch(err => {
                            this.props.addalert(err)
                            throw err
                        })
                    }
                })
            }
        } else {
            if (Object.keys(set_obj).length > 0) {
                this.props.sendglbpw(userPW => {
                    if (!isValidString(userPW, 'passwd')) {
                        this.props.addalert('User password not vaild!!!')
                        return Promise.reject('User password not vaild!!!')
                    } else {
                        set_obj['userPW'] = userPW
                        return api(`/api/user/act/${this.props.user.id}`, set_obj, 'PUT')
                        .then(info => {
                            if (info.hasOwnProperty('owner')) {
                                this.props.setbasic(info.owner)
                                delete info.owner
                            }
                            this.props.addUser(Object.assign({}, this.props.user, info))
                            this.setState(Object.assign({
                                edit: !this.state.edit
                            }, this._input.initValue(this.props.user)))
                        }).catch(err => {
                            this.props.addalert(err)
                            throw err
                        })
                    }
                })
            } else {
                this.setState(Object.assign({
                    edit: !this.state.edit
                }, this._input.initValue(this.props.user)))
            }
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    },
    _delUser: function() {
        this.props.sendglbcf(() => this.props.sendglbpw(userPW => {
            if (!isValidString(userPW, 'passwd')) {
                this.props.addalert('User password not vaild!!!')
                return Promise.reject('User password not vaild!!!')
            } else {
                return api(`/api/user/del/${this.props.user.id}`, {userPW}, 'PUT')
                .then(info => {
                    this.props.delUser(this.props.user.id)
                }).catch(err => {
                    this.props.addalert(err)
                    throw err
                })
            }
        }), `Would you sure to delete USER: ${this.props.user.name} ?`)
    },
    _showCode: function() {
        api('/api/user/verify').then(info => alert(info.verify)).catch(err => this.props.addalert(err));
    },
    render: function() {
        const editClick = () => {
            this.setState(Object.assign({
                edit: !this.state.edit
            }, this._input.initValue(this.props.user)))
        }
        const verify_btn = this.props.user.verify ? (
            <button className="btn btn-primary" type="button" onClick={this._showCode}>
                <i className="glyphicon glyphicon-barcode"></i>
            </button>
        ) : '';
        const edit_btn = this.props.user.newable ? '' : (
            <button className="btn btn-warning" type="button" onClick={editClick}>
                <i className={this.state.edit ? 'glyphicon glyphicon-check' : 'glyphicon glyphicon-edit'}></i>
            </button>
        )
        let remove_btn = ''
        if (this.state.edit) {
            remove_btn = (
                <button className="btn btn-success" type="submit" >
                    <i className="glyphicon glyphicon-ok"></i>
                </button>
            )
        } else {
            remove_btn = this.props.user.delable ? (
                <button className="btn btn-danger" type="button" onClick={this._delUser}>
                    <i className="glyphicon glyphicon-remove"></i>
                </button>
            ) : ''
        }
        return (
            <div className="col-xs-12 col-sm-12 col-md-10 col-lg-10 col-xs-offset-0 col-sm-offset-0 col-md-offset-1 col-lg-offset-1">
                <div className={this.props.user.newable ? 'panel panel-info' : 'panel panel-primary'}>
                    <div className="panel-heading">
                        <h3 className="panel-title">User profile</h3>
                    </div>
                    <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                        <div className="panel-body">
                            {edit_btn}
                            {remove_btn}
                            {verify_btn}
                        </div>
                        <div className="panel-footer">
                            <div className="row">
                                <div className="col-md-3 col-lg-3">
                                    <img className="img-circle" src="/public/user-photo-big.png" alt="User Pic" />
                                </div>
                                <div className="col-md-9 col-lg-9">
                                    <span>
                                        <UserInput
                                            val={this.state.name}
                                            getinput={this._input.getInput('name')}
                                            edit={this.state.edit}
                                            placeholder="Username">
                                            <strong />
                                        </UserInput>
                                        <br />
                                    </span>
                                    <table className="table table-user-information">
                                        <tbody>
                                            <UserInput
                                                val={this.state.auto}
                                                getinput={this._input.getInput('auto')}
                                                edit={this.state.edit&&this.props.user.editAuto}>
                                                <tr>
                                                    <td key={0}>Auto upload:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.kindle}
                                                getinput={this._input.getInput('kindle')}
                                                edit={this.state.edit&&this.props.user.editKindle}>
                                                <tr>
                                                    <td key={0}>Kindle email:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.perm}
                                                getinput={this._input.getInput('perm')}
                                                show={this.props.user.hasOwnProperty('perm')}
                                                edit={this.state.edit}
                                                placeholder="Level">
                                                <tr>
                                                    <td key={0}>User level:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.desc}
                                                getinput={this._input.getInput('desc')}
                                                show={this.props.user.hasOwnProperty('desc')}
                                                edit={this.state.edit}
                                                placeholder="Description">
                                                <tr>
                                                    <td key={0}>Description:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.unDay}
                                                getinput={this._input.getInput('unDay')}
                                                show={this.props.user.hasOwnProperty('unDay')}
                                                edit={this.state.edit}>
                                                <tr>
                                                    <td key={0}>Unactive Day:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.unHit}
                                                getinput={this._input.getInput('unHit')}
                                                show={this.props.user.hasOwnProperty('unHit')}
                                                edit={this.state.edit}>
                                                <tr>
                                                    <td key={0}>Unactive Hit:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.newPwd}
                                                getinput={this._input.getInput('newPwd')}
                                                edit={this.state.edit}
                                                show={this.state.edit}
                                                type="password"
                                                placeholder="6~20個英數、!、@、#、$、%">
                                                <tr>
                                                    <td key={0}>New Password:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                            <UserInput
                                                val={this.state.conPwd}
                                                getinput={this._input.getInput('conPwd')}
                                                edit={this.state.edit}
                                                show={this.state.edit}
                                                type="password"
                                                placeholder="Confirm Password">
                                                <tr>
                                                    <td key={0} >Confirm Password:</td>
                                                    <td key={1} />
                                                </tr>
                                            </UserInput>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        )
    }
})

export default UserInfo
import React from 'react'
import UserInput from './UserInput'
import Tooltip from './Tooltip'
import { killEvent, clearText, checkInput, api, isValidString } from '../utility'
import { FILE_ZINDEX, COPY_HERE } from '../constants'

const PasswordInfo = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['name', 'username', 'password', 'password2', 'url', 'email'], this._handleSubmit, this._handleChange)
        this._important = null
        this._password = ''
        this._password2 = ''
        this._pwdShow = COPY_HERE
        this._pwd2Show = COPY_HERE
        return Object.assign({
            edit: this.props.item.newable ? true : false,
            pwdShow: false,
            pwd2Show: false,
            important: this.props.item.important ? true : false,
        }, this._input.initValue(this.props.item))
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
            const important = this.state.important !== this.props.item.important ? {important: this.state.important} : {}
            const set_obj = Object.assign({},
                checkInput('name', this.state, this.props.addalert, this.props.item.name, 'name'),
                checkInput('username', this.state, this.props.addalert, this.props.item.username, 'name'),
                checkInput('email', this.state, this.props.addalert, this.props.item.email, 'email'),
                checkInput('url', this.state, this.props.addalert, this.props.item.url, 'url'),
                checkInput('password', this.state, this.props.addalert, this.state.password2, 'altpwd', 'conpassword'),
                important)
            if (this.props.item.newable) {
                if (!set_obj.hasOwnProperty('name')) {
                    this.props.addalert('Please input name!!!')
                } else if (!set_obj.hasOwnProperty('username')) {
                    this.props.addalert('Please input username!!!')
                } else if (!set_obj.hasOwnProperty('important')) {
                    this.props.addalert('Please input important!!!')
                } else if (!set_obj.hasOwnProperty('password')) {
                    this.props.addalert('Please input password!!!')
                } else {
                    if (set_obj['important']) {
                        this.props.sendglbpw(userPW => {
                            if (!isValidString(userPW, 'passwd')) {
                                this.props.addalert('User password not vaild!!!')
                                return Promise.reject('User password not vaild!!!')
                            } else {
                                set_obj['userPW'] = userPW
                                return api('/api/password/newRow', set_obj).then(result => this.props.onclose()).catch(err => {
                                    this.props.addalert(err)
                                    throw err
                                })
                            }
                        })
                    } else {
                        api('/api/password/newRow', set_obj).then(result => this.props.onclose()).catch(err => this.props.addalert(err))
                    }
                }
            } else {
                if (Object.keys(set_obj).length > 0) {
                    if (set_obj['important'] || this.props.item.important) {
                        this.props.sendglbpw(userPW => {
                            if (!isValidString(userPW, 'passwd')) {
                                this.props.addalert('User password not vaild!!!')
                                return Promise.reject('User password not vaild!!!')
                            } else {
                                set_obj['userPW'] = userPW
                                this.props.setLatest(this.props.item.id, this.props.bookmark)
                                return api(`/api/password/editRow/${this.props.item.id}`, set_obj, 'PUT').then(info => this.props.onclose()).catch(err => {
                                    this.props.addalert(err)
                                    throw err
                                })
                            }
                        })
                    } else {
                        this.props.setLatest(this.props.item.id, this.props.bookmark)
                        api(`/api/password/editRow/${this.props.item.id}`, set_obj, 'PUT').then(info => this.props.onclose()).catch(err => this.props.addalert(err))
                    }
                } else {
                    this.props.onclose()
                }
            }
        } else {
            this.props.onclose()
        }
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue(), {important: this._important.checked}))
    },
    _selectValue: function(target, important=true, id='') {
        if ((target === 'password' || target === 'password2') && !this[target === 'password' ? '_password' : '_password2']) {
            this._getPassword(important, target === 'password' ? false : true, id, () => {
                this._input.ref.get(target).focus()
                this._input.ref.get(target).selectionStart = 0
            })
        } else {
            this._input.ref.get(target).focus()
            this._input.ref.get(target).selectionStart = 0
        }
    },
    _copyValue: function(e, value) {
        e.clipboardData.setData('text/plain', value)
        e.preventDefault()
        e.stopPropagation()
    },
    _getPassword: function(important, isPre, id, callback) {
        important ? this.props.sendglbpw(userPW => {
            if (!isValidString(userPW, 'passwd')) {
                this.props.addalert('User password not vaild!!!')
                return Promise.reject('User password not vaild!!!')
            } else {
                return api(`/api/password/getPW/${id}${isPre ? '/pre' : ''}`, {userPW}, 'PUT').then(result => {
                    this.props.setLatest(id, this.props.bookmark)
                    isPre ? this._password2 = result.password : this._password = result.password
                    callback()
                }).catch(err => {
                    this.props.addalert(err)
                    throw err
                })
            }
        }) : api(`/api/password/getPW/${id}${isPre ? '/pre' : ''}`, {}, 'PUT').then(result => {
            this.props.setLatest(id, this.props.bookmark)
            isPre ? this._password2 = result.password : this._password = result.password
            callback()
        }).catch(err => this.props.addalert(err))
    },
    _generatePassword: function(type) {
        api(`/api/password/generate/${type}`).then(result => {
            this.setState(Object.assign({}, this.state, {
                password: result.password,
                password2: result.password,
            }))
        }).catch(err => this.props.addalert(err))
    },
    _showPassword: function(important, id, isPre=false) {
        const show = isPre ? 'pwd2Show' : 'pwdShow'
        const pwd = isPre ? '_pwd2Show' : '_pwdShow'
        const password = isPre ? '_password2' : '_password'
        if (this.state[show]) {
            this[pwd] = COPY_HERE
            this.setState(Object.assign({}, this.state, {[show]: false}))
        } else {
            if (!this[password]) {
                this._getPassword(important, isPre, id, () => {
                    this[pwd] = clearText(this[password])
                    this.setState(Object.assign({}, this.state, {[show]: true}))
                })
            } else {
                this[pwd] = clearText(this[password])
                this.setState(Object.assign({}, this.state, {[show]: true}))
            }
        }
    },
    render: function() {
        const item = this.props.item
        const username = (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._selectValue('username'))}>
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        )
        const important = this.state.edit ? (
            <input
                type="checkbox"
                className="form-control"
                checked={this.state.important}
                ref={ref => this._important = ref}
                onChange={this._handleChange} />
        ) : item.important ? 'Yes' : 'No'
        const password1 = (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._selectValue('password', item.important, item.id))}>
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._showPassword(item.important, item.id))}>
                        <i className={this.state.pwdShow ? 'glyphicon glyphicon-eye-close' : 'glyphicon glyphicon-eye-open'}></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        )
        const password1e = (
            <div className="input-group">
                <span key={0} />
                <span key={1} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._generatePassword(1))}>
                        <Tooltip tip="產生密碼" place="top" />
                        <i className="glyphicon glyphicon-refresh"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._generatePassword(2))}>
                        <Tooltip tip="產生密碼(字母數字)" place="top" />
                        <i className="glyphicon glyphicon-refresh"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._generatePassword(3))}>
                        <Tooltip tip="產生密碼(數字)" place="top" />
                        <i className="glyphicon glyphicon-refresh"></i>
                    </button>
                </span>
            </div>
        )
        const password2 = (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._selectValue('password2', item.important, item.id))}>
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._showPassword(item.important, item.id, true))}>
                        <i className={this.state.pwd2Show ? 'glyphicon glyphicon-eye-close' : 'glyphicon glyphicon-eye-open'}></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        )
        const url = item.url ? (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._selectValue('url'))}>
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this.props.gourl(item.url))}>
                        <i className="glyphicon glyphicon-share-alt"></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        ) : null
        const email = item.email ? (
            <div className="input-group">
                <span key={0} className="input-group-btn">
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this._selectValue('email'))}>
                        <i className="glyphicon glyphicon-copy"></i>
                    </button>
                    <button className="btn btn-primary" type="button" onClick={e => killEvent(e, () => this.props.goemail(item.email))}>
                        <i className="glyphicon glyphicon-share-alt"></i>
                    </button>
                </span>
                <span key={1} />
            </div>
        ) : null
        const edit = this.props.item.newable ? null : (
            <button className="btn btn-warning" type="button" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                <i className="glyphicon glyphicon-edit"></i>
            </button>
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
                        <h3 className="panel-title">Password Details<i className="pull-right glyphicon glyphicon-remove"></i></h3>
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
                                        val={this.state.username}
                                        getinput={this._input.getInput('username')}
                                        edit={this.state.edit}
                                        placeholder="Username"
                                        tagv={username}
                                        copy={e => this._copyValue(e, this.state.username)}>
                                        <tr>
                                            <td key={0}>Username:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.password}
                                        type="password"
                                        getinput={this._input.getInput('password')}
                                        edit={this.state.edit}
                                        placeholder="2~30個英數、!、@、#、$、%"
                                        tagv={password1}
                                        tage={password1e}
                                        copy={e => this._copyValue(e, this._password)}
                                        copyShow={this._pwdShow}>
                                        <tr>
                                            <td key={0}>Password:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.password2}
                                        type="password"
                                        getinput={this._input.getInput('password2')}
                                        edit={this.state.edit}
                                        placeholder="Confirm Password"
                                        tagv={password2}
                                        copy={e => this._copyValue(e, this._password2)}
                                        copyShow={this._pwd2Show}>
                                        <tr>
                                            <td key={0}>{this.state.edit ? 'Confirm Password:' : 'Previous Password:'}</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <tr>
                                        <td>Important:</td>
                                        <td>{important}</td>
                                    </tr>
                                    <UserInput
                                        val={decodeURIComponent(this.state.url)}
                                        getinput={this._input.getInput('url')}
                                        edit={this.state.edit}
                                        placeholder="Url (Option)"
                                        tagv={url}
                                        copy={e => this._copyValue(e, decodeURIComponent(this.state.url))}>
                                        <tr>
                                            <td key={0}>Url:</td>
                                            <td key={1} />
                                        </tr>
                                    </UserInput>
                                    <UserInput
                                        val={this.state.email}
                                        getinput={this._input.getInput('email')}
                                        edit={this.state.edit}
                                        placeholder="Email (Option)"
                                        tagv={email}
                                        copy={e => this._copyValue(e, this.state.email)}>
                                        <tr>
                                            <td key={0}>Email:</td>
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

export default PasswordInfo
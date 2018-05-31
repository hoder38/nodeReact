import React from 'react'
import { isValidString } from '../utility'
import ReAlertlist from '../containers/ReAlertlist'
import { browserHistory } from 'react-router'
import { doLogin, killEvent } from '../utility'
import UserInput from './UserInput'

const Login = React.createClass({
    getInitialState: function() {
        this._input = new UserInput.Input(['username', 'password'], this._handleSubmit, this._handleChange, 'form-control input-lg')
        return this._input.initValue()
    },
    componentDidMount: function() {
        this._input.initFocus()
    },
    _handleChange: function() {
        this.setState(this._input.getValue())
    },
    _handleSubmit: function() {
        if (isValidString(this.state.username, 'name') && (isValidString(this.state.password, 'passwd') || isValidString(this.state.password, 'verify'))) {
            doLogin(this.state.username, this.state.password)
            .then(() => {
                this.setState(this._input.initValue())
                browserHistory.goBack()
            }).catch(err => {
                this.props.addalert(err)
                this.setState(this._input.initValue())
                this._input.initFocus()
            })
        } else {
            this.props.addalert('user name or password is not vaild!!!')
            this.setState(this._input.initValue())
            this._input.initFocus()
        }
    },
    render: function() {
        return (
            <div>
                <ReAlertlist />
                <div className="modal-content">
                    <div className="modal-header">
                        <h1 className="text-center">Login</h1>
                    </div>
                    <div className="modal-body">
                        <form className="form col-md-12 center-block" onSubmit={e => killEvent(e, this._handleSubmit)}>
                            <UserInput
                                val={this.state.username}
                                getinput={this._input.getInput('username')}
                                placeholder="Username">
                                <div className="form-group" />
                            </UserInput>
                            <UserInput
                                val={this.state.password}
                                getinput={this._input.getInput('password')}
                                placeholder="Password"
                                type="password">
                                <div className="form-group" />
                            </UserInput>
                            <div className="form-group">
                                <button type="submit" className="btn btn-primary btn-lg btn-block">
                                    Sign In
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="modal-footer">
                    </div>
                </div>
            </div>
        )
    }
})

export default Login
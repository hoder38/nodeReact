import React from 'react'
import { BLOCK_ZINDEX, AUTH_TIME } from '../constants'
import UserInput from './UserInput'
import { killEvent } from '../utility'

let global_password = {}

let auth_timer = {}

const GlobalPassword = React.createClass({
    getInitialState: function() {
        if (this.props.delay && !global_password[this.props.delay]) {
            global_password[this.props.delay] = null
        }
        this._input = new UserInput.Input(['userPW'], this._handleSubmit, this._handleChange)
        return this._input.initValue()
    },
    componentDidMount: function() {
        this._input.initFocus()
    },
    _handleSubmit: function() {
        Promise.resolve(this.props.callback(this.state.userPW)).then(() => {
            if (this.props.delay) {
                global_password[this.props.delay] = 'goodboy'
                auth_timer[this.props.delay] = setTimeout(() => {
                    global_password[this.props.delay] = null
                }, AUTH_TIME)
            }
            this.props.onclose()
        }).catch(err => {
            if (this.props.delay) {
                global_password[this.props.delay] = null
                clearTimeout(auth_timer[this.props.delay])
            }
            this.setState(this._input.initValue())
        })
    },
    _handleChange: function() {
        this.setState(this._input.getValue())
    },
    render: function() {
        if (!this.props.delay || global_password[this.props.delay] === null) {
            return (
                <section style={{position: 'fixed', zIndex: BLOCK_ZINDEX, top: '0px', right: '0px', width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.3)'}}>
                    <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                        <div className="input-group" style={{top: '150px', margin: '0px auto', width: '500px'}}>
                            <span className="input-group-btn">
                                <button className="btn btn-danger" type="button" onClick={this.props.onclose}>
                                    <i className="glyphicon glyphicon-remove"></i>
                                </button>
                            </span>
                            <UserInput
                                val={this.state.userPW}
                                getinput={this._input.getInput('userPW')}
                                type="password"
                                placeholder="Password" />
                            <span className="input-group-btn">
                                <button className="btn btn-danger" type="submit">
                                    <span className="glyphicon glyphicon-ok"></span>
                                </button>
                            </span>
                        </div>
                    </form>
                </section>
            )
        } else {
            Promise.resolve(this.props.callback(global_password[this.props.delay]))
            .then(() => this.props.onclose())
            .catch(err => {
                global_password[this.props.delay] = null
                clearTimeout(auth_timer[this.props.delay])
                this.setState(this._input.initValue())
            })
            return null
        }
    }
})

export default GlobalPassword
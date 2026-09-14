import React from 'react'
import { ROOT_PAGE, QRLOGIN } from '../constants.js'
import { isValidString } from '../utility.js'
import ReAlertlist from '../containers/ReAlertlist.js'
import { history } from '../configureStore.js'
import { doLogin, doQrLogin, killEvent, qrCreate, qrStatus, testLogin } from '../utility.js'
import UserInput from './UserInput.js'

const POLL_INTERVAL = 3000

class Login extends React.Component {
    constructor(props) {
        super(props);
        this._input = new UserInput.Input(['username', 'password'], this._handleSubmit, this._handleChange, 'form-control input-lg')
        this.state = Object.assign({}, this._input.initValue(), {
            qr: null,
            qrSerial: null,
            qrLeft: 0,
        })
    }
    componentDidMount() {
        this._input.initFocus()
        testLogin().then(() => history.push(ROOT_PAGE)).catch(err => console.log(err))
    }
    componentWillUnmount() {
        this._clearQr()
    }
    _clearQr = () => {
        if (this._qrWs) {
            this._qrWs.onmessage = null
            this._qrWs.onerror = null
            this._qrWs.onclose = null
            this._qrWs.close()
            this._qrWs = null
        }
        if (this._qrPoll) {
            clearInterval(this._qrPoll)
            this._qrPoll = null
        }
        if (this._qrTimer) {
            clearInterval(this._qrTimer)
            this._qrTimer = null
        }
        this._qrSecret = null
    }
    // The secret only ever lives here: the websocket carries the public serial.
    _qrFinish = serial => {
        if (!this._qrSecret || serial !== this.state.qrSerial) {
            return
        }
        const secret = this._qrSecret
        this._clearQr()
        doQrLogin(serial, secret).then(() => {
            this.setState(Object.assign({}, this.state, {qr: null, qrSerial: null, qrLeft: 0}))
            history.push(ROOT_PAGE)
        }).catch(err => {
            this.setState(Object.assign({}, this.state, {qr: null, qrSerial: null, qrLeft: 0}))
            this.props.addalert(err)
        })
    }
    _qrExpire = () => {
        this._clearQr()
        this.setState(Object.assign({}, this.state, {qr: null, qrSerial: null, qrLeft: 0}))
        this.props.addalert('QR code is expired, please try again')
    }
    _handleQrCode = () => {
        if (this.state.qr) {
            this._clearQr()
            this.setState(Object.assign({}, this.state, {qr: null, qrSerial: null, qrLeft: 0}))
            return
        }
        qrCreate().then(info => {
            this._clearQr()
            this._qrSecret = info.secret
            this.setState(Object.assign({}, this.state, {
                qr: info.qr,
                qrSerial: info.serial,
                qrLeft: info.expire,
            }))
            this._qrTimer = setInterval(() => {
                if (this.state.qrLeft <= 1) {
                    return this._qrExpire()
                }
                this.setState(Object.assign({}, this.state, {qrLeft: this.state.qrLeft - 1}))
            }, 1000)
            // Polling is the fallback when the websocket cannot be reached.
            const startPoll = () => {
                if (this._qrPoll) {
                    return
                }
                this._qrPoll = setInterval(() => qrStatus(info.serial).then(result => {
                    if (result.status === 'approved') {
                        this._qrFinish(info.serial)
                    } else if (result.status === 'expired') {
                        this._qrExpire()
                    }
                }).catch(err => console.log(err)), POLL_INTERVAL)
            }
            try {
                if (window.MozWebSocket) {
                    window.WebSocket = window.MozWebSocket
                }
                this._qrWs = new WebSocket(info.ws_url)
                this._qrWs.onerror = () => startPoll()
                this._qrWs.onclose = () => startPoll()
                this._qrWs.onmessage = message => {
                    try {
                        const wsmsg = JSON.parse(message.data)
                        if (wsmsg.type === QRLOGIN && wsmsg.data === info.serial && wsmsg.status === 'approved') {
                            this._qrFinish(info.serial)
                        }
                    } catch (e) {
                        console.log(e)
                    }
                }
            } catch (e) {
                startPoll()
            }
        }).catch(err => this.props.addalert(err))
    }
    _handleChange = () => {
        this.setState(this._input.getValue())
    }
    _handleSubmit = () => {
        if (isValidString(this.state.username, 'name') && isValidString(this.state.password, 'passwd')) {
            doLogin(this.state.username, this.state.password)
            .then(() => {
                this.setState(this._input.initValue())
                console.log(history);
                history.goBack()
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
    }
    render() {
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
                        <div className="form-group">
                            <button
                                type="button"
                                className="btn btn-default btn-lg btn-block"
                                onClick={this._handleQrCode}>
                                <span className="glyphicon glyphicon-qrcode" />
                                {this.state.qr ? ' Cancel QR Code' : ' Login with QR Code'}
                            </button>
                        </div>
                        {this.state.qr &&
                            <div className="text-center">
                                <img src={this.state.qr} alt="login qrcode" />
                                <p>Scan with your phone camera, then approve the login.</p>
                                <p>{`Expire in ${this.state.qrLeft}s`}</p>
                            </div>
                        }
                    </div>
                    <div className="modal-footer">
                    </div>
                </div>
            </div>
        )
    }
}

export default Login
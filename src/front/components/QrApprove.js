import React from 'react'
import { LOGIN_PAGE, ROOT_PAGE } from '../constants.js'
import ReAlertlist from '../containers/ReAlertlist.js'
import { history } from '../configureStore.js'
import { qrApprove, qrReject, qrStatus, testLogin } from '../utility.js'

class QrApprove extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            status: 'loading',
        }
    }
    componentDidMount() {
        const serial = this.props.match.params.serial
        testLogin().then(() => qrStatus(serial)).then(result => this.setState({
            status: result.status === 'pending' ? 'pending' : result.status,
        })).catch(err => {
            console.log(err)
            history.push(LOGIN_PAGE)
        })
    }
    // Approval is always an explicit tap: never auto-approve on page load.
    _handleApprove = () => {
        this.setState({status: 'sending'})
        qrApprove(this.props.match.params.serial)
        .then(() => this.setState({status: 'done'}))
        .catch(err => {
            this.props.addalert(err)
            this.setState({status: 'expired'})
        })
    }
    _handleReject = () => {
        qrReject(this.props.match.params.serial)
        .then(() => this.setState({status: 'rejected'}))
        .catch(err => this.props.addalert(err))
    }
    _renderBody() {
        switch (this.state.status) {
            case 'loading':
            return <p className="text-center">Checking QR code...</p>
            case 'pending':
            case 'sending':
            return (
                <div>
                    <p className="text-center">Allow a new login on the device that showed this QR code?</p>
                    <div className="form-group">
                        <button
                            type="button"
                            className="btn btn-primary btn-lg btn-block"
                            disabled={this.state.status === 'sending'}
                            onClick={this._handleApprove}>
                            Approve
                        </button>
                    </div>
                    <div className="form-group">
                        <button
                            type="button"
                            className="btn btn-default btn-lg btn-block"
                            disabled={this.state.status === 'sending'}
                            onClick={this._handleReject}>
                            Reject
                        </button>
                    </div>
                </div>
            )
            case 'done':
            return <p className="text-center">Login approved, please return to your computer.</p>
            case 'rejected':
            return <p className="text-center">Login rejected.</p>
            case 'approved':
            return <p className="text-center">This QR code is already used.</p>
            default:
            return <p className="text-center">This QR code is expired, please get a new one.</p>
        }
    }
    render() {
        return (
            <div>
                <ReAlertlist />
                <div className="modal-content">
                    <div className="modal-header">
                        <h1 className="text-center">QR Code Login</h1>
                    </div>
                    <div className="modal-body">
                        {this._renderBody()}
                    </div>
                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-link btn-block"
                            onClick={() => history.push(ROOT_PAGE)}>
                            Back to home
                        </button>
                    </div>
                </div>
            </div>
        )
    }
}

export default QrApprove

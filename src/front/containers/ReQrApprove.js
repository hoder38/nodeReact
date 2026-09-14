import { connect } from 'react-redux'
import { alertPush } from '../actions/index.js'
import QrApprove from '../components/QrApprove.js'

const mapDispatchToProps = dispatch => ({addalert: msg => dispatch(alertPush(msg))})

const ReQrApprove = connect(
    null,
    mapDispatchToProps
)(QrApprove)

export default ReQrApprove

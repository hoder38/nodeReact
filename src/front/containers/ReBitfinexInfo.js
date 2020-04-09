import { connect } from 'react-redux'
import { alertPush, sendGlbCf } from '../actions'
import BitfinexInfo from '../components/BitfinexInfo'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReBitfinexInfo = connect(
    null,
    mapDispatchToProps
)(BitfinexInfo)

export default ReBitfinexInfo
import { connect } from 'react-redux'
import { alertPush, sendGlbCf } from '../actions/index.js'
import BitfinexInfo from '../components/BitfinexInfo.js'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReBitfinexInfo = connect(
    mapStateToProps,
    mapDispatchToProps
)(BitfinexInfo)

export default ReBitfinexInfo
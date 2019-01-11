import { connect } from 'react-redux'
import { alertPush, sendGlbCf } from '../actions'
import StockTotal from '../components/StockTotal'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReStockTotal = connect(
    null,
    mapDispatchToProps
)(StockTotal)

export default ReStockTotal

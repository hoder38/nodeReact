import { connect } from 'react-redux'
import { alertPush } from '../actions'
import StockTotal from '../components/StockTotal'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
})

const ReStockTotal = connect(
    null,
    mapDispatchToProps
)(StockTotal)

export default ReStockTotal

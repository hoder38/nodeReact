import { connect } from 'react-redux'
import { alertPush, setStock } from '../actions/index.js'
import StockInfo from '../components/StockInfo.js'

const mapStateToProps = state => ({
    bookmark: state.stockDataHandle.item.bookmark,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    setLatest: (id, bookmark) => dispatch(setStock(null, id, bookmark)),
})

const ReStockInfo = connect(
    mapStateToProps,
    mapDispatchToProps
)(StockInfo)

export default ReStockInfo
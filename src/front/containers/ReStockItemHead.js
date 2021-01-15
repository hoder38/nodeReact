import { connect } from 'react-redux'
import { stockPush, alertPush, setStock, sendGlbIn } from '../actions/index.js'
import ItemHead from '../components/ItemHead.js'
import { STOCK } from '../constants.js'

const mapStateToProps = state => ({
    itemType: STOCK,
    select: state.stockDataHandle.select,
    sortName: state.stockDataHandle.item.sortName,
    sortType: state.stockDataHandle.item.sortType,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(stockPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setStock(item)),
    globalinput: callback => dispatch(sendGlbIn(1, callback, 'danger', 'New Tag...')),
})

const ReStockItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default ReStockItemHead
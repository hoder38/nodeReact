import { connect } from 'react-redux'
import { stockPush, alertPush, setStock, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { STOCK } from '../constants'

const mapStateToProps = state => ({
    itemType: STOCK,
    list: arrayMerge(state.stockDataHandle.item.list, state.stockDataHandle.list),
    more: state.stockDataHandle.item.more,
    sortName: state.stockDataHandle.item.sortName,
    sortType: state.stockDataHandle.item.sortType,
    page: state.stockDataHandle.item.page,
    pageToken: state.stockDataHandle.item.pageToken,
    multi: state.stockDataHandle.multi,
    latest: state.stockDataHandle.latest,
    select: state.stockDataHandle.select,
    dirs: state.sdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(stockPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setStock(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReStockItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReStockItemlist

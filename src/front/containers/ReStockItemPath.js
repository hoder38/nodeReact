import { connect } from 'react-redux'
import { stockPush, alertPush, sbookmarkPush, sendGlbIn, setStock } from '../actions/index.js'
import ItemPath from '../components/ItemPath.js'
import { STOCK } from '../constants.js'

const mapStateToProps = state => ({
    itemType: STOCK,
    current: state.stockDataHandle.path.cur,
    history: state.stockDataHandle.path.his,
    exact: state.stockDataHandle.path.exactly,
    sortName: state.stockDataHandle.item.sortName,
    sortType: state.stockDataHandle.item.sortType,
    multi: state.stockDataHandle.multi,
    bookmark: state.sbookmarkDataHandle.list,
    pathLength: state.stockDataHandle.path.cur ? state.stockDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    multiToggle: item => dispatch(setStock(null, null, null, item)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(stockPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    pushbookmark: bookmark => dispatch(sbookmarkPush(bookmark)),
    globalinput: (type, placeholder, callback) => dispatch(sendGlbIn(type, callback, 'default', placeholder)),
})

const ReStockItemPath = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPath)

export default ReStockItemPath

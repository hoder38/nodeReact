import { connect } from 'react-redux'
import { sbookmarkPush, sbookmarkPop, sdirPush, sdirPop, stockPush, alertPush, sendGlbIn } from '../actions'
import Categorylist from '../components/Categorylist'
import { STOCK } from '../constants'

const mapStateToProps = state => ({
    itemType: STOCK,
    sortName: state.stockDataHandle.item.sortName,
    sortType: state.stockDataHandle.item.sortType,
    multi: state.stockDataHandle.multi,
    edit: state.basicDataHandle.edit,
    bookmark: state.sbookmarkDataHandle,
    dirs: state.sdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    bookmarkset: (bookmark, sortName, sortType) => dispatch(sbookmarkPush(bookmark, sortName, sortType)),
    delbookmark: id => dispatch(sbookmarkPop(id)),
    dirset: (name, dir, sortName, sortType) => dispatch(sdirPush(name, dir, sortName, sortType)),
    deldir: (name, id) => dispatch(sdirPop(name, id)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(stockPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    globalinput: (type, callback, color, placeholder, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
})

const ReStockCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default ReStockCategorylist

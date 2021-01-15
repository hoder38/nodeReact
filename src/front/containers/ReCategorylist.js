import { connect } from 'react-redux'
import { bookmarkPush, bookmarkPop, dirPush, dirPop, itemPush, alertPush } from '../actions/index.js'
import Categorylist from '../components/Categorylist.js'
import { STORAGE } from '../constants.js'

const mapStateToProps = state => ({
    itemType: STORAGE,
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
    multi: state.itemDataHandle.multi,
    edit: state.basicDataHandle.edit,
    bookmark: state.ibookmarkDataHandle,
    dirs: state.idirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    bookmarkset: (bookmark, sortName, sortType) => dispatch(bookmarkPush(bookmark, sortName, sortType)),
    delbookmark: id => dispatch(bookmarkPop(id)),
    dirset: (name, dir, sortName, sortType) => dispatch(dirPush(name, dir, sortName, sortType)),
    deldir: (name, id) => dispatch(dirPop(name, id)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default ReCategorylist

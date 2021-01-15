import { connect } from 'react-redux'
import { itemPush, alertPush, bookmarkPush, feedbackPush, sendGlbIn, setItem } from '../actions/index.js'
import ItemPath from '../components/ItemPath.js'
import { STORAGE } from '../constants.js'

const mapStateToProps = state => ({
    itemType: STORAGE,
    current: state.itemDataHandle.path.cur,
    history: state.itemDataHandle.path.his,
    exact: state.itemDataHandle.path.exactly,
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
    multi: state.itemDataHandle.multi,
    bookmark: state.ibookmarkDataHandle.list,
    pathLength: state.itemDataHandle.path.cur ? state.itemDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    multiToggle: item => dispatch(setItem(null, null, null, item)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    pushbookmark: bookmark => dispatch(bookmarkPush(bookmark)),
    pushfeedback: feedback => dispatch(feedbackPush(feedback)),
    globalinput: (type, placeholder, callback) => dispatch(sendGlbIn(type, callback, 'default', placeholder)),
})

const ReItemPath = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPath)

export default ReItemPath
import { connect } from 'react-redux'
import { setItem, alertPush, sendGlbIn, feedbackPush, sendGlbCf, bookmarkPush, itemPush } from '../actions'
import ItemFile from '../components/ItemFile'

const mapStateToProps = state => ({
    select: state.itemDataHandle.select,
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
    bookmark: state.itemDataHandle.item.bookmark,
    mainUrl: state.basicDataHandle.url,
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    setLatest: (id, bookmark) => dispatch(setItem(null, id, bookmark)),
    setMedia: (type, id, opt, time=null) => dispatch(setItem(null, null, null, null, type, id, opt, time)),
    addalert: msg => dispatch(alertPush(msg)),
    globalinput: (type, callback, color, placeholder, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
    pushfeedback: feedback => dispatch(feedbackPush(feedback)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    pushbookmark: bookmark => dispatch(bookmarkPush(bookmark)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReItemFile = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemFile)

export default ReItemFile
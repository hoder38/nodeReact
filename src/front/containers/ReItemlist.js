import { connect } from 'react-redux'
import { itemPush, alertPush, setItem, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { STORAGE } from '../constants'

const mapStateToProps = state => ({
    itemType: STORAGE,
    list: arrayMerge(state.itemDataHandle.item.list, state.itemDataHandle.list),
    more: state.itemDataHandle.item.more,
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
    page: state.itemDataHandle.item.page,
    pageToken: state.itemDataHandle.item.pageToken,
    multi: state.itemDataHandle.multi,
    latest: state.itemDataHandle.latest,
    select: state.itemDataHandle.select,
    dirs: state.idirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setItem(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReItemlist
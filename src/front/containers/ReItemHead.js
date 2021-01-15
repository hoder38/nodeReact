import { connect } from 'react-redux'
import { itemPush, alertPush, setItem, sendGlbIn } from '../actions/index.js'
import { STORAGE } from '../constants.js'
import ItemHead from '../components/ItemHead.js'

const mapStateToProps = state => ({
    itemType: STORAGE,
    select: state.itemDataHandle.select,
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setItem(item)),
    globalinput: callback => dispatch(sendGlbIn(1, callback, 'danger', 'New Tag...')),
})

const ReItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default ReItemHead
import { connect } from 'react-redux'
import { sendGlbIn, itemPush } from '../actions'
import TopSection from '../components/TopSection'

const mapStateToProps = state => ({
    sortName: state.itemDataHandle.item.sortName,
    sortType: state.itemDataHandle.item.sortType,
    multi: state.itemDataHandle.multi,
    pathLength: state.itemDataHandle.path.cur ? state.itemDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    globalinput: callback => dispatch(sendGlbIn(0, callback, 'default', 'Search Tag...')),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReTopSection = connect(
    mapStateToProps,
    mapDispatchToProps
)(TopSection)

export default ReTopSection
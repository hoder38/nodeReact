import { connect } from 'react-redux'
import { rankPush, alertPush, rbookmarkPush, sendGlbIn, setRank } from '../actions/index.js'
import ItemPath from '../components/ItemPath.js'
import { RANK } from '../constants.js'

const mapStateToProps = state => ({
    itemType: RANK,
    current: state.rankDataHandle.path.cur,
    history: state.rankDataHandle.path.his,
    exact: state.rankDataHandle.path.exactly,
    sortName: state.rankDataHandle.item.sortName,
    sortType: state.rankDataHandle.item.sortType,
    multi: state.rankDataHandle.multi,
    bookmark: state.rbookmarkDataHandle.list,
    pathLength: state.rankDataHandle.path.cur ? state.rankDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    multiToggle: item => dispatch(setRank(null, null, null, item)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(rankPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    pushbookmark: bookmark => dispatch(rbookmarkPush(bookmark)),
    globalinput: (type, placeholder, callback) => dispatch(sendGlbIn(type, callback, 'default', placeholder)),
})

const ReRankItemPath = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPath)

export default ReRankItemPath
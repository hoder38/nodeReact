import { connect } from 'react-redux'
import { rbookmarkPush, rbookmarkPop, rdirPush, rdirPop, rankPush, alertPush } from '../actions'
import Categorylist from '../components/Categorylist'
import { RANK } from '../constants'

const mapStateToProps = state => ({
    itemType: RANK,
    sortName: state.rankDataHandle.item.sortName,
    sortType: state.rankDataHandle.item.sortType,
    multi: state.rankDataHandle.multi,
    edit: state.basicDataHandle.edit,
    bookmark: state.rbookmarkDataHandle,
    dirs: state.rdirDataHandle,
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    bookmarkset: (bookmark, sortName, sortType) => dispatch(rbookmarkPush(bookmark, sortName, sortType)),
    delbookmark: id => dispatch(rbookmarkPop(id)),
    dirset: (name, dir, sortName, sortType) => dispatch(rdirPush(name, dir, sortName, sortType)),
    deldir: (name, id) => dispatch(rdirPop(name, id)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(rankPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReRankCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default ReRankCategorylist
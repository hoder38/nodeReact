import { connect } from 'react-redux'
import { rankPush, alertPush, setRank, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { RANK } from '../constants'

const mapStateToProps = state => ({
    itemType: RANK,
    list: arrayMerge(state.rankDataHandle.item.list, state.rankDataHandle.list),
    more: state.rankDataHandle.item.more,
    sortName: state.rankDataHandle.item.sortName,
    sortType: state.rankDataHandle.item.sortType,
    page: state.rankDataHandle.item.page,
    pageToken: state.rankDataHandle.item.pageToken,
    multi: state.rankDataHandle.multi,
    latest: state.rankDataHandle.latest,
    select: state.rankDataHandle.select,
    dirs: state.rdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(rankPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setRank(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReRankItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReRankItemlist

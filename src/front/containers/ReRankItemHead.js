import { connect } from 'react-redux'
import { rankPush, alertPush, setRank, sendGlbIn } from '../actions/index.js'
import { RANK } from '../constants.js'
import ItemHead from '../components/ItemHead.js'

const mapStateToProps = state => ({
    itemType: RANK,
    select: state.rankDataHandle.select,
    sortName: state.rankDataHandle.item.sortName,
    sortType: state.rankDataHandle.item.sortType,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(rankPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setRank(item)),
    globalinput: callback => dispatch(sendGlbIn(1, callback, 'danger', 'New Tag...')),
})

const ReRankItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default ReRankItemHead
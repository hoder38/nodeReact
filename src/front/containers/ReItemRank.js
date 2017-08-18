import { connect } from 'react-redux'
import { setRank, sendGlbCf, alertPush } from '../actions'
import ItemRank from '../components/ItemRank'

const mapStateToProps = state => ({
    bookmark: state.rankDataHandle.item.bookmark,
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    setLatest: (id, bookmark) => dispatch(setRank(null, id, bookmark)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    addalert: msg => dispatch(alertPush(msg)),
})

const ReItemRank = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemRank)

export default ReItemRank

import { connect } from 'react-redux'
import { alertPush } from '../actions/index.js'
import RankInfo from '../components/RankInfo.js'

const mapStateToProps = state => ({
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
})

const ReRankInfo = connect(
    mapStateToProps,
    mapDispatchToProps
)(RankInfo)

export default ReRankInfo

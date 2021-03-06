import { connect } from 'react-redux'
import { alertPush, sendGlbCf, setRdirs, rdirPush} from '../actions/index.js'
import Rank from '../components/Rank.js'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    rdirsset: (dirs, rest) => dispatch(setRdirs(dirs, rest)),
    pushrdir: (name, dir) => dispatch(rdirPush(name, dir)),
})

const ReRank = connect(
    null,
    mapDispatchToProps
)(Rank)

export default ReRank
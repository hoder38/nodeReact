import { connect } from 'react-redux'
import { alertPush, sendGlbCf, setSdirs, sdirPush} from '../actions'
import Stock from '../components/Stock'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    sdirsset: (dirs, rest) => dispatch(setSdirs(dirs, rest)),
    pushsdir: (name, dir) => dispatch(sdirPush(name, dir)),
})

const ReStock = connect(
    null,
    mapDispatchToProps
)(Stock)

export default ReStock
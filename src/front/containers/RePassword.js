import { connect } from 'react-redux'
import { alertPush, sendGlbCf, setPdirs, pdirPush} from '../actions'
import Password from '../components/Password'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    pdirsset: (dirs, rest) => dispatch(setPdirs(dirs, rest)),
    pushpdir: (name, dir) => dispatch(pdirPush(name, dir)),
})

const RePassword = connect(
    null,
    mapDispatchToProps
)(Password)

export default RePassword
import { connect } from 'react-redux'
import { alertPush, sendGlbCf } from '../actions/index.js'
import Dirlist from '../components/Dirlist.js'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReDirlist = connect(
    null,
    mapDispatchToProps
)(Dirlist)

export default ReDirlist
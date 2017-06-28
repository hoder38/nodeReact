import { connect } from 'react-redux'
import { alertPush, sendGlbCf, sendGlbPw, sendGlbIn, setPass } from '../actions'
import ItemPassword from '../components/ItemPassword'

const mapStateToProps = state => ({
    bookmark: state.passDataHandle.item.bookmark,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    sendglbpw: callback => dispatch(sendGlbPw(callback)),
    globalinput: (type, callback, color, placeholder, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
    setLatest: (id, bookmark) => dispatch(setPass(null, id, bookmark)),
})

const ReItemPassword = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPassword)

export default ReItemPassword
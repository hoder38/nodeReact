import { connect } from 'react-redux'
import { alertPush, sendGlbPw, setBasic, sendGlbCf, userPush, userPop } from '../actions'
import UserInfo from '../components/UserInfo'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbpw: callback => dispatch(sendGlbPw(callback)),
    setbasic: id => dispatch(setBasic(id)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    addUser: user => dispatch(userPush(user)),
    delUser: id => dispatch(userPop(id)),
})

const ReUserInfo = connect(
    null,
    mapDispatchToProps
)(UserInfo)

export default ReUserInfo
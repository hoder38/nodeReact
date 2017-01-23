import { connect } from 'react-redux'
import { alertPush, sendGlbPw } from '../actions'
import PasswordInfo from '../components/PasswordInfo'

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbpw: callback => dispatch(sendGlbPw(callback)),
})

const RePasswordInfo = connect(
    null,
    mapDispatchToProps
)(PasswordInfo)

export default RePasswordInfo
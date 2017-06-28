import { connect } from 'react-redux'
import { alertPush, sendGlbPw, setPass } from '../actions'
import PasswordInfo from '../components/PasswordInfo'

const mapStateToProps = state => ({
    bookmark: state.passDataHandle.item.bookmark,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbpw: callback => dispatch(sendGlbPw(callback)),
    setLatest: (id, bookmark) => dispatch(setPass(null, id, bookmark)),
})

const RePasswordInfo = connect(
    mapStateToProps,
    mapDispatchToProps
)(PasswordInfo)

export default RePasswordInfo
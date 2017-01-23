import { connect } from 'react-redux'
import { alertPush, userPush } from '../actions'
import Userlist from '../components/Userlist'

const mapStateToProps = state => ({user_info: state.userDataHandle})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    userset: user => dispatch(userPush(user)),
})

const ReUserlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Userlist)

export default ReUserlist

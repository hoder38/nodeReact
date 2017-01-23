import { connect } from 'react-redux'
import { alertPush } from '../actions'
import Login from '../components/Login'

const mapDispatchToProps = dispatch => ({addalert: msg => dispatch(alertPush(msg))})

const ReLogin = connect(
    null,
    mapDispatchToProps
)(Login)

export default ReLogin
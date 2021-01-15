import { connect } from 'react-redux'
import { alertPush } from '../actions/index.js'
import Login from '../components/Login.js'

const mapDispatchToProps = dispatch => ({addalert: msg => dispatch(alertPush(msg))})

const ReLogin = connect(
    null,
    mapDispatchToProps
)(Login)

export default ReLogin
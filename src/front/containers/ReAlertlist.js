import { connect } from 'react-redux'
import { alertPop } from '../actions/index.js'
import Alertlist from '../components/Alertlist.js'

const mapStateToProps = state => ({alertlist: state.alertHandle})

const mapDispatchToProps = dispatch => ({
    onclose: key => dispatch(alertPop(key)),
})

const ReAlertlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Alertlist)

export default ReAlertlist
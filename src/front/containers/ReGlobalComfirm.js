import { connect } from 'react-redux'
import { closeGlbCf } from '../actions'
import GlobalComfirm from '../components/GlobalComfirm'

const mapDispatchToProps = dispatch => ({
    onclose: () => dispatch(closeGlbCf()),
})

const ReGlobalComfirm = connect(
    null,
    mapDispatchToProps
)(GlobalComfirm)

export default ReGlobalComfirm

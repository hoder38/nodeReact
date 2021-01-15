import { connect } from 'react-redux'
import { closeGlbCf } from '../actions/index.js'
import GlobalComfirm from '../components/GlobalComfirm.js'

const mapDispatchToProps = dispatch => ({
    onclose: () => dispatch(closeGlbCf()),
})

const ReGlobalComfirm = connect(
    null,
    mapDispatchToProps
)(GlobalComfirm)

export default ReGlobalComfirm

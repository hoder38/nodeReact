import { connect } from 'react-redux'
import { alertPush, sendGlbCf } from '../actions/index.js'
import ItemFitness from '../components/ItemFitness.js'

const mapStateToProps = state => ({
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReItemFitness = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemFitness)

export default ReItemFitness
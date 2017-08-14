import { connect } from 'react-redux'
import { setFitness, sendGlbCf } from '../actions'
import ItemFitness from '../components/ItemFitness'

const mapStateToProps = state => ({
    bookmark: state.fitnessDataHandle.item.bookmark,
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    setLatest: (id, bookmark) => dispatch(setFitness(null, id, bookmark)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReItemFitness = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemFitness)

export default ReItemFitness
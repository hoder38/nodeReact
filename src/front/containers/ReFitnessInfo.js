import { connect } from 'react-redux'
import { alertPush, setFitness, setBasic } from '../actions'
import FitnessInfo from '../components/FitnessInfo'

const mapStateToProps = state => ({
    bookmark: state.fitnessDataHandle.item.bookmark,
    level: state.basicDataHandle.level,
    point: state.basicDataHandle.fitness,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    setLatest: (id, bookmark) => dispatch(setFitness(null, id, bookmark)),
    basicset: fitness => dispatch(setBasic(null, null, null, null, null, fitness)),
})

const ReFitnessInfo = connect(
    mapStateToProps,
    mapDispatchToProps
)(FitnessInfo)

export default ReFitnessInfo
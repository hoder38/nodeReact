import { connect } from 'react-redux'
import { alertPush, sendGlbCf, setFdirs, fdirPush, setBasic} from '../actions'
import Fitness from '../components/Fitness'

const mapStateToProps = state => ({point: state.basicDataHandle.fitness})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    fdirsset: (dirs, rest) => dispatch(setFdirs(dirs, rest)),
    pushfdir: (name, dir) => dispatch(fdirPush(name, dir)),
    basicset: fitness => dispatch(setBasic(null, null, null, null, null, fitness)),
})

const ReFitness = connect(
    mapStateToProps,
    mapDispatchToProps
)(Fitness)

export default ReFitness
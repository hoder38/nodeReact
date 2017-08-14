import { connect } from 'react-redux'
import { alertPush, sendGlbCf, setBasic, fitnessPush } from '../actions'
import FitnessStatis from '../components/FitnessStatis'
import { FITNESS } from '../constants'

const mapStateToProps = state => ({
    itemType: FITNESS,
    sortName: state.fitnessDataHandle.item.sortName,
    sortType: state.fitnessDataHandle.item.sortType,
    point: state.basicDataHandle.fitness,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    basicset: fitness => dispatch(setBasic(null, null, null, null, null, fitness)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReFitnessStatis = connect(
    mapStateToProps,
    mapDispatchToProps
)(FitnessStatis)

export default ReFitnessStatis
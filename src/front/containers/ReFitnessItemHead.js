import { connect } from 'react-redux'
import { fitnessPush, alertPush, setFitness, sendGlbIn } from '../actions/index.js'
import { FITNESS } from '../constants.js'
import ItemHead from '../components/ItemHead.js'

const mapStateToProps = state => ({
    itemType: FITNESS,
    select: state.fitnessDataHandle.select,
    sortName: state.fitnessDataHandle.item.sortName,
    sortType: state.fitnessDataHandle.item.sortType,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setFitness(item)),
    globalinput: callback => dispatch(sendGlbIn(1, callback, 'danger', 'New Tag...')),
})

const ReFitnessItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default ReFitnessItemHead

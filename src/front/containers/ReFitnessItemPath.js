import { connect } from 'react-redux'
import { fitnessPush, alertPush, fbookmarkPush, sendGlbIn, setFitness } from '../actions'
import ItemPath from '../components/ItemPath'
import { FITNESS } from '../constants'

const mapStateToProps = state => ({
    itemType: FITNESS,
    current: state.fitnessDataHandle.path.cur,
    history: state.fitnessDataHandle.path.his,
    exact: state.fitnessDataHandle.path.exactly,
    sortName: state.fitnessDataHandle.item.sortName,
    sortType: state.fitnessDataHandle.item.sortType,
    multi: state.fitnessDataHandle.multi,
    bookmark: state.fbookmarkDataHandle.list,
    pathLength: state.fitnessDataHandle.path.cur ? state.fitnessDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    multiToggle: item => dispatch(setFitness(null, null, null, item)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    pushbookmark: bookmark => dispatch(fbookmarkPush(bookmark)),
    globalinput: (type, placeholder, callback) => dispatch(sendGlbIn(type, callback, 'default', placeholder)),
})

const ReFitnessItemPath = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPath)

export default ReFitnessItemPath

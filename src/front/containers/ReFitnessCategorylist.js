import { connect } from 'react-redux'
import { fbookmarkPush, fbookmarkPop, fdirPush, fdirPop, fitnessPush, alertPush } from '../actions/index.js'
import Categorylist from '../components/Categorylist.js'
import { FITNESS } from '../constants.js'

const mapStateToProps = state => ({
    itemType: FITNESS,
    sortName: state.fitnessDataHandle.item.sortName,
    sortType: state.fitnessDataHandle.item.sortType,
    multi: state.fitnessDataHandle.multi,
    edit: state.basicDataHandle.edit,
    bookmark: state.fbookmarkDataHandle,
    dirs: state.fdirDataHandle,
    level: state.basicDataHandle.level,
})

const mapDispatchToProps = dispatch => ({
    bookmarkset: (bookmark, sortName, sortType) => dispatch(fbookmarkPush(bookmark, sortName, sortType)),
    delbookmark: id => dispatch(fbookmarkPop(id)),
    dirset: (name, dir, sortName, sortType) => dispatch(fdirPush(name, dir, sortName, sortType)),
    deldir: (name, id) => dispatch(fdirPop(name, id)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReFitnessCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default ReFitnessCategorylist
import { connect } from 'react-redux'
import { passPush, alertPush, pbookmarkPush, sendGlbIn, setPass } from '../actions/index.js'
import ItemPath from '../components/ItemPath.js'
import { PASSWORD } from '../constants.js'

const mapStateToProps = state => ({
    itemType: PASSWORD,
    current: state.passDataHandle.path.cur,
    history: state.passDataHandle.path.his,
    exact: state.passDataHandle.path.exactly,
    sortName: state.passDataHandle.item.sortName,
    sortType: state.passDataHandle.item.sortType,
    multi: state.passDataHandle.multi,
    bookmark: state.pbookmarkDataHandle.list,
    pathLength: state.passDataHandle.path.cur ? state.passDataHandle.path.cur.length : 0,
})

const mapDispatchToProps = dispatch => ({
    multiToggle: item => dispatch(setPass(null, null, null, item)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(passPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    pushbookmark: bookmark => dispatch(pbookmarkPush(bookmark)),
    globalinput: (type, placeholder, callback) => dispatch(sendGlbIn(type, callback, 'default', placeholder)),
})

const RePasswordItemPath = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemPath)

export default RePasswordItemPath

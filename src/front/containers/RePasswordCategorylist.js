import { connect } from 'react-redux'
import { pbookmarkPush, pbookmarkPop, pdirPush, pdirPop, passPush, alertPush } from '../actions'
import Categorylist from '../components/Categorylist'
import { PASSWORD } from '../constants'

const mapStateToProps = state => ({
    itemType: PASSWORD,
    sortName: state.passDataHandle.item.sortName,
    sortType: state.passDataHandle.item.sortType,
    multi: state.passDataHandle.multi,
    edit: state.basicDataHandle.edit,
    bookmark: state.pbookmarkDataHandle,
    dirs: state.pdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    bookmarkset: (bookmark, sortName, sortType) => dispatch(pbookmarkPush(bookmark, sortName, sortType)),
    delbookmark: id => dispatch(pbookmarkPop(id)),
    dirset: (name, dir, sortName, sortType) => dispatch(pdirPush(name, dir, sortName, sortType)),
    deldir: (name, id) => dispatch(pdirPop(name, id)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(passPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const RePasswordCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default RePasswordCategorylist

import { connect } from 'react-redux'
import { passPush, alertPush, setPass, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { PASSWORD } from '../constants'

const mapStateToProps = state => ({
    itemType: PASSWORD,
    list: arrayMerge(state.passDataHandle.item.list, state.passDataHandle.list),
    more: state.passDataHandle.item.more,
    sortName: state.passDataHandle.item.sortName,
    sortType: state.passDataHandle.item.sortType,
    page: state.passDataHandle.item.page,
    pageToken: state.passDataHandle.item.pageToken,
    multi: state.passDataHandle.multi,
    latest: state.passDataHandle.latest,
    select: state.passDataHandle.select,
    dirs: state.pdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(passPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setPass(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const RePasswordItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default RePasswordItemlist
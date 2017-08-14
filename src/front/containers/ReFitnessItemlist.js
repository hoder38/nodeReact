import { connect } from 'react-redux'
import { fitnessPush, alertPush, setFitness, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { FITNESS } from '../constants'

const mapStateToProps = state => ({
    itemType: FITNESS,
    list: arrayMerge(state.fitnessDataHandle.item.list, state.fitnessDataHandle.list),
    more: state.fitnessDataHandle.item.more,
    sortName: state.fitnessDataHandle.item.sortName,
    sortType: state.fitnessDataHandle.item.sortType,
    page: state.fitnessDataHandle.item.page,
    pageToken: state.fitnessDataHandle.item.pageToken,
    multi: state.fitnessDataHandle.multi,
    latest: state.fitnessDataHandle.latest,
    select: state.fitnessDataHandle.select,
    dirs: state.fdirDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setFitness(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReFitnessItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReFitnessItemlist
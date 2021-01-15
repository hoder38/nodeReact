import { connect } from 'react-redux'
import { lotteryPush, alertPush } from '../actions/index.js'
import Itemlist from '../components/Itemlist.js'
import { arrayMerge } from '../utility.js'
import { LOTTERY } from '../constants.js'

const mapStateToProps = state => ({
    itemType: LOTTERY,
    list: arrayMerge(state.lotteryDataHandle.item.list, state.lotteryDataHandle.list),
    more: false,
    sortName: state.lotteryDataHandle.item.sortName,
    sortType: state.lotteryDataHandle.item.sortType,
    select: state.lotteryDataHandle.select,
})

const mapDispatchToProps = dispatch => ({
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(lotteryPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    addalert: msg => dispatch(alertPush(msg)),
})

const ReLotteryItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReLotteryItemlist

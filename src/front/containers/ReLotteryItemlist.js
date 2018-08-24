import { connect } from 'react-redux'
import { lotteryPush } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { LOTTERY } from '../constants'

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
})

const ReLotteryItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReLotteryItemlist

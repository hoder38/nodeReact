import { connect } from 'react-redux'
import { bitfinexPush, setBitfinex, alertPush, sendGlbCf } from '../actions'
import Itemlist from '../components/Itemlist'
import { arrayMerge } from '../utility'
import { BITFINEX } from '../constants'

const mapStateToProps = state => ({
    itemType: BITFINEX,
    list: arrayMerge(state.bitfinexDataHandle.item.list, state.bitfinexDataHandle.list),
    more: false,
    sortName: state.bitfinexDataHandle.item.sortName,
    sortType: state.bitfinexDataHandle.item.sortType,
    select: state.bitfinexDataHandle.select,
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(bitfinexPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setBitfinex(item)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
})

const ReBitfinexItemlist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Itemlist)

export default ReBitfinexItemlist

import { connect } from 'react-redux'
import { bitfinexPush, setBitfinex, alertPush, sendGlbCf } from '../actions/index.js'
import Itemlist from '../components/Itemlist.js'
import { arrayMerge } from '../utility.js'
import { BITFINEX } from '../constants.js'

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

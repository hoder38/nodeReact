import { connect } from 'react-redux'
import { bitfinexPush, setBitfinex, alertPush } from '../actions/index.js'
import ItemHead from '../components/ItemHead.js'
import { BITFINEX } from '../constants.js'

const mapStateToProps = state => ({
    itemType: BITFINEX,
    select: state.bitfinexDataHandle.select,
    sortName: state.bitfinexDataHandle.item.sortName,
    sortType: state.bitfinexDataHandle.item.sortType,
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(bitfinexPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setBitfinex(item)),
    addalert: msg => dispatch(alertPush(msg)),
})

const ReBitfinexItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default ReBitfinexItemHead

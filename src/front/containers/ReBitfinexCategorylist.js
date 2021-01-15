import { connect } from 'react-redux'
import { bitfinexPush, alertPush } from '../actions/index.js'
import Categorylist from '../components/Categorylist.js'
import { BITFINEX } from '../constants.js'

const mapStateToProps = state => ({
    itemType: BITFINEX,
    edit: state.basicDataHandle.edit,
    multi: false,
    sortName: 'name',
    sortType: 'asc',
    dirs: [],
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(bitfinexPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReBitfinexCategorylist = connect(
    mapStateToProps,
    mapDispatchToProps
)(Categorylist)

export default ReBitfinexCategorylist

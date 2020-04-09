import { connect } from 'react-redux'
import Categorylist from '../components/Categorylist'
import { BITFINEX } from '../constants'

const mapStateToProps = state => ({
    itemType: BITFINEX,
    edit: state.basicDataHandle.edit,
    multi: false,
    sortName: 'name',
    sortType: 'asc',
    dirs: [],
})

const ReBitfinexCategorylist = connect(
    mapStateToProps,
)(Categorylist)

export default ReBitfinexCategorylist

import { connect } from 'react-redux'
import { alertPush, sendGlbIn, setStock } from '../actions'
import ItemStock from '../components/ItemStock'

const mapStateToProps = state => ({
    bookmark: state.stockDataHandle.item.bookmark,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    globalinput: (type, callback, color, placeholder, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
    setLatest: (id, bookmark) => dispatch(setStock(null, id, bookmark)),
})

const ReItemStock = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemStock)

export default ReItemStock
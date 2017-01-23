import { connect } from 'react-redux'
import { alertPush, sendGlbIn } from '../actions'
import ItemStock from '../components/ItemStock'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    globalinput: (type, callback, color, placeholder, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
})

const ReItemStock = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemStock)

export default ReItemStock
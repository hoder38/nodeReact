import { connect } from 'react-redux'
import { alertPush} from '../actions/index.js'
import Bitfinex from '../components/Bitfinex.js'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
})

const ReBitfinex = connect(
    mapStateToProps,
    mapDispatchToProps
)(Bitfinex)

export default ReBitfinex

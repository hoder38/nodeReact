import { connect } from 'react-redux'
import { alertPush, setBdirs} from '../actions'
import Bitfinex from '../components/Bitfinex'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    bdirsset: (dirs, rest) => dispatch(setBdirs(dirs, rest)),
})

const ReBitfinex = connect(
    mapStateToProps,
    mapDispatchToProps
)(Bitfinex)

export default ReBitfinex

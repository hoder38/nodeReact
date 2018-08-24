import { connect } from 'react-redux'
import { sendGlbIn, alertPush, sendGlbCf, lotteryPush } from '../actions'
import Lottery from '../components/Lottery'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
})

const mapDispatchToProps = dispatch => ({
    globalinput: (type, placeholder, color, callback, value, option) => dispatch(sendGlbIn(type, callback, color, placeholder, value, option)),
    addalert: msg => dispatch(alertPush(msg)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    lotteryset: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(lotteryPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
})

const ReLottery = connect(
    mapStateToProps,
    mapDispatchToProps
)(Lottery)

export default ReLottery
import { connect } from 'react-redux'
import { sendGlbCf, alertPush } from '../actions/index.js'
import ItemLottery from '../components/ItemLottery.js'

const mapDispatchToProps = dispatch => ({
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    addalert: msg => dispatch(alertPush(msg)),
})

const ReItemLottery = connect(
    null,
    mapDispatchToProps
)(ItemLottery)

export default ReItemLottery
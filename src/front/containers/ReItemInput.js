import { connect } from 'react-redux'
import { closeGlbIn, alertPush } from '../actions/index.js'
import ItemInput from '../components/ItemInput.js'

const mapStateToProps = state => state.glbInHandle.length > 0 ? {
    input: state.glbInHandle[0].input,
    callback: state.glbInHandle[0].callback,
    color: state.glbInHandle[0].color,
    placeholder: state.glbInHandle[0].placeholder,
    value: state.glbInHandle[0].value,
    option: state.glbInHandle[0].option,
    index: state.glbInHandle[0].index,
} : {
    input: 0,
    callback: () => {},
    color: '',
    placeholder: '',
    value: '',
    option: '',
    index: -1,
}

const mapDispatchToProps = dispatch => ({
    inputclose: input => dispatch(closeGlbIn(input)),
    addalert: msg => dispatch(alertPush(msg)),
})

const ReItemInput = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemInput)

export default ReItemInput
import { connect } from 'react-redux'
import { alertPush, feedbackPush, setUpload } from '../actions/index.js'
import FileAdd from '../components/FileAdd.js'

const mapStateToProps = state => ({
    mainUrl: state.basicDataHandle.url,
    level: state.basicDataHandle.level,
    progress: state.uploadDataHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    pushfeedback: feedback => dispatch(feedbackPush(feedback)),
    setUpload: progress => dispatch(setUpload(progress)),
})

const ReFileAdd = connect(
    mapStateToProps,
    mapDispatchToProps
)(FileAdd)

export default ReFileAdd
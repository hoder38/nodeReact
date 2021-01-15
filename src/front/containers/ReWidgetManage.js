import { connect } from 'react-redux'
import WidgetManage from '../components/WidgetManage.js'

const mapStateToProps = state => ({
    uploadProgress: state.uploadDataHandle,
    feedbackNumber: state.feedbackDataHandle.size,
    imageNumber: state.itemDataHandle[2] ? state.itemDataHandle[2].list.size : 0,
    imageMore: state.itemDataHandle[2] ? state.itemDataHandle[2].more : false,
    videoNumber: state.itemDataHandle[3] ? state.itemDataHandle[3].list.size : 0,
    videoMore: state.itemDataHandle[3] ? state.itemDataHandle[3].more : false,
    musicNumber: state.itemDataHandle[4] ? state.itemDataHandle[4].list.size : 0,
    musicMore: state.itemDataHandle[4] ? state.itemDataHandle[4].more : false,
    playlistNumber: state.itemDataHandle[9] ? state.itemDataHandle[9].list.length : 0,
})

const ReWidgetManage = connect(
    mapStateToProps
)(WidgetManage)

export default ReWidgetManage
import { connect } from 'react-redux'
import { alertPush, feedbackPop, feedbackPush } from '../actions'
import FileFeedback from '../components/FileFeedback'

const mapStateToProps = state => {
    let tmp = state.feedbackDataHandle.values().next().value
    return tmp ? {
        dirs: state.idirDataHandle,
        mainUrl: state.basicDataHandle.url,
        id: tmp.id,
        name: tmp.name,
        select: tmp.select,
        option: tmp.option,
        other: tmp.other,
    } : {
        dirs: state.idirDataHandle,
        mainUrl: state.basicDataHandle.url,
        id: '',
        name: '',
        select: [],
        option: [],
        other: [],
    }
}

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    handlefeedback: id => dispatch(feedbackPop(id)),
    feedbackset: feedback => dispatch(feedbackPush(feedback)),
})

const ReFileFeedback = connect(
    mapStateToProps,
    mapDispatchToProps
)(FileFeedback)

export default ReFileFeedback
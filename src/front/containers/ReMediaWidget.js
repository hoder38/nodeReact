import { connect } from 'react-redux'
import MediaWidget from '../components/MediaWidget'
import { setItem, alertPush, itemPush, setBasic, sendGlbCf, feedbackPush } from '../actions'
import { arrayMerge } from '../utility'

const mapStateToProps = (state, ownProps) => state.itemDataHandle[ownProps.mediaType] ? Object.assign({index: state.itemDataHandle[ownProps.mediaType].index,
    bookmark: state.itemDataHandle[ownProps.mediaType].bookmark,
    sortName: state.itemDataHandle[ownProps.mediaType].sortName,
    sortType: state.itemDataHandle[ownProps.mediaType].sortType,
    more: state.itemDataHandle[ownProps.mediaType].more,
    page: state.itemDataHandle[ownProps.mediaType].page,
    opt: state.itemDataHandle[ownProps.mediaType].opt,
    pageToken: state.itemDataHandle[ownProps.mediaType].pageToken,
    count: state.itemDataHandle[ownProps.mediaType].count,
    mainUrl: state.basicDataHandle.url,
}, ownProps.mediaType === 9 ? {
    list: state.itemDataHandle[ownProps.mediaType].list
} : {
    list: [...arrayMerge(state.itemDataHandle[ownProps.mediaType].list, state.itemDataHandle.list).values()]
}) : {
    list: [],
    index: 0,
    bookmark: '',
    sortName: 'name',
    sortType: 'asc',
    more: false,
    opt: {},
    pageToken: '',
    count: -1,
    mainUrl: state.basicDataHandle.url,
}

const mapDispatchToProps = dispatch => ({
    setLatest: (id, bookmark) => dispatch(setItem(null, id, bookmark)),
    setsub: sub => dispatch(setBasic(null, null, null, null, sub)),
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, type, path=null, pageToken=null) => dispatch(itemPush(item, path, null, null, null, null, pageToken, type)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    pushfeedback: feedback => dispatch(feedbackPush(feedback)),
})

const ReMediaWidget = connect(
    mapStateToProps,
    mapDispatchToProps
)(MediaWidget)

export default ReMediaWidget
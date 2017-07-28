import { connect } from 'react-redux'
import { alertPush, setBasic, sendGlbCf, feedbackPush, bookmarkPush, setDirs, userPush, itemPop, itemPush, dirPush, passPop, passPush, stockPop, stockPush, closeGlbPw, fitnessPop, fitnessPush } from '../actions'
import App from '../components/App'

const mapStateToProps = state => ({
    id: state.basicDataHandle.id,
    sub: state.basicDataHandle.sub,
    pwCallback: state.glbPwHandle,
    cfCallback: state.glbCfHandle,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    basicset: (id, url, edit, level) => dispatch(setBasic(id, url, edit, level)),
    sendglbcf: (callback, text) => dispatch(sendGlbCf(callback, text)),
    feedbackset: feedback => dispatch(feedbackPush(feedback)),
    userset: user => dispatch(userPush(user)),
    bookmarkset: (bookmark, sortName, sortType) => dispatch(bookmarkPush(bookmark, sortName, sortType)),
    itemset: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(itemPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    dirsset: (dirs, rest) => dispatch(setDirs(dirs, rest)),
    pushdir: (name, dir) => dispatch(dirPush(name, dir)),
    itemdel: id => dispatch(itemPop(id)),
    passset: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(passPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    passdel: id => dispatch(passPop(id)),
    stockset: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(stockPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    stockdel: id => dispatch(stockPop(id)),
    fitnessset: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(fitnessPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    fitnessdel: id => dispatch(fitnessPop(id)),
    closeglbpw: () => dispatch(closeGlbPw()),
})

const ReApp = connect(
    mapStateToProps,
    mapDispatchToProps
)(App)

export default ReApp
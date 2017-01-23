import { connect } from 'react-redux'
import { passPush, alertPush, setPass, sendGlbIn } from '../actions'
import ItemHead from '../components/ItemHead'
import { PASSWORD } from '../constants'

const mapStateToProps = state => ({
    itemType: PASSWORD,
    select: state.passDataHandle.select,
    sortName: state.passDataHandle.item.sortName,
    sortType: state.passDataHandle.item.sortType,
})

const mapDispatchToProps = dispatch => ({
    addalert: msg => dispatch(alertPush(msg)),
    set: (item, path, bookmark, latest, sortName, sortType, pageToken) => dispatch(passPush(item, path, bookmark, latest, sortName, sortType, pageToken)),
    setSelect: item => dispatch(setPass(item)),
    globalinput: callback => dispatch(sendGlbIn(1, callback, 'danger', 'New Tag...')),
})

const RePasswordItemHead = connect(
    mapStateToProps,
    mapDispatchToProps
)(ItemHead)

export default RePasswordItemHead
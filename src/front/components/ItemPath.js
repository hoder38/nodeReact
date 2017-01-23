import React from 'react'
import Tooltip from './Tooltip'
import Dropdown from './Dropdown'
import { getItemList, resetItemList, isValidString, api, killEvent } from '../utility'
import { STORAGE } from '../constants'

let key = 0

const ItemPath = React.createClass({
    componentWillMount: function() {
        this.props.globalinput(0, 'Search Tag...', (name, exact) => (this.props.pathLength > 0 && !name) ? Promise.reject('') : getItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set, 0, '', false, (name ? name : null), 0, exact, this.props.multi, true))
    },
    _resetPath: function() {
        resetItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set).catch(err => this.props.addalert(err))
    },
    _gotoPath: function(name, index, exact) {
        getItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set, 0, '', false, name, index, exact).catch(err => this.props.addalert(err))
    },
    _addBookmark: function(name) {
        if (this.props.current.length === 0) {
            return Promise.reject('Empty parent list!!!')
        }
        if (!name) {
            return Promise.reject('')
        }
        return !isValidString(name, 'name') ? Promise.reject('Bookmark name is not valid!!!') : api(`/api/bookmark/${this.props.itemType}/add`, {name: name}).then(result => {
            if (result.id) {
                this.props.pushbookmark({id: result.id, name: result.name})
            }
            if (this.props.itemType === STORAGE && result.bid) {
                result.id = result.bid
                result.name = result.bname
                if (result.name) {
                    this.props.pushfeedback(result)
                }
            }
        })
    },
    render: function() {
        let bookmarkList = [
            {
                title: 'new...',
                onclick: () => this.props.globalinput(1, 'New Bookmark...', name => this._addBookmark(name)),
                key: 0,
            },
            {key: 1},
        ]
        this.props.bookmark.forEach(item => bookmarkList.push({
            title: item.name,
            onclick: () => this._addBookmark(item.name).catch(err => this.props.addalert(err)),
            key: item.id,
        }))
        let curRow = []
        this.props.current.forEach((item, i) => {
            const exactClass = this.props.exact[i] ? 'glyphicon glyphicon-eye-open' : 'glyphicon glyphicon-eye-close'
            curRow.push(
                <li key={key++}>
                    <a href="#" onClick={e => killEvent(e, () => this._gotoPath(item, i + 1, this.props.exact[i]))}>
                        <i className={exactClass}></i>&nbsp;{item}
                    </a>
                </li>
            )
        })
        let hisRow = []
        this.props.history.forEach((item, i) => {
            const exactClass = this.props.exact[this.props.current.length + i] ? 'glyphicon glyphicon-eye-open' : 'glyphicon glyphicon-eye-close'
            hisRow.push(
                <li className="active" key={key++}>
                    <a href="#" className="history-point" onClick={e => killEvent(e, () => this._gotoPath(item, this.props.current.length + i + 1, this.props.exact[this.props.current.length + i]))}>
                        <i className={exactClass}></i>&nbsp;{item}
                    </a>
                </li>
            )
        })
        const save = (this.props.current.length > 0) ? (
            <li className="active">
                <Dropdown headelement="span" droplist={bookmarkList} style={{ maxHeight: '50vh', overflowY: 'auto'}}>
                    <a href="#" className="item-point">
                        <i className="glyphicon glyphicon-floppy-disk"></i>&nbsp;SAVE
                    </a>
                </Dropdown>
            </li>
        ) : null
        return (
            <ol className="breadcrumb" style={{marginBottom: '0px', display: 'block', height: '56px'}}>
                <li>
                    <Tooltip tip="多重搜尋" place="top" />
                    <input
                        type="checkbox"
                        checked={this.props.multi}
                        ref={ref => this._multi = ref}
                        onChange={() => this.props.multiToggle(!this.props.multi)} />
                </li>
                <li>
                    <a href="#" onClick={e => killEvent(e, this._resetPath)}>
                        <i className="glyphicon glyphicon-home"></i>
                    </a>
                </li>
                {curRow}
                {hisRow}
                {save}
            </ol>
        )
    }
})

export default ItemPath
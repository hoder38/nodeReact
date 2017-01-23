import React from 'react'
import Tooltip from './Tooltip'
import { getItemList, isValidString, api, killEvent } from '../utility'
import { STORAGE, PASSWORD, STOCK } from '../constants'

const ItemHead = React.createClass({
    _changeSort: function(name) {
        const type = (name === this.props.sortName && this.props.sortType === 'asc') ? 'desc' : 'asc'
        getItemList(this.props.itemType, name, type, this.props.set).then(() => {
            if (typeof(Storage) !== "undefined") {
                localStorage.setItem(`${this.props.itemType}SortName`, name)
                localStorage.setItem(`${this.props.itemType}SortType`, type)
            }
        }).catch(err => this.props.addalert(err))
    },
    _selectAll: function() {
        this.props.select.size === 0 ? this.props.setSelect('All') : this.props.setSelect(new Set())
    },
    _addTag: function(name) {
        if (!name) {
            return Promise.reject('')
        }
        if (this.props.select.size === 0) {
            return Promise.reject('Please selects item!!!')
        }
        if (isValidString(name, 'name')) {
            return api(`/api/${this.props.itemType}/addTag/${name}`, {uids: [...this.props.select]}, 'PUT')
        } else if (this.props.itemType === STORAGE && isValidString(name, 'url')) {
            return api(`/api/${this.props.itemType}/addTagUrl`, {
                uids: [...this.props.select],
                url: name,
            }, 'PUT')
        } else {
            return Promise.reject('Tag is not valid!!!')
        }
    },
    render: function() {
        let nameSort = null, timeSort = null, countSort = null
        if (this.props.sortName === 'name') {
            nameSort = (this.props.sortType === 'asc') ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>
        } else if (this.props.sortName === 'mtime') {
            timeSort = (this.props.sortType === 'asc') ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>
        } else {
            countSort = (this.props.sortType === 'asc') ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>
        }
        let selectClass1 = 'glyphicon glyphicon-ok'
        let selectClass2 = 'text-right active'
        let selectClass3 = 'glyphicon glyphicon-cog'
        let selectClass4 = 'pull-right active'
        let tooltip = null
        let addTag = () => {}
        if (this.props.select.size > 0) {
            selectClass1 = 'glyphicon glyphicon-remove-sign'
            selectClass2 = 'text-right'
            selectClass3 = 'glyphicon glyphicon-plus'
            selectClass4 = 'pull-right'
            tooltip = <Tooltip tip="增加共同TAG" place="left" />
            addTag = () => this.props.globalinput(name => this._addTag(name))
        }
        let head1 = 'time'
        let click = () => this._changeSort('name')
        let sort = nameSort
        let head2 = 'count'
        let head3 = null
        switch (this.props.itemType) {
            case PASSWORD:
            head2 = 'user'
            break
            case STOCK:
            head1 = 's'
            head2 = 'm'
            click = () => {}
            sort = ''
            head3 = (
                <li className="pull-right" style={{width: '15%', minWidth: '68px'}}>
                    <a href="#" onClick={e => killEvent(e, () => this._changeSort('name'))} style={{padding: '10px 5px'}}>
                        p&nbsp;
                        {nameSort}
                    </a>
                </li>
            )
            break
        }
        return (
            <ul className="nav nav-pills" style={{backgroundColor: 'white', borderBottom: '2px solid #ddd'}}>
                <li className={selectClass2} style={{width: '56px'}}>
                    <Tooltip tip="全選 / 取消" place="top" />
                    <a href="#" onClick={e => killEvent(e, this._selectAll)}>
                        <i className={selectClass1}></i>
                    </a>
                </li>
                <li>
                    <a href="#" onClick={e => killEvent(e, click)}>
                        name&nbsp;
                        {sort}
                    </a>
                </li>
                <li className={selectClass4} style={{width: '50px'}}>
                    {tooltip}
                    <a href="#" onClick={e => killEvent(e, addTag)}>
                        <i className={selectClass3}></i>
                    </a>
                </li>
                <li className="pull-right" style={{width: '15%', minWidth: '68px'}}>
                    <a href="#" onClick={e => killEvent(e, () => this._changeSort('count'))} style={{padding: '10px 5px'}}>
                        {head2}&nbsp;
                        {countSort}
                    </a>
                </li>
                <li className="pull-right" style={{width: '15%', minWidth: '68px'}}>
                    <a href="#" onClick={e => killEvent(e, () => this._changeSort('mtime'))} style={{padding: '10px 5px'}}>
                        {head1}&nbsp;
                        {timeSort}
                    </a>
                </li>
                {head3}
            </ul>
        )
    }
})

export default ItemHead
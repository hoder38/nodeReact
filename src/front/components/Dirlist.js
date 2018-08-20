import React from 'react'
import { api, killEvent } from '../utility'

const Dirlist = React.createClass({
    getInitialState: function() {
        return {
            collapse: this.props.collapse,
            edit: false,
            loading: false,
        }
    },
    componentWillMount: function() {
        if (!this.props.collapse && this.props.dir.list.size === 0) {
            this._getlist(this.props.dir.sortName, this.props.dir.sortType, this.props.dir.page)
        }
    },
    _changeSort: function(name) {
        if (name === this.props.dir.sortName) {
            (this.props.dir.sortType === 'asc') ? this._getlist(name, 'desc', 0) : this._getlist(name, 'asc', 0)
        } else {
            this._getlist(name, 'asc', 0)
        }
    },
    _getlist: function(name, type, page, push=false) {
        this.setState(Object.assign({}, this.state, {loading: true}), () => api(`${this.props.listUrl}${name}/${type}/${page}`).then(result => {
            let list = result.bookmarkList ? result.bookmarkList : result.taglist
            push ? this.props.set(list) : this.props.set(list, name, type)
            this.setState(Object.assign({}, this.state, {loading: false}))
        }).catch(err => this.props.addalert(err)))
    },
    _delItem: function(id, name) {
        this.props.sendglbcf(() => api(`${this.props.delUrl}${id}`, null, 'DELETE').then(result => this.props.del(result.id)).catch(err => this.props.addalert(err)), `Would you sure to delete ${name} from ${this.props.name}?`)
    },
    _openList: function() {
        if (this.props.dir.list.size === 0) {
            this.setState(Object.assign({}, this.state, {collapse: !this.state.collapse}), () => this._getlist(this.props.dir.sortName, this.props.dir.sortType, this.props.dir.page))
        } else {
            this.setState(Object.assign({}, this.state, {collapse: !this.state.collapse}))
        }
    },
    render: function() {
        let rows = []
        this.props.dir.list.forEach(item => this.state.edit ? rows.push(
            <li key={item.id}>
                <a href="#" onClick={e => killEvent(e, () => this._delItem(item.id, item.name))}>
                    <i className="glyphicon glyphicon-remove"></i>{item.name}
                </a>
            </li>
        ) : rows.push(
            <li key={item.id}>
                <a href="#" onClick={e => killEvent(e, () => this.props.dirItem(item.id))}>{item.name}</a>
            </li>
        ))
        let nameSort = null, timeSort = null
        if (this.props.dir.sortName === 'name') {
            nameSort = (this.props.dir.sortType === 'asc') ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>
        } else {
            timeSort = (this.props.dir.sortType === 'asc') ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>
        }
        const edit = this.props.edit ? (
            <li className={this.state.edit ? 'active' : ''}>
                <a style={{padding: '10px 15px'}} href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>edit</a>
            </li>
        ) : null
        const more = this.props.dir.more ? (
            <li>
                <a>
                    <button className="btn btn-default btn-xs" type="button" disabled={this.state.loading} onClick={() => this._getlist(this.props.dir.sortName, this.props.dir.sortType, this.props.dir.page, true)}>More</button>
                </a>
            </li>
        ) : null
        const head = this.props.noSort ? null : (
            <ul className={this.state.collapse ? 'nav nav-pills collapse' : 'nav nav-pills collapse in'}>
                    <li>
                        <a style={{padding: '10px 15px'}} href="#" onClick={e => killEvent(e, () => this._changeSort('name'))}>
                            name&nbsp;{nameSort}
                        </a>
                    </li>
                    <li>
                        <a style={{padding: '10px 15px'}} href="#" onClick={e => killEvent(e, () => this._changeSort('mtime'))}>
                            {this.props.time}&nbsp;{timeSort}
                        </a>
                    </li>
                    {edit}
            </ul>

        )
        return (
            <li className={this.state.collapse ? '' : 'active'}>
                <a href="#" onClick={e => killEvent(e, this._openList)}>
                    {this.props.name}&nbsp;<i className={this.state.collapse ? 'glyphicon glyphicon-chevron-down' : 'glyphicon glyphicon-chevron-up'}></i>
                </a>
                {head}
                <ul className={this.state.collapse ? 'collapse' : 'collapse in'}>
                    {rows}
                    {more}
                </ul>
            </li>
        )
    }
})

export default Dirlist

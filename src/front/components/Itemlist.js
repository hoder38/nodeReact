import React from 'react'
import ReItemFile from '../containers/ReItemFile.js'
import ReItemPassword from '../containers/ReItemPassword.js'
import ReItemStock from '../containers/ReItemStock.js'
//import ReItemFitness from '../containers/ReItemFitness.js'
//import ReItemRank from '../containers/ReItemRank.js'
//import ReItemLottery from '../containers/ReItemLottery.js'
import ItemBitfinex from './ItemBitfinex.js'
import Tooltip from './Tooltip.js'
import Dropdown from './Dropdown.js'
import { isValidString, getItemList, api, killEvent } from '../utility.js'
import { STORAGE, PASSWORD, STOCK/*, FITNESS, RANK, LOTTERY*/, BITFINEX } from '../constants.js'

class Itemlist extends React.Component {
    constructor(props) {
        super(props);
        this._select = new Map()
        this._tags = new Set()
        this._except = new Set()
        this._first = 0
        this.state = {
            loading: false,
            allTag: false,
            relative: new Set(),
        }
    }
    componentDidMount() {
        if (this.props.list.size === 0 && (this.props.itemType !== BITFINEX || this.props.mainUrl)) {
            let name = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortName`)) ? localStorage.getItem(`${this.props.itemType}SortName`): this.props.sortName
            let type = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortType`)) ? localStorage.getItem(`${this.props.itemType}SortType`): this.props.sortType
            this._getlist(this.props.mainUrl, name, type, false)
        }
    }
    componentDidUpdate(prevProps) {
        if (this.props.itemType === BITFINEX && (prevProps.mainUrl !== this.props.mainUrl)) {
            let name = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortName`)) ? localStorage.getItem(`${this.props.itemType}SortName`): this.props.sortName
            let type = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortType`)) ? localStorage.getItem(`${this.props.itemType}SortType`): this.props.sortType
            this._getlist(this.props.mainUrl, name, type, false)
        }
    }
    _getlist = (preurl='', name=this.props.sortName, type=this.props.sortType, push=true) => {
        this.setState(Object.assign({}, this.state, {loading: true}), () => getItemList(this.props.itemType, name, type, this.props.set, this.props.page, this.props.pageToken, push, null, 0, false, false, false, preurl).then(() => this.setState(Object.assign({}, this.state, {loading: false}))).catch(err => this.props.addalert(err)))
    }
    _handleSelect = () => {
        let newList = new Set()
        this._select.forEach((item, i) => {
            if (item && item.checked) {
                newList.add(i)
            }
        })
        this.props.setSelect(newList)
    }
    _handleTag = (type, tag) => {
        if (this.props.select.size === 0) {
            this.props.addalert('Please selects item!!!')
        } else {
            isValidString(tag, 'name') ? api(`/api/${this.props.itemType}/${type}Tag/${tag}`, {uids: [...this.props.select]}, 'PUT').catch(err => this.props.addalert(err)) : this.props.addalert('Tag is not valid!!!!!!')
        }
    }
    _tagRow = (tag, className) => {
        const td3 = this.props.itemType === STOCK ? <td style={{width: '15%', minWidth: '68px'}}></td> : null
        return (
            <tr key={`${tag}${className}`}>
                <td className="text-center" style={{width: '56px'}}>
                    <button type="button" className="btn btn-default" onClick={() => this.props.sendglbcf(() => this._handleTag((className === 'item-point') ? 'del' : 'add', tag), (className === 'item-point') ? `刪除此共同TAG ${tag}` : `增加此 ${tag} 為共同TAG?`)}>
                        <Tooltip tip={(className === 'item-point') ? '刪除TAG' : '增加TAG'} place="right" />
                        <i className={(className === 'item-point') ? 'glyphicon glyphicon-remove-sign' : 'glyphicon glyphicon-plus-sign'}></i>
                    </button>
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                    <a href="#" className={className} onClick={e => killEvent(e, () => getItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set, 0, '', false, tag, 0, true, this.props.multi, false, this.props.mainUrl))}>
                        <i className="glyphicon glyphicon-folder-open" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>
                        {tag}
                    </a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}></td>
                <td style={{width: '15%', minWidth: '68px'}}></td>
                {td3}
                <td style={{width: '50px'}}>
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={this.props.dirs} param={tag}>
                        <Tooltip tip="加到預設分類" place="left" />
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
    _toggleTags = () => {
        this.state.allTag ? this.setState(Object.assign({}, this.state, {
            allTag: false,
            relative: new Set(),
        })) : this.setState(Object.assign({}, this.state, {allTag: true}), () => {
            if (this.state.relative.size === 0 && this.props.itemType !== BITFINEX) {
                api(`/api/${this.props.itemType}/getOptionTag`, {tags: this._tags}).then(result => this.setState(Object.assign({}, this.state, {relative: new Set(result.relative.filter(x => (!this._tags.has(x) && !this._except.has(x))))}))).catch(err => this.props.addalert(err))
            }
        })
    }
    render() {
        let rows = []
        let tagRows = []
        let tags = new Set()
        let exceptTags = new Set()
        this.props.list.forEach((item, i) => {
            let select = this.props.select.has(i)
            switch(this.props.itemType) {
                case STORAGE:
                rows.push(<ReItemFile key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} latest={this.props.latest} check={select} />)
                break
                case PASSWORD:
                rows.push(<ReItemPassword key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} latest={this.props.latest} check={select} />)
                break
                case STOCK:
                rows.push(<ReItemStock key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} latest={this.props.latest} check={select} setstock={this.props.setstock} />)
                break
                /*case FITNESS:
                rows.push(<ReItemFitness key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} latest={this.props.latest} check={select} />)
                break
                case RANK:
                rows.push(<ReItemRank key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} latest={this.props.latest} check={select} />)
                break
                case LOTTERY:
                rows.push(<ReItemLottery key={item.id} item={item} owner={this.props.owner} />)
                break*/
                case BITFINEX:
                rows.push(<ItemBitfinex key={item.id} item={item} getRef={ref => this._select.set(i, ref)} onchange={this._handleSelect} check={select} mainUrl={this.props.mainUrl} sendglbcf={this.props.sendglbcf} />)
                break
            }
            if (select) {
                if (tags.size > 0) {
                    let newTags = new Set(item.tags.filter(x => tags.has(x)))
                    if (this.state.allTag) {
                        exceptTags = new Set([...exceptTags, ...[...tags, ...item.tags].filter(x => !newTags.has(x))])
                    }
                    tags = newTags
                } else {
                    tags = new Set(item.tags)
                }
                if (this._first === 0) {
                    this._first = rows.length
                }
            }
        })
        if (this.props.select.size > 0) {
            if (this.state.allTag) {
                tagRows.push(
                    <tr key="?">
                        <td className="text-center" style={{width: '56px'}}></td>
                        <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                            <button type="button" className="btn btn-default" onClick={this._toggleTags}>Less</button>
                        </td>
                    </tr>
                )
                tags.forEach(tag => tagRows.push(this._tagRow(tag, 'item-point')))
                exceptTags.forEach(tag => tagRows.push(this._tagRow(tag, 'history-point')))
                this.state.relative.forEach(tag => tagRows.push(this._tagRow(tag, 'relative-point')))
            } else {
                for (let i of tags) {
                    if (tagRows.length < 3) {
                        tagRows.push(this._tagRow(i, 'item-point'))
                    } else {
                        break
                    }
                }
                tagRows.push(
                    <tr key="?">
                        <td className="text-center" style={{width: '56px'}}></td>
                        <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                            <button type="button" className="btn btn-default" onClick={this._toggleTags}>All</button>
                        </td>
                    </tr>
                )
            }
            this._tags = tags
            this._except = exceptTags
            rows.splice(this._first, 0, ...tagRows)
        } else {
            this._first = 0
        }
        const paddingTop = (this.props.itemType === BITFINEX) ? '37px' : '125px';
        const more = this.props.more ? (
            <tr>
                <td className="text-center" style={{width: '56px'}}></td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                    <button className="btn btn-default" type="button" disabled={this.state.loading} onClick={() => this._getlist(this.props.mainUrl)}>More</button>
                </td>
            </tr>
        ) : null
        return (
            <section style={{paddingTop}}>
                <div className="table-responsive" style={{overflowX: 'visible'}}>
                    <table className="table table-hover">
                        <tbody>
                            {rows}
                            {more}
                        </tbody>
                    </table>
                </div>
            </section>
        )
    }
}

export default Itemlist
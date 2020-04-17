import React from 'react'
import ReDirlist from '../containers/ReDirlist'
import RePasswordInfo from '../containers/RePasswordInfo'
import ReBitfinexInfo from '../containers/ReBitfinexInfo'
//import ReFitnessInfo from '../containers/ReFitnessInfo'
//import ReRankInfo from '../containers/ReRankInfo'
import { RIGHT_SECTION_ZINDEX, PASSWORD, STOCK, FITNESS, RANK, LOTTERY,BITFINEX } from '../constants'
import { dirItemList, bookmarkItemList, killEvent, api, isValidString, getItemList } from '../utility'

const Categorylist = React.createClass({
    getInitialState: function() {
        return {
            collapse: true,
            edit: false,
        }
    },
    componentDidMount: function() {
        this._targetArr = Array.from(document.querySelectorAll('[data-collapse]')).filter(node => node.getAttribute('data-collapse') === this.props.collapse)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('click', this._toggle)
            })
        }
    },
    componentWillUnmount: function() {
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('click', this._toggle)
            })
        }
    },
    _toggle: function(e) {
        killEvent(e, () => this.setState(Object.assign({}, this.state, {collapse: !this.state.collapse})))
    },
    _dirItem: function(id) {
        dirItemList(this.props.itemType, this.props.sortName, this.props.sortType, this.props.set, id, this.props.multi).catch(err => this.props.addalert(err))
    },
    _bookmarkItem: function(id) {
        bookmarkItemList(this.props.itemType, 'get', this.props.sortName, this.props.sortType, this.props.set, id).catch(err => this.props.addalert(err))
    },
    _filter: function(tag, exact, cond) {
        if (!isValidString(tag, 'name')) {
            return Promise.reject('Filter tag is not vaild!!!')
        }
        const condition = cond.match(/^(per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*)\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?\s*((per|yield|p|s|m|pre|interval|vol|close)([<>]\-?\d+\.?\d*))?$/)
        if (!condition) {
            return Promise.reject('Filter condition is not vaild!!!')
        }
        let per = ''
        let yieldd = ''
        let pp = ''
        let ss = ''
        let mm = ''
        let pre = ''
        let interval = ''
        let vol = ''
        let close = ''
        function inData(index) {
            if (condition[index] === 'per') {
                per = condition[index + 1]
            } else if (condition[index] === 'yield') {
                yieldd = condition[index + 1]
            } else if (condition[index] === 'p') {
                pp = condition[index + 1]
            } else if (condition[index] === 's') {
                ss = condition[index + 1]
            } else if (condition[index] === 'm') {
                mm = condition[index + 1]
            } else if (condition[index] === 'pre') {
                pre = condition[index + 1]
            } else if (condition[index] === 'interval') {
                interval = condition[index + 1]
            } else if (condition[index] === 'vol') {
                vol = condition[index + 1]
            } else if (condition[index] === 'close') {
                close = condition[index + 1]
            }
        }
        inData(1)
        inData(4)
        inData(7)
        inData(10)
        inData(13)
        inData(16)
        inData(19)
        inData(22)
        inData(25)
        let data = {}
        if (per) {
            data['per'] = per
        }
        if (yieldd) {
            data['yield'] = yieldd
        }
        if (pp) {
            data['p'] = pp
        }
        if (ss) {
            data['s'] = ss
        }
        if (mm) {
            data['m'] = mm
        }
        if (pre) {
            data['pre'] = pre
        }
        if (interval) {
            data['interval'] = interval
        }
        if (vol) {
            data['vol'] = vol
        }
        if (close) {
            data['close'] = close
        }
        if (Object.keys(data).length > 0) {
            return api(`/api/stock/filter/${tag}/${this.props.sortName}/${this.props.sortType}`, data, 'PUT');
        } else {
            return Promise.reject('Must set one condition!!!')
        }
    },
    render: function() {
        let rows = []
        this.props.dirs.forEach(dir => rows.push(
            <ReDirlist name={dir.title} time="qtime" dir={dir} set={(item, sortName, sortType) => this.props.dirset(dir.name, item, sortName, sortType)} del={id => this.props.deldir(dir.name, id)} listUrl={`${this.props.dirUrl}${dir.name}/`} delUrl={this.props.dirDelUrl} edit={this.props.edit} collapse={true} dirItem={this._dirItem} key={dir.key} />
        ))
        let edit = null;
        let open = null
        let open2 = null
        switch(this.props.itemType) {
            case PASSWORD:
            if (this.state.edit) {
                edit = <RePasswordInfo onclose={() => this.setState(Object.assign({}, this.state, {edit: false}))} item={{newable: true}} />;
            }
            open = (
                <li>
                    <a href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                        New Row&nbsp;<i className="glyphicon glyphicon-plus"></i>
                    </a>
                </li>
            )
            break
            case STOCK:
            open = (
                <li>
                    <a href="#" onClick={e => killEvent(e, () => this.props.globalinput(2, this._filter, 'danger', 'Filter Tag', null, 'per<10 yield<30'))}>
                        Filter&nbsp;<i className="glyphicon glyphicon-play"></i>
                    </a>
                </li>
            )
            open2 = (
                <li>
                    <a href="#" onClick={e => killEvent(e, this.props.stockopen2)}>
                        Total&nbsp;<i className="glyphicon glyphicon-tasks"></i>
                    </a>
                </li>
            )
            break
            /*case FITNESS:
            if (this.props.level === 2) {
                open = (
                    <li>
                        <a href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                            New Row&nbsp;<i className="glyphicon glyphicon-plus"></i>
                        </a>
                    </li>
                );
                if (this.state.edit) {
                    edit = <ReFitnessInfo onclose={() => this.setState(Object.assign({}, this.state, {edit: false}))} item={{newable: true}} />;
                }
            }
            break;
            case RANK:
            if (this.props.level === 2) {
                open = (
                    <li>
                        <a href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                            New Row&nbsp;<i className="glyphicon glyphicon-plus"></i>
                        </a>
                    </li>
                );
                if (this.state.edit) {
                    edit = <ReRankInfo onclose={() => this.setState(Object.assign({}, this.state, {edit: false}))} />;
                }
            }
            break;*/
            case LOTTERY:
            open = this.props.stockopen ? (
                <li>
                    <a href="#" onClick={e => killEvent(e, this.props.setstock)}>
                        END LOTTERY&nbsp;<i className="glyphicon glyphicon-cloud-download"></i>
                    </a>
                </li>
            ) : null;
            break;
            case BITFINEX:
            if (this.state.edit) {
                edit = <ReBitfinexInfo onclose={() => this.setState(Object.assign({}, this.state, {edit: false}))} />;
            }
            this.props.bdirs.forEach(dir => rows.push(
                <li key={dir.name}>
                    <a href="#" onClick={e => killEvent(e, () => {
                        let name = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortName`)) ? localStorage.getItem(`${this.props.itemType}SortName`): this.props.sortName
                        let type = (typeof(Storage) !== "undefined" && localStorage.getItem(`${this.props.itemType}SortType`)) ? localStorage.getItem(`${this.props.itemType}SortType`): this.props.sortType
                        getItemList(this.props.itemType, name, type, this.props.set, 0, '', false, dir.name, 0, false, false, false, this.props.mainUrl).catch(err => this.props.addalert(err))
                    })}>{dir.show}</a>
                </li>
            ))
            open = (
                <li>
                    <a href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {edit: !this.state.edit})))}>
                        Bot Settings&nbsp;<i className="glyphicon glyphicon-off"></i>
                    </a>
                </li>
            )
            break;
        }
        const chartOpen = this.props.stockopen ? <i className="glyphicon glyphicon-chevron-up"></i> : <i className="glyphicon glyphicon-chevron-down"></i>;
        const chart = this.props.stock ? (
            <li className="active">
                <a href="#" onClick={e => killEvent(e, this.props.setstock)}>
                    <strong>{this.props.stock.type}{this.props.stock.index}{this.props.stock.name}{chartOpen}</strong>
                </a>
            </li>
        ) : null
        const ul = (this.props.itemType === LOTTERY) ? (
            <ul className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', overflowX: 'hidden', overflowY: 'auto'}}>
                {open}
                {open2}
                <ReDirlist name="USER LIST" time="mtime" dir={this.props.itemlist} del={()=>{}} edit={false} collapse={false} dirItem={()=>{}} noSort={true} />
            </ul>
        ) : (this.props.itemType === BITFINEX) ? (
            <ul className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', overflowX: 'hidden', overflowY: 'auto'}}>
                {chart}
                {open}
                {open2}
                {rows}
            </ul>
        ) : this.props.stockopen ? (
            <ul className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', overflowX: 'hidden', overflowY: 'auto'}}>
                {chart}
            </ul>
        ) : (
            <ul className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', overflowX: 'hidden', overflowY: 'auto'}}>
                {chart}
                {open}
                {open2}
                <ReDirlist name="Bookmark" time="mtime" dir={this.props.bookmark} set={this.props.bookmarkset} del={this.props.delbookmark} listUrl={this.props.bookUrl} delUrl={this.props.bookDelUrl} edit={true} collapse={false} dirItem={this._bookmarkItem} />
                {rows}
            </ul>
        )
        return (
            <nav className="navbar-inverse" style={{width: '100%', position: 'fixed', zIndex: RIGHT_SECTION_ZINDEX}}>
                {edit}
                <div className={this.state.collapse ? 'navbar-collapse collapse' : 'navbar-collapse collapse in'}>
                    {ul}
                </div>
            </nav>
        )
    }
})

export default Categorylist
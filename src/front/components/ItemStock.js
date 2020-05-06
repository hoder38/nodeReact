import React from 'react'
import Dropdown from './Dropdown'
import { api, killEvent } from '../utility'

const ItemStock = React.createClass({
    componentWillMount: function() {
        this._dropList = [
            {title: 'PER', onclick: () => this._per(this.props.item.id), key: 0},
            {title: 'PREDICT', onclick: () => this._predict(this.props.item.id), key: 1},
            {title: 'INTERVAL', onclick: () => this._interval(this.props.item.id), key: 2},
            //{title: 'POINT', onclick: () => this._point(this.props.item.id), key: 3},
        ]
    },
    _per: function(id) {
        api(`/api/stock/getPER/${id}`).then(result => {
            this.props.setLatest(id, this.props.bookmark);
            this.props.globalinput(4, () => {}, 'warning', 'Parse Index', result.per);
        }).catch(err => this.props.addalert(err))
    },
    _predict: function(id) {
        api(`/api/stock/getPredictPER/${id}`).then(result => {
            this.props.setLatest(id, this.props.bookmark);
            this.props.globalinput(4, () => {}, 'warning', 'Parse Index', result.per);
        }).catch(err => this.props.addalert(err))
    },
    _interval: function(id) {
        api(`/api/stock/getInterval/${id}`).then(result => {
            this.props.setLatest(id, this.props.bookmark);
            this.props.globalinput(4, () => {}, 'warning', 'Parse Index', result.interval);
        }).catch(err => this.props.addalert(err))
    },
    /*_point: function(id) {
        this.props.globalinput(1, point => api(`/api/stock/getPoint/${id}/${point}`).then(result => {
            this.props.setLatest(id, this.props.bookmark);
            this.props.globalinput(4, () => {}, 'info', 'Input Price', result.point[0], result.point[1]);
        }), 'info', 'Input Price')
    },*/
    render: function() {
        const item = this.props.item
        return (
            <tr className={(this.props.latest === item.id) ? 'info' : ''}>
                <td className="text-center" style={{width: '56px'}}>
                    <input
                        type="checkbox"
                        checked={this.props.check}
                        ref={ref => this.props.getRef(ref)}
                        onChange={this.props.onchange} />
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                    <a href="#" className="item-point" /*onClick={e => killEvent(e, () => this.props.setstock(item))}*/>{item.type}{item.index}{item.name}</a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.profit}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.safety}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.management}</td>
                <td style={{width: '50px'}}>
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={this._dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
})

export default ItemStock
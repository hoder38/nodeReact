import React from 'react'
import Dropdown from './Dropdown.js'
import RankStatis from './RankStatis.js'
import { killEvent, api } from '../utility.js'

class ItemRank extends React.Component {
    constructor(props) {
        super(props);
        this.state = {open: false}
    }
    _openChart = id => {
        api(`/api/rank/getChart/${id}`).then(result => {
            this.props.setLatest(id, this.props.bookmark);
            this._item = result;
            this.setState({open: true});
        }).catch(err => this.props.addalert(err));
    }
    _delRank = (id, name) => {
        this.props.sendglbcf(() => api(`/api/rank/delRow/${id}`, {}, 'DELETE').catch(err => this.props.addalert(err)), `Would you sure to delete ${name} ?`);
    }
    render() {
        const item = this.props.item;
        let dropList = [{title: 'Details', onclick: () => this._openChart(item.id), key: 0}];
        if (this.props.level === 2) {
            dropList.push({title: 'Delete', onclick: () => this._delRank(item.id, item.name), key: 1});
        }
        const open = this.state.open ? <RankStatis onclose={() => this.setState({open: false})} item={this._item} /> : null;
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
                    <a href="#" className="item-point" onClick={e => killEvent(e, () => this._openChart(item.id))}>{item.name}</a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.start}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.type}</td>
                <td style={{width: '50px'}}>
                    {open}
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
}

export default ItemRank

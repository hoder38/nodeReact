import React from 'react'
import { killEvent, api } from '../utility.js'
import Dropdown from './Dropdown.js'

class ItemLottery extends React.Component {
    constructor(props) {
        super(props);
    }
    _select = (id, name) => {
        if (!this.props.owner) {
            return this.props.addalert('You are not the owner');
        }
        if (typeof this.props.item.utime === 'string') {
            return this.props.addalert('Prize has already opened!!!');
        }
        this.props.sendglbcf(() => api(`/api/lottery/select/${id}`).catch(err => this.props.addalert(err)), `Would you sure to open ${name}?`)
    }
    render() {
        const item = this.props.item;
        const dropList = item.utime ? item.tags.map((t, i) => ({title: t, onclick: () => {}, key: i})) : [{title: 'UNOPENED', onclick: () => {}, key: 0}];
        const fileType = (typeof this.props.item.utime === 'string') ? 'recycled' : '';
        return (
            <tr className={fileType}>
                <td className="text-center" style={{width: '56px'}}>
                    <input type="checkbox" disabled={true} />
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                    <a href="#" className="item-point" onClick={e => killEvent(e, () => this._select(item.id, item.name))}>{item.name}</a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.utime ? item.utime : 'UNOPENED'}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.count}</td>
                <td style={{width: '50px'}}>
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

export default ItemLottery
import React from 'react'
import Dropdown from './Dropdown.js'
import { api, killEvent } from '../utility.js'

class ItemBitfinex extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        const item = this.props.item
        let fileType = '';
        switch(item.type) {
            case 1:
            fileType = 'info';
            break;
            case 2:
            fileType = 'danger';
            break;
            case 3:
            fileType = 'warning';
            break;
            case 4:
            fileType = 'success';
            break;
        }
        fileType = item.taken ? `${fileType} recycled` : item.boost ? `${fileType} external` : fileType;
        const dropList = item.str ? (
            <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={[{title: item.str, onclick: () => {}, key: 0}]}>
                <button type="button" className="btn btn-default">
                    <span className="caret"></span>
                </button>
            </Dropdown>
        ) : (
            <button type="button" className="btn btn-default">
                <span className="caret"></span>
            </button>
        );
        let click = () => {};
        if (item.taken) {
            click = () => {
                this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/bitfinex/bot/close/${item.id}`).catch(err => this.props.addalert(err)), `Would you sure to close Credit ${item.id}?`);
            }
        }
        return (
            <tr className={fileType}>
                <td className="text-center" style={{width: '56px'}}>
                    <input
                        type="checkbox"
                        checked={this.props.check}
                        ref={ref => this.props.getRef(ref)}
                        onChange={this.props.onchange} />
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}} onClick={e => killEvent(e, click)}>{item.name}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.rate}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.utime}</td>
                <td style={{width: '50px'}}>{dropList}</td>
            </tr>
        )
    }
}

export default ItemBitfinex

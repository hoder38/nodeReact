import React from 'react'
import Dropdown from './Dropdown.js'
import ReFitnessInfo from '../containers/ReFitnessInfo.js'
import { isValidString, api, killEvent } from '../utility.js'

const ItemFitness = React.createClass({
    getInitialState: function() {
        return {edit: false}
    },
    _delFitness: function(id, name) {
        this.props.sendglbcf(() => api(`/api/fitness/delRow/${id}`, {}, 'DELETE').catch(err => this.props.addalert(err)), `Would you sure to delete ${name} ?`);
    },
    render: function() {
        const item = this.props.item
        const edit = this.state.edit ? <ReFitnessInfo item={item} onclose={() => this.setState({edit: false})} /> : null
        let dropList = [{title: 'Details', onclick: () => this.setState({edit: true}), key: 0}];
        if (this.props.level === 2) {
            dropList.push({title: 'Delete', onclick: () => this._delFitness(item.id, item.name), key: 1});
        }
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
                    <a href="#" className="item-point" onClick={e => killEvent(e, () => this.setState({edit: true}))}>{item.name}</a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.price}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.count}</td>
                <td style={{width: '50px'}}>
                    {edit}
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
})

export default ItemFitness
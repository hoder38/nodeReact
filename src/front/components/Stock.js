import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants'
import ReItemInput from '../containers/ReItemInput'
import ReStockCategorylist from '../containers/ReStockCategorylist'
import ReStockItemHead from '../containers/ReStockItemHead'
import ReStockItemPath from '../containers/ReStockItemPath'
import ReStockItemlist from '../containers/ReStockItemlist'
import ReStockInfo from '../containers/ReStockInfo'
import { api } from '../utility'

const Stock = React.createClass({
    getInitialState: function() {
        return {
            item: null,
            open: false,
        }
    },
    componentWillMount: function() {
        api('/api/parent/stock/list').then(result => this.props.sdirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/stock/add', {name: dir.name, tag: tag}).then(result => this.props.pushsdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => {
            this.props.addalert(err)
        })
    },
    render: function() {
        const stock = this.state.item && this.state.open ? <ReStockInfo item={this.state.item} /> : <ReStockItemlist setstock={item => this.setState({item, open: true})} />
        const path = this.state.item && this.state.open ? null : <ReStockItemPath />
        const head = this.state.item && this.state.open ? null : <ReStockItemHead />
        return (
            <div>
                <ReStockCategorylist collapse={RIGHT} bookUrl="/api/bookmark/stock/getlist/" bookDelUrl="/api/bookmark/stock/del/" dirUrl="/api/parent/stock/taglist/" dirDelUrl="/api/parent/stock/del/" setstock={() => this.setState(Object.assign({}, this.state, {open: !this.state.open}))} stock={this.state.item} stockopen={this.state.open} />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                    {path}
                    {head}
                </section>
                {stock}
            </div>
        )
    }
})

export default Stock

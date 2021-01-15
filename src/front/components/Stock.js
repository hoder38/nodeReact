import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants.js'
import ReItemInput from '../containers/ReItemInput.js'
import ReStockCategorylist from '../containers/ReStockCategorylist.js'
import ReStockItemHead from '../containers/ReStockItemHead.js'
import ReStockItemPath from '../containers/ReStockItemPath.js'
import ReStockItemlist from '../containers/ReStockItemlist.js'
import ReStockInfo from '../containers/ReStockInfo.js'
import ReStockTotal from '../containers/ReStockTotal.js'
import { api } from '../utility.js'

class Stock extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            item: null,
            open: false,
            open2: false,
        }
    }
    componentDidMount() {
        api('/api/parent/stock/list').then(result => this.props.sdirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/stock/add', {name: dir.name, tag: tag}).then(result => this.props.pushsdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => {
            this.props.addalert(err)
        })
    }
    _toggle = () => {
        this.setState(Object.assign({}, this.state, {open2: !this.state.open2}))
    }
    render() {
        const stock = this.state.item && this.state.open ? <ReStockInfo item={this.state.item} /> : <ReStockItemlist setstock={item => this.setState({item, open: true, open2: this.state.open2})} />
        const path = this.state.item && this.state.open ? null : <ReStockItemPath />
        const head = this.state.item && this.state.open ? null : <ReStockItemHead />
        return (
            <div>
                <ReStockCategorylist collapse={RIGHT} bookUrl="/api/bookmark/stock/getlist/" bookDelUrl="/api/bookmark/stock/del/" dirUrl="/api/parent/stock/taglist/" dirDelUrl="/api/parent/stock/del/" setstock={() => this.setState(Object.assign({}, this.state, {open: !this.state.open}))} stock={this.state.item} stockopen={this.state.open} stockopen2={this._toggle} />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                    {path}
                    {head}
                </section>
                {stock}
                <ReStockTotal open={this.state.open2} toggle={this._toggle}/>
            </div>
        )
    }
}

export default Stock

import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants.js'
import ReBitfinexCategorylist from '../containers/ReBitfinexCategorylist.js'
import ReBitfinexItemHead from '../containers/ReBitfinexItemHead.js'
import ReBitfinexItemlist from '../containers/ReBitfinexItemlist.js'
import { api } from '../utility.js'

class Bitfinex extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            parent: [],
        };
    }
    componentDidMount() {
        if (this.props.mainUrl) {
            api(`${this.props.mainUrl}/api/bitfinex/parent`).then(result => this.setState(Object.assign({}, this.state, {parent: result}))).catch(err => this.props.addalert(err))
        }
    }
    componentDidUpdate(prevProps) {
        if (prevProps.mainUrl !== this.props.mainUrl) {
            api(`${this.props.mainUrl}/api/bitfinex/parent`).then(result => this.setState(Object.assign({}, this.state, {parent: result}))).catch(err => this.props.addalert(err))
        }
    }
    render() {
        return (
            <div>
                <ReBitfinexCategorylist collapse={RIGHT} bdirs={this.state.parent} />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReBitfinexItemHead />
                </section>
                <ReBitfinexItemlist />
            </div>
        )
    }
}

export default Bitfinex
import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants'
import ReBitfinexCategorylist from '../containers/ReBitfinexCategorylist'
import ReBitfinexItemHead from '../containers/ReBitfinexItemHead'
import ReBitfinexItemlist from '../containers/ReBitfinexItemlist'
import { api } from '../utility'

const Bitfinex = React.createClass({
    getInitialState: function() {
        return {parent: []};
    },
    componentWillMount: function() {
        if (this.props.mainUrl) {
            api(`${this.props.mainUrl}/api/bitfinex/parent`).then(result => this.setState(Object.assign({}, this.state, {parent: result}))).catch(err => this.props.addalert(err))
        }
    },
    componentWillReceiveProps: function(nextProps) {
        if (nextProps.mainUrl !== this.props.mainUrl) {
            api(`${nextProps.mainUrl}/api/bitfinex/parent`).then(result => this.setState(Object.assign({}, this.state, {parent: result}))).catch(err => this.props.addalert(err))
        }
    },
    render: function() {
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
});

export default Bitfinex
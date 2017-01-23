import React from 'react'
import DropdownMenu from './DropdownMenu'
import { killEvent } from '../utility'

const Dropdown = React.createClass({
    getInitialState: function() {
        return {
            open: false,
        }
    },
    _globalClick: function(listen) {
        if (listen) {
            document.addEventListener("click", this._closeDrop)
        } else {
            document.removeEventListener("click", this._closeDrop)
        }
    },
    _closeDrop: function(e) {
        killEvent(e, () => this.setState({open: false}))
    },
    render: function() {
        let ul = this.state.open ? <DropdownMenu droplist={this.props.droplist} globalClick={this._globalClick} style={this.props.style} param={this.props.param} /> : ''
        const className = this.props.className ? this.props.className + ' dropdown' : 'dropdown'
        return (
            <this.props.headelement className={this.state.open ? `${className} open` : className} onClick={e => killEvent(e, () => this.setState({open: !this.state.open}))}>
                {this.props.children}
                {ul}
            </this.props.headelement>
        )
    }
})

export default Dropdown
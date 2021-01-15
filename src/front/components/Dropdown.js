import React from 'react'
import DropdownMenu from './DropdownMenu.js'
import { killEvent } from '../utility.js'

class Dropdown extends React.Component {
    constructor(props) {
        super(props);
        this.wrapperRef = React.createRef();
        this.state = {
            open: false,
        };
    }
    _globalClick = listen => {
        if (listen) {
            document.addEventListener("mouseup", this._closeDrop)
        } else {
            document.removeEventListener("mouseup", this._closeDrop)
        }
    }
    _closeDrop = e => {
        killEvent(e, () => this.setState({open: false}))
    }
    render() {
        let ul = this.state.open ? <DropdownMenu droplist={this.props.droplist} globalClick={this._globalClick} style={this.props.style} param={this.props.param} /> : ''
        const className = this.props.className ? this.props.className + ' dropdown' : 'dropdown'
        return (
            <this.props.headelement className={this.state.open ? `${className} open` : className} onClick={e => killEvent(e, () => this.setState({open: !this.state.open}))}>
                {this.props.children}
                {ul}
            </this.props.headelement>
        )
    }
}

export default Dropdown
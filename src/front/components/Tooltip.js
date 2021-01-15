import React from 'react'
import { findDOMNode } from 'react-dom'

class Tooltip extends React.Component {
    constructor(props) {
        super(props);
        this._showed = false
        this._show = {visibility: 'hidden', whiteSpace: 'nowrap'}
        this._self = null
        this._target = null
        this.state = {show: false}
    }
    componentDidMount() {
        this._self = findDOMNode(this)
        this._target = this._self.parentNode
        this._target.addEventListener('mouseenter', this._showTooltip)
        this._target.addEventListener('mouseleave', this._hideTooltip)
    }
    componentWillUnmount() {
        this._target.removeEventListener('mouseenter', this._showTooltip)
        this._target.removeEventListener('mouseleave', this._hideTooltip)
    }
    _showTooltip = () => {
        this.setState({show: true})
    }
    _hideTooltip = () => {
        this._showed = false
        this.setState({show: false})
    }
    render() {
        if (!this._showed || !this.state.show) {
            if (this.state.show) {
                this._showed = true
            }
            this._show = {visibility: 'hidden', whiteSpace: 'nowrap', overflowX: 'hidden'}
            switch(this.props.place) {
                case 'top':
                if (this._target && this.state.show) {
                    this._show = {
                        top: `${-this._self.offsetHeight + this._self.offsetTop + 6}px`,
                        left: `${Math.round((this._target.offsetWidth - this._self.offsetWidth) / 2) + this._self.offsetLeft}px`,
                        whiteSpace: 'nowrap',
                        overflowX: 'hidden',
                    }
                }
                break
                case 'left':
                if (this._target && this.state.show) {
                    this._show = {
                        top: `${Math.round((this._target.offsetHeight - this._self.offsetHeight) / 2) + this._self.offsetTop}px`,
                        right: `${this._target.offsetWidth - this._self.offsetLeft}px`,
                        whiteSpace: 'nowrap',
                        overflowX: 'hidden',
                    }
                }
                break
                default:
                if (this._target && this.state.show) {
                    this._show = {
                        top: `${Math.round((this._target.offsetHeight - this._self.offsetHeight) / 2) + this._self.offsetTop}px`,
                        left: `${this._target.offsetWidth + this._self.offsetLeft - 6}px`,
                        whiteSpace: 'nowrap',
                        overflowX: 'visible',
                    }
                }
                break
            }
        }
        return (
            <div className={`tooltip in ${this.props.place}`} style={this._show}>
                <div className="tooltip-arrow"></div>
                <div style={this.props.style} className="tooltip-inner">{this.props.tip}</div>
            </div>
        )
    }
}

export default Tooltip

import React from 'react'
import { Link, IndexLink } from 'react-router'
import { ROOT_PAGE } from '../constants'
import { killEvent } from '../utility'

const Navlist = React.createClass({
    getInitialState: function() {
        return {
            collapse: true,
        }
    },
    componentDidMount: function() {
        this._targetArr = Array.from(document.querySelectorAll('[data-collapse]')).filter(node => node.getAttribute('data-collapse') === this.props.collapse)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('click', this._toggle)
            })
        }
    },
    componentWillUnmount: function() {
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('click', this._toggle)
            })
        }
    },
    _toggle: function(e) {
        killEvent(e, this.setState({collapse: !this.state.collapse}))
    },
    render: function() {
        let rows = []
        this.props.navlist.forEach(nav => {
            if (nav.hash === ROOT_PAGE) {
                rows.push(
                    <li key={nav.key}>
                        <IndexLink to={ROOT_PAGE}>
                            <i className={nav.css}></i>&nbsp;{nav.title}
                        </IndexLink>
                    </li>
                )
            } else {
                rows.push(
                    <li key={nav.key}>
                        <Link to={nav.hash}>
                            <i className={nav.css}></i>&nbsp;{nav.title}
                        </Link>
                    </li>
                )
            }
        })
        return (
            <div className={this.state.collapse ? 'navbar-collapse collapse' : 'navbar-collapse collapse in'}>
                <ul className="nav navbar-nav side-nav">{rows}</ul>
            </div>
        )
    }
})

export default Navlist
import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ROOT_PAGE } from '../constants.js'
import { killEvent } from '../utility.js'

class Navlist extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            collapse: true,
        }
    }
    componentDidMount() {
        this._targetArr = Array.from(document.querySelectorAll('[data-collapse]')).filter(node => node.getAttribute('data-collapse') === this.props.collapse)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('click', this._toggle)
            })
        }
    }
    componentWillUnmount() {
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('click', this._toggle)
            })
        }
    }
    _toggle = e => {
        killEvent(e, this.setState({collapse: !this.state.collapse}))
    }
    render() {
        let rows = []
        this.props.navlist.forEach(nav => {
            if (nav.hash === ROOT_PAGE) {
                rows.push(
                    <li key={nav.key}>
                        <NavLink exact to={ROOT_PAGE}>
                            <i className={nav.css}></i>&nbsp;{nav.title}
                        </NavLink>
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
}

export default Navlist
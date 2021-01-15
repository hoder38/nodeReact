import React from 'react'
import { killEvent } from '../utility.js'

class DropdownMenu extends React.Component {
    constructor(props) {
        super(props);
    }
    componentDidMount() {
        this.props.globalClick(true)
    }
    componentWillUnmount() {
        this.props.globalClick(false)
    }
    render() {
        let rows = []
        this.props.droplist.forEach(drop => {
            if (drop.title) {
                rows.push(
                    <li key={drop.key}>
                        <a href="#" onMouseDown={e => killEvent(e, () => drop.onclick(this.props.param))}>
                            <i className={drop.className}></i>&nbsp;{drop.title}
                        </a>
                    </li>
                )
            } else {
                rows.push(<li className="divider" key={drop.key}></li>)
            }
        })
        const style = this.props.style ? this.props.style : {}
        return <ul className="dropdown-menu" style={style}>{rows}</ul>
    }
}

export default DropdownMenu
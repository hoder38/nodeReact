import React from 'react'

class AlertMsg extends React.Component {
    constructor(props) {
        super(props);
    }
    componentDidMount() {
        this._timeout = setTimeout(this.props.onclose, 5000)
    }
    componentWillUnmount() {
        clearTimeout(this._timeout)
    }
    render() {
        return (
            <div className="alert alert-danger alert-dismissable" role="alert">
                <button type="button" className="close" onClick={this.props.onclose}>
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">Close</span>
                </button>
                <div><span>{this.props.msg}</span></div>
            </div>
        )
    }
}

export default AlertMsg

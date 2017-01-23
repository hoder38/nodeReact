import React from 'react'

const AlertMsg = React.createClass({
    componentWillMount: function() {
        this._timeout = setTimeout(this.props.onclose, 5000)
    },
    componentWillUnmount: function() {
        clearTimeout(this._timeout)
    },
    render: function() {
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
})

export default AlertMsg

import React from 'react'
import { BLOCK_ZINDEX } from '../constants'
import { killEvent } from '../utility'

const toggle = function*() {
    let text1, text2
    while(1) {
        text1 = yield (<strong>{text2}</strong>)
        text2 = yield text1
    }
}()
toggle.next()

const GlobalComfirm = React.createClass({
    _handleSubmit: function() {
        this.props.callback()
        this.props.onclose()
    },
    render: function() {
        const text_show = toggle.next(this.props.text).value
        return (
            <section style={{position: 'fixed', zIndex: BLOCK_ZINDEX, top: '0px', right: '0px', width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.3)'}}>
                <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h3 className="modal-title">confirm</h3>
                            </div>
                            <div className="modal-body">
                                {text_show}
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-primary" type="submit">OK</button>
                                <button className="btn btn-warning" type="button" onClick={this.props.onclose}>Cancel</button>
                            </div>
                        </div>
                    </div>
                </form>
            </section>
        )
    }
})

export default GlobalComfirm

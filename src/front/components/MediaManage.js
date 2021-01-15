import React from 'react'
import { MEDIA_ZINDEX, MUSIC, VIDEO, IMAGE, PLAYLIST } from '../constants.js'
import ReMediaWidget from '../containers/ReMediaWidget.js'

class MediaManage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            full: false,
            show: [false, false, false, false],
        }
    }
    _toggleFull = () => {
        this.setState(Object.assign({}, this.state, {full: !this.state.full}))
    }
    _toggleShow = (index, open) => {
        this.setState(Object.assign({}, this.state, {show: this.state.show.map((item, i) => i === index ? open === null ? !item : open : false)}))
    }
    render() {
        const sectionCss = this.state.full ? {
            position: 'fixed',
            top: '0px',
            left: '0px',
            maxWidth: '98vw',
            zIndex: MEDIA_ZINDEX,
        } : {
            position: 'fixed',
            top: '60px',
            right: '10px',
            maxWidth: '50%',
            zIndex: MEDIA_ZINDEX,
        }
        return (
            <section style={sectionCss}>
                <ReMediaWidget mediaType={2} toggle={IMAGE} buttonType="warning" full={this.state.full} toggleFull={this._toggleFull} show={this.state.show[0]} toggleShow={(open=null) => this._toggleShow(0, open)} />
                <ReMediaWidget mediaType={3} toggle={VIDEO} buttonType="success" full={this.state.full} toggleFull={this._toggleFull} show={this.state.show[1]} toggleShow={(open=null) => this._toggleShow(1, open)} />
                <ReMediaWidget mediaType={4} toggle={MUSIC} buttonType="primary" full={this.state.full} toggleFull={this._toggleFull} show={this.state.show[2]} toggleShow={(open=null) => this._toggleShow(2, open)} />
                <ReMediaWidget mediaType={9} toggle={PLAYLIST} buttonType="danger" full={this.state.full} toggleFull={this._toggleFull} show={this.state.show[3]} toggleShow={(open=null) => this._toggleShow(3, open)} />
            </section>
        )
    }
}

export default MediaManage
import React from 'react'
import { TOP_SECTION_ZINDEX, RIGHT_SECTION_ZINDEX } from '../constants.js'
import ReItemInput from '../containers/ReItemInput.js'
import { api } from '../utility.js'

class Homepage extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            intro: [],
        }
    }
    componentDidMount() {
        let intro_msg = []
        api('/api/homepage').then(intro => {
            intro.msg.forEach((msg, i) => intro_msg.push(<span key={i}>{msg}<br /></span>))
            this.setState({
                intro: intro_msg,
            })
        }).catch(err => console.log(err))
    }
    render() {
        return (
            <div>
                <section className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', position: 'fixed', zIndex: RIGHT_SECTION_ZINDEX, height: '90%'}}></section>
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                </section>
                <section style={{paddingTop: '40px'}}>{this.state.intro}</section>
            </div>
        )
    }
}

export default Homepage
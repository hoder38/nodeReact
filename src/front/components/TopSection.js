import React from 'react'
import { TOP_SECTION_ZINDEX } from '../constants.js'
import ReItemInput from '../containers/ReItemInput.js'
import ReItemPath from '../containers/ReItemPath.js'
import ReItemHead from '../containers/ReItemHead.js'

class TopSection extends React.Component {
    constructor(props) {
        super(props);
    }
    render() {
        return (
            <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                <ReItemInput />
                <ReItemPath />
                <ReItemHead />
            </section>
        )
    }
}

export default TopSection
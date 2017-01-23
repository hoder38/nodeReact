import React from 'react'
import { TOP_SECTION_ZINDEX } from '../constants'
import ReItemInput from '../containers/ReItemInput'
import ReItemPath from '../containers/ReItemPath'
import ReItemHead from '../containers/ReItemHead'

const TopSection = React.createClass({
    render: function() {
        return (
            <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                <ReItemInput />
                <ReItemPath />
                <ReItemHead />
            </section>
        )
    }
})

export default TopSection
import React from 'react'
import { FILE_ZINDEX } from '../constants.js'
import ReFileAdd from '../containers/ReFileAdd.js'
import ReFileFeedback from '../containers/ReFileFeedback.js'

export default function FileManage() {
    return (
        <section id="file-manage-section" style={{float: 'left', position: 'fixed', bottom: '0px', zIndex: FILE_ZINDEX}}>
            <ReFileAdd />
            <ReFileFeedback />
        </section>
    )
}

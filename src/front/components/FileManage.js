import React from 'react'
import { FILE_ZINDEX } from '../constants'
import ReFileAdd from '../containers/ReFileAdd'
import ReFileFeedback from '../containers/ReFileFeedback'

export default function FileManage() {
    return (
        <section id="file-manage-section" style={{float: 'left', position: 'fixed', bottom: '0px', zIndex: FILE_ZINDEX}}>
            <ReFileAdd />
            <ReFileFeedback />
        </section>
    )
}

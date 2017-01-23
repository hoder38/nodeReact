import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants'
import ReCategorylist from '../containers/ReCategorylist'
import ReItemlist from '../containers/ReItemlist'
import ReItemInput from '../containers/ReItemInput'
import ReItemPath from '../containers/ReItemPath'
import ReItemHead from '../containers/ReItemHead'

export default function Storage() {
    return (
        <div>
            <ReCategorylist collapse={RIGHT} bookUrl="/api/bookmark/storage/getlist/" bookDelUrl="/api/bookmark/storage/del/" dirUrl="/api/parent/storage/taglist/" dirDelUrl="/api/parent/storage/del/" />
            <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                <ReItemInput />
                <ReItemPath />
                <ReItemHead />
            </section>
            <ReItemlist />
        </div>
    )
}
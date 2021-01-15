import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants.js'
import RePasswordCategorylist from '../containers/RePasswordCategorylist.js'
import ReItemInput from '../containers/ReItemInput.js'
import RePasswordItemPath from '../containers/RePasswordItemPath.js'
import RePasswordItemHead from '../containers/RePasswordItemHead.js'
import RePasswordItemlist from '../containers/RePasswordItemlist.js'
import { api } from '../utility.js'

class Password extends React.Component {
    constructor(props) {
        super(props);
    }
    componentDidMount() {
        api('/api/parent/password/list').then(result => this.props.pdirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/password/add', {name: dir.name, tag: tag}).then(result => this.props.pushpdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => {
            this.props.addalert(err)
        })
    }
    render() {
        return (
            <div>
                <RePasswordCategorylist collapse={RIGHT} bookUrl="/api/bookmark/password/getlist/" bookDelUrl="/api/bookmark/password/del/" dirUrl="/api/parent/password/taglist/" dirDelUrl="/api/parent/password/del/" />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                    <RePasswordItemPath />
                    <RePasswordItemHead />
                </section>
                <RePasswordItemlist />
            </div>
        )
    }
}

export default Password
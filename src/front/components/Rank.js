import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants.js'
import ReRankCategorylist from '../containers/ReRankCategorylist.js'
import ReItemInput from '../containers/ReItemInput.js'
import ReRankItemPath from '../containers/ReRankItemPath.js'
import ReRankItemHead from '../containers/ReRankItemHead.js'
import ReRankItemlist from '../containers/ReRankItemlist.js'
import { api } from '../utility.js'

class Rank extends React.Component({
    constructor(props) {
        super(props);
    }
    componentDidMount() {
        api('/api/parent/rank/list').then(result => this.props.rdirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/rank/add', {name: dir.name, tag: tag}).then(result => this.props.pushrdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => this.props.addalert(err));
    }
    render() {
        return (
            <div>
                <ReRankCategorylist collapse={RIGHT} bookUrl="/api/bookmark/rank/getlist/" bookDelUrl="/api/bookmark/rank/del/" dirUrl="/api/parent/rank/taglist/" dirDelUrl="/api/parent/rank/del/" />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                    <ReRankItemPath />
                    <ReRankItemHead />
                </section>
                <ReRankItemlist />
            </div>
        )
    }
}

export default Rank
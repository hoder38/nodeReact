import React from 'react'
import { RIGHT, TOP_SECTION_ZINDEX } from '../constants.js'
import ReFitnessCategorylist from '../containers/ReFitnessCategorylist.js'
import ReItemInput from '../containers/ReItemInput.js'
import ReFitnessItemPath from '../containers/ReFitnessItemPath.js'
import ReFitnessItemHead from '../containers/ReFitnessItemHead.js'
import ReFitnessItemlist from '../containers/ReFitnessItemlist.js'
import ReFitnessStatis from '../containers/ReFitnessStatis.js'
import { api } from '../utility.js'

class Fitness extends React.Component {
    constructor(props) {
        super(props);
        this.state = {open: false}
    }
    componentDidMount() {
        api('/api/fitness/getPoint').then(result => {
            if (result.point) {
                this.props.basicset(result.point);
            }
            return api('/api/parent/fitness/list').then(result => this.props.fdirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/fitness/add', {name: dir.name, tag: tag}).then(result => this.props.pushfdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => this.props.addalert(err))
        });
    }
    render() {
        const path = this.state.open ? null : <ReFitnessItemPath />
        const head = this.state.open ? null : <ReFitnessItemHead />
        const fitness = this.state.open ? <ReFitnessStatis onclose={() => this.setState(Object.assign({}, this.state, {open: false}))}/> : <ReFitnessItemlist />
        return (
            <div>
                <ReFitnessCategorylist collapse={RIGHT} bookUrl="/api/bookmark/fitness/getlist/" bookDelUrl="/api/bookmark/fitness/del/" dirUrl="/api/parent/fitness/taglist/" dirDelUrl="/api/parent/fitness/del/" setstock={() => this.setState(Object.assign({}, this.state, {open: !this.state.open}))} stock={{
                    type: 'Stats: ',
                    index: this.props.point,
                }} stockopen={this.state.open} />
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                    {path}
                    {head}
                </section>
                {fitness}
            </div>
        )
    }
}

export default Fitness
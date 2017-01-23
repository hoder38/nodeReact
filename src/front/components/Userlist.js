import React from 'react'
import { api } from '../utility'
import ReItemInput from '../containers/ReItemInput'
import { TOP_SECTION_ZINDEX, RIGHT_SECTION_ZINDEX } from '../constants'
import ReUserInfo from '../containers/ReUserInfo'

const Userlist = React.createClass({
    componentWillMount: function() {
        if (this.props.user_info.size === 0) {
            api('/api/user').then(result => this.props.userset(result.user_info)).catch(err => this.props.addalert(err))
        }
    },
    render: function() {
        let rows = []
        this.props.user_info.forEach(user => rows.push(<ReUserInfo key={user.id} user={user} />))
        return (
            <div>
                <section className="nav navbar-nav side-nav" id="inverse-nav" style={{right: '0px', left: 'auto', position: 'fixed', zIndex: RIGHT_SECTION_ZINDEX, height: '90%'}}></section>
                <section id="top-section" style={{float: 'left', position: 'fixed', left: '0px', width: '100%', zIndex: TOP_SECTION_ZINDEX}}>
                    <ReItemInput />
                </section>
                <div className="container" style={{
                    width: 'auto',
                    paddingTop: '40px',
                }}>
                    <div className="well col-xs-12 col-sm-12 col-md-12 col-lg-12">
                        <div className="row user-infos">
                            {rows}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
})

export default Userlist
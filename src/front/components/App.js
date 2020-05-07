import React from 'react'
import { IndexLink, browserHistory } from 'react-router'
import { ROOT_PAGE, LOGIN_PAGE, USER_PAGE, STORAGE_PAGE, PASSWORD_PAGE, LEFT, RIGHT, UPLOAD, FITNESS_PAGE, RANK_PAGE, LOTTERY_PAGE, BITFINEX_PAGE } from '../constants'
import { collapseToggle } from '../actions'
import { api, doLogout, isValidString } from '../utility'
import Navlist from './Navlist'
import ToggleNav from './ToggleNav'
import ReAlertlist from '../containers/ReAlertlist'
import Dropdown from './Dropdown'
import GlobalPassword from './GlobalPassword'
import ReGlobalComfirm from '../containers/ReGlobalComfirm'
import FileManage from './FileManage'
import ReWidgetManage from '../containers/ReWidgetManage'
import MediaManage from './MediaManage'

const App = React.createClass({
    getInitialState: function() {
        this._userDrop = [
            {title: 'Profile', className: 'glyphicon glyphicon-user', onclick: () => browserHistory.push(USER_PAGE), key: 0},
            {key: 1},
            {title: 'Log Out', className: 'glyphicon glyphicon-off', onclick: this._doLogout, key: 2},
        ]
        return {
            navlist: [
                {title: "homepage", hash: ROOT_PAGE, css: "glyphicon glyphicon-home", key: 0},
                {title: "Storage", hash: STORAGE_PAGE, css: "glyphicon glyphicon-hdd", key: 1},
                {title: "Password", hash: PASSWORD_PAGE, css: "glyphicon glyphicon-lock", key: 2},
                //{title: "Fitness", hash: FITNESS_PAGE, css: "glyphicon glyphicon-fire", key: 4},
                //{title: "Rank", hash: RANK_PAGE, css: "glyphicon glyphicon-education", key: 5},
                {title: "Lottery", hash: LOTTERY_PAGE, css: "glyphicon glyphicon-yen", key: 6},
                {title: "Bitfinex", hash: BITFINEX_PAGE, css: "glyphicon glyphicon-bitcoin", key: 7},
            ],
            zipPw: null,
        }
    },
    componentWillMount: function() {
        api('/api/getuser').then(userInfo => {
            if (isValidString(userInfo.id, 'name') && isValidString(userInfo.main_url, 'url') && isValidString(userInfo.ws_url, 'url') && isValidString(userInfo.level, 'perm')) {
                this.setState(Object.assign({}, this.state, {
                    navlist: [
                        ...this.state.navlist,
                        ...userInfo.nav,
                    ],
                }))
                this.props.basicset(userInfo.id, userInfo.main_url, userInfo.isEdit, userInfo.level)
                if (window.MozWebSocket) {
                    window.WebSocket = window.MozWebSocket
                }
                this._ws = new WebSocket(userInfo.ws_url)
                this._level = userInfo.level
                this._ws.onopen = () => console.log(userInfo.ws_url + ": Socket has been opened!")
                this._ws.onmessage = message => {
                    const wsmsg = JSON.parse(message.data)
                    if (this._level >= wsmsg.level) {
                        switch (wsmsg.type) {
                            case 'file':
                            api(`/api/storage/single/${wsmsg.data}`).then(result => result.empty ? this.props.itemdel(wsmsg.data) : this.props.itemset(result.item)).catch(err => this.props.addalert(err))
                            break
                            case 'password':
                            api(`/api/password/single/${wsmsg.data}`).then(result => result.empty ? this.props.passdel(wsmsg.data) : this.props.passset(result.item)).catch(err => this.props.addalert(err))
                            break
                            case 'stock':
                            api(`/api/stock/single/${wsmsg.data}`).then(result => result.empty ? this.props.stockdel(wsmsg.data) : this.props.stockset(result.item)).catch(err => this.props.addalert(err))
                            break
                            /*case 'fitness':
                            api(`/api/fitness/single/${wsmsg.data}`).then(result => result.empty ? this.props.fitnessdel(wsmsg.data) : this.props.fitnessset(result.item)).catch(err => this.props.addalert(err))
                            break
                            case 'rank':
                            api(`/api/rank/single/${wsmsg.data}`).then(result => result.empty ? this.props.rankdel(wsmsg.data) : this.props.rankset(result.item)).catch(err => this.props.addalert(err))
                            break*/
                            case 'bitfinex':
                            const bituser = wsmsg.user ? `/${wsmsg.user}` : '';
                            api(`${userInfo.main_url}/api/bitfinex/single/${this.props.bitSortName}/${this.props.bitSortType}/${wsmsg.data}${bituser}`).then(result => result.empty ? this.props.bitfinexdel(wsmsg.data) : (wsmsg.data === -1) ? this.props.bitfinexset(result.itemList, result.parentList, result.bookmarkID, result.latest, this.props.bitSortName, this.props.bitSortType) : this.props.bitfinexset(result.item)).catch(err => this.props.addalert(err))
                            break
                            case 'sub':
                            this.props.sub.forEach(item => item())
                            break
                            case userInfo.id:
                            this.props.addalert(wsmsg.data)
                            if (wsmsg.zip) {
                                this.props.sendglbcf(() => this.setState(Object.assign({}, this.state, {zipPw: pwd => {
                                    if (!isValidString(pwd, 'altpwd')) {
                                        this.props.addalert('Zip password not vaild!!!')
                                        return Promise.reject('Zip password not vaild!!!')
                                    } else {
                                        return api(`/api/storage/zipPassword/${wsmsg.zip}`, {pwd}, 'PUT').then(result => this.props.addalert('password update completed, please unzip again')).catch(err => {
                                            this.props.addalert(err)
                                            throw err
                                        })
                                    }
                                }})), `Would you want to input ${name} password ?`)
                            }
                            break
                            case 'select':
                            document.getElementById('root').dispatchEvent(new CustomEvent('lottery', {'detail': wsmsg.data}));
                            break
                            default:
                            console.log(wsmsg);
                        }
                    }
                }
                return api(`${userInfo.main_url}/api/file/feedback`)
            } else {
                throw Error('Invalid user data!!!')
            }
        }).then(result => {
            this.props.feedbackset(result.feedbacks)
            return api('/api/parent/storage/list');
        }).then(result => this.props.dirsset(result.parentList, (dir, i) => ({title: dir.show, name: dir.name, key: i, onclick: tag => this.props.sendglbcf(() => api('/api/parent/storage/add', {name: dir.name, tag: tag}).then(result => this.props.pushdir(dir.name, result)).catch(err => this.props.addalert(err)), `Would you sure add ${tag} to ${dir.show}?`)}))).catch(err => {
            this.props.addalert(err)
            this._doLogout()
        })
    },
    componentWillUnmount: function() {
        if (this._ws) {
            this._ws.close()
        }
        this.props.basicset('guest', '', false, [])
        this.props.feedbackset([])
        this.props.userset([])
        this.props.bookmarkset([], 'name', 'asc')
        this.props.itemset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'asc', '')
        this.props.passset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'asc', '')
        this.props.stockset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'asc', '')
        /*this.props.fitnessset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'desc', '')
        this.props.rankset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'desc', '')*/
        this.props.bitfinexset([], {
            cur: [],
            exactly: [],
            his: [],
        }, '', '', 'name', 'asc', '')
        this.props.dirsset([])
        this.props.resetmedia(2)
        this.props.resetmedia(3)
        this.props.resetmedia(4)
        this.props.resetmedia([])
    },
    _doLogout: function() {
        doLogout().then(() => browserHistory.push(LOGIN_PAGE)).catch(err => this.props.addalert(err))
    },
    render: function() {
        const glbPw = this.props.pwCallback.length > 0 ? <GlobalPassword callback={this.props.pwCallback[0]} delay="user" onclose={this.props.closeglbpw} /> : ''
        const zipPw = this.state.zipPw ? <GlobalPassword callback={this.state.zipPw} onclose={() => this.setState(Object.assign({}, this.state, {zipPw: null}))} /> : ''
        const glbCf = this.props.cfCallback.length > 0 ? <ReGlobalComfirm callback={this.props.cfCallback[0]} text={this.props.cfCallback[1]} /> : ''
        return (
            <div id="wrapper" data-drop={UPLOAD} className="storage-wrapper">
                <FileManage />
                <ReWidgetManage />
                <MediaManage />
                <ReAlertlist />
                {glbPw}
                {zipPw}
                {glbCf}
                <nav className="navbar navbar-inverse navbar-fixed-top" role="navigation">
                    <div className="navbar-header">
                        <ToggleNav inverse={true} collapse={LEFT} />
                        <IndexLink className="navbar-brand" to={ROOT_PAGE}>ANoMoPi</IndexLink>
                        <ToggleNav inverse={false} collapse={RIGHT} />
                    </div>
                    <ul className="nav navbar-right top-nav">
                        <Dropdown headelement="li" droplist={this._userDrop}>
                            <a href="#">
                                <i className="glyphicon glyphicon-user"></i>&nbsp;{this.props.id}<b className="caret"></b>
                            </a>
                        </Dropdown>
                    </ul>
                    <Navlist navlist={this.state.navlist} collapse={LEFT} />
                </nav>
                <section id="page-wrapper">{this.props.children}</section>
            </div>
        )
    }
})

export default App
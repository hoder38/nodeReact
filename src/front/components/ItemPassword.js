import React from 'react'
import Dropdown from './Dropdown.js'
import RePasswordInfo from '../containers/RePasswordInfo.js'
import { isValidString, api, killEvent } from '../utility.js'

class ItemPassword extends React.Component {
    constructor(props) {
        super(props);
        this.state = {edit: false}
    }
    _gotoUrl = url => {
        !isValidString(url, 'url') ? window.open(decodeURIComponent(url)) : this.props.addalert('url is not vaild!!!')
    }
    _gotoEmail = email => {
        if (!isValidString(email, 'email')) {
            this.props.addalert('email is not vaild!!!')
        } else {
            if (email.match(/@gmail\.com(\.[a-zA-Z][a-zA-Z][a-zA-Z]?)?$/)) {
                window.open('https://mail.google.com/')
            } else if (email.match(/@yahoo\.com(\.[a-zA-Z][a-zA-Z][a-zA-Z]?)?$/)) {
                window.open('https://login.yahoo.com/config/mail?')
            } else if (email.match(/@(hotmail|msn|live)\.com(\.[a-zA-Z][a-zA-Z][a-zA-Z]?)?$/)) {
                window.open('https://www.live.com/')
            } else {
                this.props.addalert('目前沒有此email類型請自行前往')
            }
        }
    }
    _delPassword = (id, name, important) => {
        this.props.sendglbcf(() => important ? this.props.sendglbpw(userPW => {
            if (!isValidString(userPW, 'passwd')) {
                this.props.addalert('User password not vaild!!!')
                return Promise.reject('User password not vaild!!!')
            } else {
                return api(`/api/password/delRow/${id}`, {userPW}, 'PUT').catch(err => {
                    this.props.addalert(err)
                    throw err
                })
            }
        }) : api(`/api/password/delRow/${id}`, {}, 'PUT').catch(err => this.props.addalert(err)), `Would you sure to delete ${name} ?`)
    }
    _getUsername = name => {
        this.props.globalinput(3, () => {}, 'info', 'New Username...', name)
    }
    _getPassword = (id, important) => {
        important ? this.props.sendglbpw(userPW => {
            if (!isValidString(userPW, 'passwd')) {
                this.props.addalert('User password not vaild!!!')
                return Promise.reject('User password not vaild!!!')
            } else {
                return api(`/api/password/getPW/${id}`, {userPW}, 'PUT').then(result => {
                    this.props.setLatest(id, this.props.bookmark)
                    this.props.globalinput(3, () => {}, 'warning', 'New Password...', result.password, true)
                }).catch(err => {
                    this.props.addalert(err)
                    throw err
                })
            }
        }) : api(`/api/password/getPW/${id}`, {}, 'PUT').then(result => {
            this.props.setLatest(id, this.props.bookmark)
            this.props.globalinput(3, () => {}, 'warning', 'New Password...', result.password, true)
        }).catch(err => this.props.addalert(err))
    }
    render() {
        const item = this.props.item
        let fileType = item.important ? 'recycled' : ''
        let dropList = [
            {title: 'Details', onclick: () => this.setState({edit: true}), key: 0},
            {title: 'Delete', onclick: () => this._delPassword(item.id, item.name, item.important), key: 1},
        ]
        if (item.url) {
            dropList.push({title: 'Goto Url', onclick: () => this._gotoUrl(item.url), key: 2})
        }
        if (item.email) {
            dropList.push({title: 'Goto Email', onclick: () => this._gotoEmail(item.email), key: 3})
        }
        fileType = (this.props.latest === item.id) ? `${fileType} info` : fileType
        const edit = this.state.edit ? <RePasswordInfo item={item} onclose={() => this.setState({edit: false})} gourl={this._gotoUrl} goemail={this._gotoEmail} /> : null
        return (
            <tr className={fileType}>
                <td className="text-center" style={{width: '56px'}}>
                    <input
                        type="checkbox"
                        checked={this.props.check}
                        ref={ref => this.props.getRef(ref)}
                        onChange={this.props.onchange} />
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}}>
                    <a href="#" className="item-point" onClick={e => killEvent(e, () => this._getPassword(item.id, item.important))}>{item.name}</a>
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.utime}</td>
                <td style={{width: '15%', minWidth: '68px'}}>
                    <a href="#" className="item-point" onClick={e => killEvent(e, () => this._getUsername(item.username))}>{item.username}</a>
                </td>
                <td style={{width: '50px'}}>
                    {edit}
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
}

export default ItemPassword
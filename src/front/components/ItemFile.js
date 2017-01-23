import React from 'react'
import Dropdown from './Dropdown'
import { api, isValidString, killEvent, bookmarkItemList } from '../utility'
import { STORAGE } from '../constants'

const ItemFile = React.createClass({
    _download: function(id, name) {
        this.props.sendglbcf(() => {
            this.props.setLatest(id, this.props.bookmark)
            window.location.href = `${this.props.mainUrl}/download/${id}`
        }, `Would you sure to download ${name}?`)
    },
    _save2drive: function(id, name) {
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/download2drive/${id}`).then(result => {
            this.props.setLatest(id, this.props.bookmark)
            this.props.addalert('start saving to drive')
        }).catch(err => this.props.addalert(err)) , `Would you sure to download ${name} to drive?`)
    },
    _edit: function(id, name) {
        this.props.globalinput(1, new_name => isValidString(new_name, 'name') ? api(`${this.props.mainUrl}/api/editFile/${id}`, {name: new_name}, 'PUT').then(result => {
            if (result.name) {
                this.props.pushfeedback(result)
            }
        }) : this.props.addalert('name not vaild!!!'), 'info', 'New Name...', name)
    },
    _delete: function(id, name, recycle) {
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/delFile/${id}/${recycle}`, null, 'DELETE').catch(err => this.props.addalert(err)), `Would you sure to delete ${name}?`)
    },
    _recover: function(id, name) {
        this.props.sendglbcf(() => api(`/api/recoverFile/${id}`, null, 'PUT').catch(err => this.props.addalert(err)), `Would you sure to recover ${name}?`)
    },
    _subscript: function(id, name, isMusic=false) {
        this.props.sendglbcf(() => {
            isValidString(name, 'name') ? api(`/api/bookmark/${STORAGE}/subscipt`, {
                name: name,
                path: ['ych_' + id, 'no local', 'youtube playlist', isMusic ? 'youtube music' : 'youtube video'],
                exactly: [false, false]
            }).then(result => {
                if (result.id) {
                    this.props.pushbookmark({id: result.id, name: result.name})
                }
                if (result.bid) {
                    result.id = result.bid
                    result.name = result.bname
                    if (result.name) {
                        this.props.pushfeedback(result)
                    }
                }
            }).catch(err => this.props.addalert(err)) : this.props.addalert('Bookmark name is not valid!!!')
        }, `Would you sure to subscript ${name}?`)
    },
    _save2local: function(id, name, isMusic=false) {
        this.props.sendglbcf(() => {
            let extId = id.substr(4)
            let url = ''
            switch (id.substr(0, 4)) {
                case 'you_':
                url = `https://www.youtube.com/watch?v=${extId}`
                break
                case 'ypl_':
                url = `https://www.youtube.com/watch?list=${extId}`
                break
                case 'kub_':
                url = `http://www.123kubo.com/vod-read-id-${extId}.html`
                break
                case 'yif_':
                url = `https://yts.ag/movie/${extId}`
                break
                case 'mad_':
                url = `http://www.cartoonmad.com/comic/${extId}.html`
                break
                case 'c99_':
                url = `http://www.99comic.com/comic/${extId}/`
                break
                case 'bbl_':
                url = extId.match(/^av/) ? `http://www.bilibili.com/video/${extId}/` : `http://bangumi.bilibili.com/anime/${extId}/`
                break
                default:
                this.props.addalert('not external video')
                return false
            }
            url = isMusic ? `${url}:music` : url
            isValidString(url, 'url') ? api('/api/getPath').then(ret => api(`${this.props.mainUrl}/api/upload/url`, Object.assign({
                type: 0,
                url: url,
            }, ret))).then(result => {
                if (result.name) {
                    this.props.pushfeedback(result)
                }
            }).catch(err => this.props.addalert(err)) : this.props.addalert('invalid url!!!')
        }, `確定要儲存 ${name} 到網站?`)
    },
    _handleMedia: function(id, name, isDel=false) {
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/handleMedia/${id}/${isDel ? 'del' : 'act'}`).catch(err => this.props.addalert(err)), `Would you sure to clear ${name}?`)
    },
    _downloadAll: function(id, name) {
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/torrent/all/download/${id}`).then(result => result.complete ? this.props.addalert('download complete!!!') : this.props.addalert('starting download')).catch(err => this.props.addalert(err)), `Would you sure to save all of ${name}?`)
    },
    _convert: function(id, name) {
        this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/torrent/convert/${id}`).then(result => {
            if (result.name) {
                this.props.pushfeedback(result)
            }
        }).catch(err => this.props.addalert(err)), `Would you sure to convert ${name} to image book?`)
    },
    _join: function() {
        this.props.sendglbcf(() => {
            (this.props.select.size > 1) ? api(`${this.props.mainUrl}/api/joinFile`, {uids: [...this.props.select]}, 'PUT').then(result => this.props.addalert('joining completed')).catch(err => this.props.addalert(err)) : this.props.addalert('Please selects multiple items!!!')
        }, 'Would you sure to join the split zips?')
    },
    _searchSub: function(id) {
        this.props.globalinput(2, (subName, exact, subEpisode) => {
            if (subName) {
                return isValidString(subName, 'name') ? api(`${this.props.mainUrl}/api/subtitle/search/${id}`, (subEpisode && isValidString(subEpisode, 'name')) ? {name: subName, episode: subEpisode} : {name: subName}).then(result => this.props.addalert('subtitle get')) : Promise.reject('search name is not vaild!!!')
            } else {
                return api(`${this.props.mainUrl}/api/external/getSubtitle/${id}`).then(result => this.props.addalert('subtitle get'))
            }
        }, 'warning', 'Search Name or IMDBID: tt1638355', null, 'Episode: S01E01')
    },
    _uploadSub: function(id) {
        this.props.globalinput(2, () => Promise.resolve(this.props.addalert('subtitle upload success')), 'warning', `${this.props.mainUrl}/upload/subtitle/${id}`)
    },
    _showUrl: function(id, url) {
        window.open(decodeURIComponent(url))
        api(`/api/media/setTime/${id}/url`).then(result => this.props.setLatest(id, this.props.bookmark)).catch(err => this.props.addalert(err))
    },
    _bookmark: function(id) {
        bookmarkItemList(STORAGE, 'set', this.props.sortName, this.props.sortType, this.props.set, id).catch(err => this.props.addalert(err))
    },
    render: function() {
        const item = this.props.item
        let dropList = []
        if (!item.thumb && item.status !== 7 && item.status !== 8) {
            dropList.push({title: 'download', onclick: () => this._download(item.id, item.name), key: 0})
            dropList.push({title: 'download to drive', onclick: () => this._save2drive(item.id, item.name), key: 1})
        }
        if (item.isOwn) {
            if (!item.thumb) {
                dropList.push({title: 'edit', onclick: () => this._edit(item.id, item.name), key: 2})
            }
            dropList.push({title: 'delete', onclick: () => this._delete(item.id, item.name, item.recycle), key: 3})
        }
        if (item.recycle === 1 || item.recycle === 2 || item.recycle === 3 || item.recycle === 4) {
            dropList.push({title: 'recover', onclick: () => this._recover(item.id, item.name), key: 4})
        }
        if (item.status === 3) {
            if (!item.thumb) {
                dropList.push({title: 'search subtitle', onclick: () => this._searchSub(item.id), key: 5})
                dropList.push({title: 'upload subtitle', onclick: () => this._uploadSub(item.id), key: 6})
            }
            if (item.cid) {
                dropList.push({title: `訂閱${item.ctitle}`, onclick: () => this._subscript(item.cid, item.ctitle), key: 7})
            }
            if (item.noDb) {
                dropList.push({title: '儲存到local', onclick: () => this._save2local(item.id, item.name), key: 8})
            }
        }
        if (item.status === 4) {
            if (item.cid) {
                dropList.push({title: `訂閱${item.ctitle}`, onclick: () => this._subscript(item.cid, item.ctitle, true), key: 9})
            }
            if (item.noDb) {
                dropList.push({title: '儲存到local', onclick: () => this._save2local(item.id, item.name, true), key: 10})
            }
        }
        if (item.media) {
            dropList.push({title: 'clear media', onclick: () => this._handleMedia(item.id, item.name, true), key: 11})
        }
        if (item.status === 0 || item.status === 1 || item.status === 9) {
            dropList.push({title: 'join zips', onclick: this._join, key: 12})
        }
        if (item.status === 9) {
            dropList.push({title: 'save playlist', onclick: () => this._downloadAll(item.id, item.name), key: 13})
            dropList.push({title: 'convert zip', onclick: () => this._convert(item.id, item.name), key: 14})
        }
        let content = (
            <a href="#" className="item-point">
                <i className="glyphicon glyphicon-question-sign" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>{item.name}
            </a>
        )
        let click = () => this._download(item.id, item.name)
        if (item.media) {
            let error = item.media.timeout ? 'timeout' : ''
            if (item.media.err) {
                Object.keys(item.media.err).forEach(i => error = `${error} ${i}: ${item.media.err[i]}`)
            }
            content = (
                <span>
                    {item.name}<br />
                    type: {item.media.type}<br />
                    key: {item.media.key}<br />
                    err: {error}
                </span>
            )
        } else {
            switch(item.status) {
                case 2:
                content = (
                    <a href="#" className="item-point">
                        <span style={{position: 'relative'}}>
                            <i className="glyphicon glyphicon-picture" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>
                            <img src={item.thumb ? item.thumb : `${this.props.mainUrl}/preview/${item.id}`} alt={item.name} style={{position: 'absolute', height: '42px', width: '42px', left: '0px'}} />
                        </span>
                        {item.name}
                    </a>
                )
                click = () => this.props.setMedia(2, item.id, {
                    save2local: this._save2local,
                })
                break
                case 3:
                content = (
                    <a href="#" className="item-point">
                        <span style={{position: 'relative'}}>
                            <i className="glyphicon glyphicon-facetime-video" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>
                            <img src={item.thumb ? item.thumb : `${this.props.mainUrl}/preview/${item.id}`} alt={item.name} style={{position: 'absolute', height: '42px', width: '42px', left: '0px'}} />
                        </span>
                        {item.name}
                    </a>
                )
                click = () => this.props.setMedia(3, item.id, {
                    save2local: this._save2local,
                    subscript: this._subscript,
                    searchSub: this._searchSub,
                    uploadSub: this._uploadSub,
                })
                break
                case 4:
                content = (
                    <a href="#" className="item-point">
                        <i className="glyphicon glyphicon-headphones" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>{item.name}
                    </a>
                )
                click = () => this.props.setMedia(4, item.id, {
                    save2local: this._save2local,
                    subscript: this._subscript,
                })
                break
                case 7:
                content = (
                    <a href="#" className="item-point">
                        <i className="glyphicon glyphicon-bookmark" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>{item.name}
                    </a>
                )
                click = () => this._showUrl(item.id, item.url)
                break
                case 8:
                content = (
                    <a href="#" className="item-point">
                        <i className="glyphicon glyphicon-tags" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>{item.name}
                    </a>
                )
                click = () => this._bookmark(item.id)
                break
                case 9:
                content = (
                    <a href="#" className="item-point">
                        <i className="glyphicon glyphicon-th-list" style={{height: '42px', width: '42px', fontSize: '35px'}}></i>{item.name}
                    </a>
                )
                click = () => api(`/api/torrent/query/preview/${item.id}`).then(result => this.props.setMedia(result.list, item.id, {
                    save2local: this._save2local,
                    searchSub: this._searchSub,
                    uploadSub: this._uploadSub,
                }, result.time ? result.time : 0)).catch(err => this.props.addalert(err))
                break
            }
        }
        let fileType = item.thumb ? 'external' : ''
        if (item.noDb) {
            fileType = 'outside'
        } else {
            switch(item.recycle) {
                case 1:
                case 2:
                case 3:
                fileType = 'recycling'
                break
                case 4:
                fileType = 'recycled'
                break
            }
        }
        fileType = (this.props.latest === item.id) ? `${fileType} info` : fileType
        return (
            <tr className={fileType}>
                <td className="text-center" style={{width: '56px'}}>
                    <input
                        type="checkbox"
                        checked={this.props.check}
                        ref={ref => this.props.getRef(ref)}
                        onChange={this.props.onchange} />
                </td>
                <td style={{whiteSpace: 'normal', wordBreak: 'break-all', wordWrap: 'break-word'}} onClick={e => killEvent(e, click)}>
                    {content}
                </td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.utime}</td>
                <td style={{width: '15%', minWidth: '68px'}}>{item.count}</td>
                <td style={{width: '50px'}}>
                    <Dropdown headelement="span" style={{left: 'auto', right: '0px', top: '0px'}} droplist={dropList}>
                        <button type="button" className="btn btn-default">
                            <span className="caret"></span>
                        </button>
                    </Dropdown>
                </td>
            </tr>
        )
    }
})

export default ItemFile
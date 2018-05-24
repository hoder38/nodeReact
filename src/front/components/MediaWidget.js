import React from 'react'
import Tooltip from './Tooltip'
import pdfjs from 'pdfjs-dist'
import UserInput from './UserInput'
import { killEvent, api, randomFloor, arrayObjectIndexOf, isValidString } from '../utility'

const MediaWidget = React.createClass({
    getInitialState: function() {
        this._audio = null
        this._video = null
        this._media = null
        this._playlist = null
        this._item = {}
        this._title = ''
        this._fix = 0
        this._fixtime = 0
        this._start = false
        this._input = new UserInput.Input(['subIndex'], this._movePlaylist, this._handleChange, '', {width: '45px'})
        this._startTime = 0
        this._preTime = 0
        this._total = 1
        this.props.setsub(this._refreshCue)
        this._type = null
        this._preType = null
        switch (this.props.mediaType) {
            case 2:
            this._type = 'image'
            this._preType = 'image'
            break
            case 3:
            this._type = 'video'
            this._preType = 'video'
            break
            case 4:
            this._type = 'music'
            this._preType = 'video'
            break
            case 9:
            break
            default:
            this.props.addalert('unknown type')
        }
        return Object.assign({
            option: false,
            mode: 0,
            index: -1,
            src: '',
            opt: 0,
            loading: false,
            extend: false,
            subCh: '',
            subEn: '',
            cue: '',
        }, this._input.getValue())
    },
    componentDidMount: function() {
        let is_firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        this._targetArr = Array.from(document.querySelectorAll('[data-widget]')).filter(node => node.getAttribute('data-widget') === this.props.toggle)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('click', this._toggle)
            })
        }
        window.addEventListener("beforeunload", this._leaveRecord)
        if (this.props.mediaType === 3 || this.props.mediaType === 9) {
            if (this._video) {
                if (this.props.mediaType === 3) {
                    this._media = this._video
                }
                this._video.oncanplay = () => {
                    if (!this._start) {
                        this._start = true
                        if (this.props.show) {
                            this._video.play()
                        }
                    }
                }
                this._video.onended = () => this._nextMedia(false)
                this._video.onpause = () => this._recordMedia(true)
                this._video.onplay = () => {
                    api(`${this.props.mainUrl}/api/testLogin`).catch(err => this.props.addalert(err))
                    this._video.focus()
                }
                this._video.onloadedmetadata = () => {
                    if (this._startTime && this._video.duration) {
                        this._video.currentTime = this._startTime
                        this._preTime = this._startTime
                        this._startTime = 0
                    }
                }
                let timer = 0
                this._video.onplaying = () => {
                    clearInterval(timer)
                    timer = setInterval(() => {
                        if (!this._video) {
                            clearInterval(timer)
                        } else if (!this._video.paused && !this._video.seeking) {
                            this._preTime = this._video.currentTime
                        }
                    }, 1000)
                }
                if (!is_firefox) {
                    this._video.onclick = e => {
                        if (this._video.paused) {
                            this._video.play()
                        } else {
                            this._video.pause()
                        }
                    }
                }
                this._video.onkeydown = e => {
                    switch(e.keyCode) {
                        case 67:
                        if (this._video && this._video.src && window.location.href !== this._video.src) {
                            if (this._video.textTracks[0] && this._video.textTracks[1]) {
                                if (this._video.textTracks[0].mode === 'showing') {
                                    this._video.textTracks[0].mode = 'disabled'
                                    this._video.textTracks[1].mode = 'showing'
                                } else if (this._video.textTracks[1].mode === 'showing') {
                                    this._video.textTracks[1].mode = 'disabled'
                                } else {
                                    this._video.textTracks[0].mode = 'showing'
                                }
                            }
                        }
                        break
                        case 188:
                        this._backward();
                        break;
                        case 190:
                        this._forward();
                        break;
                    }
                }
            }
        }
        if (this.props.mediaType === 4 || this.props.mediaType === 9) {
            if (this._audio) {
                if (this.props.mediaType === 4) {
                    this._media = this._audio
                }
                this._audio.oncanplay = () => {
                    if (!this._start) {
                        this._start = true
                        this._audio.play()
                    }
                }
                this._audio.onended = () => this._nextMedia(false)
                this._audio.onpause = () => this._recordMedia(true)
                this._audio.onplay = () => {
                    api(`${this.props.mainUrl}/api/testLogin`).catch(err => this.props.addalert(err))
                    this._audio.focus()
                }
                this._audio.onloadedmetadata = () => {
                    if (this._startTime && this._audio.duration) {
                        this._audio.currentTime = this._startTime
                        this._preTime = this._startTime
                        this._startTime = 0
                    }
                }
                let timer = 0
                this._audio.onplaying = () => {
                    clearInterval(timer)
                    timer = setInterval(() => {
                        if (!this._audio) {
                            clearInterval(timer)
                        } else if (this._audio && !this._audio.paused && !this._audio.seeking) {
                            this._preTime = this._audio.currentTime
                        }
                    }, 1000)
                }
                this._audio.onkeydown = e => {
                    switch(e.keyCode) {
                        case 188:
                        this._backward();
                        break;
                        case 190:
                        this._forward();
                        break;
                    }
                }
            }
        }
    },
    componentWillReceiveProps: function(nextProps) {
        if (nextProps.count !== this.props.count) {
            if (nextProps.mediaType === 9) {
                let index = 0
                let subIndex = 0;
                if (nextProps.index) {
                    let setTime = nextProps.index.toString().match(/^(\d+)(&(\d+))?$/)
                    this._startTime = setTime && setTime[1] ? Number(setTime[1]) : 0
                    subIndex = setTime && setTime[1] ? Number(setTime[1]) : 0
                    index = setTime && setTime[3] ? Number(setTime[3]) : 0
                }
                this._playlistItem(index, nextProps.list, subIndex);
            } else {
                api(`/api/storage/media/saveParent/${nextProps.sortName}/${nextProps.sortType}`, {name: this._type}, 'POST').then(result => this._loadMedia(nextProps.index - 1, nextProps.list)).then(result => this.props.toggleShow(true)).catch(err => this.props.addalert(err))
            }
        }
        if (nextProps.show === false && this.props.show === true) {
            if (this._video) {
                this._video.pause()
            }
        }
    },
    componentDidUpdate : function(prevProps, prevState) {
        if (this._item.doc === 3 && (this.state.src !== prevState.src || this.props.full !== prevProps.full)) {
            PDFJS.workerSrc = '//npmcdn.com/pdfjs-dist@1.7.225/build/pdf.worker.js';
            const pid = (this.props.mediaType === 2) ? 'pdf1' : 'pdf2';
            const full = this.props.full;
            console.log(this.state.src);
            PDFJS.getDocument({
                url: this.state.src,
                withCredentials: true,
            }).then(pdf => pdf.getPage(1).then(function(page) {
                const viewport = page.getViewport(full ? 2 : 1);
                let canvas = document.getElementById(pid);
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport,
                });
            }));
        }
    },
    componentWillUnmount: function() {
        window.removeEventListener("beforeunload", this._leaveRecord)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('click', this._toggle)
            })
        }
    },
    _playlistItem: function(index, list, subIndex=0) {
        this._item = list[index]
        this._total = this._item.present ? this._item.present : 1;
        this._media = this._item.type === 3 ? this._video : this._item.type === 4 ? this._audio : null
        this._fix = 0
        this._start = false
        this._removeCue()
        this.setState(Object.assign({}, this.state, {
            index: index,
            subIndex: subIndex ? subIndex : 1,
            src: `${this.props.mainUrl}/torrent/${index}/${this._item.id}/${(subIndex > 1) ? subIndex : 0}`,
            subCh: `${this.props.mainUrl}/subtitle/${this._item.id}/ch/${index}`,
            subEn: `${this.props.mainUrl}/subtitle/${this._item.id}/en/${index}`,
            cue: '',
        }), () => {
            this.props.toggleShow(true)
            this._recordMedia
        })
    },
    _leaveRecord: function() {
        if (this._media) {
            if (this._item.id && this._media.duration) {
                let xmlhttp = new XMLHttpRequest()
                const index = this.props.mediaType === 9 ? `&${this.state.index}` : ''
                xmlhttp.open("GET", `/api/storage/media/record/${this._playlist ? this._playlist.obj.id : this._item.id}/${parseInt(this._media.currentTime)}${index}`, false)
                xmlhttp.setRequestHeader("Content-type", "application/json")
                xmlhttp.send('')
            }
        }
    },
    _recordMedia: function(pause=false, image=false) {
        if (image) {
            api(`/api/storage/media/record/${this._item.id}/${this.state.subIndex}`).catch(err => this.props.addalert(err))
        } else {
            if ((!this._media && this.props.mediaType !== 9) || (this._playlist && !this._playlist.obj.id)) {
                return true
            }
            const time = (this._media && this._media.currentTime < this._media.duration - 3) ? parseInt(this._media.currentTime) : 0
            const index = this.props.mediaType === 9 ? `&${this.state.index}` : ''
            api(`/api/storage/media/record/${this._playlist ? this._playlist.obj.id : this._item.id}/${time}${index}${(!pause && this._playlist && this._playlist.total === this._playlist.obj.index) ? `/${this._item.id}` : ''}`).catch(err => this.props.addalert(err))
        }
    },
    _loadMedia: function(index, list, subIndex=0, direction=0) {
        if (this._item.id) {
            this._recordMedia()
        }
        this._item = list[index]
        let append = this._item.url ? '/external' : ''
        this.setState(Object.assign({}, this.state, {
            loading: true,
        }))
        if (subIndex) {
            if (this._playlist.obj_arr) {
                if (subIndex >= this._playlist.obj_arr[0].index && subIndex <= this._playlist.obj_arr[this._playlist.obj_arr.length - 1].index) {
                    let realIndex = arrayObjectIndexOf(this._playlist.obj_arr, subIndex, 'index')
                    if (direction < 0) {
                        while (subIndex > this._playlist.obj_arr[0].index && realIndex === -1) {
                            subIndex--
                            realIndex = arrayObjectIndexOf(this._playlist.obj_arr, subIndex, 'index')
                        }
                    } else {
                        while (subIndex < this._playlist.obj_arr[this._playlist.obj_arr.length - 1].index && realIndex === -1) {
                            subIndex++
                            realIndex = arrayObjectIndexOf(this._playlist.obj_arr, subIndex, 'index')
                        }
                    }
                    this._playlist.obj = this._playlist.obj_arr[realIndex]
                    append = (this._playlist.pageToken) ? `/${this._playlist.obj.id}/${this._playlist.pageToken}` : `/${this._playlist.obj.id}`
                } else {
                    append = `/${this._playlist.obj.id}`
                    if (subIndex < this._playlist.obj_arr[0].index) {
                        if (subIndex !== 1 && this._playlist.pageP) {
                            append = `${append}/${this._playlist.pageP}/back`
                        }
                    } else {
                        if (this._playlist.pageN) {
                            append = `${append}/${this._playlist.pageN}`
                        }
                    }
                }
            } else {
                append = `/${subIndex}`
            }
        }
        return api(`/api/storage/media/setTime/${this._item.id}/${this._type}${append}`).then(result => {
            this.props.setLatest(this._item.id, this.props.bookmark)
            if (result.time) {
                let setTime = result.time.toString().match(/^(\d+)(&(\d+))?$/)
                if (setTime) {
                    if (this._media) {
                        this._startTime = setTime[1]
                    } else {
                        subIndex = setTime[1]++
                    }
                }
            }
            if (result.playlist) {
                this._playlist = result.playlist
                subIndex = result.playlist.obj.index
            } else {
                this._playlist = null
            }
            this._total = this._playlist ? this._playlist.total : this._item.present ? this._item.present : 1
            this._title = this._item.thumb && this._playlist && (this._playlist.obj.is_magnet || this._playlist.obj.pre_url) ? `- ${this._playlist.obj.title}` :''
            let mediaId = (this._playlist && this._playlist.obj.id) ? this._playlist.obj.id : this._item.id
            if (!this._item.thumb || (this._playlist && this._playlist.obj.is_magnet && this._playlist.obj.id)) {
                this._start = false
                this._fix = 0
            }
            this._removeCue()
            const same = (index === this.state.index) ? true : false;
            this.setState(Object.assign({}, this.state, {
                src: this._playlist && this._playlist.obj.is_magnet && this._playlist.obj.id ? `${this.props.mainUrl}/torrent/v/${mediaId}/0` : this._playlist && this._playlist.obj.pre_url ? `${this._playlist.obj.pre_url}${this._playlist.obj.pre_obj[Math.round(this._playlist.obj.index * 1000) % 1000 - 1]}` : this._item.thumb ? this._item.thumb : `${this.props.mainUrl}/${this._preType}/${mediaId}/file`,
                index: index,
                subIndex: subIndex ? subIndex : 1,
                loading: false,
                subCh: `${this.props.mainUrl}/subtitle/${mediaId}/ch/v`,
                subEn: `${this.props.mainUrl}/subtitle/${mediaId}/en/v`,
                cue: '',
            }), () => {
                switch (!this._item.thumb || (this._playlist && this._playlist.obj.pre_url) ? 0 : this._playlist && this._playlist.obj.is_magnet ? this._playlist.obj.id ? 0 : 1 : 2) {
                    case 1:
                    isValidString(this._playlist.obj.magnet, 'url') ? api('/api/getPath').then(result => api(`${this.props.mainUrl}/api/external/upload/url`, {
                        url: this._playlist.obj.magnet,
                        hide: true,
                        path: result.path,
                        type: 0,
                    })).then(result => {
                        if (mediaId === this._item.id || (this._playlist && mediaId === this._playlist.obj.id)) {
                            this._start = false
                            this._fix = 0
                            mediaId = this._playlist.obj.id = result.id
                            this._removeCue()
                            this.setState(Object.assign({}, this.state, {
                                src: `${this.props.mainUrl}/torrent/v/${mediaId}/0`,
                                subCh: `${this.props.mainUrl}/subtitle/${mediaId}/ch/v`,
                                subEn: `${this.props.mainUrl}/subtitle/${mediaId}/en/v`,
                                cue: '',
                            }))
                        }
                    }).catch(err => this.props.addalert(err)) : Promise.reject('magnet not valid')
                    break
                    case 2:
                    api(`${this.props.mainUrl}/api/external/getSingle/${mediaId}`).then(result => {
                        if (mediaId === this._item.id || (this._playlist && mediaId === this._playlist.obj.id)) {
                            this._start = false
                            this._fix = 0
                            this._title = this._playlist ? this._playlist.obj.title ? ` - ${this._playlist.obj.title}` : ` - ${result.title}` : ''
                            if (result.sub) {
                                this._playlist.obj.sub = result.sub
                            }
                            this.setState(Object.assign({}, this.state, {
                                src: (result.audio && this._item.status === 4) ? result.audio : (result.iframe && result.iframe[0]) ? `iframe: ${result.iframe[0]}` : (result.embed && result.embed[0]) ? `embed: ${result.embed[0]}` : (result.url && result.url[0]) ? `url: ${result.url[0]}` : result.video[0],
                            }))
                        }
                    }).catch(err => {
                        this.props.addalert(err)
                        if ((mediaId === this._item.id || (this._playlist && mediaId === this._playlist.obj.id)) && this._item.status === 4) {
                            this._nextMedia()
                        }
                    })
                    break
                    default:
                    if (same && this._media) {
                        this._media.currentTime = this._preTime = 0;
                    }
                }
            })
        }).catch(err => {
            this._playlist = null
            this._title = ''
            this.setState(Object.assign({}, this.state, {
                src: '',
                index: index,
                subIndex: subIndex,
                loading: false,
                subCh: '',
                subEn: '',
            }))
            return Promise.reject(err)
        })
    },
    _moveMedia: function(number) {
        if (this.state.loading) {
            return true
        }
        if (this.props.mediaType === 9) {
            if (this.props.list.length > 1) {
                let index = (this.state.index + number < 0) ? this.props.list.length - 1 : (this.state.index + number > this.props.list.length - 1) ? 0 : this.state.index + number
                this._playlistItem(index, this.props.list)
            }
        } else {
            Promise.resolve().then(() => {
                let index = this.state.index + number
                let parentList = null
                if (this.props.more) {
                    if (index < 0 || index > this.props.list.length - 1) {
                        this.setState(Object.assign({}, this.state, {
                            loading: true,
                        }))
                        return api(`/api/storage/media/more/${this.props.mediaType}/${this.props.page}`).then(result => {
                            this.props.set(result.itemList, this.props.mediaType)
                            parentList = result.parentList
                            return api(`/api/storage/external/get/${this.props.sortName}/${this.props.pageToken}`)
                        }).then(result => {
                            this.props.set(result.itemList, this.props.mediaType, parentList, result.pageToken)
                            return (index < 0) ? this.props.list.length - 1 : (index > this.props.list.length - 1) ? 0 : index
                        })
                    } else {
                        return index
                    }
                } else {
                    return (index < 0) ? this.props.list.length - 1 : (index > this.props.list.length - 1) ? 0 : index
                }
            }).then(result => this._loadMedia(result, this.props.list)).catch(err => this.props.addalert(err))
        }
    },
    _movePlaylist: function(direction) {
        if (this.state.loading) {
            return true
        }
        if (this._playlist) {
            let newIndex = 0
            if (!direction) {
                newIndex = parseFloat(this.state.subIndex)
                if (this._playlist.obj.sub) {
                    newIndex = Math.round(newIndex * 1000)
                    if (newIndex % 1000 === 0) {
                        newIndex++
                    }
                    newIndex = (newIndex % 1000 === 0) ? Math.floor(newIndex / 1000) - 1 : (newIndex % 1000 > this._playlist.obj.sub) ? Math.floor(newIndex / 1000) + 1 : newIndex / 1000
                }
            } else {
                if (this._playlist.obj.sub) {
                    newIndex = Math.round(this._playlist.obj.index * 1000)
                    if (newIndex % 1000 === 0) {
                        newIndex++
                    }
                    newIndex = newIndex + direction
                    newIndex = (newIndex % 1000 === 0) ? Math.floor(newIndex / 1000) - 1 : (newIndex % 1000 > this._playlist.obj.sub) ? Math.floor(newIndex / 1000) + 1 : newIndex / 1000
                } else {
                    newIndex = Math.floor(this._playlist.obj.index)
                    newIndex = newIndex + direction
                }
            }
            newIndex = (newIndex < 1) ? 1 : (newIndex > this._playlist.total + 1) ? this._playlist.total : newIndex
            if (this.props.mediaType === 2 && Math.floor(newIndex) === Math.floor(this._playlist.obj.index)) {
                this._playlist.obj.index = newIndex
                this.setState(Object.assign({}, this.state, {
                    src: `${this._playlist.obj.pre_url}${this._playlist.obj.pre_obj[Math.round(this._playlist.obj.index * 1000) % 1000 - 1]}`,
                    subIndex: this._playlist.obj.index,
                }), () => this._recordMedia(false, true))
            } else {
                this._loadMedia(this.state.index, this.props.list, newIndex, direction).catch(err => this.props.addalert(err))
            }
        } else if (this.props.mediaType === 2 || this.props.mediaType === 9) {
            let newIndex = direction ? Math.floor(this.state.subIndex) + direction : Math.floor(this.state.subIndex)
            newIndex = newIndex < 1 ? 1 : newIndex > this._total ? this._total : newIndex
            if (this.props.mediaType === 2) {
                this.setState(Object.assign({}, this.state, {
                    src: `${this.props.mainUrl}/image/${this._item.id}/${newIndex}`,
                    subIndex: newIndex,
                }))
            } else {
                this._playlistItem(this.state.index, this.props.list, newIndex);
            }
        }
    },
    _nextMedia: function(previous=false) {
        if (this._media) {
            if (this._preTime < this._media.duration - 3) {
                this._media.currentTime = this._preTime
                this._media.pause()
                return true
            }
        }
        if (this._playlist) {
            if (previous) {
                if (this._playlist.obj.sub) {
                    if (this._playlist.obj.index > 0.001) {
                        this._movePlaylist(-1)
                        return true
                    }
                } else {
                    if (this._playlist.obj.index > 0) {
                        this._movePlaylist(-1)
                        return true
                    }
                }
            } else {
                if (this._playlist.obj.sub) {
                    if (this._playlist.obj.index < this._playlist.total || (this._playlist.obj.index < this._playlist.total + 1 && Math.round(this._playlist.obj.index * 1000) % 1000 < this._playlist.obj.sub)) {
                        this._movePlaylist(1)
                        return true
                    }
                } else {
                    if (this._playlist.obj.index < this._playlist.total) {
                        this._movePlaylist(1)
                        return true
                    }
                }
            }
            if (!this._playlist.end) {
                if (this.state.mode === 2) {
                    this.setState(Object.assign({}, this.state, {subIndex: 1}), () => this._movePlaylist());
                } else {
                    return true
                }
            }
        } else if (this.props.mediaType === 2 || this.props.mediaType === 9) {
            if (previous) {
                if (this.state.subIndex > 0) {
                    this._movePlaylist(-1)
                    return true
                }
            } else {
                if (this.state.subIndex < this._total) {
                    this._movePlaylist(1)
                    return true
                }
            }
        }
        let number = previous ? -1 : 1
        switch (this.state.mode) {
            case 1:
            number = previous ? 1 : -1
            break
            case 2:
            number = 0
            break
            case 3:
            if (this.props.more) {
                do {
                    number = randomFloor(0, this.props.list.length + 19);
                } while(number === this.state.index);
            } else {
                do {
                    number = randomFloor(0, this.props.list.length - 1);
                } while(number === this.state.index)
            }
            number = number - this.state.index
            break
        }
        this._moveMedia(number)
    },
    _toggle: function(e) {
        killEvent(e, this.props.toggleShow)
    },
    _changeMode: function() {
        this.setState(Object.assign({}, this.state, {mode: this.state.mode > 3 ? 0 : (this.state.mode + 1)}))
    },
    _handleChange: function() {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    },
    _handleOpt: function(e) {
        switch (e.target.value) {
            case '1':
            if (this.props.mediaType === 9) {
                this.props.sendglbcf(() => api('/api/getPath').then(result => api(`${this.props.mainUrl}/api/torrent/copy/${this._item.id}/${this.state.index}`, {path: result.path})).then(result => this.props.pushfeedback(result)).catch(err => this.props.addalert(err)), `確定要儲存 ${this._item.name} 到網站?`)
            } else {
                this._playlist && !this._playlist.obj.pre_url ? this.props.opt.save2local(this._playlist.obj.id, this._title ? this._title : '物件', this.props.mediaType === 4 ? true : false) : this.props.opt.save2local(this._item.id, this._item.name, this.props.mediaType === 4 ? true : false)
            }
            break
            case '2':
            this.props.opt.subscript(this._item.id, this._item.cid, this._item.ctitle, this.props.mediaType === 4 ? true : false)
            break
            case '3':
            const id = this._playlist ? this._playlist.obj.id : this.props.mediaType === 9 ? `${this._item.id}/${this.state.index}` : this._item.id
            this.props.opt.searchSub(id)
            this.props.toggleShow(false)
            break
            case '4':
            const id2 = this._playlist ? this._playlist.obj.id : this.props.mediaType === 9 ? `${this._item.id}/${this.state.index}` : this._item.id
            this.props.opt.uploadSub(id2)
            this.props.toggleShow(false)
            break
            case '5':
            this._fixCue()
            break
            case '6':
            const id3 = this._playlist ? this._playlist.obj.id : this.props.mediaType === 9 ? `${this._item.id}/${this.state.index}` : this._item.id;
            this.props.opt.handleMedia(id3, this._item.name);
            break;
        }
    },
    _fixCue: function() {
        if (this._video && this._video.src && window.location.href !== this._video.src) {
            if (this._fix) {
                const index = this.props.mediaType === 9 ? `/${this.state.index}` : ''
                let adjust = Math.ceil((this._video.currentTime - this._fixtime) * 10) / 10
                const fix = this._fix;
                this._fix = 0;
                this.setState(Object.assign({}, this.state, {
                    cue: '',
                }), () => this.props.sendglbcf(() => api(`${this.props.mainUrl}/api/external/subtitle/fix/${this._playlist ? this._playlist.obj.id : this._item.id}/${fix === 1 ? 'ch' : 'en'}/${adjust}${index}`).then(result => this.props.addalert('字幕校準成功')).catch(err => this.props.addalert(err)), `確定校準此字幕到${adjust}秒？`))
            } else {
                if (this._video.textTracks[0] && this._video.textTracks[0].activeCues && this._video.textTracks[0].activeCues[0] && this._video.textTracks[0].activeCues[0].text) {
                    this._fix = 1
                } else if (this._video.textTracks[1] && this._video.textTracks[1].activeCues && this._video.textTracks[1].activeCues[0] && this._video.textTracks[1].activeCues[0].text) {
                    this._fix = 2
                }
                if (this._fix) {
                    this._video.pause()
                    this._fixtime = this._video.currentTime
                    this.setState(Object.assign({}, this.state, {
                        cue: this._fix === 1 ? this._video.textTracks[0].activeCues[0].text : this._video.textTracks[1].activeCues[0].text,
                    }))
                }
            }
        }
    },
    _removeCue: function() {
        if (this._video && this._video.src && window.location.href !== this._video.src) {
            let track = this._video.textTracks[0]
            if (track) {
                let cues = track.cues
                if (cues && cues.length > 0) {
                    for (let i = cues.length-1; i >= 0; i--) {
                        track.removeCue(cues[i])
                    }
                }
            }
            track = this._video.textTracks[1]
            if (track) {
                let cues = track.cues
                if (cues && cues.length > 0) {
                    for (let i = cues.length-1; i >= 0; i--) {
                        track.removeCue(cues[i])
                    }
                }
            }
        }
    },
    _refreshCue: function() {
        if (this._video && this._video.src && window.location.href !== this._video.src) {
            this._removeCue()
            let matchCh = this.state.subCh.match(/(.*)\/(0+)$/)
            let matchEn = this.state.subEn.match(/(.*)\/(0+)$/)
            this.setState(Object.assign({}, this.state, {
                subCh: matchCh ? `${matchCh[1]}/${matchCh[2]}0` : `${this.state.subCh}/0`,
                subEn: matchEn ? `${matchEn[1]}/${matchEn[2]}0` : `${this.state.subEn}/0`,
            }))
        }
    },
    _backward: function() {
        if (this._fix) {
            this._media.currentTime = this._media.currentTime >= 0.5 ? this._media.currentTime - 0.5 : 0
        } else {
            this._media.currentTime = this._media.currentTime >= 5 ? this._media.currentTime - 5 : 0
        }
    },
    _forward: function() {
        if (this._fix) {
            this._media.currentTime += 0.5
        } else {
            this._media.currentTime += 5
        }
    },
    _mediaCheck: function() {
        if (!this._item.id || this._item.complete || (this._playlist && this._playlist.obj.complete)) {
            return true
        }
        let id = this._playlist ? `${this._playlist.obj.id}/v` : `${this._item.id}/${this.state.index}`
        let obj = this._playlist ? this._playlist.obj : this._item
        api(`${this.props.mainUrl}/api/torrent/check/${id}/${obj.size ? parseInt(obj.size) : 0}`).then(result => {
            if (result.start) {
                this.props.addalert('File start buffering, Mp4 may preview')
            } else {
                obj.size = result.ret_size
                obj.complete = result.complete
                if (result.newBuffer) {
                    if (this._media) {
                        this._startTime = this._media.currentTime
                        this._start = false
                    }
                    let urlmatch = this.state.src.match(/(.*)\/(0+)$/)
                    this.setState(Object.assign({}, this.state, {
                        src: urlmatch ? `${urlmatch[1]}/${urlmatch[2]}0` : `${this.state.src}/0`,
                    }))
                }
            }
        })
    },
    _mediaDownload: function() {
        this.props.sendglbcf(() => window.location.href = this.state.src, `Would you sure to download ${this._item.name} ?`)
    },
    _handleExtend: function() {
        if (this.props.full) {
            this.setState(Object.assign({}, this.state, {extend: !this.state.extend}), () => {
                if (!this.state.extend) {
                    this.props.toggleFull()
                }
            })
        }
    },
    render: function() {
        const show = this.props.show ? (this.props.full && this._item.doc !== 2 && this._item.doc !== 3 && (this.props.mediaType === 2 || (this.props.mediaType === 9 && this._item.type === 2))) ? {visibility: 'hidden'} : {} : {display: 'none'}
        let option = null
        const ulClass = this.props.full ? 'pager pull-left' : 'pager pull-right'
        if (this.state.option) {
            let mode = 'All'
            switch (this.state.mode) {
                case 1:
                mode = (
                    <span>
                        <span className="glyphicon glyphicon-arrow-left"></span>
                        All
                    </span>
                )
                break
                case 2:
                mode = '1'
                break
                case 3:
                mode = <span className="glyphicon glyphicon-random"></span>
            }
            const local = this.props.mediaType === 9 || this._item.noDb ? <option value="1">儲存到local</option> : null
            const subscript = this._item.cid ? <option value="2">{`訂閱${this._item.ctitle}`}</option> : null
            const search = this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3) ? <option value="3">search subtitle</option> : null
            const upload = this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3) ? <option value="4">upload subtitle</option> : null
            const fix = this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3) ? <option value="5">fix subtitle</option> : null
            const handle = (this.props.level === 2 && (this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3))) ? <option value="6">handle media</option> : null
            const subOption = (this._item.noDb || this._item.cid || this.props.mediaType === 3 || this.props.mediaType === 9) ? (
                <li>
                    <select onChange={this._handleOpt} value="0">
                        <option value="0">option</option>
                        {local}
                        {subscript}
                        {search}
                        {upload}
                        {fix}
                        {handle}
                    </select>
                </li>
            ) : null
            const mediaOption = this._media ? (
                <li>
                    <a href="#" onClick={e => killEvent(e, this._backward)}>
                        <span className="glyphicon glyphicon-backward"></span>
                    </a>
                </li>
            ) : null
            const cue = this.state.cue ? <li>{this.state.cue}</li> : null
            option = (
                <span>
                    {cue}
                    {mediaOption}
                    <li>
                        <a href="#" onClick={e => killEvent(e, this._changeMode)}>
                            {mode}
                        </a>
                    </li>
                    {subOption}
                </span>
            )
        } else {
            const playlist = (this._total > 1) ? (
                <span>
                    <li>
                        <a href="#" className={this.state.loading ? 'disabled' : ''} onClick={e => killEvent(e, () => this._movePlaylist(-1))}>
                            <span className="glyphicon glyphicon-chevron-up"></span>
                        </a>
                    </li>
                    <UserInput
                        val={this.state.subIndex}
                        getinput={this._input.getInput('subIndex')} />/{this._total}
                    <li>
                        <a href="#" className={this.state.loading ? 'disabled' : ''} onClick={e => killEvent(e, () => this._movePlaylist(1))}>
                            <span className="glyphicon glyphicon-chevron-down"></span>
                        </a>
                    </li>
                </span>
            ) : null
            const complete = ((this.props.mediaType === 9 && !this._item.complete) || (this._playlist && this._playlist.obj.is_magnet && !this._playlist.obj.complete)) ? (
                <li >
                    <a href="#" onClick={e => killEvent(e, this._mediaCheck)}>
                        <span className="glyphicon glyphicon-refresh"></span>
                    </a>
                </li>
            ) : null
            const tDownload = (this.props.mediaType === 9 && this._item.type === 1 && this._item.complete) ? (
                <li>
                    <a href="#" onClick={e => killEvent(e, this._mediaDownload)}>
                        <span className="glyphicon glyphicon-download-alt"></span>
                    </a>
                </li>
            ) : null
            option = (
                <span>
                    {playlist}
                    <li>
                        <a href="#" className={this.state.loading ? 'disabled' : ''} onClick={e => killEvent(e, () => this._moveMedia(-1))}>
                            <span className="glyphicon glyphicon-chevron-left"></span>
                        </a>
                    </li>
                    {complete}
                    {tDownload}
                    <li>
                        <a href="#" onClick={e => killEvent(e, this.props.toggleFull)}>
                            <span className={`glyphicon ${this.props.full ? 'glyphicon-minus-sign' : 'glyphicon-plus-sign'}`}></span>
                        </a>
                    </li>
                    <li>
                        <a href="#" className={this.state.loading ? 'disabled' : ''} onClick={e => killEvent(e, () => this._moveMedia(1))}>
                            <span className="glyphicon glyphicon-chevron-right"></span>
                        </a>
                    </li>
                </span>
            )
        }
        let media = null
        if (this.props.mediaType === 2 || (this.props.mediaType === 9 && this._item.type === 2)) {
            if (this._item.doc === 2) {
                media = this.props.full ? <iframe src={this.state.src} style={{border: 0, visibility: 'visible', width: '98vw', height: '80vh'}}></iframe> : <iframe src={this.state.src} style={{border: 0, visibility: 'visible', width: '50vw', height: '60vh'}}></iframe>
            } else if (this._item.doc === 3) {
                media = this.props.full ? <div style={{visibility: 'visible', width: '98vw', height: '80vh', overflow: 'scroll'}}><canvas id={(this.props.mediaType === 2) ? 'pdf1' : 'pdf2'}></canvas></div> : <div style={{visibility: 'visible', width: '50vw', height: '60vh', overflow: 'scroll'}}><canvas id={(this.props.mediaType === 2) ? 'pdf1' : 'pdf2'}></canvas></div>
            } else {
                media = this.props.full ? this.state.extend? (
                    <div>
                        <a href="#" style={{position: 'fixed', width: '100px', height: '100px', color: 'rgba(0, 0, 0, 0.3)', top: '0px', left: '0px', fontSize: '600%', lineHeight: '100px', textDecoration: 'none', visibility: 'visible'}} className="text-center" onClick={e => killEvent(e, () => this._nextMedia(true))}>
                            {this.state.subIndex}
                        </a>
                        <a href="#" style={{position: 'absolute', width: '100px', height: '100px', color: 'rgba(0, 0, 0, 0.3)', top: '0px', right: '0px', fontSize: '600%', lineHeight: '100px', float: 'right', textDecoration: 'none', visibility: 'visible'}} className="text-center" onClick={e => killEvent(e, this._handleExtend)}>
                            <i className="glyphicon glyphicon-resize-small"></i>
                        </a>
                        <div id="extend" style={{top: '-90px', visibility: 'visible', position: 'relative', height: '89vh', width: '98vw', overflow: 'auto',cursor: 'pointer', zIndex: -1}}>
                            <img style={{visibility: 'visible', width: 'auto', height: 'auto', cursor: 'pointer', position: 'relative', top: '0px', zIndex: -1}} src={this.state.src} alt={this._item.name} onClick={e => killEvent(e, this._nextMedia)} onLoad={() => {
                                let extNode = document.getElementById('extend')
                                extNode.scrollTop = 0
                                if (extNode.scrollLeft < 100) {
                                    extNode.scrollLeft = extNode.scrollWidth
                                } else {
                                    extNode.scrollLeft = 0
                                }
                            }} />
                        </div>
                    </div>
                ) : (
                    <div>
                        <a href="#" style={{position: 'fixed', width: '100px', height: '100px', color: 'rgba(0, 0, 0, 0.3)', top: '0px', left: '0px', fontSize: '600%', lineHeight: '100px', textDecoration: 'none', visibility: 'visible'}} className="text-center" onClick={e => killEvent(e, () => this._nextMedia(true))}>
                            {this.state.subIndex}
                        </a>
                        <a href="#" style={{position: 'absolute', width: '100px', height: '100px', color: 'rgba(0, 0, 0, 0.3)', top: '0px', right: '0px', fontSize: '600%', lineHeight: '100px', float: 'right', textDecoration: 'none', visibility: 'visible'}} className="text-center" onClick={e => killEvent(e, this._handleExtend)}>
                            <i className="glyphicon glyphicon-resize-full"></i>
                        </a>
                        <img style={{visibility: 'visible', maxWidth: '100%', width: 'auto', height: 'auto', cursor: 'pointer', position: 'relative', top: '-90px', maxHeight: '89vh', zIndex: -1}} src={this.state.src} alt={this._item.name} onClick={e => killEvent(e, this._nextMedia)} />
                    </div>
                ) : <img style={{visibility: 'visible', maxWidth: '100%', width: 'auto', height: 'auto', cursor: 'pointer'}} src={this.state.src} alt={this._item.name} onClick={e => killEvent(e, this._nextMedia)} />
            }
        }
        let media2 = null
        let media4 = null
        if (this.props.mediaType === 3 || this.props.mediaType === 9) {
            const mediaCss = this.props.full ? {
                maxWidth: '100%',
                maxHeight: '70vh',
                width: 'auto',
                height: 'auto',
            } : {
                width: 'auto',
                height: 'auto',
                maxWidth: '100%',
            }
            const isIframe = this.state.src.match(/^iframe: (.*)$/);
            const isEmbed = this.state.src.match(/^embed: (.*)$/);
            const isUrl = this.state.src.match(/^url: (.*)$/);
            media2 = (
                <video style={Object.assign(mediaCss, ((this.props.mediaType === 9 && this._item.type !== 3) || isIframe || isEmbed || isUrl) ? {display: 'none'} : {})} controls src={(!isIframe && !isEmbed && !isUrl && (this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3))) ? this.state.src : ''} ref={ref => this._video = ref}>
                    <track label="Chinese" kind="captions" srcLang="ch" src={(!isIframe && !isEmbed && !isUrl && (this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3))) ? this.state.subCh : ''} default={true} />
                    <track label="English" kind="captions" srcLang="en" src={(!isIframe && !isEmbed && !isUrl && (this.props.mediaType === 3 || (this.props.mediaType === 9 && this._item.type === 3))) ? this.state.subEn : ''}/>
                </video>
            )
            media4 = isIframe ? <iframe style={{height: '420px', width: '640px'}} src={isIframe[1]} frameBorder='0px' allowFullScreen={true}></iframe> : isEmbed ? <embed style={{height: '420px', width: '640px'}} src={isEmbed[1]} allowFullScreen={true} type="application/x-shockwave-flash"></embed> : isUrl ? <a href={isUrl[1]} target="_blank">{isUrl[1]}</a> : null;
        }
        const media3 = (this.props.mediaType === 4 || this.props.mediaType === 9) ? <audio style={Object.assign({width: '300px', height: '50px'}, this.props.mediaType === 9 && this._item.type !== 4 ? {display: 'none'} : {})} controls src={this.props.mediaType === 4 || (this.props.mediaType === 9 && this._item.type === 4) ? this.state.src : ''} ref={ref => this._audio = ref} /> : null
        return (
            <section className={`panel panel-${this.props.buttonType}`} style={show}>
                <div className="panel-heading" onClick={this._toggle}>
                    <h4 className="panel-title">
                        {`${this.state.index + 1} : ${this._item.name}${this._playlist && this._playlist.end ? '(已完結)' : ''}${this._title}`}<i className="pull-right glyphicon glyphicon-remove"></i>
                    </h4>
                </div>
                <div className="panel-body" style={{padding: '0px'}}>
                    <nav>
                        <ul className={ulClass} style={{margin: '10px'}}>
                            <li>
                                <a href="#" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {option: !this.state.option})))}>
                                    <Tooltip tip="option" place="top" />
                                    <span className="glyphicon glyphicon-info-sign"></span>
                                </a>
                            </li>
                            {option}
                        </ul>
                    </nav>
                    {media}
                    {media2}
                    {media3}
                    {media4}
                </div>
            </section>
        )
    }
})

export default MediaWidget
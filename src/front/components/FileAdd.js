import React from 'react'
import FileUploader from './FileUploader'
import { UPLOAD } from '../constants'
import { isValidString, api, killEvent } from '../utility'
import UserInput from './UserInput'
import Tooltip from './Tooltip'

const FileAdd = React.createClass({
    getInitialState: function() {
        this._clearFiles = () => console.log('clear')
        this._input = new UserInput.Input(['url'], this._handleSubmit, this._handleChange)
        return Object.assign({
            files: [],
            type: false,
            show: false,
        }, this._input.initValue())
    },
    componentDidMount: function() {
        this._targetArr = Array.from(document.querySelectorAll('[data-widget]')).filter(node => node.getAttribute('data-widget') === UPLOAD)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('click', this._toggle)
            })
        }
    },
    componentWillUnmount: function() {
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('click', this._toggle)
            })
        }
    },
    _toggle: function(e) {
        killEvent(e, () => this.setState(Object.assign({}, this.state, {show: !this.state.show})))
    },
    _setFiles: function(files) {
        if (this.state.files.length === 0 && files.length > 0) {
            this.setState(Object.assign({}, this.state, {
                files,
                show: true,
            }))
        } else {
            this.setState(Object.assign({}, this.state, {files}))
        }
    },
    _setClearFiles: function(clear) {
        this._clearFiles = clear
    },
    _handleChange: function() {
        if (this._ref !== null) {
            this.setState(Object.assign({}, this.state, {type: this._ref.checked}, this._input.getValue()))
        } else {
            this.setState(Object.assign({}, this.state, this._input.getValue()))
        }
    },
    _handleSubmit: function() {
        if (isValidString(this.state.url, 'url')) {
            const url = this.state.url
            this.setState(Object.assign({}, this.state, this._input.initValue()))
            api('/api/getPath').then(ret => api(`${this.props.mainUrl}/api/upload/url`, Object.assign({
                type: this.state.type ? 1 : 0,
                url: url,
            }, ret))).then(result => {
                if (result.stop) {
                    this.props.addalert('Background upload was stoped')
                } else if (result.name) {
                    this.props.pushfeedback(result)
                }
            }).catch(err => this.props.addalert(err))
        } else {
            this.props.addalert('URL not vaild!!!')
        }
    },
    render: function() {
        let rows = []
        this.state.files.forEach(file => {
            rows.push(<div style={{color: '#31708f'}} key={file.key}>{file.name}<span className="badge">{file.progress + '%'}</span></div>)
        })
        const show = this.state.show ? {} : {display: 'none'}
        const isAdult = (this.props.level > 0 && this.props.level <= 2) ? (
            <span className="input-group-addon">
                <Tooltip tip="18+" place="top" />
                <input
                    type="checkbox"
                    checked={this.state.type}
                    ref={ref => this._ref = ref}
                    onChange={this._handleChange} />
            </span>
        ) : null
        return (
            <section className="panel panel-info" style={Object.assign({width: '205px', marginBottom: '0px'}, show)}>
                <div className="panel-heading" onClick={this._toggle}>
                    <h4 className="panel-title">
                        <a href="#" style={{textDecoration: 'none'}}>
                            Uploader<i className="pull-right glyphicon glyphicon-remove"></i>
                        </a>
                    </h4>
                </div>
                <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                    <div className="input-group">
                        {isAdult}
                        <UserInput
                            val={this.state.url}
                            getinput={this._input.getInput('url')}
                            placeholder="Input URL..." />
                        <span className="input-group-btn">
                            <button className="btn btn-default" type="submit">
                                <i className="glyphicon glyphicon-upload"></i>
                            </button>
                        </span>
                    </div>
                </form>
                <div>
                    {rows}
                    <div className="progress" style={{marginBottom: '0px'}}>
                        <div className="progress-bar" style={{width: this.props.progress + '%'}}>
                            {this.props.progress + '% Complete'}
                        </div>
                    </div>
                    <div className="btn-group">
                        <div className="btn btn-primary btn-file btn-s" style={{position: 'relative'}}>
                            <span className="glyphicon glyphicon-folder-open"></span>&nbsp;Choose
                            <FileUploader url={`${this.props.mainUrl}/upload/file`} setUpload={this.props.setUpload} callback={(ret, e) => e ? this.props.addalert(e) : this.props.pushfeedback(ret)} set={this._setFiles} setClear={this._setClearFiles} params={{type: this.state.type ? 1 : 0}} beforeUpload={() => api('/api/getPath').catch(err => {
                                this.props.addalert(err)
                                Promise.reject('')
                            })} drop={UPLOAD} />
                        </div>
                        <button className="btn btn-danger btn-s" disabled={!this.state.files.length} onClick={this._clearFiles}>
                            <span className="glyphicon glyphicon-trash"></span>Remove all
                        </button>
                    </div>
                </div>
            </section>
        )
    }
})

export default FileAdd
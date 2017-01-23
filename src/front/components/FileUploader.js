import React from 'react'
let key = 0

const FileUploader = React.createClass({
    componentWillMount: function() {
        this._files = []
        this._uploading = -1
        this._request = null
        this._multi = false
        this._targetArr = []
        if (this.props.setClear) {
            this.props.setClear(this._clearFile)
        }
        if (this.props.set) {
            this._multi = true
        }
    },
    componentDidMount: function() {
        if (this.props.drop) {
            this._targetArr = Array.from(document.querySelectorAll('[data-drop]')).filter(node => node.getAttribute('data-drop') === this.props.drop)
        }
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.addEventListener('dragover', this._preventDefault)
                target.addEventListener('drop', this._pushFile)
            })
        }
        window.addEventListener("beforeunload", this._routerWillLeave)
    },
    componentWillUnmount: function() {
        this._clearFile()
        window.removeEventListener("beforeunload", this._routerWillLeave)
        if (this._targetArr.length > 0) {
            this._targetArr.forEach(target => {
                target.removeEventListener('dragover', this._preventDefault)
                target.removeEventListener('drop', this._pushFile)
            })
        }
    },
    _routerWillLeave: function(e) {
        let confirmationMessage = 'You have uploaded files. Are you sure you want to navigate away from this page?'
        if (this._uploading !== -1) {
            e.returnValue = confirmationMessage
            return confirmationMessage
        }
    },
    _setState: function() {
        if (this._multi) {
            this.props.set(this._files)
            let progress = 0
            this._files.forEach(file => progress += file.progress)
            progress = progress > 0 ? Math.round(progress / this._files.length) : 0
            this.props.setUpload(progress)
        } else {
            this.props.setUpload(this._files.length > 0 ? this._files[0].progress : 0)
        }
    },
    _preventDefault: function(e) {
        e.preventDefault()
    },
    _pushFile: function(e) {
        e.preventDefault()
        const droppedFiles = e.dataTransfer ? e.dataTransfer.files : e.target.files
        if (this._multi) {
            Array.from(droppedFiles).forEach(file => this._files.push(Object.assign(file, {
                key: key++,
                progress: 0,
                params: false,
                done: false,
            })))
        } else {
            if (this._files.length === 0 && Array.from(droppedFiles).length > 0) {
                this._files.push(Object.assign(Array.from(droppedFiles)[0], {
                    key: key++,
                    progress: 0,
                    params: false,
                    done: false,
                }))
            }
        }
        this._setState()
        if (this._files.length > 0) {
            this._uploadFile()
        }
    },
    _clearFile: function() {
        if (this._request) {
            this._request.upload.removeEventListener('progress', this._uploadProgress, false)
            this._request.removeEventListener('load', this._uploadFinish, false)
            this._request.removeEventListener('error', this._uploadError, false)
            this._request.removeEventListener('abort', this._uploadAbort, false)
            this._request.abort()
        }
        this._files = []
        this._setState()
    },
    _uploadFile: function() {
        const uploader = ret => {
            this._files = this._files.map(file => file.params === false ? Object.assign(file, {params: Object.assign({}, this.props.params, ret)}) : file)
            for (let i = 0; i < this._files.length; i++) {
                if (!this._files[i].done) {
                    if (this._uploading === -1) {
                        this._uploading = i
                        let formData = new FormData()
                        formData.append("file", this._files[this._uploading])
                        Object.keys(this._files[this._uploading].params).forEach(key => formData.append(key, JSON.stringify(this._files[this._uploading].params[key])))
                        this._request = new XMLHttpRequest()
                        this._request.withCredentials = true
                        this._request.upload.addEventListener('progress', this._uploadProgress, false)
                        this._request.addEventListener('load', this._uploadFinish, false)
                        this._request.addEventListener('error', this._uploadError, false)
                        this._request.addEventListener('abort', this._uploadAbort, false)
                        this._request.open("POST", this.props.url)
                        this._request.send(formData)
                    }
                    break;
                }
            }
            this._setState()
        }
        if (this.props.beforeUpload) {
            Promise.resolve(this.props.beforeUpload()).then(uploader).catch(err => {})
        } else {
            uploader()
        }
    },
    _uploadProgress: function(e) {
        if (e.lengthComputable) {
            const progress = Math.round(e.loaded * 100 / e.total)
            this._files[this._uploading].progress = progress
            this._setState()
        }
    },
    _uploadFinish: function(e) {
        if (this._files[this._uploading]) {
            this._files[this._uploading].done = true
        }
        let result = e.currentTarget.response
        try {
            result = JSON.parse(e.currentTarget.response)
        } catch(x) {
            console.log(x);
        }
        if (this._request.status === 200) {
            this.props.callback(result)
            this._uploading = -1
            this._uploadFile()
        } else {
            this._uploadError(result)
        }
    },
    _uploadError: function(e) {
        this.props.callback(null, e)
        if (this._files[this._uploading]) {
            this._files[this._uploading].done = true
        }
        this._uploading = -1
        this._uploadFile()
    },
    _uploadAbort: function() {
        console.log('abort');
        if (this._files[this._uploading]) {
            this._files[this._uploading].done = true
        }
        this._uploading = -1
        this._uploadFile()
    },
    render: function() {
        return <input type="file" multiple onChange={this._pushFile} />
    }
})

export default FileUploader
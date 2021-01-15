import React from 'react'
import UserInput from './UserInput.js'
import FileUploader from './FileUploader.js'
import Tooltip from './Tooltip.js'
import { killEvent, clearText } from '../utility.js'

class ItemInput extends React.Component {
    constructor(props) {
        super(props);
        this._input = new UserInput.Input(['input1', 'input2'], this._handleSubmit, this._handleChange)
        this.state = Object.assign({
            exact: false,
            lang: 'ch',
            progress: 0,
            loading: false,
            showPwd: false,
        }, this._input.initValue())
    }
    componentWillUnmount() {
        this.props.inputclose(-1)
    }
    componentDidUpdate(prevProps) {
        if (prevProps.index !== this.props.index) {
            this.setState(Object.assign({}, this.state, this._input.initValue({input1: this.props.value}), {showPwd: false, loading: false}));
        } else {
            if (this.props.input === 3) {
                this._input.initFocus()
                this._input.ref.get('input1').selectionStart = 0
            } else if (this.props.input !== 0 && this.props.input !== 4 && prevProps.index !== this.props.index) {
                this._input.initFocus()
            }
        }
    }
    _copyPassword = e => {
        e.clipboardData.setData('text/plain', this.state.input1)
        e.preventDefault()
        e.stopPropagation()
        this.props.inputclose(this.props.input)
        this._input.allBlur()
    }
    _handleSubmit = () => {
        if (this.props.index === -1 || this.props.input === 3 || this.props.input === 4 || this.state.loading) {
            return true
        }
        this.setState(Object.assign({}, this.state, {loading: true}), () => {
            let input = this.props.input
            this.props.callback(this.state.input1, this.state.exact, this.state.input2).then(() => {
                if (input !== 0) {
                    this.props.inputclose(input)
                }
                this.setState(Object.assign({}, this.state, {loading: false}))
            }).catch(err => {
                this.props.addalert(err)
                this.setState(Object.assign({}, this.state, {loading: false}))
            })
            this.setState(Object.assign({}, this.state, this._input.initValue()))
            this._input.allBlur()
        })
    }
    _handleChange = () => {
        this.setState(Object.assign({}, this.state, this._input.getValue()))
    }
    _handleSelect = e => {
        this.setState(Object.assign({}, this.state, {lang: e.target.value}))
    }
    _setUpload = progress => {
        this.setState(Object.assign({}, this.state, {progress}))
    }
    render() {
        if (this.props.index === -1) {
            return null
        }
        const exactClass1 = this.state.exact ? `btn btn-${this.props.color}` : 'btn active btn-primary'
        const exactClass2 = this.state.exact ? 'glyphicon glyphicon-eye-open' : 'glyphicon glyphicon-eye-close'
        const close = this.props.input === 0 ? (
            <button className={exactClass1} type="button" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {exact: !this.state.exact})))}>
                <i className={exactClass2}></i>
            </button>
        ) : (
            <button className={`btn btn-${this.props.color}`} type="button" onClick={e => killEvent(e, () => this.props.inputclose(this.props.input))}>
                <i className="glyphicon glyphicon-remove"></i>
            </button>
        )
        const tooltip = this.props.input === 0 ? <Tooltip tip="嚴格比對" place="right" /> : null
        let input = <UserInput
            val={this.state.input1}
            getinput={this._input.getInput('input1')}
            placeholder={this.props.placeholder} />
        let input2 = null
        let fromClass = 'input-group'
        let submit = (
            <button className={`btn btn-${this.props.color}`} type="submit" disabled={this.state.loading}>
                <span className="glyphicon glyphicon-search"></span>
            </button>
        )
        switch(this.props.input) {
            case 2:
            if (!this.props.option) {
                fromClass = 'input-group double-input'
                input = (
                    <div className="form-control">
                        {`${this.state.progress}% Complete`}
                    </div>
                )
                if (this.props.value) {
                    input2 = (
                        <select className="form-control" onChange={this._handleSelect} value={this.state.lang} style={{position: 'relative'}}>
                            <option value="ch" key={0}>windows</option>
                            <option value="en" key={1}>Mac&mobile</option>
                        </select>
                    )
                } else {
                    input2 = (
                        <select className="form-control" onChange={this._handleSelect} value={this.state.lang} style={{position: 'relative'}}>
                            <option value="ch" key={0}>中文</option>
                            <option value="en" key={1}>English</option>
                        </select>
                    )
                }
                submit = (
                    <div className={`btn btn-${this.props.color} btn-file`}>
                        <span className="glyphicon glyphicon-folder-open"></span>&nbsp;Choose
                        <FileUploader url={this.props.placeholder} setUpload={this._setUpload} callback={(ret, e) => e ? this.props.addalert(e) : this._handleSubmit(ret)} params={{lang: this.state.lang}} />
                    </div>
                )
                break
            } else {
                input2 = <UserInput
                    val={this.state.input2}
                    getinput={this._input.getInput('input2')}
                    placeholder={this.props.option} />
                fromClass = 'input-group double-input'
                submit = (
                    <button className={`btn btn-${this.props.color}`} type="submit" disabled={this.state.loading}>
                        <span className="glyphicon glyphicon-ok"></span>
                    </button>
                )
                break
            }
            case 1:
            if (this.props.option) {
                fromClass = 'input-group double-input'
                input2 = <UserInput
                    val={this.state.input2}
                    getinput={this._input.getInput('input2')}
                    placeholder={this.props.option} />
            }
            submit = (
                <button className={`btn btn-${this.props.color}`} type="submit" disabled={this.state.loading}>
                    <span className="glyphicon glyphicon-ok"></span>
                </button>
            )
            break
            case 4:
            input = <UserInput
                val={this.state.input1}
                getinput={this._input.getInput('input1')}
                placeholder={this.props.placeholder}
                copy={() => {}}
                edit={false} />
            submit = this.props.option ? (
                <button className={`btn btn-${this.props.color}`} type="button" onClick={e => killEvent(e, () => this.state.input1 === this.props.value ? this.setState(Object.assign({}, this.state, {input1: this.props.option})) : this.setState(Object.assign({}, this.state, {input1: this.props.value})))}>
                    <i className="glyphicon glyphicon-chevron-right"></i>
                </button>
            ) : (
                <button className={`btn btn-${this.props.color}`} type="button" onClick={e => killEvent(e, () => this.props.inputclose(this.props.input))}>
                    <i className="glyphicon glyphicon-ok"></i>
                </button>
            )
            break
            case 3:
            input = <UserInput
                val={this.props.option ? this.state.showPwd ? clearText(this.state.input1) : 'Copy Here' : this.state.input1}
                getinput={this._input.getInput('input1')}
                placeholder={this.props.placeholder}
                copy={this._copyPassword}
                edit={false} />
            submit = this.props.option ? (
                <button className={`btn btn-${this.props.color}`} type="button" onClick={e => killEvent(e, () => this.setState(Object.assign({}, this.state, {showPwd: !this.state.showPwd})))}>
                    <i className={this.state.showPwd ? 'glyphicon glyphicon-eye-open' : 'glyphicon glyphicon-eye-close'}></i>
                </button>
            ) : (
                <button className={`btn btn-${this.props.color}`} type="button" onClick={e => killEvent(e, () => this.props.inputclose(this.props.input))}>
                    <i className="glyphicon glyphicon-ok"></i>
                </button>
            )
            break
        }
        return (
            <form onSubmit={e => killEvent(e, this._handleSubmit)}>
                <div className={fromClass}>
                    <span className="input-group-btn">
                        {tooltip}
                        {close}
                    </span>
                    {input}
                    {input2}
                    <span className="input-group-btn">
                        {submit}
                    </span>
                </div>
            </form>
        )
    }
}

export default ItemInput
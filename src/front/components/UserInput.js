import React from 'react'

export default function UserInput({ val, getinput, edit=true, show=true, type='text', placeholder='', copy=null, tagv=null, tage=null, copyShow=null, children }) {
    if (!show) {
        return null
    }
    let content = (edit || copy) ? (
        <input
            type={(!edit && copy) ? 'text' : type}
            className={getinput.className}
            style={getinput.style}
            placeholder={placeholder}
            value={(!edit && copy && copyShow) ? copyShow : val}
            ref={ref => getinput.getRef(ref)}
            onChange={getinput.onchange}
            onCopy={(!edit && copy) ? copy : () => {}}
            onKeyPress={getinput.onenter}
            readOnly={(!edit && copy) ? true : false} />
    ) : val

    content = edit ? insertChild(content, tage) : insertChild(content, tagv)

    return insertChild(content, children)
}

function insertChild(item1, item2) {
    if (!item2) {
        return item1
    } else if (item2.props.children) {
        return React.cloneElement(item2, {}, item2.props.children.map(child => {
            if (!child.props.children) {
                return React.cloneElement(child, {
                    style: {wordBreak: 'break-all', wordWrap: 'break-word', height: 'auto'}
                }, item1)
            } else {
                return child
            }
        }))
    } else {
        return React.cloneElement(item2, {
            style: {wordBreak: 'break-all', wordWrap: 'break-word', height: 'auto'}
        }, item1)
    }
}

UserInput.Input = class {
    constructor(names, submit, change, className='form-control', style={}) {
        this.submit = submit
        this.change = change
        this.className = className
        this.style = style
        this.ref = new Map()
        names.forEach(name => this.ref.set(name, null))
    }
    getInput(target) {
        return {
            getRef: ref => this.ref.set(target, ref),
            onenter: e => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    let start = false
                    for (let [key, value] of this.ref) {
                        if (start) {
                            if (value !== null) {
                                value.focus()
                                return true
                            }
                        }
                        if (key === target) {
                            start = true
                        }
                    }
                    this.submit()
                }
            },
            onchange: this.change,
            className: this.className,
            style: this.style,
        }
    }
    initFocus() {
        for (let value of this.ref.values()) {
            if (value !== null) {
                value.focus()
                return true
            }
        }
    }
    getValue() {
        let obj = {}
        for (let [key, value] of this.ref) {
            if (value !== null) {
                obj[key] = value.value
            }
        }
        return obj
    }
    initValue(init = {}) {
        let obj = {}
        for (let key of this.ref.keys()) {
            if (init[key] === undefined) {
                obj[key] = ''
            } else {
                obj[key] = init[key]
            }
        }
        return obj
    }
    allBlur() {
        for (let value of this.ref.values()) {
            if (value !== null) {
                value.blur()
            }
        }
    }
}
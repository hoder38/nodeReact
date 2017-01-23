import fetch from 'isomorphic-fetch'
import { browserHistory } from 'react-router'
import { LOGIN_PAGE, STORAGE } from './constants'

const re_weburl = new RegExp(
    "^(url:)?" +
    // protocol identifier
    "(?:(?:https?|ftp|wss?)://)" +
    // user:pass authentication
    "(?:\\S+(?::\\S*)?@)?" +
    "(?:" +
    // IP address exclusion
    // private & local networks
    "(?!(?:10|127)(?:\\.\\d{1,3}){3})" +
    "(?!(?:169\\.254|192\\.168)(?:\\.\\d{1,3}){2})" +
    "(?!172\\.(?:1[6-9]|2\\d|3[0-1])(?:\\.\\d{1,3}){2})" +
    // IP address dotted notation octets
    // excludes loopback network 0.0.0.0
    // excludes reserved space >= 224.0.0.0
    // excludes network & broacast addresses
    // (first & last IP address of each class)
    "(?:[1-9]\\d?|1\\d\\d|2[01]\\d|22[0-3])" +
    "(?:\\.(?:1?\\d{1,2}|2[0-4]\\d|25[0-5])){2}" +
    "(?:\\.(?:[1-9]\\d?|1\\d\\d|2[0-4]\\d|25[0-4]))" +
    "|" +
    // host name
    "(?:(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)" +
    // domain name
    "(?:\\.(?:[a-z\\u00a1-\\uffff0-9]-*)*[a-z\\u00a1-\\uffff0-9]+)*" +
    // TLD identifier
    "(?:\\.(?:[a-z\\u00a1-\\uffff]{2,}))" +
    ")" +
    // port number
    "(?::\\d{2,5})?" +
    // resource path
    "(?:/\\S*)?" +
    "$", "i"
);

export function isValidString(str, type) {
    if (typeof str !== 'string' && typeof str !== 'number') {
        return false
    }
    switch (type) {
        case 'name':
        //為了方便開放 < ，但是後端只接受default的
        str = str.trim()
        return str.match(/^[^\\\/\|\*\?"<:]{1,255}$/)
        case 'passwd':
        return str.match(/^[0-9a-zA-Z!@#$%]{2,30}$/)
        case 'altpwd':
        return str.match(/^[0-9a-zA-Z\._!@#$%;\u4e00-\u9fa5]{2,30}$/)
        case 'desc':
        return str.match(/^[^\\\/\|\*\?\'"<>`:&]{0,250}$/)
        case 'int':
        if (Number(str) && Number(str) > 0) {
            return true;
        }
        break
        case 'perm':
        if ((Number(str) || Number(str) === 0) && Number(str) < 32 && Number(str) >= 0) {
            return true
        }
        break
        case 'url':
        return str.match(re_weburl) || str.match(/^magnet:(\?xt=urn:btih:[a-z0-9]{20,50}|stop)/i)
        case 'email':
        return str.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,6})+$/)
    }
    return false
}

export function killEvent(e, func) {
    e.preventDefault()
    e.stopPropagation()
    func()
}

export function randomFloor(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min)
}

export const clearText = text => text.replace('l', '<little L>').replace('I', '<big i>').replace('1', '<number 1>').replace('O', '<big o>').replace('0', '<number 0>')

export function checkInput(name, state, addalert, orig_input = '', type, confirm='') {
    if (confirm) {
        if (state[name].toString() !== orig_input.toString()) {
            addalert(`${name} is not the same!!!`)
        } else {
            if (state[name]) {
                if (isValidString(state[name], type)) {
                    return {
                        [name]: state[name],
                        [confirm]: orig_input,
                    }
                } else {
                    addalert(`${name} not vaild!!!`)
                }
            }
        }
    } else {
        if (state[name].toString() !== orig_input.toString()) {
            if (isValidString(state[name], type)) {
                return {[name]: state[name]}
            } else {
                addalert(`${name} not vaild!!!`)
            }
        }
    }
    return false
}

//api
function errorHandle(response, relogin) {
    if (!response.ok) {
        switch(response.status) {
            case 400:
                return response.text().then(err => {throw err})
            case 401:
                if (relogin) {
                    browserHistory.push(LOGIN_PAGE)
                    throw Error('')
                } else {
                    return response.text().then(err => {throw err})
                }
            case 403:
                throw Error('unknown API!!!')
            case 404:
                return response.text().then(err => {throw err})
            case 500:
                return response.text().then(err => {throw err})
            default:
                throw Error('unknown error')
        }
    }
    return response.json()
}

export const api = (url, data = null, method = 'GET', relogin = true) => {
    if (data) {
        method = method === 'GET' ? 'POST' : method
        let myHeaders = new Headers()
        myHeaders.append('Content-Type', 'application/json')
        return fetch(url, {
            method: method,
            headers: myHeaders,
            credentials: 'include',
            body: JSON.stringify(data)
        }).then(resp => errorHandle(resp, relogin))
    } else {
        return fetch(url, {
            credentials: 'include',
            method: method,
        }).then(resp => errorHandle(resp, relogin))
    }
}

//login
export const doLogin = (username, password, url = '') => api(`${url}/api/login`, {
    username: username,
    password: password,
}, 'POST', false).then(info => {
    if (info.loginOK){
        if (info.url) {
            return doLogin(username, password, info.url)
        }
    } else {
        throw Error('auth fail!!!')
    }
})

export const doLogout = (url = '') => api(`${url}/api/logout`).then(info => {
    if (info.url) {
        return doLogout(info.url)
    }
})

export const testLogin = () => api('/api/basic/testLogin', null, 'GET', false)

//array object
export const arrayObject = (action, myArray, term, property=null, rest=item=>item) => {
    let newList = new Map(myArray)
    switch(action) {
        case 'push':
        Array.isArray(term) ? term.forEach(item => newList.set(item[property], rest(item))) : newList.set(term[property], rest(term))
        break
        case 'pop':
        newList.delete(term)
        break
    }
    return newList
}

export const arrayId = (action, myArray, term, property=null) => {
    let newList = new Set(myArray)
    switch(action) {
        case 'push':
        Array.isArray(term) ? term.forEach(item => newList.add(item[property])) : newList.add(term[property])
        break
        case 'pop':
        newList.delete(term)
        break
    }
    return newList
}

export const arrayMerge = (arrId, arrObj) => {
    let newList = new Map()
    arrId.forEach(id => newList.set(id, arrObj.get(id)))
    return newList
}

export const arrayObjectIndexOf = (myArray, searchTerm, property) => {
    for(let i in myArray) {
        if (myArray[i][property] === searchTerm) {
            return i
        }
    }
    return -1
}

//itemlist
const youtubeList = (pageToken, set, parentList, sortname) => api(`/api/youtube/get/${sortname}/${pageToken}`).then(result => set(result.itemList, parentList, null, null, null, null, result.pageToken))

export const getItemList = (itemType, sortname, type, set, page=0, pageToken='', push=false, name=null, index=0, exact=false, multi=false, random=false) => {
    const rest = result => push ? set(result.itemList) : set(result.itemList, result.parentList, result.bookmarkID, result.latest, sortname, type)
    let queryItem = null
    if (name === null) {
        queryItem = random && itemType === STORAGE ? api(`/api/${itemType}/getRandom/${sortname}/${type}/${page}`) : api(`/api/${itemType}/get/${sortname}/${type}/${page}`)
    } else {
        if (!isValidString(name, 'name')) {
            return Promise.reject('search tag is not vaild!!!')
        }
        queryItem = (multi || index > 0) ? api(`/api/${itemType}/get/${sortname}/${type}/${page}/${name}/${exact}/${index}`) : api(`/api/${itemType}/getSingle/${sortname}/${type}/${page}/${name}/${exact}/${index}`)
    }
    return queryItem.then(result => {
        rest(result)
        if (itemType === STORAGE) {
            return youtubeList(pageToken, set, result.parentList, sortname)
        }
    })
}

export const resetItemList = (itemType, sortname, type, set) => api(`/api/${itemType}/reset/${sortname}/${type}`).then(result => {
    set(result.itemList, result.parentList, result.bookmarkID, result.latest, sortname, type)
    if (itemType === STORAGE) {
        return youtubeList('', set, result.parentList, sortname)
    }
})

export const dirItemList = (itemType, sortname, type, set, id, multi) => {
    const queryItem = multi ? api(`/api/parent/${itemType}/query/${id}/${sortname}/${type}`) : api(`/api/parent/${itemType}/query/${id}/${sortname}/${type}/single`)
    return queryItem.then(result => {
        set(result.itemList, result.parentList, result.bookmarkID, result.latest, sortname, type)
        if (itemType === STORAGE) {
            return youtubeList('', set, result.parentList, sortname)
        }
    })
}

export const bookmarkItemList = (itemType, type, sortname, sorttype, set, id) => api(`/api/bookmark/${itemType}/${type}/${id}/${sortname}/${sorttype}`).then(result => {
    set(result.itemList, result.parentList, result.bookmarkID, result.latest, sortname, sorttype)
    if (itemType === STORAGE) {
        return youtubeList('', set, result.parentList, sortname)
    }
})
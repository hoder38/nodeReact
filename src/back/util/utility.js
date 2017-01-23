import { objectID } from '../models/mongo-tool'
import { parse as UrlParse } from 'url'
import MobileDetect from 'mobile-detect'
import { createHash } from 'crypto'

let pwCheck = {}

const re_weburl = new RegExp(
    "^(url:)?" +
    // protocol identifier
    "(?:(?:https?|ftp)://)" +
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
)

export function isValidString(str, type) {
    if (typeof str === 'string' || typeof str === 'number') {
        if (typeof str === 'string') {
            const buf = new Buffer(str, 'utf-8')
            str = buf.toString()
        } else {
            str = str.toString()
        }
        switch (type) {
            case 'name':
            const trim = str.trim()
            //改為 \ / : ? < > * " |  允許 ' ` &
            if (trim !== '.' && trim !== '..') {
                if (trim.match(/^[^&\\\/\|\*\?"<>:]{1,255}$/)) {
                    if (trim.replace(/[\s　]+/g, '') !== '') {
                        return trim
                    }
                }
            }
            break
            case 'desc':
            //不合法字元: \ / | * ? ' " < > ` : &
            if (str.search(/^[^\\\/\|\*\?\'"<>`:&]{0,250}$/) !== -1) {
                return str
            }
            break
            case 'perm':
            if ((Number(str) || Number(str) === 0) && Number(str) < 32 && Number(str) >= 0) {
                return Number(str)
            }
            break
            case 'passwd':
            if (str.match(/^[0-9a-zA-Z!@#$%]{6,20}$/)) {
                return str
            }
            break
            case 'url':
            if (str.match(re_weburl) || str.match(/^magnet:(\?xt=urn:btih:[a-z0-9]{20,50}|stop)/i)) {
                return encodeURIComponent(str)
            }
            break
        }
    } else if (type === 'uid' && typeof str === 'object') {
        str = str.toString()
        if (str.match(/^[0-9a-f]{24}$/)) {
            return objectID(str)
        }
    }
    console.log(`invalid string ${type} ${str}`);
    return false
}

export function userPWCheck (user, pw) {
    if (user.password === createHash('md5').update(pw).digest('hex')) {
        pwCheck[user._id] = 1
        setTimeout(() => pwCheck[user._id] = 0, 70000)
        return true
    } else if (pwCheck[user._id] === 1) {
        return true
    } else {
        return false
    }
}

export const checkAdmin = (perm, user) => (user.perm > 0 && user.perm <= perm) ? true : false

//errorhandle
export function HoError(message, code=400) {
    this.name = 'HoError'
    this.message = message || 'Hoder Message'
    this.code = code
    this.stack = (new Error()).stack
}

HoError.prototype = Object.create(Error.prototype)
HoError.prototype.constructor = HoError

function showError(err, type) {
    console.log(`${type} error: ${err.name} ${err.message}`);
    if (err.code !== undefined) {
        console.log(err.code);
    }
    if (err.stack) {
        console.log(err.stack);
    }
}

export function handleError(err, type=null) {
    if (err) {
        if (type) {
            if (typeof type === 'function') {
                showError(err, 'Delay')
                type(err)
            } else if (typeof type === 'string') {
                showError(err, type)
            } else {
                console.log(type);
                showError(err, 'Unknown type')
            }
        } else {
            showError(err, 'Delay')
            throw err
        }
    }
}

//middleware
export function showLog(req, next) {
    console.log(new Date());
    console.log(req.url);
    for (let i in req.body) {
        if (i !== 'password') {
            console.log(`${i}: ${req.body[i]}`);
        }
    }
    next()
}

export function checkLogin(req, res, next, type=0) {
    console.log('check');
    const parseUrl = req.headers['referer'] ? UrlParse(req.headers['referer']) : UrlParse(req.headers['origin'])
    if (type && (!req.headers['host'].match(/^[^:]+/) || parseUrl['hostname'] !== req.headers['host'].match(/^[^:]+/)[0])) {
        console.log(parseUrl);
        handleError(new HoError('auth fail!!!', 401))
    } else if (!type && parseUrl['host'] !== req.headers['host']) {
        console.log(parseUrl);
        handleError(new HoError('auth fail!!!', 401))
    } else if(!req.isAuthenticated()) {
        if (type) {
            if (new MobileDetect(req.headers['user-agent']).mobile() || req.headers['user-agent'].match(/Firefox/i)|| req.headers['user-agent'].match(/armv7l/i)) {
                if (/^\/video\//.test(req.path) || /^\/subtitle\//.test(req.path) || /^\/torrent\//.test(req.path)) {
                    console.log("mobile or firefox");
                    next()
                } else {
                    handleError(new HoError('auth fail!!!', 401))
                }
            } else {
                handleError(new HoError('auth fail!!!', 401))
            }
        } else {
            handleError(new HoError('auth fail!!!', 401))
        }
    } else {
        console.log(req.user._id);
        next()
    }
}
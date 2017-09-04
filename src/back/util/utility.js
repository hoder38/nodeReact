import { RE_WEBURL } from '../constants'
import { ENV_TYPE } from '../../../ver'
import { NAS_PREFIX } from '../config'
import { objectID } from '../models/mongo-tool'
import MobileDetect from 'mobile-detect'
import { createHash } from 'crypto'
import { encode as IconvEncode, decode as IconvDecode } from 'iconv-lite'
import { join as PathJoin } from 'path'
import { existsSync as FsExistsSync, readdirSync as FsReaddirSync, lstatSync as FsLstatSync, unlinkSync as FsUnlinkSync, rmdirSync as FsRmdirSync, readFile as FsReadFile, writeFile as FsWriteFile, createReadStream as FsCreateReadStream, createWriteStream as FsCreateWriteStream } from 'fs'
import { detectCharset } from 'node-icu-charset-detector'
import Ass2vtt from 'ass-to-vtt'

let pwCheck = {}

export function isValidString(str, type, msg=null, code=400) {
    if (typeof str === 'string' || typeof str === 'number') {
        typeof str === 'string' ? str = new Buffer(str, 'utf-8').toString() : str.toString()
        switch (type) {
            case 'name':
            const trim = str.trim()
            //改為 \ / : ? < > * " |  允許 ' ` &
            if (trim !== '.' && trim !== '..') {
                if (trim.match(/^[^\\\/\|\*\?"<>:]{1,500}$/)) {
                    if (trim.replace(/[\s　]+/g, '') !== '') {
                        return trim
                    }
                }
            }
            break
            case 'desc':
            //不合法字元: \ / | * ? ' " < > ` : &
            str = str.replace(/\[\[([^\]]+)\]\]/g, (m, m1) => `[[${encodeURIComponent(m1)}]]`);
            if (str.search(/^[^\\\/\|\*\?\'"<>`:&]{0,500}$/) !== -1) {
                return str;
            }
            break
            case 'perm':
            if ((Number(str) || Number(str) === 0) && Number(str) < 32 && Number(str) >= 0) {
                return Number(str)
            }
            break
            case 'parentIndex':
            if (Number(str) && Number(str) <= 10 && Number(str) > 0) {
                return Number(str);
            }
            break;
            case 'int':
            if (Number(str) && Number(str) > 0) {
                return Number(str)
            }
            break
            case 'passwd':
            if (str.match(/^[0-9a-zA-Z!@#$%]{6,20}$/)) {
                return str
            }
            break
            case 'altpwd':
            if (str.match(/^[0-9a-zA-Z\._!@#$%;\u4e00-\u9fa5]{2,30}$/)) {
                return str;
            }
            break;
            case 'url':
            if (str.match(RE_WEBURL) || str.match(/^magnet:(\?xt=urn:btih:[a-z0-9]{20,50}|stop)/i)) {
                return encodeURIComponent(str)
            }
            break
            case 'uid':
            if (str.match(/^[0-9a-f]{24}$/)) {
                return objectID(str)
            }
            break
            case 'email':
            if (str.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,6})+$/)) {
                return str;
            }
            break;
        }
    } else if (type === 'uid' && typeof str === 'object') {
        str = str.toString()
        if (str.match(/^[0-9a-f]{24}$/)) {
            return objectID(str)
        }
    }
    console.log(`invalid string ${type} ${str}`);
    if (msg) {
        handleError(new HoError(msg, {code: code}))
    }
    return false
}

export function toValidName(str) {
    str = new Buffer(str, 'utf-8').toString().replace(/&#\d+;/g, ' ').trim();
    if (str.replace(/[\s　]+/g, '') === '') {
        str = 'empty';
    }
    return str.replace(/[\\\/\|\*\?"<>:]+/g, ',').slice(0, 255);
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
export function HoError(message, { code=400 } = {}) {
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

export function handleError(err, type=null, ...args) {
    if (err) {
        if (type) {
            if (typeof type === 'function') {
                showError(err, 'Delay')
                console.log(type);
                return type(err, ...args)
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
    console.log(new Date().toLocaleString());
    console.log(req.url);
    for (let i in req.body) {
        if (i !== 'password' && i !== 'newPwd' && i !== 'conPwd' && i !== 'userPW') {
            console.log(`${i}: ${req.body[i]}`);
        }
    }
    next();
}

export function checkLogin(req, res, next, type=0) {
    if(!req.isAuthenticated()) {
        if (type) {
            if (new MobileDetect(req.headers['user-agent']).mobile() || req.headers['user-agent'].match(/Firefox/i)|| req.headers['user-agent'].match(/armv7l/i)) {
                if (/^\/video\//.test(req.path) || /^\/subtitle\//.test(req.path) || /^\/torrent\//.test(req.path)) {
                    console.log("mobile or firefox");
                    next()
                } else {
                    handleError(new HoError('auth fail!!!', {code: 401}))
                }
            } else {
                handleError(new HoError('auth fail!!!', {code: 401}))
            }
        } else {
            handleError(new HoError('auth fail!!!', {code: 401}))
        }
    } else {
        console.log(req.user._id);
        next()
    }
}

export const big5Encode = str => {
    let rtn = '';
    for (let j of str) {
        if (j.match(/^[\x00-\x7F]$/)) {
            rtn += encodeURIComponent(j);
        } else {
            const buf = IconvEncode(j, 'big5');
            for(let i = 0 ; i < buf.length ; i += 2) {
                rtn += '%' + buf[i].toString(16).toUpperCase();
                rtn += ((buf[i+1] >= 65 && buf[i+1] <= 90)||(buf[i+1]>=97 && buf[i+1]<=122))? String.fromCharCode(buf[i+1]): '%' + buf[i+1].toString(16).toUpperCase();
            }
        }
    }
    return rtn;
}

export function selectRandom(count_arr, select_arr=null) {
    let accm_list = [];
    if (!Array.isArray(count_arr)) {
        const l = count_arr;
        count_arr = [];
        for (let i=0; i < l; i++) {
            count_arr.push(1);
        }
    }
    select_arr ? select_arr.forEach((s, i) => i < 1 ? accm_list.push(count_arr[s]) : accm_list.push(accm_list[i-1] + count_arr[s])) : count_arr.forEach((c, i) => i < 1 ? accm_list.push(c) : accm_list.push(accm_list[i-1] + c));
    const rand = Math.random() * accm_list[accm_list.length-1];
    console.log(rand);
    for (let i in accm_list) {
        if (accm_list[i] >= rand) {
            return select_arr ? select_arr[Number(i)] : Number(i);
        }
    }
}

export const getStorageItem = (user, items, mediaHandle) => items.map(item => {
    if (item.adultonly === 1) {
        item.tags.push('18+');
    }
    if (item.first === 1) {
        item.tags.push('first item');
    }
    let media = {};
    if (mediaHandle === 1) {
        if (item.mediaType.type) {
            item.mediaType.complete = item.mediaType.complete ? item.mediaType.complete.toString() : '';
            item.mediaType.timeout = item.mediaType.timeout ? item.mediaType.timeout.toString() : '';
        } else {
            media = {media : {
                type: '',
                key: '',
                err: '',
                timeout: '',
                complete: '',
            }};
            Object.entries(item.mediaType).forEach(([i, v]) => {
                media['media']['type'] = `${media['media']['type']}${i}.${v.type} `;
                if (v.key) {
                    media['media']['key'] = `${media['media']['key']}${i}.${v.key} `;
                }
                if (v.err) {
                    media['media']['err'] = `${media['media']['err']}${i}.${v.err} `;
                }
                if (v.timeout) {
                    media['media']['timeout'] = `${media['media']['timeout']}${i}.${v.timeout} `;
                }
                if (v.complete) {
                    media['media']['complete'] = `${media['media']['complete']}${i}.${v.complete} `;
                }
            });
        }
    }
    return Object.assign({
        name: item.name,
        id: item._id,
        tags: item.tags,
        recycle: item.recycle,
        isOwn: checkAdmin(1, user) ? true : (isValidString(item.owner, 'uid') && user._id.equals(item.owner)) ? true : false,
        status: (item.status === 5 || item.status === 6 || item.status === 10) ? 2 : item.status,
        utime: item.utime,
        count: item.count,
    }, mediaHandle === 1 ? {media: item.mediaType} : {}, media, item.present ? {present: item.present} : {}, item.url ? {url: item.url} : {}, item.thumb ? {thumb: item.thumb} : {}, item.cid ? {cid: item.cid} : {}, item.ctitle ? {ctitle: item.ctitle} : {}, item.status === 6 ? {doc: 1} : {}, item.status === 5 ? {doc: 2} : {}, item.status === 10 ? {doc: 3} : {});
});

export const getPasswordItem = (user, items) => items.map(item => {
    if (item.important === 1) {
        item.tags.push('important');
    }
    return Object.assign({
        name: item.name,
        id: item._id,
        tags: item.tags,
        username: item.username,
        url: item.url,
        email: item.email,
        utime: item.utime,
    }, (item.important === 1) ? {important : true} : {important : false});
});

export const getStockItem = (user, items) => checkAdmin(1, user) ? items.map(item => {
    if (item.important === 1) {
        item.tags.push('important');
    }
    return {
        name: item.name,
        id: item._id,
        tags: item.tags,
        profit: item.profitIndex,
        safety: item.safetyIndex,
        management: item.managementIndex,
        index: item.index,
        type: item.type,
    };
}) : [];

export const getFitnessItem = (user, items) => items.map(item => ({
    name: item.name,
    id: item._id,
    tags: item.tags,
    price: item.price,
    count: item.count,
    desc: item.desc,
    type: item.type,
}));

export const getRankItem = (user, items) => items.map(item => ({
    name: item.name,
    id: item._id,
    tags: item.tags,
    start: item.start,
    type: item.type,
}));

export const getFileLocation = (owner, uid) => {
    const owner_S = owner.toString();
    const owner_md5 = createHash('md5').update(owner_S).digest('hex');
    const uid_S = uid.toString();
    const uid_md5 = createHash('md5').update(uid_S).digest('hex');
    return PathJoin(NAS_PREFIX(ENV_TYPE), owner_md5.substr(0, 2), owner_S, uid_md5.substr(0, 2), uid_S);
}

export const deleteFolderRecursive = path => {
    if(FsExistsSync(path)) {
        FsReaddirSync(path).forEach(file => {
            const curPath = `${path}/${file}`;
            FsLstatSync(curPath).isDirectory() ? deleteFolderRecursive(curPath) : FsUnlinkSync(curPath);
        });
        FsRmdirSync(path);
    }
}

export const SRT2VTT = (filePath, ext) => new Promise((resolve, reject) => FsReadFile(`${filePath}.${ext}`, (err,data) => err ? reject(err) : resolve(data))).then(data => (ext === 'srt') ? new Promise((resolve, reject) => FsWriteFile(`${filePath}.vtt`, `WEBVTT\n\n${bufferToString(data).replace(/,/g, '.')}`, 'utf8', err => err ? reject(err) : resolve())) : new Promise((resolve, reject) => FsWriteFile(`${filePath}.sub`, bufferToString(data), 'utf8', err => err ? reject(err) : resolve())).then(() => new Promise((resolve, reject) => {
    const subfs = FsCreateReadStream(`${filePath}.sub`);
    subfs.pipe(Ass2vtt()).pipe(FsCreateWriteStream(`${filePath}.vtt`));
    subfs.on('end', () => resolve());
})).then(() => FsUnlinkSync(`${filePath}.sub`)));

const bufferToString = buffer => {
    const charset = detectCharset(buffer).toString();
    try {
        return buffer.toString(charset);
    } catch (x) {
        return IconvDecode(buffer, charset);
    }
}

export const getJson = raw_data => {
    let json_data = null;
    try {
        json_data = JSON.parse(raw_data);
    } catch (x) {
        console.log(raw_data);
        handleError(new HoError('json parse error'));
    }
    return json_data;
}

export const torrent2Magnet = torInfo => {
    if (!torInfo.infoHash) {
        console.log('miss infoHash');
        return false;
    }
    let magnet = `magnet:?xt=urn:btih:${torInfo.infoHash}&dn=`;
    if (torInfo.announceList) {
        for (let i = 0; i < 10; i++) {
            magnet = `${magnet}&tr=${encodeURIComponent(torInfo.announceList[i])}`;
        }
    } else if (torInfo.announce) {
        for (let i = 0; i < 10; i++) {
            magnet = `${magnet}&tr=${encodeURIComponent(torInfo.announce[i])}`;
        }
    }
    return magnet;
}

export const sortList = list => {
    let current = '';
    let current_list = [];
    let sort_list = [];
    const sortFile = current_list => sort_list.concat(current_list.sort((a, b) => {
        if (!a.number) {
            return -1;
        }
        for (let i in a.number) {
            if (!b.number || !b.number[i]) {
                return 1;
            }
            if (Number(a.number[i]) !== Number(b.number[i])) {
                return Number(a.number[i]) - Number(b.number[i]);
            }
        }
        return -1;
    }).map(l => l.name));
    list.forEach(l => {
        const split = l.match(/^(.*?)([^\/]+)$/);
        if (split[1] === current) {
            current_list.push({
                name: l,
                number: split[2].match(/\d+/g),
            });
        } else {
            //只比較前面數字
            sort_list = sortFile(current_list);
            current = split[1];
            current_list = [{
                name: l,
                number: split[2].match(/\d+/g),
            }];
        }
    });
    sort_list = sortFile(current_list);
    console.log(sort_list);
    return sort_list;
}

export const completeZero = (number, offset) => {
    for (let i = 1; i < offset; i++) {
        if (number < Math.pow(10, i)) {
            for (let j = i; j < offset; j++) {
                number = `0${number}`;
            }
            break;
        }
    }
    return number;
}

export const findTag = (node, tag=null, id=null) => {
    let ret = [];
    const item = node.children ? node.children : node;
    if (!Array.isArray(item)) {
        return ret;
    }
    for (let c of item) {
        if (tag) {
            if ((c.type === 'tag' || c.type === 'script') && c.name === tag) {
                if (id) {
                    if (c.attribs && (c.attribs.class === id || c.attribs.id === id)) {
                        ret.push(c);
                    }
                } else {
                    ret.push(c);
                }
            }
        } else {
            if (c.type === 'text') {
                const str = c.data.toString().trim();
                if (str) {
                    ret.push(str);
                }
            }
            if (c.type === 'comment') {
                const str = c.data.toString().match(/^\[CDATA\[(.*)\]\]$/)[1].trim();
                if (str) {
                    ret.push(str);
                }
            }
        }
    }
    return ret;
}

export const addPre = (url, pre) => url.match(/^(https|http):\/\//) ? url : url.match(/^\//) ? `${pre}${url}` : `${pre}/${url}`;
import { ENV_TYPE } from '../../../ver'
import { API_LIMIT } from '../config'
import { API_EXPIRE, MAX_RETRY } from '../constants'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { createWriteStream as FsCreateWriteStream, statSync as FsStatSync, unlink as FsUnlink, existsSync as FsExistsSync, renameSync as FsRenameSync } from 'fs'
import { basename as PathBasename } from 'path'
import { parse as UrlParse } from 'url'
import { handleError, HoError, big5Encode } from '../util/utility'
import sendWs from '../util/sendWs'

let api_ing = 0;
let api_pool = [];
let api_duration = 0;
let api_lock = false;

const setLock = () => {
    console.log(api_lock);
    return api_lock ? new Promise((resolve, reject) => setTimeout(() => resolve(setLock()), 500)) : Promise.resolve(api_lock = true);
}

export default function(name, ...args) {
    console.log(name);
    console.log(args);
    switch (name) {
        case 'stop':
        return stopApi();
        case 'url':
        return download(false, ...args);
        case 'download':
        if (api_ing >= API_LIMIT(ENV_TYPE)) {
            console.log(`reach limit ${api_ing} ${api_pool.length}`);
            expire(name, args).catch(err => handleError(err, 'Api'));
        } else {
            api_ing++;
            console.log(`go ${api_ing} ${api_pool.length}`);
            download(...args).catch(err => handle_err(err, args[0])).then(rest => get(rest)).catch(err => handleError(err, 'Api'));
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
        default:
        return handleError(new HoError('unknown api'));
    }
}

function get(rest=null) {
    api_duration = 0;
    if (api_ing > 0) {
        api_ing--;
    }
    console.log(`get ${api_ing} ${api_pool.length}`);
    if (rest && typeof rest === 'function') {
        rest().catch(err => handleError(err, 'Api rest'));
    }
    if (api_pool.length > 0) {
        const fun = api_pool.splice(0, 1)[0];
        if (fun) {
            switch (fun.name) {
                case 'download':
                return download(...fun.args).catch(err => handle_err(err, fun.args[0])).then(rest => get(rest));
                default:
                return handleError(new HoError('unknown api')).catch(err => handleError(err, 'Api')).then(rest => get(rest));
            }
        }
    }
    console.log(`empty ${api_ing} ${api_pool.length}`);
    return Promise.resolve();
}

function handle_err(err, user) {
    handleError(err, 'Api');
    sendWs({
        type: user.username,
        data: `Api fail: ${err.message}`,
    }, 0);
}

function expire(name, args) {
    console.log(`expire ${api_ing} ${api_pool.length}`);
    return setLock().then(go => {
        if (!go) {
            return Promise.resolve();
        }
        api_pool.push({
            name,
            args,
        });
        const now = new Date().getTime()/1000;
        if (!api_duration) {
            api_duration = now;
        } else if ((now - api_duration) > API_EXPIRE) {
            api_duration = 0;
            if (api_pool.length > 0) {
                const fun = api_pool.splice(0, 1)[0];
                if (fun) {
                    api_lock = false;
                    switch (fun.name) {
                        case 'download':
                        return download(...fun.args).catch(err => handle_err(err, args[0])).then(rest => get(rest));
                        default:
                        return handleError(new HoError('unknown api')).catch(err => handleError(err, 'Api')).then(rest => get(rest));
                    }
                }
            }
        }
        api_lock = false;
        console.log(`empty ${api_ing} ${api_pool.length}`);
        return Promise.resolve();
    });
}

function stopApi() {
    api_ing = 0;
    return Promise.resolve();
}

function download(user, url, { filePath=null, is_check=true, referer=null, is_json=false, post=null, not_utf8=false, cookie=null, fake_ip=null, rest=null, errHandle=null, is_dm5=false } = {}) {
    let qspost = null;
    if (post) {
        not_utf8 ? Object.entries(post).forEach(f => qspost = qspost ? `${qspost}&${f[0]}=${big5Encode(f[1])}` : `${f[0]}=${big5Encode(f[1])}`) : qspost = QStringify(post);
    }
    const temp = `${filePath}_t`;
    const checkTmp = () => FsExistsSync(temp) ? new Promise((resolve, reject) => FsUnlink(temp, err => err ? reject(err) : resolve())) : Promise.resolve();
    let index = 0;
    const proc = () => Fetch(encodeURI(url), Object.assign({headers: Object.assign(referer ? {'Referer': referer} : {}, user ? {} : {'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36'}, cookie ? {Cookie: cookie} : {}, qspost ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': qspost.length,
        } : {}, fake_ip ? {
            'X-Forwarded-For': fake_ip,
            'Client-IP': fake_ip,
        } : {}, is_dm5 ? {'Accept-Language': 'en-US,en;q=0.9'} : {})}, post ? {
        method: 'POST',
        body: qspost,
    } : {})).then(res => {
        if (user) {
            if (!filePath) {
                return handleError(new HoError('file path empty!'), errHandle);
            }
            return checkTmp().then(() => new Promise((resolve, reject) => {
                const dest = FsCreateWriteStream(temp);
                res.body.pipe(dest);
                dest.on('finish', () => resolve());
                dest.on('error', err => reject(err));
            }).then(() => {
                if (is_check && (!res.headers['content-length'] || Number(res.headers['content-length']) !== FsStatSync(filePath)['size'])) {
                    return handleError(new HoError('incomplete download'), errHandle);
                }
                FsRenameSync(temp, filePath);
                if (rest) {
                    const filename = res.headers['content-disposition'] ? res.headers['content-disposition'].match(/^attachment; filename=[\'\"]?(.*?)[\'\"]?$/) : res.headers['_headers']['content-disposition'] ? res.headers['_headers']['content-disposition'][0].match(/^attachment; filename=[\'\"]?(.*?)[\'\"]?$/) : null;
                    const pathname = UrlParse(url).pathname;
                    return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => rest([pathname, filename ? filename[1] : PathBasename(pathname)])).catch(err => errHandle(err));
                    }
            }));
        } else if (is_json) {
            return res.json();
        } else {
            return filePath ? checkTmp().then(() => new Promise((resolve, reject) => {
                const dest = FsCreateWriteStream(temp);
                res.body.pipe(dest);
                dest.on('finish', () => resolve());
            })).then(() => FsRenameSync(temp, filePath)) : res.text();
        }
    }).catch(err => {
        if (err.code === 'HPE_INVALID_CONSTANT') {
            return handleError(err);
        }
        console.log(index);
        handleError(err, 'Fetch');
        if (++index > MAX_RETRY) {
            console.log(url);
            return handleError(new HoError('timeout'), errHandle);
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(proc()), index * 1000));
    });
    return proc();
}
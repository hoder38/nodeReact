import { ENV_TYPE } from '../../../ver'
import { API_LIMIT } from '../config'
import { API_EXPIRE, MAX_RETRY } from '../constants'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { createWriteStream as FsCreateWriteStream, statSync as FsStatSync } from 'fs'
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
        case 'url':
        return download(false, ...args);
        case 'download':
        if (api_ing >= API_LIMIT(ENV_TYPE)) {
            console.log(`reach limit ${api_ing} ${api_pool.length}`);
            expire().catch(err => handleError(err, 'Api'));
        } else {
            api_ing++;
            console.log(`go ${api_ing} ${api_pool.length}`);
            download(...args).catch(err => handle_err(err, args[0])).then(() => get()).catch(err => handleError(err, 'Api'));
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
        default:
        return Promise.reject(handleError(new HoError('unknown api')));
    }
}

function get() {
    api_duration = 0;
    if (api_ing > 0) {
        api_ing--;
    }
    console.log(`get ${api_ing} ${api_pool.length}`);
    if (api_pool.length > 0) {
        const fun = api_pool.splice(0, 1)[0];
        if (fun) {
            switch (fun.name) {
                case 'download':
                return download(...fun.args).catch(err => handle_err(err, fun.args[0])).then(() => get());
                default:
                return Promise.reject(handleError(new HoError('unknown api'))).catch(err => handleError(err, 'Api')).then(() => get());
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

function expire() {
    console.log(`expire ${api_ing} ${api_pool.length}`);
    return setLock().then(go => {
        if (!go) {
            return Promise.resolve();
        }
        api_pool.push({
            name: name,
            args: args,
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
                        return download(...fun.args).catch(err => handle_err(err, args[0])).then(() => get());
                        default:
                        return Promise.reject(handleError(new HoError('unknown api'))).catch(err => handleError(err, 'Api')).then(() => get());
                    }
                }
            }
        }
        api_lock = false;
        console.log(`empty ${api_ing} ${api_pool.length}`);
        return Promise.resolve();
    });
}

function download(is_file, url, { filePath=null, is_check=true, referer=null, is_json=false, post=null, not_utf8=false, cookie=null, fake_ip=null } = {}) {
    let qspost = null;
    if (post) {
        not_utf8 ? Object.entries(post).forEach(f => qspost = qspost ? `${qspost}&${f[0]}=${big5Encode(f[1])}` : `${f[0]}=${big5Encode(f[1])}`) : qspost = QStringify(post);
    }
    const proc = index => Fetch(url, Object.assign({headers: Object.assign(referer ? {'Referer': referer} : {}, is_file ? {} : {'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.106 Safari/537.36'}, cookie ? {Cookie: cookie} : {}, qspost ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': qspost.length,
        } : {}, fake_ip ? {
            'X-Forwarded-For': fake_ip,
            'Client-IP': fake_ip,
        } : {})}, qspost ? {
        method: 'POST',
        body: qspost,
    } : {})).then(res => {
        if (is_file) {
            if (!filePath) {
                handleError(new HoError('file path empty!'));
            }
            return new Promise((resolve, reject) => {
                const dest = FsCreateWriteStream(filePath);
                res.body.pipe(dest);
                dest.on('finish', () => {
                    if (is_check && (!res.headers['content-length'] || Number(res.headers['content-length']) !== FsStatSync(filePath)['size'])) {
                        handleError(new HoError('incomplete download'));
                    }
                    const filename = res.headers['content-disposition'] ? res.headers['content-disposition'].match(/^attachment; filename=[\'\"]?(.*?)[\'\"]?$/) : null;
                    const pathname = UrlParse(url).pathname;
                    return filename ? resolve(pathname, filename[1]) : resolve(pathname);
                }).on('error', err => reject(err));
            });
        } else if (is_json) {
            return res.json();
        } else {
            return filePath ? new Promise((resolve, reject) => {
                const dest = FsCreateWriteStream(filePath);
                res.body.pipe(dest);
                dest.on('finish', () => resolve());
            }) : res.text();
        }
    }).catch(err => {
        console.log(index);
        handleError(err, 'Fetch');
        if (index > MAX_RETRY) {
            console.log(url);
            handleError(new HoError('timeout'));
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(proc(index + 1)), index * 1000));
    });
    return proc(1);
}
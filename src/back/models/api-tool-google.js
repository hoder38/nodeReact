import { MAX_RETRY, API_EXPIRE, DRIVE_LIMIT, OATH_WAITING, DOC_TYPE, KINDLE_LIMIT, __dirname } from '../constants.js'
import { ENV_TYPE, GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT, ROOT_USER } from '../../../ver.js'
import { GOOGLE_MEDIA_FOLDER, GOOGLE_BACKUP_FOLDER, API_LIMIT, NAS_TMP, GOOGLE_DB_BACKUP_FOLDER, BACKUP_PATH } from '../config.js'
import googleapisModule from 'googleapis'
const { google: googleapis } = googleapisModule;
import Fetch from 'node-fetch'
import Youtubedl from 'youtube-dl'
import pathModule from 'path'
const { join: PathJoin } = pathModule;
import Child_process from 'child_process'
import Mkdirp from 'mkdirp'
import fsModule from 'fs'
const { existsSync: FsExistsSync, createReadStream: FsCreateReadStream, unlink: FsUnlink, renameSync: FsRenameSync, createWriteStream: FsCreateWriteStream, statSync: FsStatSync, readdirSync: FsReaddirSync, lstatSync: FsLstatSync, writeFile: FsWriteFile } = fsModule
import Mongo from '../models/mongo-tool.js'
import MediaHandleTool from '../models/mediaHandle-tool.js'
import External from '../models/external-tool.js'
import { handleError, HoError, deleteFolderRecursive, SRT2VTT, isValidString } from '../util/utility.js'
import { mediaMIME, isSub, isKindle } from '../util/mime.js'
import sendWs from '../util/sendWs.js'

const OAuth2 = googleapis.auth.OAuth2;
const oauth2Client = new OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);
let tokens = {};
let api_ing = 0;
let api_pool = [];
let api_duration = 0;
let api_lock = false;

const setLock = () => {
    console.log(api_lock);
    return api_lock ? new Promise((resolve, reject) => setTimeout(() => resolve(setLock()), 500)) : Promise.resolve(api_lock = true);
}

export default function api(name, data) {
    console.log(name);
    console.log(data);
    return checkOauth().then(() => {
        if (name.match(/^y /)) {
            return youtubeAPI(name, data);
        }
        switch (name) {
            case 'stop':
            return stopApi();
            case 'list folder':
            return list(data);
            case 'list file':
            return listFile(data);
            case 'create':
            return create(data);
            case 'delete':
            return deleteFile(data);
            case 'get':
            return getFile(data);
            case 'copy':
            return copyFile(data);
            case 'move parent':
            return moveParent(data);
            case 'send mail':
            return sendMail(data);
            case 'send name':
            return sendName(data);
            case 'upload':
            if (api_ing >= API_LIMIT(ENV_TYPE)) {
                console.log(`reach limit ${api_ing} ${api_pool.length}`);
                expire(name, data).catch(err => handleError(err, 'Google api'));
            } else {
                api_ing++;
                console.log(`go ${api_ing} ${api_pool.length}`);
                upload(data).catch(err => handle_err(err, data.user)).then(rest => get(rest)).catch(err => handleError(err, 'Google api'));
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
            case 'download':
            if (api_ing >= API_LIMIT(ENV_TYPE)) {
                console.log(`reach limit ${api_ing} ${api_pool.length}`);
                expire(name, data).catch(err => handleError(err, 'Google api'));
            } else {
                api_ing++;
                console.log(`go ${api_ing} ${api_pool.length}`);
                download(data).catch(err => handle_err(err, data.user)).then(rest => get(rest)).catch(err => handleError(err, 'Google api'));
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
            case 'download media':
            if (api_ing >= API_LIMIT(ENV_TYPE)) {
                console.log(`reach limit ${api_ing} ${api_pool.length}`);
                expire(name, data).catch(err => handleError(err, 'Google api'));
            } else {
                api_ing++;
                console.log(`go ${api_ing} ${api_pool.length}`);
                downloadMedia(data).catch(err => handle_err(err, data.user)).then(rest => get(rest)).catch(err => handleError(err, 'Google api'));
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
            case 'download present':
            if (api_ing >= API_LIMIT(ENV_TYPE)) {
                console.log(`reach limit ${api_ing} ${api_pool.length}`);
                expire(name, data).catch(err => handleError(err, 'Google api'));
            } else {
                api_ing++;
                console.log(`go ${api_ing} ${api_pool.length}`);
                downloadPresent(data).catch(err => handle_err(err, data.user)).then(rest => get(rest)).catch(err => handleError(err, 'Google api'));
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
            case 'download doc':
            if (api_ing >= API_LIMIT(ENV_TYPE)) {
                console.log(`reach limit ${api_ing} ${api_pool.length}`);
                expire(name, data).catch(err => handleError(err, 'Google api'));
            } else {
                api_ing++;
                console.log(`go ${api_ing} ${api_pool.length}`);
                downloadDoc(data).catch(err => handle_err(err, data.user)).then(rest => get(rest)).catch(err => handleError(err, 'Google api'));
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 500));
            default:
            return handleError(new HoError('unknown api'));
        }
    });
}

function handle_err(err, user) {
    handleError(err, 'Google api');
    sendWs({
        type: user.username,
        data: `Google api fail: ${err.message}`,
    }, 0);
}

function get(rest=null) {
    api_duration = 0;
    if (api_ing > 0) {
        api_ing--;
    }
    console.log(`get google ${api_ing} ${api_pool.length}`);
    if (rest && typeof rest === 'function') {
        rest().catch(err => handleError(err, 'Google api rest'));
    }
    if (api_pool.length > 0) {
        const fun = api_pool.splice(0, 1)[0];
        if (fun) {
            switch (fun.name) {
                case 'upload':
                return upload(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                case 'download':
                return download(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                case 'download media':
                return downloadMedia(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                case 'download present':
                return downloadPresent(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                case 'download doc':
                return downloadDoc(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                default:
                return handleError(new HoError('unknown google api')).catch(err => handleError(err, 'Google api')).then(rest => get(rest));
            }
        }
    }
    console.log(`empty google ${api_ing} ${api_pool.length}`);
    return Promise.resolve();
}

function expire(name, data) {
    console.log(`expire google ${api_ing} ${api_pool.length}`);
    return setLock().then(go => {
        if (!go) {
            return Promise.resolve();
        }
        api_pool.push({
            name,
            data,
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
                        case 'upload':
                        return upload(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                        case 'download':
                        return download(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                        case 'download media':
                        return downloadMedia(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                        case 'download present':
                        return downloadPresent(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                        case 'download doc':
                        return downloadDoc(fun.data).catch(err => handle_err(err, fun.data.user)).then(rest => get(rest));
                        default:
                        return handleError(new HoError('unknown google api')).catch(err => handleError(err, 'Google api')).then(rest => get(rest));
                    }
                }
            }
        }
        api_lock = false;
        console.log(`empty google ${api_ing} ${api_pool.length}`);
        return Promise.resolve();
    });
}

const checkOauth = () => (!tokens.access_token || !tokens.expiry_date) ? Mongo('find', 'accessToken', {api: 'google'}, {limit: 1}).then(token => {
    if (token.length === 0) {
        return handleError(new HoError('can not find token'));
    }
    console.log('first');
    tokens = token[0];
    console.log(tokens);
}).then(() => setToken()) : setToken();

const setToken = () => {
    oauth2Client.setCredentials(tokens);
    return tokens.expiry_date < (Date.now() + 600000) ? new Promise((resolve, reject) => oauth2Client.refreshAccessToken((err, refresh_tokens)=> err ? reject(err) : resolve(refresh_tokens))).then(token => Mongo('update', 'accessToken', {api: 'google'}, {$set: token}).then(result => {
        console.log('expire');
        console.log(result);
        console.log(token);
        tokens = token;
        oauth2Client.setCredentials(tokens);
    })) : Promise.resolve();
}

//need utf8 ansi
function sendMail(data) {
    if (!data['name'] || !data['filePath'] || !data['kindle']) {
        return handleError(new HoError('mail parameter lost!!!'));
    }
    if (!isKindle(data['name'])) {
        return handleError(new HoError('Unsupported kindle format!!!'));
    }
    if (!FsExistsSync(data['filePath'])) {
        return handleError(new HoError('file not exist!!!'));
    }
    if (FsStatSync(data['filePath'])['size'] > KINDLE_LIMIT) {
        return handleError(new HoError('file too large!!!'));
    }
    const gmail = googleapis.gmail({
        version: 'v1',
        auth: oauth2Client,
    });
    const temp = `${NAS_TMP(ENV_TYPE)}/kindle${new Date().getTime()}`;
    return new Promise((resolve, reject) => FsWriteFile(temp, [
        'Content-Type: multipart/mixed; boundary="foo_bar_baz"\r\n',
        'MIME-Version: 1.0\r\n',
        'From: me\r\n',
        `To: ${data['kindle']}\r\n`,
        'Subject: Kindle\r\n\r\n',
        '--foo_bar_baz\r\n',
        'Content-Type: text/plain; charset="UTF-8"\r\n',
        'MIME-Version: 1.0\r\n',
        'Content-Transfer-Encoding: 7bit\r\n\r\n',
        'book\r\n\r\n',
        '--foo_bar_baz\r\n',
        'Content-Type: */*\r\n',
        'MIME-Version: 1.0\r\n',
        'Content-Transfer-Encoding: base64\r\n',
        `Content-Disposition: attachment; filename="${data['name']}"\r\n\r\n`,
    ].join(''), err => err ? reject(err) : resolve())).then(() => new Promise((resolve, reject) => {
        const dest = FsCreateWriteStream(temp, {flags: 'a'});
        FsCreateReadStream(data['filePath'], 'base64').pipe(dest);
        dest.on('finish', () => resolve()).on('error', err => reject(err));
    })).then(() => new Promise((resolve, reject) => gmail.users.messages.send({
        userId: 'me',
        media: {
            mimeType: 'message/rfc822',
            body: FsCreateReadStream(temp),
        },
    }, err => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve()))).then(() => new Promise((resolve, reject) => FsUnlink(temp, err => err ? reject(err) : resolve())));
}

function sendName(data) {
    if (!data['text'] || !data['mail'] || !data['title']) {
        return handleError(new HoError('mail parameter lost!!!'));
    }
    if (!isValidString(data['mail'], 'email')) {
        return handleError(new HoError('invalid email!!!'));
    }
    data['name'] = data['append'] ? `${Buffer.from(data['text'], 'base64')} ${data['append']}` : Buffer.from(data['text'], 'base64');
    const subject = data['append'] ? `${data['title']} ${data['append']}` : data['title'];
    //console.log(data['text']);
    const gmail = googleapis.gmail({
        version: 'v1',
        auth: oauth2Client,
    });
    return new Promise((resolve, reject) => gmail.users.messages.send({
        userId: 'me',
        media: {
            mimeType: 'message/rfc822',
            body: [
                'Content-Type: multipart/mixed; boundary="foo_bar_baz"\r\n',
                'MIME-Version: 1.0\r\n',
                'From: me\r\n',
                `To: ${data['mail']}\r\n`,
                `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=\r\n\r\n`,
                '--foo_bar_baz\r\n',
                'Content-Type: text/plain; charset="UTF-8"\r\n',
                'MIME-Version: 1.0\r\n',
                'Content-Transfer-Encoding: 7bit\r\n\r\n',
                `${data['text']}\r\n\r\n`,
                '--foo_bar_baz\r\n',
            ].join(''),
        },
    }, err => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve()));
}

function youtubeAPI(method, data) {
    const youtube = googleapis.youtube({
        version: 'v3',
        auth: oauth2Client,
    });
    switch (method) {
        case 'y search':
        if (!data['order'] || !data['maxResults'] || !data['type']) {
            return handleError(new HoError('search parameter lost!!!'));
        }
        if (data['id_arr'] && data['id_arr'].length > 0) {
            data['maxResults'] = (data['id_arr'].length > 20) ? 0 : data['maxResults'] - data['id_arr'].length;
        }
        let type = '';
        switch (data['type']) {
            case 1:
            case 2:
            type = 'video';
            break;
            case 10:
            case 20:
            type = 'playlist';
            break;
            default:
            type = 'video,playlist';
            break;
        }
        return new Promise((resolve, reject) => youtube.search.list(Object.assign({
            part: 'id',
            maxResults: data['maxResults'],
            order: data['order'],
            type: type,
        }, data['keyword'] ? {q: data['keyword']} : {}, data['channelId'] ? {channelId: data['channelId']} : {}, data['pageToken'] ? {pageToken: data['pageToken']} : {}), (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata))).then(metadata => {
            if (!metadata.items) {
                return handleError(new HoError('search error'));
            }
            let video_id = new Set();
            let playlist_id = new Set();
            if (metadata.items.length > 0 || (data.id_arr && data.id_arr.length > 0) || (data.pl_arr && data.pl_arr.length > 0)) {
                if (data.id_arr) {
                    video_id = new Set(data.id_arr);
                }
                if (data.pl_arr) {
                    playlist_id = new Set(data.pl_arr[i]);
                }
                metadata.items.forEach(i => {
                    if (i.id) {
                        if (i.id.videoId) {
                            video_id.add(i.id.videoId);
                        } else if (i.id.playlistId) {
                            playlist_id.add(i.id.playlistId);
                        }
                    }
                });
            }
            return {
                type: data['type'],
                video: [...video_id].join(','),
                playlist: [...playlist_id].join(','),
                nextPageToken: metadata.nextPageToken,
            };
        });
        case 'y video':
        if (!data['id']) {
            return [];
        }
        return new Promise((resolve, reject) => youtube.videos.list({
            part: 'snippet,statistics',
            id: data['id'],
        }, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata.items)));
        case 'y channel':
        if (!data['id']) {
            return handleError(new HoError('channel parameter lost!!!'));
        }
        return new Promise((resolve, reject) => youtube.channels.list({
            part: 'snippet, brandingSettings',
            id: data['id'],
        }, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata)));
        case 'y playlist':
        if (!data['id']) {
            return [];
        }
        return new Promise((resolve, reject) => youtube.playlists.list({
            part: 'snippet',
            id: data['id'],
        }, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata.items)));
        case 'y playItem':
        if (!data['id']) {
            return handleError(new HoError('playItem parameter lost!!!'));
        }
        return new Promise((resolve, reject) => youtube.playlistItems.list(Object.assign({
            part: 'snippet',
            playlistId: data['id'],
            maxResults: 20
        }, data['pageToken'] ? {pageToken: data['pageToken']} : {}), (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve([
            metadata.items.map(i => ({
                id: `you_${i.snippet.resourceId.videoId}`,
                index: i.snippet.position + 1,
                showId: i.snippet.position + 1,
            })),
            metadata.pageInfo.totalResults,
            metadata.nextPageToken,
            metadata.prevPageToken,
        ])));
        default:
        console.log(method);
        return handleError(new HoError('youtube api unknown!!!'));
    }
}

function upload(data) {
    if (!data['type'] || !data['name'] || (!data['filePath'] && !data['body'])) {
        return handleError(new HoError('upload parameter lost!!!'), data['errhandle']);
    }
    let parent = {};
    let mimeType = '*/*';
    switch (data['type']) {
        case 'media':
        parent = {id: GOOGLE_MEDIA_FOLDER(ENV_TYPE)};
        mimeType = mediaMIME(data['name']);
        if (!mimeType) {
            return handleError(new HoError('upload mime type unknown!!!'), data['errhandle']);
        }
        break;
        case 'backup':
        parent = {id: GOOGLE_BACKUP_FOLDER(ENV_TYPE)};
        break;
        case 'auto':
        parent = {id: data['parent']};
        mimeType = mediaMIME(data['name']);
        if (!mimeType) {
            mimeType = 'text/plain';
        }
        break;
        default:
        return handleError(new HoError('upload type unknown!!!'), data['errhandle']);
    }
    let param = data['filePath'] ? {
        resource: {
            title: data['name'],
            mimeType,
            parents: [parent],
        },
        media: {
            mimeType,
            body: FsCreateReadStream(data['filePath']),
        },
    } : {
        resource: {
            title: data['name'],
            mimeType: 'text/plain',
            parents: [parent],
        },
        media: {
            mimeType: 'text/plain',
            body: data['body'],
        },
    }
    if (data['convert'] && data['convert'] === true) {
        param['convert'] = true;
    }
    let index = 0;
    const proc = () => new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.insert(param, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata))).then(metadata => {
        console.log(metadata);
        if (data['rest']) {
            return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest'](metadata.data)).catch(err => data['errhandle'](err));
        }
    }).catch(err => {
        console.log(index);
        handleError(err, 'google upload');
        if (++index > MAX_RETRY) {
            console.log(data);
            return handleError(err, data['errhandle']);
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(checkOauth()), index * 1000)).then(() => proc());
    });
    return proc();
}

function stopApi() {
    api_ing = 0;
    return Promise.resolve();
}

function list(data) {
    if (!data['folderId']) {
        return handleError(new HoError('list parameter lost!!!'));
    }
    const find_name = data['name'] ? ` and title = '${data['name']}'` : '';
    let index = 0;
    const proc = () => new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.list({
        q: `'${data['folderId']}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'${find_name}`,
        maxResults: data['max'] ? data['max'] : DRIVE_LIMIT,
    }, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata))).then(metadata => {
        if (metadata && metadata.data && metadata.data.items) {
            return metadata.data.items;
        } else {
            console.log('drive empty');
            console.log(metadata);
            console.log(index);
            return (++index > MAX_RETRY) ? [] : new Promise((resolve, reject) => setTimeout(() => resolve(proc()), 3000));
        }
    });
    return proc(1);
}

function listFile(data) {
    if (!data['folderId']) {
        return handleError(new HoError('list parameter lost!!!'));
    }
    if (data['max']) {
        max = data['max'];
    }
    let index = 0;
    const proc = index => new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.list({
        q: `'${data['folderId']}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        maxResults: data['max'] ? data['max'] : DRIVE_LIMIT,
    }, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata))).then(metadata => metadata.data.items).catch(err => (err.code == '401') ? (++index > MAX_RETRY) ? handleError(err) : new Promise((resolve, reject) => setTimeout(() => resolve(proc()), OATH_WAITING * 1000)) : handleError(err));
    return proc();
}

function create(data) {
    if (!data['name'] || !data['parent']) {
        return handleError(new HoError('create parameter lost!!!'));
    }
    return new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.insert({resource: {
        title: data['name'],
        mimeType: 'application/vnd.google-apps.folder',
        parents: [{id: data['parent']}],
    }}, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata.data)));
}

function download(data) {
    if (!data['url'] || !data['filePath']) {
        return handleError(new HoError('download parameter lost!!!'), data['errhandle']);
    }
    const temp = `${data['filePath']}_t`;
    const checkTmp = () => FsExistsSync(temp) ? new Promise((resolve, reject) => FsUnlink(temp, err => err ? reject(err) : resolve())) : Promise.resolve();
    let index = 0;
    const proc = () => Fetch(data['url'], {headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${oauth2Client.credentials.access_token}`,
    }}).then(res => checkTmp().then(() => new Promise((resolve, reject) => {
        const dest = FsCreateWriteStream(temp);
        res.body.pipe(dest);
        dest.on('finish', () => resolve());
        dest.on('error', err => reject(err));
    })).then(() => {
        FsRenameSync(temp, data['filePath']);
        if (res.headers.get('content-length') && Number(res.headers.get('content-length')) !== FsStatSync(data['filePath'])['size']) {
            return handleError(new HoError('incomplete download'));
        }
        if (data['rest']) {
            return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest']()).catch(err => data['errhandle'](err));
        }
    })).catch(err => {
        console.log(index);
        handleError(err, 'Google Fetch');
        if (++index > MAX_RETRY) {
            console.log(data['url']);
            return handleError(new HoError('timeout'), data['errhandle']);
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(proc()), index * 1000));
    });
    return proc();
}

function deleteFile(data) {
    if (!data['fileId']) {
        return handleError(new HoError('delete parameter lost!!!'));
    }
    return new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.trash({fileId: data['fileId']}, err => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve()));
}

function getFile(data) {
    if (!data['fileId']) {
        return handleError(new HoError('get parameter lost!!!'));
    }
    return new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.get({fileId: data['fileId']}, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata.data ? metadata.data : metadata)));
}

function copyFile(data) {
    if (!data['fileId']) {
        return handleError(new HoError('copy parameter lost!!!'));
    }
    return new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.copy({fileId: data['fileId']}, (err, metadata) => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve(metadata.data ? metadata.data : metadata)));
}

function moveParent(data) {
    if (!data['fileId'] || !data['rmFolderId'] || !data['addFolderId']) {
        return handleError(new HoError('move parent parameter lost!!!'));
    }
    return new Promise((resolve, reject) => googleapis.drive({
        version: 'v2',
        auth: oauth2Client,
    }).files.patch({
        fileId: data['fileId'],
        removeParents: data['rmFolderId'],
        addParents: data['addFolderId'],
    }, err => (err && err.code !== 'ECONNRESET') ? reject(err) : resolve()));
}

function downloadMedia(data) {
    if (!data['key'] || !data['filePath']) {
        return handleError(new HoError('get parameter lost!!!'), data['errhandle']);
    }
    let index = 0;
    const proc = () => new Promise((resolve, reject) => Youtubedl.exec(`https://drive.google.com/open?id=${data['key']}`, ['-F'], {maxBuffer: 10 * 1024 * 1024}, (err, output) => err ? reject(err) : resolve(output))).then(output => {
        let info = [];
        for (let i of output) {
            const row = i.match(/^(\d+)\s+mp4\s+\d+x(\d+)/);
            if (row) {
                info.push({
                    id: row[1],
                    height: row[2],
                });
            }
        }
        console.log(info);
        let media_id = null;
        let currentHeight = 0;
        for (let i in info) {
            if (info[i].height >= (data['hd'] * 0.7)) {
                if (info[i].height > currentHeight) {
                    media_id = info[i].id;
                    currentHeight = +info[i].height;
                }
            }
        }
        console.log(media_id);
        if (!media_id) {
            return handleError(new HoError('quality low'));
        }
        const getSavePath = () => FsExistsSync(data['filePath']) ? FsExistsSync(`${data['filePath']}_t`) ? new Promise((resolve, reject) => FsUnlink(`${data['filePath']}_t`, err => err ? reject(err) : resolve(`${data['filePath']}_t`))) : Promise.resolve(`${data['filePath']}_t`) : Promise.resolve(data['filePath']);
        return getSavePath().then(savePath => new Promise((resolve, reject) => Youtubedl.exec(`https://drive.google.com/open?id=${data['key']}`, [`--format=${media_id}`, '-o', savePath, '--write-thumbnail'], {maxBuffer: 10 * 1024 * 1024}, (err, output) => err ? reject(err) : resolve(output))).then(output => {
            console.log(output);
            const clearPath = () => savePath === data['filePath'] ? Promise.resolve() : new Promise((resolve, reject) => FsUnlink(data['filePath'], err => err ? reject(err) : resolve())).then(() => FsRenameSync(savePath, data['filePath']));
            return clearPath().then(() => {
                if (FsExistsSync(`${savePath}.jpg`)) {
                    FsRenameSync(`${savePath}.jpg`, `${data['filePath']}_s.jpg`);
                }
                if (data['rest']) {
                    return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest'](currentHeight)).catch(err => data['errhandle'](err));
                }
            });
        }));
    }).catch(err => {
        console.log(index);
        handleError(err, 'Youtubedl Fetch');
        if (++index > MAX_RETRY) {
            console.log(data['key']);
            return handleError(new HoError('timeout'), data['errhandle']);
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(proc()), Math.pow(2, index) * 40 * 1000));
    });
    return proc();
}

function downloadPresent(data) {
    if (!data['exportlink'] || !data['alternate'] || !data['filePath']) {
        return handleError(new HoError('get parameter lost!!!'), data['errhandle']);
    }
    let number = 0;
    const present_html = `${data['filePath']}_b.htm`;
    return download({
        url: data['alternate'],
        filePath: present_html,
    }).then(() => {
        const exportlink = data['exportlink'].replace('=pdf', '=svg&pageid=p');
        const dir = `${data['filePath']}_present`;
        const presentDir = () => FsExistsSync(dir) ? Promise.resolve() : Mkdirp(dir);
        const recur_present = () => new Promise((resolve, reject) => Child_process.exec(`grep -o "12,\\\"p[0-9][0-9]*\\\",${number},0" ${present_html}`, (err, output) => err ? reject(err) : resolve(output))).then(output => {
            console.log(output);
            number++;
            const pageid = output.match(/\"p(\d+)\"/);
            if (!pageid) {
                return handleError(new HoError('can not find present'));
            }
            return download({
                url: `${exportlink}${pageid[1]}`,
                filePath: `${dir}/${number}.svg`,
            }).then(() => recur_present());
        });
        return presentDir().then(() => recur_present());
    }).catch(err => {
        if (number > 0) {
            handleError(err, 'Google Present');
            if (data['rest']) {
                return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest'](number)).catch(err => data['errhandle'](err));
            }
        } else {
            return handleError(err, data['errhandle']);
        }
    });
}

function downloadDoc(data) {
    if (!data['exportlink'] || !data['filePath']) {
        return handleError(new HoError('get parameter lost!!!'), data['errhandle']);
    }
    const zip = `${data['filePath']}.zip`;
    return download({
        url: data['exportlink'].replace('=pdf', '=zip'),
        filePath: zip,
    }).then(() => {
        if (!FsExistsSync(zip)) {
            return handleError(new HoError('cannot find zip'));
        }
        const dir = `${data['filePath']}_doc`;
        const docDir = () => FsExistsSync(dir) ? Promise.resolve() : Mkdirp(dir);
        return docDir().then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), 5000))).then(() => new Promise((resolve, reject) => Child_process.exec(`${PathJoin(__dirname, 'util/myuzip.py')} ${zip} ${dir}`, (err, output) => err ? reject(err) : resolve(output)))).then(output => new Promise((resolve, reject) => FsUnlink(zip, err => err ? reject(err) : resolve()))).then(() => {
            let doc_index = 1;
            if(FsExistsSync(dir)) {
                FsReaddirSync(dir).forEach((file,index) => {
                    const curPath = `${dir}/${file}`;
                    if(!FsLstatSync(curPath).isDirectory()) {
                        for (doc_index; doc_index < 100;doc_index++) {
                            if (doc_index === 1) {
                                const first = `${dir}/doc.html`;
                                if (!FsExistsSync(first)) {
                                    FsRenameSync(curPath, first);
                                    break;
                                }
                            } else {
                                const other = `${dir}/doc${doc_index}.html`;
                                if (!FsExistsSync(other)) {
                                    FsRenameSync(curPath, other);
                                    break;
                                }
                            }
                        }
                    }
                });
            }
            if (data['rest']) {
                return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest'](doc_index)).catch(err => data['errhandle'](err));
            }
        });
    });
}

export function googleBackup(user, id, name, filePath, tags, recycle, append='') {
    switch (recycle) {
        case 1:
        return api('upload', {
            user,
            type: 'backup',
            name: `${id}.${name}`,
            filePath: `${filePath}${append}`,
        });
        case 2:
        return FsExistsSync(`${filePath}.srt`) ? api('upload', {
            user,
            type: 'backup',
            name: `${id}.${name}.srt`,
            filePath: `${filePath}.srt`,
        }) : FsExistsSync(`${filePath}.ass`) ? api('upload', {
            user: user,
            type: 'backup',
            name: `${id}.${name}.ass`,
            filePath: `${filePath}.ass`,
        }) : FsExistsSync(`${filePath}.ssa`) ? api('upload', {
            user,
            type: 'backup',
            name: `${id}.${name}.ssa`,
            filePath: `${filePath}.ssa`,
        }) : Promise.resolve();
        case 3:
        return api('upload', {
            user,
            type: 'backup',
            name: `${id}.${name}.txt`,
            body: tags.toString(),
        });
        default:
        return handleError(new HoError(`recycle ${recycle} denied!!!`));
    }
}

export function googleDownloadSubtitle(url, filePath) {
    const sub_location = `${filePath}_sub/youtube`;
    console.log(sub_location);
    const mkfolder = () => FsExistsSync(sub_location) ? Promise.resolve() : Mkdirp(sub_location);
    return mkfolder().then(() => new Promise((resolve, reject) => Youtubedl.getSubs(url, {
            auto: true,
            all: false,
            lang: 'zh-TW,zh-Hant,zh-CN,zh-Hans,zh-HK,zh-SG,en',
            cwd: sub_location,
        }, (err, info) => err ? reject(err) : resolve(info))).then(info => {
        let choose = null;
        let en = null;
        let pri = 0;
        FsReaddirSync(sub_location).forEach(file => {
            const sub_match = file.match(/\.([a-zA-Z\-]+)\.[a-zA-Z]{3}$/);
            if (sub_match) {
                switch (sub_match[1]) {
                    case 'zh-TW':
                    if (pri < 7) {
                        pri = 7;
                        choose = file;
                    }
                    break;
                    case 'zh-Hant':
                    if (pri < 6) {
                        pri = 6;
                        choose = file;
                    }
                    break;
                    case 'zh-CN':
                    if (pri < 5) {
                        pri = 5;
                        choose = file;
                    }
                    break;
                    case 'zh-Hans':
                    if (pri < 4) {
                        pri = 4;
                        choose = file;
                    }
                    break;
                    case 'zh-HK':
                    if (pri < 3) {
                        pri = 3;
                        choose = file;
                    }
                    break;
                    case 'zh-SG':
                    if (pri < 2) {
                        pri = 2;
                        choose = file;
                    }
                    break;
                    case 'en':
                    en = file;
                    break;
                }
            }
        });
        if (!choose && !en) {
            return handleError(new HoError('sub donot have chinese and english!!!'));
        }
        const preSub = (sub, lang) => {
            if (sub) {
                const sub_ext = isSub(sub);
                if (sub_ext) {
                    if (FsExistsSync(`${filePath}${lang}.srt`)) {
                        FsRenameSync(`${filePath}${lang}.srt`, `${filePath}${lang}.srt1`);
                    }
                    if (FsExistsSync(`${filePath}${lang}.ass`)) {
                        FsRenameSync(`${filePath}${lang}.ass`, `${filePath}${lang}.ass1`);
                    }
                    if (FsExistsSync(`${filePath}${lang}.ssa`)) {
                        FsRenameSync(`${filePath}${lang}.ssa`, `${filePath}${lang}.ssa1`);
                    }
                }
                return sub_ext;
            } else {
                return false;
            }
        }
        const ext = preSub(choose, '');
        const en_ext = preSub(en, '.en');
        if (!ext && !en_ext) {
            return handleError(new HoError('sub ext not support!!!'));
        }
        const renameSub = (sub, lang, sub_ext) => {
            if (sub_ext) {
                FsRenameSync(`${sub_location}/${sub}`, `${filePath}${lang}.${sub_ext}`);
                return (sub_ext === 'vtt') ? Promise.resolve() : SRT2VTT(`${filePath}}${lang}`, sub_ext);
            } else {
                return Promise.resolve();
            }
        }
        return renameSub(choose, '', ext).then(() => renameSub(en, '.en', en_ext).then(() => deleteFolderRecursive(sub_location)));
    }));
}

export function userDrive(userlist, index, drive_batch=DRIVE_LIMIT) {
    console.log('userDrive');
    console.log(new Date().toLocaleString());
    console.log(userlist[index].username);
    let folderlist = [{
        id: userlist[index].auto,
        title: 'drive upload',
    }];
    let dirpath = [];
    let is_root = true;
    let uploaded = null;
    let handling = null;
    let file_count = 0;
    const getFolder = data => api('list folder', data).then(folder_metadataList => {
        if (is_root) {
            let templist = [];
            folder_metadataList.forEach(i => {
                if (i.title !== 'uploaded' && i.title !== 'downloaded' && i.title !== 'handling') {
                    templist.push(i);
                }
            });
            folder_metadataList = templist;
        }
        if (folder_metadataList.length > 0) {
            folderlist.push({id:null});
            folderlist = folderlist.concat(folder_metadataList);
        } else {
            dirpath.pop();
        }
        is_root = false;
        return getDriveList();
    });
    return getDriveList().then(() => {
        index++;
        if (index < userlist.length) {
            return userDrive(userlist, index);
        }
    });
    function getDriveList() {
        let current = folderlist.pop();
        while (folderlist.length !== 0 && !current.id) {
            dirpath.pop();
            current = folderlist.pop();
        }
        if (!current || !current.id) {
            return Promise.resolve();
        }
        dirpath.push(current.title);
        const data = {folderId: current.id};
        return api('list file', data).then(metadataList => {
            if (metadataList.length > 0) {
                sendWs(metadataList.reduce((a, v) => `${a} ${v.title}`, `${userlist[index].username}: `), 0, 0, true);
            }
            if (metadataList.length > 0) {
                if (metadataList.length > (drive_batch - file_count)) {
                    metadataList.splice(drive_batch - file_count);
                }
                const getUpload = () => uploaded ? Promise.resolve() : api('list folder', {
                    folderId: userlist[index].auto,
                    name: 'uploaded',
                }).then(uploadedList =>  {
                    if (uploadedList.length < 1 ) {
                        return handleError(new HoError('do not have uploaded folder!!!'));
                    }
                    uploaded = uploadedList[0].id;
                });
                const getHandle = () => handling ? Promise.resolve() : api('list folder', {
                    folderId: userlist[index].auto,
                    name: 'handling',
                }).then(handlingList =>  {
                    if (handlingList.length < 1 ) {
                        return handleError(new HoError('do not have handling folder!!!'));
                    }
                    handling = handlingList[0].id;
                });
                return getUpload().then(() => getHandle()).then(() => MediaHandleTool.singleDrive(metadataList, 0, userlist[index], data['folderId'], uploaded, handling, dirpath).then(() => {
                    file_count += metadataList.length;
                    return (file_count < drive_batch) ? getFolder(data) : Promise.resolve();
                }));
            } else {
                return getFolder(data);
            }
        });
    }
}

export function autoDoc(userlist, index, type, date=null) {
    console.log('autoDoc');
    console.log(new Date().toLocaleString());
    console.log(userlist[index].username);
    date = date ? date : new Date();
    if (!DOC_TYPE.hasOwnProperty(type)) {
        return handleError(new HoError('do not have this country!!!'));
    }
    let downloaded = null;
    let downloaded_data = {
        folderId: userlist[index].auto,
        name: 'downloaded',
    };
    return api('list folder', downloaded_data).then(downloadedList => {
        if (downloadedList.length < 1) {
            return handleError(new HoError('do not have downloaded folder!!!'));
        }
        downloaded = downloadedList[0].id;
        const download_ext_doc = (tIndex, doc_type) => External.getSingleList(doc_type[tIndex], date).then(doclist => {
            console.log(doclist);
            if (doclist.length > 0) {
                sendWs(doclist.reduce((a, v) => `${a} ${v.name}`, `${doc_type[tIndex]}: `), 0, 0, true);
            }
            const recur_download = dIndex => {
                const single_download = () => (dIndex < doclist.length) ? External.save2Drive(doc_type[tIndex], doclist[dIndex], downloaded) : Promise.resolve();
                return single_download().then(() => {
                    dIndex++;
                    if (dIndex < doclist.length) {
                        return recur_download(dIndex);
                    } else {
                        tIndex++;
                        if (tIndex < doc_type.length) {
                            return download_ext_doc(tIndex, doc_type);
                        } else {
                            index++;
                            if (index < userlist.length) {
                                return autoDoc(userlist, index, type, date);
                            }
                        }
                    }
                });
            }
            return recur_download(0);
        });
        return download_ext_doc(0, DOC_TYPE[type]).then(() => {
            index++;
            if (index < userlist.length) {
                autoDoc(userlist, index, type, date);
            }
        });
    });
}

export const sendPresentName = (text, mail, append=null) => api('send name', {title: 'Christmas Presents Exchange', text, mail, append});

export const sendLotteryName = (title, text, mail) => api('send name', {title, text: text, mail});

export const googleBackupWhole = backupName => api('upload', {
    user: ROOT_USER,
    type: 'auto',
    parent: GOOGLE_DB_BACKUP_FOLDER(ENV_TYPE),
    name: backupName,
    filePath: `${BACKUP_PATH(ENV_TYPE)}/${backupName}`,
}).then(() => sendWs(`whole backup: ${backupName}, please clean up previous backup`, 0, 0, true));

export const googleBackupDb = backupDate => api('create', {name: backupDate, parent: GOOGLE_DB_BACKUP_FOLDER(ENV_TYPE)}).then(metadata => {
    const backup_collection = [];
    FsReaddirSync(`${BACKUP_PATH(ENV_TYPE)}/${backupDate}`).forEach((file,index) => {
        const list = [];
        FsReaddirSync(`${BACKUP_PATH(ENV_TYPE)}/${backupDate}/${file}`).forEach((file1,index1) => list.push(file1));
        backup_collection.push({
            name: file,
            path: `${BACKUP_PATH(ENV_TYPE)}/${backupDate}/${file}`,
            list,
        });
    });
    const create_collection = index => {
        if (index >= backup_collection.length) {
            console.log(backup_collection);
            return upload_db(0, 0);
        }
        return api('create', {name: backup_collection[index].name, parent: metadata.id}).then(metadata2 => {
            backup_collection[index].id = metadata2.id;
            return create_collection(index+1);
        });
    }
    const upload_db = (index, index2) => {
        if (index >= backup_collection.length) {
            return Promise.resolve();
        }
        if (index2 >= backup_collection[index].list.length) {
            return upload_db(index + 1, 0);
        }
        return api('upload', {
            user: ROOT_USER,
            type: 'auto',
            parent: backup_collection[index].id,
            name: backup_collection[index].list[index2],
            filePath: `${backup_collection[index].path}/${backup_collection[index].list[index2]}`,
        }).then(() => {
            sendWs(`db backup: ${backup_collection[index].name}/${backup_collection[index].list[index2]} backupDate`, 0, 0, true);
            return upload_db(index, index2 + 1);
        });
    }
    return create_collection(0);
});
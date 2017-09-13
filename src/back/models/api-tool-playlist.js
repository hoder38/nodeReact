import { ENV_TYPE } from '../../../ver'
import { TORRENT_LIMIT, ZIP_LIMIT, MEGA_LIMIT, NAS_TMP } from '../config'
import { TORRENT_CONNECT, TORRENT_UPLOAD, STORAGEDB, TORRENT_DURATION, ZIP_DURATION, MEGA_DURATION } from '../constants'
import { existsSync as FsExistsSync, unlink as FsUnlink, createReadStream as FsCreateReadStream, createWriteStream as FsCreateWriteStream, statSync as FsStatSync, renameSync as FsRenameSync, readdirSync as FsReaddirSync, lstatSync as FsLstatSync } from 'fs'
import { basename as PathBasename, join as PathJoin, dirname as PathDirname } from 'path'
import Child_process from 'child_process'
import TorrentStream from 'torrent-stream'
import Mkdirp from 'mkdirp'
import OpenSubtitle from 'opensubtitles-api'
import Mongo from '../models/mongo-tool'
import Api from './api-tool'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool'
import { handleError, handleReject, HoError, getFileLocation, checkAdmin, SRT2VTT, deleteFolderRecursive, sortList } from '../util/utility'
import { isVideo, isDoc, isZipbook, extType, extTag } from '../util/mime'
import { computeHash } from '../util/os-torrent-hash.js'
import sendWs from '../util/sendWs'

let torrent_pool = [];
let zip_pool = [];
let mega_pool = [];
let torrent_lock = false;
let zip_lock = false;
let mega_lock = false;

const setLock = type => {
    switch (type) {
        case 'torrent':
        console.log(torrent_lock);
        return torrent_lock ? new Promise((resolve, reject) => setTimeout(() => resolve(setLock(type)), 500)) : Promise.resolve(torrent_lock = true);
        case 'zip':
        console.log(zip_lock);
        return zip_lock ? new Promise((resolve, reject) => setTimeout(() => resolve(setLock(type)), 500)) : Promise.resolve(zip_lock = true);
        case 'mega':
        console.log(mega_lock);
        return mega_lock ? new Promise((resolve, reject) => setTimeout(() => resolve(setLock(type)), 500)) : Promise.resolve(mega_lock = true);
        default:
        console.log('unknown lock');
        return Promise.resolve(false);
    }
}

const megaGet = (rest=null) => setLock('mega').then(go => {
    if (!go) {
        return Promise.resolve();
    }
    console.log('mega get');
    if (rest && typeof rest === 'function') {
        rest().catch(err => handleError(err, 'Mega api rest'));
    }
    let time = 0;
    let choose = -1;
    for (let i in mega_pool) {
        if (!time) {
            time = mega_pool[i].time;
            choose = i;
        } else {
            if (time > mega_pool[i].time) {
                time = mega_pool[i].time;
                choose = i;
            }
        }
    }
    console.log(choose);
    console.log(time);
    if (!time) {
        mega_lock = false;
        return Promise.resolve();
    }
    let runNum = 0;
    mega_pool.forEach(v => {
        if (v.run) {
            runNum++;
        }
    });
    const is_run = (runNum < MEGA_LIMIT(ENV_TYPE)) ? true : false;
    if (is_run) {
        mega_pool[choose].start = Math.round(new Date().getTime() / 1000);
        mega_pool[choose].run = true;
        const runUser = mega_pool[choose].user;
        const runUrl = mega_pool[choose].url;
        const runPath= mega_pool[choose].filePath;
        const runData= mega_pool[choose].data;
        mega_lock = false;
        return startMega(runUser, runUrl, runPath, runData).catch(err => handle_err(err, runUser, 'Mega api')).then(rest => megaGet(rest));
    } else {
        mega_lock = false;
        return Promise.resolve();
    }
});

const zipGet = () => setLock('zip').then(go => {
    if (!go) {
        return Promise.resolve();
    }
    console.log('zip get');
    let time = 0;
    let choose = -1;
    for (let i in zip_pool) {
        if (!time) {
            time = zip_pool[i].time;
            choose = i;
        } else {
            if (time > zip_pool[i].time) {
                time = zip_pool[i].time;
                choose = i;
            }
        }
    }
    console.log(choose);
    console.log(time);
    if (!time) {
        zip_lock = false;
        return Promise.resolve();
    }
    let runNum = 0;
    zip_pool.forEach(v => {
        if (v.run) {
            runNum++;
        }
    });
    const is_run = (runNum < ZIP_LIMIT(ENV_TYPE)) ? true : false;
    if (is_run) {
        zip_pool[choose].start = Math.round(new Date().getTime() / 1000);
        zip_pool[choose].run = true;
        const runIndex = zip_pool[choose].index;
        const runId = zip_pool[choose].fileId;
        const runOwner = zip_pool[choose].fileOwner;
        const runName = zip_pool[choose].name;
        const runPwd = zip_pool[choose].pwd;
        const runType = zip_pool[choose].type;
        const runUser = zip_pool[choose].user;
        zip_lock = false;
        return startZip(runUser, runIndex, runId, runOwner, runName, runPwd, runType).catch(err => handle_err(err, runUser, 'Zip api', runId)).then(() => zipGet());
    } else {
        zip_lock = false;
        return Promise.resolve();
    }
});

const torrentGet = () => setLock('torrent').then(go => {
    if (!go) {
        return Promise.resolve();
    }
    console.log('torrent get');
    let pri = 0;
    let time = 0;
    let hash = null;
    for (let i in torrent_pool) {
        if (!torrent_pool[i].engine) {
            if (checkAdmin(1, torrent_pool[i].user)) {
                if (!pri) {
                    pri = 1;
                    time = torrent_pool[i].time;
                    hash = torrent_pool[i].hash;
                } else if (time > torrent_pool[i].time) {
                    time = torrent_pool[i].time;
                    hash = torrent_pool[i].hash;
                }
            } else {
                if (!pri) {
                    if (!time) {
                        time = torrent_pool[i].time;
                        hash = torrent_pool[i].hash;
                    } else if (time > torrent_pool[i].time) {
                        time = torrent_pool[i].time;
                        hash = torrent_pool[i].hash;
                    }
                }
            }
        }
    }
    console.log(pri);
    console.log(time);
    console.log(hash);
    if (!hash) {
        torrent_lock = false;
        return Promise.resolve();
    }
    let runNum = 0;
    torrent_pool.forEach(v => {
        if (v.engine) {
            runNum++;
        }
    });
    if (runNum < TORRENT_LIMIT(ENV_TYPE)) {
        for (let i in torrent_pool) {
            if (torrent_pool[i].hash === hash) {
                const engine = TorrentStream(torrent_pool[i].torrent, {
                    tmp: NAS_TMP(ENV_TYPE),
                    path: `${getFileLocation(torrent_pool[i].fileOwner, torrent_pool[i].fileId)}/real`,
                    connections: TORRENT_CONNECT,
                    uploads: TORRENT_UPLOAD,
                });
                console.log('new engine');
                torrent_pool[i].engine = engine;
                torrent_pool[i].start = Math.round(new Date().getTime() / 1000);
                const runIndex = torrent_pool[i].index;
                const runId = torrent_pool[i].fileId;
                const runOwner = torrent_pool[i].fileOwner;
                const runHash = torrent_pool[i].hash;
                const runUser = torrent_pool[i].user;
                torrent_lock = false;
                const startEngine = index => engine ? (engine.files && engine.files.length > 0) ? startTorrent(runUser, runId, runOwner, index, runHash, engine) : new Promise((resolve, reject) => engine.on('ready', () => {
                    console.log('torrent ready');
                    return resolve(startTorrent(runUser, runId, runOwner, index, runHash, engine));
                })) : Promise.resolve();
                return Promise.all(runIndex.map(v => startEngine(v))).catch(err => handle_err(err, runUser, 'Torrent api')).then(() => torrentGet());
            }
        }
    } else {
        torrent_lock = false;
        return Promise.resolve();
    }
});

export default function process(action, ...args) {
    console.log(`torrent: ${torrent_pool.length}`);
    console.log(`zip: ${zip_pool.length}`);
    console.log(`mega: ${mega_pool.length}`);
    console.log(action);
    console.log(args);
    switch (action) {
        case 'playlist kick':
        return playlistKick(...args);
        case 'torrent info':
        return torrentInfo(...args);
        case 'torrent add':
        torrentAdd(...args).catch(err => handle_err(err, args[0], 'Torrent api')).then(() => torrentGet()).catch(err => handleError(err, 'Torrent api'));
        return Promise.resolve();
        case 'torrent stop':
        torrentStop(...args).catch(err => handle_err(err, args[0], 'Torrent api')).then(() => torrentGet()).catch(err => handleError(err, 'Torrent api'));
        return Promise.resolve();
        case 'zip add':
        zipAdd(...args).catch((err) => handle_err(err, args[0], 'Zip api', args[2])).then(() => zipGet()).catch(err => handleError(err, 'Zip api'));
        return Promise.resolve();
        case 'zip stop':
        zipStop(...args).catch((err) => handle_err(err, args[0], 'Zip api')).then(() => zipGet()).catch(err => handleError(err, 'Zip api'));
        return Promise.resolve();
        case 'mega add':
        megaAdd(...args).catch((err) => handle_err(err, args[0], 'Mega api')).then(rest => megaGet(rest)).catch(err => handleError(err, 'Mega api'));
        return Promise.resolve();
        case 'mega stop':
        megaStop(...args).catch((err) => handle_err(err, args[0], 'Mega api')).then(rest => megaGet(rest)).catch(err => handleError(err, 'Mega api'));
        return Promise.resolve();
        default:
        return handleReject(new HoError('unknown playlist action!!!'));
    }
}

function handle_err(err, user, type, id=false) {
    handleError(err, type);
    sendWs(Object.assign({
        type: user.username,
        data: `${type} fail: ${err.message}`,
    }, id ? {zip: id} : {}), 0);
}

const startMega = (user, url, filePath, data) => {
    const real = `${filePath}/real`;
    console.log(real);
    return new Promise((resolve, reject) => Mkdirp(real, err => err ? megaComplete().then(() => reject(err)) : resolve())).then(() => {
        const cmdline = `megadl --no-progress --path "${real}" "${url}"`;
        console.log(cmdline);
        return new Promise((resolve, reject) => {
            const chp = Child_process.exec(cmdline, (err, output) => err ? megaComplete().then(() => reject(err)) : resolve(output));
            return setLock('mega').then(go => {
                if (!go) {
                    return Promise.resolve();
                }
                for (let i in mega_pool) {
                    if (url === mega_pool[i].url) {
                        mega_pool[i].chp = chp;
                        break;
                    }
                }
                mega_lock = false;
            }).then(() => chp);
        }).then(output => {
            let playList = [];
            const megaFolder = previous => FsReaddirSync(`${real}/${previous}`).forEach((file,index) => {
                const next = (previous === '') ? file : `${previous}/${file}`;
                const curPath = `${real}/${next}`;
                if (FsLstatSync(curPath).isDirectory()) {
                    megaFolder(next);
                } else {
                    playList.push(next);
                }
            });
            megaFolder('');
            playList = sortList(playList);
            if (playList.length < 1) {
                megaComplete();
                return handleReject(new HoError('mega empty'), data['errhandle']);
            }
            if (playList.length === 1) {
                FsRenameSync(`${real}/${playList[0]}`, `${filePath}_t`);
                deleteFolderRecursive(filePath);
                FsRenameSync(`${filePath}_t`, filePath);
                megaComplete(true);
                if (data['rest']) {
                    return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest']([PathBasename(playList[0]), new Set(['mega upload']), new Set()])).catch(err => data['errhandle'](err));
                }
            } else {
                let setTag = new Set(['mega upload', 'playlist', '播放列表']);
                let optTag = new Set();
                const recur_media = index => new Promise((resolve, reject) => {
                    const stream = FsCreateReadStream(`${real}/${playList[index]}`);
                    stream.on('error', err => {
                        console.log('save mega error!!!');
                        return megaComplete().then(() => reject(err))
                    });
                    stream.on('close', () => resolve());
                    stream.pipe(FsCreateWriteStream(`${filePath}/${index}_complete`));
                }).then(() => {
                    const mediaType = extType(playList[index]);
                    if (mediaType) {
                        const mediaTag = extTag(mediaType['type']);
                        mediaTag.def.forEach(i => setTag.add(i));
                        mediaTag.opt.forEach(i => optTag.add(i));
                    }
                    index++;
                    if (index < playList.length) {
                        return recur_media(index);
                    } else {
                        deleteFolderRecursive(`${PathDirname(filePath)}/mega`);
                        megaComplete(true);
                        if (data['rest']) {
                            return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest']([PathBasename(playList[0]), setTag, optTag, {
                                mega: encodeURIComponent(url),
                                playList,
                            }])).catch(err => data['errhandle'](err));
                        }
                    }
                });
                return recur_media(0);
            }
        });
    });
    function megaComplete(is_success=false) {
        return setLock('mega').then(go => {
            if (!go) {
                return Promise.resolve();
            }
            console.log('mega kill');
            for (let i in mega_pool) {
                if (url === mega_pool[i].url) {
                    mega_pool[i].chp.kill('SIGKILL');
                    mega_pool.splice(i, 1);
                    if (!is_success) {
                        deleteFolderRecursive(mega_pool[i].filePath);
                    }
                    break;
                }
            }
            mega_lock = false;
            return Promise.resolve();
        });
    }
}

const megaAdd = (user, url, filePath, data={})  => setLock('mega').then(go => {
    if (!go) {
        return Promise.resolve();
    }
    let is_queue = false;
    let runNum = 0;
    for (let i of mega_pool) {
        if (i.url === url) {
            is_queue = true;
            filePath = i.filePath;
            data = i.data;
            const real = `${filePath}/real`;
            console.log(real);
            let filename = 'Mega file';
            let size = 0;
            const recur_size = previous => FsReaddirSync(`${real}/${previous}`).forEach((file,index) => {
                const next = (previous === '') ? file : `${previous}/${file}`;
                const curPath = `${real}/${next}`;
                if (FsLstatSync(curPath).isDirectory()) {
                    recur_size(next);
                } else {
                    size += FsStatSync(curPath).size;
                    if (filename === 'Mega file') {
                        filename = next;
                    }
                }
            });
            if (FsExistsSync(real)) {
                recur_size('');
                sendWs({
                    type: user.username,
                    data: `${filename}: ${Math.floor(size / 1024 / 1024 * 100) / 100}MB`,
                }, 0);
            }
        }
        if (i.run) {
            runNum++;
        }
    }
    const is_run = (runNum < MEGA_LIMIT(ENV_TYPE)) ? true : false;
    if (!is_run) {
        console.log('mega wait');
    }
    if (!is_queue) {
        mega_pool.push(Object.assign({
            user,
            url,
            filePath,
            time: Math.round(new Date().getTime() / 1000),
            data,
        }, is_run ? {
            start: Math.round(new Date().getTime() / 1000),
            run: true,
        } : {run: false}));
    }
    mega_lock = false;
    return is_run ? startMega(user, url, filePath, data) : Promise.resolve();
});

const startZip = (user, index, id, owner, name, pwd, zip_type) => Mongo('update', STORAGEDB, {_id: id}, {$set: {utime: Math.round(new Date().getTime() / 1000)}}).then(item => {
    const filePath = getFileLocation(owner, id);
    const comPath = `${filePath}/${index}_complete`;
    if (FsExistsSync(comPath)) {
        return zipComplete();
    } else {
        const realPath = `${filePath}/real`;
        const regName = name.replace(/"/g, '\\"');
        let cmdline = `${PathJoin(__dirname, '../util/myuzip.py')} ${filePath}_zip ${realPath}  "${regName}"${pwd ? ` '${pwd}'` : ''}`;
        if (zip_type === 2) {
            cmdline = `unrar x ${filePath}.1.rar ${realPath} "${regName}"${pwd ? ` -p${pwd}` : ''}`;
        } else if (zip_type === 3) {
            cmdline = `7za x ${filePath}_7z -o${realPath} "${regName}"${pwd ? ` -p${pwd}` : ''}`;
        } else if (zip_type === 4) {
            cmdline = `${PathJoin(__dirname, '../util/myuzip.py')} ${filePath}_zip_c ${realPath} "${regName}"${pwd ? ` '${pwd}'` : ''}`;
        } else if (zip_type === 5) {
            cmdline = `7za x ${filePath}_7z_c -o${realPath} "${regName}"${pwd ? ` -p${pwd}` : ''}`;
        }
        console.log(cmdline);
        const realName = `${realPath}/${name}`;
        const unReal = () => FsExistsSync(realName) ? new Promise((resolve, reject) => FsUnlink(realName, err => err ? zipComplete().then(() => reject(err)) : resolve())) : Promise.resolve();
        return unReal().then(() => new Promise((resolve, reject) => {
            const chp = Child_process.exec(cmdline, (err, output) => err ? zipComplete().then(() => reject(err)) : resolve(output));
            return setLock('zip').then(go => {
                if (!go) {
                    return Promise.resolve();
                }
                for (let i in zip_pool) {
                    if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                        zip_pool[i].chp = chp;
                        break;
                    }
                }
                zip_lock = false;
            }).then(() => chp);
        })).then(output => new Promise((resolve, reject) => {
            const stream = FsCreateReadStream(realName);
            stream.on('error', err => zipComplete().then(() => reject(err)));
            stream.on('close', () => resolve(zipComplete(realName)));
            stream.pipe(FsCreateWriteStream(comPath));
        }));
    }
    function zipComplete(is_success=false) {
        return setLock('zip').then(go => {
            if (!go) {
                return Promise.resolve();
            }
            console.log('zip complete');
            for (let i in zip_pool) {
                if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                    zip_pool[i].chp.kill('SIGKILL');
                    zip_pool.splice(i, 1);
                    break;
                }
            }
            zip_lock = false;
            if (is_success) {
                if (isVideo(name) || isDoc(name) || isZipbook(name)) {
                    return MediaHandleTool.handleTag(is_success, {}, PathBasename(name), '', 0, false).then(([mediaType, mediaTag, DBdata]) => {
                        mediaType['fileIndex'] = index;
                        mediaType['realPath'] = name;
                        DBdata['status'] = 9;
                        DBdata[`mediaType.${index}`] = mediaType;
                        console.log(DBdata);
                        return Mongo('update', STORAGEDB, {_id: id}, {$set: DBdata}).then(item2 => MediaHandleTool.handleMediaUpload(mediaType, filePath, id, user).catch(err => handleReject(err, errorMedia, id, mediaType['fileIndex'])));
                    });
                }
            }
            return Promise.resolve();
        });
    }
});

function zipAdd(user, index, id, owner, name, pwd='') {
    const filePath = getFileLocation(owner, id);
    const zip_type = FsExistsSync(`${filePath}_zip_c`) ? 4 : FsExistsSync(`${filePath}_7z_c`) ? 5 : FsExistsSync(`${filePath}_zip`) ? 1 : FsExistsSync(`${filePath}.1.rar`) ? 2 : FsExistsSync(`${filePath}_7z`) ? 3 : 0;
    if (!zip_type) {
        return handleReject(new HoError('not zip'));
    }
    return setLock('zip').then(go => {
        if (!go) {
            return Promise.resolve();
        }
        let is_queue = false;
        let runNum = 0;
        for (let i of zip_pool) {
            if (id.equals(i.fileId) && i.index === index) {
                is_queue = true;
                const realName = `${filePath}/real/${i.name}`;
                if (FsExistsSync(realName)) {
                    sendWs({
                        type: user.username,
                        data: `${i.name}: ${Math.floor(FsStatSync(realName).size / 1024 / 1024 * 100) / 100}MB`,
                    }, 0);
                }
            }
            if (i.run) {
                runNum++;
            }
        }
        const is_run = (runNum < ZIP_LIMIT(ENV_TYPE)) ? true : false;
        if (!is_run) {
            console.log('zip wait');
        }
        if (!is_queue) {
            zip_pool.push(Object.assign({
                index: index,
                user: user,
                time: Math.round(new Date().getTime() / 1000),
                fileId: id,
                fileOwner: owner,
                name: name,
                type: zip_type,
                pwd: pwd,
            }, is_run ? {
                start: Math.round(new Date().getTime() / 1000),
                run: true,
            } : {run: false}));
        }
        zip_lock = false;
        return is_run ? startZip(user, index, id, owner, name, pwd, zip_type) : Promise.resolve();
    });
}

const startTorrent = (user, id, owner, index, hash, engine) => Mongo('update', STORAGEDB, {_id: id}, {$set: {utime: Math.round(new Date().getTime() / 1000)}}).then(item => {
    const filePath = getFileLocation(owner, id);
    const bufferPath = `${filePath}/${index}`;
    const comPath = `${bufferPath}_complete`;
    let playList = engine.files.map(file => file.path);
    if (playList.length < 1) {
        return handleReject(new HoError('empty content!!!'));
    }
    playList = sortList(playList);
    let tIndex = -1;
    for (let i in engine.files) {
        if (playList[index] === engine.files[i].path) {
            tIndex = i;
            break;
        }
    }
    if (tIndex < 0 || tIndex >= engine.files.length) {
        return torrentComplete().then(() => handleReject(new HoError('unknown index')));
    } else {
        const file = engine.files[tIndex];
        console.log(tIndex);
        console.log(file.name);
        console.log(file.length);
        console.log('torrent real start');
        console.log(bufferPath);
        if (FsExistsSync(bufferPath)) {
            const size = FsStatSync(bufferPath).size;
            console.log(size);
            return (size >= file.length) ? torrentComplete(true, file.path) : new Promise((resolve, reject) => {
                const fileStream = file.createReadStream({start: size});
                fileStream.pipe(FsCreateWriteStream(bufferPath, {flags: 'a'}));
                fileStream.on('end', () => resolve(torrentComplete(true, file.path)));
            });
        } else {
            if (isVideo(file.name)) {
                new Promise((resolve, reject) => computeHash(tIndex, engine, (err, hash_ret) => err ? reject(err) : resolve(hash_ret))).then(hash_ret => {
                    console.log(hash_ret);
                    const openSubtitles = new OpenSubtitle('hoder agent v0.1');
                    return openSubtitles.search({
                        extensions: 'srt',
                        hash: hash_ret.movieHash,
                        filesize: hash_ret.fileSize
                    });
                }).then(subtitles => {
                    console.log(subtitles);
                    const sub_url = subtitles.ze ? subtitles.ze.url : subtitles.zt ? subtitles.zt.url : subtitles.zh ? subtitles.zh.url :null;
                    const sub_en_url = subtitles.en ? subtitles.en.url : null;
                    function chsub(lang='') {
                        const langExt = lang === 'en' ? '.en' : '';
                        if (FsExistsSync(`${bufferPath}${langExt}.srt`)) {
                            FsRenameSync(`${bufferPath}${langExt}.srt`, `${bufferPath}.srt1`);
                        }
                        if (FsExistsSync(`${bufferPath}${langExt}.ass`)) {
                            FsRenameSync(`${bufferPath}${langExt}.ass`, `${bufferPath}.ass1`);
                        }
                        if (FsExistsSync(`${bufferPath}${langExt}.ssa`)) {
                            FsRenameSync(`${bufferPath}${langExt}.ssa`, `${bufferPath}.ssa1`);
                        }
                    }
                    const saveSub = (type='') => {
                        if (type === 'en') {
                            if (sub_en_url) {
                                chsub('en');
                                return Api('url', sub_en_url, {filePath: `${bufferPath}.en.srt`}).then(() => SRT2VTT(`${bufferPath}.en`, 'srt'));
                            }
                        } else {
                            if (sub_url) {
                                chsub();
                                return Api('url', sub_url, {filePath: `${bufferPath}.srt`}).then(() => SRT2VTT(bufferPath, 'srt'));
                            }
                        }
                        return Promise.resolve();
                    }
                    return saveSub().then(() => saveSub('en')).then(() => {
                        sendWs({
                            type: 'sub',
                            data: id,
                        }, 0, 0);
                        console.log('sub end');
                    });
                }).catch(error => {
                    console.log('error:', error);
                    console.log('req headers:', error.req && error.req._header);
                    console.log('res code:', error.res && error.res.statusCode);
                    console.log('res body:', error.body);
                    handleError(error, 'Open srt');
                });
            }
            return new Promise((resolve, reject) => {
                const fileStream = file.createReadStream();
                fileStream.pipe(FsCreateWriteStream(bufferPath));
                fileStream.on('end', () => resolve(torrentComplete(true, file.path)));
            });
        }
    }
    function torrentComplete(is_success=false, exitPath=bufferPath) {
        return setLock('torrent').then(go => {
            if (!go) {
                return Promise.resolve();
            }
            console.log('torrent complete');
            for (let i in torrent_pool) {
                if (torrent_pool[i].hash === hash) {
                    const pindex = torrent_pool[i].index.indexOf(index);
                    if (pindex !== -1) {
                        torrent_pool[i].index.splice(pindex, 1);
                    }
                    if (torrent_pool[i].index.length <= 0) {
                        if (torrent_pool[i].engine) {
                            torrent_pool[i].engine.destroy();
                        }
                        torrent_pool.splice(i, 1);
                    }
                    break;
                }
            }
            torrent_lock = false;
            if (is_success) {
                FsRenameSync(bufferPath, comPath);
                if (isVideo(exitPath) || isDoc(exitPath) || isZipbook(exitPath)) {
                    const dbPath = `${filePath}/real/${exitPath}`;
                    return MediaHandleTool.handleTag(dbPath, {}, PathBasename(exitPath), '', 0, false).then(([mediaType, mediaTag, DBdata]) => {
                        mediaType['fileIndex'] = index;
                        mediaType['realPath'] = exitPath;
                        DBdata['status'] = 9;
                        DBdata[`mediaType.${index}`] = mediaType;
                        console.log(DBdata);
                        return Mongo('update', STORAGEDB, {_id: id}, {$set: DBdata}).then(item2 => MediaHandleTool.handleMediaUpload(mediaType, filePath, id, user).catch(err => handleReject(err, errorMedia, id, mediaType['fileIndex'])));
                    });
                }
            }
            return Promise.resolve();
        });
    }
});

function torrentAdd(user, torrent, fileIndex, id, owner, pType=0) {
    let shortTorrent = torrent.match(/^[^&]+/);
    if (!shortTorrent) {
        return handleReject(new HoError('not torrent'));
    }
    shortTorrent = shortTorrent[0];
    const filePath = getFileLocation(owner, id);
    let bufferPath = `${filePath}/${fileIndex}`;
    let is_queue = false;
    let engine = null;
    return setLock('torrent').then(go => {
        if (!go) {
            return Promise.resolve();
        }
        for (let i in torrent_pool) {
            if (torrent_pool[i].hash === shortTorrent) {
                is_queue = true;
                if (checkAdmin(1, user)) {
                    torrent_pool[i].user = user;
                }
                if (!torrent_pool[i].index.includes(fileIndex)) {
                    torrent_pool[i].index.push(fileIndex);
                    if (torrent_pool[i].engine) {
                        engine = torrent_pool[i].engine;
                    }
                } else {
                    if (torrent_pool[i].engine && torrent_pool[i].engine.files) {
                        if (pType === 1) {
                            let totalDSize = 0;
                            let totalSize = 0;
                            torrent_pool[i].engine.files.forEach((v, j) => {
                                const DPath = `${filePath}/${j}`;
                                const CDPath = `${DPath}_complete`;
                                totalSize += v.length;
                                if (FsExistsSync(CDPath)) {
                                    totalDSize += v.length;
                                } else if (FsExistsSync(DPath)) {
                                    totalDSize += FsStatSync(DPath).size;
                                }
                            });
                            const percent = totalSize > 0 ? Math.ceil(totalDSize / totalSize * 100) : 0;
                            sendWs({
                                type: user.username,
                                data: `${torrent_pool[i].engine.torrent.name ? `Playlist ${torrent_pool[i].engine.torrent.name}` : 'Playlist torrent'}: ${percent}%`,
                            }, 0);
                        } else if (!pType) {
                            let playList = torrent_pool[i].engine.files.map(file => file.path);
                            playList = sortList(playList);
                            let tIndex = -1;
                            for (let j in torrent_pool[i].engine.files) {
                                if (playList[fileIndex] === torrent_pool[i].engine.files[j].path) {
                                    tIndex = j;
                                    break;
                                }
                            }
                            if (torrent_pool[i].engine.files[tIndex]) {
                                let percent = 0;
                                if (FsExistsSync(bufferPath)) {
                                    if (torrent_pool[i].engine.files[tIndex].length > 0) {
                                        percent = Math.ceil(FsStatSync(bufferPath).size / torrent_pool[i].engine.files[tIndex].length * 100);
                                    }
                                }
                                console.log(percent);
                                sendWs({
                                    type: user.username,
                                    data: `${torrent_pool[i].engine.files[tIndex].path}: ${percent}%`,
                                }, 0);
                            }
                        }
                    }
                    torrent_lock = false;
                    return Promise.resolve();
                }
                break;
            }
        }
        let comPath = `${bufferPath}_complete`;
        const startEngine = index => engine ? (engine.files && engine.files.length > 0) ? startTorrent(user, id, owner, index, shortTorrent, engine) : new Promise((resolve, reject) => engine.on('ready', () => {
            console.log('torrent ready');
            return resolve(startTorrent(user, id, owner, index, shortTorrent, engine));
        })) : Promise.resolve();
        if (engine){
            torrent_lock = false;
            console.log('torrent go');
            return startEngine(fileIndex);
        } else {
            let runNum = 0;
            torrent_pool.forEach(v => {
                if (v.engine) {
                    runNum++;
                }
            });
            //prem 1 可插隊
            if (checkAdmin(1, user)) {
                runNum = 0;
                torrent_pool.forEach(v => {
                    if (v.engine && checkAdmin(1, v.user)) {
                        runNum++;
                    }
                });
            }
            if (runNum < TORRENT_LIMIT(ENV_TYPE)) {
                engine = TorrentStream(torrent, {
                    tmp: NAS_TMP(ENV_TYPE),
                    path: `${filePath}/real`,
                    connections: TORRENT_CONNECT,
                    uploads: TORRENT_UPLOAD,
                });
                console.log('new engine');
                const rest = () => setLock('torrent').then(go => {
                    if (!go) {
                        return Promise.resolve();
                    }
                    //剔除超過的
                    runNum = 0;
                    torrent_pool.forEach(v => {
                        if (v.engine) {
                            runNum++;
                        }
                    });
                    if (runNum > TORRENT_LIMIT(ENV_TYPE)) {
                        let time = 0;
                        let out_shortTorrent = null;
                        torrent_pool.forEach(v => {
                        if (v.engine && !checkAdmin(1, v.user)) {
                            if (time < v.time) {
                                time = v.time;
                                out_shortTorrent = v.hash;
                            }
                        }
                    });
                    console.log('torrent kick');
                    console.log(time);
                    console.log(out_shortTorrent);
                    for (let i in torrent_pool) {
                        if (out_shortTorrent === torrent_pool[i].hash) {
                            if (torrent_pool[i].engine) {
                                torrent_pool[i].engine.destroy();
                                    torrent_pool[i].engine = null;
                                }
                            }
                        }
                    }
                    torrent_lock = false;
                    return Promise.resolve(true);
                });
                if (!is_queue) {
                    console.log('torrent new');
                    torrent_pool.push({
                        hash: shortTorrent,
                        index: [fileIndex],
                        user: user,
                        time: Math.round(new Date().getTime() / 1000),
                        fileId: id,
                        fileOwner: owner,
                        torrent: torrent,
                        start: Math.round(new Date().getTime() / 1000),
                        engine,
                    });
                    torrent_lock = false;
                    return startEngine(fileIndex).then(() => rest());
                } else {
                    console.log('torrent old');
                    for (let i in torrent_pool) {
                        if (torrent_pool[i].hash === shortTorrent) {
                            torrent_pool[i].engine = engine;
                            const runIndex = torrent_pool[i].index;
                            torrent_lock = false;
                            return Promise.all(runIndex.map(v => startEngine(v))).then(() => rest());
                        }
                    }
                    torrent_lock = false;
                }
            } else {
                console.log('torrent wait');
                if (!is_queue) {
                    console.log('torrent new');
                    torrent_pool.push({
                        hash: shortTorrent,
                        index: [fileIndex],
                        user: user,
                        time: Math.round(new Date().getTime() / 1000),
                        fileId: id,
                        fileOwner: owner,
                        torrent: torrent,
                        engine: null,
                    });
                }
                torrent_lock = false;
                return Promise.resolve(false);
            }
        }
    });
}

function torrentInfo(magnet, filePath) {
    const engine = TorrentStream(magnet, {
        tmp: NAS_TMP(ENV_TYPE),
        path: `${filePath}/real`,
        connections: TORRENT_CONNECT,
        uploads: TORRENT_UPLOAD,
    });
    return new Promise((resolve, reject) => engine.on('ready', () => {
        const data = {
            files: engine.files,
            name: engine.torrent.name ? engine.torrent.name : 'torrent',
        }
        engine.destroy();
        return resolve(data);
    }));
}

function torrentStop(user, index=false) {
    if (user) {
        torrent_pool.forEach(i => {
            if (user._id.equals(i.user._id)) {
                console.log('engine stop');
                console.log(i);
                if (i.engine) {
                    i.engine.destroy();
                }
                for (let j in torrent_pool) {
                    if (torrent_pool[j].hash === i.hash) {
                        torrent_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(torrent_pool[index]);
        if (torrent_pool[index].engine) {
            torrent_pool[index].engine.destroy();
        }
        for (let j in torrent_pool) {
            if (torrent_pool[j].hash === torrent_pool[index].hash) {
                torrent_pool.splice(j, 1);
                break;
            }
        }
    }
    return Promise.resolve();
}

function zipStop(user, index=false) {
    if (user) {
        zip_pool.forEach(i => {
            if (user._id.equals(i.user._id)) {
                console.log('zip stop');
                console.log(i);
                if (i.run) {
                    i.chp.kill('SIGKILL');
                }
                for (let j in zip_pool) {
                    if (i.fileId.equals(zip_pool[j].fileId)) {
                        zip_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(zip_pool[index]);
        if (zip_pool[index].run) {
            zip_pool[index].chp.kill('SIGKILL');
        }
        for (let j in zip_pool) {
            if (zip_pool[index].fileId.equals(zip_pool[j].fileId)) {
                zip_pool.splice(j, 1);
                break;
            }
        }
    }
    return Promise.resolve();
}

function megaStop(user, index=false) {
    if (user) {
        mega_pool.forEach(i => {
            if (user._id.equals(i.user._id)) {
                console.log('mega stop');
                console.log(i);
                if (i.run) {
                    i.chp.kill('SIGKILL');
                }
                deleteFolderRecursive(i.filePath);
                for (let j in mega_pool) {
                    if (i.url === mega_pool[j].url) {
                        mega_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(mega_pool[index]);
        if (mega_pool[index].run) {
            mega_pool[index].chp.kill('SIGKILL');
            deleteFolderRecursive(mega_pool[index].filePath);
        }
        for (let j in mega_pool) {
            if (mega_pool[index].url === mega_pool[j].url) {
                mega_pool.splice(j, 1);
                break;
            }
        }
    }
    return Promise.resolve();
}

function playlistKick() {
    const kickTorrent = () => {
        const kick_time = Math.round((new Date().getTime() - TORRENT_DURATION * 1000)/ 1000);
        for (let i in torrent_pool) {
            if (torrent_pool[i].engine && torrent_pool[i].start < kick_time) {
                return process('torrent stop', null, i);
            }
        }
        return Promise.resolve();
    }
    const kickZip = () => {
        const kick_time = Math.round((new Date().getTime() - ZIP_DURATION * 1000)/ 1000);
        for (let i in zip_pool) {
            if (zip_pool[i].run && zip_pool[i].time < kick_time) {
                return process('zip stop', null, i);
            }
        }
        return Promise.resolve();
    }
    const kickMega = () => {
        const kick_time = Math.round((new Date().getTime() - MEGA_DURATION * 1000)/ 1000);
        for (let i in mega_pool) {
            if (mega_pool[i].run && mega_pool[i].time < kick_time) {
                return process('mega stop', null, i);
            }
        }
        return Promise.resolve();
    }
    return kickTorrent().then(() => kickZip()).then(() => kickMega());
}
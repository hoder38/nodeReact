import { ENV_TYPE } from '../../../ver.js'
import { TORRENT_LIMIT, ZIP_LIMIT, MEGA_LIMIT, NAS_TMP } from '../config.js'
import { TORRENT_CONNECT, TORRENT_UPLOAD, STORAGEDB, TORRENT_DURATION, ZIP_DURATION, MEGA_DURATION, __dirname, BEST_TRACKER_LIST } from '../constants.js'
import fsModule from 'fs'
const { unlink: FsUnlink, createReadStream: FsCreateReadStream, createWriteStream: FsCreateWriteStream } = fsModule;
import { stat, lstat, rename, readdir } from 'fs/promises'
import pathModule from 'path'
const { basename: PathBasename, join: PathJoin, dirname: PathDirname } = pathModule
import { execFileWithHandle } from '../util/exec-safe.js'
import WebTorrent from 'webtorrent'

const webtorrentClient = new WebTorrent();

// Adapter: provides torrent-stream compatible interface using webtorrent
function createTorrentEngine(magnetOrTorrent, opts) {
    const torrent = webtorrentClient.add(magnetOrTorrent, {
        path: opts.path,
        maxConns: opts.connections,
        announce: opts.trackers,
    });
    // Expose torrent-stream compatible .torrent.name (self-reference so engine.torrent.name works)
    if (!torrent.torrent) {
        torrent.torrent = torrent;
    }
    const origDestroy = torrent.destroy.bind(torrent);
    torrent.destroy = () => {
        origDestroy();
        try { webtorrentClient.remove(torrent); } catch(e) { /* already removed */ }
    };
    return torrent;
}
import Mkdirp from 'mkdirp'
//import OpenSubtitle from 'opensubtitles-api'
import { Mutex } from 'async-mutex'
import Mongo from '../models/mongo-tool.js'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool.js'
import { handleError, HoError, getFileLocation, checkAdmin, deleteFolderRecursive, sortList, fsExists } from '../util/utility.js'
import { isVideo, isDoc, isZipbook, extType, extTag } from '../util/mime.js'
//import computeHash from '../util/os-torrent-hash.js'
import sendWs from '../util/sendWs.js'

let torrent_pool = [];
let zip_pool = [];
let mega_pool = [];
const torrentMutex = new Mutex();
const zipMutex = new Mutex();
const megaMutex = new Mutex();

// Test helpers — expose pool state for white-box testing without jest.resetModules()
export function _resetPools() {
    torrent_pool = [];
    zip_pool = [];
    mega_pool = [];
}
export function _getPools() {
    return {
        torrent_pool: torrent_pool.map(p => ({ ...p })),
        zip_pool: zip_pool.map(p => ({ ...p })),
        mega_pool: mega_pool.map(p => ({ ...p })),
    };
}
export function _setPools(overrides) {
    if ('torrent_pool' in overrides) torrent_pool = overrides.torrent_pool;
    if ('zip_pool' in overrides) zip_pool = overrides.zip_pool;
    if ('mega_pool' in overrides) mega_pool = overrides.mega_pool;
}

const megaGet = (rest=null) => megaMutex.runExclusive(() => {
    console.log('mega get');
    const afterRest = (rest && typeof rest === 'function')
        ? rest().catch(err => { handleError(err, 'Mega api rest'); })
        : Promise.resolve();
    return afterRest.then(() => {
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
        return startMega(runUser, runUrl, runPath, runData).catch(err => handle_err(err, runUser, 'Mega api')).then(rest => megaGet(rest));
    } else {
        return Promise.resolve();
    }
    });
});

const zipGet = () => zipMutex.runExclusive(() => {
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
        return startZip(runUser, runIndex, runId, runOwner, runName, runPwd, runType).catch(err => handle_err(err, runUser, 'Zip api', runId)).then(() => zipGet());
    } else {
        return Promise.resolve();
    }
});

const torrentGet = () => torrentMutex.runExclusive(() => {
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
                const engine = createTorrentEngine(torrent_pool[i].torrent, {
                    tmp: NAS_TMP(ENV_TYPE),
                    path: `${getFileLocation(torrent_pool[i].fileOwner, torrent_pool[i].fileId)}/real`,
                    connections: TORRENT_CONNECT,
                    uploads: TORRENT_UPLOAD,
                    trackers: BEST_TRACKER_LIST,
                });
                console.log('new engine');
                torrent_pool[i].engine = engine;
                torrent_pool[i].start = Math.round(new Date().getTime() / 1000);
                const runIndex = torrent_pool[i].index;
                const runId = torrent_pool[i].fileId;
                const runOwner = torrent_pool[i].fileOwner;
                const runHash = torrent_pool[i].hash;
                const runUser = torrent_pool[i].user;
                const startEngine = index => engine ? (engine.files && engine.files.length > 0) ? startTorrent(runUser, runId, runOwner, index, runHash, engine) : new Promise((resolve, reject) => engine.on('ready', () => {
                    console.log('torrent ready');
                    return resolve(startTorrent(runUser, runId, runOwner, index, runHash, engine));
                })) : Promise.resolve();
                return Promise.all(runIndex.map(v => startEngine(v))).catch(err => handle_err(err, runUser, 'Torrent api')).then(() => torrentGet());
            }
        }
    } else {
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
        return handleError(new HoError('unknown playlist action!!!'));
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
    return Mkdirp(real).then(() => {
        console.log('megadl', ['--no-progress', '--path', real, url]);
        const { chp, promise } = execFileWithHandle('megadl', ['--no-progress', '--path', real, url]);
        const wrappedPromise = promise.catch(err => megaComplete().then(() => Promise.reject(err)));
        megaMutex.runExclusive(() => {
            for (let i in mega_pool) {
                if (url === mega_pool[i].url) {
                    mega_pool[i].chp = chp;
                    break;
                }
            }
        });
        return wrappedPromise.then(async output => {
            let playList = [];
            const megaFolder = async (previous, depth=0) => {
                if (depth > 20) return;
                for (const file of await readdir(`${real}/${previous}`)) {
                    const next = (previous === '') ? file : `${previous}/${file}`;
                    const curPath = `${real}/${next}`;
                    if ((await lstat(curPath)).isDirectory()) {
                        await megaFolder(next, depth + 1);
                    } else {
                        playList.push(next);
                    }
                }
            };
            await megaFolder('');
            playList = sortList(playList);
            if (playList.length < 1) {
                megaComplete();
                return handleError(new HoError('mega empty'), data['errhandle']);
            }
            if (playList.length === 1) {
                await rename(`${real}/${playList[0]}`, `${filePath}_t`);
                await deleteFolderRecursive(filePath);
                await rename(`${filePath}_t`, filePath);
                megaComplete(true);
                if (data['rest']) {
                    return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest']([PathBasename(playList[0]), new Set(['mega upload']), new Set()])).catch(err => data['errhandle'](err));
                }
            } else {
                let setTag = new Set(['mega upload', 'playlist', '播放列表']);
                let optTag = new Set();
                const recur_media = index => new Promise((resolve, reject) => {
                    const readStream = FsCreateReadStream(`${real}/${playList[index]}`);
                    const writeStream = FsCreateWriteStream(`${filePath}/${index}_complete`);
                    readStream.on('error', err => {
                        console.log('save mega read error!!!');
                        megaComplete().then(() => reject(err));
                    });
                    writeStream.on('error', err => {
                        console.log('save mega write error!!!');
                        megaComplete().then(() => reject(err));
                    });
                    writeStream.on('close', () => resolve());
                    readStream.pipe(writeStream);
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
                        return deleteFolderRecursive(`${PathDirname(filePath)}/mega`).then(() => {
                            return megaComplete(true).then(() => {
                                if (data['rest']) {
                                    return () => new Promise((resolve, reject) => setTimeout(() => resolve(), 0)).then(() => data['rest']([PathBasename(playList[0]), setTag, optTag, {
                                        mega: encodeURIComponent(url),
                                        playList,
                                    }])).catch(err => data['errhandle'](err));
                                }
                            });
                        });
                    }
                });
                return recur_media(0);
            }
        });
    });
    function megaComplete(is_success=false) {
        return megaMutex.runExclusive(() => {
            console.log('mega kill');
            for (let i in mega_pool) {
                if (url === mega_pool[i].url) {
                    const entry = mega_pool[i];
                    if (entry.chp) {
                        entry.chp.kill('SIGKILL');
                    }
                    mega_pool.splice(i, 1);
                    if (!is_success) {
                        return deleteFolderRecursive(entry.filePath);
                    }
                    break;
                }
            }
            return Promise.resolve();
        });
    }
}

const megaAdd = (user, url, filePath, data={})  => megaMutex.runExclusive(async () => {
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
            const recur_size = async previous => {
                for (const file of await readdir(`${real}/${previous}`)) {
                    const next = (previous === '') ? file : `${previous}/${file}`;
                    const curPath = `${real}/${next}`;
                    if ((await lstat(curPath)).isDirectory()) {
                        await recur_size(next);
                    } else {
                        size += (await stat(curPath)).size;
                        if (filename === 'Mega file') {
                            filename = next;
                        }
                    }
                }
            };
            if (await fsExists(real)) {
                await recur_size('');
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
    return is_run ? startMega(user, url, filePath, data) : Promise.resolve();
});

const startZip = (user, index, id, owner, name, pwd, zip_type) => Mongo('update', STORAGEDB, {_id: id}, {$set: {utime: Math.round(new Date().getTime() / 1000)}}).then(async () => {
    const filePath = getFileLocation(owner, id);
    const comPath = `${filePath}/${index}_complete`;
    if (await fsExists(comPath)) {
        return zipComplete();
    } else {
        const realPath = `${filePath}/real`;
        const password = pwd || '123';
        let extractCmd, extractArgs;
        if (zip_type === 2) {
            extractCmd = '7za';
            extractArgs = ['x', `${filePath}.1.rar`, `-o${realPath}`, name, `-p${password}`];
        } else if (zip_type === 3) {
            extractCmd = '7za';
            extractArgs = ['x', `${filePath}_7z`, `-o${realPath}`, name, `-p${password}`];
        } else if (zip_type === 4) {
            extractCmd = PathJoin(__dirname, 'util/myuzip.py');
            extractArgs = [`${filePath}_zip_c`, realPath, name, password];
        } else if (zip_type === 5) {
            extractCmd = '7za';
            extractArgs = ['x', `${filePath}_7z_c`, `-o${realPath}`, name, `-p${password}`];
        } else {
            extractCmd = PathJoin(__dirname, 'util/myuzip.py');
            extractArgs = [`${filePath}_zip`, realPath, name, password];
        }
        console.log(extractCmd, extractArgs);
        const realName = `${realPath}/${name}`;
        const unReal = () => fsExists(realName).then(exists => exists ? new Promise((resolve, reject) => FsUnlink(realName, err => err ? zipComplete().then(() => reject(err)) : resolve())) : Promise.resolve());
        return unReal().then(() => {
            const { chp, promise } = execFileWithHandle(extractCmd, extractArgs);
            const wrappedPromise = promise.catch(err => zipComplete().then(() => Promise.reject(err)));
            zipMutex.runExclusive(() => {
                for (let i in zip_pool) {
                    if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                        zip_pool[i].chp = chp;
                        break;
                    }
                }
            });
            return wrappedPromise;
        }).then(output => new Promise((resolve, reject) => {
            const stream = FsCreateReadStream(realName);
            stream.on('error', err => zipComplete().then(() => reject(err)));
            stream.on('close', () => resolve(zipComplete(realName)));
            stream.pipe(FsCreateWriteStream(comPath));
        }));
    }
    function zipComplete(is_success=false) {
        return zipMutex.runExclusive(() => {
            console.log('zip complete');
            for (let i in zip_pool) {
                if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                    if (zip_pool[i].chp) {
                        zip_pool[i].chp.kill('SIGKILL');
                    }
                    zip_pool.splice(i, 1);
                    break;
                }
            }
            if (is_success) {
                if (isVideo(name) || isDoc(name) || isZipbook(name)) {
                    return MediaHandleTool.handleTag(is_success, {}, PathBasename(name), '', 0, false).then(([mediaType, mediaTag, DBdata]) => {
                        mediaType['fileIndex'] = index;
                        mediaType['realPath'] = name;
                        DBdata['status'] = 9;
                        DBdata[`mediaType.${index}`] = mediaType;
                        console.log(DBdata);
                        return Mongo('update', STORAGEDB, {_id: id}, {$set: DBdata}).then(() => MediaHandleTool.handleMediaUpload(mediaType, filePath, id, user).catch(err => handleError(err, errorMedia, id, mediaType['fileIndex'])));
                    });
                }
            }
            return Promise.resolve();
        });
    }
});

function zipAdd(user, index, id, owner, name, pwd='') {
    const filePath = getFileLocation(owner, id);
    return Promise.all([fsExists(`${filePath}_zip_c`), fsExists(`${filePath}_7z_c`), fsExists(`${filePath}_zip`), fsExists(`${filePath}.1.rar`), fsExists(`${filePath}_7z`)]).then(([hasZipC, has7zC, hasZip, hasRar, has7z]) => {
        const zip_type = hasZipC ? 4 : has7zC ? 5 : hasZip ? 1 : hasRar ? 2 : has7z ? 3 : 0;
        if (!zip_type) {
            return handleError(new HoError('not zip'));
        }
        return zipMutex.runExclusive(async () => {
        let is_queue = false;
        let runNum = 0;
        for (let i of zip_pool) {
            if (id.equals(i.fileId) && i.index === index) {
                is_queue = true;
                const realName = `${filePath}/real/${i.name}`;
                if (await fsExists(realName)) {
                    sendWs({
                        type: user.username,
                        data: `${i.name}: ${Math.floor((await stat(realName)).size / 1024 / 1024 * 100) / 100}MB`,
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
        return is_run ? startZip(user, index, id, owner, name, pwd, zip_type) : Promise.resolve();
        });
    });
}

const startTorrent = (user, id, owner, index, hash, engine) => Mongo('update', STORAGEDB, {_id: id}, {$set: {utime: Math.round(new Date().getTime() / 1000)}}).then(async () => {
    const filePath = getFileLocation(owner, id);
    const bufferPath = `${filePath}/${index}`;
    const comPath = `${bufferPath}_complete`;
    let playList = engine.files.map(file => file.path);
    if (playList.length < 1) {
        return handleError(new HoError('empty content!!!'));
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
        return torrentComplete().then(() => handleError(new HoError('unknown index')));
    } else {
        const file = engine.files[tIndex];
        console.log(tIndex);
        console.log(file.name);
        console.log(file.length);
        console.log('torrent real start');
        console.log(bufferPath);
        if (await fsExists(bufferPath)) {
            const size = (await stat(bufferPath)).size;
            console.log(size);
            return (size >= file.length) ? torrentComplete(true, file.path) : new Promise((resolve, reject) => {
                const fileStream = file.createReadStream({start: size});
                fileStream.pipe(FsCreateWriteStream(bufferPath, {flags: 'a'}));
                fileStream.on('end', () => resolve(torrentComplete(true, file.path)));
            });
        } else {
            /*if (isVideo(file.name)) {
                new Promise((resolve, reject) => computeHash(tIndex, engine, (err, hash_ret) => err ? reject(err) : resolve(hash_ret))).then(hash_ret => {
                    console.log(hash_ret);
                    const openSubtitles = new OpenSubtitle({
                        useragent: 'hoder agent v0.1',
                        ssl: true,
                    });
                    return openSubtitles.search({
                        extensions: 'srt',
                        hash: hash_ret.movieHash,
                        filesize: hash_ret.fileSize.toString(),
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
            }*/
            return new Promise((resolve, reject) => {
                const fileStream = file.createReadStream();
                fileStream.pipe(FsCreateWriteStream(bufferPath));
                fileStream.on('end', () => resolve(torrentComplete(true, file.path)));
            });
        }
    }
    async function torrentComplete(is_success=false, exitPath=bufferPath) {
        return torrentMutex.runExclusive(async () => {
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
            if (is_success) {
                await rename(bufferPath, comPath);
                if (isVideo(exitPath) || isDoc(exitPath) || isZipbook(exitPath)) {
                    const dbPath = `${filePath}/real/${exitPath}`;
                    return MediaHandleTool.handleTag(dbPath, {}, PathBasename(exitPath), '', 0, false).then(([mediaType, mediaTag, DBdata]) => {
                        mediaType['fileIndex'] = index;
                        mediaType['realPath'] = exitPath;
                        DBdata['status'] = 9;
                        DBdata[`mediaType.${index}`] = mediaType;
                        console.log(DBdata);
                        return Mongo('update', STORAGEDB, {_id: id}, {$set: DBdata}).then(() => MediaHandleTool.handleMediaUpload(mediaType, filePath, id, user).catch(err => handleError(err, errorMedia, id, mediaType['fileIndex'])));
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
        return handleError(new HoError('not torrent'));
    }
    shortTorrent = shortTorrent[0];
    const filePath = getFileLocation(owner, id);
    let bufferPath = `${filePath}/${fileIndex}`;
    let is_queue = false;
    let engine = null;
    return torrentMutex.runExclusive(async () => {
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
                            for (const [j, v] of torrent_pool[i].engine.files.entries()) {
                                const DPath = `${filePath}/${j}`;
                                const CDPath = `${DPath}_complete`;
                                totalSize += v.length;
                                if (await fsExists(CDPath)) {
                                    totalDSize += v.length;
                                } else if (await fsExists(DPath)) {
                                    totalDSize += (await stat(DPath)).size;
                                }
                            }
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
                                if (await fsExists(bufferPath)) {
                                    if (torrent_pool[i].engine.files[tIndex].length > 0) {
                                        percent = Math.ceil((await stat(bufferPath)).size / torrent_pool[i].engine.files[tIndex].length * 100);
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
                engine = createTorrentEngine(torrent, {
                    tmp: NAS_TMP(ENV_TYPE),
                    path: `${filePath}/real`,
                    connections: TORRENT_CONNECT,
                    uploads: TORRENT_UPLOAD,
                    trackers: BEST_TRACKER_LIST,
                });
                console.log('new engine');
                const rest = () => torrentMutex.runExclusive(() => {
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
                        for (let i = torrent_pool.length - 1; i >= 0; i--) {
                            if (out_shortTorrent === torrent_pool[i].hash) {
                                if (torrent_pool[i].engine) {
                                    torrent_pool[i].engine.destroy();
                                }
                                torrent_pool.splice(i, 1);
                                break;
                            }
                        }
                    }
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
                    return startEngine(fileIndex).then(() => rest());
                } else {
                    console.log('torrent old');
                    for (let i in torrent_pool) {
                        if (torrent_pool[i].hash === shortTorrent) {
                            torrent_pool[i].engine = engine;
                            const runIndex = torrent_pool[i].index;
                            return Promise.all(runIndex.map(v => startEngine(v))).then(() => rest());
                        }
                    }
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
                return Promise.resolve(false);
            }
        }
    });
}

function torrentInfo(magnet, filePath) {
    const engine = createTorrentEngine(magnet, {
        tmp: NAS_TMP(ENV_TYPE),
        path: `${filePath}/real`,
        connections: TORRENT_CONNECT,
        uploads: TORRENT_UPLOAD,
        trackers: BEST_TRACKER_LIST,
    });
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                engine.destroy();
                reject(new HoError('torrent info timeout'));
            }
        }, 120000);
        engine.on('ready', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            console.log(engine);
            const data = {
                files: engine.files,
                name: engine.torrent.name ? engine.torrent.name : 'torrent',
            }
            engine.destroy();
            return resolve(data);
        });
        engine.on('error', err => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            engine.destroy();
            return reject(err);
        });
    });
}

function torrentStop(user, index=false) {
    if (user) {
        const toRemove = [];
        torrent_pool.forEach(i => {
            if (user._id.equals(i.user._id)) {
                console.log('engine stop');
                console.log(i);
                if (i.engine) {
                    i.engine.destroy();
                }
                toRemove.push(i.hash);
            }
        });
        for (let j = torrent_pool.length - 1; j >= 0; j--) {
            if (toRemove.includes(torrent_pool[j].hash)) {
                torrent_pool.splice(j, 1);
            }
        }
    } else {
        if (torrent_pool[index]) {
            console.log(torrent_pool[index]);
            if (torrent_pool[index].engine) {
                torrent_pool[index].engine.destroy();
            }
            const hash = torrent_pool[index].hash;
            for (let j in torrent_pool) {
                if (torrent_pool[j].hash === hash) {
                    torrent_pool.splice(j, 1);
                    break;
                }
            }
        }
    }
    return Promise.resolve();
}

function zipStop(user, index=false) {
    if (user) {
        const toRemove = [];
        zip_pool.forEach(i => {
            if (user._id.equals(i.user._id)) {
                console.log('zip stop');
                console.log(i);
                if (i.run && i.chp) {
                    i.chp.kill('SIGKILL');
                }
                toRemove.push(i.fileId);
            }
        });
        for (let j = zip_pool.length - 1; j >= 0; j--) {
            if (toRemove.some(id => id.equals(zip_pool[j].fileId))) {
                zip_pool.splice(j, 1);
            }
        }
    } else {
        if (zip_pool[index]) {
            console.log(zip_pool[index]);
            if (zip_pool[index].run && zip_pool[index].chp) {
                zip_pool[index].chp.kill('SIGKILL');
            }
            const fileId = zip_pool[index].fileId;
            for (let j in zip_pool) {
                if (fileId.equals(zip_pool[j].fileId)) {
                    zip_pool.splice(j, 1);
                    break;
                }
            }
        }
    }
    return Promise.resolve();
}

async function megaStop(user, index=false) {
    if (user) {
        const toRemove = [];
        for (const i of mega_pool) {
            if (user._id.equals(i.user._id)) {
                console.log('mega stop');
                console.log(i);
                if (i.run && i.chp) {
                    i.chp.kill('SIGKILL');
                }
                await deleteFolderRecursive(i.filePath);
                toRemove.push(i.url);
            }
        }
        for (let j = mega_pool.length - 1; j >= 0; j--) {
            if (toRemove.includes(mega_pool[j].url)) {
                mega_pool.splice(j, 1);
            }
        }
    } else {
        if (mega_pool[index]) {
            console.log(mega_pool[index]);
            if (mega_pool[index].run && mega_pool[index].chp) {
                mega_pool[index].chp.kill('SIGKILL');
                await deleteFolderRecursive(mega_pool[index].filePath);
            }
            const url = mega_pool[index].url;
            for (let j in mega_pool) {
                if (url === mega_pool[j].url) {
                    mega_pool.splice(j, 1);
                    break;
                }
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
                sendWs(`torrent ${i} stop`, 0, 0, true);
                return process('torrent stop', null, i);
            }
        }
        return Promise.resolve();
    }
    const kickZip = () => {
        const kick_time = Math.round((new Date().getTime() - ZIP_DURATION * 1000)/ 1000);
        for (let i in zip_pool) {
            if (zip_pool[i].run && zip_pool[i].time < kick_time) {
                sendWs(`zip ${i} stop`, 0, 0, true);
                return process('zip stop', null, i);
            }
        }
        return Promise.resolve();
    }
    const kickMega = () => {
        const kick_time = Math.round((new Date().getTime() - MEGA_DURATION * 1000)/ 1000);
        for (let i in mega_pool) {
            if (mega_pool[i].run && mega_pool[i].time < kick_time) {
                sendWs(`mega ${i} stop`, 0, 0, true);
                return process('mega stop', null, i);
            }
        }
        return Promise.resolve();
    }
    return kickTorrent().then(() => kickZip()).then(() => kickMega());
}
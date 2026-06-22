import { OPENSUBTITLES_KEY, OPENSUBTITLES_USERNAME, OPENSUBTITLES_PASSWORD } from '../../../ver.js'
import { USERDB, STORAGEDB } from '../constants.js'
import Express from 'express'
import fsModule from 'fs'
const { existsSync: FsExistsSync, unlink: FsUnlink, statSync: FsStatSync, renameSync: FsRenameSync, readdirSync: FsReaddirSync, lstatSync: FsLstatSync, createReadStream: FsCreateReadStream, writeFile: FsWriteFile } = fsModule;
import pathModule from 'path'
const { dirname: PathDirname, basename: PathBasename, join: PathJoin } = pathModule;
import Mkdirp from 'mkdirp'
import readline from 'readline'
const { createInterface } = readline;
import ReadTorrent from 'read-torrent'
import OpenSubtitleRest from 'opensubtitles.com'
//import OpenSubtitle from 'opensubtitles-api'
import Mongo, { objectID } from '../models/mongo-tool.js'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool.js'
import GoogleApi from '../models/api-tool-google.js'
import PlaylistApi from '../models/api-tool-playlist.js'
import Api from '../models/api-tool.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import External/*, { subHdUrl }*/ from '../models/external-tool.js'
import { addPost, extType, extTag, supplyTag, isTorrent, isVideo, isDoc, isZipbook, isSub } from '../util/mime.js'
import { checkLogin, handleError, HoError, isValidString, getFileLocation, getJson, toValidName, checkAdmin, sortList, torrent2Magnet, SRT2VTT, completeZero } from '../util/utility.js'
import sendWs from '../util/sendWs.js'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/2drive/:uid', function(req, res, next){
    console.log('external 2 drive');
    Mongo('find', USERDB, {_id: req.user._id}, {limit: 1}).then(userlist => {
        if (userlist.length < 1) {
            return handleError(new HoError('do not find user!!!'), next);
        }
        if (!userlist[0].auto) {
            return handleError(new HoError('user dont have google drive!!!'), next);
        }
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('cannot find file!!!'), next);
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return handleError(new HoError('file cannot downlad!!!'), next);
            }
            const filePath = getFileLocation(items[0].owner, items[0]._id);
            /*return GoogleApi('list folder', {
                folderId: userlist[0].auto,
                name: 'downloaded',
            }).then(downloadedList => {
                if (downloadedList.length < 1) {
                    return handleError(new HoError('do not have downloaded folder!!!'), next);
                }
                const downloaded = downloadedList[0].id;*/
                const downloaded = userlist[0].auto;
                StorageTagTool.setLatest(items[0]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
                if (items[0].status === 9) {
                    if (items[0]['playList'].length > 0) {
                        let folderArr = [];
                        let fileArr = [];
                        items[0]['playList'].forEach((v, i) => {
                            const comPath = `${filePath}/${i}_complete`;
                            if (FsExistsSync(comPath)) {
                                let d = PathDirname(v);
                                fileArr.push({
                                    name: PathBasename(v),
                                    filePath: comPath,
                                    parent: d,
                                });
                                for (;d !== '.';d = PathDirname(d)) {
                                    for (let j in folderArr) {
                                        if (folderArr[j].key === d) {
                                            folderArr.splice(j, 1);
                                            break;
                                        }
                                    }
                                    folderArr.splice(0, 0, {key: d, name: PathBasename(d), parent: PathDirname(d)});
                                }
                            }
                        });
                        console.log(fileArr);
                        console.log(folderArr);
                        const comNext = index => {
                            index++;
                            if (index < folderArr.length + fileArr.length) {
                                return recur_upload(index);
                            }
                        }
                        function recur_upload(index) {
                            if (index < folderArr.length) {
                                let parent = downloaded;
                                if (folderArr[index].parent !== '.') {
                                    let i = null;
                                    for (i in folderArr) {
                                        if (folderArr[index].parent === folderArr[i].key) {
                                            break;
                                        }
                                    }
                                    parent = folderArr[i].id ? folderArr[i].id : false;
                                }
                                return parent ? GoogleApi('create', {
                                    name: folderArr[index].name,
                                    parent: parent,
                                }).then(metadata => {
                                    console.log(metadata);
                                    folderArr[index].id = metadata.id;
                                }).then(() => comNext(index)) : handleError(new HoError('do not find parent!!!'), next);
                            } else {
                                const fIndex = index - folderArr.length;
                                let parent = downloaded;
                                if (fileArr[fIndex].parent !== '.') {
                                    let i = null;
                                    for (i in folderArr) {
                                        if (fileArr[fIndex].parent === folderArr[i].key) {
                                            break;
                                        }
                                    }
                                    parent = folderArr[i].id ? folderArr[i].id : false;
                                }
                                return parent ? GoogleApi('upload', {
                                    user: req.user,
                                    type: 'auto',
                                    name: fileArr[fIndex].name,
                                    filePath: fileArr[fIndex].filePath,
                                    parent: parent,
                                }).then(() => comNext(index)) : handleError(new HoError('do not find parent!!!'), next);
                            }
                        }
                        if (folderArr.length + fileArr.length > 0) {
                            return recur_upload(0);
                        } else {
                            const zip_filePath = FsExistsSync(`${filePath}_zip`) ? `${filePath}_zip` : FsExistsSync(`${filePath}_7z`) ? `${filePath}_7z` : FsExistsSync(`${filePath}.1.rar`) ? `${filePath}.1.rar` : null;
                            if (zip_filePath) {
                                console.log(zip_filePath);
                                const recur_zip = (index, name) => FsExistsSync(`${filePath}.${index}.rar`) ? GoogleApi('upload', {
                                    user: req.user,
                                    type: 'auto',
                                    name: `${name}.part${index}.rar`,
                                    filePath: `${filePath}.${index}.rar`,
                                    parent: downloaded,
                                }).then(() => recur_zip(index+1, name)) : Promise.resolve();
                                return GoogleApi('upload', {
                                    user: req.user,
                                    type: 'auto',
                                    name: items[0].name,
                                    filePath: zip_filePath,
                                    parent: downloaded,
                                }).then(() => {
                                    const rarName = items[0].name.match(/^(.*)\.part\d+\.rar$/);
                                    if (rarName) {
                                        return recur_zip(2, rarName[1]);
                                    }
                                });
                            } else {
                                const ret_string = items[0].magnet ? decodeURIComponent(items[0].magnet) : items[0].mega ? decodeURIComponent(items[0].mega) : null;
                                if (ret_string) {
                                    console.log(ret_string);
                                    return GoogleApi('upload', {
                                        user: req.user,
                                        type: 'auto',
                                        name: `${items[0].name}.txt`,
                                        body: ret_string,
                                        parent: downloaded,
                                    });
                                }
                            }
                        }
                    }
                } else {
                    return GoogleApi('upload', {
                        user: req.user,
                        type: 'auto',
                        name: items[0].name,
                        filePath: filePath,
                        parent: downloaded,
                    });
                }
            //});
        }).then(() => res.json({apiOK: true}));
    }).catch(err => handleError(err, next));
});

router.get('/2kindle/:uid', function(req, res, next){
    console.log('external 2 kindle');
    Mongo('find', USERDB, {_id: req.user._id}, {limit: 1}).then(userlist => {
        if (userlist.length < 1) {
            return handleError(new HoError('do not find user!!!'), next);
        }
        if (!userlist[0].kindle) {
            return handleError(new HoError('user dont have kindle device!!!'), next);
        }
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('cannot find file!!!'), next);
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return handleError(new HoError('file cannot downlad!!!'), next);
            }
            return GoogleApi('send mail', {
                user: req.user,
                name: items[0].name,
                filePath: getFileLocation(items[0].owner, items[0]._id),
                kindle: `${userlist[0].kindle}@kindle.com`,
            });
        }).then(() => res.json({apiOK: true}));
    }).catch(err => handleError(err, next));
});

router.post('/upload/url', function(req, res, next) {
    console.log('externel upload url');
    const url = isValidString(req.body.url, 'url');
    if (!url) {
        return handleError(new HoError('url is not vaild'), next);
    }
    const addurl = url.match(/^url%3A(.*)/);
    if (addurl) {
        let url_name = toValidName(addurl[1]);
        if (isDefaultTag(normalize(url_name))) {
            url_name = addPost(url_name, '1');
        }
        const json_data = getJson(req.body.type);
        if (json_data === false) {
            return handleError(new HoError('json parse error!!!'), next);
        }
        MediaHandleTool.handleTag('', {
            _id: objectID(),
            name: url_name,
            owner: req.user._id,
            utime: Math.round(new Date().getTime() / 1000),
            url: addurl[1],
            size: 0,
            count: 0,
            first: 1,
            recycle: 0,
            adultonly: (checkAdmin(2 ,req.user) && json_data === 1) ? 1 : 0,
            untag: 1,
            status: 7,
        }, url_name, '', 7).then(([mediaType, mediaTag, DBdata]) => {
            let setTag = new Set();
            setTag.add(normalize(DBdata['name'])).add(normalize(req.user.username));
            if (req.body.path) {
                req.body.path.forEach(p => setTag.add(normalize(p)));
            }
            let optTag = new Set();
            mediaTag.def.forEach(i => setTag.add(normalize(i)));
            mediaTag.opt.forEach(i => optTag.add(normalize(i)));
            let setArr = [];
            setTag.forEach(s => {
                const is_d = isDefaultTag(s);
                if (!is_d) {
                    setArr.push(s);
                } else if (is_d.index === 0) {
                    DBdata['adultonly'] = 1;
                }
            });
            let optArr = [];
            optTag.forEach(o => {
                if (!isDefaultTag(o) && !setArr.includes(o)) {
                    optArr.push(o);
                }
            });
            return Mongo('insert', STORAGEDB, Object.assign(DBdata, {
                tags: setArr,
                [req.user._id]: setArr,
            })).then(item => {
                console.log(item);
                console.log('save end');
                sendWs({
                    type: 'file',
                    data: item[0]._id,
                }, item[0].adultonly);
                return StorageTagTool.getRelativeTag(setArr, req.user, optArr).then(relative => {
                    const reli = relative.length < 5 ? relative.length : 5;
                    if (checkAdmin(2 ,req.user)) {
                        (item[0].adultonly === 1) ? setArr.push('18+') : optArr.push('18+');
                    }
                    (item[0].first === 1) ? setArr.push('first item') : optArr.push('first item');
                    for (let i = 0; i < reli; i++) {
                        const normal = normalize(relative[i]);
                        if (!isDefaultTag(normal)) {
                            if (!setArr.includes(normal) && !optArr.includes(normal)) {
                                optArr.push(normal);
                            }
                        }
                    }
                    res.json({
                        id: item[0]._id,
                        name: item[0].name,
                        select: setArr,
                        option: supplyTag(setArr, optArr),
                        other: [],
                    });
                });
            });
        }).catch(err => handleError(err, next));
    } else {
        let decodeUrl = decodeURIComponent(url);
        const oOID = objectID();
        const filePath = getFileLocation(req.user._id, oOID);
        const shortTorrentMatch = decodeUrl.match(/^magnet:[^&]+/);
        const folderPath = shortTorrentMatch ? filePath : PathDirname(filePath);
        const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : Mkdirp(folderPath);
        let is_media = 0;
        mkfolder().then(() => {
            if (shortTorrentMatch) {
                const shortTorrent = shortTorrentMatch[0];
                if (shortTorrent === 'magnet:stop') {
                    return PlaylistApi('torrent stop', req.user).then(() => res.json({stop: true}));
                } else if (shortTorrent === 'magnet:stopzip') {
                    return PlaylistApi('zip stop', req.user).then(() => res.json({stop: true}));
                } else if (shortTorrent === 'magnet:stopmega') {
                    return PlaylistApi('mega stop', req.user).then(() => res.json({stop: true}));
                } else if (shortTorrent === 'magnet:stopapi') {
                    if (!checkAdmin(1 ,req.user)) {
                        return handleError(new HoError('permission denied!'), next);
                    }
                    return Api('stop').then(() => res.json({stop: true}));
                } else if (shortTorrent === 'magnet:stopgoogle') {
                    if (!checkAdmin(1 ,req.user)) {
                        return handleError(new HoError('permission denied!'), next);
                    }
                    return GoogleApi('stop').then(() => res.json({stop: true}));
                } else {
                    return Mongo('find', STORAGEDB, {magnet: {
                        $regex: shortTorrent.match(/[^:]+$/)[0],
                        $options: 'i',
                    }}, {limit: 1}).then(items => {
                        if (items.length > 0) {
                            return handleError(new HoError('already has one'), next);
                        }
                        return PlaylistApi('torrent info', decodeUrl, filePath).then(info => {
                            let setTag = new Set(['torrent', 'playlist', '播放列表']);
                            let optTag = new Set();
                            let playList = info.files.map(file => {
                                console.log(file.name);
                                const mediaType = extType(file.name);
                                if (mediaType) {
                                    const mediaTag = extTag(mediaType['type']);
                                    mediaTag.def.forEach(i => setTag.add(normalize(i)));
                                    mediaTag.opt.forEach(i => optTag.add(normalize(i)));
                                }
                                return file.path;
                            });
                            if (playList.length < 1) {
                                return handleError(new HoError('empty content!!!'), next);
                            }
                            playList = sortList(playList);
                            return [`Playlist ${info.name}`, setTag, optTag, {
                                magnet: url,
                                playList: playList,
                            }];
                        });
                    });
                }
            } else {
                /*if (decodeUrl.match(/^(https|http):\/\/(www\.youtube\.com|youtu\.be)\//)) {
                    const is_music = decodeUrl.match(/^(.*):music$/);
                    if (is_music) {
                        is_media = 4;
                        console.log('youtube music');
                        decodeUrl = is_music[1];
                        const validUrl = isValidString(decodeUrl, 'url');
                        if (!validUrl) {
                            return handleError(new HoError('url is not vaild'), next);
                        }
                    } else {
                        is_media = 3;
                        console.log('youtube');
                    }
                    return Mongo('find', STORAGEDB, {
                        owner: 'youtube',
                        url: encodeURIComponent(decodeUrl),
                    }, {limit: 2}).then(items => {
                        if (items.length > 0) {
                            for (let i of items) {
                                console.log(i);
                                if (i.thumb && i.status === is_media) {
                                    return handleError(new HoError('already has one'), next);
                                }
                            }
                        }
                        const getYoutubeInfo = detaildata => {
                            if (detaildata.length < 1) {
                                return handleError(new HoError('can not find playlist'), next);
                            }
                            const media_name = detaildata[0].snippet.title;
                            const ctitle = detaildata[0].snippet.channelTitle;
                            console.log(media_name);
                            let setTag = new Set();
                            let optTag = new Set();
                            setTag.add(normalize('youtube'));
                            if (ctitle) {
                                setTag.add(normalize(ctitle));
                            }
                            if (detaildata[0].snippet.tags) {
                                detaildata[0].snippet.tags.forEach(i => setTag.add(normalize(i)));
                            }
                            const mediaTag = extTag(is_music ? 'music' : 'video');
                            mediaTag.def.forEach(i => setTag.add(normalize(i)));
                            mediaTag.opt.forEach(i => optTag.add(normalize(i)));
                            return [media_name, setTag, optTag, {
                                owner: 'youtube',
                                untag: 0,
                                thumb: detaildata[0].snippet.thumbnails.default.url,
                                cid: detaildata[0].snippet.channelId,
                                ctitle,
                                url: decodeUrl,
                            }];
                        }
                        let youtube_id = decodeUrl.match(/list=([^&]+)/);
                        if (youtube_id) {
                            return GoogleApi('y playlist', {
                                id: youtube_id[1],
                                caption: true,
                            }).then(detaildata => getYoutubeInfo(detaildata));
                        } else {
                            youtube_id = decodeUrl.match(/v=([^&]+)/);
                            if (!youtube_id) {
                                return handleError(new HoError('can not find youtube id!!!'), next);
                            }
                            return GoogleApi('y video', {
                                id: youtube_id[1],
                                caption: true,
                            }).then(detaildata => getYoutubeInfo(detaildata));
                        }
                    });
                } else */if (decodeUrl.match(/^(https|http):\/\/yts\.ag\/movie\//)) {
                    return Mongo('find', STORAGEDB, {
                        owner: 'yify',
                        url: encodeURIComponent(decodeUrl),
                    }, {limit: 1}).then(items => {
                        if (items.length > 0) {
                            return handleError(new HoError('already has one'), next);
                        }
                        const yify_id = decodeUrl.match(/[^\/]+$/);
                        if (!yify_id) {
                            return handleError(new HoError('yify url invalid'), next);
                        }
                        is_media = 3;
                        return External.saveSingle('yify', yify_id[0]).then(([media_name, setTag, optTag, owner, thumb, url]) => [media_name, setTag, optTag, {
                            owner: owner,
                            untag: 0,
                            thumb: thumb,
                            url: url,
                        }]);
                    });
                } else if (decodeUrl.match(/^(https|http):\/\/www\.dm5\.com\//)) {
                    return Mongo('find', STORAGEDB, {
                        owner: 'dm5',
                        url: encodeURIComponent(decodeUrl),
                    }, {limit: 1}).then(items => {
                        if (items.length > 0) {
                            return handleError(new HoError('already has one'), next);
                        }
                        const cartoonmad_id = decodeUrl.match(/^(https|http):\/\/www\.dm5\.com\/([^\/]+)/);
                        if (!cartoonmad_id) {
                            return handleError(new HoError('dm5 url invalid'), next);
                        }
                        is_media = 2;
                        return External.saveSingle('dm5', cartoonmad_id[2]).then(([media_name, setTag, optTag, owner, thumb, url]) => [media_name, setTag, optTag, {
                            owner: owner,
                            untag: 0,
                            thumb: thumb,
                            url: url,
                        }]);
                    });
                } else if (decodeUrl.match(/^(https|http):\/\/mega\./)) {
                    return PlaylistApi('mega add', req.user, decodeUrl, filePath, {
                        rest: ([filename, setTag, optTag, db_obj]) => streamClose(filename, setTag, optTag, db_obj),
                        errhandle: err => pureDownload(err),
                    });
                } else {
                    return handleError(new HoError('unknown type'), next);
                }
            }
        }).catch(err => pureDownload(err)).then(result => Array.isArray(result) ? result : []).then(([filename, setTag, optTag, db_obj]) => streamClose(filename, setTag, optTag, db_obj)).catch(err => handleError(err, next));
        function pureDownload(err) {
            handleError(err, 'Url upload');
            return Api('download', req.user, decodeUrl, {
                is_check: false,
                filePath,
                rest: ([pathname, filename]) => {
                    console.log(filename);
                    const getFile = () => !isTorrent(filename) ? Promise.resolve([filename, new Set(), new Set()]) : new Promise((resolve, reject) => ReadTorrent(filePath, (err, torrent) => err ? reject(err) : resolve(torrent))).then(torrent => {
                        const magnet = torrent2Magnet(torrent);
                        if (!magnet) {
                            return handleError(new HoError('magnet create fail'), next);
                        }
                        console.log(magnet);
                        const encodeTorrent = isValidString(magnet, 'url');
                        if (encodeTorrent === false) {
                            return handleError(new HoError('magnet is not vaild'), next);
                        }
                        const shortTorrent = magnet.match(/^magnet:[^&]+/);
                        return new Promise((resolve, reject) => FsUnlink(filePath, err => err ? reject(err) : resolve())).then(() => Mkdirp(filePath)).then(() => Mongo('find', STORAGEDB, {magnet: {
                            $regex: shortTorrent[0].match(/[^:]+$/)[0],
                            $options: 'i',
                        }}, {limit: 1})).then(items => {
                            if (items.length > 0) {
                                return handleError(new HoError('already has one'), next);
                            }
                            return PlaylistApi('torrent info', magnet, filePath).then(info => {
                                let setTag = new Set(['torrent', 'playlist', '播放列表']);
                                let optTag = new Set();
                                let playList = info.files.map(file => {
                                    console.log(file.name);
                                    const mediaType = extType(file.name);
                                    if (mediaType) {
                                        const mediaTag = extTag(mediaType['type']);
                                        mediaTag.def.forEach(i => setTag.add(normalize(i)));
                                        mediaTag.opt.forEach(i => optTag.add(normalize(i)));
                                    }
                                    return file.path;
                                });
                                if (playList.length < 1) {
                                    return handleError(new HoError('empty content!!!'), next);
                                }
                                playList = sortList(playList);
                                return [`Playlist ${info.name}`, setTag, optTag, {
                                    magnet: encodeTorrent,
                                    playList: playList,
                                }];
                            });
                        });
                    });
                    return getFile().then(([filename, setTag, optTag, db_obj]) => streamClose(filename, setTag, optTag, db_obj));
                },
                errHandle: err => handleError(err),
            });
        }
        function streamClose(filename, setTag, optTag, db_obj={}) {
            if (!filename) {
                return Promise.resolve();
            }
            let name = toValidName(filename);
            if (isDefaultTag(normalize(name))) {
                name = addPost(name, '1');
            }
            let size = 0;
            if (FsExistsSync(filePath)) {
                const stats = FsStatSync(filePath);
                if (stats.isFile()) {
                    size = stats['size'];
                }
            }
            const json_data = getJson(req.body.type);
            if (json_data === false) {
                return handleError(new HoError('json parse error!!!'), next);
            }
            const data = {
                _id: oOID,
                name,
                owner: req.user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size,
                count: 0,
                recycle: 0,
                adultonly: (checkAdmin(2 ,req.user) && json_data === 1) ? 1 : 0,
                untag: req.body.hide ? 0 : 1,
                first: req.body.hide ? 0 : 1,
                status: (db_obj && (db_obj['magnet'] || db_obj['mega'])) ? 9 : 0,
            };
            return MediaHandleTool.handleTag(filePath, data, name, '', data['status']).then(([mediaType, mediaTag, DBdata]) => {
                if (is_media) {
                    DBdata['status'] = is_media;
                    let tmp = {}
                    for (let i in DBdata) {
                        if (i !== 'mediaType') {
                            tmp[i] = DBdata[i];
                        }
                    }
                    DBdata = tmp;
                }
                setTag.add(normalize(DBdata['name'])).add(normalize(req.user.username)).add('url upload');
                if (req.body.path) {
                    req.body.path.forEach(p => setTag.add(normalize(p)));
                }
                mediaTag.def.forEach(i => setTag.add(normalize(i)));
                mediaTag.opt.forEach(i => optTag.add(normalize(i)));
                let setArr = [];
                setTag.forEach(s => {
                    const is_d = isDefaultTag(s);
                    if (!is_d) {
                        setArr.push(s);
                    } else if (is_d.index === 0) {
                        DBdata['adultonly'] = 1;
                    }
                });
                let optArr = [];
                optTag.forEach(o => {
                    if (!isDefaultTag(o) && !setArr.includes(o)) {
                        optArr.push(o);
                    }
                });
                return Mongo('insert', STORAGEDB, Object.assign(DBdata, {
                    tags: setArr,
                    [req.user._id]: setArr,
                }, db_obj)).then(item => {
                    console.log(item);
                    console.log('save end');
                    sendWs({
                        type: 'file',
                        data: item[0]._id,
                    }, item[0].adultonly);
                    sendWs({
                        type: req.user.username,
                        data: `${item[0]['name']} upload complete`,
                    }, item[0].adultonly);
                    return StorageTagTool.getRelativeTag(setArr, req.user, optArr).then(relative => {
                        const reli = relative.length < 5 ? relative.length : 5;
                        if (checkAdmin(2 ,req.user)) {
                            (item[0].adultonly === 1) ? setArr.push('18+') : optArr.push('18+');
                        }
                        (item[0].first === 1) ? setArr.push('first item') : optArr.push('first item');
                        for (let i = 0; i < reli; i++) {
                            const normal = normalize(relative[i]);
                            if (!isDefaultTag(normal)) {
                                if (!setArr.includes(normal) && !optArr.includes(normal)) {
                                    optArr.push(normal);
                                }
                            }
                        }
                        const recur_mhandle = index => {
                            const singel_mhandle = () => {
                                if (!isVideo(db_obj['playList'][index]) && !isDoc(db_obj['playList'][index]) && !isZipbook(db_obj['playList'][index])) {
                                    return Promise.resolve();
                                }
                                return MediaHandleTool.handleTag(`${filePath}/real/${db_obj['playList'][index]}`, {}, PathBasename(db_obj['playList'][index]), '', 0).then(([mediaType, mediaTag, DBdata]) => {
                                    mediaType['fileIndex'] = index;
                                    mediaType['realPath'] = db_obj['playList'][index];
                                    DBdata['status'] = 9;
                                    DBdata[`mediaType.${index}`] = mediaType;
                                    console.log(DBdata);
                                    return Mongo('update', STORAGEDB, {_id: item[0]._id}, {$set: DBdata}).then(() => MediaHandleTool.handleMediaUpload(mediaType, filePath, item[0]._id, req.user).catch(err => handleError(err, errorMedia, item[0]._id, mediaType['fileIndex'])))
                                });
                            }
                            return singel_mhandle().then(() => {
                                index++;
                                if (index < db_obj['playList'].length) {
                                    return recur_mhandle(index);
                                }
                            });
                        }
                        const rest_handle = () => (db_obj && db_obj['mega'] && db_obj['playList']) ? recur_mhandle(0) : is_media ? Promise.resolve() : MediaHandleTool.handleMediaUpload(mediaType, filePath, item[0]._id, req.user).catch(err => handleError(err, errorMedia, item[0]._id, mediaType['fileIndex']));
                        return rest_handle().then(() => DBdata['untag'] ? res.json({
                            id: item[0]._id,
                            name: item[0].name,
                            select: setArr,
                            option: supplyTag(setArr, optArr),
                            other: [],
                        }) : res.json({id: item[0]._id}));
                    });
                });
            });
        }
    }
});

router.post('/subtitle/search/:uid/:index(\\d+)?', function(req, res, next) {
    console.log('subtitle search');
    const name = isValidString(req.body.name, 'name');
    if (!name) {
        return handleError(new HoError('name is not vaild'), next);
    }
    const episode_match = req.body.episode ? req.body.episode.match(/^(s(\d*))?(e)?(\d+)$/i) : false;
    let episode = 0;
    let season = 0;
    let episode_1 = null;
    let episode_2 = null;
    let episode_3 = null;
    let episode_4 = null;
    if (episode_match) {
        if (!episode_match[1] && !episode_match[3]) {
            episode = Number(episode_match[4]);
            season = 1;
        } else if (!episode_match[1]){
            episode = Number(episode_match[4]);
            season = 1;
        } else if (!episode_match[3]){
            episode = 1;
            season = Number(`${episode_match[2]}${episode_match[4]}`);
        } else if (episode_match[2] === ''){
            episode = Number(episode_match[4]);
            season = 1;
        } else {
            episode = Number(episode_match[4]);
            season = Number(episode_match[2]);
        }
        if (episode < 10) {
            if (season < 10) {
                episode_1 = ` s0${season}e0${episode}`;
                episode_2 = ` s${season}e0${episode}`;
                episode_3 = ` s0${season}`;
                episode_4 = ` s${season}`;
            } else {
                episode_1 = ` s${season}e0${episode}`;
                episode_2 = ` s${season}`;
            }
        } else {
            if (season < 10) {
                episode_1 = ` s0${season}e${episode}`;
                episode_2 = ` s${season}e${episode}`;
                episode_3 = ` s0${season}`;
                episode_4 = ` s${season}`;
            } else {
                episode_1 = ` s${season}e${episode}`;
                episode_2 = ` s${season}`;
            }
        }
    }
    console.log(season);
    console.log(episode);
    const getId = () => {
        const validId = isValidString(req.params.uid, 'uid');
        return validId ?  Mongo('find', STORAGEDB, {_id: validId}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('cannot find file!!!'), next);
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    return handleError(new HoError('file type error!!!'), next);
                }
                if (items[0].thumb) {
                    return handleError(new HoError('external file, please open video'), next);
                }
                let filePath = getFileLocation(items[0].owner, items[0]._id);
                let fileName = items[0].name;
                let size = items[0].size;
                if (items[0].status === 9) {
                    let fileIndex = 0;
                    if (req.params.index) {
                        fileIndex = Number(req.params.index);
                    } else {
                        for (let i in items[0]['playList']) {
                            if (isVideo(items[0]['playList'][i])) {
                                fileIndex = Number(i);
                                break;
                            }
                        }
                    }
                    if (!isVideo(items[0]['playList'][fileIndex])) {
                        return handleError(new HoError('file type error!!!'), next);
                    }
                    filePath = `${filePath}/${fileIndex}`;
                    if (!FsExistsSync(filePath)) {
                        filePath = `${filePath}_complete`;
                    }
                    fileName = items[0]['playList'][fileIndex].substr(items[0]['playList'][fileIndex].indexOf('/') + 1);
                    //size = FsStatSync(filePath).size;
                }
                return [items[0]._id, filePath, fileName/*, size*/];
            }) : handleError(new HoError('uid is not vaild'), next);
    }
    getId().then(([id, filePath, fileName, size]) => {
        if (fileName) {
            /*const OpenSubtitlesHash = new OpenSubtitle('UserAgent');
            return OpenSubtitlesHash.hash(filePath).then(infos => {
                console.log(infos);
                return [id, filePath, fileName, size, infos.moviehash];
            });*/
            return [id, filePath, fileName];
        } else {
            return [id, filePath];
        }
    }).then(([id, filePath, fileName/*, size, moviehash*/]) => {
        const folderPath = PathDirname(filePath);
        const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : Mkdirp(folderPath);
        const getZh = sub_url => sub_url ? SUB2VTT(sub_url, filePath, false) : Promise.resolve();
        const getEn = sub_en_url => sub_en_url ? SUB2VTT(sub_en_url, filePath, false, 'en') : Promise.resolve();
        let OpenSubtitles = null;
        try {
            OpenSubtitles = new OpenSubtitleRest({apikey: OPENSUBTITLES_KEY, useragent: 'anomopi v1.0'});
            OpenSubtitles.login({username: OPENSUBTITLES_USERNAME, password: OPENSUBTITLES_PASSWORD})
        } catch (err) {
            return handleError(err, next);
        }
        let sub_en_url = null;
        let sub_url = null;
        const getOSsub = (name, fileName) => {
            const os_para = Object.assign({
                languages: 'en,zh-tw,zh-cn,ze',
                ai_translated: 'include',
                machine_translated: 'include',
                order_by: 'votes',
                order_direction: 'desc',
            }, fileName ? {
                query: fileName,
                //moviehash,
            } : name.match(/^tt\d+$/i) ? {
                imdb_id: Number(name.substr(2)),
            } : {query: name}, episode ? {
                episode_number: episode,
                season_number: season,
            } : {})
            console.log(os_para);
            return OpenSubtitles.subtitles(os_para).then(subtitles => {
                console.log(subtitles);
                console.log(subtitles.data);
                subtitles.data.forEach(v => {
                    if (!sub_en_url && v.attributes.language.toLowerCase() === 'en') {
                        sub_en_url = v.attributes.files[0].file_id;
                    } else if (!sub_url && v.attributes.language.toLowerCase() === 'zh-tw') {
                        sub_url = v.attributes.files[0].file_id;
                    } else if (!sub_url && v.attributes.language.toLowerCase() === 'ze') {
                        sub_url = v.attributes.files[0].file_id;
                    } else if (!sub_url && v.attributes.language.toLowerCase() === 'zh-cn') {
                        sub_url = v.attributes.files[0].file_id;
                    }
                });
                if (!sub_url && !sub_en_url) {
                    return false;
                } else {
                    return true;
                }
            });
        }
        const restSub = () => mkfolder().then(() => getZh(sub_url)).then(() => getEn(sub_en_url)).then(() => {
            sendWs({
                type: 'sub',
                data: id,
            }, 0, 0);
            res.json({apiOK: true});
        });
        if (fileName) {
            return getOSsub(name, fileName).then(result => {
                if (result) {
                    return restSub();
                } else {
                    return getOSsub(name).then(result => {
                        if (result) {
                            return restSub();
                        } else {
                            return handleError(new HoError('cannot find subtitle!!!'), next);
                        }
                    });
                }
            });
        } else {
            return getOSsub(name).then(result => {
                if (result) {
                    return restSub();
                } else {
                    return handleError(new HoError('cannot find subtitle!!!'), next);
                }
            });
        }
        function SUB2VTT(choose_subtitle, subPath, is_file, lang='') {
            if (!choose_subtitle) {
                return handleError(new HoError('donot have sub!!!'), next);
            }
            let ext = false;
            if (is_file) {
                ext = isSub(choose_subtitle);
                if (!ext) {
                    return handleError(new HoError('is not sub!!!'), next);
                }
            } else {
                ext = 'srt';
            }
            subPath = subPath.replace('_complete', '');
            if (lang === 'en') {
                subPath = `${subPath}.en`;
            }
            if (FsExistsSync(`${subPath}.srt`)) {
                FsRenameSync(`${subPath}.srt`, `${subPath}.srt1`);
            }
            if (FsExistsSync(`${subPath}.ass`)) {
                FsRenameSync(`${subPath}.ass`, `${subPath}.ass1`);
            }
            if (FsExistsSync(`${subPath}.ssa`)) {
                FsRenameSync(`${subPath}.ssa`, `${subPath}.ssa1`);
            }
            if (is_file) {
                FsRenameSync(choose_subtitle, `${subPath}.${ext}`);
                return SRT2VTT(subPath, ext);
            } else {
                return OpenSubtitles.download({
                    file_id: choose_subtitle
                }).then(subtitles => {
                    console.log(subtitles);
                    return Api('url', subtitles.link, {filePath: `${subPath}.${ext}`}).then(() => SRT2VTT(subPath, ext));
                });
            }
        }
    }).catch(err => handleError(err, next));
});

router.get('/subtitle/fix/:uid/:lang/:adjust/:index(\\d+)?', function(req, res, next) {
    console.log('subtitle fix');
    if (!req.params.adjust.match(/^\-?\d+(\.\d+)?$/)) {
        return handleError(new HoError('adjust time is not vaild'), next);
    }
    const getId = () => {
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('cannot find file!!!'), next);
            }
            if (items[0].status !== 3 && items[0].status !== 9) {
                return handleError(new HoError('file type error!!!'), next);
            }
            let fileIndex = 0;
            if (items[0].status === 9) {
                if (req.params.index) {
                    fileIndex = Number(req.params.index);
                } else {
                    for (let i in items[0]['playList']) {
                        if (isVideo(items[0]['playList'][i])) {
                            fileIndex = Number(i);
                            break;
                        }
                    }
                }
                if (!isVideo(items[0]['playList'][fileIndex])) {
                    return handleError(new HoError('file type error!!!'), next);
                }
            }
            let filePath = getFileLocation(items[0].owner, items[0]._id);
            if (items[0].status === 9) {
                filePath = `${filePath}/${fileIndex}`;
            }
            filePath = (req.params.lang === 'en') ? `${filePath}.en` : filePath;
            return Promise.resolve([items[0]._id, filePath]);
        });
    }
    getId().then(([id, filePath]) => {
        const vtt = `${filePath}.vtt`;
        if (!FsExistsSync(vtt)) {
            return handleError(new HoError('do not have subtitle!!!'), next);
        }
        return new Promise((resolve, reject) => {
            const adjust = Number(req.params.adjust) * 1000;
            let write_data = '';
            const rl = createInterface({
                input: FsCreateReadStream(vtt),
                terminal: false,
            });
            rl.on('line', line => {
                const time_match = line.match(/^(\d\d):(\d\d):(\d\d)\.(\d\d\d) --> (\d\d):(\d\d):(\d\d)\.(\d\d\d)$/);
                if (time_match) {
                    let stime = Number(time_match[1]) * 3600000 + Number(time_match[2]) * 60000 + Number(time_match[3]) * 1000 + Number(time_match[4]);
                    let etime = Number(time_match[5]) * 3600000 + Number(time_match[6]) * 60000 + Number(time_match[7]) * 1000 + Number(time_match[8]);
                    stime = stime + adjust;
                    if (stime < 0) {
                        stime = 0;
                    }
                    etime = etime + adjust;
                    if (etime < 0) {
                        etime = 0;
                    }
                    let temp = completeZero(Math.floor(stime/3600000), 2);
                    stime = stime % 3600000;
                    let atime = `${temp}:`;
                    temp = completeZero(Math.floor(stime/60000), 2);
                    stime = stime % 60000;
                    atime = `${atime}${temp}:`;
                    temp = completeZero(Math.floor(stime/1000), 2);
                    stime = completeZero(stime % 1000, 3);
                    atime = `${atime}${temp}.${stime} --> `;
                    temp = completeZero(Math.floor(etime/3600000), 2);
                    etime = etime % 3600000;
                    atime = `${atime}${temp}:`;
                    temp = completeZero(Math.floor(etime/60000), 2);
                    etime = etime % 60000;
                    atime = `${atime}${temp}:`;
                    temp = completeZero(Math.floor(etime/1000), 2);
                    etime = completeZero(etime % 1000, 3);
                    atime = `${atime}${temp}.${etime}`;
                    //console.log(atime);
                    write_data = `${write_data}${atime}` + "\r\n";
                } else {
                    write_data = `${write_data}${line}` + "\r\n";
                }
            }).on('close', () => resolve(write_data));
        }).then(write_data => new Promise((resolve, reject) => {
            console.log(vtt);
            //console.log(write_data);
            FsWriteFile(vtt, write_data, 'utf8', err => err ? reject(err) : resolve())
        })).then(() => {
            sendWs({
                type: 'sub',
                data: id,
            }, 0, 0);
            res.json({apiOK: true});
        });
    }).catch(err => handleError(err, next));
});

export default router

import { STORAGEDB, STATIC_PATH } from '../constants'
import { ENV_TYPE } from '../../../ver'
import { NAS_TMP } from '../config'
import Express from 'express'
import { existsSync as FsExistsSync, createReadStream as FsCreateReadStream, statSync as FsStatSync, createWriteStream as FsCreateWriteStream, unlink as FsUnlink, renameSync as FsRenameSync, writeFileSync as FsWriteFileSync } from 'fs'
import { dirname as PathDirname } from 'path'
import Mkdirp from 'mkdirp'
import Avconv from 'avconv'
import ReadTorrent from 'read-torrent'
import Redis from '../models/redis-tool'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import PlaylistApi from '../models/api-tool-playlist'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import { checkLogin, isValidString, handleError, getFileLocation, HoError, checkAdmin, toValidName, getJson, torrent2Magnet, sortList, completeZero, SRT2VTT } from '../util/utility'
import { isVideo, isImage, isMusic, addPost, supplyTag, isTorrent, extTag, extType, isDoc, isZipbook, isSub } from '../util/mime'
import sendWs from '../util/sendWs'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.get('/preview/:uid', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('preview file');
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1 || (items[0].status !== 2 && items[0].status !== 3 && items[0].status !== 5 && items[0].status !== 6 && items[0].status !== 10)) {
                return handleError(new HoError('cannot find file!!!'));
            }
            let previewPath = null;
            if (items[0].status === 5) {
                previewPath = `${STATIC_PATH}/document.jpg`;
            } else if (items[0].status === 6) {
                previewPath = `${STATIC_PATH}/presentation.jpg`;
            } else if (items[0].status === 10) {
                previewPath = `${STATIC_PATH}/pdf.png`;
            } else {
                let filePath = getFileLocation(items[0].owner, items[0]._id);
                if (FsExistsSync(`${filePath}_complete`)) {
                    filePath = `${filePath}_complete`;
                }
                previewPath = `${filePath}${(items[0].status === 2) ? '.jpg' : '_s.jpg'}`;
            }
            if (!FsExistsSync(previewPath)) {
                console.log(previewPath);
                return handleError(new HoError('cannot find file!!!'));
            }
            res.writeHead(200, {
                'X-Forwarded-Path': previewPath,
                'X-Forwarded-Type': 'image/jpeg',
            });
            res.end('ok');
            /*res.writeHead(200, {'Content-Type': 'image/jpeg'});
            FsCreateReadStream(previewPath).pipe(res);*/
        }).catch(err => handleError(err, next));
    });
});

router.get('/download/:uid', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('download file');
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length === 0) {
                return handleError(new HoError('cannot find file!!!'));
            }
            let filePath = getFileLocation(items[0].owner, items[0]._id);
            console.log(filePath);
            let ret_string = null;
            if (items[0].status === 9) {
                if (items[0].magnet) {
                    ret_string = decodeURIComponent(items[0].magnet);
                } else if (items[0].mega) {
                    ret_string = decodeURIComponent(items[0].mega);
                } else {
                    filePath = FsExistsSync(`${filePath}_7z`) ? `${filePath}_7z` : FsExistsSync(`${filePath}.1.rar`) ? `${filePath}.1.rar` : `${filePath}_zip`;
                }
            }
            if (!FsExistsSync(filePath) && !ret_string) {
                return handleError(new HoError('cannot find file!!!'));
            }
            StorageTagTool.setLatest(items[0]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
            if (ret_string) {
                const randomName = `${NAS_TMP(ENV_TYPE)}/${Math.floor(Math.random() * 1000)}`;
                FsWriteFileSync(randomName, ret_string, 'utf8');
                res.writeHead(200, {
                    'X-Forwarded-Name': `attachment;filename*=UTF-8''${encodeURIComponent(items[0].name)}.txt`,
                    'X-Forwarded-Path': randomName,
                });
                res.end('ok');
                /*res.writeHead(200, {
                    'Content-Type': 'application/force-download',
                    'Content-disposition': `attachment; filename=${items[0].name}.txt`,
                });
                res.end(ret_string);*/
            } else {
                res.writeHead(200, {
                    'X-Forwarded-Path': filePath,
                    'X-Forwarded-Name': `attachment;filename*=UTF-8''${encodeURIComponent(items[0].name)}`,
                });
                res.end('ok');
                //res.download(filePath, items[0].name);
            }
        }).catch(err => handleError(err, next));
    });
});

router.get('/subtitle/:uid/:lang/:index(\\d+|v)/:fresh(0+)?', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('subtitle file');
        const sendSub = (filePath, fileIndex=false) => {
            filePath = fileIndex === false ? filePath : `${filePath}/${fileIndex}`;
            const subPath = req.params.lang === 'en' ? `${filePath}.en` : filePath;
            res.writeHead(200, {
                'X-Forwarded-Path': FsExistsSync(`${subPath}.vtt`) ? `${subPath}.vtt` : `${STATIC_PATH}/123.vtt`,
                'X-Forwarded-Type': 'text/vtt',
            });
            res.end('ok');
            /*res.writeHead(200, {'Content-Type': 'text/vtt'});
            FsCreateReadStream(FsExistsSync(`${subPath}.vtt`) ? `${subPath}.vtt` : `${STATIC_PATH}/123.vtt`).pipe(res);*/
        }
        const id = req.params.uid.match(/^(you|dym|bil|yif|yuk|ope|lin|iqi|kud|kyu|kdy|kur)_/);
        if (id) {
            const id_valid = isValidString(req.params.uid, 'name');
            if (!id_valid) {
                return handleError(new HoError('external is not vaild'), next);
            }
            let filePath = null;
            switch(id[1]) {
                case 'dym':
                filePath = getFileLocation('dailymotion', id_valid);
                break;
                case 'bil':
                filePath = getFileLocation('bilibili', id_valid);
                break;
                case 'yif':
                filePath = getFileLocation('yify', id_valid);
                break;
                case 'yuk':
                filePath = getFileLocation('youku', id_valid);
                break;
                case 'ope':
                filePath = getFileLocation('openload', id_valid);
                break;
                case 'lin':
                filePath = getFileLocation('line', id_valid);
                break;
                case 'iqi':
                filePath = getFileLocation('iqiyi', id_valid);
                break;
                case 'kud':
                filePath = getFileLocation('kubodrive', id_valid);
                break;
                case 'kyu':
                filePath = getFileLocation('kuboyouku', id_valid);
                break;
                case 'kdy':
                filePath = getFileLocation('kubodymyou', id_valid);
                break;
                case 'kur':
                filePath = getFileLocation('kubourl', id_valid);
                break;
                default:
                filePath = getFileLocation('youtube', id_valid);
                break;
            }
            sendSub(filePath);
        } else {
            const id_valid = isValidString(req.params.uid, 'uid');
            if (!id_valid) {
                return handleError(new HoError('uid is not vaild'), next);
            }
            Mongo('find', STORAGEDB, {_id: id_valid}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('cannot find file!!!'));
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    return handleError(new HoError('file type error!!!'));
                }
                if (items[0].status === 3) {
                    sendSub(getFileLocation(items[0].owner, items[0]._id));
                } else {
                    let fileIndex = 0;
                    if (req.params.index && req.params.index !== 'v') {
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
                        return handleError(new HoError('file type error!!!'));
                    }
                    sendSub(getFileLocation(items[0].owner, items[0]._id), fileIndex);
                }
            }).catch(err => handleError(err, next));
        }
    }, 1);
});

router.get('/video/:uid/file', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('video');
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1 || (items[0].status !== 3 && items[0].status !== 4)) {
                return handleError(new HoError('cannot find video!!!'));
            }
            const videoPath = getFileLocation(items[0].owner, items[0]._id);
            console.log(videoPath);
            let finalPath = `${videoPath}_complete`;
            if (!FsExistsSync(finalPath)) {
                if (!FsExistsSync(videoPath)) {
                    return handleError(new HoError('cannot find file!!!'));
                }
                finalPath = videoPath;
            }
            res.writeHead(200, {
                'X-Forwarded-Path': finalPath,
                'X-Forwarded-Type': 'video/mp4',
                //'X-Forwarded-Name': `attachment; filename=123456.txt`,
            });
            res.end('ok');
            /*const total = FsStatSync(finalPath).size;
            if (req.headers['range']) {
                const parts = req.headers.range.replace(/bytes(=|: )/, '').split('-');
                const partialend = parts[1];
                const start = parseInt(parts[0], 10);
                const end = partialend ? parseInt(partialend, 10) : total - 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': 'video/mp4',
                });
                FsCreateReadStream(finalPath, {
                    start: start,
                    end: end,
                }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': 'video/mp4',
                });
                FsCreateReadStream(finalPath).pipe(res);
            }*/
        }).catch(err => handleError(err, next));
    });
});

router.get('/torrent/:index(\\d+|v)/:uid/:type(images|resources|\\d+)/:number(image\\d+.png|sheet\.css|0+)?', function (req, res, next) {
    checkLogin(req, res, () => {
        console.log('torrent');
        let fileIndex = !isNaN(req.params.index) ? Number(req.params.index) : 0;
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('torrent can not be fund!!!'));
            }
            if (req.params.index === 'v') {
                for (let i in items[0]['playList']) {
                    if (isVideo(items[0]['playList'][i])) {
                        fileIndex = Number(i);
                        break;
                    }
                }
            }
            const bufferPath = `${getFileLocation(items[0].owner, items[0]._id)}/${fileIndex}`;
            const comPath = `${bufferPath}_complete`;
            const type = isImage(items[0].playList[fileIndex]) ? 2 : (isVideo(items[0].playList[fileIndex]) || isMusic(items[0].playList[fileIndex])) ? 1 : (isDoc(items[0].playList[fileIndex]) || isZipbook(items[0].playList[fileIndex])) ? 4 : 3;
            if (type === 1) {
                const outputPath = FsExistsSync(comPath) ? comPath : FsExistsSync(bufferPath) ? bufferPath : null;
                if (FsExistsSync(`${bufferPath}_error`) || !outputPath) {
                    return handleError(new HoError('video error!!!'));
                }
                console.log(outputPath);
                res.writeHead(200, {
                    'X-Forwarded-Path': outputPath,
                    'X-Forwarded-Type': 'video/mp4',
                });
                res.end('ok');
                /*const total = FsStatSync(outputPath).size;
                if (req.headers['range']) {
                    const parts = req.headers.range.replace(/bytes(=|: )/, '').split('-');
                    const partialend = parts[1];
                    const start = parseInt(parts[0], 10);
                    const end = partialend ? parseInt(partialend, 10) : total - 1;
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${total}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': (end - start) + 1,
                        'Content-Type': 'video/mp4',
                    });
                    FsCreateReadStream(outputPath, {
                        start: start,
                        end: end,
                    }).pipe(res);
                } else {
                    res.writeHead(200, {
                        'Content-Length': total,
                        'Content-Type': 'video/mp4',
                    });
                    FsCreateReadStream(outputPath).pipe(res);
                }*/
            } else if (type === 4) {
                const torrentDoc = () => {
                    if (req.params.type === 'images' || req.params.type === 'resources') {
                        if (!req.params.number) {
                            return handleError(new HoError('cannot find img name!!!'));
                        }
                        return Promise.resolve((req.params.type === 'images') ? [`${bufferPath}_doc/images/${req.params.number}`, 'image/jpeg'] : [`${bufferPath}_doc/resources/sheet.css`, 'text/css']);
                    } else {
                        let del = false;
                        if (items[0].present && items[0].present[fileIndex]) {
                            if ((fileIndex === 0 && req.params.type.match(/^0+$/)) || (fileIndex === items[0].playList.length - 1 && Number(req.params.type) === items[0].present[fileIndex])) {
                                del = true;
                            }
                        } else {
                            if (fileIndex === 0 || fileIndex === items[0].playList.length - 1) {
                                del = true;
                            }
                        }
                        const data = del ? [
                            'hdel',
                            items[0]._id.toString(),
                        ] : [
                            'hmset',
                            {[items[0]._id.toString()]: `${req.params.type}&${fileIndex}`},
                        ];
                        const ext = isDoc(items[0].playList[fileIndex]);
                        if (req.params.type.match(/^0+$/)) {
                            req.params.type = (!ext || ext.type === 'present' || ext.type === 'pdf') ? '1' : '';
                        }
                        return Redis(data[0], `record: ${req.user._id}`, data[1]).then(() => !ext ? [`${bufferPath}_img/${req.params.type}`, 'image/jpeg'] : (ext.type === 'present') ? [`${bufferPath}_present/${req.params.type}.svg`, 'image/svg+xml'] : (ext.type === 'pdf') ? [`${bufferPath}_pdf/${completeZero(req.params.type, 3)}.pdf`, 'application/pdf'] : [`${bufferPath}_doc/doc${req.params.type}.html`, 'text/html']);
                    }
                }
                return torrentDoc().then(([docFilePath, docMime]) => {
                    console.log(docFilePath);
                    if (!FsExistsSync(docFilePath)) {
                        return handleError(new HoError('cannot find file!!!'));
                    }
                    res.writeHead(200, {
                        'X-Forwarded-Path': docFilePath,
                        'X-Forwarded-Type': docMime,
                    });
                    res.end('ok');
                    /*res.writeHead(200, {'Content-Type': docMime});
                    FsCreateReadStream(docFilePath).pipe(res);*/
                });
            } else {
                const data = (fileIndex === 0 || fileIndex === items[0].playList.length - 1) ? [
                    'hdel',
                    items[0]._id.toString(),
                ] : [
                    'hmset',
                    {[items[0]._id.toString()]: `0&${fileIndex}`},
                ];
                return Redis(data[0], `record: ${req.user._id}`, data[1]).then(() => {
                    if (FsExistsSync(comPath)) {
                        res.writeHead(200, {
                            'X-Forwarded-Path': comPath,
                            'X-Forwarded-Name': `attachment;filename*=UTF-8''${encodeURIComponent(items[0].playList[fileIndex])}`,
                        });
                        res.end('ok');
                    } else {
                        return handleError(new HoError('need download first!!!'));
                    }
                    //FsExistsSync(comPath) ? res.download(comPath, items[0].playList[fileIndex]) : handleError(new HoError('need download first!!!'))
                });
            }
        }).catch(err => handleError(err, next));
    });
});

router.get('/image/:uid/:type(file|images|resources|\\d+)/:number(image\\d+.png||sheet\.css)?', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('image');
        const id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild'), next);
        }
        Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('cannot find file!!!'));
            }
            const filePath = getFileLocation(items[0].owner, items[0]._id);
            const getRecord = () => {
                if (!items[0].present && items[0].status !== 5 && items[0].status !== 6) {
                    return Promise.resolve([filePath, 'image/jpeg']);
                }
                if (req.params.type === 'images' || req.params.type === 'resources') {
                    if (!req.params.number) {
                        return handleError(new HoError('cannot find img name!!!'));
                    }
                    return Promise.resolve((req.params.type === 'images') ? [`${filePath}_doc/images/${req.params.number}`, 'image/jpeg'] : [`${filePath}_doc/resources/sheet.css`, 'text/css']);
                } else if (!isNaN(req.params.type)) {
                    console.log('image record');
                    const data = (req.params.type === '1' || req.params.type === items[0].present.toString()) ? [
                        'hdel',
                        items[0]._id.toString(),
                    ] : [
                        'hmset',
                        {[items[0]._id.toString()]: req.params.type},
                    ];
                    if (items[0].status === 5 && req.params.type === '1') {
                        req.params.type = '';
                    }
                    return Redis(data[0], `record: ${req.user._id}`, data[1]).then(() => items[0].status === 6 ? [`${filePath}_present/${req.params.type}.svg`, 'image/svg+xml'] : items[0].status === 5 ? [`${filePath}_doc/doc${req.params.type}.html`, 'text/html'] : items[0].status === 10 ? [`${filePath}_pdf/${completeZero(req.params.type, 3)}.pdf`, 'application/pdf'] : [`${filePath}_img/${req.params.type}`, 'image/jpeg']);
                } else {
                    console.log('image settime');
                    return Redis('hget', `record: ${req.user._id}`, items[0]._id.toString()).then(item => items[0].status === 6 ? [item ? `${filePath}_present/${item}.svg` : `${filePath}_present/1.svg`, 'image/svg+xml'] : items[0].status === 5 ? [(item && item !== '1') ? `${filePath}_doc/doc${item}.html` : `${filePath}_doc/doc.html`, 'text/html'] : items[0].status === 10 ? [item ? `${filePath}_pdf/${completeZero(item, 3)}.pdf` : `${filePath}_pdf/001.pdf`, 'application/pdf'] : [item ? `${filePath}_img/${item}}` : `${filePath}_img/1`, 'image/jpeg']);
                }
            }
            return getRecord().then(([docFilePath, docMime]) => {
                console.log(docFilePath);
                if (!FsExistsSync(docFilePath)) {
                    return handleError(new HoError('cannot find file!!!'));
                }
                res.writeHead(200, {
                    'X-Forwarded-Path': docFilePath,
                    'X-Forwarded-Type': docMime,
                });
                res.end('ok');
                //res.writeHead(200, {'Content-Type': docMime});
                //FsCreateReadStream(docFilePath).pipe(res);
            });
        }).catch(err => handleError(err, next));
    }, 1);
});

router.post('/upload/file', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('upload file');
        console.log(req.files);
        const oOID = objectID();
        const filePath = getFileLocation(req.user._id, oOID);
        const mkdir = folderPath => !FsExistsSync(folderPath) ? new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve())) : Promise.resolve();
        mkdir(PathDirname(filePath)).then(() => new Promise((resolve, reject) => {
            const stream = FsCreateReadStream(req.files.file.path);
            stream.on('error', err => reject(err));
            stream.on('close', () => isTorrent(req.files.file.name) ? new Promise((resolve2, reject2) => ReadTorrent(filePath, (err, torrent) => err ? reject2(err) : resolve2(torrent))).then(torrent => {
                const magnet = torrent2Magnet(torrent);
                if (!magnet) {
                    return handleError(new HoError('magnet create fail'));
                }
                console.log(magnet);
                const encodeTorrent = isValidString(magnet, 'url');
                if (encodeTorrent === false) {
                    return handleError(new HoError('magnet is not vaild'));
                }
                const shortTorrent = magnet.match(/^magnet:[^&]+/);
                if (!shortTorrent) {
                    return handleError(new HoError('magnet create fail'));
                }
                return new Promise((resolve2, reject2) => FsUnlink(filePath, err => err ? reject2(err) : resolve2())).then(() => new Promise((resolve2, reject2) => Mkdirp(filePath, err => err ? reject2(err) : resolve2()))).then(() => Mongo('find', STORAGEDB, {magnet: {
                    $regex: shortTorrent[0].match(/[^:]+$/)[0],
                    $options: 'i',
                }}, {limit: 1})).then(items => {
                    if (items.length > 0) {
                        return handleError(new HoError('already has one'));
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
                            return handleError(new HoError('empty content!!!'));
                        }
                        playList = sortList(playList);
                        return resolve([`Playlist ${info.name}`, setTag, optTag, {
                            magnet: encodeTorrent,
                            playList: playList,
                        }]);
                    });
                });
            }) : resolve([req.files.file.name, new Set(), new Set(), {}]));
            stream.pipe(FsCreateWriteStream(filePath));
        })).then(([filename, setTag, optTag, db_obj]) => new Promise((resolve, reject) => FsUnlink(req.files.file.path, err => {
            if (err) {
                console.log(filePath);
                handleError(err, 'Upload file');
            }
            return resolve();
        })).then(() => {
            let name = toValidName(filename);
            if (isDefaultTag(normalize(name))) {
                name = addPost(name, '1');
            }
            return MediaHandleTool.handleTag(filePath, {
                _id: oOID,
                name: name,
                owner: req.user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size: db_obj['magnet'] ? 0 : req.files.file.size,
                count: 0,
                first: 1,
                recycle: 0,
                adultonly: (checkAdmin(2 ,req.user) && JSON.parse(req.body.type) === 1) ? 1 : 0,
                untag: 1,
                status: db_obj['magnet'] ? 9 : 0,
            }, name, '', 0).then(([mediaType, mediaTag, DBdata]) => {
                const isPreview = () => (mediaType.type === 'video') ? new Promise((resolve, reject) => {
                    let is_preview = true;
                    Avconv(['-i', filePath]).once('exit', function(exitCode, signal, metadata2) {
                        if (metadata2 && metadata2.input && metadata2.input.stream) {
                            for (let m of metadata2.input.stream[0]) {
                                console.log(m.type);
                                console.log(m.codec);
                                if (m.type === 'video' && m.codec !== 'h264') {
                                    is_preview = false;
                                    break;
                                }
                            }
                        }
                        if (is_preview) {
                            DBdata['status'] = 3;
                        }
                        return resolve();
                    });
                }) : Promise.resolve();
                return isPreview().then(() => {
                    setTag.add(normalize(DBdata['name'])).add(normalize(req.user.username));
                    if (req.body.path) {
                        const bodyPath = getJson(req.body.path);
                        if (bodyPath === false) {
                            return handleError(new HoError('json parse error!!!'));
                        }
                        if (Array.isArray(bodyPath) && bodyPath.length > 0) {
                            bodyPath.forEach(p => setTag.add(normalize(p)));
                        }
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
                            return MediaHandleTool.handleMediaUpload(mediaType, filePath, item[0]['_id'], req.user).then(() => res.json({
                                id: item[0]._id,
                                name: item[0].name,
                                select: setArr,
                                option: supplyTag(setArr, optArr),
                                other: [],
                            })).catch(err => handleError(err, errorMedia, item[0]['_id'], mediaType['fileIndex']));
                        });
                    });
                });
            });
        })).catch(err => handleError(err, next));
    });
});

router.post('/upload/subtitle/:uid/:index(\\d+)?', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('upload subtitle');
        console.log(req.files);
        if (req.files.file.size > (10 * 1024 * 1024)) {
            return handleError(new HoError('size too large!!!'), next);
        }
        const ext = isSub(req.files.file.name);
        if (!ext) {
            return handleError(new HoError('not valid subtitle!!!'), next);
        }
        const convertSub = (filePath, id) => new Promise((resolve, reject) => FsUnlink(req.files.file.path, err => err ? reject(err) : resolve())).then(() => SRT2VTT(filePath, ext).then(() => {
            sendWs({
                type: 'sub',
                data: id,
            }, 0, 0);
            res.json({apiOK: true});
        }));
        const saveSub = (filePath, id) => {
            const folderPath = PathDirname(filePath);
            const mkFolder = filePath => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
            return mkFolder().then(() => {
                if (FsExistsSync(`${filePath}.srt`)) {
                    FsRenameSync(`${filePath}.srt`, `${filePath}.srt1`);
                }
                if (FsExistsSync(`${filePath}.ass`)) {
                    FsRenameSync(`${filePath}.ass`, `${filePath}.ass1`);
                }
                if (FsExistsSync(`${filePath}.ssa`)) {
                    FsRenameSync(`${filePath}.ssa`, `${filePath}.ssa1`);
                }
                return new Promise((resolve, reject) => {
                    const stream = FsCreateReadStream(req.files.file.path);
                    stream.on('error', err => reject(err));
                    stream.on('close', () => resolve());
                    stream.pipe(FsCreateWriteStream(`${filePath}.${ext}`));
                }).then(() => convertSub(filePath, id));
            });
        }
        const idMatch = req.params.uid.match(/^(you|dym|bil|yuk|ope|lin|iqi|kud|kyu|kdy|kur)_/);
        if (idMatch) {
            let ex_type = 'youtube';
            switch(idMatch[1]) {
                case 'dym':
                ex_type = 'dailymotion';
                break;
                case 'bil':
                ex_type = 'bilibili';
                break;
                case 'yuk':
                ex_type = 'youku';
                break;
                case 'ope':
                ex_type = 'openload';
                break;
                case 'lin':
                ex_type = 'line';
                break;
                case 'iqi':
                ex_type = 'iqiyi';
                break;
                case 'kud':
                ex_type = 'kubodrive';
                break;
                case 'kyu':
                ex_type = 'kuboyouku';
                break;
                case 'kdy':
                ex_type = 'kubodymyou';
                break;
                case 'kur':
                ex_type = 'kubourl';
                break;
            }
            const id = isValidString(req.params.uid, 'name');
            if (!id) {
                return handleError(new HoError('external is not vaild'), next);
            }
            const filePath = getFileLocation(ex_type, id);
            const json_data = getJson(req.body.lang);
            if (json_data === false) {
                return handleError(new HoError('json parse error!!!'), next);
            }
            saveSub((json_data === 'en') ? `${filePath}.en` : filePath, id).catch(err => handleError(err, next));
        } else {
            const id = isValidString(req.params.uid, 'uid');
            if (!id) {
                return handleError(new HoError('uid is not vaild'), next);
            }
            Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
                if (items.length < 1 ) {
                    return handleError(new HoError('file not exist!!!'));
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    return handleError(new HoError('file type error!!!'));
                }
                if (items[0].thumb) {
                    return handleError(new HoError('external file, please open video'));
                }
                let filePath = getFileLocation(items[0].owner, items[0]._id);
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
                        return handleError(new HoError('file type error!!!'));
                    }
                    filePath = `${filePath}/${fileIndex}`;
                }
                const json_data = getJson(req.body.lang);
                if (json_data === false) {
                    return handleError(new HoError('json parse error!!!'));
                }
                return saveSub((json_data === 'en') ? `${filePath}.en` : filePath, items[0]._id);
            }).catch(err => handleError(err, next));
        }
    });
});

export default router

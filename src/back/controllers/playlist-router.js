import { STORAGEDB } from '../constants'
import { ENV_TYPE } from '../../../ver'
import { STREAM_LIMIT } from '../config'
import Express from 'express'
import Child_process from 'child_process'
import Avconv from 'avconv'
import { basename as PathBasename, dirname as PathDirname } from 'path'
import { existsSync as FsExistsSync, unlink as FsUnlink, createReadStream as FsCreateReadStream, createWriteStream as FsCreateWriteStream, statSync as FsStatSync } from 'fs'
import Mongo, { objectID } from '../models/mongo-tool'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool'
import PlaylistApi from '../models/api-tool-playlist'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import { checkLogin, isValidString, handleError, handleReject, HoError, getFileLocation, checkAdmin, toValidName } from '../util/utility'
import { extType, isVideo, supplyTag, addPost } from '../util/mime'
import sendWs from '../util/sendWs'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.put('/join', function(req, res, next){
    console.log('join playlist');
    let uids = [];
    req.body.uids.forEach(i => {
        const id = isValidString(i, 'uid');
        if (id) {
            uids.push(id);
        }
    });
    if (uids.length < 2) {
        handleError(new HoError('must large than one split'), next);
    }
    let join_items = [];
    Promise.all(uids.map(u => Mongo('find', STORAGEDB, {_id: u}, {limit: 1}))).then(items => {
        let join_items = [];
        items.forEach(i => {
            if (i.length > 0) {
                join_items.push(i[0]);
            }
        });
        if (join_items.length < 2) {
            return handleReject(new HoError('must large than one split'));
        }
        return join_items;
    }).then(join_items => {
        let main_match = false;
        for (let i of join_items) {
            main_match = i['name'].match(/^(.*)\.(part0*1\.(rar)|(7z)\.0*1|(zip)\.0*1)$/i);
            if (main_match) {
                break;
            }
        }
        if (!main_match) {
            return handleReject(new HoError('need the first split'));
        }
        const zip_type = main_match[3] ? 2 : main_match[4] ? 3 : 1;
        const pattern = zip_type === 2 ? new RegExp('\\.part(\\d+)\\.rar' + '$', 'i') : zip_type === 3 ? new RegExp('\\.7z\\.(\\d+)' + '$', 'i') : new RegExp('\\.zip\\.(\\d+)' + '$', 'i');
        let order_items = {};
        for (let i of join_items) {
            if (i['name'].substr(0, main_match[1].length) === main_match[1]) {
                const sub_match = i['name'].match(pattern);
                if (sub_match) {
                    order_items[Number(sub_match[1])] = i;
                }
            }
        }
        if (Object.keys(order_items).length < 2) {
            return handleReject(new HoError('must large than one split'));
        }
        return [order_items, zip_type];
    }).then(([order_items, zip_type]) => {
        StorageTagTool.setLatest(order_items[1]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: order_items[1]._id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
        if (zip_type === 2) {
            //copy
            const filePath1 = getFileLocation(order_items[1].owner, order_items[1]._id);
            function recur_copy(index) {
                if (order_items[index]) {
                    let filePath = `${getFileLocation(order_items[index].owner, order_items[index]._id)}.1.rar`;
                    if (!FsExistsSync(filePath)) {
                        filePath = getFileLocation(order_items[index].owner, order_items[index]._id);
                    }
                    const stream = FsCreateReadStream(filePath);
                    return new Promise((resolve, reject) => {
                        stream.on('error', err => {
                            console.log(`copy file:${filePath} error!!!`);
                            return reject(err);
                        });
                        stream.on('close', () => {
                            index++;
                            return (index <= Object.keys(order_items).length) ? resolve(recur_copy(index)) : resolve();
                        });
                        stream.pipe(FsCreateWriteStream(`${filePath1}.${index}.rar`));
                    });
                }
            }
            const mediaType = extType(order_items[1]['name']);
            return recur_copy(2).then(() => MediaHandleTool.handleMediaUpload(mediaType, filePath1, order_items[1]._id, req.user).then(() => res.json({
                id: order_items[1]._id,
                name: order_items[1].name,
            })).catch(err => handleReject(err, errorMedia, order_items[1]._id, mediaType['fileIndex'])));
        } else {
            //cat
            const ext = zip_type === 3 ? '_7z' : '_zip';
            let cmdline = 'cat';
            for (let i = 1; i <= Object.keys(order_items).length; i++) {
                if (order_items[i]) {
                    let joinPath = `${getFileLocation(order_items[i].owner, order_items[i]._id)}${ext}`;
                    if (!FsExistsSync(joinPath)) {
                        joinPath = getFileLocation(order_items[i].owner, order_items[i]._id);
                    }
                    cmdline = `${cmdline} ${joinPath}`;
                } else {
                    break;
                }
            }
            const filePath = getFileLocation(order_items[1].owner, order_items[1]._id);
            const cFilePath = `${filePath}${ext}_c`;
            cmdline = `${cmdline} >> ${cFilePath}`;
            console.log(cmdline);
            const unlinkC = () => FsExistsSync(cFilePath) ? new Promise((resolve, reject) => FsUnlink(cFilePath, err => err ? reject(err) : resolve())) : Promise.resolve();
            const mediaType = extType(order_items[1]['name']);
            return unlinkC().then(() => new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output)))).then(output => MediaHandleTool.handleMediaUpload(mediaType, filePath, order_items[1]._id, req.user).then(() => res.json({
                id: order_items[1]._id,
                name: order_items[1].name,
            })).catch(err => handleReject(err, errorMedia, order_items[1]._id, mediaType['fileIndex'])));
        }
    }).catch(err => handleError(err, next));
});

router.post('/copy/:uid/:index(\\d+)', function(req, res, next) {
    console.log('torrent copy');
    const index = Number(req.params.index);
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        if (items.length < 1) {
            return handleReject(new HoError('torrent can not be found!!!'));
        }
        if (items[0].status !== 9) {
            return handleReject(new HoError('file type error!!!'));
        }
        if (!items[0].playList[index]) {
            return handleReject(new HoError('torrent index can not be found!!!'));
        }
        const origPath = `${getFileLocation(items[0].owner, items[0]._id)}/${index}_complete`;
        if (!FsExistsSync(origPath)) {
            return handleReject(new HoError('please download first!!!'));
        }
        const oOID = objectID();
        const filePath = getFileLocation(req.user._id, oOID);
        const folderPath = PathDirname(filePath);
        const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
        return mkfolder().then(() => new Promise((resolve, reject) => {
            const stream = FsCreateReadStream(origPath);
            stream.on('error', err => reject(err));
            stream.on('close', () => resolve());
            stream.pipe(FsCreateWriteStream(filePath));
        })).then(() => {
            let name = toValidName(PathBasename(items[0].playList[index]));
            if (isDefaultTag(normalize(name))) {
                name = addPost(name, '1');
            }
            return MediaHandleTool.handleTag(filePath, {
                _id: oOID,
                name: name,
                owner: req.user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size: FsStatSync(origPath)['size'],
                count: 0,
                first: 1,
                recycle: 0,
                adultonly: (checkAdmin(2 ,req.user) && items[0]['adultonly'] === 1) ? 1 : 0,
                untag: 1,
                status: 0,
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
                            if (mediaType.ext === 'mp4') {
                                mediaType = false;
                                if (FsExistsSync(origPath + '_s.jpg')) {
                                    new Promise((resolve, reject) => {
                                        const streamJpg = FsCreateReadStream(`${origPath}_s.jpg`);
                                        streamJpg.on('error', err => reject(err));
                                        streamJpg.pipe(FsCreateWriteStream(`${filePath}_s.jpg`));
                                    }).catch(err => handleError(err, 'Save jpg'));
                                }
                            }
                        }
                        return resolve();
                    });
                }) : Promise.resolve();
                return isPreview().then(() => {
                    let setTag = new Set();
                    let optTag = new Set();
                    setTag.add(normalize(DBdata['name'])).add(normalize(req.user.username));
                    if (req.body.path) {
                        req.body.path.forEach(p => setTag.add(normalize(p)));
                    }
                    if (items[0].tags) {
                        items[0].tags.forEach(i => {
                            if (i !== '壓縮檔' && i !== 'zip'&& i !== '播放列表' && i !== 'playlist') {
                                setTag.add(normalize(i));
                            }
                        });
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
                            return MediaHandleTool.handleMediaUpload(mediaType, filePath, item[0]['_id'], req.user).then(() => res.json({
                                id: item[0]._id,
                                name: item[0].name,
                                select: setArr,
                                option: supplyTag(setArr, optArr),
                                other: [],
                            })).catch(err => handleReject(err, errorMedia, item[0]['_id'], mediaType['fileIndex']));
                        });
                    });
                });
            });
        });
    }).catch(err => handleError(err, next));
});

router.get('/all/download/:uid', function(req, res, next) {
    console.log('torrent all downlad');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        if (items.length === 0) {
            return handleReject(new HoError('playlist can not be fund!!!'));
        }
        const filePath = getFileLocation(items[0].owner, items[0]._id);
        let queueItems = [];
        for (let i in items[0]['playList']) {
            const bufferPath = `${filePath}/${i}`;
            if (FsExistsSync(`${bufferPath}_complete`)) {
                continue;
            } else if (FsExistsSync(`${bufferPath}_error`)) {
                continue;
            } else {
                queueItems.push(i);
            }
        }
        StorageTagTool.setLatest(items[0]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
        if (queueItems.length > 0) {
            console.log(queueItems);
            const recur_queue = (index, pType) => {
                const qt = () => items[0]['magnet'] ? PlaylistApi('torrent add', req.user, decodeURIComponent(items[0]['magnet']), queueItems[index], items[0]._id, items[0].owner, pType) : PlaylistApi('zip add', req.user, queueItems[index], items[0]._id, items[0].owner, items[0]['playList'][queueItems[index]], items[0].pwd);
                return qt().then(() => {
                    index++;
                    if (index < queueItems.length) {
                        return recur_queue(index, 2);
                    }
                });
            }
            return recur_queue(0, 1).then(() => res.json({complete: false}));
        } else {
            res.json({complete: true});
        }
    }).catch(err => handleError(err, next));
});

router.get('/check/:uid/:index(\\d+|v)/:size(\\d+)', function(req, res, next) {
    console.log('torrent check');
    let index = !isNaN(req.params.index) ? Number(req.params.index) : 0;
    const bufferSize = Number(req.params.size);
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        if (items.length < 1) {
            return handleReject(new HoError('torrent can not be fund!!!'));
        }
        if (req.params.index === 'v') {
            for (let i in items[0]['playList']) {
                if (isVideo(items[0]['playList'][i])) {
                    index = Number(i);
                    break;
                }
            }
        }
        const filePath = getFileLocation(items[0].owner, items[0]._id);
        const bufferPath = `${filePath}/${index}`;
        if (FsExistsSync(`${bufferPath}_error`)) {
            return handleReject(new HoError('torrent video error!!!'));
        }
        const realPath = `${filePath}/real/${items[0]['playList'][index]}`;
        const comPath = `${bufferPath}_complete`;
        const qt = () => items[0]['magnet'] ? PlaylistApi('torrent add', req.user, decodeURIComponent(items[0]['magnet']), index, items[0]._id, items[0].owner) : PlaylistApi('zip add', req.user, index, items[0]._id, items[0].owner, items[0]['playList'][index], items[0].pwd);
        if (FsExistsSync(comPath)) {
            res.json({
                newBuffer: true,
                complete: true,
                ret_size: FsStatSync(comPath).size,
            });
        } else if (FsExistsSync(bufferPath)) {
            const total = FsStatSync(bufferPath).size;
            console.log(total);
            res.json({
                newBuffer: (total > bufferSize + 10 * 1024 * 1024) ? true : false,
                complete: false,
                ret_size: total,
            });
            return qt();
        } else {
            res.json({start: true});
            return qt();
        }
    }).catch(err => handleError(err, next));
});

export default router
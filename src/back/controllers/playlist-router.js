import { STORAGEDB } from '../constants'
import { ENV_TYPE } from '../../../ver'
import { STREAM_LIMIT } from '../config'
import Express from 'express'
import Child_process from 'child_process'
import { existsSync as FsExistsSync, unlink as FsUnlink, createReadStream as FsCreateReadStream, createWriteStream as FsCreateWriteStream, statSync as FsStatSync } from 'fs'
import Mongo from '../models/mongo-tool'
import MediaHandleTool, { errorMedia } from '../models/mediaHandle-tool'
import PlaylistApi from '../models/api-tool-playlist'
import TagTool from '../models/tag-tool'
import { checkLogin, isValidString, handleError, HoError, getFileLocation, checkAdmin } from '../util/utility'
import { extType, isVideo, supplyTag } from '../util/mime'
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
        handleError(new HoError('must large than one split'));
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
            handleError(new HoError('must large than one split'));
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
            handleError(new HoError('need the first split'));
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
            handleError(new HoError('must large than one split'));
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
            })).catch(err => handleError(err, errorMedia, order_items[1]._id, mediaType['fileIndex'])));
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
            })).catch(err => handleError(err, errorMedia, order_items[1]._id, mediaType['fileIndex'])));
        }
    }).catch(err => handleError(err, next));
});

router.get('/all/download/:uid', function(req, res, next) {
    console.log('torrent all downlad');
    Mongo('find', STORAGEDB, {_id: isValidString(req.params.uid, 'uid', 'uid is not vaild')}, {limit: 1}).then(items => {
        if (items.length === 0) {
            handleError(new HoError('playlist can not be fund!!!'));
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
    Mongo('find', STORAGEDB, {_id: isValidString(req.params.uid, 'uid', 'uid is not vaild')}, {limit: 1}).then(items => {
        if (items.length < 1) {
            handleError(new HoError('torrent can not be fund!!!'));
        }
        if (req.params.index === 'v') {
            for (let i in items[0]['playList']) {
                if (isVideo(items[0]['playList'][i])) {
                    index = i;
                    break;
                }
            }
        }
        const filePath = getFileLocation(items[0].owner, items[0]._id);
        const bufferPath = `${filePath}/${index}`;
        if (FsExistsSync(`${bufferPath}_error`)) {
            handleError(new HoError('torrent video error!!!'));
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
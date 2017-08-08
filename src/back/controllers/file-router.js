import { STORAGEDB, NOISE_TIME } from '../constants'
import Express from 'express'
import { existsSync as FsExistsSync, unlink as FsUnlink } from 'fs'
import MediaHandleTool, { errorMedia, completeMedia } from '../models/mediaHandle-tool'
import { googleBackup } from '../models/api-tool-google'
import Mongo from '../models/mongo-tool'
import TagTool from '../models/tag-tool'
import { checkLogin, handleError, HoError, getFileLocation, checkAdmin, deleteFolderRecursive, isValidString } from '../util/utility'
import sendWs from '../util/sendWs'
import { supplyTag, isVideo } from '../util/mime'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.put('/edit/:uid', function(req, res, next){
    console.log('edit file');
    MediaHandleTool.editFile(req.params.uid, req.body.name, req.user).then(result => {
        StorageTagTool.setLatest(result.id, req.session).then(() => Mongo('update', STORAGEDB, {_id: result.id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
        sendWs({
            type: 'file',
            data: result.id,
        }, result.adultonly);
        res.json(Object.assign(result, {
            adultonly: null,
            option: supplyTag(result.select, result.option, result.other),
        }));
    }).catch(err => handleError(err, next));
});

router.delete('/del/:uid/:recycle', function(req, res, next) {
    console.log('del file');
    Mongo('find', STORAGEDB, {_id: isValidString(req.params.uid, 'uid', 'uid is not vaild')}, {limit: 1}).then(items => {
        if (items.length === 0) {
            handleError(new HoError('file can not be fund!!!'));
        }
        const rest = () => Mongo('remove', STORAGEDB, {
            _id: items[0]._id,
            $isolated: 1,
        }).then(item2 => {
            console.log('perm delete file');
            sendWs({
                type: 'file',
                data: items[0]._id,
            }, 1, 1);
            res.json({apiOK: true});
        });
        const filePath = getFileLocation(items[0].owner, items[0]._id);
        if (req.params.recycle === '1' && checkAdmin(1, req.user)) {
            if (items[0].recycle !== 1) {
                handleError(new HoError('recycle file first!!!'));
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return rest();
            } else if (items[0].status === 9) {
                deleteFolderRecursive(filePath);
                const zip_filePath = FsExistsSync(`${filePath}_zip`) ? `${filePath}_zip` : FsExistsSync(`${filePath}_7z`) ? `${filePath}_7z` : FsExistsSync(`${filePath}.1.rar`) ? `${filePath}.1.rar` : null;
                if (zip_filePath) {
                    let del_arr = [zip_filePath];
                    if (FsExistsSync(`${filePath}_zip_c`)) {
                        del_arr.push(`${filePath}_zip_c`);
                    } else if (FsExistsSync(`${filePath}_7z_c`)) {
                        del_arr.push(`${filePath}_7z_c`);
                    } else {
                        let rIndex = 2;
                        while (FsExistsSync(`${filePath}.${rIndex}.rar`)) {
                            del_arr.push(`${filePath}.${rIndex}.rar`);
                            rIndex++;
                        }
                    }
                    console.log(del_arr);
                    return Promise.all(del_arr.map(d => new Promise((resolve, reject) => FsUnlink(d, err => err ? reject(err) : resolve())))).then(() => rest());
                } else {
                    return rest();
                }
            } else {
                let del_arr = [filePath];
                if (FsExistsSync(`${filePath}.jpg`)) {
                    del_arr.push(`${filePath}.jpg`);
                }
                if (FsExistsSync(`${filePath}_s.jpg`)) {
                    del_arr.push(`${filePath}_s.jpg`);
                }
                if (FsExistsSync(`${filePath}.srt`)) {
                    del_arr.push(`${filePath}.srt`);
                }
                if (FsExistsSync(`${filePath}.srt1`)) {
                    del_arr.push(`${filePath}.srt1`);
                }
                if (FsExistsSync(`${filePath}.ass`)) {
                    del_arr.push(`${filePath}.ass`);
                }
                if (FsExistsSync(`${filePath}.ass1`)) {
                    del_arr.push(`${filePath}.ass1`);
                }
                if (FsExistsSync(`${filePath}.ssa`)) {
                    del_arr.push(`${filePath}.ssa`);
                }
                if (FsExistsSync(`${filePath}.ssa1`)) {
                    del_arr.push(`${filePath}.ssa1`);
                }
                if (FsExistsSync(`${filePath}.vtt`)) {
                    del_arr.push(`${filePath}.vtt`);
                }
                console.log(del_arr);
                deleteFolderRecursive(`${filePath}_doc`);
                deleteFolderRecursive(`${filePath}_img`);
                deleteFolderRecursive(`${filePath}_present`);
                deleteFolderRecursive(`${filePath}_sub`);
                return Promise.all(del_arr.map(d => new Promise((resolve, reject) => FsUnlink(d, err => err ? reject(err) : resolve())))).then(() => rest());
            }
        } else {
            if (!checkAdmin(1, req.user) && (!isValidString(items[0].owner, 'uid') || !req.user._id.equals(items[0].owner))) {
                handleError(new HoError('file is not yours!!!'));
            }
            return recur_backup(1).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$set: {
                recycle: 1,
                utime: Math.round(new Date().getTime() / 1000),
            }}).then(item2 => {
                sendWs({
                    type: 'file',
                    data: items[0]._id,
                }, items[0].adultonly);
                res.json({apiOK: true});
            }));
        }
        function recur_backup(recycle) {
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return Promise.resolve();
            } else if (items[0].status === 9) {
                const total_file = items[0].playList.length;
                if (total_file > 0) {
                    const zip_filePath = FsExistsSync(`${filePath}_zip`) ? `${filePath}_zip` : FsExistsSync(`${filePath}_7z`) ? `${filePath}_7z` : FsExistsSync(`${filePath}.1.rar`) ? `${filePath}.1.rar` : null;
                    if (zip_filePath) {
                        console.log(zip_filePath);
                        return googleBackup(req.user, items[0]._id, items[0].name, zip_filePath, items[0].tags, recycle).then(() => recur_playlist_backup(0));
                    } else {
                        return recur_playlist_backup(0);
                    }
                }
                function recur_playlist_backup(index) {
                    const bufferPath = `${filePath}/${index}`;
                    const rest2 = () => {
                        index++;
                        if (index < total_file) {
                            return recur_playlist_backup(index);
                        } else {
                            recycle++;
                            if (recycle < 4) {
                                return recur_backup(recycle);
                            }
                        }
                    }
                    return FsExistsSync(`${bufferPath}_complete`) ? googleBackup(req.user, items[0]._id, items[0].playList[index], bufferPath, items[0].tags, recycle, '_complete').then(() => rest2) : rest2();
                }
            } else {
                return googleBackup(req.user, items[0]._id, items[0].name, filePath, items[0].tags, recycle).then(() => {
                    recycle++;
                    if (recycle < 4) {
                        return recur_backup(recycle);
                    }
                });
            }
        }
    }).catch(err => handleError(err, next));
});

router.get('/media/:action(act|del)/:uid/:index(\\d+|v)?', function(req, res, next) {
    console.log('handle media');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('permission denied'));
    }
    Mongo('find', STORAGEDB, {_id: isValidString(req.params.uid, 'uid', 'uid is not vaild')}, {limit: 1}).then(items => {
        console.log(items);
        if (items.length < 1) {
            handleError(new HoError('cannot find file!!!'));
        }
        if (!items[0].mediaType) {
            handleError(new HoError('this file is not media!!!'));
        }
        switch(req.params.action) {
            case 'act':
            const filePath = getFileLocation(items[0].owner, items[0]._id);
            if (items[0].mediaType.type) {
                const rest = () => items[0].mediaType.key ? (!items[0].mediaType.complete && new Date().getTime()/1000 - items[0].utime > NOISE_TIME) ? MediaHandleTool.handleMediaUpload(items[0].mediaType, filePath, items[0]._id, req.user, items[0].mediaType.key) : MediaHandleTool.handleMedia(items[0].mediaType, filePath, items[0]._id, items[0].mediaType.key, req.user) : MediaHandleTool.handleMediaUpload(items[0].mediaType, filePath, items[0]._id, req.user);
                return rest().catch(err => handleError(err, errorMedia, items[0]['_id'], items[0].mediaType['fileIndex'])).then(() => res.json({apiOK: true}));
            } else if (req.params.index) {
                if (req.params.index === 'v') {
                    for (let i in items[0]['playList']) {
                        if (isVideo(items[0]['playList'][i])) {
                            req.params.index = i;
                            break;
                        }
                    }
                }
                if (!FsExistsSync(`${filePath}/${items[0].mediaType[req.params.index]['fileIndex']}_complete`)) {
                    handleError(new HoError('need complete first'));
                }
                let fileIndex = false;
                for (let i in items[0].mediaType) {
                    if (Number(req.params.index) === items[0].mediaType[i]['fileIndex']) {
                        fileIndex = i;
                        break;
                    }
                }
                if (!fileIndex) {
                    handleError(new HoError('cannot find media'));
                }
                const rest = () => items[0].mediaType[fileIndex].key ? (!items[0].mediaType[fileIndex].complete && new Date().getTime()/1000 - items[0].utime > NOISE_TIME) ? MediaHandleTool.handleMediaUpload(items[0].mediaType[fileIndex], filePath, items[0]._id, req.user, items[0].mediaType[fileIndex].key) : MediaHandleTool.handleMedia(items[0].mediaType[fileIndex], filePath, items[0]._id, items[0].mediaType[fileIndex].key, req.user) : MediaHandleTool.handleMediaUpload(items[0].mediaType[fileIndex], filePath, items[0]._id, req.user);
                return rest().catch(err => handleError(err, errorMedia, items[0]['_id'], items[0].mediaType[fileIndex]['fileIndex'])).then(() => res.json({apiOK: true}));
            } else {
                let handleItems = [];
                for (let i in items[0].mediaType) {
                    if (FsExistsSync(`${filePath}/${items[0].mediaType[i]['fileIndex']}_complete`)) {
                        handleItems.push(items[0].mediaType[i]);
                    }
                }
                if (handleItems.length < 1) {
                    handleError(new HoError('need complete first'));
                }
                return Promise.all(handleItems.map(m => m.key ? (!m.complete && new Date().getTime()/1000 - items[0].utime > NOISE_TIME) ? MediaHandleTool.handleMediaUpload(m, filePath, items[0]._id, req.user, m.key) : MediaHandleTool.handleMedia(m, filePath, items[0]._id, m.key, req.user).catch(err => handleError(err, errorMedia, items[0]['_id'], m['fileIndex'])) : MediaHandleTool.handleMediaUpload(m, filePath, items[0]._id, req.user).catch(err => handleError(err, errorMedia, items[0]['_id'], m['fileIndex'])))).then(() => res.json({apiOK: true}));
            }
            case 'del':
            if (items[0].mediaType.type) {
                return completeMedia(items[0]._id, (items[0].status === 1) ? 0 : items[0].status, items[0].mediaType['fileIndex']).then(() => res.json({apiOK: true}));
            } else {
                let is_empty = true;
                let handleItems = [];
                for (let i in items[0].mediaType) {
                    is_empty = false;
                    if (FsExistsSync(`${getFileLocation(items[0].owner, items[0]._id)}/${items[0].mediaType[i]['fileIndex']}_complete`)) {
                        handleItems.push(items[0].mediaType[i]);
                    }
                }
                if (is_empty) {
                    return Mongo('update', STORAGEDB, {_id: items[0]._id}, {$unset: {mediaType: ''}}).then(item => {
                        sendWs({
                            type: 'file',
                            data: items[0]._id,
                        }, items[0].adultonly);
                        res.json({apiOK: true});
                    });
                }
                if (handleItems.length < 1) {
                    handleError(new HoError('need complete first'));
                }
                return Promise.all(handleItems.map(m => completeMedia(items[0]._id, 0, m['fileIndex']))).then(() => res.json({apiOK: true}));
            }
            default:
            handleError(new HoError('unknown action'));
        }
    }).catch(err => handleError(err, next));
});

router.get('/feedback', function (req, res, next) {
    console.log('file feedback');
    Mongo('find', STORAGEDB, {
        untag: 1,
        owner: req.user._id,
    }, {
        sort: ['utime','desc'],
        limit: 20,
    }).then(items => {
        const getItem = () => (items.length < 1 && checkAdmin(1, req.user)) ? Mongo('find', STORAGEDB, {untag: 1}, {
            sort: ['utime','desc'],
            limit: 20,
        }) : Promise.resolve(items);
        return getItem().then(items => {
            let feedback_arr = [];
            const getFeedback = item => MediaHandleTool.handleTag(getFileLocation(item.owner, item._id), {
                time: item.time,
                height: item.height,
            }, item.name, '', item.status).then(([mediaType, mediaTag, DBdata]) => {
                let temp_tag = [];
                if (item.first === 1) {
                    item.tags.push('first item');
                } else {
                    temp_tag.push('first item');
                }
                if (item.adultonly === 1) {
                    item.tags.push('18+');
                } else {
                    if (checkAdmin(2, req.user)) {
                        temp_tag.push('18+');
                    }
                }
                for (let i of mediaTag.opt) {
                    if (item.tags.indexOf(i) === -1) {
                        temp_tag.push(i);
                    }
                }
                temp_tag = supplyTag(item.tags, temp_tag);
                if (!checkAdmin(1, req.user)) {
                    for (let i in item[req.user._id.toString()]) {
                        const index_tag = item.tags.indexOf(i);
                        if (index_tag !== -1) {
                            item.tags.splice(index_tag, 1);
                        }
                    }
                    return {
                        id: item._id,
                        name: item.name,
                        select: item[req.user._id.toString()],
                        option: temp_tag,
                        other: item.tags,
                    };
                } else {
                    return {
                        id: item._id,
                        name: item.name,
                        select: item.tags,
                        option: temp_tag,
                        other: [],
                    };
                }
            });
            const recur_feedback = index => getFeedback(items[index]).then(feedback => {
                feedback_arr.push(feedback);
                index++;
                if (index < items.length) {
                    return recur_feedback(index);
                } else {
                    res.json({feedbacks: feedback_arr});
                }
            });
            if (items.length < 1) {
                res.json({feedbacks: feedback_arr});
            } else {
                return recur_feedback(0);
            }
        });
    });
});

export default router
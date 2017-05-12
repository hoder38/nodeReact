import { STORAGEDB, STATIC_PATH } from '../constants'
import Mkdirp from 'mkdirp'
import { existsSync as FsExistsSync, readdirSync as FsReaddirSync, lstatSync as FsLstatSync, renameSync as FsRenameSync } from 'fs'
import { join as PathJoin } from 'path'
import Child_process from 'child_process'
import Mongo from '../models/mongo-tool'
import GoogleApi from '../models/api-tool-google'
import TagTool, { normalize, isDefaultTag } from '../models/tag-tool'
import { isValidString, handleError, HoError, checkAdmin, getFileLocation, deleteFolderRecursive, sortList } from '../util/utility'
import { extTag, extType, isZip, isImage, changeExt } from '../util/mime'
import Transcoder from '../util/stream-transcoder.js'
import sendWs from '../util/sendWs'

const StorageTagTool = TagTool(STORAGEDB);

export default {
    editFile: function (uid, newName, user) {
        const name = isValidString(newName, 'name', 'name is not vaild');
        const id = isValidString(uid, 'uid', 'uid is not vaild');
        return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length === 0) {
                handleError(new HoError('file not exist!!!'));
            }
            if (!checkAdmin(1, user) && (!isValidString(items[0].owner, 'uid') || !user._id.equals(items[0].owner))) {
                handleError(new HoError('file is not yours!!!'));
            }
            return Mongo('update', STORAGEDB, {_id: id}, {$set: {name: name}}).then(item2 =>StorageTagTool.addTag(uid, name, user)).then(result => {
                if (!items[0].tags.includes(result.tag)) {
                    items[0].tags.splice(0, 0, result.tag);
                }
                if (items[0][user._id.toString()] && !items[0][user._id.toString()].includes(result.tag)) {
                    items[0][user._id.toString()].splice(0, 0, result.tag);
                }
                const filePath = getFileLocation(items[0].owner, items[0]._id);
                console.log(items[0]);
                return this.handleTag(filePath, {
                    utime: Math.round(new Date().getTime() / 1000),
                    untag: 1,
                    time: items[0].time,
                    height: items[0].height,
                }, newName, items[0].name, items[0].status).then(([mediaType, mediaTag, DBdata]) => {
                    mediaTag.def = mediaTag.def.filter(i => !items[0].tags.includes(i));
                    mediaTag.opt = mediaTag.opt.filter(i => !items[0].tags.includes(i));
                    const tagsAdd = (mediaTag.def.length > 0) ? {
                        $set: DBdata,
                        $addToSet: {
                            tags: {$each: mediaTag.def},
                            [user._id.toString()]: {$each: mediaTag.def},
                        }
                    } :{$set: DBdata};
                    return Mongo('update', STORAGEDB, {_id: items[0]._id}, tagsAdd, {upsert: true}).then(item2 => {
                        let result_tag = [];
                        let others_tag = [];
                        if (!checkAdmin(1, user)) {
                            result_tag = mediaTag.def.concat(items[0][user._id.toString()]);
                            result_tag.forEach(i => {
                                const index_tag = items[0].tags.indexOf(i);
                                if (index_tag !== -1) {
                                    items[0].tags.splice(index_tag, 1);
                                }
                            });
                            others_tag = items[0].tags;
                        } else {
                            result_tag = mediaTag.def.concat(items[0].tags);
                        }
                        return StorageTagTool.getRelativeTag(result_tag, user, mediaTag.opt).then(relative => {
                            const reli = relative.length < 5 ? relative.length : 5;
                            if (checkAdmin(2, user)) {
                                if (items[0].adultonly === 1) {
                                    result_tag.push('18+');
                                } else {
                                    mediaTag.opt.push('18+');
                                }
                            }
                            if (items[0].first === 1) {
                                result_tag.push('first item');
                            } else {
                                mediaTag.opt.push('first item');
                            }
                            for (let i = 0; i < reli; i++) {
                                const normal = normalize(relative[i]);
                                if (!isDefaultTag(normal)) {
                                    if (!result_tag.includes(normal) && !mediaTag.opt.includes(normal)) {
                                        mediaTag.opt.push(normal);
                                    }
                                }
                            }
                            return this.handleMediaUpload(mediaType, filePath, items[0]._id, user).then(() => ({
                                id: items[0]._id,
                                name: name,
                                select: result_tag,
                                option: mediaTag.opt,
                                other: others_tag,
                                adultonly: items[0].adultonly,
                            })).catch(err => handleError(err, errorMedia, items[0]._id, mediaType['fileIndex']));
                        });
                    });
                });
            });
        });
    },
    handleTag: function(filePath, DBdata, newName, oldName, status, ret_mediaType=true) {
        if (status === 7) {
            return Promise.resolve([false, extTag('url'), DBdata]);
        } else if (status === 8) {
            return Promise.resolve([false, {
                def: [],
                opt: [],
            }, DBdata]);
        } else if (status === 9) {
            let mediaType = extType(newName);
            if (mediaType['type'] === 'zipbook') {
                return Promise.resolve([mediaType, extTag(mediaType['type']), Object.assign(DBdata, {
                    status: 1,
                    mediaType,
                })]);
            } else {
                return Promise.resolve([false, {
                    def: [],
                    opt: [],
                }, DBdata]);
            }
        } else {
            let mediaType = extType(newName);
            const oldType = extType(oldName);
            let mediaTag = {
                def:[],
                opt:[],
            };
            const handleRest = first => {
                let isVideo = false;
                if (DBdata['height']) {
                    if (first) {
                        mediaType['hd'] = getHd(DBdata['height']);
                    }
                    isVideo = true;
                }
                if (DBdata['time']) {
                    mediaTag = extTag(mediaType['type']);
                    if (mediaType['type'] === 'music' && first) {
                        DBdata['status'] = 4;
                        mediaType = false;
                    } else if (isVideo && mediaType['type'] === 'video') {
                        if (first) {
                            mediaType['time'] = DBdata['time'];
                            DBdata['status'] = 1;
                        }
                        mediaTag.def = mediaTag.def.concat(getTimeTag(DBdata['time'], mediaTag.opt));
                        if (ret_mediaType) {
                            DBdata['mediaType'] = mediaType;
                        }
                    } else {
                        mediaType = false;
                    }
                } else {
                    mediaType = false;
                }
                if (!first) {
                    mediaType = false;
                }
            }
            const first = (mediaType && (status === 0 || status === 1 || status === 5) && (!oldType || (mediaType.ext !== oldType.ext) || (mediaType.type !== oldType.type))) ? true : false;
            if (mediaType) {
                switch(mediaType['type']) {
                    case 'video':
                    case 'music':
                    if (!DBdata['height'] && !DBdata['time']) {
                        return new Promise((resolve, reject) => new Transcoder(filePath).on('metadata', meta => resolve(meta)).on('error', err => reject(err)).exec()).then(meta => {
                            console.log(meta);
                            if (meta.input.streams) {
                                let isVideo = false;
                                for (let i of meta.input.streams) {
                                    if (i.size) {
                                        DBdata['height'] = i.size.height;
                                        break;
                                    }
                                }
                                DBdata['time'] = meta.input.duration;
                            }
                            handleRest(first);
                            return [mediaType, mediaTag, DBdata];
                        });
                    } else {
                        handleRest(first);
                        return [mediaType, mediaTag, DBdata];
                    }
                    break;
                    case 'image':
                    case 'doc':
                    case 'rawdoc':
                    case 'sheet':
                    case 'present':
                    case 'zipbook':
                    case 'pdf':
                    if (first) {
                        DBdata['status'] = 1;
                        mediaTag = extTag(mediaType['type']);
                        if (ret_mediaType) {
                            DBdata['mediaType'] = mediaType;
                        }
                    } else {
                        mediaType = false;
                    }
                    break;
                    case 'zip':
                    if (first || status === 2) {
                        DBdata['status'] = 1;
                        mediaTag = extTag(mediaType['type']);
                        if (ret_mediaType) {
                            DBdata['mediaType'] = mediaType;
                        }
                    } else {
                        mediaType = false;
                    }
                    break;
                    default:
                    handleError(new HoError('unknown media type!!!'));
                }
            }
            return Promise.resolve([mediaType, mediaTag, DBdata]);
        }
    },
    handleMediaUpload: function(mediaType, filePath, fileID, user, add_noise=false) {
        if (!mediaType) {
            return Promise.resolve();
        }
        const uploadPath = mediaType['realPath'] ? `${filePath}/real/${mediaType['realPath']}` : filePath;
        if (mediaType['type'] === 'pdf') {
            filePath = mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath;
            const comPath = mediaType['realPath'] ? `${filePath}_complete` : filePath;
            const pdfPath = `${filePath}_pdf`;
            console.log(pdfPath);
            deleteFolderRecursive(pdfPath);
            return new Promise((resolve, reject) => Mkdirp(pdfPath, err => err ? reject(err) : resolve())).then(() => new Promise((resolve, reject) => Child_process.exec(`pdftk ${comPath} burst output ${pdfPath}/%03d.pdf`, (err, output) => err ? reject(err) : resolve(output)))).then(() => {
                let number = 0;
                FsReaddirSync(pdfPath).forEach((file,index) => number++);
                return completeMedia(fileID, 10, mediaType['fileIndex'], number);
            });
        } else if (mediaType['type'] === 'zipbook') {
            filePath = mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath;
            const imgPath = `${filePath}_img`;
            const tempPath = `${imgPath}/temp`;
            deleteFolderRecursive(imgPath);
            deleteFolderRecursive(tempPath);
            return new Promise((resolve, reject) => Mkdirp(tempPath, err => err ? reject(err) : resolve())).then(() => {
                let is_processed = false;
                let append = '';
                const zip_type = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? 2 : (mediaType['ext'] === '7z') ? 3 : 1;
                let zipPath = mediaType['realPath'] ? `${filePath}_complete` : filePath;
                if (FsExistsSync(`${filePath}.1.rar`)) {
                    zipPath = `${filePath}.1.rar`;
                    is_processed = true;
                } else if (FsExistsSync(`${filePath}_zip`)) {
                    zipPath = `${filePath}_zip`;
                    is_processed = true;
                } else if (FsExistsSync(`${filePath}_7z`)) {
                    zipPath = `${filePath}_7z`;
                    is_processed = true;
                }
                if (FsExistsSync(`${filePath}_zip_c`)) {
                    zipPath = `${filePath}_zip_c`;
                } else if (FsExistsSync(`${filePath}_7z_c`)) {
                    zipPath = `${filePath}_7z_c`;
                }
                const cmdline = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? `unrar x ${zipPath} ${tempPath}` : (mediaType['ext'] === '7z') ? `7za x ${zipPath} -o${tempPath}` : `${PathJoin(__dirname, '../util/myuzip.py')} ${zipPath} ${tempPath}`;
                console.log(cmdline);
                return new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output))).then(output => {
                    let zip_arr = [];
                    const recurFolder = (indexFolder, initFolder, preFolder) => {
                        FsReaddirSync(initFolder).forEach((file,index) => {
                            const curPath = initFolder ? `${initFolder}/${file}` : file;
                            const showPath = preFolder ? `${preFolder}/${file}` : file;
                            if(FsLstatSync(curPath).isDirectory()) {
                                if (indexFolder < 4) {
                                    recurFolder(indexFolder+1, curPath, showPath);
                                }
                            } else {
                                if (isImage(file)) {
                                    zip_arr.push(showPath);
                                }
                            }
                        });
                    }
                    recurFolder(0, tempPath, '');
                    if (zip_arr.length < 1) {
                        handleError(new HoError('empty zip'));
                    }
                    zip_arr = sortList(zip_arr);
                    zip_arr.forEach((s, i) => FsRenameSync(`${tempPath}/${s}`, `${filePath}_img/${Number(i)+1}`));
                    deleteFolderRecursive(tempPath);
                    if (!is_processed) {
                        FsRenameSync(zipPath, (zip_type === 2) ? `${filePath}.1.rar` : (zip_type === 3) ? `${filePath}_7z` : `${filePath}_zip`);
                    }
                    console.log(zip_arr);
                    return GoogleApi('upload', {
                        type: 'media',
                        name: `${fileID.toString()}.${isImage(zip_arr[0])}`,
                        filePath: `${filePath}_img/1`,
                        rest: metadata => {
                            if (!metadata.thumbnailLink) {
                                handleError(new HoError('error type'));
                            }
                            mediaType['thumbnail'] = metadata.thumbnailLink;
                            return Mongo('update', STORAGEDB, {_id: fileID}, {$set: Object.assign((typeof mediaType['fileIndex'] === 'number') ? {[`present.${mediaType['fileIndex']}`]: zip_arr.length} : {present: zip_arr.length}, mediaType['realPath'] ? {[`mediaType.${mediaType['fileIndex']}.key`]: metadata.id} : {'mediaType.key': metadata.id})}).then(item => this.handleMedia(mediaType, filePath, fileID, metadata.id, user));
                        },
                        errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
                    });
                });
            });
        } else if (mediaType['type'] === 'zip') {
            let cmdline = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? `unrar v -v ${filePath}` : (mediaType['ext'] === '7z') ? `7za l ${filePath}` : `${PathJoin(__dirname, '../util/myuzip.py')} ${filePath}`;
            const zip_type = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? 2 : (mediaType['ext'] === '7z') ? 3 : 1;
            let is_processed = false;
            let append = '';
            if (FsExistsSync(`${filePath}.1.rar`)) {
                append = '.1.rar';
                is_processed = true;
            } else if (FsExistsSync(`${filePath}_zip`)) {
                append = '_zip';
                is_processed = true;
            } else if (FsExistsSync(`${filePath}_7z`)) {
                append = '_7z';
                is_processed = true;
            }
            if (FsExistsSync(`${filePath}_zip_c`)) {
                append = '_zip_c';
            } else if (FsExistsSync(`${filePath}_7z_c`)) {
                append = '_7z_c';
            }
            cmdline = `${cmdline}${append}`;
            console.log(cmdline);
            return new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output))).then(output => {
                const tmplist = output.match(/[^\r\n]+/g);
                if (!tmplist) {
                    handleError(new HoError('is not zip'));
                }
                let playlist = [];
                if (zip_type === 2) {
                    let start = false;
                    for (let i in tmplist) {
                        if (tmplist[i].match(/^-------------------/)) {
                            start = start ? false : true;
                        } else if (start) {
                            const tmp = tmplist[i].match(/^[\s]+(\d+)[\s]+\d+[\s]+(\d+%|-->)/);
                            if (tmp && tmp[1] !== '0') {
                                const previous = tmplist[i-1].trim();
                                playlist.push(previous.match(/^\*/) ? previous.substr(1) : previous);
                            }
                        }
                    }
                } else if (zip_type === 3) {
                    let start = false;
                    for (let i of tmplist) {
                        if (i.match(/^-------------------/)) {
                            if (start) {
                                break;
                            } else {
                                start = true;
                            }
                        } else if (start) {
                            const tmp = i.substr(0, 38).match(/\d+$/);
                            if (tmp && tmp[0] !== '0') {
                                playlist.push(i.substr(53));
                            }
                        }
                    }
                } else {
                    for (let i in tmplist) {
                        if (i !== '0') {
                            if (!tmplist[i].match(/\/$/)) {
                                playlist.push(tmplist[i]);
                            }
                        }
                    }
                }
                if (playlist.length < 1) {
                    handleError(new HoError('empty zip'));
                }
                playlist = sortList(playlist);
                return Mongo('find', STORAGEDB, {_id: fileID}, {limit: 1}).then(items => {
                    if (items.length < 1) {
                        handleError(new HoError('cannot find zip'));
                    }
                    let tagSet = new Set();
                    for (let i of playlist) {
                        const mediaType = extType(i);
                        if (mediaType) {
                            extTag(mediaType['type']).def.forEach(j => tagSet.add(normalize(j)));
                        }
                    }
                    let utags = items[0][user._id] ? items[0][user._id] : [];
                    tagSet.forEach(t => {
                        if (!items[0].tags.includes(t)) {
                            items[0].tags.push(t);
                            utags.push(t);
                        }
                    });
                    const process = () => {
                        if (is_processed) {
                            return Promise.resolve();
                        } else {
                            FsRenameSync(filePath, (zip_type === 2) ? `${filePath}.1.rar` : (zip_type === 3) ? `${filePath}_7z` : `${filePath}_zip`);
                            return new Promise((resolve, reject) => Mkdirp(`${filePath}/real`, err => err ? reject(err) : resolve()));
                        }
                    }
                    return process().then(() => Mongo('update', STORAGEDB, {_id: fileID}, {$set: {
                        playList: playlist,
                        tags: items[0].tags,
                        [user._id]: utags,
                    }}).then(item => completeMedia(fileID, 9, mediaType['fileIndex'])));
                });
            }).catch(err => handleError(err, 'Zip get list fail!!!'));
        } else {
            if (mediaType['type'] === 'rawdoc') {
                mediaType['ext'] = 'txt';
            }
            const addNoise = () => {
                if (add_noise && mediaType['type'] === 'video') {
                    const cmdline = `cat ${STATIC_PATH}/noise >> ${uploadPath}`;
                    console.log(cmdline);
                    return new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output))).then(output => GoogleApi('delete', {fileId: add_noise}));
                } else {
                    return Promise.resolve();
                }
            }
            console.log(uploadPath);
            return addNoise().then(() => GoogleApi('upload', Object.assign({
                type: 'media',
                name: `${fileID.toString()}.${mediaType['ext']}`,
                filePath: uploadPath,
                rest: metadata => {
                    if(metadata.exportLinks && metadata.exportLinks['application/pdf']) {
                        mediaType['thumbnail'] = metadata.exportLinks['application/pdf'];
                        if (mediaType['type'] === 'present') {
                            if (!metadata.alternateLink) {
                                handleError(new HoError('error type'));
                            }
                            mediaType['alternate'] = metadata.alternateLink;
                        }
                    } else if (mediaType['type'] === 'video' && metadata.alternateLink) {
                        mediaType['thumbnail'] = metadata.alternateLink;
                    } else if (metadata.thumbnailLink) {
                        mediaType['thumbnail'] = metadata.thumbnailLink;
                    } else {
                        handleError(new HoError('error type'));
                    }
                    return Mongo('update', STORAGEDB, {_id: fileID}, {$set: mediaType['realPath'] ? {[`mediaType.${mediaType['fileIndex']}.key`]: metadata.id} : {'mediaType.key': metadata.id}}).then(item => this.handleMedia(mediaType, filePath, fileID, metadata.id, user));
                },
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }, (mediaType['type'] === 'doc' || mediaType['type'] === 'rawdoc' || mediaType['type'] === 'sheet' || mediaType['type'] === 'present') ? {convert: true} : {})));
        }
    },
    handleMedia: function (mediaType, filePath, fileID, key, user) {
        if (mediaType['type'] === 'image' || mediaType['type'] === 'zipbook') {
            const checkThumb = () => mediaType['thumbnail'] ? Promise.resolve(mediaType['thumbnail']) : GoogleApi('get', {fileId: key}).then(filedata => {
                console.log(filedata);
                if (!filedata['thumbnailLink']) {
                    handleError(new HoError('error type'));
                }
                return filedata['thumbnailLink'];
            });
            return checkThumb().then(thumbnail => GoogleApi('download', {
                url: thumbnail,
                filePath: `${filePath}.jpg`,
                rest: () => {
                    const rest1 = () => mediaType['notOwner'] ? Promise.resolve() : GoogleApi('delete', {fileId: key});
                    return rest1().then(() => completeMedia(fileID, 2, mediaType['fileIndex']));
                },
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        } else if (mediaType['type'] === 'video') {
            if (!mediaType.hasOwnProperty('time') && !mediaType.hasOwnProperty('hd')) {
                console.log(mediaType);
                handleError(new HoError('video can not be decoded!!!'));
            }
            return GoogleApi('download media', {
                key,
                filePath: mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}_complete` : `${filePath}_complete`,
                hd: mediaType['hd'],
                rest: height => {
                    const setHd = () => height ? StorageTagTool.addTag(fileID, height, user) : Promise.resolve();
                    return setHd().then(() => completeMedia(fileID, 3, mediaType['fileIndex']));
                },
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            });
        } else if (mediaType['type'] === 'doc' || mediaType['type'] === 'rawdoc' || mediaType['type'] === 'sheet') {
            const checkThumb = () => mediaType['thumbnail'] ? Promise.resolve(mediaType['thumbnail']) : GoogleApi('get', {fileId: key}).then(filedata => {
                console.log(filedata);
                if (!filedata.exportLinks || !filedata.exportLinks['application/pdf']) {
                    handleError(new HoError('error type'));
                }
                return filedata.exportLinks['application/pdf'];
            });
            return checkThumb().then(thumbnail => GoogleApi('download doc', {
                exportlink: thumbnail,
                filePath: mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath,
                rest: number => GoogleApi('delete', {fileId: key}).then(() => completeMedia(fileID, 5, mediaType['fileIndex'], number)),
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        } else if (mediaType['type'] === 'present') {
            const checkThumb = () => mediaType['thumbnail'] ? Promise.resolve([mediaType['thumbnail'], mediaType['alternate']]) : GoogleApi('get', {fileId: key}).then(filedata => {
                console.log(filedata);
                if (!filedata.exportLinks || !filedata.exportLinks['application/pdf']) {
                    handleError(new HoError('error type'));
                }
                return [filedata.exportLinks['application/pdf'], filedata.alternateLink];
            });
            return checkThumb().then(([thumbnail, alternate]) => GoogleApi('download present', {exportlink: thumbnail,
                alternate,
                filePath: mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath,
                rest: number => GoogleApi('delete', {fileId: key}).then(() => completeMedia(fileID, 6, mediaType['fileIndex'], number)),
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        }
    },
}

export const completeMedia = (fileID, status, fileIndex, number=0) => Mongo('update', STORAGEDB, {_id: fileID}, Object.assign({
    $set: Object.assign({status: (typeof fileIndex === 'number') ? 9 : status}, (number && number > 1) ? (typeof fileIndex === 'number') ? {[`present.${fileIndex}`]: number} : {present: number} : {}, (status === 3) ? (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}.complete`]: true} : {['mediaType.complete']: true} : {}),
}, (status === 3) ? {} : {$unset: (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}`]: ''} : {mediaType: ''}})).then(() => Mongo('find', STORAGEDB, {_id: fileID}, {limit: 1})).then(items => {
    if (items.length < 1) {
        handleError(new HoError('cannot find file!!!'));
    }
    console.log(items);
    sendWs({
        type: 'file',
        data: items[0]._id,
    }, items[0].adultonly);
});

export const errorMedia = (err, fileID, fileIndex) => (err.name === 'HoError' && err.message === 'timeout') ? Mongo('update', STORAGEDB, {_id: fileID}, {$set: (typeof fileIndex === 'number') ? {
    [`mediaType.${fileIndex}.timeout`]: true,
    status: 9,
} : {'mediaType.timeout': true}}).then(() => Promise.reject(err)) : Mongo('update', STORAGEDB, {_id: fileID}, {$set: (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}.err`]: err} : {'mediaType.err': err}}).then(() => Promise.reject(err));

const getHd = height => height >= 2160 ? 2160 : height >= 1440 ? 1440 : height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : height >= 240 ? 240 : 0;

const getTimeTag = (time, opt) => {
    if (time < 20 * 60 * 1000) {
        return [];
    } else if (time < 40 * 60 * 1000) {
        return opt.splice(2, 2);
    } else if (mediaType['time'] < 60 * 60 * 1000) {
        return opt.splice(4, 2);
    } else {
        return opt.splice(0, 2);
    }
}
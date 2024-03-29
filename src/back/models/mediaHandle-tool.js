import { STORAGEDB, STATIC_PATH, NOISE_SIZE, __dirname } from '../constants.js'
import Mkdirp from 'mkdirp'
import fsModule from 'fs'
const { existsSync: FsExistsSync, readdirSync: FsReaddirSync, lstatSync: FsLstatSync, renameSync: FsRenameSync, statSync: FsStatSync } = fsModule
import pathModule from 'path'
const { join: PathJoin, dirname: PathDirname } = pathModule;
import Child_process from 'child_process'
import Ffmpeg from 'ffmpeg'
import Mongo, { objectID } from '../models/mongo-tool.js'
import GoogleApi, { isApiing } from '../models/api-tool-google.js'
import TagTool, { normalize, isDefaultTag } from '../models/tag-tool.js'
import { isValidString, handleError, HoError, checkAdmin, getFileLocation, deleteFolderRecursive, sortList, toValidName } from '../util/utility.js'
import { extTag, extType, isZip, isImage, changeExt, addPost } from '../util/mime.js'
import sendWs from '../util/sendWs.js'

const StorageTagTool = TagTool(STORAGEDB);

export default {
    editFile: function (uid, newName, user) {
        const name = isValidString(newName, 'name');
        if (!name) {
            return handleError(new HoError('name is not vaild!!!'));
        }
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not vaild!!!'));
        }
        return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length === 0) {
                return handleError(new HoError('file not exist!!!'));
            }
            if (!checkAdmin(1, user) && (!isValidString(items[0].owner, 'uid') || !user._id.equals(items[0].owner))) {
                return handleError(new HoError('file is not yours!!!'));
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
                    console.log(DBdata);
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
                            if (DBdata['status'] !== 3) {
                                DBdata['status'] = 1;
                            }
                        }
                        mediaTag.def = mediaTag.def.concat(getTimeTag(DBdata['time'], mediaTag.opt));
                        if (ret_mediaType && first) {
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
                    if (!DBdata['height'] && !DBdata['time'] && FsExistsSync(filePath)) {
                        console.log(filePath);
                        return new Ffmpeg(filePath).then(info => {
                            console.log(info.metadata);
                            if (info.metadata.video) {
                                if (info.metadata.video.codec === 'h264') {
                                    DBdata['status'] = 3;
                                }
                                DBdata['height'] = info.metadata.video.resolutionSquare.h;
                            }
                            if (info.metadata.duration) {
                                DBdata['time'] = info.metadata.duration.seconds * 1000;
                            }
                            handleRest(first);
                            return Promise.resolve([mediaType, mediaTag, DBdata]);
                        });
                    } else {
                        handleRest(first);
                        return Promise.resolve([mediaType, mediaTag, DBdata]);
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
                        if (ret_mediaType && first) {
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
                        if (ret_mediaType && first) {
                            DBdata['mediaType'] = mediaType;
                        }
                    } else {
                        mediaType = false;
                    }
                    break;
                    default:
                    return handleError(new HoError('unknown media type!!!'));
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
            return Mkdirp(pdfPath).then(() => new Promise((resolve, reject) => Child_process.exec(`pdftk ${comPath} burst output ${pdfPath}/%03d.pdf`, (err, output) => err ? reject(err) : resolve(output)))).then(() => {
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
            return Mkdirp(tempPath).then(() => {
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
                const cmdline = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? `unrar x ${zipPath} ${tempPath}  -p123` : (mediaType['ext'] === '7z') ? `7za x ${zipPath} -o${tempPath}  -p123` : `${PathJoin(__dirname, 'util/myuzip.py')} ${zipPath} ${tempPath} '123'`;
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
                        return handleError(new HoError('empty zip'));
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
                                return handleError(new HoError('error type'));
                            }
                            mediaType['thumbnail'] = metadata.thumbnailLink;
                            return Mongo('update', STORAGEDB, {_id: fileID}, {$set: Object.assign((typeof mediaType['fileIndex'] === 'number') ? {[`present.${mediaType['fileIndex']}`]: zip_arr.length} : {present: zip_arr.length}, mediaType['realPath'] ? {[`mediaType.${mediaType['fileIndex']}.key`]: metadata.id} : {'mediaType.key': metadata.id})}).then(item => this.handleMedia(mediaType, filePath, fileID, metadata.id, user));
                        },
                        errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
                    });
                });
            });
        } else if (mediaType['type'] === 'zip') {
            let cmdline = (mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr') ? `unrar v -v ${filePath}` : (mediaType['ext'] === '7z') ? `7za l ${filePath}` : `${PathJoin(__dirname, 'util/myuzip.py')} ${filePath}`;
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
                    return handleError(new HoError('is not zip'));
                }
                let playlist = [];
                if (zip_type === 2) {
                    let start = false;
                    for (let i in tmplist) {
                        if (tmplist[i].match(/^-----------/)) {
                            start = start ? false : true;
                        } else if (start) {
                            const tmp = tmplist[i].match(/([\d]+)\%[\s]+\d\d\d\d\-\d\d\-\d\d[\s]+\d\d\:\d\d[\s]+[\dA-Z]+[\s]+(.+)$/);
                            if (tmp && tmp[1] !== '0') {
                                playlist.push(tmp[2]);
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
                    return handleError(new HoError('empty zip'));
                }
                playlist = sortList(playlist);
                return Mongo('find', STORAGEDB, {_id: fileID}, {limit: 1}).then(items => {
                    if (items.length < 1) {
                        return handleError(new HoError('cannot find zip'));
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
                            return Mkdirp(`${filePath}/real`);
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
                    const cmdline = `cat ${STATIC_PATH}/noise >> "${uploadPath}"`;
                    console.log(cmdline);
                    return new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output))).then(output => GoogleApi('delete', {fileId: add_noise}));
                } else if (mediaType['type'] === 'video' && FsStatSync(uploadPath).size > NOISE_SIZE) {
                    const cmdline = `cat ${STATIC_PATH}/noise >> "${uploadPath}"`;
                    console.log(cmdline);
                    return new Promise((resolve, reject) => Child_process.exec(cmdline, (err, output) => err ? reject(err) : resolve(output)));
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
                                return handleError(new HoError('error type'));
                            }
                            mediaType['alternate'] = metadata.alternateLink;
                        }
                    } else if (mediaType['type'] === 'video' && metadata.alternateLink) {
                        mediaType['thumbnail'] = metadata.alternateLink;
                    } else if (metadata.thumbnailLink) {
                        mediaType['thumbnail'] = metadata.thumbnailLink;
                    } else {
                        return handleError(new HoError('error type'));
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
                    return handleError(new HoError('error type'));
                }
                return filedata['thumbnailLink'];
            });
            return checkThumb().then(thumbnail => GoogleApi('download', {
                user,
                url: thumbnail,
                filePath: `${filePath}.jpg`,
                rest: () => {
                    const rest1 = () => GoogleApi('delete', {fileId: key});
                    return rest1().then(() => completeMedia(fileID, 2, mediaType['fileIndex']));
                },
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        } else if (mediaType['type'] === 'video') {
            if (!mediaType.hasOwnProperty('time') && !mediaType.hasOwnProperty('hd')) {
                console.log(mediaType);
                return handleError(new HoError('video can not be decoded!!!'));
            }
            return GoogleApi('download media', {
                user,
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
                    return handleError(new HoError('error type'));
                }
                return filedata.exportLinks['application/pdf'];
            });
            return checkThumb().then(thumbnail => GoogleApi('download doc', {
                user,
                exportlink: thumbnail,
                filePath: mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath,
                rest: number => GoogleApi('delete', {fileId: key}).then(() => completeMedia(fileID, 5, mediaType['fileIndex'], number)),
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        } else if (mediaType['type'] === 'present') {
            const checkThumb = () => mediaType['thumbnail'] ? Promise.resolve([mediaType['thumbnail'], mediaType['alternate']]) : GoogleApi('get', {fileId: key}).then(filedata => {
                console.log(filedata);
                if (!filedata.exportLinks || !filedata.exportLinks['application/pdf']) {
                    return handleError(new HoError('error type'));
                }
                return [filedata.exportLinks['application/pdf'], filedata.alternateLink];
            });
            return checkThumb().then(([thumbnail, alternate]) => GoogleApi('download present', {
                user,
                exportlink: thumbnail,
                alternate,
                filePath: mediaType['realPath'] ? `${filePath}/${mediaType['fileIndex']}` : filePath,
                rest: number => GoogleApi('delete', {fileId: key}).then(() => completeMedia(fileID, 6, mediaType['fileIndex'], number)),
                errhandle: err => handleError(err, errorMedia, fileID, mediaType['fileIndex']),
            }));
        }
    },
    singleDrive: function(metadatalist, index, user, folderId, uploaded, handling, dirpath) {
        console.log('singleDrive');
        console.log(new Date().toLocaleString());
        const metadata = metadatalist[index];
        console.log(metadata);
        const oOID = objectID();
        const filePath = getFileLocation(user._id, oOID);
        const mkFolder = folderPath => FsExistsSync(folderPath) ? Promise.resolve() : Mkdirp(folderPath);
        const handleDelete = () => (!metadata.userPermission || metadata.userPermission.role !== 'owner') ? GoogleApi('move parent', {
            fileId: metadata.id,
            rmFolderId: handling,
            addFolderId: uploaded,
        }) : GoogleApi('delete', {fileId: metadata.id});
        const handleRest = (data, name, status=false, key=false, is_handled=false) => this.handleTag(filePath, data, name, '', 0).then(([mediaType, mediaTag, DBdata]) => {
            if (key) {
                mediaType['key'] = key;
            }
            let setTag = new Set();
            setTag.add(normalize(DBdata['name'])).add(normalize(user.username));
            if (dirpath) {
                dirpath.forEach(p => setTag.add(normalize(p)));
            }
            mediaTag.def.forEach(i => setTag.add(normalize(i)));
            let setArr = [];
            setTag.forEach(s => {
                const is_d = isDefaultTag(s);
                if (!is_d) {
                    setArr.push(s);
                } else if (is_d.index === 0) {
                    DBdata['adultonly'] = 1;
                }
            });
            return Mongo('insert', STORAGEDB, Object.assign(DBdata, {
                tags: setArr,
                [user._id]: setArr,
            }, status ? {status} : {})).then(item => {
                console.log(item);
                console.log('save end');
                sendWs({
                    type: 'file',
                    data: item[0]._id,
                }, item[0].adultonly);
                return is_handled ? handleDelete() : this.handleMediaUpload(mediaType, filePath, item[0]['_id'], user).then(() => handleDelete()).catch(err => handleError(err, errorMedia, item[0]['_id'], mediaType['fileIndex']));
            });
        });
        const handleFile = () => {
            let name = toValidName(metadata.title);
            if (isDefaultTag(normalize(name))) {
                name = addPost(name, '1');
            }
            let adultonly = 0;
            if (checkAdmin(2 ,user)) {
                for (let i in dirpath) {
                    if (isDefaultTag(normalize(i)).index === 0) {
                        adultonly = 1;
                        break;
                    }
                }
            }
            let data = {
                _id: oOID,
                name,
                owner: user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size: metadata.fileSize,
                count: 0,
                first: 1,
                recycle: 0,
                status: 0,
                adultonly,
                untag: 0,
            };
            const mediaType = extType(name);
            switch(mediaType['type']) {
                case 'video':
                if (!metadata.videoMediaMetadata) {
                    return handleError(new HoError('not transcode yet'));
                    /*if (!metadata.userPermission || metadata.userPermission.role === 'owner') {
                        handleError(new HoError('not transcode yet'));
                    }
                    return GoogleApi('copy', {fileId: metadata.id});*/
                }
                return GoogleApi('move parent', {
                    fileId: metadata.id,
                    rmFolderId: folderId,
                    addFolderId: handling,
                }).then(() => FsExistsSync(filePath) ? GoogleApi('download media', {
                    user,
                    key: metadata.id,
                    filePath: `${filePath}_complete`,
                    hd: getHd((metadata.videoMediaMetadata.width/16*9) > metadata.videoMediaMetadata.height ? (metadata.videoMediaMetadata.width/16*9) : metadata.videoMediaMetadata.height),
                    rest: () => handleRest(data, name, 3, metadata.id, true),
                    errhandle: err => handleError(err, errDrive, metadata.id, folderId),
                }) : GoogleApi('download', {
                    user,
                    url: metadata.downloadUrl,
                    filePath,
                    rest: () => GoogleApi('download media', {
                        user,
                        key: metadata.id,
                        filePath: `${filePath}_complete`,
                        hd: getHd((metadata.videoMediaMetadata.width/16*9) > metadata.videoMediaMetadata.height ? (metadata.videoMediaMetadata.width/16*9) : metadata.videoMediaMetadata.height),
                        rest: () => handleRest(data, name, 3, metadata.id, true),
                        errhandle: err => handleError(err, errDrive, metadata.id, folderId),
                    }),
                    errhandle: err => handleError(err, errDrive, metadata.id, folderId),
                })).catch(err => errDrive(err, metadata.id, folderId));
                default:
                return GoogleApi('move parent', {
                    fileId: metadata.id,
                    rmFolderId: folderId,
                    addFolderId: handling,
                }).then(() => FsExistsSync(filePath) ? handleRest(data, name) : GoogleApi('download', {
                    user,
                    url: metadata.downloadUrl,
                    filePath,
                    rest: () => handleRest(data, name),
                    errhandle: err => handleError(err, errDrive, metadata.id, folderId),
                })).catch(err => errDrive(err, metadata.id, folderId));
            }
        }
        const handleNext = () => {
            index++;
            if (index < metadatalist.length) {
                this.singleDrive(metadatalist, index, user, folderId, uploaded, handling, dirpath);
            }
        }
        return mkFolder(PathDirname(filePath)).then(() => handleFile()).then(() => handleNext()).catch(err => {
            handleError(err, 'Single Drive');
            return handleNext();
        });
    },
    checkMedia: function() {
        //避免重複下載
        if (isApiing()) {
            return Promise.resolve();
        }
        return Mongo('find', STORAGEDB, {mediaType: {$exists: true}}).then(items => {
            if (items.length > 0) {
                let timeoutItems = [];
                items.forEach(i => {
                    if (i.mediaType.type) {
                        if (i.mediaType.timeout) {
                            timeoutItems.push({
                                item: i,
                                mediaType: i.mediaType,
                            });
                        }
                    } else {
                        let is_empty = true;
                        for (let j in i.mediaType) {
                            is_empty = false;
                            if (i.mediaType[j].timeout) {
                                timeoutItems.push({
                                    item: i,
                                    mediaType: i.mediaType[j],
                                });
                            }
                        }
                        if (is_empty) {
                            Mongo('update', STORAGEDB, {_id: i._id}, {$unset: {mediaType: ''}}).catch(err => handleError(err, 'Clean playlist'));
                        }
                    }
                });
                console.log(timeoutItems);
                if (timeoutItems.length > 0) {
                    const recur_check = index => {
                        const single_check = () => {
                            const filePath = getFileLocation(timeoutItems[index].item.owner, timeoutItems[index].item._id);
                            if (timeoutItems[index].mediaType.key) {
                                if (timeoutItems[index].mediaType['realPath']) {
                                    if (FsExistsSync(`${filePath}/${timeoutItems[index].mediaType['fileIndex']}_complete`)) {
                                        return Mongo('update', STORAGEDB, {_id: timeoutItems[index].item._id}, {$set: {[`mediaType.${timeoutItems[index].mediaType['fileIndex']}.timeout`]: false}}).then(item => this.handleMedia(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, timeoutItems[index].mediaType.key, {
                                            _id: timeoutItems[index].item.owner,
                                            perm: 1,
                                        }).catch(err => handleError(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex'])));
                                    }
                                } else {
                                    return Mongo('update', STORAGEDB, {_id: timeoutItems[index].item._id}, {$set: {'mediaType.timeout': false}}).then(item => this.handleMedia(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, timeoutItems[index].mediaType.key, {
                                        _id: timeoutItems[index].item.owner,
                                        perm: 1,
                                    }).catch(err => handleError(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex'])));
                                }
                            } else if (timeoutItems[index].mediaType['realPath']) {
                                if (FsExistsSync(`${filePath}/${timeoutItems[index].mediaType['fileIndex']}_complete`)) {
                                    return Mongo('update', STORAGEDB, {_id: timeoutItems[index].item._id}, {$set: {[`mediaType.${timeoutItems[index].mediaType['fileIndex']}.timeout`]: false}}).then(item => this.handleMediaUpload(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, {
                                        _id: timeoutItems[index].item.owner,
                                        perm: 1,
                                    }).catch(err => handleError(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex'])));
                                }
                            } else {
                                return Mongo('update', STORAGEDB, {_id: timeoutItems[index].item._id}, {$set: {'mediaType.timeout': false}}).then(item => this.handleMediaUpload(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, {
                                    _id: timeoutItems[index].item.owner,
                                    perm: 1,
                                }).catch(err => handleError(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex'])));
                            }
                        }
                        return single_check().then(() => {
                            index++;
                            if (index < timeoutItems.length) {
                                return recur_check(index);
                            }
                        });
                    }
                    return recur_check(0);
                }
            }
        });
    },
}

export const completeMedia = (fileID, status, fileIndex, number=0) => Mongo('update', STORAGEDB, {_id: fileID}, Object.assign({
    $set: Object.assign({status: (typeof fileIndex === 'number') ? 9 : status}, (number && number > 1) ? (typeof fileIndex === 'number') ? {[`present.${fileIndex}`]: number} : {present: number} : {}, (status === 3) ? (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}.complete`]: true} : {'mediaType.complete': true} : {}),
}, (status === 3) ? {} : {$unset: (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}`]: ''} : {mediaType: ''}})).then(() => Mongo('find', STORAGEDB, {_id: fileID}, {limit: 1})).then(items => {
    if (items.length < 1) {
        return handleError(new HoError('cannot find file!!!'));
    }
    console.log(items);
    sendWs(`${items[0].name} complete!!!`, 0, 0, true);
    sendWs({
        type: 'file',
        data: items[0]._id,
    }, items[0].adultonly);
});

export const errorMedia = (err, fileID, fileIndex) => (err.name === 'HoError' && err.message === 'timeout') ? Mongo('update', STORAGEDB, {_id: fileID}, {$set: (typeof fileIndex === 'number') ? {
    [`mediaType.${fileIndex}.timeout`]: true,
    status: 9,
} : {'mediaType.timeout': true}}).then(() => handleError(err)) : Mongo('update', STORAGEDB, {_id: fileID}, {$set: (typeof fileIndex === 'number') ? {[`mediaType.${fileIndex}.err`]: err} : {'mediaType.err': err}}).then(() => handleError(err));

const getHd = height => height >= 2160 ? 2160 : height >= 1440 ? 1440 : height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : height >= 240 ? 240 : 0;

const getTimeTag = (time, opt) => {
    if (time < 20 * 60 * 1000) {
        return [];
    } else if (time < 40 * 60 * 1000) {
        return opt.splice(2, 2);
    } else if (time < 60 * 60 * 1000) {
        return opt.splice(4, 2);
    } else {
        return opt.splice(0, 2);
    }
}

const errDrive = (err, key, folderId) => GoogleApi('move parent', {
    fileId: key,
    rmFolderId: handling,
    addFolderId: folderId,
}).then(() => handleError(err));
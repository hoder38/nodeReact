import { USERDB, STORAGEDB } from '../constants'
import Express from 'express'
import { getInfo as YouGetInfo} from 'youtube-dl'
import { existsSync as FsExistsSync } from 'fs'
import { dirname as PathDirname, basename as PathBasename } from 'path'
import Mkdirp from 'mkdirp'
import Mongo, { objectID } from '../models/mongo-tool'
import MediaHandleTool from '../models/mediaHandle-tool'
import GoogleApi from '../models/api-tool-google'
import Api from '../models/api-tool'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import { bilibiliVideoUrl, youtubeVideoUrl, kuboVideoUrl } from '../models/external-tool'
import { addPost, extType, extTag, supplyTag } from '../util/mime'
import { checkLogin, handleError, HoError, isValidString, getFileLocation, getJson, toValidName, checkAdmin, sortList } from '../util/utility'


const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/2drive/:uid', function(req, res, next){
    console.log('external 2 drive');
    Mongo('find', USERDB, {_id: req.user._id}, {limit: 1}).then(userlist => {
        if (userlist.length < 1) {
            handleError(new HoError('do not find user!!!'));
        }
        if (!userlist[0].auto) {
            handleError(new HoError('user dont have google drive!!!'));
        }
        return Mongo('find', STORAGEDB, {_id: isValidString(req.params.uid, 'uid', 'uid is not vaild')}, {limit: 1}).then(items => {
            if (items.length < 1) {
                handleError(new HoError('cannot find file!!!'));
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                handleError(new HoError('file cannot downlad!!!'));
            }
            const filePath = getFileLocation(items[0].owner, items[0]._id);
            return GoogleApi('list folder', {
                folderId: userlist[0].auto,
                name: 'downloaded',
            }).then(downloadedList => {
                if (downloadedList.length < 1) {
                    handleError(new HoError('do not have downloaded folder!!!'));
                }
                const downloaded = downloadedList[0].id;
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
                        const next = index => {
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
                                }).then(() => next(index)) : Promise.reject(handleError(new HoError('do not find parent!!!')));
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
                                }).then(() => next(index)) : Promise.reject(handleError(new HoError('do not find parent!!!')));
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
            });
        }).then(() => res.json({apiOK: true}));
    }).catch(err => handleError(err, next));
});

router.get('/getSingle/:uid', function(req, res, next) {
    console.log('external getSingle');
    const id = req.params.uid.match(/^(you|dym|bil|soh|let|vqq|fun|kdr|yuk|tud)_(.*)/);
    if (!id) {
        handleError(new HoError('file is not youtube video!!!'));
    }
    let subIndex = 1;
    let url = null;
    let idsub = null;
    switch(id[1]) {
        case 'dym':
        url = `http://www.dailymotion.com/embed/video/${id[2]}`;
        break;
        case 'bil':
        idsub = id[2].match(/^([^_]+)_(\d+)$/);
        url = idsub ? `http://www.bilibili.com/video/${idsub[1]}/index_${idsub[2]}.html` : `http://www.bilibili.com/video/${id[2]}/`;
        break;
        case 'soh':
        idsub = id[2].match(/^([^_]+)_(\d)$/);
        subIndex = Number(idsub[2]);
        url = `http://tv.sohu.com/${idsub[1]}`;
        break;
        case 'let':
        url = `http://www.letv.com/ptv/vplay/${id[2]}`;
        break;
        case 'vqq':
        idsub = id[2].match(/^([^_]+)_(\d)$/);
        subIndex = Number(idsub[2]);
        url = `http://v.qq.com/${idsub[1]}`;
        break;
        case 'fun':
        idsub = id[2].match(/^([^_]+)_([^_]+)$/);
        url = `http://www.funshion.com/vplay/${idsub[1]}-${idsub[2]}`;
        break;
        case 'kdr':
        url = id[2];
        break;
        case 'yuk':
        idsub = id[2].match(/^([^_]+)_(\d+)$/);
        subIndex = Number(idsub[2]);
        url = `http://v.youku.com/v_show/id_${idsub[1]}.html`;
        break;
        case 'tud':
        idsub = id[2].match(/^([^_]+)_(\d+)$/);
        subIndex = Number(idsub[2]);
        url = `http://www.tudou.com/albumplay/${idsub[1]}.html`;
        break;
        default:
        url = `http://www.youtube.com/watch?v=${id[2]}`;
        break;
    }
    const getUrl = () => (id[1] === 'soh' || id[1] === 'let' || id[1] === 'vqq' || id[1] === 'fun' || id[1] === 'yuk' || id[1] === 'tud' || id[1] === 'kdr') ? kuboVideoUrl(id[1], url, subIndex) : (id[1] === 'bil') ? bilibiliVideoUrl(url) : youtubeVideoUrl(id[1], url);
    getUrl().then(ret_obj => res.json(ret_obj)).catch(err => handleError(err, next));
});

export default router

import { ENV_TYPE } from '../../../ver'
import { AUTO_UPLOAD, CHECK_MEDIA, UPDATE_EXTERNAL, AUTO_DOWNLOAD } from '../config'
import { DRIVE_INTERVAL, USERDB, MEDIA_INTERVAl, EXTERNAL_INTERVAL, DOC_INTERVAL } from '../constants'
import Mongo from '../models/mongo-tool'
import MediaHandleTool from '../models/mediaHandle-tool'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import PlaylistApi from '../models/api-tool-playlist'
import GoogleApi, { userDrive, autoDoc } from '../models/api-tool-google'
import { handleError } from '../util/utility'

export const autoUpload = () => {
    if (AUTO_UPLOAD(ENV_TYPE)) {
        const loopDrive = () => {
            console.log('loopDrive');
            console.log(new Date());
            return Mongo('find', USERDB, {auto: {$exists: true}}).then(userlist => userDrive(userlist, 0)).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), DRIVE_INTERVAL * 1000))).then(() => loopDrive());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 60000)).then(() => loopDrive()).catch(err => handleError(err, 'Loop drive'));
    }
}

export const autoDownload = () => {
    if (AUTO_DOWNLOAD(ENV_TYPE)) {
        const loopDoc = () => {
            console.log('loopDoc');
            console.log(new Date());
            return Mongo('find', USERDB, {
                auto: {$exists: true},
                perm: 1,
            }).then(userlist => {
                switch (new Date().getHours()) {
                    case 11:
                    return autoDoc(userlist, 0, 'am');
                    case 17:
                    return autoDoc(userlist, 0, 'jp');
                    case 18:
                    return autoDoc(userlist, 0, 'tw');
                    default:
                    return Promise.resolve();
                }
            }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000))).then(() => loopDoc());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 120000)).then(() => loopDoc()).catch(err => handleError(err, 'Loop doc'));
    }
}

export const checkMedia = () => {
    if (CHECK_MEDIA(ENV_TYPE)) {
        const loopHandleMedia = () => {
            console.log('loopCheckMedia');
            console.log(new Date());
            return PlaylistApi('playlist kick').then(() => MediaHandleTool.checkMedia().then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), MEDIA_INTERVAl * 1000))).then(() => loopHandleMedia()));
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 180000)).then(() => loopHandleMedia()).catch(err => handleError(err, 'Loop checkMedia'));
    }
}

export const updateExternal = () => {
    if (UPDATE_EXTERNAL(ENV_TYPE)) {
        const loopUpdateExternal = () => {
            console.log('loopUpdateExternal');
            console.log(new Date());
            console.log('complete tag');
            return completeMimeTag(1).then(() => External.getList('lovetv')).then(() => External.getList('eztv')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 240000)).then(() => loopUpdateExternal()).catch(err => handleError(err, 'Loop updateExternal'));
    }
}
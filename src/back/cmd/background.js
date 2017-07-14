import { ENV_TYPE } from '../ver'
import { AUTO_UPLOAD, CHECK_MEDIA, UPDATE_EXTERNAL, AUTO_DOWNLOAD, UPDATE_STOCK, STOCK_MODE, STOCK_DATE } from '../config'
import { DRIVE_INTERVAL, USERDB, MEDIA_INTERVAl, EXTERNAL_INTERVAL, DOC_INTERVAL, STOCK_INTERVAL, STOCKDB } from '../constants'
import Mongo from '../models/mongo-tool'
import StockTool, { getStockList, getSingleAnnual } from '../models/stock-tool.js'
import MediaHandleTool from '../models/mediaHandle-tool'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import PlaylistApi from '../models/api-tool-playlist'
import GoogleApi, { userDrive, autoDoc } from '../models/api-tool-google'
import { handleError } from '../util/utility'

let stock_batch_list = [];
let stock_batch_list_2 = [];

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

const updateStockAnnual = (year, folderList, updateList, index, uIndex) => {
    console.log('updateAnnual');
    console.log(new Date());
    console.log(year);
    console.log(folderList[index]);
    console.log(updateList[uIndex]);
    return getSingleAnnual(year, folderList[index], updateList[uIndex]).then(() => {
        uIndex++;
        if (uIndex < updateList.length) {
            return updateStockAnnual(year, folderList, updateList, index, uIndex);
        } else {
            index++;
            if (index < folderList.length) {
                return updateStockAnnual(year, folderList, updateList, index, 0);
            }
        }
    });
}

const updateStockList = (list, type) => {
    console.log('updateStockList');
    console.log(new Date());
    console.log(list[0]);
    return StockTool.getSingleStock(type, list[0], STOCK_MODE(ENV_TYPE)).then(() => {
        list.splice(0, 1);
        if (list.length > 0) {
            return updateStockList(list, type);
        }
    });
}

export const updateStock = () => {
    if (UPDATE_STOCK(ENV_TYPE)) {
        const loopUpdateStock = () => {
            console.log('loopUpdateStock');
            console.log(new Date());
            const sDay = STOCK_DATE(ENV_TYPE).indexOf(new Date().getDate());
            console.log(sDay);
            let use_stock_list = stock_batch_list;
            if (stock_batch_list.length > 0) {
                console.log('stock_batch_list remain');
                console.log(stock_batch_list.length);
                stock_batch_list_2 = [...stock_batch_list];
                stock_batch_list = [];
                use_stock_list = stock_batch_list_2;
            } else if (stock_batch_list_2.length > 0) {
                console.log('stock_batch_list_2 remain');
                console.log(stock_batch_list_2.length);
                stock_batch_list = [...stock_batch_list_2];
                stock_batch_list_2 = [];
                use_stock_list = stock_batch_list;
            }
            const parseStockList = () => (sDay === -1) ? Promise.resolve() : getStockList('twse', Math.floor(sDay / 2) + 1).then(stocklist => Mongo('find', STOCKDB, {important: 1}).then(items => {
                let annualList = [];
                const year = new Date().getFullYear();
                items.forEach(i => {
                    if (use_stock_list.indexOf(i.index) === -1) {
                        use_stock_list.push(i.index);
                    }
                    if (annualList.indexOf(i.index) === -1) {
                        annualList.push(i.index);
                    }
                });
                stocklist.forEach(i => {
                    if (use_stock_list.indexOf(i) === -1) {
                        use_stock_list.push(i);
                    }
                });
                let folderList = [];
                const recur_find = (userlist, index) => (index < userlist.length) ? GoogleApi('list folder', {
                    folderId: userlist[index].auto,
                    name: 'downloaded',
                }).then(downloadedList => {
                    if (downloadedList.length > 0) {
                        folderList.push(downloadedList[0].id);
                    }
                    return recur_find(userlist, index + 1);
                }) : (folderList.length > 0) ? updateStockAnnual(year, folderList, annualList, 0, 0): Promise.resolve();
                const nextUpdate = () => (annualList.length > 0) ? Mongo('find', USERDB, {
                    auto: {$exists: true},
                    perm: 1,
                }).then(userlist => recur_find(userlist, 0)) : Promise.resolve();
                return nextUpdate().then(() => updateStockList(use_stock_list, 'twse'));
            }));
            return parseStockList().then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), STOCK_INTERVAL * 1000))).then(() => loopUpdateStock());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 20000)).then(() => loopUpdateStock()).catch(err => handleError(err, 'Loop updateStock'));
    }
}
import { ENV_TYPE } from '../../../ver'
import { AUTO_UPLOAD, CHECK_MEDIA, UPDATE_EXTERNAL, AUTO_DOWNLOAD, UPDATE_STOCK, STOCK_MODE, STOCK_DATE, STOCK_FILTER, DB_BACKUP, PING_SERVER, CHECK_STOCK, BITFINEX_LOAN, BITFINEX_FILTER } from '../config'
import { DRIVE_INTERVAL, USERDB, MEDIA_INTERVAl, EXTERNAL_INTERVAL, DOC_INTERVAL, STOCK_INTERVAL, STOCKDB, BACKUP_COLLECTION, BACKUP_INTERVAL, PRICE_INTERVAL, RATE_INTERVAL, FUSD_SYM, FUSDT_SYM, FETH_SYM, FBTC_SYM, FOMG_SYM, SUPPORT_PAIR } from '../constants'
import Mongo from '../models/mongo-tool'
import StockTool, { getStockListV2, getSingleAnnual, stockStatus } from '../models/stock-tool.js'
import MediaHandleTool from '../models/mediaHandle-tool'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import { calRate, setWsOffer, resetBFX, calWeb } from '../models/bitfinex-tool'
import PlaylistApi from '../models/api-tool-playlist'
import GoogleApi, { userDrive, autoDoc, googleBackupDb } from '../models/api-tool-google'
import { dbDump } from './cmd'
import { handleError, completeZero } from '../util/utility'
import sendWs from '../util/sendWs'

let stock_batch_list = [];
let stock_batch_list_2 = [];

function bgError(err, type) {
    sendWs(`${type}: ${err.message||err.msg}`, 0, 0, true);
    handleError(err, type);
}

export const autoUpload = () => {
    if (AUTO_UPLOAD(ENV_TYPE)) {
        const loopDrive = () => {
            console.log('loopDrive');
            console.log(new Date());
            return Mongo('find', USERDB, {auto: {$exists: true}}).then(userlist => userDrive(userlist, 0)).catch(err => bgError(err, 'Loop drive')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), DRIVE_INTERVAL * 1000))).then(() => loopDrive());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 60000)).then(() => loopDrive());
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
            }).catch(err => bgError(err, 'Loop doc')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000))).then(() => loopDoc());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 120000)).then(() => loopDoc());
    }
}

export const checkMedia = () => {
    if (CHECK_MEDIA(ENV_TYPE)) {
        const loopHandleMedia = () => {
            console.log('loopCheckMedia');
            console.log(new Date());
            return PlaylistApi('playlist kick').then(() => MediaHandleTool.checkMedia()).catch(err => bgError(err, 'Loop checkMedia')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), MEDIA_INTERVAl * 1000))).then(() => loopHandleMedia());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 180000)).then(() => loopHandleMedia());
    }
}

export const updateExternal = () => {
    if (UPDATE_EXTERNAL(ENV_TYPE)) {
        const loopUpdateExternal = () => {
            console.log('loopUpdateExternal');
            console.log(new Date());
            console.log('complete tag');
            //return completeMimeTag(1).then(() => External.getList('lovetv')).then(() => External.getList('eztv')).catch(err => bgError(err, 'Loop updateExternal')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
            return completeMimeTag(1).then(() => External.getList('eztv')).catch(err => bgError(err, 'Loop updateExternal')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 240000)).then(() => loopUpdateExternal());
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
    return StockTool.getSingleStockV2(type, list[0], STOCK_MODE(ENV_TYPE)).then(() => {
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
            /*let use_stock_list = stock_batch_list;
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
            }*/
            let use_stock_list = [];
            const parseStockList = () => (sDay === -1) ? Promise.resolve() : getStockListV2('twse', new Date().getFullYear(), new Date().getMonth() + 1).then(stocklist => {/*Mongo('find', STOCKDB, {important: 1}).then(items => {
                let annualList = [];
                const year = new Date().getFullYear();
                items.forEach(i => {
                    if (annualList.indexOf(i.index) === -1) {
                        annualList.push(i.index);
                    }
                });*/
                stocklist.forEach(i => {
                    if (use_stock_list.indexOf(i) === -1) {
                        use_stock_list.push(i);
                    }
                });
                /*let folderList = [];
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
            }));*/
                return updateStockList(use_stock_list, 'twse');
            });
            return parseStockList().catch(err => bgError(err, 'Loop updateStock')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), STOCK_INTERVAL * 1000))).then(() => loopUpdateStock());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 300000)).then(() => loopUpdateStock());
    }
}

export const filterStock = () => {
    //get db
    if (STOCK_FILTER(ENV_TYPE)) {
        const loopStockFilter = () => {
            console.log('loopStockFilter');
            console.log(new Date());
            const sd = new Date();
            const sdf = () => (sd.getDay() === 5 && sd.getHours() === 23) ? StockTool.stockFilterWarp() : Promise.resolve();
            return sdf().catch(err => bgError(err, 'Loop stockFilter')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000))).then(() => loopStockFilter());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 360000)).then(() => loopStockFilter());
    }
}

//暫不刪除pi上的備份
export const dbBackup = () => {
    if (DB_BACKUP(ENV_TYPE)) {
        const allBackup = () => {
            console.log('allBackup');
            console.log(new Date());
            const sd = new Date();
            const backupDate = `${sd.getFullYear()}${completeZero(sd.getMonth() + 1, 2)}${completeZero(sd.getDate(), 2)}`;
            const singleBackup = index => {
                if (index >= BACKUP_COLLECTION.length) {
                    return googleBackupDb(backupDate);
                }
                console.log(BACKUP_COLLECTION[index]);
                return dbDump(BACKUP_COLLECTION[index], backupDate).then(() => singleBackup(index + 1));
            }
            const sdf = () => (sd.getDate() === 2) ? singleBackup(0) : Promise.resolve();
            return sdf().catch(err => bgError(err, 'Loop stockFilter')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), BACKUP_INTERVAL * 1000))).then(() => allBackup());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 420000)).then(() => allBackup());
    }
}

export const checkStock = () => {
    if (CHECK_STOCK(ENV_TYPE)) {
        const checkS = () => {
            const newStr = (new Date().getHours() >= 20) ? true : false;
            return stockStatus(newStr).catch(err => bgError(err, 'Loop checkStock')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), PRICE_INTERVAL * 1000))).then(() => checkS());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 120000)).then(() => checkS());
    }
}

export const rateCalculator = () => {
    //if (BITFINEX_LOAN(ENV_TYPE)) {
        const calR = () => calRate([FUSD_SYM, FUSDT_SYM, FBTC_SYM, FETH_SYM, FOMG_SYM]).catch(err => bgError(err, 'Loop rate calculator')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000))).then(() => calR());
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 60000)).then(() => calR());
    //}
}

export const setUserOffer = () => {
    if (BITFINEX_LOAN(ENV_TYPE)) {
        const checkUser = (index, userlist) => (index >= userlist.length) ? Promise.resolve() : setWsOffer(userlist[index].username, userlist[index].bitfinex, userlist[index]._id).then(() => checkUser(index + 1, userlist));
        const setO = () => Mongo('find', USERDB, {bitfinex: {$exists: true}}).then(userlist => checkUser(0, userlist).catch(err => {
            if ((err.message||err.msg).includes('Maximum call stack size exceeded')) {
                return resetBFX();
            } else {
                resetBFX(true);
                return bgError(err, 'Loop set offer')
            }
        })).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000))).then(() => setO());
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 90000)).then(() => setO());
    }
}

export const filterBitfinex = () => {
    if (BITFINEX_FILTER(ENV_TYPE)) {
        const cW = () => calWeb(SUPPORT_PAIR[FUSD_SYM]).catch(err => bgError(err, 'Loop bitfinex filter')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), BACKUP_INTERVAL * 1000))).then(() => cW());
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 80000)).then(() => cW());
    }
}
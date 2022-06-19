import { ENV_TYPE } from '../../../ver.js'
import { AUTO_UPLOAD, CHECK_MEDIA/*, UPDATE_EXTERNAL*/, AUTO_DOWNLOAD, UPDATE_STOCK, /*STOCK_MODE, STOCK_DATE, */STOCK_FILTER, DB_BACKUP, CHECK_STOCK, BITFINEX_LOAN, BITFINEX_FILTER, USSE_TICKER, TWSE_TICKER } from '../config.js'
import { DRIVE_INTERVAL, USERDB, MEDIA_INTERVAl, EXTERNAL_INTERVAL, DOC_INTERVAL, /*STOCK_INTERVAL, */STOCKDB, BACKUP_COLLECTION, BACKUP_INTERVAL, PRICE_INTERVAL, RATE_INTERVAL, FUSD_SYM, SUPPORT_COIN, SUPPORT_PAIR, MAX_RETRY } from '../constants.js'
import Mongo from '../models/mongo-tool.js'
import StockTool, { getStockListV2, getSingleAnnual, stockStatus } from '../models/stock-tool.js'
import MediaHandleTool from '../models/mediaHandle-tool.js'
import { completeMimeTag } from '../models/tag-tool.js'
import External from '../models/external-tool.js'
import { calRate, setWsOffer, resetBFX, calWeb } from '../models/bitfinex-tool.js'
import PlaylistApi from '../models/api-tool-playlist.js'
import GoogleApi, { userDrive, autoDoc, googleBackupDb } from '../models/api-tool-google.js'
import { usseTDInit, resetTD } from '../models/tdameritrade-tool.js'
import { twseShioajiInit, resetShioaji } from '../models/shioaji-tool.js'
import { dbDump } from './cmd.js'
import { handleError, completeZero } from '../util/utility.js'
import sendWs from '../util/sendWs.js'

const stock_batch_list = [];

let currentSetOffer = 0;
let currentInitUsse = 0;
let currentInitTwse = 0;
let currentUpdateStockList = 0;
let currentAutoUpload = 0;
let currentCheckMedia = 0;
let currentCheckStock = 0;
let currentRateCalculator = 0;

function bgError(err, type) {
    sendWs(`${type}: ${err.message||err.msg}`, 0, 0, true);
    handleError(err, type);
}

export const autoUpload = () => {
    if (AUTO_UPLOAD(ENV_TYPE)) {
        const loopDrive = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentAutoUpload || currentAutoUpload < (now - DRIVE_INTERVAL * MAX_RETRY)) {
                currentAutoUpload = now;
                console.log('loopDrive');
                console.log(new Date().toLocaleString());
                Mongo('find', USERDB, {auto: {$exists: true}}).then(userlist => userDrive(userlist, 0)).catch(err => bgError(err, 'Loop drive')).then(() => currentAutoUpload = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DRIVE_INTERVAL * 1000)).then(() => loopDrive());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 360000)).then(() => loopDrive());
    }
}

export const autoDownload = () => {
    if (AUTO_DOWNLOAD(ENV_TYPE)) {
        const loopDoc = () => {
            console.log('loopDoc');
            console.log(new Date().toLocaleString());
            Mongo('find', USERDB, {
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
            }).catch(err => bgError(err, 'Loop doc'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000)).then(() => loopDoc());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 390000)).then(() => loopDoc());
    }
}

export const checkMedia = () => {
    if (CHECK_MEDIA(ENV_TYPE)) {
        const loopHandleMedia = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentCheckMedia || currentCheckMedia < (now - MEDIA_INTERVAl * MAX_RETRY)) {
                currentCheckMedia = now;
                console.log('loopCheckMedia');
                console.log(new Date().toLocaleString());
                PlaylistApi('playlist kick').then(() => MediaHandleTool.checkMedia()).catch(err => bgError(err, 'Loop checkMedia')).then(() => currentCheckMedia = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), MEDIA_INTERVAl * 1000)).then(() => loopHandleMedia());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 420000)).then(() => loopHandleMedia());
    }
}

/*export const updateExternal = () => {
    if (UPDATE_EXTERNAL(ENV_TYPE)) {
        const loopUpdateExternal = () => {
            console.log('loopUpdateExternal');
            console.log(new Date().toLocaleString());
            console.log('complete tag');
            //return completeMimeTag(1).then(() => External.getList('lovetv')).then(() => External.getList('eztv')).catch(err => bgError(err, 'Loop updateExternal')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
            return completeMimeTag(1).then(() => External.getList('eztv')).catch(err => bgError(err, 'Loop updateExternal')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 240000)).then(() => loopUpdateExternal());
    }
}*/

/*const updateStockAnnual = (year, folderList, updateList, index, uIndex) => {
    console.log('updateAnnual');
    console.log(new Date().toLocaleString());
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
}*/

export const updateStockList = () => {
    if (UPDATE_STOCK(ENV_TYPE)) {
        //怕程序死掉 改為不等執行完就開始倒數
        const loopUpdateStockList = () => {
            if (stock_batch_list.length > 0) {
                const now = Math.round(new Date().getTime() / 1000);
                if (!currentUpdateStockList || currentUpdateStockList < (now - RATE_INTERVAL * MAX_RETRY)) {
                    currentUpdateStockList = now;
                    console.log('loopUpdateStockList');
                    console.log(new Date().toLocaleString());
                    console.log(stock_batch_list[0]);
                    console.log(stock_batch_list.length);
                    const item = stock_batch_list.splice(0, 1);
                    StockTool.getSingleStockV2(item[0].type, item[0], 1).catch(err => bgError(err, 'Loop updateStockList')).then(() => currentUpdateStockList = 0);
                }
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000)).then(() => loopUpdateStockList());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 540000)).then(() => loopUpdateStockList());
    }
}

/*const updateStockList = () => {
    console.log('updateStockList');
    console.log(new Date().toLocaleString());
    console.log(stock_batch_list[0]);
    console.log(stock_batch_list.length);
    return StockTool.getSingleStockV2(stock_batch_list[0].type, stock_batch_list[0], 1).catch(err => bgError(err, 'Loop updateStock single')).then(() => {
        stock_batch_list.splice(0, 1);
        if (stock_batch_list.length > 0) {
            return updateStockList();
        }
    });
}*/

export const updateStock = () => {
    if (UPDATE_STOCK(ENV_TYPE)) {
        const loopUpdateStock = () => {
            console.log('loopUpdateStock');
            console.log(new Date().toLocaleString());
            //let use_stock_list = [];
            const sd = new Date();
            const parseStockList = () => (sd.getDay() === 2 && sd.getHours() === 3) ? getStockListV2('twse', new Date().getFullYear(), new Date().getMonth() + 1).then(stocklist => {
                stocklist.forEach(i => stock_batch_list.push(i));
                //return updateStockList();
            }) : (sd.getDay() === 5 && sd.getHours() === 3) ? getStockListV2('usse', new Date().getFullYear(), new Date().getMonth() + 1).then(stocklist => {
                stocklist.forEach(i => stock_batch_list.push(i));
                //return updateStockList();
            }) : Promise.resolve();
            parseStockList().catch(err => bgError(err, 'Loop updateStock'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000)).then(() => loopUpdateStock());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 450000)).then(() => loopUpdateStock());
    }
}

export const filterStock = () => {
    //get db
    if (STOCK_FILTER(ENV_TYPE)) {
        const loopStockFilter = () => {
            console.log('loopStockFilter');
            console.log(new Date().toLocaleString());
            const sd = new Date();
            const sdf = () => (sd.getDay() === 2 && sd.getHours() === 1) ? StockTool.stockFilterWarp() : Promise.resolve();
            sdf().catch(err => bgError(err, 'Loop stockFilter'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000)).then(() => loopStockFilter());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 480000)).then(() => loopStockFilter());
    }
}

//暫不刪除pi上的備份
export const dbBackup = () => {
    if (DB_BACKUP(ENV_TYPE)) {
        const allBackup = () => {
            console.log('allBackup');
            console.log(new Date().toLocaleString());
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
            sdf().catch(err => bgError(err, 'Loop stockFilter'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), BACKUP_INTERVAL * 1000)).then(() => allBackup());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 510000)).then(() => allBackup());
    }
}

export const checkStock = () => {
    if (CHECK_STOCK(ENV_TYPE)) {
        const checkS = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentCheckStock || currentCheckStock < (now - PRICE_INTERVAL * MAX_RETRY)) {
                currentCheckStock = now;
                console.log('checkStock');
                const newStr = (new Date().getHours() >= 20) ? true : false;
                stockStatus(newStr).catch(err => bgError(err, 'Loop checkStock')).then(() => currentCheckStock = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), PRICE_INTERVAL * 1000)).then(() => checkS());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 330000)).then(() => checkS());
    }
}

export const rateCalculator = () => {
    if (BITFINEX_LOAN(ENV_TYPE)) {
        const calR = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentRateCalculator || currentRateCalculator < (now - RATE_INTERVAL * MAX_RETRY)) {
                currentRateCalculator = now;
                calRate(SUPPORT_COIN).catch(err => bgError(err, 'Loop rate calculator')).then(() => currentRateCalculator = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000)).then(() => calR());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 60000)).then(() => calR());
    }
}

export const setUserOffer = () => {
    if (BITFINEX_LOAN(ENV_TYPE)) {
        const checkUser = (index, userlist) => (index >= userlist.length) ? Promise.resolve() : setWsOffer(userlist[index].username, userlist[index].bitfinex, userlist[index]._id).then(() => checkUser(index + 1, userlist));
        const setO = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentSetOffer || currentSetOffer < (now - RATE_INTERVAL * MAX_RETRY)) {
                currentSetOffer = now;
                console.log('setUserOffer');
                console.log(new Date().toLocaleString());
                Mongo('find', USERDB, {bitfinex: {$exists: true}}).then(userlist => checkUser(0, userlist).catch(err => {
                    if ((err.message || err.msg).includes('Maximum call stack size exceeded') || (err.message || err.msg).includes('socket hang up') || (err.message || err.msg).includes('Order not found')) {
                        sendWs(`Loop set offer BFX reset ${err.message||err.msg}`, 0, 0, true);
                        return resetBFX();
                    } else {
                        resetBFX(true);
                        return bgError(err, 'Loop set offer')
                    }
                })).then(() => currentSetOffer = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000)).then(() => setO());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 90000)).then(() => setO());
        /*
        console.log('setUserOffer');
        console.log(new Date().toLocaleString());
        const checkUser = (index, userlist) => (index >= userlist.length) ? Promise.resolve() : setWsOffer(userlist[index].username, userlist[index].bitfinex, userlist[index]._id).then(() => checkUser(index + 1, userlist));
        const setO = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (startTime === currentSetOffer) {
                lastSetOffer = now;
                return Mongo('find', USERDB, {bitfinex: {$exists: true}}).then(userlist => checkUser(0, userlist).catch(err => {
                    if ((err.message || err.msg).includes('Maximum call stack size exceeded') || (err.message || err.msg).includes('socket hang up') || (err.message || err.msg).includes('Order not found')) {
                        sendWs(`Loop set offer BFX reset ${err.message||err.msg}`, 0, 0, true);
                        return resetBFX();
                    } else {
                        resetBFX(true);
                        return bgError(err, 'Loop set offer')
                    }
                })).then(() => {
                    console.log(`setUserOffer end ${lastSetOffer} ${Math.round(new Date().getTime() / 1000)}`);
                    return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000))
                }).then(() => setO());
            }
        }
        if (currentSetOffer) {
            return setO();
        } else {
            return new Promise((resolve, reject) => setTimeout(() => resolve(), 90000)).then(() => setO());
        }*/
    }
}
/*
export const checkSetOffer = () => {
    if (BITFINEX_LOAN(ENV_TYPE)) {
        const cso = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if ((now - lastSetOffer) > (RATE_INTERVAL * 20)) {
                sendWs('restart set offer', 0, 0, true);
                currentSetOffer = now;
                setUserOffer(now);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000)).then(() => cso());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 120000)).then(() => cso());
    }
}*/

export const filterBitfinex = () => {
    if (BITFINEX_FILTER(ENV_TYPE)) {
        const cW = () => {
            calWeb(SUPPORT_PAIR[FUSD_SYM]).catch(err => bgError(err, 'Loop bitfinex filter'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), BACKUP_INTERVAL * 1000)).then(() => cW());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 150000)).then(() => cW());
    }
}

export const usseInit = () => {
    if (USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
        const setO = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentInitUsse || currentInitUsse < (now - PRICE_INTERVAL * MAX_RETRY)) {
                currentInitUsse = now;
                console.log('initUsse');
                console.log(new Date().toLocaleString());
                usseTDInit().catch(err => {
                    resetTD();
                    return bgError(err, 'Loop usse init');
                }).then(() => currentInitUsse = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), PRICE_INTERVAL * 1000)).then(() => setO());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 210000)).then(() => setO());
    }
}

export const twseInit = () => {
    if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
        const setO = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentInitTwse || currentInitTwse < (now - PRICE_INTERVAL * MAX_RETRY)) {
                currentInitTwse = now;
                console.log('initTwse');
                console.log(new Date().toLocaleString());
                twseShioajiInit().catch(err => {
                    resetShioaji();
                    return bgError(err, 'Loop twse init');
                }).then(() => currentInitTwse = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), PRICE_INTERVAL * 1000)).then(() => setO());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 270000)).then(() => setO());
    }
}
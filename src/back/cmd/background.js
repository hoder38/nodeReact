import { ENV_TYPE } from '../../../ver.js'
import { AUTO_UPLOAD, CHECK_MEDIA, UPDATE_STOCK, STOCK_FILTER, DB_BACKUP, CHECK_STOCK, BITFINEX_LOAN, BITFINEX_FILTER, USSE_TICKER, TWSE_TICKER } from '../config.js'
import { DRIVE_INTERVAL, USERDB, MEDIA_INTERVAL, DOC_INTERVAL, BACKUP_COLLECTION, BACKUP_INTERVAL, PRICE_INTERVAL, RATE_INTERVAL, FUSD_SYM, SUPPORT_COIN, SUPPORT_PAIR, MAX_RETRY } from '../constants.js'
import Mongo from '../models/mongo-tool.js'
import StockTool, { getStockListV2, stockStatus } from '../models/stock-tool.js'
import MediaHandleTool from '../models/mediaHandle-tool.js'
import { calRate, setWsOffer, resetBFX, calWeb } from '../models/bitfinex-tool.js'
import PlaylistApi from '../models/api-tool-playlist.js'
import { userDrive, googleBackupDb } from '../models/api-tool-google.js'
import { usseTDInit, resetTD } from '../models/tdameritrade-tool.js'
import { twseShioajiInit, resetShioaji } from '../models/shioaji-tool.js'
import { dbDump } from './cmd.js'
import { handleError, completeZero } from '../util/utility.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js'

const log = createLogger('background')

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
            if (!currentAutoUpload || currentAutoUpload < (now - DRIVE_INTERVAL * (MAX_RETRY + 2))) {
                currentAutoUpload = now;
                log.info('background job: loopDrive started');
                Mongo('find', USERDB, {auto: {$exists: true}}).then(userlist => userDrive(userlist, 0)).catch(err => bgError(err, 'Loop drive')).then(() => currentAutoUpload = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DRIVE_INTERVAL * 1000)).then(() => loopDrive());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 360000)).then(() => loopDrive());
    }
}

export const checkMedia = () => {
    if (CHECK_MEDIA(ENV_TYPE)) {
        const loopHandleMedia = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentCheckMedia || currentCheckMedia < (now - MEDIA_INTERVAL * (MAX_RETRY + 2))) {
                currentCheckMedia = now;
                log.info('background job: loopCheckMedia started');
                PlaylistApi('playlist kick').then(() => MediaHandleTool.checkMedia()).catch(err => bgError(err, 'Loop checkMedia')).then(() => currentCheckMedia = 0);
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), MEDIA_INTERVAL * 1000)).then(() => loopHandleMedia());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 420000)).then(() => loopHandleMedia());
    }
}

export const updateStockList = () => {
    if (UPDATE_STOCK(ENV_TYPE)) {
        // Start countdown timer independently — prevents dead-loop if job hangs
        const loopUpdateStockList = () => {
            if (stock_batch_list.length > 0) {
                const now = Math.round(new Date().getTime() / 1000);
                if (!currentUpdateStockList || currentUpdateStockList < (now - RATE_INTERVAL * (MAX_RETRY + 2))) {
                    currentUpdateStockList = now;
                    log.info({ item: stock_batch_list[0], remaining: stock_batch_list.length }, 'background job: loopUpdateStockList processing');
                    const item = stock_batch_list.splice(0, 1);
                    StockTool.getSingleStockV2(item[0].type, item[0], 1, true).catch(err => {
                        if (!(err.message || err.msg).includes('too short stock data')) {
                            stock_batch_list.push(item[0]);
                        }
                        bgError(err, 'Loop updateStockList');
                    }).then(() => currentUpdateStockList = 0);
                }
            }
            return new Promise((resolve, reject) => setTimeout(() => resolve(), RATE_INTERVAL * 1000)).then(() => loopUpdateStockList());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 540000)).then(() => loopUpdateStockList());
    }
}

export const updateStock = () => {
    if (UPDATE_STOCK(ENV_TYPE)) {
        const loopUpdateStock = () => {
            log.info('background job: loopUpdateStock started');
            const sd = new Date();
            const parseStockList = () => (sd.getDay() === 6 && sd.getHours() === 3) ? getStockListV2('twse', new Date().getFullYear(), new Date().getMonth() + 1).then(stocklist => {
                stocklist.forEach(i => stock_batch_list.push(i));
            }) : (sd.getDay() === 4 && sd.getHours() === 3) ? getStockListV2('usse', new Date().getFullYear(), new Date().getMonth() + 1).then(stocklist => {
                stocklist.forEach(i => stock_batch_list.push(i));
            }) : Promise.resolve();
            parseStockList().catch(err => bgError(err, 'Loop updateStock'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000)).then(() => loopUpdateStock());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 450000)).then(() => loopUpdateStock());
    }
}

export const filterStock = () => {
    if (STOCK_FILTER(ENV_TYPE)) {
        const loopStockFilter = () => {
            log.info('background job: loopStockFilter started');
            const sd = new Date();
            const sdf = () => (sd.getDay() === 2 && sd.getHours() === 3) ? StockTool.stockFilterWarp() : Promise.resolve();
            sdf().catch(err => bgError(err, 'Loop stockFilter'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), DOC_INTERVAL * 1000)).then(() => loopStockFilter());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 480000)).then(() => loopStockFilter());
    }
}

// Backup kept on pi (not auto-deleted)
export const dbBackup = () => {
    if (DB_BACKUP(ENV_TYPE)) {
        const allBackup = () => {
            log.info('background job: allBackup started');
            const sd = new Date();
            const backupDate = `${sd.getFullYear()}${completeZero(sd.getMonth() + 1, 2)}${completeZero(sd.getDate(), 2)}`;
            const singleBackup = index => {
                if (index >= BACKUP_COLLECTION.length) {
                    return googleBackupDb(backupDate);
                }
                log.debug({ collection: BACKUP_COLLECTION[index] }, 'backing up collection');
                return dbDump(BACKUP_COLLECTION[index], backupDate).then(() => singleBackup(index + 1));
            }
            const sdf = () => (sd.getDate() === 2) ? singleBackup(0) : Promise.resolve();
            sdf().catch(err => bgError(err, 'Loop allBackup'));
            return new Promise((resolve, reject) => setTimeout(() => resolve(), BACKUP_INTERVAL * 1000)).then(() => allBackup());
        }
        return new Promise((resolve, reject) => setTimeout(() => resolve(), 510000)).then(() => allBackup());
    }
}

export const checkStock = () => {
    if (CHECK_STOCK(ENV_TYPE)) {
        const checkS = () => {
            const now = Math.round(new Date().getTime() / 1000);
            if (!currentCheckStock || currentCheckStock < (now - PRICE_INTERVAL * (MAX_RETRY + 2))) {
                currentCheckStock = now;
                log.info('background job: checkStock started');
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
            if (!currentRateCalculator || currentRateCalculator < (now - RATE_INTERVAL * (MAX_RETRY + 2))) {
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
            if (!currentSetOffer || currentSetOffer < (now - RATE_INTERVAL * (MAX_RETRY + 2))) {
                currentSetOffer = now;
                log.info('background job: setUserOffer started');
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
    }
}

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
            if (!currentInitUsse || currentInitUsse < (now - PRICE_INTERVAL * (MAX_RETRY + 2))) {
                currentInitUsse = now;
                log.info('background job: initUsse started');
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
            if (!currentInitTwse || currentInitTwse < (now - PRICE_INTERVAL * (MAX_RETRY + 2))) {
                currentInitTwse = now;
                log.info('background job: initTwse started');
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
import { USERDB, STORAGEDB, STOCKDB, PASSWORDDB, BACKUP_LIMIT, TOTALDB } from '../constants.js'
import { ENV_TYPE, PASSWORD_SALT } from '../../../ver.js'
import { BACKUP_PATH } from '../config.js'
import readline from 'readline'
const { createInterface } = readline;
import fsModule from 'fs'
const { writeFile: FsWriteFile, createReadStream: FsCreateReadStream, existsSync: FsExistsSync } = fsModule;
import Mkdirp from 'mkdirp'
import { completeMimeTag } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import StockTool, { getStockListV2 } from '../models/stock-tool.js'
import { handleError, HoError, completeZero } from '../util/utility.js'
import bcryptModule from 'bcrypt'
import createLogger from '../util/logger.js'

const log = createLogger('cmd')

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"

export const dbDump = (collection, backupDate=null) => {
    if (collection !== 'accessToken' && collection !== TOTALDB && collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User` && collection !== `${STORAGEDB}Dir` && collection !== `${STOCKDB}Dir` && collection !== `${PASSWORDDB}Dir`) {
        return handleError(new HoError('Collection not find'));
    }
    if (!backupDate) {
        backupDate = new Date();
        backupDate = `${backupDate.getFullYear()}${completeZero(backupDate.getMonth() + 1, 2)}${completeZero(backupDate.getDate(), 2)}`;
    }
    const folderPath = `${BACKUP_PATH(ENV_TYPE)}/${backupDate}/${collection}`;
    const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : Mkdirp(folderPath);
    const recur_dump = (index, offset) => Mongo('find', collection, {}, {
        limit: BACKUP_LIMIT,
        skip: offset,
    }).then(items => {
        if (items.length < 1) {
            return Promise.resolve();
        }
        log.debug({ count: items.length }, 'dump batch');
        let write_data = '';
        items.forEach(item => write_data = `${write_data}${JSON.stringify(item)}` + "\r\n");
        return new Promise((resolve, reject) => FsWriteFile(`${folderPath}/${index}`, write_data, 'utf8', err => err ? reject(err) : resolve())).then(() => recur_dump(index + 1, offset + items.length));
    });
    return mkfolder().then(() => recur_dump(0, 0));
}

const dbRestore = collection => {
    if (collection !== 'accessToken' && collection !== TOTALDB && collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User` && collection !== `${STORAGEDB}Dir` && collection !== `${STOCKDB}Dir` && collection !== `${PASSWORDDB}Dir`) {
        return handleError(new HoError('Collection not find'));
    }
    const folderPath = `${BACKUP_PATH(ENV_TYPE)}/${collection}`;
    const recur_insert = (index, store) => (index >= store.length) ? Promise.resolve() : Mongo('count', collection, {_id: store[index]._id}).then(count => (count > 0) ? recur_insert(index + 1, store) : Mongo('insert', collection, store[index]).then(() => recur_insert(index + 1, store)));
    const recur_restore = index => {
        const filePath = `${folderPath}/${index}`;
        log.debug({ filePath }, 'restoring from file');
        return !FsExistsSync(filePath) ? Promise.resolve() : new Promise((resolve, reject) => {
            let store = [];
            const rl = createInterface({
                input: FsCreateReadStream(filePath),
                terminal: false,
            });
            rl.on('line', line => {
                const json = JSON.parse(line);
                for (let i in json) {
                    if (i === '_id' || i === 'userId' || i === 'owner') {
                        if (json[i].length > 20) {
                            log.debug({ field: i, value: json[i] }, 'converting string id to ObjectId');
                            json[i] = objectID(json[i]);
                        }
                    }
                }
                store.push(json);
            }).on('close', () => resolve(store));
        }).then(store => recur_insert(0, store)).then(() => recur_restore(index + 1));
    }
    return recur_restore(0);
}

const resetTotal = (type, se) => {
    let find = null;
    switch(se) {
        case 'bfx':
        find = {sType: 1};
        break;
        case 'twse':
        find = {sType: {$exists: false}, setype: 'twse'};
        break;
        case 'usse':
        find = {sType: {$exists: false}, setype: 'usse'};
        break;
        default:
        return handleError(new HoError('Reset se unknown!!!'));
    }
    switch(type) {
        case 'newmid':
        return Mongo('updateMany', TOTALDB, {...find, newMid: {$exists: true}}, {$set: {newMid: []}}).then(count => {
            log.info({ count, se }, 'reset new mid updated');
            return Mongo('find', TOTALDB, {...find, newMid: {$exists: true}}).then(items => log.debug({ items, se }, 'reset new mid result')).catch(err => handleError(err, 'Reset new mid'));
        });
        case 'profit':
        return Mongo('updateMany', TOTALDB, {...find, profit: {$exists: true}}, {$set: {profit: 0}}).then(count => {
            log.info({ count, se }, 'reset profit updated');
            return Mongo('find', TOTALDB, {...find, profit: {$exists: true}}).then(items => log.debug({ items, se }, 'reset profit result')).catch(err => handleError(err, 'Reset profit'));
        });
        default:
        return handleError(new HoError('Reset type unknown!!!'));
    }
}

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

process.on('uncaughtException', err => {
    log.error({ err }, `Threw Exception: ${err.name} ${err.message}`);
    if (err.stack) {
        log.error({ stack: err.stack }, 'uncaught exception stack');
    }
});

rl.on('line', line => {
    const cmd = line.split(' ');
    switch (cmd[0]) {
        case 'stock':
        log.info({ type: cmd[1] || 'twse', index: cmd[2] || '2330', mode: cmd[3] || 1 }, 'stock command started');
        return StockTool.getSingleStockV2(cmd[1]||'twse', {index: cmd[2]||'2330', tag: []}, cmd[3]||1).then(() => log.info('stock command done')).catch(err => handleError(err, 'CMD stock'));
        case 'stocklist':
        log.info({ type: cmd[1] || 'twse' }, 'stock list command started');
        const date = new Date();
        return getStockListV2(cmd[1]||'twse', date.getFullYear(), date.getMonth() + 1).then(stocklist => {
            let updateyear = date.getFullYear();
            let updatequarter = 3;
            const month = date.getMonth() + 1;
            if (month < 4) {
                updatequarter = 4;
                updateyear--;
            } else if (month < 7) {
                updatequarter = 1;
            } else if (month < 10) {
                updatequarter = 2;
            }
            log.info({ quarter: `${updateyear}q${updatequarter}` }, 'stock list update quarter');
            stocklist.forEach(st => {
                log.debug({ index: st.index, tag: st.tag }, 'stock list item');
            });
        }).catch(err => handleError(err, 'CMD stock list'));
        case 'testdata':
        log.info('testdata command started');
        return StockTool.testData().then(() => log.info('testdata command done')).catch(err => handleError(err, 'CMD testdata'));
        case 'cleanstock':
        log.info({ dryRun: cmd[1] === 'remove' ? false : true }, 'clean stock command started');
        return StockTool.cleanUseless(cmd[1] === 'remove' ? false : true).then(() => log.info('clean stock command done')).catch(err => handleError(err, 'CMD clean stock'));
        case 'complete':
        log.info({ add: cmd[1] }, 'complete command started');
        return completeMimeTag(cmd[1]).then(() => log.info('complete command done')).catch(err => handleError(err, 'CMD complete'));
        case 'dbdump':
        log.info({ collection: cmd[1] }, 'dbdump command started');
        return dbDump(cmd[1]).then(() => log.info('dbdump command done')).catch(err => handleError(err, 'CMD dbdump'));
        case 'dbrestore':
        log.info({ collection: cmd[1] }, 'dbrestore command started');
        return dbRestore(cmd[1]).then(() => log.info('dbrestore command done')).catch(err => handleError(err, 'CMD dbrestore'));
        case 'resettotal':
        log.info({ type: cmd[1], se: cmd[2] }, 'reset total command started');
        return resetTotal(cmd[1], cmd[2]).then(() => log.info('reset total command done')).catch(err => handleError(err, 'Reset total'));
        case 'resetpassword':
        log.info('reset password command started');
        if (!cmd[1]) {
            return handleError(new HoError('password is required'), 'CMD resetpassword');
        }
        return bcryptModule.hash(PASSWORD_SALT + cmd[1], 10).then(hash =>
            Mongo('updateMany', USERDB, {}, {$set: {password: hash}})
        ).then(count => {
            log.info({ count }, 'reset password updated users');
            log.info('reset password command done');
        }).catch(err => handleError(err, 'CMD resetpassword'));

        default:
        log.info('help:');
        log.info('stock type index mode');
        log.info('stocklist type');
        log.info('complete [add]');
        log.info('dbdump collection');
        log.info('dbrestore collection');
        log.info('testdata');
        log.info('cleanstock [remove]');
        log.info('resettotal newmid|profit bfx|twse|usse');
        log.info('resetpassword <newPassword>');
    }
});
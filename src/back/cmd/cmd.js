import { USERDB, DRIVE_LIMIT, DOCDB, STORAGEDB, STOCKDB, PASSWORDDB } from '../constants'
import { createInterface } from 'readline'
import { writeFile as FsWriteFile, createReadStream as FsCreateReadStream, existsSync as FsExistsSync } from 'fs'
import Mkdirp from 'mkdirp'
import { userDrive, autoDoc } from '../models/api-tool-google'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import { handleError, handleReject, isValidString, HoError } from '../util/utility'

function cmdUpdateDrive(drive_batch=DRIVE_LIMIT, singleUser=null) {
    drive_batch = isNaN(drive_batch) ? DRIVE_LIMIT : Number(drive_batch);
    console.log(drive_batch);
    console.log('cmdUpdateDrive');
    console.log(new Date());
    const username = isValidString(singleUser, 'name');
    if (!username) {
        return handleReject(new HoError('user name not valid!!!'));
    }
    const isSingle = () => Mongo('find', USERDB, Object.assign({auto: {$exists: true}}, singleUser ? {username} : {}));
    return isSingle().then(userlist => userDrive(userlist, 0, drive_batch));
}

const dbDump = collection => {
    if (collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User` && collection !== `${USERDB}User`) {
        return handleReject(new HoError('Collection not find'));
    }
    const folderPath = `/mnt/mongodb/backup/${collection}`;
    const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
    const recur_dump = (index, offset) => Mongo('find', collection, {}, {
        limit: DRIVE_LIMIT,
        skip: offset,
    }).then(items => {
        if (items.length < DRIVE_LIMIT) {
            return Promise.resolve();
        }
        let write_data = '';
        items.forEach(item => {
            write_data = `${write_data}${JSON.stringify(item)}` + "\r\n";
        });
        return new Promise((resolve, reject) => FsWriteFile(`${folderPath}/${index}`, write_data, 'utf8', err => err ? reject(err) : resolve())).then(() => recur_dump(index + 1, offset + items.length));
    });
    return mkfolder().then(() => recur_dump(0, 0));
}

const dbRestore = collection => {
    if (collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User` && collection !== `${USERDB}User`) {
        return handleReject(new HoError('Collection not find'));
    }
    const folderPath = `/mnt/mongodb/backup/${collection}`;
    const recur_insert = (index, store) => (index >= store.length) ? Promise.resolve() : Mongo('insert', collection, store[index]).then(() => recur_insert(index + 1, store));
    const recur_restore = index => {
        const filePath = `${folderPath}/${index}`;
        return !FsExistsSync(filePath) ? Promise.resolve() : new Promise((resolve, reject) => {
            let store = [];
            const rl = createInterface({
                input: FsCreateReadStream(filePath),
                terminal: false,
            });
            rl.on('line', line => {
                const json = JSON.parse(line)
                for (let i in json) {
                    if (i === '_id' || i === 'userId' || i === 'owner') {
                        json[i] = objectID(json[i]);
                    }
                }
                store.push(json);
            }).on('close', () => resolve(store));
        }).then(store => recur_insert(0, store)).then(() => recur_restore(index + 1));
    }
    return recur_restore(0);
}

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});

process.on('uncaughtException', err => {
    console.log(`Threw Exception: ${err.name} ${err.message}`);
    if (err.stack) {
        console.log(err.stack);
    }
});

rl.on('line', line => {
    const cmd = line.split(' ');
    switch (cmd[0]) {
        case 'drive':
        console.log('drive');
        return cmdUpdateDrive(cmd[1], cmd[2]).then(() => console.log('done')).catch(err => handleError(err, 'CMD drive'));
        case 'doc':
        console.log('doc');
        return Mongo('find', USERDB, {
            auto: {$exists: true},
            perm: 1,
        }).then(userlist => autoDoc(userlist, 0, cmd[1], cmd[2])).then(() => console.log('done')).catch(err => handleError(err, 'CMD doc'));
        case 'checkdoc':
        console.log('checkdoc');
        return Mongo('find', DOCDB).then(doclist => console.log(doclist)).catch(err => handleError(err, 'CMD checkdoc'));
        case 'external':
        console.log('external');
        return External.getList(cmd[1], cmd[2]).then(() => console.log('done')).catch(err => handleError(err, 'CMD external'));
        case 'complete':
        console.log('complete');
        return completeMimeTag(cmd[1]).then(() => console.log('done')).catch(err => handleError(err, 'CMD complete'));
        case 'dbdump':
        console.log('dbdump');
        return dbDump(cmd[1]).then(() => console.log('done')).catch(err => handleError(err, 'CMD dbdump'));
        case 'dbrestore':
        console.log('dbrestore');
        return dbRestore(cmd[1]).then(() => console.log('done')).catch(err => handleError(err, 'CMD dbrestore'));
        default:
        console.log('help:');
        console.log('drive batchNumber [single username]');
        console.log('doc am|jp|tw [time]');
        console.log('checkdoc');
        console.log('external lovetv|eztv [clear]');
        console.log('complete [add]');
        console.log('dbdump collection');
        console.log('dbrestore collection');
    }
});
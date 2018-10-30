import { USERDB, DRIVE_LIMIT, DOCDB, STORAGEDB, STOCKDB, PASSWORDDB, RANDOM_EMAIL, BACKUP_LIMIT } from '../constants'
import { ENV_TYPE } from '../../../ver'
import { BACKUP_PATH } from '../config'
import { createInterface } from 'readline'
import { writeFile as FsWriteFile, createReadStream as FsCreateReadStream, existsSync as FsExistsSync } from 'fs'
import Mkdirp from 'mkdirp'
import { userDrive, autoDoc, sendPresentName } from '../models/api-tool-google'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import { handleError, isValidString, HoError, completeZero } from '../util/utility'

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"

const sendList = RANDOM_EMAIL;

function cmdUpdateDrive(drive_batch=DRIVE_LIMIT, singleUser=null) {
    drive_batch = isNaN(drive_batch) ? DRIVE_LIMIT : Number(drive_batch);
    console.log(drive_batch);
    console.log('cmdUpdateDrive');
    console.log(new Date());
    const username = isValidString(singleUser, 'name');
    if (!username) {
        return handleError(new HoError('user name not valid!!!'));
    }
    const isSingle = () => Mongo('find', USERDB, Object.assign({auto: {$exists: true}}, singleUser ? {username} : {}));
    return isSingle().then(userlist => userDrive(userlist, 0, drive_batch));
}

export const dbDump = (collection, backupDate=null) => {
    if (collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== DOCDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User`) {
        return handleError(new HoError('Collection not find'));
    }
    if (!backupDate) {
        backupDate = new Date();
        backupDate = `${backupDate.getFullYear()}${completeZero(backupDate.getMonth() + 1, 2)}${completeZero(backupDate.getDate(), 2)}`;
    }
    const folderPath = `${BACKUP_PATH(ENV_TYPE)}/${backupDate}/${collection}`;
    const mkfolder = () => FsExistsSync(folderPath) ? Promise.resolve() : new Promise((resolve, reject) => Mkdirp(folderPath, err => err ? reject(err) : resolve()));
    const recur_dump = (index, offset) => Mongo('find', collection, {}, {
        limit: BACKUP_LIMIT,
        skip: offset,
    }).then(items => {
        if (items.length < 1) {
            return Promise.resolve();
        }
        let write_data = '';
        items.forEach(item => write_data = `${write_data}${JSON.stringify(item)}` + "\r\n");
        return new Promise((resolve, reject) => FsWriteFile(`${folderPath}/${index}`, write_data, 'utf8', err => err ? reject(err) : resolve())).then(() => recur_dump(index + 1, offset + items.length));
    });
    return mkfolder().then(() => recur_dump(0, 0));
}

const dbRestore = collection => {
    if (collection !== USERDB && collection !== STORAGEDB && collection !== STOCKDB && collection !== PASSWORDDB && collection !== DOCDB && collection !== `${STORAGEDB}User` && collection !== `${STOCKDB}User` && collection !== `${PASSWORDDB}User`) {
        return handleError(new HoError('Collection not find'));
    }
    const folderPath = `${BACKUP_PATH(ENV_TYPE)}/${collection}`;
    const recur_insert = (index, store) => (index >= store.length) ? Promise.resolve() : Mongo('count', collection, {_id: store[index]._id}, {limit: 1}).then(count => (count > 0) ? recur_insert(index + 1, store) : Mongo('insert', collection, store[index]).then(() => recur_insert(index + 1, store)));
    const recur_restore = index => {
        const filePath = `${folderPath}/${index}`;
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
                        json[i] = objectID(json[i]);
                    }
                }
                store.push(json);
            }).on('close', () => resolve(store));
        }).then(store => recur_insert(0, store)).then(() => recur_restore(index + 1));
    }
    return recur_restore(0);
}

const randomSend = (action, joiner=null) => {
    switch (action) {
        case 'list':
        console.log(sendList);
        return Promise.resolve();
        break;
        case 'edit':
        if (!joiner) {
            return handleError(new HoError('Joiner unknown!!!'));
        }
        const result = joiner.split(':');
        for (let i in sendList) {
            if (result[0] === sendList[i].name) {
                sendList.splice(i, 1);
                console.log(sendList);
                return Promise.resolve();
            }
        }
        if (result.length < 2) {
            return handleError(new HoError('Joiner infomation valid!!!'));
        }
        sendList.push({
            name: result[0],
            mail: result[1],
        });
        console.log(sendList);
        return Promise.resolve();
        case 'send':
        console.log(sendList);
        if (sendList.length < 3) {
            return handleError(new HoError('Send list too short!!!'));
        }
        const orig = sendList.map((v, i) => i);
        //console.log(orig);
        const shuffle = arr => {
            let currentIndex = arr.length;
            while (currentIndex > 0) {
                const randomIndex = Math.floor(Math.random() * currentIndex);
                currentIndex--;
                const temporaryValue = arr[currentIndex];
                arr[currentIndex] = arr[randomIndex];
                arr[randomIndex] = temporaryValue;
            }
            return arr;
        }
        const testArr = arr => {
            for (let i = 0; i < arr.length; i++) {
                if (arr[i] === i) {
                    return false;
                }
                if (arr[arr[i]] === i) {
                    return false;
                }
            }
            return true;
        }
        let limit = 100;
        while (limit > 0) {
            const ran = shuffle(orig);
            //console.log(ran);
            if (testArr(ran)) {
                const recur_send = index => (index >= ran.length) ? Promise.resolve() : sendPresentName(new Buffer(sendList[ran[index]].name).toString('base64'), sendList[index].mail, joiner).then(() => recur_send(index + 1));
                return recur_send(0);
            }
            limit--;
        }
        console.log('out of limit');
        return Promise.resolve();
        default:
        return handleError(new HoError('Action unknown!!!'));
    }
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
        case 'randomsend':
        console.log('randomsend');
        return randomSend(cmd[1], cmd[2]).then(() => console.log('done')).catch(err => handleError(err, 'Random send'));
        default:
        console.log('help:');
        console.log('drive batchNumber [single username]');
        console.log('doc am|jp|tw [time]');
        console.log('checkdoc');
        console.log('external lovetv|eztv [clear]');
        console.log('complete [add]');
        console.log('dbdump collection');
        console.log('dbrestore collection');
        console.log('randomsend list|edit|send [name:email|append]');
    }
});
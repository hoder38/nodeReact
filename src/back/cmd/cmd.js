import { USERDB, DRIVE_LIMIT, DOCDB } from '../constants'
import { createInterface } from 'readline'
import { userDrive, autoDoc } from '../models/api-tool-google'
import { completeMimeTag } from '../models/tag-tool'
import External from '../models/external-tool'
import Mongo from '../models/mongo-tool'
import { handleError, isValidString } from '../util/utility'

function cmdUpdateDrive(drive_batch=DRIVE_LIMIT, singleUser=null) {
    drive_batch = isNaN(drive_batch) ? DRIVE_LIMIT : Number(drive_batch);
    console.log(drive_batch);
    console.log('cmdUpdateDrive');
    console.log(new Date());
    const isSingle = () => Mongo('find', USERDB, Object.assign({auto: {$exists: true}}, singleUser ? {username: isValidString(singleUser, 'name', 'user name not valid!!!')} : {}));
    return isSingle().then(userlist => userDrive(userlist, 0, drive_batch));
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
        default:
        console.log('help:');
        console.log('drive batchNumber [single username]');
        console.log('doc am|jp|tw [time]');
        console.log('checkdoc');
        console.log('external lovetv|eztv [clear]');
        console.log('complete [add]');
    }
});
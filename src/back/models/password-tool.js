import { PASSWORD_PRIVATE_KEY } from '../../../ver.js'
import { ALGORITHM, ALGORITHM_LEGACY, PASSWORDDB } from '../constants.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { isValidString, handleError, HoError, userPWCheck } from '../util/utility.js'
import crypto from 'crypto'
const { createCipheriv, createDecipheriv, randomBytes } = crypto;
import PasswordGenerator from 'password-generator'
import createLogger from '../util/logger.js'

const log = createLogger('password');

const PasswordTagTool = TagTool(PASSWORDDB);

export default {
    newRow: async function(data, user) {
        if (!data['username'] || !data['password'] || !data['conpassword'] || !data['name']) {
            return handleError(new HoError('parameter lost!!!'));
        }
        const name = isValidString(data['name'], 'name');
        if (!name) {
            return handleError(new HoError('name is not vaild!!!'));
        }
        const username = isValidString(data['username'], 'name');
        if (!username) {
            return handleError(new HoError('username is not vaild!!!'));
        }
        const password = isValidString(data['password'], 'altpwd');
        if (!password) {
            return handleError(new HoError('password is not vaild!!!'));
        }
        const conpassword = isValidString(data['conpassword'], 'altpwd');
        if (!conpassword) {
            return handleError(new HoError('password is not vaild!!!'));
        }
        if (password !== conpassword) {
            return handleError(new HoError('password not equal!!!'));
        }
        let url = '';
        if (data['url']) {
            url = isValidString(data['url'], 'url');
            if (!url) {
                return handleError(new HoError('url not vaild!!!'));
            }
        }
        let email = '';
        if (data['email']) {
            email = isValidString(data['email'], 'email');
            if (!email) {
                return handleError(new HoError('email not vaild!!!'));
            }
        }
        const crypted_password = encrypt(password);
        const important = data['important'] ? 1 : 0;
        if (important !== 0) {
            let userPW = '';
            if (data['userPW']) {
                userPW = isValidString(data['userPW'], 'passwd');
                if (!userPW) {
                    return handleError(new HoError('passwd not vaild!!!'));
                }
            }
            if (!await userPWCheck(user, userPW)) {
                return handleError(new HoError('permission denied'))
            }
        }
        let setTag = new Set();
        setTag.add(normalize(name)).add(normalize(username));
        if (email) {
            setTag.add(normalize(email));
        }
        if (url) {
            setTag.add(normalize(url));
        }
        let setArr = [];
        setTag.forEach(s => {
            if (!isDefaultTag(s)) {
                setArr.push(s);
            }
        });
        return Mongo('insert', PASSWORDDB, {
            _id: objectID(),
            name,
            username,
            password: crypted_password,
            prePassword: crypted_password,
            owner: user._id,
            utime: Math.round(new Date().getTime() / 1000),
            url,
            email,
            tags: setArr,
            important,
        }).then(item => {
            log.debug({ id: item[0]._id }, 'password row saved');
            return {id: item[0]._id};
        });
    },
    editRow: function(uid, data, user, session) {
        let password = '';
        if (data['password']) {
            password = isValidString(data['password'], 'altpwd');
            if (!password) {
                return handleError(new HoError('password not vaild!!!'));
            }
        }
        let conpassword = '';
        if (data['password']) {
            conpassword = isValidString(data['conpassword'], 'altpwd');
            if (!conpassword) {
                return handleError(new HoError('password not vaild!!!'));
            }
        }
        if (password !== conpassword) {
            return handleError(new HoError('password not equal!!!'));
        }
        let name = '';
        if (data['name']) {
            name = isValidString(data['name'], 'name');
            if (!name) {
                return handleError(new HoError('name not vaild!!!'));
            }
        }
        let username = '';
        if (data['username']) {
            username = isValidString(data['username'], 'name');
            if (!username) {
                return handleError(new HoError('username not vaild!!!'));
            }
        }
        let url = '';
        if (data['url']) {
            url = isValidString(data['url'], 'url');
            if (!url) {
                return handleError(new HoError('url not vaild!!!'));
            }
        }
        let email = '';
        if (data['email']) {
            email = isValidString(data['email'], 'email');
            if (!email) {
                return handleError(new HoError('email not vaild!!!'));
            }
        }
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, {limit: 1}).then(async pws => {
            if (pws.length < 1) {
                return handleError(new HoError('password row does not exist!!!'));
            }
            let update_data = Object.assign(data.hasOwnProperty('important') ? {important: data['important'] ? 1: 0} :{});
            if (pws[0].important !== 0 || (data.hasOwnProperty('important') && pws[0].important !== update_data['important'])) {
                let userPW = '';
                if (data['userPW']) {
                    userPW = isValidString(data['userPW'], 'passwd');
                    if (!userPW) {
                        return handleError(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!await userPWCheck(user, userPW)) {
                    return handleError(new HoError('permission denied'))
                }
            }
            let setTag = new Set(pws[0].tags);
            if (name) {
                setTag.add(normalize(name));
                update_data['name'] = name;
            }
            if (username) {
                setTag.add(normalize(username));
                update_data['username'] = username;
            }
            if (email) {
                setTag.add(normalize(email));
                update_data['email'] = email;
            }
            if (url) {
                setTag.add(normalize(url));
                update_data['url'] = url;
            }
            let setArr = [];
            setTag.forEach(s => {
                if (!isDefaultTag(s)) {
                    setArr.push(s);
                }
            });
            update_data = Object.assign(update_data, {tags: setArr}, password ? {
                password: encrypt(password),
                prePassword: pws[0].password,
                utime: Math.round(new Date().getTime() / 1000),
            } : {});
            log.debug({ id: pws[0]._id, fields: Object.keys(update_data) }, 'password row updated');
            PasswordTagTool.setLatest(pws[0]._id, session).catch(err => handleError(err, 'Set latest'));
            return Mongo('update', PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
            }, {$set: update_data});
        });
    },
    delRow: function(uid, userPW, user) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, {limit: 1}).then(async pws => {
            if (pws.length < 1) {
                return handleError(new HoError('password row does not exist!!!'));
            }
            if (pws[0].important !== 0) {
                let validUserPW = '';
                if (userPW) {
                    validUserPW = isValidString(userPW, 'passwd');
                    if (!validUserPW) {
                        return handleError(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!await userPWCheck(user, validUserPW)) {
                    return handleError(new HoError('permission denied'))
                }
            }
            return Mongo('deleteMany', PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
            });
        });
    },
    getPassword: function(uid, userPW, user, session, type=null) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, {
            projection: Object.assign({
                _id: 0,
                important: 1,
            }, (type === 'pre') ? {prePassword: 1} : {password: 1}),
            limit: 1,
        }).then(async items => {
            if (items.length < 1) {
                return handleError(new HoError('can not find password object!!!'));
            }
            if (items[0].important !== 0) {
                let validUserPW = '';
                if (userPW) {
                    validUserPW = isValidString(userPW, 'passwd');
                    if (!validUserPW) {
                        return handleError(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!await userPWCheck(user, validUserPW)) {
                    return handleError(new HoError('permission denied'))
                }
            }
            PasswordTagTool.setLatest(id, session).catch(err => handleError(err, 'Set latest'));
            return {password: (type === 'pre') ? decrypt(items[0].prePassword) : decrypt(items[0].password)};
        });
    },
    generatePW: function(type) {
        return (type === 3) ? PasswordGenerator(16, false, /[0-9]/) : (type === 2) ? PasswordGenerator(16, false, /[0-9a-zA-Z]/) : PasswordGenerator(16, false, /[0-9a-zA-Z!@#$%]/);
    },
}

const keyBuffer = Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex');

function encrypt(text) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const parts = text.split(':');
    if (parts.length === 3) {
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = Buffer.from(parts[2], 'hex');
        const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
    // Legacy CTR format: iv:ciphertext
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = createDecipheriv(ALGORITHM_LEGACY, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export const updatePasswordCipher = () => Mongo('find', PASSWORDDB, {}).then(items => {
    const malformed = items.filter(item =>
        item.password.split(':').length === 1 || item.prePassword.split(':').length === 1
    );
    if (malformed.length > 0) {
        return handleError(new HoError(`found ${malformed.length} malformed record(s): ${malformed.map(i => i._id).join(', ')}`));
    }
    const toMigrate = items.filter(item =>
        item.password.split(':').length === 2 || item.prePassword.split(':').length === 2
    );
    if (toMigrate.length === 0) {
        log.info({ count: items.length }, 'all password records use GCM format');
        console.log(`0 records migrated (${items.length} already GCM)`);
        return Promise.resolve();
    }
    return toMigrate.reduce((chain, item) => chain.then(() => {
        const update = {};
        if (item.password.split(':').length === 2) {
            update.password = encrypt(decryptLegacyCTR(item.password));
        }
        if (item.prePassword.split(':').length === 2) {
            update.prePassword = encrypt(decryptLegacyCTR(item.prePassword));
        }
        return Mongo('update', PASSWORDDB, { _id: item._id }, { $set: update });
    }), Promise.resolve()).then(() => {
        log.info({ migrated: toMigrate.length, total: items.length }, 'CTR→GCM migration complete');
        console.log(`${toMigrate.length} record(s) migrated to GCM (${items.length} total)`);
    });
});

function decryptLegacyCTR(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = createDecipheriv(ALGORITHM_LEGACY, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
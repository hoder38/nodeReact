import { PASSWORD_PRIVATE_KEY, PASSWORD_SALT } from '../../../ver.js'
import { ALGORITHM, PASSWORDDB } from '../constants.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { isValidString, handleError, HoError, userPWCheck } from '../util/utility.js'
import crypto from 'crypto'
const { createCipheriv, createDecipheriv, randomBytes, createDecipher } = crypto;
import PasswordGenerator from 'password-generator'

const PasswordTagTool = TagTool(PASSWORDDB);

export default {
    newRow: function(data, user) {
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
            if (!userPWCheck(user, userPW)) {
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
            console.log(item);
            console.log('save end');
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
        }, {limit: 1}).then(pws => {
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
                if (!userPWCheck(user, userPW)) {
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
            console.log(update_data);
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
        }, {limit: 1}).then(pws => {
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
                if (!userPWCheck(user, validUserPW)) {
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
        }).then(items => {
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
                if (!userPWCheck(user, validUserPW)) {
                    return handleError(new HoError('permission denied'))
                }
            }
            PasswordTagTool.setLatest(id, session).catch(err => handleError(err, 'Set latest'));
            return {password: (type === 'pre') ? decrypt(items[0].prePassword) : decrypt(items[0].password)};
        });
    },
    generatePW: function(type) {
        return (type === 3) ? PasswordGenerator(12, false, /[0-9]/) : (type === 2) ? PasswordGenerator(12, false, /[0-9a-zA-Z]/) : PasswordGenerator(12, false, /[0-9a-zA-Z!@#$%]/);
    },
}

function encrypt(text) {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = createDecipheriv(ALGORITHM, Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export const updatePasswordCipher = () => Mongo('find', PASSWORDDB, {}).then(items => {
    const recur_cipher = index => {
        if (index >= items.length) {
            return Promise.resolve();
        } else {
            let newPass = null;
            let newPrePass = null;
            if (items[index].password.split(':').length === 1) {
                const decipher = createDecipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
                let dec = decipher.update(items[index].password, 'hex', 'utf8');
                dec += decipher.final('utf8');
                newPass = dec.substr(0, dec.length - 4);
            }
            if (items[index].prePassword.split(':').length === 1) {
                const decipher = createDecipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
                let dec = decipher.update(items[index].prePassword, 'hex', 'utf8');
                dec += decipher.final('utf8');
                newPrePass = dec.substr(0, dec.length - 4);
            }
            if (newPass || newPrePass) {
                newPass = encrypt(newPass);
                newPrePass = encrypt(newPrePass);
                return Mongo('update', PASSWORDDB, {_id: items[index]._id}, {$set: {
                    password: newPass,
                    prePassword: newPrePass,
                }}).then(item => {
                    console.log(item);
                    return recur_cipher(index + 1);
                })
            } else {
                return recur_cipher(index + 1);
            }
        }
    }
    return recur_cipher(0)
});
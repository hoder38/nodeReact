import { PASSWORD_PRIVATE_KEY, PASSWORD_SALT } from '../../../ver'
import { ALGORITHM, PASSWORDDB } from '../constants'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import { isValidString, handleError, handleReject, HoError, userPWCheck } from '../util/utility'
import { createCipher, createDecipher } from 'crypto'
import PasswordGenerator from 'password-generator'

const PasswordTagTool = TagTool(PASSWORDDB);

export default {
    newRow: function(data, user) {
        if (!data['username'] || !data['password'] || !data['conpassword'] || !data['name']) {
            return handleReject(new HoError('parameter lost!!!'));
        }
        const name = isValidString(data['name'], 'name');
        if (!name) {
            return handleReject(new HoError('name is not vaild!!!'));
        }
        const username = isValidString(data['username'], 'name');
        if (!username) {
            return handleReject(new HoError('username is not vaild!!!'));
        }
        const password = isValidString(data['password'], 'altpwd');
        if (!password) {
            return handleReject(new HoError('password is not vaild!!!'));
        }
        const conpassword = isValidString(data['conpassword'], 'altpwd');
        if (!conpassword) {
            return handleReject(new HoError('password is not vaild!!!'));
        }
        if (password !== conpassword) {
            return handleReject(new HoError('password not equal!!!'));
        }
        let url = '';
        if (data['url']) {
            url = isValidString(data['url'], 'url');
            if (!url) {
                return handleReject(new HoError('url not vaild!!!'));
            }
        }
        let email = '';
        if (data['email']) {
            email = isValidString(data['email'], 'email');
            if (!email) {
                return handleReject(new HoError('email not vaild!!!'));
            }
        }
        const crypted_password = encrypt(password);
        const important = data['important'] ? 1 : 0;
        if (important !== 0) {
            let userPW = '';
            if (data['userPW']) {
                userPW = isValidString(data['userPW'], 'passwd');
                if (!userPW) {
                    return handleReject(new HoError('passwd not vaild!!!'));
                }
            }
            if (!userPWCheck(user, userPW)) {
                return handleReject(new HoError('permission denied'))
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
                return handleReject(new HoError('password not vaild!!!'));
            }
        }
        let conpassword = '';
        if (data['password']) {
            conpassword = isValidString(data['conpassword'], 'altpwd');
            if (!conpassword) {
                return handleReject(new HoError('password not vaild!!!'));
            }
        }
        if (password !== conpassword) {
            return handleReject(new HoError('password not equal!!!'));
        }
        let name = '';
        if (data['name']) {
            name = isValidString(data['name'], 'name');
            if (!name) {
                return handleReject(new HoError('name not vaild!!!'));
            }
        }
        let username = '';
        if (data['username']) {
            username = isValidString(data['username'], 'name');
            if (!username) {
                return handleReject(new HoError('username not vaild!!!'));
            }
        }
        let url = '';
        if (data['url']) {
            url = isValidString(data['url'], 'url');
            if (!url) {
                return handleReject(new HoError('url not vaild!!!'));
            }
        }
        let email = '';
        if (data['email']) {
            email = isValidString(data['email'], 'email');
            if (!email) {
                return handleReject(new HoError('email not vaild!!!'));
            }
        }
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, {limit: 1}).then(pws => {
            if (pws.length < 1) {
                return handleReject(new HoError('password row does not exist!!!'));
            }
            let update_data = Object.assign(data.hasOwnProperty('important') ? {important: data['important'] ? 1: 0} :{});
            if (pws[0].important !== 0 || (data.hasOwnProperty('important') && pws[0].important !== update_data['important'])) {
                let userPW = '';
                if (data['userPW']) {
                    userPW = isValidString(data['userPW'], 'passwd');
                    if (!userPW) {
                        return handleReject(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!userPWCheck(user, userPW)) {
                    return handleReject(new HoError('permission denied'))
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
            return handleReject(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, {limit: 1}).then(pws => {
            if (pws.length < 1) {
                return handleReject(new HoError('password row does not exist!!!'));
            }
            if (pws[0].important !== 0) {
                let validUserPW = '';
                if (userPW) {
                    validUserPW = isValidString(userPW, 'passwd');
                    if (!validUserPW) {
                        return handleReject(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!userPWCheck(user, validUserPW)) {
                    return handleReject(new HoError('permission denied'))
                }
            }
            return Mongo('remove', PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
                $isolated: 1,
            });
        });
    },
    getPassword: function(uid, userPW, user, session, type=null) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', PASSWORDDB, {
            _id: id,
            owner: user._id,
        }, Object.assign({
            _id: 0,
            important: 1,
        }, (type === 'pre') ? {prePassword: 1} : {password: 1}), {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleReject(new HoError('can not find password object!!!'));
            }
            if (items[0].important !== 0) {
                let validUserPW = '';
                if (userPW) {
                    validUserPW = isValidString(userPW, 'passwd');
                    if (!validUserPW) {
                        return handleReject(new HoError('passwd not vaild!!!'));
                    }
                }
                if (!userPWCheck(user, validUserPW)) {
                    return handleReject(new HoError('permission denied'))
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
    const cipher = createCipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
    let crypted = cipher.update(`${text}${PASSWORD_SALT}`, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text) {
    const decipher = createDecipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
    let dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec.substr(0, dec.length - 4);
}
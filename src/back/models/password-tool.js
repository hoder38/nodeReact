import { PASSWORD_PRIVATE_KEY } from '../../../ver.js'
import { ALGORITHM, ALGORITHM_LEGACY, PASSWORDDB } from '../constants.js'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool.js'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { isValidString, handleError, HoError, userPWCheck } from '../util/utility.js'
import crypto from 'crypto'
const { createCipheriv, createDecipheriv, randomBytes, createDecipher } = crypto;
import PasswordGenerator from 'password-generator'
import createLogger from '../util/logger.js'

const log = createLogger('password');

const PasswordTagTool = TagTool(PASSWORDDB);

export default {
    /**
     * Create a new password entry.
     * Validates all fields, checks userPW for important entries, auto-generates tags,
     * encrypts password with AES-256-GCM, and inserts into MongoDB.
     * @param {Object} data - { name, username, password, conpassword, url?, email?, important?, userPW? }
     * @param {Object} user - Authenticated user object with _id
     * @returns {Promise<{id: string}>} Created record's _id
     */
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
        log.info({ name, username, important }, 'creating new password entry');
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
            log.info({ id: item[0]._id }, 'password entry created');
            return {id: item[0]._id};
        });
    },

    /**
     * Edit an existing password entry.
     * Validates fields, checks userPW for important entries, updates tags, rotates
     * password (moves current to prePassword) if password field is changed.
     * @param {string} uid - Record _id
     * @param {Object} data - Fields to update
     * @param {Object} user - Authenticated user
     * @param {Object} session - Express session for tag tracking
     * @returns {Promise<void>}
     */
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
        log.debug({ id, hasPassword: !!password }, 'editing password entry');
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
            log.info({ id: pws[0]._id, fields: Object.keys(update_data) }, 'password entry updated');
            PasswordTagTool.setLatest(pws[0]._id, session).catch(err => handleError(err, 'Set latest'));
            return Mongo('update', PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
            }, {$set: update_data});
        });
    },

    /**
     * Delete a password entry. Requires userPW verification for important entries.
     * @param {string} uid - Record _id
     * @param {string} userPW - User password for verification (if important)
     * @param {Object} user - Authenticated user
     * @returns {Promise<void>}
     */
    delRow: function(uid, userPW, user) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        log.debug({ id }, 'deleting password entry');
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
            log.info({ id: pws[0]._id }, 'password entry deleted');
            return Mongo('deleteMany', PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
            });
        });
    },

    /**
     * Decrypt and return a stored password (or prePassword).
     * Requires userPW verification for important entries.
     * @param {string} uid - Record _id
     * @param {string} userPW - User password for verification
     * @param {Object} user - Authenticated user
     * @param {Object} session - Express session for tag tracking
     * @param {string|null} type - 'pre' for prePassword, null for password
     * @returns {Promise<{password: string}>} Decrypted password
     */
    getPassword: function(uid, userPW, user, session, type=null) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        log.debug({ id, type: type || 'current' }, 'retrieving password');
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
            log.debug({ id }, 'password decrypted successfully');
            PasswordTagTool.setLatest(id, session).catch(err => handleError(err, 'Set latest'));
            return {password: (type === 'pre') ? decrypt(items[0].prePassword) : decrypt(items[0].password)};
        });
    },

    /**
     * Generate a random password using PasswordGenerator library.
     * @param {number} type - Character class: 3=digits, 2=alphanumeric, other=alphanumeric+special
     * @returns {string} 16-character random password
     */
    generatePW: function(type) {
        log.debug({ type }, 'generating password');
        return (type === 3) ? PasswordGenerator(16, false, /[0-9]/) : (type === 2) ? PasswordGenerator(16, false, /[0-9a-zA-Z]/) : PasswordGenerator(16, false, /[0-9a-zA-Z!@#$%]/);
    },
}

/**
 * AES-256 key buffer derived from PASSWORD_PRIVATE_KEY.
 * Takes the hex-decoded key bytes, pads/truncates to exactly 32 bytes.
 */
const keyBuffer = Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex');

/**
 * Encrypt plaintext using AES-256-GCM.
 * Produces format: `ivHex(24):authTagHex(32):ciphertextHex`
 * @param {string} text - Plaintext to encrypt
 * @returns {string} Encrypted string in 3-part colon-separated hex format
 */
function encrypt(text) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt ciphertext. Auto-detects format:
 * - 3-part (iv:authTag:ciphertext) → AES-256-GCM decryption
 * - 2-part (iv:ciphertext) → legacy AES-256-CTR decryption
 * @param {string} text - Encrypted string
 * @returns {string} Decrypted plaintext
 * @throws {Error} If auth tag verification fails (GCM) or format invalid
 */
function decrypt(text) {
    const parts = text.split(':');
    if (parts.length === 3) {
        // GCM format: iv(12 bytes) : authTag(16 bytes) : ciphertext
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = Buffer.from(parts[2], 'hex');
        const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString('utf8');
    }
    // Legacy CTR format: iv(16 bytes) : ciphertext
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = createDecipheriv(ALGORITHM_LEGACY, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

/**
 * Decrypt legacy CTR format (v2): `iv:ciphertext`
 * Used by migration to convert v2 records to GCM.
 * @param {string} text - Encrypted string in `ivHex:ciphertextHex` format
 * @returns {string} Decrypted plaintext
 */
function decryptLegacyCTR(text) {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = createDecipheriv(ALGORITHM_LEGACY, keyBuffer, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

/**
 * Decrypt v1 legacy format (oldest): single hex blob with no IV.
 * Uses deprecated crypto.createDecipher with PASSWORD_PRIVATE_KEY as passphrase.
 * Strips last 4 characters (legacy padding) from decrypted output.
 * @param {string} text - Single hex blob (no colon separator)
 * @returns {string} Decrypted plaintext with legacy padding removed
 * @throws {Error} If decryption fails or result too short
 */
function decryptV1Legacy(text) {
    const decipher = createDecipher(ALGORITHM_LEGACY, PASSWORD_PRIVATE_KEY);
    let dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
    if (dec.length <= 4) {
        throw new Error(`v1 decryption produced result too short (${dec.length} chars) to strip padding`);
    }
    return dec.substring(0, dec.length - 4);
}

/**
 * Detect the encryption format version of a stored value.
 * @param {string} value - Encrypted field value
 * @returns {number} 1=v1 (no IV), 2=v2 (CTR with IV), 3=v3 (GCM)
 */
function detectVersion(value) {
    if (!value || typeof value !== 'string') return 0;
    const parts = value.split(':');
    if (parts.length === 3) return 3;
    if (parts.length === 2) return 2;
    if (parts.length === 1 && /^[0-9a-fA-F]+$/.test(value)) return 1;
    return 0; // truly malformed
}

/**
 * Batch migration: converts all password records to GCM (v3) format.
 * Handles three source formats per-field independently:
 * - v1 (1-part hex): decrypt with deprecated createDecipher, strip 4-char padding, re-encrypt GCM
 * - v2 (2-part iv:ciphertext): decrypt CTR, re-encrypt GCM
 * - v3 (3-part iv:authTag:ciphertext): already GCM, skip
 *
 * Continues processing on per-record failure but rejects at end with aggregate error.
 * @returns {Promise<void>} Resolves if all records migrated; rejects with summary if any failed
 */
export const updatePasswordCipher = () => Mongo('find', PASSWORDDB, {}).then(items => {
    log.info({ total: items.length }, 'updatePasswordCipher: scanning all records');

    const failures = [];
    const toMigrate = [];

    for (const item of items) {
        const pwVer = detectVersion(item.password);
        const preVer = detectVersion(item.prePassword);

        // Skip fully migrated records
        if (pwVer === 3 && preVer === 3) continue;

        // Truly malformed (not hex, empty, or unknown format)
        if (pwVer === 0 || preVer === 0) {
            const msg = `record ${item._id}: malformed format (password:v${pwVer}, prePassword:v${preVer})`;
            log.error({ id: item._id, pwVer, preVer }, msg);
            failures.push(msg);
            continue;
        }

        toMigrate.push({ item, pwVer, preVer });
    }

    if (toMigrate.length === 0 && failures.length === 0) {
        log.info({ count: items.length }, 'all records already GCM — nothing to migrate');
        console.log(`0 records migrated (${items.length} already GCM)`);
        return Promise.resolve();
    }

    log.info({ toMigrate: toMigrate.length, failures: failures.length }, 'migration starting');

    let migratedCount = 0;
    let v1Count = 0;
    let v2Count = 0;

    return toMigrate.reduce((chain, { item, pwVer, preVer }) => chain.then(() => {
        try {
            const update = {};

            // Migrate password field
            if (pwVer === 1) {
                const plain = decryptV1Legacy(item.password);
                update.password = encrypt(plain);
                v1Count++;
                log.debug({ id: item._id, field: 'password', from: 'v1' }, 'migrating field');
            } else if (pwVer === 2) {
                const plain = decryptLegacyCTR(item.password);
                update.password = encrypt(plain);
                v2Count++;
                log.debug({ id: item._id, field: 'password', from: 'v2' }, 'migrating field');
            }

            // Migrate prePassword field
            if (preVer === 1) {
                const plain = decryptV1Legacy(item.prePassword);
                update.prePassword = encrypt(plain);
                if (pwVer !== 1) v1Count++;
                log.debug({ id: item._id, field: 'prePassword', from: 'v1' }, 'migrating field');
            } else if (preVer === 2) {
                const plain = decryptLegacyCTR(item.prePassword);
                update.prePassword = encrypt(plain);
                if (pwVer !== 2) v2Count++;
                log.debug({ id: item._id, field: 'prePassword', from: 'v2' }, 'migrating field');
            }

            if (Object.keys(update).length === 0) return Promise.resolve();

            return Mongo('update', PASSWORDDB, { _id: item._id }, { $set: update }).then(() => {
                migratedCount++;
                log.debug({ id: item._id }, 'record migrated');
            });
        } catch (err) {
            const msg = `record ${item._id}: ${err.message}`;
            log.error({ id: item._id, err: err.message }, 'migration failed for record');
            failures.push(msg);
            return Promise.resolve();
        }
    }), Promise.resolve()).then(() => {
        const summary = `${migratedCount} record(s) migrated (v1:${v1Count}, v2:${v2Count}), ${items.length - migratedCount - failures.length} already GCM, ${failures.length} failed`;
        console.log(summary);
        log.info({ migratedCount, v1Count, v2Count, total: items.length, failures: failures.length }, 'migration complete');

        if (failures.length > 0) {
            const errMsg = `migration completed with ${failures.length} failure(s):\n${failures.join('\n')}`;
            log.error({ failures }, errMsg);
            return handleError(new HoError(errMsg));
        }
    });
});
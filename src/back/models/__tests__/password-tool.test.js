/**
 * password-tool.test.js — Comprehensive tests for password-tool.js
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

let mockMongo, mockObjectID, mockIsValidString, mockHandleError, mockHoError, mockUserPWCheck;
let mockTagToolInstance, mockIsDefaultTag, mockNormalize;
let mockPasswordGenerator;

const PASSWORDDB = 'password';
const ALGORITHM = 'aes-256-ctr';
const PASSWORD_PRIVATE_KEY = '0123456789abcdef0123456789abcdef';

// --- node-fetch (prevents test pollution) ---
jest.unstable_mockModule('node-fetch', () => ({
    default: jest.fn(() => Promise.resolve({
        ok: true, buffer: jest.fn().mockResolvedValue(Buffer.from('')),
        headers: { get: jest.fn(() => null) }, body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
    })),
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    PASSWORD_PRIVATE_KEY,
    PASSWORD_SALT: 'test-salt',
}));

jest.unstable_mockModule('../../constants.js', () => ({
    ALGORITHM,
    PASSWORDDB,
}));

mockMongo = jest.fn();
mockObjectID = jest.fn(() => 'mock-oid');
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
    default: mockMongo,
    objectID: mockObjectID,
}));

mockIsValidString = jest.fn((v) => v);
mockHandleError = jest.fn((err) => Promise.reject(err));
mockHoError = class extends Error { constructor(m) { super(m); this.name = 'HoError'; } };
mockUserPWCheck = jest.fn(() => true);
jest.unstable_mockModule('../../util/utility.js', () => ({
    isValidString: mockIsValidString,
    handleError: mockHandleError,
    HoError: mockHoError,
    userPWCheck: mockUserPWCheck,
}));

mockTagToolInstance = { setLatest: jest.fn().mockResolvedValue() };
mockIsDefaultTag = jest.fn(() => false);
mockNormalize = jest.fn((v) => v.toLowerCase());
jest.unstable_mockModule('../../models/tag-tool.js', () => ({
    default: jest.fn(() => mockTagToolInstance),
    isDefaultTag: mockIsDefaultTag,
    normalize: mockNormalize,
}));

mockPasswordGenerator = jest.fn(() => 'generated12pw');
jest.unstable_mockModule('password-generator', () => ({
    default: mockPasswordGenerator,
}));

const mod = await import('../../models/password-tool.js');
const PasswordTool = mod.default;
const { updatePasswordCipher } = mod;

const USER = { _id: 'user1' };
const baseData = () => ({
    name: 'TestSite', username: 'testuser', password: 'pass123!', conpassword: 'pass123!',
});

describe('password-tool.js', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsValidString.mockImplementation((v) => v);
        mockHandleError.mockImplementation((err) => Promise.reject(err));
        mockUserPWCheck.mockReturnValue(true);
        mockIsDefaultTag.mockReturnValue(false);
        mockNormalize.mockImplementation((v) => v.toLowerCase());
        mockMongo.mockResolvedValue([{ _id: 'mock-oid' }]);
        mockTagToolInstance.setLatest.mockResolvedValue();
    });

    // ─── newRow ──────────────────────────────────────────────
    describe('newRow', () => {
        test('creates record with valid data', async () => {
            mockMongo.mockResolvedValue([{ _id: 'new-id' }]);
            const result = await PasswordTool.newRow(baseData(), USER);
            expect(result).toEqual({ id: 'new-id' });
            expect(mockMongo).toHaveBeenCalledWith('insert', PASSWORDDB, expect.objectContaining({
                _id: 'mock-oid', name: 'TestSite', username: 'testuser', owner: 'user1',
            }));
        });

        test('missing required fields → error', async () => {
            await expect(PasswordTool.newRow({ name: 'x' }, USER)).rejects.toThrow('parameter lost');
        });

        test('invalid name → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'name' ? false : v);
            await expect(PasswordTool.newRow(baseData(), USER)).rejects.toThrow('name is not vaild');
        });

        test('invalid username → error', async () => {
            let calls = 0;
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'name') { calls++; return calls === 1 ? v : false; }
                return v;
            });
            await expect(PasswordTool.newRow(baseData(), USER)).rejects.toThrow('username is not vaild');
        });

        test('invalid password → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'altpwd' ? false : v);
            await expect(PasswordTool.newRow(baseData(), USER)).rejects.toThrow('password is not vaild');
        });

        test('invalid conpassword → error', async () => {
            let pwCalls = 0;
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'altpwd') { pwCalls++; return pwCalls === 1 ? v : false; }
                return v;
            });
            await expect(PasswordTool.newRow(baseData(), USER)).rejects.toThrow('password is not vaild');
        });

        test('password mismatch → error', async () => {
            await expect(PasswordTool.newRow({ ...baseData(), conpassword: 'different' }, USER)).rejects.toThrow('password not equal');
        });

        test('with valid url', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow({ ...baseData(), url: 'https://test.com' }, USER);
            expect(mockMongo).toHaveBeenCalledWith('insert', PASSWORDDB, expect.objectContaining({ url: 'https://test.com' }));
        });

        test('with invalid url → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'url' ? false : v);
            await expect(PasswordTool.newRow({ ...baseData(), url: 'bad' }, USER)).rejects.toThrow('url not vaild');
        });

        test('with valid email', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow({ ...baseData(), email: 'a@b.com' }, USER);
            expect(mockMongo).toHaveBeenCalledWith('insert', PASSWORDDB, expect.objectContaining({ email: 'a@b.com' }));
        });

        test('with invalid email → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'email' ? false : v);
            await expect(PasswordTool.newRow({ ...baseData(), email: 'bad' }, USER)).rejects.toThrow('email not vaild');
        });

        test('important=1 with valid userPW → success', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow({ ...baseData(), important: true, userPW: 'secret' }, USER);
            expect(mockMongo).toHaveBeenCalledWith('insert', PASSWORDDB, expect.objectContaining({ important: 1 }));
        });

        test('important=1 invalid userPW → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'passwd' ? false : v);
            await expect(PasswordTool.newRow({ ...baseData(), important: true, userPW: 'bad' }, USER)).rejects.toThrow('passwd not vaild');
        });

        test('important=1 userPWCheck fails → permission denied', async () => {
            mockUserPWCheck.mockReturnValue(false);
            await expect(PasswordTool.newRow({ ...baseData(), important: true }, USER)).rejects.toThrow('permission denied');
        });

        test('important=0 → skips userPW check', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow({ ...baseData(), important: false }, USER);
            expect(mockUserPWCheck).not.toHaveBeenCalled();
        });

        test('tags filter out default tags', async () => {
            mockIsDefaultTag.mockImplementation((t) => t === 'testsite');
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            expect(mockMongo).toHaveBeenCalledWith('insert', PASSWORDDB, expect.objectContaining({
                tags: expect.not.arrayContaining(['testsite']),
            }));
        });

        test('password field is encrypted', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const insertCall = mockMongo.mock.calls[0][2];
            expect(insertCall.password).toContain(':');
            expect(insertCall.password).not.toBe('pass123!');
            expect(insertCall.prePassword).toBe(insertCall.password);
        });
    });

    // ─── editRow ─────────────────────────────────────────────
    describe('editRow', () => {
        const existingRow = {
            _id: 'row1', name: 'Old', username: 'old', password: 'enc:pass',
            tags: ['old'], important: 0, owner: 'user1',
        };

        beforeEach(() => {
            mockMongo.mockResolvedValue([existingRow]);
        });

        test('updates name/username/url/email', async () => {
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', { name: 'New', username: 'newu', url: 'https://u', email: 'e@m' }, USER, 'sess');
            const updateCall = mockMongo.mock.calls[1];
            expect(updateCall[3].$set).toEqual(expect.objectContaining({
                name: 'New', username: 'newu', url: 'https://u', email: 'e@m',
            }));
        });

        test('updates password → encrypts and preserves prePassword', async () => {
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', { password: 'new123', conpassword: 'new123' }, USER, 'sess');
            const updateCall = mockMongo.mock.calls[1];
            expect(updateCall[3].$set.password).toContain(':');
            expect(updateCall[3].$set.prePassword).toBe('enc:pass');
        });

        test('invalid password → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'altpwd' ? false : v);
            await expect(PasswordTool.editRow('row1', { password: 'x', conpassword: 'x' }, USER, 's')).rejects.toThrow('password not vaild');
        });

        test('invalid conpassword → error', async () => {
            let pwCalls = 0;
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'altpwd') { pwCalls++; return pwCalls === 1 ? v : false; }
                return v;
            });
            await expect(PasswordTool.editRow('row1', { password: 'x', conpassword: 'x' }, USER, 's')).rejects.toThrow('password not vaild');
        });

        test('password !== conpassword → error', async () => {
            await expect(PasswordTool.editRow('row1', { password: 'a', conpassword: 'b' }, USER, 's')).rejects.toThrow('password not equal');
        });

        test('invalid name → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'name' ? false : v);
            await expect(PasswordTool.editRow('row1', { name: 'x' }, USER, 's')).rejects.toThrow('name not vaild');
        });

        test('invalid username → error', async () => {
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'name') return false;
                return v;
            });
            await expect(PasswordTool.editRow('row1', { username: 'x' }, USER, 's')).rejects.toThrow('username not vaild');
        });

        test('invalid url → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'url' ? false : v);
            await expect(PasswordTool.editRow('row1', { url: 'x' }, USER, 's')).rejects.toThrow('url not vaild');
        });

        test('invalid email → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'email' ? false : v);
            await expect(PasswordTool.editRow('row1', { email: 'x' }, USER, 's')).rejects.toThrow('email not vaild');
        });

        test('invalid uid → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'uid' ? false : v);
            await expect(PasswordTool.editRow('bad', {}, USER, 's')).rejects.toThrow('uid not vaild');
        });

        test('row not found → error', async () => {
            mockMongo.mockResolvedValue([]);
            await expect(PasswordTool.editRow('row1', {}, USER, 's')).rejects.toThrow('password row does not exist');
        });

        test('existing important row → requires userPW', async () => {
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', {}, USER, 's');
            expect(mockUserPWCheck).toHaveBeenCalled();
        });

        test('existing important row + invalid userPW → error', async () => {
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'uid') return v;
                if (t === 'passwd') return false;
                return v;
            });
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]);
            await expect(PasswordTool.editRow('row1', { userPW: 'bad' }, USER, 's')).rejects.toThrow('passwd not vaild');
        });

        test('existing important row + userPWCheck fails → permission denied', async () => {
            mockUserPWCheck.mockReturnValue(false);
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]);
            await expect(PasswordTool.editRow('row1', {}, USER, 's')).rejects.toThrow('permission denied');
        });

        test('changing important 0→1 → requires userPW', async () => {
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 0 }]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', { important: true }, USER, 's');
            expect(mockUserPWCheck).toHaveBeenCalled();
        });

        test('non-important with no change → skips userPW', async () => {
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 0 }]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', { name: 'New' }, USER, 's');
            expect(mockUserPWCheck).not.toHaveBeenCalled();
        });

        test('tags filtered through isDefaultTag', async () => {
            mockIsDefaultTag.mockImplementation((t) => t === 'old');
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', {}, USER, 's');
            const updateCall = mockMongo.mock.calls[1];
            expect(updateCall[3].$set.tags).not.toContain('old');
        });

        test('setLatest called with session', async () => {
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', {}, USER, 'my-session');
            expect(mockTagToolInstance.setLatest).toHaveBeenCalledWith('row1', 'my-session');
        });

        test('no password change → no prePassword update', async () => {
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ ok: 1 });
            await PasswordTool.editRow('row1', { name: 'New' }, USER, 's');
            const updateCall = mockMongo.mock.calls[1];
            expect(updateCall[3].$set).not.toHaveProperty('prePassword');
        });
    });

    // ─── delRow ──────────────────────────────────────────────
    describe('delRow', () => {
        const existingRow = { _id: 'row1', important: 0, owner: 'user1' };

        test('deletes non-important row', async () => {
            mockMongo.mockResolvedValueOnce([existingRow]).mockResolvedValue({ deletedCount: 1 });
            await PasswordTool.delRow('row1', '', USER);
            expect(mockMongo).toHaveBeenCalledWith('deleteMany', PASSWORDDB, expect.objectContaining({ _id: 'row1' }));
        });

        test('invalid uid → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'uid' ? false : v);
            await expect(PasswordTool.delRow('bad', '', USER)).rejects.toThrow('uid not vaild');
        });

        test('row not found → error', async () => {
            mockMongo.mockResolvedValue([]);
            await expect(PasswordTool.delRow('row1', '', USER)).rejects.toThrow('password row does not exist');
        });

        test('important row + valid userPW → deletes', async () => {
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]).mockResolvedValue({ deletedCount: 1 });
            await PasswordTool.delRow('row1', 'secret', USER);
            expect(mockMongo).toHaveBeenCalledWith('deleteMany', PASSWORDDB, expect.any(Object));
        });

        test('important row + invalid userPW → error', async () => {
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'uid') return v;
                if (t === 'passwd') return false;
                return v;
            });
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]);
            await expect(PasswordTool.delRow('row1', 'bad', USER)).rejects.toThrow('passwd not vaild');
        });

        test('important row + userPWCheck fails → permission denied', async () => {
            mockUserPWCheck.mockReturnValue(false);
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]);
            await expect(PasswordTool.delRow('row1', '', USER)).rejects.toThrow('permission denied');
        });

        test('important row + null userPW → userPWCheck with empty string', async () => {
            mockUserPWCheck.mockReturnValue(false);
            mockMongo.mockResolvedValueOnce([{ ...existingRow, important: 1 }]);
            await expect(PasswordTool.delRow('row1', null, USER)).rejects.toThrow('permission denied');
            expect(mockUserPWCheck).toHaveBeenCalledWith(USER, '');
        });
    });

    // ─── getPassword ─────────────────────────────────────────
    describe('getPassword', () => {
        test('returns decrypted password', async () => {
            // First encrypt to get valid ciphertext
            const insertData = baseData();
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(insertData, USER);
            const encryptedPW = mockMongo.mock.calls[0][2].password;

            mockMongo.mockResolvedValue([{ important: 0, password: encryptedPW }]);
            const result = await PasswordTool.getPassword('row1', '', USER, 'sess');
            expect(result.password).toBe('pass123!');
        });

        test('type=pre → returns decrypted prePassword', async () => {
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const encryptedPW = mockMongo.mock.calls[0][2].prePassword;

            mockMongo.mockResolvedValue([{ important: 0, prePassword: encryptedPW }]);
            const result = await PasswordTool.getPassword('row1', '', USER, 'sess', 'pre');
            expect(result.password).toBe('pass123!');
        });

        test('type=pre → Mongo projection uses prePassword', async () => {
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const enc = mockMongo.mock.calls[0][2].password;

            mockMongo.mockResolvedValue([{ important: 0, prePassword: enc }]);
            await PasswordTool.getPassword('row1', '', USER, 'sess', 'pre');
            const findCall = mockMongo.mock.calls[1];
            expect(findCall[3].projection).toEqual(expect.objectContaining({ prePassword: 1 }));
            expect(findCall[3].projection).not.toHaveProperty('password');
        });

        test('type=null → Mongo projection uses password', async () => {
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const enc = mockMongo.mock.calls[0][2].password;

            mockMongo.mockResolvedValue([{ important: 0, password: enc }]);
            await PasswordTool.getPassword('row1', '', USER, 'sess');
            const findCall = mockMongo.mock.calls[1];
            expect(findCall[3].projection).toEqual(expect.objectContaining({ password: 1 }));
            expect(findCall[3].projection).not.toHaveProperty('prePassword');
        });

        test('invalid uid → error', async () => {
            mockIsValidString.mockImplementation((v, t) => t === 'uid' ? false : v);
            await expect(PasswordTool.getPassword('bad', '', USER, 's')).rejects.toThrow('uid not vaild');
        });

        test('row not found → error', async () => {
            mockMongo.mockResolvedValue([]);
            await expect(PasswordTool.getPassword('row1', '', USER, 's')).rejects.toThrow('can not find password object');
        });

        test('important row + valid userPW → returns password', async () => {
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const enc = mockMongo.mock.calls[0][2].password;

            mockMongo.mockResolvedValue([{ important: 1, password: enc }]);
            const result = await PasswordTool.getPassword('row1', 'secret', USER, 's');
            expect(result.password).toBe('pass123!');
        });

        test('important row + invalid userPW → error', async () => {
            mockIsValidString.mockImplementation((v, t) => {
                if (t === 'uid') return v;
                if (t === 'passwd') return false;
                return v;
            });
            mockMongo.mockResolvedValue([{ important: 1, password: 'x:y' }]);
            await expect(PasswordTool.getPassword('row1', 'bad', USER, 's')).rejects.toThrow('passwd not vaild');
        });

        test('important row + userPWCheck fails → permission denied', async () => {
            mockUserPWCheck.mockReturnValue(false);
            mockMongo.mockResolvedValue([{ important: 1, password: 'x:y' }]);
            await expect(PasswordTool.getPassword('row1', '', USER, 's')).rejects.toThrow('permission denied');
        });

        test('setLatest called with id and session', async () => {
            mockMongo.mockResolvedValueOnce([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const enc = mockMongo.mock.calls[0][2].password;

            mockMongo.mockResolvedValue([{ important: 0, password: enc }]);
            await PasswordTool.getPassword('row1', '', USER, 'my-sess');
            expect(mockTagToolInstance.setLatest).toHaveBeenCalledWith('row1', 'my-sess');
        });
    });

    // ─── generatePW ──────────────────────────────────────────
    describe('generatePW', () => {
        test('type=3 → digits only', () => {
            PasswordTool.generatePW(3);
            expect(mockPasswordGenerator).toHaveBeenCalledWith(12, false, /[0-9]/);
        });

        test('type=2 → alphanumeric', () => {
            PasswordTool.generatePW(2);
            expect(mockPasswordGenerator).toHaveBeenCalledWith(12, false, /[0-9a-zA-Z]/);
        });

        test('type=1 → alphanumeric + special', () => {
            PasswordTool.generatePW(1);
            expect(mockPasswordGenerator).toHaveBeenCalledWith(12, false, /[0-9a-zA-Z!@#$%]/);
        });

        test('type=undefined → default (alphanumeric + special)', () => {
            PasswordTool.generatePW();
            expect(mockPasswordGenerator).toHaveBeenCalledWith(12, false, /[0-9a-zA-Z!@#$%]/);
        });
    });

    // ─── encrypt/decrypt (tested through newRow + getPassword) ───
    describe('encrypt/decrypt round-trip', () => {
        test('encrypts and decrypts correctly', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const encrypted = mockMongo.mock.calls[0][2].password;

            // Verify format: hex_iv:hex_ciphertext
            expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

            mockMongo.mockResolvedValue([{ important: 0, password: encrypted }]);
            const result = await PasswordTool.getPassword('id', '', USER, 's');
            expect(result.password).toBe('pass123!');
        });

        test('different calls produce different IVs', async () => {
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            await PasswordTool.newRow(baseData(), USER);
            const enc1 = mockMongo.mock.calls[0][2].password;

            jest.clearAllMocks();
            mockMongo.mockResolvedValue([{ _id: 'id' }]);
            mockIsValidString.mockImplementation(v => v);
            mockHandleError.mockImplementation(e => Promise.reject(e));
            mockIsDefaultTag.mockReturnValue(false);
            mockNormalize.mockImplementation(v => v.toLowerCase());
            await PasswordTool.newRow(baseData(), USER);
            const enc2 = mockMongo.mock.calls[0][2].password;

            // Same plaintext but different IVs → different ciphertexts
            expect(enc1.split(':')[0]).not.toBe(enc2.split(':')[0]);
        });
    });

    // ─── updatePasswordCipher ────────────────────────────────
    describe('updatePasswordCipher', () => {
        test('no items → resolves', async () => {
            mockMongo.mockResolvedValue([]);
            await updatePasswordCipher();
            expect(mockMongo).toHaveBeenCalledWith('find', PASSWORDDB, {});
        });

        test('already migrated items → skips update', async () => {
            mockMongo.mockResolvedValue([
                { _id: 'r1', password: 'aa:bb', prePassword: 'cc:dd' },
            ]);
            await updatePasswordCipher();
            // Only the find call, no update
            expect(mockMongo).toHaveBeenCalledTimes(1);
        });

        test('legacy password field → re-encrypts and updates', async () => {
            const cryptoMod = await import('crypto'); const createCipher = cryptoMod.default.createCipher;
            const cipher = createCipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
            let enc = cipher.update('mypass' + 'salt', 'utf8', 'hex');
            enc += cipher.final('hex');
            const cipherPre = createCipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
            let encPre = cipherPre.update('oldpass' + 'salt', 'utf8', 'hex');
            encPre += cipherPre.final('hex');

            mockMongo.mockResolvedValueOnce([
                { _id: 'r1', password: enc, prePassword: encPre },
            ]).mockResolvedValue({ ok: 1 });

            await updatePasswordCipher();
            expect(mockMongo).toHaveBeenCalledWith('update', PASSWORDDB, { _id: 'r1' }, expect.objectContaining({
                $set: expect.objectContaining({
                    password: expect.stringContaining(':'),
                    prePassword: expect.stringContaining(':'),
                }),
            }));
        });

        test('only password legacy, prePassword already migrated → re-encrypts password only', async () => {
            const cryptoMod = await import('crypto'); const createCipher = cryptoMod.default.createCipher;
            const cipher = createCipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
            let enc = cipher.update('mypass' + 'salt', 'utf8', 'hex');
            enc += cipher.final('hex');

            mockMongo.mockResolvedValueOnce([
                { _id: 'r1', password: enc, prePassword: 'aa:bb' },
            ]).mockResolvedValue({ ok: 1 });

            await updatePasswordCipher();
            const updateCall = mockMongo.mock.calls[1];
            expect(updateCall[3].$set.password).toContain(':');
            expect(updateCall[3].$set.prePassword).toBe('aa:bb');
        });

        test('multiple items → processes recursively', async () => {
            mockMongo.mockResolvedValue([
                { _id: 'r1', password: 'aa:bb', prePassword: 'cc:dd' },
                { _id: 'r2', password: 'ee:ff', prePassword: 'gg:hh' },
            ]);
            await updatePasswordCipher();
            // Only find call — both already migrated
            expect(mockMongo).toHaveBeenCalledTimes(1);
        });

        test('mixed: first legacy + second migrated → updates first only', async () => {
            const cryptoMod = await import('crypto'); const createCipher = cryptoMod.default.createCipher;
            const cipher = createCipher(ALGORITHM, PASSWORD_PRIVATE_KEY);
            let enc = cipher.update('test' + 'salt', 'utf8', 'hex');
            enc += cipher.final('hex');

            mockMongo.mockResolvedValueOnce([
                { _id: 'r1', password: enc, prePassword: enc },
                { _id: 'r2', password: 'aa:bb', prePassword: 'cc:dd' },
            ]).mockResolvedValue({ ok: 1 });

            await updatePasswordCipher();
            expect(mockMongo).toHaveBeenCalledWith('update', PASSWORDDB, { _id: 'r1' }, expect.any(Object));
        });
    });
});

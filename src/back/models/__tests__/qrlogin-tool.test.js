/**
 * qrlogin-tool.test.js — tests for src/back/models/qrlogin-tool.js
 *
 * Covers: token creation, lookup, approval, rejection and redemption,
 * including wrong-secret lockout, expiry and the two-server consume count.
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test',
  PASSWORD_SALT: 'test_salt_',
  SESS_PWD: 'test-pwd',
  SESS_SECRET: 'test-secret',
  DB_USERNAME: 'test-user',
  DB_PWD: 'test-pwd',
  ROOT_USER: 'root',
  DEFAULT_PASS: 'test-pass',
  PASSWORD_PRIVATE_KEY: 'test-key',
}));

jest.unstable_mockModule('../../config.js', () => ({
  SESS_IP: jest.fn(() => '127.0.0.1'),
  SESS_PORT: jest.fn(() => 6379),
  DB_IP: jest.fn(() => '127.0.0.1'),
  DB_PORT: jest.fn(() => 27017),
  DB_NAME: jest.fn(() => 'test'),
  NAS_PREFIX: jest.fn(() => '/test/storage'),
}));

jest.unstable_mockModule('mongodb', () => ({
  default: {
    MongoClient: { connect: jest.fn(() => Promise.resolve({ db: jest.fn() })) },
    ObjectID: jest.fn(id => id),
  },
}));

const mockRedis = jest.fn();
jest.unstable_mockModule('../redis-tool.js', () => ({ default: mockRedis }));

let store;
let QrLogin;

// Minimal in-memory stand-in for the redis commands the tool uses.
const redisImpl = (fn, ...args) => {
  switch (fn) {
    case 'multi': {
      args[0].forEach(cmd => redisImpl(...cmd));
      return Promise.resolve([]);
    }
    case 'set':
      store.set(args[0], { value: args[1], ttl: store.has(args[0]) ? store.get(args[0]).ttl : -1 });
      return Promise.resolve('OK');
    case 'expire':
      if (store.has(args[0])) store.get(args[0]).ttl = args[1];
      return Promise.resolve(1);
    case 'get':
      return Promise.resolve(store.has(args[0]) ? store.get(args[0]).value : null);
    case 'ttl':
      return Promise.resolve(store.has(args[0]) ? store.get(args[0]).ttl : -2);
    case 'del':
      store.delete(args[0]);
      return Promise.resolve(1);
    default:
      return Promise.resolve(null);
  }
};

beforeAll(async () => {
  QrLogin = await import('../qrlogin-tool.js');
});

beforeEach(() => {
  store = new Map();
  mockRedis.mockReset();
  mockRedis.mockImplementation(redisImpl);
});

describe('isValidSerial', () => {
  test('accepts a 64 char hex serial', () => {
    expect(QrLogin.isValidSerial('a'.repeat(64))).toBe('a'.repeat(64));
  });

  test('rejects wrong length, non-hex and non-string', () => {
    expect(QrLogin.isValidSerial('a'.repeat(63))).toBe(false);
    expect(QrLogin.isValidSerial('z'.repeat(64))).toBe(false);
    expect(QrLogin.isValidSerial(null)).toBe(false);
    expect(QrLogin.isValidSerial(12345)).toBe(false);
  });
});

describe('createToken', () => {
  test('stores a pending record with the hashed secret only', async () => {
    const token = await QrLogin.createToken();
    expect(QrLogin.isValidSerial(token.serial)).toBe(token.serial);
    expect(token.secret).toHaveLength(64);
    expect(token.expire).toBe(QrLogin.PENDING_TTL);
    const record = JSON.parse(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).value);
    expect(record.status).toBe('pending');
    expect(record.used).toBe(0);
    expect(record.hash).toBe(QrLogin.hashSecret(token.secret));
    expect(record.hash).not.toBe(token.secret);
    expect(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).ttl).toBe(QrLogin.PENDING_TTL);
  });

  test('serial and secret differ on every call', async () => {
    const a = await QrLogin.createToken();
    const b = await QrLogin.createToken();
    expect(a.serial).not.toBe(b.serial);
    expect(a.secret).not.toBe(b.secret);
  });
});

describe('getToken', () => {
  test('returns null for an unknown serial', async () => {
    await expect(QrLogin.getToken('b'.repeat(64))).resolves.toBeNull();
  });

  test('returns null for corrupted json', async () => {
    const serial = 'c'.repeat(64);
    store.set(`${QrLogin.QR_PREFIX}${serial}`, { value: 'not-json', ttl: 60 });
    await expect(QrLogin.getToken(serial)).resolves.toBeNull();
  });

  test('rejects an invalid serial', async () => {
    await expect(QrLogin.getToken('nope')).rejects.toMatchObject({ name: 'HoError' });
  });
});

describe('approveToken', () => {
  test('marks a pending token approved and shortens the ttl', async () => {
    const token = await QrLogin.createToken();
    const record = await QrLogin.approveToken(token.serial, 'user-id-1');
    expect(record.status).toBe('approved');
    expect(record.uid).toBe('user-id-1');
    expect(record.serial).toBe(token.serial);
    expect(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).ttl).toBe(QrLogin.APPROVED_TTL);
  });

  test('rejects an expired token with 404', async () => {
    await expect(QrLogin.approveToken('d'.repeat(64), 'u')).rejects.toMatchObject({ name: 'HoError', code: 404 });
  });

  test('rejects double approval', async () => {
    const token = await QrLogin.createToken();
    await QrLogin.approveToken(token.serial, 'u');
    await expect(QrLogin.approveToken(token.serial, 'u')).rejects.toMatchObject({ name: 'HoError' });
  });

  test('rejects an invalid serial', async () => {
    await expect(QrLogin.approveToken('bad', 'u')).rejects.toMatchObject({ name: 'HoError' });
  });
});

describe('rejectToken', () => {
  test('deletes the record', async () => {
    const token = await QrLogin.createToken();
    await expect(QrLogin.rejectToken(token.serial)).resolves.toBe(true);
    expect(store.has(`${QrLogin.QR_PREFIX}${token.serial}`)).toBe(false);
  });

  test('rejects an invalid serial', async () => {
    await expect(QrLogin.rejectToken('bad')).rejects.toMatchObject({ name: 'HoError' });
  });
});

describe('consumeToken', () => {
  test('returns the uid and keeps the record until both servers redeemed it', async () => {
    const token = await QrLogin.createToken();
    await QrLogin.approveToken(token.serial, 'user-id-2');

    const first = await QrLogin.consumeToken(token.serial, token.secret);
    expect(first.uid).toBe('user-id-2');
    expect(first.used).toBe(1);
    expect(store.has(`${QrLogin.QR_PREFIX}${token.serial}`)).toBe(true);
    expect(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).ttl).toBe(QrLogin.APPROVED_TTL);

    const second = await QrLogin.consumeToken(token.serial, token.secret);
    expect(second.used).toBe(QrLogin.CONSUME_TOTAL);
    expect(store.has(`${QrLogin.QR_PREFIX}${token.serial}`)).toBe(false);

    await expect(QrLogin.consumeToken(token.serial, token.secret)).rejects.toMatchObject({ code: 401 });
  });

  test('refuses a token that was never approved', async () => {
    const token = await QrLogin.createToken();
    await expect(QrLogin.consumeToken(token.serial, token.secret)).rejects.toMatchObject({ name: 'HoError', code: 401 });
  });

  test('refuses a wrong secret and drops the token after MAX_ATTEMPT tries', async () => {
    const token = await QrLogin.createToken();
    await QrLogin.approveToken(token.serial, 'u');
    const wrong = 'f'.repeat(64);

    for (let i = 1; i < QrLogin.MAX_ATTEMPT; i++) {
      await expect(QrLogin.consumeToken(token.serial, wrong)).rejects.toMatchObject({ code: 401 });
      const record = JSON.parse(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).value);
      expect(record.attempt).toBe(i);
      expect(store.get(`${QrLogin.QR_PREFIX}${token.serial}`).ttl).toBe(QrLogin.APPROVED_TTL);
    }

    await expect(QrLogin.consumeToken(token.serial, wrong)).rejects.toMatchObject({ code: 401 });
    expect(store.has(`${QrLogin.QR_PREFIX}${token.serial}`)).toBe(false);
    await expect(QrLogin.consumeToken(token.serial, token.secret)).rejects.toMatchObject({ code: 401 });
  });

  test('refuses a non string secret', async () => {
    const token = await QrLogin.createToken();
    await QrLogin.approveToken(token.serial, 'u');
    await expect(QrLogin.consumeToken(token.serial, undefined)).rejects.toMatchObject({ code: 401 });
  });

  test('refuses an invalid serial with 401', async () => {
    await expect(QrLogin.consumeToken('bad', 'secret')).rejects.toMatchObject({ name: 'HoError', code: 401 });
  });
});

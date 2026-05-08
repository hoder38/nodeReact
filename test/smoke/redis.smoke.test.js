/**
 * redis.smoke.test.js — Real Redis Smoke Tests
 * (§3 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Connects directly to the redis container and verifies
 * set/get/expire/del operations plus multi/exec transactions.
 *
 * Run inside the dev container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest --config jest.smoke.cjs \
 *     test/smoke/redis.smoke.test.js --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import Redis from 'redis';

const SESS_PWD = process.env.SESS_PWD;
const REDIS_HOST = 'redis';
const REDIS_PORT = 6379;
const KEY_PREFIX = '_smoke_test:';

let client;

function redisCmd(cmd, ...args) {
    return new Promise((resolve, reject) =>
        client[cmd](...args, (err, data) => err ? reject(err) : resolve(data))
    );
}

function redisMulti(commands) {
    let multi = client.multi();
    commands.forEach(([cmd, ...args]) => {
        multi = multi[cmd](...args);
    });
    return new Promise((resolve, reject) =>
        multi.exec((err, data) => err ? reject(err) : resolve(data))
    );
}

beforeAll(done => {
    client = Redis.createClient(REDIS_PORT, REDIS_HOST, { auth_pass: SESS_PWD });
    client.on('error', err => done.fail(err));
    client.on('ready', () => done());
});

afterAll(async () => {
    // Clean up smoke keys
    const keys = await redisCmd('keys', `${KEY_PREFIX}*`);
    if (keys.length > 0) {
        await Promise.all(keys.map(k => redisCmd('del', k)));
    }
    if (client) client.quit();
});

describe('Redis Smoke Tests', () => {
    test('PING returns PONG', async () => {
        const result = await redisCmd('ping');
        expect(result).toBe('PONG');
    });

    test('SET and GET a string key', async () => {
        const key = `${KEY_PREFIX}str`;
        await redisCmd('set', key, 'hello-smoke');
        const value = await redisCmd('get', key);
        expect(value).toBe('hello-smoke');
    });

    test('DEL removes a key', async () => {
        const key = `${KEY_PREFIX}del`;
        await redisCmd('set', key, 'to-delete');
        await redisCmd('del', key);
        const value = await redisCmd('get', key);
        expect(value).toBeNull();
    });

    test('EXPIRE / TTL work', async () => {
        const key = `${KEY_PREFIX}ttl`;
        await redisCmd('set', key, 'expiring');
        await redisCmd('expire', key, 60);
        const ttl = await redisCmd('ttl', key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(60);
    });

    test('INCR / DECR atomic counters', async () => {
        const key = `${KEY_PREFIX}counter`;
        await redisCmd('set', key, '0');
        await redisCmd('incr', key);
        await redisCmd('incr', key);
        await redisCmd('incr', key);
        let val = await redisCmd('get', key);
        expect(val).toBe('3');

        await redisCmd('decr', key);
        val = await redisCmd('get', key);
        expect(val).toBe('2');
    });

    test('MULTI/EXEC transaction', async () => {
        const k1 = `${KEY_PREFIX}multi1`;
        const k2 = `${KEY_PREFIX}multi2`;

        const results = await redisMulti([
            ['set', k1, 'val1'],
            ['set', k2, 'val2'],
            ['get', k1],
            ['get', k2],
        ]);

        expect(results[0]).toBe('OK');
        expect(results[1]).toBe('OK');
        expect(results[2]).toBe('val1');
        expect(results[3]).toBe('val2');
    });

    test('HSET / HGET / HGETALL hash operations', async () => {
        const key = `${KEY_PREFIX}hash`;
        await redisCmd('hset', key, 'field1', 'value1');
        await redisCmd('hset', key, 'field2', 'value2');

        const f1 = await redisCmd('hget', key, 'field1');
        expect(f1).toBe('value1');

        const all = await redisCmd('hgetall', key);
        expect(all).toEqual({ field1: 'value1', field2: 'value2' });
    });

    test('LPUSH / LRANGE list operations', async () => {
        const key = `${KEY_PREFIX}list`;
        await redisCmd('lpush', key, 'c');
        await redisCmd('lpush', key, 'b');
        await redisCmd('lpush', key, 'a');

        const list = await redisCmd('lrange', key, 0, -1);
        expect(list).toEqual(['a', 'b', 'c']);
    });

    test('Session-like set/get/destroy round-trip', async () => {
        const sessKey = `${KEY_PREFIX}sess:abc123`;
        const sessData = JSON.stringify({
            cookie: { maxAge: 86400000 },
            user: { id: 'test-user', perm: 0 },
        });

        await redisCmd('setex', sessKey, 3600, sessData);
        const raw = await redisCmd('get', sessKey);
        const parsed = JSON.parse(raw);
        expect(parsed.user.id).toBe('test-user');

        await redisCmd('del', sessKey);
        const gone = await redisCmd('get', sessKey);
        expect(gone).toBeNull();
    });
});

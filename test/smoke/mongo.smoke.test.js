/**
 * mongo.smoke.test.js — Real MongoDB Smoke Tests
 * (§3 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Connects directly to the mongodb container and runs CRUD operations
 * to verify the database infrastructure works end-to-end.
 *
 * Run inside the dev container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest --config jest.smoke.cjs \
 *     test/smoke/mongo.smoke.test.js --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import mongodb from 'mongodb';
const { MongoClient, ObjectId } = mongodb;

const DB_USERNAME = process.env.DB_USERNAME;
const DB_PWD = process.env.DB_PWD;
const DB_HOST = 'mongodb';
const DB_PORT = 27017;
const DB_NAME = DB_USERNAME; // dev config: DB_NAME = DB_USERNAME
const SMOKE_COLLECTION = '_smoke_test';

let client, db;

beforeAll(async () => {
    // Try with authSource=admin first (production), fall back without (dev)
    const baseUri = `mongodb://${DB_USERNAME}:${DB_PWD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    const opts = { useUnifiedTopology: true };
    try {
        client = await MongoClient.connect(`${baseUri}?authSource=admin`, opts);
    } catch {
        client = await MongoClient.connect(baseUri, opts);
    }
    db = client.db(DB_NAME);
});

afterAll(async () => {
    if (db) {
        await db.collection(SMOKE_COLLECTION).drop().catch(() => {});
    }
    if (client) await client.close();
});

describe('MongoDB Smoke Tests', () => {
    test('connection is alive and server info available', async () => {
        const admin = db.admin();
        const info = await admin.serverInfo();
        expect(info.version).toBeDefined();
    });

    test('insert a document', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        const doc = { _id: new ObjectId(), type: 'smoke', value: 42, ts: new Date() };
        const result = await coll.insertOne(doc);
        expect(result.insertedId).toEqual(doc._id);
    });

    test('find the inserted document', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        const doc = await coll.findOne({ type: 'smoke' });
        expect(doc).not.toBeNull();
        expect(doc.value).toBe(42);
    });

    test('update the document', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        const result = await coll.updateOne(
            { type: 'smoke' },
            { $set: { value: 99 } }
        );
        expect(result.modifiedCount).toBe(1);

        const updated = await coll.findOne({ type: 'smoke' });
        expect(updated.value).toBe(99);
    });

    test('delete the document', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        const result = await coll.deleteOne({ type: 'smoke' });
        expect(result.deletedCount).toBe(1);

        const gone = await coll.findOne({ type: 'smoke' });
        expect(gone).toBeNull();
    });

    test('createIndex and listIndexes work', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        await coll.createIndex({ type: 1 });
        const indexes = await coll.indexes();
        const typeIdx = indexes.find(i => i.key && i.key.type === 1);
        expect(typeIdx).toBeDefined();
    });

    test('bulk operations work', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        const docs = Array.from({ length: 5 }, (_, i) => ({
            _id: new ObjectId(),
            type: 'bulk',
            seq: i,
        }));
        const insertResult = await coll.insertMany(docs);
        expect(insertResult.insertedCount).toBe(5);

        const count = await coll.countDocuments({ type: 'bulk' });
        expect(count).toBe(5);

        await coll.deleteMany({ type: 'bulk' });
        const afterDelete = await coll.countDocuments({ type: 'bulk' });
        expect(afterDelete).toBe(0);
    });

    test('aggregation pipeline works', async () => {
        const coll = db.collection(SMOKE_COLLECTION);
        await coll.insertMany([
            { type: 'agg', category: 'a', amount: 10 },
            { type: 'agg', category: 'a', amount: 20 },
            { type: 'agg', category: 'b', amount: 30 },
        ]);

        const result = await coll.aggregate([
            { $match: { type: 'agg' } },
            { $group: { _id: '$category', total: { $sum: '$amount' } } },
            { $sort: { _id: 1 } },
        ]).toArray();

        expect(result).toEqual([
            { _id: 'a', total: 30 },
            { _id: 'b', total: 30 },
        ]);

        await coll.deleteMany({ type: 'agg' });
    });
});

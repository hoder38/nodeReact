/**
 * E2E seed/teardown utilities.
 * Connects directly to MongoDB and Redis to set up test state.
 */
import { MongoClient } from 'mongodb';

const MONGO_URL = process.env.E2E_MONGO_URL || 'mongodb://mydb:pipipi@localhost:27017/mydb?authSource=admin';
const DB_NAME = process.env.E2E_DB_NAME || 'mydb';

let client;

export async function getDb() {
  if (!client) {
    client = new MongoClient(MONGO_URL);
    await client.connect();
  }
  return client.db(DB_NAME);
}

export async function closeDb() {
  if (client) {
    await client.close();
    client = null;
  }
}

/**
 * Ensure the test user 'hoder' exists with known password.
 * The dev .env already has ROOT_USER = {"username": "hoder", "desc": "owner", "perm": 1}
 * so the user should exist from initial bootstrap.
 */
export async function ensureTestUser() {
  // The dev environment already has a root user 'hoder' with perm=1
  // We just verify it's there
  const db = await getDb();
  const user = await db.collection('user').findOne({ username: 'hoder' });
  if (!user) {
    throw new Error('Test user "hoder" not found. Is the dev stack seeded?');
  }
  return user;
}

/**
 * Clean up any test artifacts (uploaded files, test bookmarks, etc.)
 */
export async function cleanTestData() {
  const db = await getDb();
  // Remove any test-tagged items
  await db.collection('storage').deleteMany({ tags: { $in: ['e2e-test'] } });
  await db.collection('bookmark').deleteMany({ tags: { $in: ['e2e-test'] } });
}

import { ENV_TYPE, DB_USERNAME, DB_PWD, ROOT_USER } from '../../../ver'
import { DB_IP, DB_PORT, DB_NAME } from '../config'
import { MongoClient, ObjectId} from 'mongodb'
import { createHash } from 'crypto'
import { handleError, HoError } from '../util/utility'

let mongo = null;

MongoClient.connect(`mongodb://${DB_USERNAME}:${DB_PWD}@${DB_IP(ENV_TYPE)}:${DB_PORT(ENV_TYPE)}/${DB_NAME(ENV_TYPE)}`, {
    autoReconnect: true,
    poolSize: 10,
}, (err, db) => {
    if (err) {
        return handleError(err, 'DB connect');
    }
    if (!db) {
        return handleError(new HoError('No db connected'), 'DB connect');
    }
    mongo = db;
    console.log('database connected');
    db.collection('user', (err, collection) => {
        if (err) {
            return handleError(err, 'DB connect');
        }
        collection.count((err, count) => {
            if (err) {
                return handleError(err, 'DB connect');
            }
            if (count === 0) {
                collection.insert(Object.assign({}, ROOT_USER, {password: createHash('md5').update('test123').digest('hex')}), (err, user) => {
                    if (err) {
                        return handleError(err, 'DB connect');
                    }
                    console.log(user);
                });
            }
        });
    });
});

let collections = []

export const objectID = (id=null) => id === null ? new ObjectId() : new ObjectId(id)

export default function(functionName, name, ...args) {
    if (name in collections) {
        if (functionName === 'find') {
            return new Promise((resolve, reject) => collections[name][functionName].apply(collections[name], args).toArray((err, data) => err ? reject(err) : resolve(data)))
        } else {
            return new Promise((resolve, reject) => collections[name][functionName].call(collections[name], ...args, (err, data) => err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n)))
        }
    } else {
        return new Promise((resolve, reject) => mongo.collection(name, (err, collection) => err ? reject(err) : resolve(collection))).then(collection => {
            collections[name] = collection
            if (functionName === 'find') {
                return new Promise((resolve, reject) => collection[functionName].apply(collection, args).toArray((err, data) => err ? reject(err) : resolve(data)))
            } else {
                return new Promise((resolve, reject) => collection[functionName].call(collection, ...args, (err, data) => err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n)))
            }
        })
    }
}


import { ENV_TYPE, DB_USERNAME, DB_PWD } from '../../../ver'
import { DB_IP, DB_PORT, DB_NAME } from '../config'
import { Server, Db, ObjectID} from 'mongodb'
import { createHash } from 'crypto'
import { handleError, HoError } from '../util/utility'

const mongodbServer = new Server(DB_IP(ENV_TYPE), DB_PORT(ENV_TYPE), {
    auto_reconnect: true,
    poolSize: 10,
})

const db = new Db(DB_NAME(ENV_TYPE), mongodbServer, { safe: true })

db.open(function(err, con) {
    handleError(err)
    if (!con) {
        handleError(new HoError('No db connected'))
    }
    con.authenticate(DB_USERNAME, DB_PWD, function(err,con2) {
        handleError(err)
        if (!con2) {
            handleError(new HoError('No db connected'))
        }
        console.log('database connected');
        db.collection('user', function(err, collection) {
            handleError(err)
            collection.count(function(err, count) {
                handleError(err)
                if (count === 0) {
                    const data = {
                        username: 'hoder',
                        desc: 'owner',
                        perm: 1,
                        password: createHash('md5').update('test123').digest('hex'),
                    }
                    collection.insert(data, function(err, user) {
                        handleError(err)
                        console.log(user);
                    })
                }
            })
        })
    })
})

let collections = []

export const objectID = (id=null) => id === null ? new ObjectID() : new ObjectID(id)

export default function(functionName, name, ...args) {
    if (name in collections) {
        if (functionName === 'find') {
            return new Promise((resolve, reject) => collections[name][functionName].apply(collections[name], args).toArray((err, data) => err ? reject(err) : resolve(data)))
        } else {
            return new Promise((resolve, reject) => collections[name][functionName].call(collections[name], ...args, (err, data) => err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n)))
        }
    } else {
        return new Promise((resolve, reject) => db.collection(name, (err, collection) => err ? reject(err) : resolve(collection))).then(collection => {
            collections[name] = collection
            if (functionName === 'find') {
                return new Promise((resolve, reject) => collection[functionName].apply(collection, args).toArray((err, data) => err ? reject(err) : resolve(data)))
            } else {
                return new Promise((resolve, reject) => collection[functionName].call(collection, ...args, (err, data) => err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n)))
            }
        })
    }
}


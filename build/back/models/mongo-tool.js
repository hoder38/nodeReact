'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.objectID = undefined;

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.default = function (functionName, name) {
    for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
        args[_key - 2] = arguments[_key];
    }

    if (name in collections) {
        if (functionName === 'find') {
            return new _promise2.default(function (resolve, reject) {
                return collections[name][functionName].apply(collections[name], args).toArray(function (err, data) {
                    return err ? reject(err) : resolve(data);
                });
            });
        } else {
            return new _promise2.default(function (resolve, reject) {
                var _collections$name$fun;

                return (_collections$name$fun = collections[name][functionName]).call.apply(_collections$name$fun, [collections[name]].concat(args, [function (err, data) {
                    return err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n);
                }]));
            });
        }
    } else {
        return new _promise2.default(function (resolve, reject) {
            return mongo.collection(name, function (err, collection) {
                return err ? reject(err) : resolve(collection);
            });
        }).then(function (collection) {
            collections[name] = collection;
            if (functionName === 'find') {
                return new _promise2.default(function (resolve, reject) {
                    return collection[functionName].apply(collection, args).toArray(function (err, data) {
                        return err ? reject(err) : resolve(data);
                    });
                });
            } else {
                return new _promise2.default(function (resolve, reject) {
                    var _collection$functionN;

                    return (_collection$functionN = collection[functionName]).call.apply(_collection$functionN, [collection].concat(args, [function (err, data) {
                        return err ? reject(err) : functionName === 'insert' ? resolve(data.ops) : functionName === 'count' ? resolve(data) : resolve(data.result.n);
                    }]));
                });
            }
        });
    }
};

var _ver = require('../../../ver');

var _config = require('../config');

var _mongodb = require('mongodb');

var _crypto = require('crypto');

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var mongo = null;

_mongodb.MongoClient.connect('mongodb://' + _ver.DB_USERNAME + ':' + _ver.DB_PWD + '@' + (0, _config.DB_IP)(_ver.ENV_TYPE) + ':' + (0, _config.DB_PORT)(_ver.ENV_TYPE) + '/' + (0, _config.DB_NAME)(_ver.ENV_TYPE), {
    autoReconnect: true,
    poolSize: 10
}, function (err, db) {
    (0, _utility.handleError)(err);
    if (!db) {
        (0, _utility.handleError)(new _utility.HoError('No db connected'));
    }
    mongo = db;
    console.log('database connected');
    db.collection('user', function (err, collection) {
        (0, _utility.handleError)(err);
        collection.count(function (err, count) {
            (0, _utility.handleError)(err);
            if (count === 0) {
                collection.insert({
                    username: 'hoder',
                    desc: 'owner',
                    perm: 1,
                    password: (0, _crypto.createHash)('md5').update('test123').digest('hex')
                }, function (err, user) {
                    (0, _utility.handleError)(err);
                    console.log(user);
                });
            }
        });
    });
});

var collections = [];

var objectID = exports.objectID = function objectID() {
    var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    return id === null ? new _mongodb.ObjectId() : new _mongodb.ObjectId(id);
};
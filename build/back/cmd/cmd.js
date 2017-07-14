'use strict';

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _constants = require('../constants');

var _readline = require('readline');

var _fs = require('fs');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _apiToolGoogle = require('../models/api-tool-google');

var _tagTool = require('../models/tag-tool');

var _externalTool = require('../models/external-tool');

var _externalTool2 = _interopRequireDefault(_externalTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function cmdUpdateDrive() {
    var drive_batch = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _constants.DRIVE_LIMIT;
    var singleUser = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    drive_batch = isNaN(drive_batch) ? _constants.DRIVE_LIMIT : Number(drive_batch);
    console.log(drive_batch);
    console.log('cmdUpdateDrive');
    console.log(new Date());
    var isSingle = function isSingle() {
        return (0, _mongoTool2.default)('find', _constants.USERDB, (0, _assign2.default)({ auto: { $exists: true } }, singleUser ? { username: (0, _utility.isValidString)(singleUser, 'name', 'user name not valid!!!') } : {}));
    };
    return isSingle().then(function (userlist) {
        return (0, _apiToolGoogle.userDrive)(userlist, 0, drive_batch);
    });
}

var dbDump = function dbDump(collection) {
    if (collection !== _constants.USERDB && collection !== _constants.STORAGEDB && collection !== _constants.STOCKDB && collection !== _constants.PASSWORDDB && collection !== _constants.STORAGEDB + 'User' && collection !== _constants.STOCKDB + 'User' && collection !== _constants.PASSWORDDB + 'User' && collection !== _constants.USERDB + 'User') {
        (0, _utility.handleError)(new _utility.HoError('Collection not find'));
    }
    var folderPath = '/mnt/mongodb/backup/' + collection;
    var mkfolder = function mkfolder() {
        return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
            return (0, _mkdirp2.default)(folderPath, function (err) {
                return err ? reject(err) : resolve();
            });
        });
    };
    var recur_dump = function recur_dump(index, offset) {
        return (0, _mongoTool2.default)('find', collection, {}, {
            limit: _constants.DRIVE_LIMIT,
            skip: offset
        }).then(function (items) {
            if (items.length < _constants.DRIVE_LIMIT) {
                return _promise2.default.resolve();
            }
            var write_data = '';
            items.forEach(function (item) {
                write_data = '' + write_data + (0, _stringify2.default)(item) + "\r\n";
            });
            return new _promise2.default(function (resolve, reject) {
                return (0, _fs.writeFile)(folderPath + '/' + index, write_data, 'utf8', function (err) {
                    return err ? reject(err) : resolve();
                });
            }).then(function () {
                return recur_dump(index + 1, offset + items.length);
            });
        });
    };
    return mkfolder().then(function () {
        return recur_dump(0, 0);
    });
};

var dbRestore = function dbRestore(collection) {
    if (collection !== _constants.USERDB && collection !== _constants.STORAGEDB && collection !== _constants.STOCKDB && collection !== _constants.PASSWORDDB && collection !== _constants.STORAGEDB + 'User' && collection !== _constants.STOCKDB + 'User' && collection !== _constants.PASSWORDDB + 'User' && collection !== _constants.USERDB + 'User') {
        (0, _utility.handleError)(new _utility.HoError('Collection not find'));
    }
    var folderPath = '/mnt/mongodb/backup/' + collection;
    var recur_insert = function recur_insert(index, store) {
        return index >= store.length ? _promise2.default.resolve() : (0, _mongoTool2.default)('insert', collection, store[index]).then(function () {
            return recur_insert(index + 1, store);
        });
    };
    var recur_restore = function recur_restore(index) {
        var filePath = folderPath + '/' + index;
        return !(0, _fs.existsSync)(filePath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
            var store = [];
            var rl = (0, _readline.createInterface)({
                input: (0, _fs.createReadStream)(filePath),
                terminal: false
            });
            rl.on('line', function (line) {
                var json = JSON.parse(line);
                for (var i in json) {
                    if (i === '_id' || i === 'userId' || i === 'owner') {
                        json[i] = (0, _mongoTool.objectID)(json[i]);
                    }
                }
                store.push(json);
            }).on('close', function () {
                return resolve(store);
            });
        }).then(function (store) {
            return recur_insert(0, store);
        }).then(function () {
            return recur_restore(index + 1);
        });
    };
    return recur_restore(0);
};

var rl = (0, _readline.createInterface)({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

process.on('uncaughtException', function (err) {
    console.log('Threw Exception: ' + err.name + ' ' + err.message);
    if (err.stack) {
        console.log(err.stack);
    }
});

rl.on('line', function (line) {
    var cmd = line.split(' ');
    switch (cmd[0]) {
        case 'drive':
            console.log('drive');
            return cmdUpdateDrive(cmd[1], cmd[2]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD drive');
            });
        case 'doc':
            console.log('doc');
            return (0, _mongoTool2.default)('find', _constants.USERDB, {
                auto: { $exists: true },
                perm: 1
            }).then(function (userlist) {
                return (0, _apiToolGoogle.autoDoc)(userlist, 0, cmd[1], cmd[2]);
            }).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD doc');
            });
        case 'checkdoc':
            console.log('checkdoc');
            return (0, _mongoTool2.default)('find', _constants.DOCDB).then(function (doclist) {
                return console.log(doclist);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD checkdoc');
            });
        case 'external':
            console.log('external');
            return _externalTool2.default.getList(cmd[1], cmd[2]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD external');
            });
        case 'complete':
            console.log('complete');
            return (0, _tagTool.completeMimeTag)(cmd[1]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD complete');
            });
        case 'dbdump':
            console.log('dbdump');
            return dbDump(cmd[1]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD dbdump');
            });
        case 'dbrestore':
            console.log('dbrestore');
            return dbRestore(cmd[1]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'CMD dbrestore');
            });
        default:
            console.log('help:');
            console.log('drive batchNumber [single username]');
            console.log('doc am|jp|tw [time]');
            console.log('checkdoc');
            console.log('external lovetv|eztv [clear]');
            console.log('complete [add]');
            console.log('dbdump collection');
            console.log('dbrestore collection');
    }
});
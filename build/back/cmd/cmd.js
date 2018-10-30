'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.dbDump = undefined;

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

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

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

var sendList = _constants.RANDOM_EMAIL;

function cmdUpdateDrive() {
    var drive_batch = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _constants.DRIVE_LIMIT;
    var singleUser = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    drive_batch = isNaN(drive_batch) ? _constants.DRIVE_LIMIT : Number(drive_batch);
    console.log(drive_batch);
    console.log('cmdUpdateDrive');
    console.log(new Date());
    var username = (0, _utility.isValidString)(singleUser, 'name');
    if (!username) {
        return (0, _utility.handleError)(new _utility.HoError('user name not valid!!!'));
    }
    var isSingle = function isSingle() {
        return (0, _mongoTool2.default)('find', _constants.USERDB, (0, _assign2.default)({ auto: { $exists: true } }, singleUser ? { username: username } : {}));
    };
    return isSingle().then(function (userlist) {
        return (0, _apiToolGoogle.userDrive)(userlist, 0, drive_batch);
    });
}

var dbDump = exports.dbDump = function dbDump(collection) {
    var backupDate = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    if (collection !== _constants.USERDB && collection !== _constants.STORAGEDB && collection !== _constants.STOCKDB && collection !== _constants.PASSWORDDB && collection !== _constants.DOCDB && collection !== _constants.STORAGEDB + 'User' && collection !== _constants.STOCKDB + 'User' && collection !== _constants.PASSWORDDB + 'User') {
        return (0, _utility.handleError)(new _utility.HoError('Collection not find'));
    }
    if (!backupDate) {
        backupDate = new Date();
        backupDate = '' + backupDate.getFullYear() + (0, _utility.completeZero)(backupDate.getMonth() + 1, 2) + (0, _utility.completeZero)(backupDate.getDate(), 2);
    }
    var folderPath = (0, _config.BACKUP_PATH)(_ver.ENV_TYPE) + '/' + backupDate + '/' + collection;
    var mkfolder = function mkfolder() {
        return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
            return (0, _mkdirp2.default)(folderPath, function (err) {
                return err ? reject(err) : resolve();
            });
        });
    };
    var recur_dump = function recur_dump(index, offset) {
        return (0, _mongoTool2.default)('find', collection, {}, {
            limit: _constants.BACKUP_LIMIT,
            skip: offset
        }).then(function (items) {
            if (items.length < 1) {
                return _promise2.default.resolve();
            }
            var write_data = '';
            items.forEach(function (item) {
                return write_data = '' + write_data + (0, _stringify2.default)(item) + "\r\n";
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
    if (collection !== _constants.USERDB && collection !== _constants.STORAGEDB && collection !== _constants.STOCKDB && collection !== _constants.PASSWORDDB && collection !== _constants.DOCDB && collection !== _constants.STORAGEDB + 'User' && collection !== _constants.STOCKDB + 'User' && collection !== _constants.PASSWORDDB + 'User') {
        return (0, _utility.handleError)(new _utility.HoError('Collection not find'));
    }
    var folderPath = (0, _config.BACKUP_PATH)(_ver.ENV_TYPE) + '/' + collection;
    var recur_insert = function recur_insert(index, store) {
        return index >= store.length ? _promise2.default.resolve() : (0, _mongoTool2.default)('count', collection, { _id: store[index]._id }, { limit: 1 }).then(function (count) {
            return count > 0 ? recur_insert(index + 1, store) : (0, _mongoTool2.default)('insert', collection, store[index]).then(function () {
                return recur_insert(index + 1, store);
            });
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

var randomSend = function randomSend(action) {
    var joiner = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    switch (action) {
        case 'list':
            console.log(sendList);
            return _promise2.default.resolve();
            break;
        case 'edit':
            if (!joiner) {
                return (0, _utility.handleError)(new _utility.HoError('Joiner unknown!!!'));
            }
            var result = joiner.split(':');
            for (var i in sendList) {
                if (result[0] === sendList[i].name) {
                    sendList.splice(i, 1);
                    console.log(sendList);
                    return _promise2.default.resolve();
                }
            }
            if (result.length < 2) {
                return (0, _utility.handleError)(new _utility.HoError('Joiner infomation valid!!!'));
            }
            sendList.push({
                name: result[0],
                mail: result[1]
            });
            console.log(sendList);
            return _promise2.default.resolve();
        case 'send':
            console.log(sendList);
            if (sendList.length < 3) {
                return (0, _utility.handleError)(new _utility.HoError('Send list too short!!!'));
            }
            var orig = sendList.map(function (v, i) {
                return i;
            });
            //console.log(orig);
            var shuffle = function shuffle(arr) {
                var currentIndex = arr.length;
                while (currentIndex > 0) {
                    var randomIndex = Math.floor(Math.random() * currentIndex);
                    currentIndex--;
                    var temporaryValue = arr[currentIndex];
                    arr[currentIndex] = arr[randomIndex];
                    arr[randomIndex] = temporaryValue;
                }
                return arr;
            };
            var testArr = function testArr(arr) {
                for (var _i = 0; _i < arr.length; _i++) {
                    if (arr[_i] === _i) {
                        return false;
                    }
                    if (arr[arr[_i]] === _i) {
                        return false;
                    }
                }
                return true;
            };
            var limit = 100;

            var _loop = function _loop() {
                var ran = shuffle(orig);
                //console.log(ran);
                if (testArr(ran)) {
                    var _ret2 = function () {
                        var recur_send = function recur_send(index) {
                            return index >= ran.length ? _promise2.default.resolve() : (0, _apiToolGoogle.sendPresentName)(new Buffer(sendList[ran[index]].name).toString('base64'), sendList[index].mail, joiner).then(function () {
                                return recur_send(index + 1);
                            });
                        };
                        return {
                            v: {
                                v: recur_send(0)
                            }
                        };
                    }();

                    if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                }
                limit--;
            };

            while (limit > 0) {
                var _ret = _loop();

                if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
            }
            console.log('out of limit');
            return _promise2.default.resolve();
        default:
            return (0, _utility.handleError)(new _utility.HoError('Action unknown!!!'));
    }
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
        case 'randomsend':
            console.log('randomsend');
            return randomSend(cmd[1], cmd[2]).then(function () {
                return console.log('done');
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Random send');
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
            console.log('randomsend list|edit|send [name:email|append]');
    }
});
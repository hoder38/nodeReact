'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _map = require('babel-runtime/core-js/map');

var _map2 = _interopRequireDefault(_map);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _ver = require('../../../ver');

var _config = require('../config');

var _constants = require('../constants');

var _utility = require('../util/utility');

var _apiToolGoogle = require('../models/api-tool-google');

var _fs = require('fs');

var _readline = require('readline');

var _iconvLite = require('iconv-lite');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var getRewardItem = function getRewardItem(items) {
    return items.map(function (item) {
        return {
            name: item.name,
            id: item._id,
            utime: item.utime,
            count: item.count,
            tags: item.option
        };
    });
};

var getUserItem = function getUserItem(items) {
    var user = [];
    var i = 0;
    items.forEach(function (item) {
        for (var j = 0; j < item.count; j++) {
            user.push({
                id: i,
                name: item.name
            });
            i++;
        }
    });
    if (user.length < 1) {
        user.push({
            id: -1,
            name: 'EMPTY'
        });
    }
    return user;
};

exports.default = {
    getInit: function getInit(owner) {
        return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 0 }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return { name: false };
            } else {
                var _ret = function () {
                    var name = items[0].name;
                    var isOwner = owner.equals(items[0].owner);
                    return {
                        v: (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 2 }, {
                            sort: [['owner', 'asc']]
                        }).then(function (items) {
                            var user = getUserItem(items);
                            return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 1 }, {
                                sort: [['owner', 'asc']]
                            }).then(function (items) {
                                return {
                                    owner: isOwner,
                                    name: name,
                                    user: user,
                                    reward: getRewardItem(items),
                                    ws_url: 'wss://' + (0, _config.EXTENT_FILE_IP)(_ver.ENV_TYPE) + ':' + (0, _config.WS_PORT)(_ver.ENV_TYPE) + '/f/win'
                                };
                            });
                        })
                    };
                }();

                if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
            }
        });
    },
    getData: function getData() {
        var uid = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

        if (uid) {
            var id = (0, _utility.isValidString)(uid, 'uid');
            if (!id) {
                return (0, _utility.handleError)(new _utility.HoError('invalid uid'));
            }
            return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { _id: id }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('Prize is not exist!!!'));
                }
                return getRewardItem(items);
            });
        } else {
            return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 2 }, {
                sort: [['owner', 'asc']]
            }).then(function (items) {
                return getUserItem(items);
            });
        }
    },
    newLottery: function newLottery(owner, name, type, big5, user, reward) {
        console.log(owner);
        console.log(name);
        console.log(type);
        console.log(big5);
        console.log(user);
        console.log(reward);
        //option remove:multiple
        var option = type === '1' ? [true, true] : type === '2' ? [false, true] : [true, false];
        return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 0 }, { limit: 1 }).then(function (items) {
            if (items.length > 0) {
                return (0, _utility.handleError)(new _utility.HoError('already has a lottery!!!'));
            }
            return (0, _mongoTool2.default)('insert', _constants.LOTTERYDB, {
                type: 0,
                owner: owner,
                name: name,
                count: big5 === 'en' ? 0 : 1,
                option: option
            }).then(function (item) {
                console.log(item);
                var recurUser = function recurUser(index) {
                    return user.length <= index ? _promise2.default.resolve() : (0, _mongoTool2.default)('insert', _constants.LOTTERYDB, (0, _assign2.default)({
                        type: 2,
                        owner: index,
                        name: user[index][0],
                        count: user[index][1],
                        option: user[index].splice(3)
                    }, (0, _utility.isValidString)(user[index][2], 'email') ? { utime: user[index][2] } : {})).then(function (item) {
                        console.log(item);
                        return recurUser(index + 1);
                    });
                };
                var recurReward = function recurReward(index) {
                    return reward.length <= index ? _promise2.default.resolve() : (0, _mongoTool2.default)('insert', _constants.LOTTERYDB, {
                        type: 1,
                        owner: index,
                        name: reward[index][0],
                        count: reward[index][1],
                        option: []
                    }).then(function (item) {
                        console.log(item);
                        return recurReward(index + 1);
                    });
                };
                return recurUser(0).then(function () {
                    return recurReward(0);
                }).catch(function (err) {
                    return (0, _mongoTool2.default)('remove', _constants.LOTTERYDB, { $isolated: 1 }).then(function () {
                        return _promise2.default.reject(err);
                    });
                });
            });
        });
    },
    input: function input(filePath) {
        var big5 = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

        var isUser = true;
        var user = [];
        var reward = [];
        var utfPath = (0, _config.NAS_TMP)(_ver.ENV_TYPE) + '/lottery.csv';
        return new _promise2.default(function (resolve, reject) {
            return (0, _fs.readFile)(filePath, function (err, data) {
                return err ? reject(err) : resolve(data);
            });
        }).then(function (data) {
            return new _promise2.default(function (resolve, reject) {
                return (0, _fs.writeFile)(utfPath, (0, _utility.bufferToString)(data, big5), 'utf8', function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        }).then(function () {
            return new _promise2.default(function (resolve, reject) {
                //0 name 1 times 26 black times 27 black reward
                (0, _readline.createInterface)({ input: (0, _fs.createReadStream)(utfPath) }).on('line', function (line) {
                    var parse = line.split(',');
                    if (!parse[0]) {
                        return false;
                    }
                    if (parse[0] === 'prize') {
                        isUser = false;
                        return false;
                    }
                    if (isUser) {
                        var isRepeat = false;
                        for (var i = 0; i < user.length; i++) {
                            if (user[i][0] === parse[0].trim()) {
                                var count = parse[1];
                                var mail = parse[2];
                                if ((0, _utility.isValidString)(parse[1], 'email')) {
                                    count = parse[2];
                                    mail = parse[1];
                                }
                                user[i][1] = count ? user[i][1] + +count : user[i][1] + 1;
                                if (!user[i][2]) {
                                    user[i][2] = mail;
                                }
                                if (parse[26]) {
                                    if (user[i][3]) {
                                        user[i][3] += +parse[26];
                                    } else {
                                        user[i].push(+parse[26]);
                                    }
                                }
                                if (parse.length > 27) {
                                    for (var j = 27; j < parse.length; j++) {
                                        if (!parse[j]) {
                                            break;
                                        }
                                        if (user[i].length < 4) {
                                            user[i].push(0);
                                        }
                                        user[i].push(+parse[j] - 1);
                                    }
                                }
                                isRepeat = true;
                                break;
                            }
                        }
                        if (!isRepeat) {
                            var _count = parse[1];
                            var _mail = parse[2];
                            if ((0, _utility.isValidString)(parse[1], 'email')) {
                                _count = parse[2];
                                _mail = parse[1];
                            }
                            var u = [parse[0].trim(), _count ? +_count : 1, _mail];
                            if (parse[26]) {
                                u.push(+parse[26]);
                            }
                            if (parse.length > 27) {
                                for (var _j = 27; _j < parse.length; _j++) {
                                    if (!parse[_j]) {
                                        break;
                                    }
                                    if (u.length < 4) {
                                        u.push(0);
                                    }
                                    u.push(+parse[_j] - 1);
                                }
                            }
                            user.push(u);
                        }
                    } else {
                        reward.push([parse[0].trim(), parse[1] ? +parse[1] : 1]);
                    }
                }).on('close', function () {
                    if (user.length < 1 || reward.length < 1) {
                        reject(new _utility.HoError('user or prize is empty!!!'));
                    } else {
                        resolve({ user: user, reward: reward });
                    }
                });
            });
        });
    },
    select: function select(uid, owner) {
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleError)(new _utility.HoError('invalid uid'));
        }
        return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 0 }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('lottery is not exist'));
            }
            if (!owner.equals(items[0].owner)) {
                return (0, _utility.handleError)(new _utility.HoError('You are not the owner'));
            }
            var lotteryName = items[0].name;
            var remove = items[0].option[0];
            var multiple = items[0].option[1];
            return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { _id: id }, { limit: 1 }).then(function (rewards) {
                if (rewards.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('Prize is not exist!!!'));
                }
                console.log(rewards);
                var rewardName = rewards[0].name;
                var type = (0, _typeof3.default)(rewards[0].utime);
                var quantity = type === 'object' ? 0 : type === 'number' ? rewards[0].count - rewards[0].utime : rewards[0].count;
                var prizedlist = [];
                var number = rewards[0].owner;
                if (quantity < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('Prize has already opened!!!'));
                }
                var userlist = [];
                var rewardlist = new _map2.default();
                console.log(quantity);
                //reward以後者優先
                return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 2 }).then(function (items) {
                    items.forEach(function (item) {
                        var q = item.count;
                        if (item.option.length > 1) {
                            q = multiple ? q - item.option.length + 1 : 0;
                            for (var i = 1; i < item.option.length; i++) {
                                rewardlist.set(item.option[i], {
                                    id: item._id,
                                    name: item.name,
                                    count: item.count,
                                    mail: item.utime
                                });
                            }
                        }
                        if (q > 0) {
                            if (item.option.length > 0) {
                                q += item.option[0];
                            }
                            for (var _i = 0; _i < q; _i++) {
                                userlist.push({
                                    id: item._id,
                                    name: item.name,
                                    count: item.count,
                                    mail: item.utime
                                });
                            }
                        }
                    });

                    var _loop = function _loop(i) {
                        var black = false;
                        var name = '';
                        if (rewardlist.has(number)) {
                            black = true;
                            name = rewardlist.get(number);
                            rewardlist.delete(number);
                        }
                        if (!black) {
                            if (userlist.length < 1) {
                                if (rewardlist.size > 0) {
                                    var _iteratorNormalCompletion = true;
                                    var _didIteratorError = false;
                                    var _iteratorError = undefined;

                                    try {
                                        for (var _iterator = (0, _getIterator3.default)(rewardlist.keys()), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                            var j = _step.value;

                                            name = rewardlist.get(j);
                                            rewardlist.delete(j);
                                            break;
                                        }
                                    } catch (err) {
                                        _didIteratorError = true;
                                        _iteratorError = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion && _iterator.return) {
                                                _iterator.return();
                                            }
                                        } finally {
                                            if (_didIteratorError) {
                                                throw _iteratorError;
                                            }
                                        }
                                    }

                                    prizedlist.push(name);
                                    return 'continue';
                                } else {
                                    return 'break';
                                }
                            }
                            var result = Math.floor(Math.random() * userlist.length);
                            name = userlist[result];
                            if (remove) {
                                if (multiple) {
                                    userlist.splice(result, 1);
                                } else {
                                    userlist = userlist.filter(function (v) {
                                        return v.name !== name.name;
                                    });
                                }
                            }
                        }
                        prizedlist.push(name);
                    };

                    _loop2: for (var i = 0; i < quantity; i++) {
                        var _ret2 = _loop(i);

                        switch (_ret2) {
                            case 'continue':
                                continue;

                            case 'break':
                                break _loop2;}
                    }

                    if (prizedlist.length < 1) {
                        return (0, _utility.handleError)(new _utility.HoError('There is no user left!!!'));
                    }
                    //db
                    var utime = rewards[0].utime ? rewards[0].utime + prizedlist.length : prizedlist.length;
                    if (utime >= rewards[0].count) {
                        utime = Math.round(new Date().getTime() / 1000);
                    }
                    var namelist = prizedlist.map(function (n) {
                        return n.name;
                    });
                    return (0, _mongoTool2.default)('update', _constants.LOTTERYDB, { _id: rewards[0]._id }, { $set: {
                            utime: utime,
                            option: rewards[0].option.concat(namelist)
                        } }).then(function (item2) {
                        if (remove) {
                            var _ret3 = function () {
                                var recurUser = function recurUser(index) {
                                    if (index >= prizedlist.length) {
                                        return _promise2.default.resolve();
                                    } else {
                                        if (multiple) {
                                            var count = prizedlist[index].count--;
                                            return count < 1 ? (0, _mongoTool2.default)('remove', _constants.LOTTERYDB, {
                                                _id: prizedlist[index].id,
                                                $isolated: 1
                                            }).then(function (item3) {
                                                return recurUser(index + 1);
                                            }) : (0, _mongoTool2.default)('update', _constants.LOTTERYDB, { _id: prizedlist[index].id }, { $set: { count: count } }).then(function (item3) {
                                                return recurUser(index + 1);
                                            });
                                        } else {
                                            return (0, _mongoTool2.default)('remove', _constants.LOTTERYDB, {
                                                _id: prizedlist[index].id,
                                                $isolated: 1
                                            }).then(function (item3) {
                                                return recurUser(index + 1);
                                            });
                                        }
                                    }
                                };
                                return {
                                    v: recurUser(0)
                                };
                            }();

                            if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                        } else {
                            return _promise2.default.resolve();
                        }
                    }).then(function () {
                        var recurSend = function recurSend(index) {
                            if (index >= prizedlist.length) {
                                return _promise2.default.resolve();
                            } else {
                                if ((0, _utility.isValidString)(prizedlist[index].mail, 'email')) {
                                    return (0, _apiToolGoogle.sendLotteryName)(lotteryName, '\u606D\u559C' + prizedlist[index].name + '\u7372\u5F97' + rewardName + '\uFF01\uFF01\uFF01', prizedlist[index].mail).then(function () {
                                        return recurSend(index + 1);
                                    });
                                } else {
                                    return recurSend(index + 1);
                                }
                            }
                        };
                        console.log(namelist);
                        return recurSend(0).then(function () {
                            return { namelist: namelist, id: id, rewardName: rewardName };
                        });
                    });
                });
            });
        });
    },
    downloadCsv: function downloadCsv(user) {
        return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 0 }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('lottery is not exist'));
            }
            if ((0, _utility.checkAdmin)(1, user) && !user._id.equals(items[0].owner)) {
                return (0, _utility.handleError)(new _utility.HoError('You are not the owner'));
            }
            var utfPath = (0, _config.NAS_TMP)(_ver.ENV_TYPE) + '/lotteryoutput.csv';
            return (0, _mongoTool2.default)('remove', _constants.LOTTERYDB, { $isolated: 1 }).then(function () {
                return {
                    path: utfPath,
                    name: items[0].name
                };
            });
        });
    },
    outputCsv: function outputCsv(user) {
        return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 0 }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('lottery is not exist'));
            }
            if ((0, _utility.checkAdmin)(1, user) && !user._id.equals(items[0].owner)) {
                return (0, _utility.handleError)(new _utility.HoError('You are not the owner'));
            }
            var big5 = items[0].count;
            return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 2 }, {
                sort: [['owner', 'asc']]
            }).then(function (items) {
                return items.map(function (item) {
                    return item.option.length > 0 ? [item.name, item.count, item.utime, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''].concat(item.option.map(function (o, i) {
                        return i > 0 ? o + 1 : o;
                    })) : [item.name, item.count, item.utime];
                });
            }).then(function (user) {
                return (0, _mongoTool2.default)('find', _constants.LOTTERYDB, { type: 1 }, {
                    sort: [['owner', 'asc']]
                }).then(function (items) {
                    return items.map(function (item) {
                        return [item.name, item.count].concat(item.option);
                    });
                }).then(function (reward) {
                    var output = user.concat([['prize']]).concat(reward);
                    var utfPath = (0, _config.NAS_TMP)(_ver.ENV_TYPE) + '/lotteryoutput.csv';
                    var recur = function recur(index) {
                        return index >= output.length ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                            return (0, _fs.appendFile)(utfPath, big5 ? (0, _iconvLite.encode)(output[index].join(',') + '\n', 'big5') : output[index].join(',') + '\n', big5 ? {} : 'utf8', function (err) {
                                return err ? reject(err) : resolve();
                            });
                        }).then(function () {
                            return recur(index + 1);
                        });
                    };
                    return (0, _fs.existsSync)(utfPath) ? new _promise2.default(function (resolve, reject) {
                        return (0, _fs.unlink)(utfPath, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    }).then(function () {
                        return recur(0);
                    }) : recur(0);
                });
            });
        });
    }
};
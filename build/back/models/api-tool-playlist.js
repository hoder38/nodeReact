'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.default = process;

var _ver = require('../../../ver');

var _config = require('../config');

var _constants = require('../constants');

var _fs = require('fs');

var _path = require('path');

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _torrentStream = require('torrent-stream');

var _torrentStream2 = _interopRequireDefault(_torrentStream);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _opensubtitlesApi = require('opensubtitles-api');

var _opensubtitlesApi2 = _interopRequireDefault(_opensubtitlesApi);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _apiTool = require('./api-tool');

var _apiTool2 = _interopRequireDefault(_apiTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _osTorrentHash = require('../util/os-torrent-hash.js');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var torrent_pool = [];
var zip_pool = [];
var mega_pool = [];
var torrent_lock = false;
var zip_lock = false;
var mega_lock = false;

var setLock = function setLock(type) {
    switch (type) {
        case 'torrent':
            console.log(torrent_lock);
            return torrent_lock ? new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(setLock(type));
                }, 500);
            }) : _promise2.default.resolve(torrent_lock = true);
        case 'zip':
            console.log(zip_lock);
            return zip_lock ? new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(setLock(type));
                }, 500);
            }) : _promise2.default.resolve(zip_lock = true);
        case 'mega':
            console.log(mega_lock);
            return mega_lock ? new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(setLock(type));
                }, 500);
            }) : _promise2.default.resolve(mega_lock = true);
        default:
            console.log('unknown lock');
            return _promise2.default.resolve(false);
    }
};

var megaGet = function megaGet() {
    var rest = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
    return setLock('mega').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        console.log('mega get');
        if (rest && typeof rest === 'function') {
            rest().catch(function (err) {
                return (0, _utility.handleError)(err, 'Mega api rest');
            });
        }
        var time = 0;
        var choose = -1;
        for (var i in mega_pool) {
            if (!time) {
                time = mega_pool[i].time;
                choose = i;
            } else {
                if (time > mega_pool[i].time) {
                    time = mega_pool[i].time;
                    choose = i;
                }
            }
        }
        console.log(choose);
        console.log(time);
        if (!time) {
            mega_lock = false;
            return _promise2.default.resolve();
        }
        var runNum = 0;
        mega_pool.forEach(function (v) {
            if (v.run) {
                runNum++;
            }
        });
        var is_run = runNum < (0, _config.MEGA_LIMIT)(_ver.ENV_TYPE) ? true : false;
        if (is_run) {
            var _ret = function () {
                mega_pool[choose].start = Math.round(new Date().getTime() / 1000);
                mega_pool[choose].run = true;
                var runUser = mega_pool[choose].user;
                var runUrl = mega_pool[choose].url;
                var runPath = mega_pool[choose].filePath;
                var runData = mega_pool[choose].data;
                mega_lock = false;
                return {
                    v: startMega(runUser, runUrl, runPath, runData).catch(function (err) {
                        return handle_err(err, runUser, 'Mega api');
                    }).then(function (rest) {
                        return megaGet(rest);
                    })
                };
            }();

            if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
        } else {
            mega_lock = false;
            return _promise2.default.resolve();
        }
    });
};

var zipGet = function zipGet() {
    return setLock('zip').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        console.log('zip get');
        var time = 0;
        var choose = -1;
        for (var i in zip_pool) {
            if (!time) {
                time = zip_pool[i].time;
                choose = i;
            } else {
                if (time > zip_pool[i].time) {
                    time = zip_pool[i].time;
                    choose = i;
                }
            }
        }
        console.log(choose);
        console.log(time);
        if (!time) {
            zip_lock = false;
            return _promise2.default.resolve();
        }
        var runNum = 0;
        zip_pool.forEach(function (v) {
            if (v.run) {
                runNum++;
            }
        });
        var is_run = runNum < (0, _config.ZIP_LIMIT)(_ver.ENV_TYPE) ? true : false;
        if (is_run) {
            var _ret2 = function () {
                zip_pool[choose].start = Math.round(new Date().getTime() / 1000);
                zip_pool[choose].run = true;
                var runIndex = zip_pool[choose].index;
                var runId = zip_pool[choose].fileId;
                var runOwner = zip_pool[choose].fileOwner;
                var runName = zip_pool[choose].name;
                var runPwd = zip_pool[choose].pwd;
                var runType = zip_pool[choose].type;
                var runUser = zip_pool[choose].user;
                zip_lock = false;
                return {
                    v: startZip(runUser, runIndex, runId, runOwner, runName, runPwd, runType).catch(function (err) {
                        return handle_err(err, runUser, 'Zip api', runId);
                    }).then(function () {
                        return zipGet();
                    })
                };
            }();

            if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
        } else {
            zip_lock = false;
            return _promise2.default.resolve();
        }
    });
};

var torrentGet = function torrentGet() {
    return setLock('torrent').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        console.log('torrent get');
        var pri = 0;
        var time = 0;
        var hash = null;
        for (var i in torrent_pool) {
            if (!torrent_pool[i].engine) {
                if ((0, _utility.checkAdmin)(1, torrent_pool[i].user)) {
                    if (!pri) {
                        pri = 1;
                        time = torrent_pool[i].time;
                        hash = torrent_pool[i].hash;
                    } else if (time > torrent_pool[i].time) {
                        time = torrent_pool[i].time;
                        hash = torrent_pool[i].hash;
                    }
                } else {
                    if (!pri) {
                        if (!time) {
                            time = torrent_pool[i].time;
                            hash = torrent_pool[i].hash;
                        } else if (time > torrent_pool[i].time) {
                            time = torrent_pool[i].time;
                            hash = torrent_pool[i].hash;
                        }
                    }
                }
            }
        }
        console.log(pri);
        console.log(time);
        console.log(hash);
        if (!hash) {
            torrent_lock = false;
            return _promise2.default.resolve();
        }
        var runNum = 0;
        torrent_pool.forEach(function (v) {
            if (v.engine) {
                runNum++;
            }
        });
        if (runNum < (0, _config.TORRENT_LIMIT)(_ver.ENV_TYPE)) {
            for (var _i in torrent_pool) {
                if (torrent_pool[_i].hash === hash) {
                    var _ret3 = function () {
                        var engine = (0, _torrentStream2.default)(torrent_pool[_i].torrent, {
                            tmp: (0, _config.NAS_TMP)(_ver.ENV_TYPE),
                            path: (0, _utility.getFileLocation)(torrent_pool[_i].fileOwner, torrent_pool[_i].fileId) + '/real',
                            connections: _constants.TORRENT_CONNECT,
                            uploads: _constants.TORRENT_UPLOAD
                        });
                        console.log('new engine');
                        torrent_pool[_i].engine = engine;
                        torrent_pool[_i].start = Math.round(new Date().getTime() / 1000);
                        var runIndex = torrent_pool[_i].index;
                        var runId = torrent_pool[_i].fileId;
                        var runOwner = torrent_pool[_i].fileOwner;
                        var runHash = torrent_pool[_i].hash;
                        var runUser = torrent_pool[_i].user;
                        torrent_lock = false;
                        var startEngine = function startEngine(index) {
                            return engine ? engine.files && engine.files.length > 0 ? startTorrent(runUser, runId, runOwner, index, runHash, engine) : new _promise2.default(function (resolve, reject) {
                                return engine.on('ready', function () {
                                    console.log('torrent ready');
                                    return resolve(startTorrent(runUser, runId, runOwner, index, runHash, engine));
                                });
                            }) : _promise2.default.resolve();
                        };
                        return {
                            v: _promise2.default.all(runIndex.map(function (v) {
                                return startEngine(v);
                            })).catch(function (err) {
                                return handle_err(err, runUser, 'Torrent api');
                            }).then(function () {
                                return torrentGet();
                            })
                        };
                    }();

                    if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                }
            }
        } else {
            torrent_lock = false;
            return _promise2.default.resolve();
        }
    });
};

function process(action) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
    }

    console.log('torrent: ' + torrent_pool.length);
    console.log('zip: ' + zip_pool.length);
    console.log('mega: ' + mega_pool.length);
    console.log(action);
    console.log(args);
    switch (action) {
        case 'playlist kick':
            return playlistKick.apply(undefined, args);
        case 'torrent info':
            return torrentInfo.apply(undefined, args);
        case 'torrent add':
            torrentAdd.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Torrent api');
            }).then(function () {
                return torrentGet();
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Torrent api');
            });
            return _promise2.default.resolve();
        case 'torrent stop':
            torrentStop.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Torrent api');
            }).then(function () {
                return torrentGet();
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Torrent api');
            });
            return _promise2.default.resolve();
        case 'zip add':
            zipAdd.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Zip api', args[2]);
            }).then(function () {
                return zipGet();
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Zip api');
            });
            return _promise2.default.resolve();
        case 'zip stop':
            zipStop.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Zip api');
            }).then(function () {
                return zipGet();
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Zip api');
            });
            return _promise2.default.resolve();
        case 'mega add':
            megaAdd.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Mega api');
            }).then(function (rest) {
                return megaGet(rest);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Mega api');
            });
            return _promise2.default.resolve();
        case 'mega stop':
            megaStop.apply(undefined, args).catch(function (err) {
                return handle_err(err, args[0], 'Mega api');
            }).then(function (rest) {
                return megaGet(rest);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Mega api');
            });
            return _promise2.default.resolve();
        default:
            return (0, _utility.handleError)(new _utility.HoError('unknown playlist action!!!'));
    }
}

function handle_err(err, user, type) {
    var id = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

    (0, _utility.handleError)(err, type);
    (0, _sendWs2.default)((0, _assign2.default)({
        type: user.username,
        data: type + ' fail: ' + err.message
    }, id ? { zip: id } : {}), 0);
}

var startMega = function startMega(user, url, filePath, data) {
    var real = filePath + '/real';
    console.log(real);
    return new _promise2.default(function (resolve, reject) {
        return (0, _mkdirp2.default)(real, function (err) {
            return err ? megaComplete().then(function () {
                return reject(err);
            }) : resolve();
        });
    }).then(function () {
        var cmdline = 'megadl --no-progress --path "' + real + '" "' + url + '"';
        console.log(cmdline);
        return new _promise2.default(function (resolve, reject) {
            var chp = _child_process2.default.exec(cmdline, function (err, output) {
                return err ? megaComplete().then(function () {
                    return reject(err);
                }) : resolve(output);
            });
            return setLock('mega').then(function (go) {
                if (!go) {
                    return _promise2.default.resolve();
                }
                for (var i in mega_pool) {
                    if (url === mega_pool[i].url) {
                        mega_pool[i].chp = chp;
                        break;
                    }
                }
                mega_lock = false;
            }).then(function () {
                return chp;
            });
        }).then(function (output) {
            var playList = [];
            var megaFolder = function megaFolder(previous) {
                return (0, _fs.readdirSync)(real + '/' + previous).forEach(function (file, index) {
                    var next = previous === '' ? file : previous + '/' + file;
                    var curPath = real + '/' + next;
                    if ((0, _fs.lstatSync)(curPath).isDirectory()) {
                        megaFolder(next);
                    } else {
                        playList.push(next);
                    }
                });
            };
            megaFolder('');
            playList = (0, _utility.sortList)(playList);
            if (playList.length < 1) {
                megaComplete();
                return (0, _utility.handleError)(new _utility.HoError('mega empty'), data['errhandle']);
            }
            if (playList.length === 1) {
                (0, _fs.renameSync)(real + '/' + playList[0], filePath + '_t');
                (0, _utility.deleteFolderRecursive)(filePath);
                (0, _fs.renameSync)(filePath + '_t', filePath);
                megaComplete(true);
                if (data['rest']) {
                    return function () {
                        return new _promise2.default(function (resolve, reject) {
                            return setTimeout(function () {
                                return resolve();
                            }, 0);
                        }).then(function () {
                            return data['rest']([(0, _path.basename)(playList[0]), new _set2.default(['mega upload']), new _set2.default()]);
                        }).catch(function (err) {
                            return data['errhandle'](err);
                        });
                    };
                }
            } else {
                var _ret4 = function () {
                    var setTag = new _set2.default(['mega upload', 'playlist', '播放列表']);
                    var optTag = new _set2.default();
                    var recur_media = function recur_media(index) {
                        return new _promise2.default(function (resolve, reject) {
                            var stream = (0, _fs.createReadStream)(real + '/' + playList[index]);
                            stream.on('error', function (err) {
                                console.log('save mega error!!!');
                                return megaComplete().then(function () {
                                    return reject(err);
                                });
                            });
                            stream.on('close', function () {
                                return resolve();
                            });
                            stream.pipe((0, _fs.createWriteStream)(filePath + '/' + index + '_complete'));
                        }).then(function () {
                            var mediaType = (0, _mime.extType)(playList[index]);
                            if (mediaType) {
                                var mediaTag = (0, _mime.extTag)(mediaType['type']);
                                mediaTag.def.forEach(function (i) {
                                    return setTag.add(i);
                                });
                                mediaTag.opt.forEach(function (i) {
                                    return optTag.add(i);
                                });
                            }
                            index++;
                            if (index < playList.length) {
                                return recur_media(index);
                            } else {
                                (0, _utility.deleteFolderRecursive)((0, _path.dirname)(filePath) + '/mega');
                                megaComplete(true);
                                if (data['rest']) {
                                    return function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 0);
                                        }).then(function () {
                                            return data['rest']([(0, _path.basename)(playList[0]), setTag, optTag, {
                                                mega: encodeURIComponent(url),
                                                playList: playList
                                            }]);
                                        }).catch(function (err) {
                                            return data['errhandle'](err);
                                        });
                                    };
                                }
                            }
                        });
                    };
                    return {
                        v: recur_media(0)
                    };
                }();

                if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
            }
        });
    });
    function megaComplete() {
        var is_success = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

        return setLock('mega').then(function (go) {
            if (!go) {
                return _promise2.default.resolve();
            }
            console.log('mega kill');
            for (var i in mega_pool) {
                if (url === mega_pool[i].url) {
                    mega_pool[i].chp.kill('SIGKILL');
                    mega_pool.splice(i, 1);
                    if (!is_success) {
                        (0, _utility.deleteFolderRecursive)(mega_pool[i].filePath);
                    }
                    break;
                }
            }
            mega_lock = false;
            return _promise2.default.resolve();
        });
    }
};

var megaAdd = function megaAdd(user, url, filePath) {
    var data = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    return setLock('mega').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        var is_queue = false;
        var runNum = 0;
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = (0, _getIterator3.default)(mega_pool), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var i = _step.value;

                if (i.url === url) {
                    (function () {
                        is_queue = true;
                        filePath = i.filePath;
                        data = i.data;
                        var real = filePath + '/real';
                        console.log(real);
                        var filename = 'Mega file';
                        var size = 0;
                        var recur_size = function recur_size(previous) {
                            return (0, _fs.readdirSync)(real + '/' + previous).forEach(function (file, index) {
                                var next = previous === '' ? file : previous + '/' + file;
                                var curPath = real + '/' + next;
                                if ((0, _fs.lstatSync)(curPath).isDirectory()) {
                                    recur_size(next);
                                } else {
                                    size += (0, _fs.statSync)(curPath).size;
                                    if (filename === 'Mega file') {
                                        filename = next;
                                    }
                                }
                            });
                        };
                        if ((0, _fs.existsSync)(real)) {
                            recur_size('');
                            (0, _sendWs2.default)({
                                type: user.username,
                                data: filename + ': ' + Math.floor(size / 1024 / 1024 * 100) / 100 + 'MB'
                            }, 0);
                        }
                    })();
                }
                if (i.run) {
                    runNum++;
                }
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

        var is_run = runNum < (0, _config.MEGA_LIMIT)(_ver.ENV_TYPE) ? true : false;
        if (!is_run) {
            console.log('mega wait');
        }
        if (!is_queue) {
            mega_pool.push((0, _assign2.default)({
                user: user,
                url: url,
                filePath: filePath,
                time: Math.round(new Date().getTime() / 1000),
                data: data
            }, is_run ? {
                start: Math.round(new Date().getTime() / 1000),
                run: true
            } : { run: false }));
        }
        mega_lock = false;
        return is_run ? startMega(user, url, filePath, data) : _promise2.default.resolve();
    });
};

var startZip = function startZip(user, index, id, owner, name, pwd, zip_type) {
    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $set: { utime: Math.round(new Date().getTime() / 1000) } }).then(function (item) {
        var filePath = (0, _utility.getFileLocation)(owner, id);
        var comPath = filePath + '/' + index + '_complete';
        if ((0, _fs.existsSync)(comPath)) {
            return zipComplete();
        } else {
            var _ret6 = function () {
                var realPath = filePath + '/real';
                var regName = name.replace(/"/g, '\\"');
                var cmdline = (0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + filePath + '_zip ' + realPath + '  "' + regName + '"' + (pwd ? ' \'' + pwd + '\'' : '');
                if (zip_type === 2) {
                    cmdline = 'unrar x ' + filePath + '.1.rar ' + realPath + ' "' + regName + '"' + (pwd ? ' -p' + pwd : '');
                } else if (zip_type === 3) {
                    cmdline = '7za x ' + filePath + '_7z -o' + realPath + ' "' + regName + '"' + (pwd ? ' -p' + pwd : '');
                } else if (zip_type === 4) {
                    cmdline = (0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + filePath + '_zip_c ' + realPath + ' "' + regName + '"' + (pwd ? ' \'' + pwd + '\'' : '');
                } else if (zip_type === 5) {
                    cmdline = '7za x ' + filePath + '_7z_c -o' + realPath + ' "' + regName + '"' + (pwd ? ' -p' + pwd : '');
                }
                console.log(cmdline);
                var realName = realPath + '/' + name;
                var unReal = function unReal() {
                    return (0, _fs.existsSync)(realName) ? new _promise2.default(function (resolve, reject) {
                        return (0, _fs.unlink)(realName, function (err) {
                            return err ? zipComplete().then(function () {
                                return reject(err);
                            }) : resolve();
                        });
                    }) : _promise2.default.resolve();
                };
                return {
                    v: unReal().then(function () {
                        return new _promise2.default(function (resolve, reject) {
                            var chp = _child_process2.default.exec(cmdline, function (err, output) {
                                return err ? zipComplete().then(function () {
                                    return reject(err);
                                }) : resolve(output);
                            });
                            return setLock('zip').then(function (go) {
                                if (!go) {
                                    return _promise2.default.resolve();
                                }
                                for (var i in zip_pool) {
                                    if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                                        zip_pool[i].chp = chp;
                                        break;
                                    }
                                }
                                zip_lock = false;
                            }).then(function () {
                                return chp;
                            });
                        });
                    }).then(function (output) {
                        return new _promise2.default(function (resolve, reject) {
                            var stream = (0, _fs.createReadStream)(realName);
                            stream.on('error', function (err) {
                                return zipComplete().then(function () {
                                    return reject(err);
                                });
                            });
                            stream.on('close', function () {
                                return resolve(zipComplete(realName));
                            });
                            stream.pipe((0, _fs.createWriteStream)(comPath));
                        });
                    })
                };
            }();

            if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
        }
        function zipComplete() {
            var is_success = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            return setLock('zip').then(function (go) {
                if (!go) {
                    return _promise2.default.resolve();
                }
                console.log('zip complete');
                for (var i in zip_pool) {
                    if (id.equals(zip_pool[i].fileId) && zip_pool[i].index === index) {
                        zip_pool[i].chp.kill('SIGKILL');
                        zip_pool.splice(i, 1);
                        break;
                    }
                }
                zip_lock = false;
                if (is_success) {
                    if ((0, _mime.isVideo)(name) || (0, _mime.isDoc)(name) || (0, _mime.isZipbook)(name)) {
                        return _mediaHandleTool2.default.handleTag(is_success, {}, (0, _path.basename)(name), '', 0, false).then(function (_ref) {
                            var _ref2 = (0, _slicedToArray3.default)(_ref, 3),
                                mediaType = _ref2[0],
                                mediaTag = _ref2[1],
                                DBdata = _ref2[2];

                            mediaType['fileIndex'] = index;
                            mediaType['realPath'] = name;
                            DBdata['status'] = 9;
                            DBdata['mediaType.' + index] = mediaType;
                            console.log(DBdata);
                            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $set: DBdata }).then(function (item2) {
                                return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, id, user).catch(function (err) {
                                    return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, id, mediaType['fileIndex']);
                                });
                            });
                        });
                    }
                }
                return _promise2.default.resolve();
            });
        }
    });
};

function zipAdd(user, index, id, owner, name) {
    var pwd = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : '';

    var filePath = (0, _utility.getFileLocation)(owner, id);
    var zip_type = (0, _fs.existsSync)(filePath + '_zip_c') ? 4 : (0, _fs.existsSync)(filePath + '_7z_c') ? 5 : (0, _fs.existsSync)(filePath + '_zip') ? 1 : (0, _fs.existsSync)(filePath + '.1.rar') ? 2 : (0, _fs.existsSync)(filePath + '_7z') ? 3 : 0;
    if (!zip_type) {
        return (0, _utility.handleError)(new _utility.HoError('not zip'));
    }
    return setLock('zip').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        var is_queue = false;
        var runNum = 0;
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
            for (var _iterator2 = (0, _getIterator3.default)(zip_pool), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var i = _step2.value;

                if (id.equals(i.fileId) && i.index === index) {
                    is_queue = true;
                    var realName = filePath + '/real/' + i.name;
                    if ((0, _fs.existsSync)(realName)) {
                        (0, _sendWs2.default)({
                            type: user.username,
                            data: i.name + ': ' + Math.floor((0, _fs.statSync)(realName).size / 1024 / 1024 * 100) / 100 + 'MB'
                        }, 0);
                    }
                }
                if (i.run) {
                    runNum++;
                }
            }
        } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                }
            } finally {
                if (_didIteratorError2) {
                    throw _iteratorError2;
                }
            }
        }

        var is_run = runNum < (0, _config.ZIP_LIMIT)(_ver.ENV_TYPE) ? true : false;
        if (!is_run) {
            console.log('zip wait');
        }
        if (!is_queue) {
            zip_pool.push((0, _assign2.default)({
                index: index,
                user: user,
                time: Math.round(new Date().getTime() / 1000),
                fileId: id,
                fileOwner: owner,
                name: name,
                type: zip_type,
                pwd: pwd
            }, is_run ? {
                start: Math.round(new Date().getTime() / 1000),
                run: true
            } : { run: false }));
        }
        zip_lock = false;
        return is_run ? startZip(user, index, id, owner, name, pwd, zip_type) : _promise2.default.resolve();
    });
}

var startTorrent = function startTorrent(user, id, owner, index, hash, engine) {
    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $set: { utime: Math.round(new Date().getTime() / 1000) } }).then(function (item) {
        var filePath = (0, _utility.getFileLocation)(owner, id);
        var bufferPath = filePath + '/' + index;
        var comPath = bufferPath + '_complete';
        var playList = engine.files.map(function (file) {
            return file.path;
        });
        if (playList.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('empty content!!!'));
        }
        playList = (0, _utility.sortList)(playList);
        var tIndex = -1;
        for (var i in engine.files) {
            if (playList[index] === engine.files[i].path) {
                tIndex = i;
                break;
            }
        }
        if (tIndex < 0 || tIndex >= engine.files.length) {
            return torrentComplete().then(function () {
                return (0, _utility.handleError)(new _utility.HoError('unknown index'));
            });
        } else {
            var _ret7 = function () {
                var file = engine.files[tIndex];
                console.log(tIndex);
                console.log(file.name);
                console.log(file.length);
                console.log('torrent real start');
                console.log(bufferPath);
                if ((0, _fs.existsSync)(bufferPath)) {
                    var _ret8 = function () {
                        var size = (0, _fs.statSync)(bufferPath).size;
                        console.log(size);
                        return {
                            v: {
                                v: size >= file.length ? torrentComplete(true, file.path) : new _promise2.default(function (resolve, reject) {
                                    var fileStream = file.createReadStream({ start: size });
                                    fileStream.pipe((0, _fs.createWriteStream)(bufferPath, { flags: 'a' }));
                                    fileStream.on('end', function () {
                                        return resolve(torrentComplete(true, file.path));
                                    });
                                })
                            }
                        };
                    }();

                    if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
                } else {
                    if ((0, _mime.isVideo)(file.name)) {
                        new _promise2.default(function (resolve, reject) {
                            return (0, _osTorrentHash.computeHash)(tIndex, engine, function (err, hash_ret) {
                                return err ? reject(err) : resolve(hash_ret);
                            });
                        }).then(function (hash_ret) {
                            console.log(hash_ret);
                            var openSubtitles = new _opensubtitlesApi2.default('hoder agent v0.1');
                            return openSubtitles.search({
                                extensions: 'srt',
                                hash: hash_ret.movieHash,
                                filesize: hash_ret.fileSize
                            });
                        }).then(function (subtitles) {
                            console.log(subtitles);
                            var sub_url = subtitles.ze ? subtitles.ze.url : subtitles.zt ? subtitles.zt.url : subtitles.zh ? subtitles.zh.url : null;
                            var sub_en_url = subtitles.en ? subtitles.en.url : null;
                            function chsub() {
                                var lang = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';

                                var langExt = lang === 'en' ? '.en' : '';
                                if ((0, _fs.existsSync)('' + bufferPath + langExt + '.srt')) {
                                    (0, _fs.renameSync)('' + bufferPath + langExt + '.srt', bufferPath + '.srt1');
                                }
                                if ((0, _fs.existsSync)('' + bufferPath + langExt + '.ass')) {
                                    (0, _fs.renameSync)('' + bufferPath + langExt + '.ass', bufferPath + '.ass1');
                                }
                                if ((0, _fs.existsSync)('' + bufferPath + langExt + '.ssa')) {
                                    (0, _fs.renameSync)('' + bufferPath + langExt + '.ssa', bufferPath + '.ssa1');
                                }
                            }
                            var saveSub = function saveSub() {
                                var type = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';

                                if (type === 'en') {
                                    if (sub_en_url) {
                                        chsub('en');
                                        return (0, _apiTool2.default)('url', sub_en_url, { filePath: bufferPath + '.en.srt' }).then(function () {
                                            return (0, _utility.SRT2VTT)(bufferPath + '.en', 'srt');
                                        });
                                    }
                                } else {
                                    if (sub_url) {
                                        chsub();
                                        return (0, _apiTool2.default)('url', sub_url, { filePath: bufferPath + '.srt' }).then(function () {
                                            return (0, _utility.SRT2VTT)(bufferPath, 'srt');
                                        });
                                    }
                                }
                                return _promise2.default.resolve();
                            };
                            return saveSub().then(function () {
                                return saveSub('en');
                            }).then(function () {
                                (0, _sendWs2.default)({
                                    type: 'sub',
                                    data: id
                                }, 0, 0);
                                console.log('sub end');
                            });
                        }).catch(function (error) {
                            console.log('error:', error);
                            console.log('req headers:', error.req && error.req._header);
                            console.log('res code:', error.res && error.res.statusCode);
                            console.log('res body:', error.body);
                            (0, _utility.handleError)(error, 'Open srt');
                        });
                    }
                    return {
                        v: new _promise2.default(function (resolve, reject) {
                            var fileStream = file.createReadStream();
                            fileStream.pipe((0, _fs.createWriteStream)(bufferPath));
                            fileStream.on('end', function () {
                                return resolve(torrentComplete(true, file.path));
                            });
                        })
                    };
                }
            }();

            if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
        }
        function torrentComplete() {
            var is_success = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
            var exitPath = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : bufferPath;

            return setLock('torrent').then(function (go) {
                if (!go) {
                    return _promise2.default.resolve();
                }
                console.log('torrent complete');
                for (var _i2 in torrent_pool) {
                    if (torrent_pool[_i2].hash === hash) {
                        var pindex = torrent_pool[_i2].index.indexOf(index);
                        if (pindex !== -1) {
                            torrent_pool[_i2].index.splice(pindex, 1);
                        }
                        if (torrent_pool[_i2].index.length <= 0) {
                            if (torrent_pool[_i2].engine) {
                                torrent_pool[_i2].engine.destroy();
                            }
                            torrent_pool.splice(_i2, 1);
                        }
                        break;
                    }
                }
                torrent_lock = false;
                if (is_success) {
                    (0, _fs.renameSync)(bufferPath, comPath);
                    if ((0, _mime.isVideo)(exitPath) || (0, _mime.isDoc)(exitPath) || (0, _mime.isZipbook)(exitPath)) {
                        var dbPath = filePath + '/real/' + exitPath;
                        return _mediaHandleTool2.default.handleTag(dbPath, {}, (0, _path.basename)(exitPath), '', 0, false).then(function (_ref3) {
                            var _ref4 = (0, _slicedToArray3.default)(_ref3, 3),
                                mediaType = _ref4[0],
                                mediaTag = _ref4[1],
                                DBdata = _ref4[2];

                            mediaType['fileIndex'] = index;
                            mediaType['realPath'] = exitPath;
                            DBdata['status'] = 9;
                            DBdata['mediaType.' + index] = mediaType;
                            console.log(DBdata);
                            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $set: DBdata }).then(function (item2) {
                                return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, id, user).catch(function (err) {
                                    return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, id, mediaType['fileIndex']);
                                });
                            });
                        });
                    }
                }
                return _promise2.default.resolve();
            });
        }
    });
};

function torrentAdd(user, torrent, fileIndex, id, owner) {
    var pType = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : 0;

    var shortTorrent = torrent.match(/^[^&]+/);
    if (!shortTorrent) {
        return (0, _utility.handleError)(new _utility.HoError('not torrent'));
    }
    shortTorrent = shortTorrent[0];
    var filePath = (0, _utility.getFileLocation)(owner, id);
    var bufferPath = filePath + '/' + fileIndex;
    var is_queue = false;
    var engine = null;
    return setLock('torrent').then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        for (var i in torrent_pool) {
            if (torrent_pool[i].hash === shortTorrent) {
                is_queue = true;
                if ((0, _utility.checkAdmin)(1, user)) {
                    torrent_pool[i].user = user;
                }
                if (!torrent_pool[i].index.includes(fileIndex)) {
                    torrent_pool[i].index.push(fileIndex);
                    if (torrent_pool[i].engine) {
                        engine = torrent_pool[i].engine;
                    }
                } else {
                    if (torrent_pool[i].engine && torrent_pool[i].engine.files) {
                        if (pType === 1) {
                            var totalDSize = 0;
                            var totalSize = 0;
                            torrent_pool[i].engine.files.forEach(function (v, j) {
                                var DPath = filePath + '/' + j;
                                var CDPath = DPath + '_complete';
                                totalSize += v.length;
                                if ((0, _fs.existsSync)(CDPath)) {
                                    totalDSize += v.length;
                                } else if ((0, _fs.existsSync)(DPath)) {
                                    totalDSize += (0, _fs.statSync)(DPath).size;
                                }
                            });
                            var percent = totalSize > 0 ? Math.ceil(totalDSize / totalSize * 100) : 0;
                            (0, _sendWs2.default)({
                                type: user.username,
                                data: (torrent_pool[i].engine.torrent.name ? 'Playlist ' + torrent_pool[i].engine.torrent.name : 'Playlist torrent') + ': ' + percent + '%'
                            }, 0);
                        } else if (!pType) {
                            var playList = torrent_pool[i].engine.files.map(function (file) {
                                return file.path;
                            });
                            playList = (0, _utility.sortList)(playList);
                            var tIndex = -1;
                            for (var j in torrent_pool[i].engine.files) {
                                if (playList[fileIndex] === torrent_pool[i].engine.files[j].path) {
                                    tIndex = j;
                                    break;
                                }
                            }
                            if (torrent_pool[i].engine.files[tIndex]) {
                                var _percent = 0;
                                if ((0, _fs.existsSync)(bufferPath)) {
                                    if (torrent_pool[i].engine.files[tIndex].length > 0) {
                                        _percent = Math.ceil((0, _fs.statSync)(bufferPath).size / torrent_pool[i].engine.files[tIndex].length * 100);
                                    }
                                }
                                console.log(_percent);
                                (0, _sendWs2.default)({
                                    type: user.username,
                                    data: torrent_pool[i].engine.files[tIndex].path + ': ' + _percent + '%'
                                }, 0);
                            }
                        }
                    }
                    torrent_lock = false;
                    return _promise2.default.resolve();
                }
                break;
            }
        }
        var comPath = bufferPath + '_complete';
        var startEngine = function startEngine(index) {
            return engine ? engine.files && engine.files.length > 0 ? startTorrent(user, id, owner, index, shortTorrent, engine) : new _promise2.default(function (resolve, reject) {
                return engine.on('ready', function () {
                    console.log('torrent ready');
                    return resolve(startTorrent(user, id, owner, index, shortTorrent, engine));
                });
            }) : _promise2.default.resolve();
        };
        if (engine) {
            torrent_lock = false;
            console.log('torrent go');
            return startEngine(fileIndex);
        } else {
            var _ret9 = function () {
                var runNum = 0;
                torrent_pool.forEach(function (v) {
                    if (v.engine) {
                        runNum++;
                    }
                });
                //prem 1 可插隊
                if ((0, _utility.checkAdmin)(1, user)) {
                    runNum = 0;
                    torrent_pool.forEach(function (v) {
                        if (v.engine && (0, _utility.checkAdmin)(1, v.user)) {
                            runNum++;
                        }
                    });
                }
                if (runNum < (0, _config.TORRENT_LIMIT)(_ver.ENV_TYPE)) {
                    var _ret10 = function () {
                        engine = (0, _torrentStream2.default)(torrent, {
                            tmp: (0, _config.NAS_TMP)(_ver.ENV_TYPE),
                            path: filePath + '/real',
                            connections: _constants.TORRENT_CONNECT,
                            uploads: _constants.TORRENT_UPLOAD
                        });
                        console.log('new engine');
                        var rest = function rest() {
                            return setLock('torrent').then(function (go) {
                                if (!go) {
                                    return _promise2.default.resolve();
                                }
                                //剔除超過的
                                runNum = 0;
                                torrent_pool.forEach(function (v) {
                                    if (v.engine) {
                                        runNum++;
                                    }
                                });
                                if (runNum > (0, _config.TORRENT_LIMIT)(_ver.ENV_TYPE)) {
                                    (function () {
                                        var time = 0;
                                        var out_shortTorrent = null;
                                        torrent_pool.forEach(function (v) {
                                            if (v.engine && !(0, _utility.checkAdmin)(1, v.user)) {
                                                if (time < v.time) {
                                                    time = v.time;
                                                    out_shortTorrent = v.hash;
                                                }
                                            }
                                        });
                                        console.log('torrent kick');
                                        console.log(time);
                                        console.log(out_shortTorrent);
                                        for (var _i3 in torrent_pool) {
                                            if (out_shortTorrent === torrent_pool[_i3].hash) {
                                                if (torrent_pool[_i3].engine) {
                                                    torrent_pool[_i3].engine.destroy();
                                                    torrent_pool[_i3].engine = null;
                                                }
                                            }
                                        }
                                    })();
                                }
                                torrent_lock = false;
                                return _promise2.default.resolve(true);
                            });
                        };
                        if (!is_queue) {
                            console.log('torrent new');
                            torrent_pool.push({
                                hash: shortTorrent,
                                index: [fileIndex],
                                user: user,
                                time: Math.round(new Date().getTime() / 1000),
                                fileId: id,
                                fileOwner: owner,
                                torrent: torrent,
                                start: Math.round(new Date().getTime() / 1000),
                                engine: engine
                            });
                            torrent_lock = false;
                            return {
                                v: {
                                    v: startEngine(fileIndex).then(function () {
                                        return rest();
                                    })
                                }
                            };
                        } else {
                            console.log('torrent old');
                            for (var _i4 in torrent_pool) {
                                if (torrent_pool[_i4].hash === shortTorrent) {
                                    torrent_pool[_i4].engine = engine;
                                    var runIndex = torrent_pool[_i4].index;
                                    torrent_lock = false;
                                    return {
                                        v: {
                                            v: _promise2.default.all(runIndex.map(function (v) {
                                                return startEngine(v);
                                            })).then(function () {
                                                return rest();
                                            })
                                        }
                                    };
                                }
                            }
                            torrent_lock = false;
                        }
                    }();

                    if ((typeof _ret10 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret10)) === "object") return _ret10.v;
                } else {
                    console.log('torrent wait');
                    if (!is_queue) {
                        console.log('torrent new');
                        torrent_pool.push({
                            hash: shortTorrent,
                            index: [fileIndex],
                            user: user,
                            time: Math.round(new Date().getTime() / 1000),
                            fileId: id,
                            fileOwner: owner,
                            torrent: torrent,
                            engine: null
                        });
                    }
                    torrent_lock = false;
                    return {
                        v: _promise2.default.resolve(false)
                    };
                }
            }();

            if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
        }
    });
}

function torrentInfo(magnet, filePath) {
    var engine = (0, _torrentStream2.default)(magnet, {
        tmp: (0, _config.NAS_TMP)(_ver.ENV_TYPE),
        path: filePath + '/real',
        connections: _constants.TORRENT_CONNECT,
        uploads: _constants.TORRENT_UPLOAD
    });
    return new _promise2.default(function (resolve, reject) {
        return engine.on('ready', function () {
            var data = {
                files: engine.files,
                name: engine.torrent.name ? engine.torrent.name : 'torrent'
            };
            engine.destroy();
            return resolve(data);
        });
    });
}

function torrentStop(user) {
    var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    if (user) {
        torrent_pool.forEach(function (i) {
            if (user._id.equals(i.user._id)) {
                console.log('engine stop');
                console.log(i);
                if (i.engine) {
                    i.engine.destroy();
                }
                for (var j in torrent_pool) {
                    if (torrent_pool[j].hash === i.hash) {
                        torrent_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(torrent_pool[index]);
        if (torrent_pool[index].engine) {
            torrent_pool[index].engine.destroy();
        }
        for (var j in torrent_pool) {
            if (torrent_pool[j].hash === torrent_pool[index].hash) {
                torrent_pool.splice(j, 1);
                break;
            }
        }
    }
    return _promise2.default.resolve();
}

function zipStop(user) {
    var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    if (user) {
        zip_pool.forEach(function (i) {
            if (user._id.equals(i.user._id)) {
                console.log('zip stop');
                console.log(i);
                if (i.run) {
                    i.chp.kill('SIGKILL');
                }
                for (var j in zip_pool) {
                    if (i.fileId.equals(zip_pool[j].fileId)) {
                        zip_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(zip_pool[index]);
        if (zip_pool[index].run) {
            zip_pool[index].chp.kill('SIGKILL');
        }
        for (var j in zip_pool) {
            if (zip_pool[index].fileId.equals(zip_pool[j].fileId)) {
                zip_pool.splice(j, 1);
                break;
            }
        }
    }
    return _promise2.default.resolve();
}

function megaStop(user) {
    var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    if (user) {
        mega_pool.forEach(function (i) {
            if (user._id.equals(i.user._id)) {
                console.log('mega stop');
                console.log(i);
                if (i.run) {
                    i.chp.kill('SIGKILL');
                }
                (0, _utility.deleteFolderRecursive)(i.filePath);
                for (var j in mega_pool) {
                    if (i.url === mega_pool[j].url) {
                        mega_pool.splice(j, 1);
                        break;
                    }
                }
            }
        });
    } else {
        console.log(mega_pool[index]);
        if (mega_pool[index].run) {
            mega_pool[index].chp.kill('SIGKILL');
            (0, _utility.deleteFolderRecursive)(mega_pool[index].filePath);
        }
        for (var j in mega_pool) {
            if (mega_pool[index].url === mega_pool[j].url) {
                mega_pool.splice(j, 1);
                break;
            }
        }
    }
    return _promise2.default.resolve();
}

function playlistKick() {
    var kickTorrent = function kickTorrent() {
        var kick_time = Math.round((new Date().getTime() - _constants.TORRENT_DURATION * 1000) / 1000);
        for (var i in torrent_pool) {
            if (torrent_pool[i].engine && torrent_pool[i].start < kick_time) {
                return process('torrent stop', null, i);
            }
        }
        return _promise2.default.resolve();
    };
    var kickZip = function kickZip() {
        var kick_time = Math.round((new Date().getTime() - _constants.ZIP_DURATION * 1000) / 1000);
        for (var i in zip_pool) {
            if (zip_pool[i].run && zip_pool[i].time < kick_time) {
                return process('zip stop', null, i);
            }
        }
        return _promise2.default.resolve();
    };
    var kickMega = function kickMega() {
        var kick_time = Math.round((new Date().getTime() - _constants.MEGA_DURATION * 1000) / 1000);
        for (var i in mega_pool) {
            if (mega_pool[i].run && mega_pool[i].time < kick_time) {
                return process('mega stop', null, i);
            }
        }
        return _promise2.default.resolve();
    };
    return kickTorrent().then(function () {
        return kickZip();
    }).then(function () {
        return kickMega();
    });
}
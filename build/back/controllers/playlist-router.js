'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _avconv = require('avconv');

var _avconv2 = _interopRequireDefault(_avconv);

var _path = require('path');

var _fs = require('fs');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _apiToolPlaylist = require('../models/api-tool-playlist');

var _apiToolPlaylist2 = _interopRequireDefault(_apiToolPlaylist);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.put('/join', function (req, res, next) {
    console.log('join playlist');
    var uids = [];
    req.body.uids.forEach(function (i) {
        var id = (0, _utility.isValidString)(i, 'uid');
        if (id) {
            uids.push(id);
        }
    });
    if (uids.length < 2) {
        return (0, _utility.handleError)(new _utility.HoError('must large than one split'), next);
    }
    var join_items = [];
    _promise2.default.all(uids.map(function (u) {
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: u }, { limit: 1 });
    })).then(function (items) {
        var join_items = [];
        items.forEach(function (i) {
            if (i.length > 0) {
                join_items.push(i[0]);
            }
        });
        if (join_items.length < 2) {
            return (0, _utility.handleError)(new _utility.HoError('must large than one split'));
        }
        return join_items;
    }).then(function (join_items) {
        var main_match = false;
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = (0, _getIterator3.default)(join_items), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var i = _step.value;

                main_match = i['name'].match(/^(.*)\.(part0*1\.(rar)|(7z)\.0*1|(zip)\.0*1)$/i);
                if (main_match) {
                    break;
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

        if (!main_match) {
            return (0, _utility.handleError)(new _utility.HoError('need the first split'));
        }
        var zip_type = main_match[3] ? 2 : main_match[4] ? 3 : 1;
        var pattern = zip_type === 2 ? new RegExp('\\.part(\\d+)\\.rar' + '$', 'i') : zip_type === 3 ? new RegExp('\\.7z\\.(\\d+)' + '$', 'i') : new RegExp('\\.zip\\.(\\d+)' + '$', 'i');
        var order_items = {};
        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
            for (var _iterator2 = (0, _getIterator3.default)(join_items), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var _i = _step2.value;

                if (_i['name'].substr(0, main_match[1].length) === main_match[1]) {
                    var sub_match = _i['name'].match(pattern);
                    if (sub_match) {
                        order_items[Number(sub_match[1])] = _i;
                    }
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

        if ((0, _keys2.default)(order_items).length < 2) {
            return (0, _utility.handleError)(new _utility.HoError('must large than one split'));
        }
        return [order_items, zip_type];
    }).then(function (_ref) {
        var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
            order_items = _ref2[0],
            zip_type = _ref2[1];

        StorageTagTool.setLatest(order_items[1]._id, req.session).then(function () {
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: order_items[1]._id }, { $inc: { count: 1 } });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, 'Set latest');
        });
        if (zip_type === 2) {
            var _ret = function () {
                var recur_copy = function recur_copy(index) {
                    if (order_items[index]) {
                        var _ret2 = function () {
                            var filePath = (0, _utility.getFileLocation)(order_items[index].owner, order_items[index]._id) + '.1.rar';
                            if (!(0, _fs.existsSync)(filePath)) {
                                filePath = (0, _utility.getFileLocation)(order_items[index].owner, order_items[index]._id);
                            }
                            var stream = (0, _fs.createReadStream)(filePath);
                            return {
                                v: new _promise2.default(function (resolve, reject) {
                                    stream.on('error', function (err) {
                                        console.log('copy file:' + filePath + ' error!!!');
                                        return reject(err);
                                    });
                                    stream.on('close', function () {
                                        index++;
                                        return index <= (0, _keys2.default)(order_items).length ? resolve(recur_copy(index)) : resolve();
                                    });
                                    stream.pipe((0, _fs.createWriteStream)(filePath1 + '.' + index + '.rar'));
                                })
                            };
                        }();

                        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                    }
                };

                //copy
                var filePath1 = (0, _utility.getFileLocation)(order_items[1].owner, order_items[1]._id);

                var mediaType = (0, _mime.extType)(order_items[1]['name']);
                return {
                    v: recur_copy(2).then(function () {
                        return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath1, order_items[1]._id, req.user).then(function () {
                            return res.json({
                                id: order_items[1]._id,
                                name: order_items[1].name
                            });
                        }).catch(function (err) {
                            return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, order_items[1]._id, mediaType['fileIndex']);
                        });
                    })
                };
            }();

            if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
        } else {
            var _ret3 = function () {
                //cat
                var ext = zip_type === 3 ? '_7z' : '_zip';
                var cmdline = 'cat';
                for (var i = 1; i <= (0, _keys2.default)(order_items).length; i++) {
                    if (order_items[i]) {
                        var joinPath = '' + (0, _utility.getFileLocation)(order_items[i].owner, order_items[i]._id) + ext;
                        if (!(0, _fs.existsSync)(joinPath)) {
                            joinPath = (0, _utility.getFileLocation)(order_items[i].owner, order_items[i]._id);
                        }
                        cmdline = cmdline + ' ' + joinPath;
                    } else {
                        break;
                    }
                }
                var filePath = (0, _utility.getFileLocation)(order_items[1].owner, order_items[1]._id);
                var cFilePath = '' + filePath + ext + '_c';
                cmdline = cmdline + ' >> ' + cFilePath;
                console.log(cmdline);
                var unlinkC = function unlinkC() {
                    return (0, _fs.existsSync)(cFilePath) ? new _promise2.default(function (resolve, reject) {
                        return (0, _fs.unlink)(cFilePath, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    }) : _promise2.default.resolve();
                };
                var mediaType = (0, _mime.extType)(order_items[1]['name']);
                return {
                    v: unlinkC().then(function () {
                        return new _promise2.default(function (resolve, reject) {
                            return _child_process2.default.exec(cmdline, function (err, output) {
                                return err ? reject(err) : resolve(output);
                            });
                        });
                    }).then(function (output) {
                        return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, order_items[1]._id, req.user).then(function () {
                            return res.json({
                                id: order_items[1]._id,
                                name: order_items[1].name
                            });
                        }).catch(function (err) {
                            return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, order_items[1]._id, mediaType['fileIndex']);
                        });
                    })
                };
            }();

            if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
        }
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/copy/:uid/:index(\\d+)', function (req, res, next) {
    console.log('torrent copy');
    var index = Number(req.params.index);
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
        if (items.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('torrent can not be found!!!'));
        }
        if (items[0].status !== 9) {
            return (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
        }
        if (!items[0].playList[index]) {
            return (0, _utility.handleError)(new _utility.HoError('torrent index can not be found!!!'));
        }
        var origPath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id) + '/' + index + '_complete';
        if (!(0, _fs.existsSync)(origPath)) {
            return (0, _utility.handleError)(new _utility.HoError('please download first!!!'));
        }
        var oOID = (0, _mongoTool.objectID)();
        var filePath = (0, _utility.getFileLocation)(req.user._id, oOID);
        var folderPath = (0, _path.dirname)(filePath);
        var mkfolder = function mkfolder() {
            return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                return Mkdirp(folderPath, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        };
        return mkfolder().then(function () {
            return new _promise2.default(function (resolve, reject) {
                var stream = (0, _fs.createReadStream)(origPath);
                stream.on('error', function (err) {
                    return reject(err);
                });
                stream.on('close', function () {
                    return resolve();
                });
                stream.pipe((0, _fs.createWriteStream)(filePath));
            });
        }).then(function () {
            var name = (0, _utility.toValidName)((0, _path.basename)(items[0].playList[index]));
            if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                name = (0, _mime.addPost)(name, '1');
            }
            return _mediaHandleTool2.default.handleTag(filePath, {
                _id: oOID,
                name: name,
                owner: req.user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size: (0, _fs.statSync)(origPath)['size'],
                count: 0,
                first: 1,
                recycle: 0,
                adultonly: (0, _utility.checkAdmin)(2, req.user) && items[0]['adultonly'] === 1 ? 1 : 0,
                untag: 1,
                status: 0
            }, name, '', 0).then(function (_ref3) {
                var _ref4 = (0, _slicedToArray3.default)(_ref3, 3),
                    mediaType = _ref4[0],
                    mediaTag = _ref4[1],
                    DBdata = _ref4[2];

                var isPreview = function isPreview() {
                    return mediaType.type === 'video' ? new _promise2.default(function (resolve, reject) {
                        var is_preview = true;
                        (0, _avconv2.default)(['-i', filePath]).once('exit', function (exitCode, signal, metadata2) {
                            if (metadata2 && metadata2.input && metadata2.input.stream) {
                                var _iteratorNormalCompletion3 = true;
                                var _didIteratorError3 = false;
                                var _iteratorError3 = undefined;

                                try {
                                    for (var _iterator3 = (0, _getIterator3.default)(metadata2.input.stream[0]), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                        var m = _step3.value;

                                        console.log(m.type);
                                        console.log(m.codec);
                                        if (m.type === 'video' && m.codec !== 'h264') {
                                            is_preview = false;
                                            break;
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError3 = true;
                                    _iteratorError3 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                            _iterator3.return();
                                        }
                                    } finally {
                                        if (_didIteratorError3) {
                                            throw _iteratorError3;
                                        }
                                    }
                                }
                            }
                            if (is_preview) {
                                DBdata['status'] = 3;
                                if (mediaType.ext === 'mp4') {
                                    mediaType = false;
                                    if ((0, _fs.existsSync)(origPath + '_s.jpg')) {
                                        new _promise2.default(function (resolve, reject) {
                                            var streamJpg = (0, _fs.createReadStream)(origPath + '_s.jpg');
                                            streamJpg.on('error', function (err) {
                                                return reject(err);
                                            });
                                            streamJpg.pipe((0, _fs.createWriteStream)(filePath + '_s.jpg'));
                                        }).catch(function (err) {
                                            return (0, _utility.handleError)(err, 'Save jpg');
                                        });
                                    }
                                }
                            }
                            return resolve();
                        });
                    }) : _promise2.default.resolve();
                };
                return isPreview().then(function () {
                    var setTag = new _set2.default();
                    var optTag = new _set2.default();
                    setTag.add((0, _tagTool.normalize)(DBdata['name'])).add((0, _tagTool.normalize)(req.user.username));
                    if (req.body.path) {
                        req.body.path.forEach(function (p) {
                            return setTag.add((0, _tagTool.normalize)(p));
                        });
                    }
                    if (items[0].tags) {
                        items[0].tags.forEach(function (i) {
                            if (i !== '壓縮檔' && i !== 'zip' && i !== '播放列表' && i !== 'playlist') {
                                setTag.add((0, _tagTool.normalize)(i));
                            }
                        });
                    }
                    mediaTag.def.forEach(function (i) {
                        return setTag.add((0, _tagTool.normalize)(i));
                    });
                    mediaTag.opt.forEach(function (i) {
                        return optTag.add((0, _tagTool.normalize)(i));
                    });
                    var setArr = [];
                    setTag.forEach(function (s) {
                        var is_d = (0, _tagTool.isDefaultTag)(s);
                        if (!is_d) {
                            setArr.push(s);
                        } else if (is_d.index === 0) {
                            DBdata['adultonly'] = 1;
                        }
                    });
                    var optArr = [];
                    optTag.forEach(function (o) {
                        if (!(0, _tagTool.isDefaultTag)(o) && !setArr.includes(o)) {
                            optArr.push(o);
                        }
                    });
                    return (0, _mongoTool2.default)('insert', _constants.STORAGEDB, (0, _assign2.default)(DBdata, (0, _defineProperty3.default)({
                        tags: setArr
                    }, req.user._id, setArr))).then(function (item) {
                        console.log(item);
                        console.log('save end');
                        (0, _sendWs2.default)({
                            type: 'file',
                            data: item[0]._id
                        }, item[0].adultonly);
                        return StorageTagTool.getRelativeTag(setArr, req.user, optArr).then(function (relative) {
                            var reli = relative.length < 5 ? relative.length : 5;
                            if ((0, _utility.checkAdmin)(2, req.user)) {
                                item[0].adultonly === 1 ? setArr.push('18+') : optArr.push('18+');
                            }
                            item[0].first === 1 ? setArr.push('first item') : optArr.push('first item');
                            for (var i = 0; i < reli; i++) {
                                var normal = (0, _tagTool.normalize)(relative[i]);
                                if (!(0, _tagTool.isDefaultTag)(normal)) {
                                    if (!setArr.includes(normal) && !optArr.includes(normal)) {
                                        optArr.push(normal);
                                    }
                                }
                            }
                            return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, item[0]['_id'], req.user).then(function () {
                                return res.json({
                                    id: item[0]._id,
                                    name: item[0].name,
                                    select: setArr,
                                    option: (0, _mime.supplyTag)(setArr, optArr),
                                    other: []
                                });
                            }).catch(function (err) {
                                return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, item[0]['_id'], mediaType['fileIndex']);
                            });
                        });
                    });
                });
            });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/all/download/:uid', function (req, res, next) {
    console.log('torrent all downlad');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
        if (items.length === 0) {
            return (0, _utility.handleError)(new _utility.HoError('playlist can not be fund!!!'));
        }
        var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
        var queueItems = [];
        for (var i in items[0]['playList']) {
            var bufferPath = filePath + '/' + i;
            if ((0, _fs.existsSync)(bufferPath + '_complete')) {
                continue;
            } else if ((0, _fs.existsSync)(bufferPath + '_error')) {
                continue;
            } else {
                queueItems.push(i);
            }
        }
        StorageTagTool.setLatest(items[0]._id, req.session).then(function () {
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $inc: { count: 1 } });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, 'Set latest');
        });
        if (queueItems.length > 0) {
            var _ret4 = function () {
                console.log(queueItems);
                var recur_queue = function recur_queue(index, pType) {
                    var qt = function qt() {
                        return items[0]['magnet'] ? (0, _apiToolPlaylist2.default)('torrent add', req.user, decodeURIComponent(items[0]['magnet']), queueItems[index], items[0]._id, items[0].owner, pType) : (0, _apiToolPlaylist2.default)('zip add', req.user, queueItems[index], items[0]._id, items[0].owner, items[0]['playList'][queueItems[index]], items[0].pwd);
                    };
                    return qt().then(function () {
                        index++;
                        if (index < queueItems.length) {
                            return recur_queue(index, 2);
                        }
                    });
                };
                return {
                    v: recur_queue(0, 1).then(function () {
                        return res.json({ complete: false });
                    })
                };
            }();

            if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
        } else {
            res.json({ complete: true });
        }
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/check/:uid/:index(\\d+|v)/:size(\\d+)', function (req, res, next) {
    console.log('torrent check');
    var index = !isNaN(req.params.index) ? Number(req.params.index) : 0;
    var bufferSize = Number(req.params.size);
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
        if (items.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('torrent can not be fund!!!'));
        }
        if (req.params.index === 'v') {
            for (var i in items[0]['playList']) {
                if ((0, _mime.isVideo)(items[0]['playList'][i])) {
                    index = Number(i);
                    break;
                }
            }
        }
        var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
        var bufferPath = filePath + '/' + index;
        if ((0, _fs.existsSync)(bufferPath + '_error')) {
            return (0, _utility.handleError)(new _utility.HoError('torrent video error!!!'));
        }
        var realPath = filePath + '/real/' + items[0]['playList'][index];
        var comPath = bufferPath + '_complete';
        var qt = function qt() {
            return items[0]['magnet'] ? (0, _apiToolPlaylist2.default)('torrent add', req.user, decodeURIComponent(items[0]['magnet']), index, items[0]._id, items[0].owner) : (0, _apiToolPlaylist2.default)('zip add', req.user, index, items[0]._id, items[0].owner, items[0]['playList'][index], items[0].pwd);
        };
        if ((0, _fs.existsSync)(comPath)) {
            res.json({
                newBuffer: true,
                complete: true,
                ret_size: (0, _fs.statSync)(comPath).size
            });
        } else if ((0, _fs.existsSync)(bufferPath)) {
            var total = (0, _fs.statSync)(bufferPath).size;
            console.log(total);
            res.json({
                newBuffer: total > bufferSize + 10 * 1024 * 1024 ? true : false,
                complete: false,
                ret_size: total
            });
            return qt();
        } else {
            res.json({ start: true });
            return qt();
        }
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;
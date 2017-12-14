'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _fs = require('fs');

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

var _mime = require('../util/mime');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.put('/edit/:uid', function (req, res, next) {
    console.log('edit file');
    _mediaHandleTool2.default.editFile(req.params.uid, req.body.name, req.user).then(function (result) {
        StorageTagTool.setLatest(result.id, req.session).then(function () {
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: result.id }, { $inc: { count: 1 } });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, 'Set latest');
        });
        (0, _sendWs2.default)({
            type: 'file',
            data: result.id
        }, result.adultonly);
        res.json((0, _assign2.default)(result, {
            adultonly: null,
            option: (0, _mime.supplyTag)(result.select, result.option, result.other)
        }));
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/del/:uid/:recycle', function (req, res, next) {
    console.log('del file');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
        if (items.length === 0) {
            return (0, _utility.handleError)(new _utility.HoError('file can not be fund!!!'));
        }
        var rest = function rest() {
            return (0, _mongoTool2.default)('remove', _constants.STORAGEDB, {
                _id: items[0]._id,
                $isolated: 1
            }).then(function (item2) {
                console.log('perm delete file');
                (0, _sendWs2.default)({
                    type: 'file',
                    data: items[0]._id
                }, 1, 1);
                res.json({ apiOK: true });
            });
        };
        var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
        if (req.params.recycle === '1' && (0, _utility.checkAdmin)(1, req.user)) {
            if (items[0].recycle !== 1) {
                return (0, _utility.handleError)(new _utility.HoError('recycle file first!!!'));
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return rest();
            } else if (items[0].status === 9) {
                (0, _utility.deleteFolderRecursive)(filePath);
                var zip_filePath = (0, _fs.existsSync)(filePath + '_zip') ? filePath + '_zip' : (0, _fs.existsSync)(filePath + '_7z') ? filePath + '_7z' : (0, _fs.existsSync)(filePath + '.1.rar') ? filePath + '.1.rar' : null;
                if (zip_filePath) {
                    var del_arr = [zip_filePath];
                    if ((0, _fs.existsSync)(filePath + '_zip_c')) {
                        del_arr.push(filePath + '_zip_c');
                    } else if ((0, _fs.existsSync)(filePath + '_7z_c')) {
                        del_arr.push(filePath + '_7z_c');
                    } else {
                        var rIndex = 2;
                        while ((0, _fs.existsSync)(filePath + '.' + rIndex + '.rar')) {
                            del_arr.push(filePath + '.' + rIndex + '.rar');
                            rIndex++;
                        }
                    }
                    console.log(del_arr);
                    return _promise2.default.all(del_arr.map(function (d) {
                        return new _promise2.default(function (resolve, reject) {
                            return (0, _fs.unlink)(d, function (err) {
                                return err ? reject(err) : resolve();
                            });
                        });
                    })).then(function () {
                        return rest();
                    });
                } else {
                    return rest();
                }
            } else {
                var _del_arr = [filePath];
                if ((0, _fs.existsSync)(filePath + '.jpg')) {
                    _del_arr.push(filePath + '.jpg');
                }
                if ((0, _fs.existsSync)(filePath + '_s.jpg')) {
                    _del_arr.push(filePath + '_s.jpg');
                }
                if ((0, _fs.existsSync)(filePath + '.srt')) {
                    _del_arr.push(filePath + '.srt');
                }
                if ((0, _fs.existsSync)(filePath + '.srt1')) {
                    _del_arr.push(filePath + '.srt1');
                }
                if ((0, _fs.existsSync)(filePath + '.ass')) {
                    _del_arr.push(filePath + '.ass');
                }
                if ((0, _fs.existsSync)(filePath + '.ass1')) {
                    _del_arr.push(filePath + '.ass1');
                }
                if ((0, _fs.existsSync)(filePath + '.ssa')) {
                    _del_arr.push(filePath + '.ssa');
                }
                if ((0, _fs.existsSync)(filePath + '.ssa1')) {
                    _del_arr.push(filePath + '.ssa1');
                }
                if ((0, _fs.existsSync)(filePath + '.vtt')) {
                    _del_arr.push(filePath + '.vtt');
                }
                console.log(_del_arr);
                (0, _utility.deleteFolderRecursive)(filePath + '_doc');
                (0, _utility.deleteFolderRecursive)(filePath + '_img');
                (0, _utility.deleteFolderRecursive)(filePath + '_present');
                (0, _utility.deleteFolderRecursive)(filePath + '_sub');
                return _promise2.default.all(_del_arr.map(function (d) {
                    return new _promise2.default(function (resolve, reject) {
                        return (0, _fs.unlink)(d, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    });
                })).then(function () {
                    return rest();
                });
            }
        } else {
            if (!(0, _utility.checkAdmin)(1, req.user) && (!(0, _utility.isValidString)(items[0].owner, 'uid') || !req.user._id.equals(items[0].owner))) {
                return (0, _utility.handleError)(new _utility.HoError('file is not yours!!!'));
            }
            return recur_backup(1).then(function () {
                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $set: {
                        recycle: 1,
                        utime: Math.round(new Date().getTime() / 1000)
                    } }).then(function (item2) {
                    (0, _sendWs2.default)({
                        type: 'file',
                        data: items[0]._id
                    }, items[0].adultonly);
                    res.json({ apiOK: true });
                });
            });
        }
        function recur_backup(recycle) {
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                return _promise2.default.resolve();
            } else if (items[0].status === 9) {
                var _ret = function () {
                    var recur_playlist_backup = function recur_playlist_backup(index) {
                        var bufferPath = filePath + '/' + index;
                        var rest2 = function rest2() {
                            index++;
                            if (index < total_file) {
                                return recur_playlist_backup(index);
                            } else {
                                recycle++;
                                return recycle < 4 ? recur_backup(recycle) : _promise2.default.resolve();
                            }
                        };
                        return (0, _fs.existsSync)(bufferPath + '_complete') ? (0, _apiToolGoogle.googleBackup)(req.user, items[0]._id, items[0].playList[index], bufferPath, items[0].tags, recycle, '_complete').then(function () {
                            return rest2;
                        }) : rest2();
                    };

                    var total_file = items[0].playList.length;
                    if (total_file > 0) {
                        var _zip_filePath = (0, _fs.existsSync)(filePath + '_zip') ? filePath + '_zip' : (0, _fs.existsSync)(filePath + '_7z') ? filePath + '_7z' : (0, _fs.existsSync)(filePath + '.1.rar') ? filePath + '.1.rar' : null;
                        if (_zip_filePath) {
                            console.log(_zip_filePath);
                            return {
                                v: (0, _apiToolGoogle.googleBackup)(req.user, items[0]._id, items[0].name, _zip_filePath, items[0].tags, recycle).then(function () {
                                    return recur_playlist_backup(0);
                                })
                            };
                        } else {
                            return {
                                v: recur_playlist_backup(0)
                            };
                        }
                    } else {
                        return {
                            v: _promise2.default.resolve()
                        };
                    }
                }();

                if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
            } else {
                return (0, _apiToolGoogle.googleBackup)(req.user, items[0]._id, items[0].name, filePath, items[0].tags, recycle).then(function () {
                    recycle++;
                    if (recycle < 4) {
                        return recur_backup(recycle);
                    }
                });
            }
        }
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/media/:action(act|del)/:uid/:index(\\d+|v)?', function (req, res, next) {
    console.log('handle media');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        return (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
        console.log(items);
        if (items.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
        }
        if (!items[0].mediaType) {
            return (0, _utility.handleError)(new _utility.HoError('this file is not media!!!'));
        }

        var _ret2 = function () {
            switch (req.params.action) {
                case 'act':
                    var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
                    if (items[0].mediaType.type) {
                        var rest = function rest() {
                            return items[0].mediaType.key ? !items[0].mediaType.complete && new Date().getTime() / 1000 - items[0].utime > _constants.NOISE_TIME ? _mediaHandleTool2.default.handleMediaUpload(items[0].mediaType, filePath, items[0]._id, req.user, items[0].mediaType.key) : _mediaHandleTool2.default.handleMedia(items[0].mediaType, filePath, items[0]._id, items[0].mediaType.key, req.user) : _mediaHandleTool2.default.handleMediaUpload(items[0].mediaType, filePath, items[0]._id, req.user);
                        };
                        return {
                            v: rest().catch(function (err) {
                                return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, items[0]['_id'], items[0].mediaType['fileIndex']);
                            }).then(function () {
                                return res.json({ apiOK: true });
                            })
                        };
                    } else if (req.params.index) {
                        var _ret3 = function () {
                            if (req.params.index === 'v') {
                                for (var i in items[0]['playList']) {
                                    if ((0, _mime.isVideo)(items[0]['playList'][i])) {
                                        req.params.index = i;
                                        break;
                                    }
                                }
                            }
                            if (!(0, _fs.existsSync)(filePath + '/' + items[0].mediaType[req.params.index]['fileIndex'] + '_complete')) {
                                return {
                                    v: {
                                        v: (0, _utility.handleError)(new _utility.HoError('need complete first'))
                                    }
                                };
                            }
                            var fileIndex = false;
                            for (var _i in items[0].mediaType) {
                                if (Number(req.params.index) === items[0].mediaType[_i]['fileIndex']) {
                                    fileIndex = _i;
                                    break;
                                }
                            }
                            if (!fileIndex) {
                                return {
                                    v: {
                                        v: (0, _utility.handleError)(new _utility.HoError('cannot find media'))
                                    }
                                };
                            }
                            var rest = function rest() {
                                return items[0].mediaType[fileIndex].key ? !items[0].mediaType[fileIndex].complete && new Date().getTime() / 1000 - items[0].utime > _constants.NOISE_TIME ? _mediaHandleTool2.default.handleMediaUpload(items[0].mediaType[fileIndex], filePath, items[0]._id, req.user, items[0].mediaType[fileIndex].key) : _mediaHandleTool2.default.handleMedia(items[0].mediaType[fileIndex], filePath, items[0]._id, items[0].mediaType[fileIndex].key, req.user) : _mediaHandleTool2.default.handleMediaUpload(items[0].mediaType[fileIndex], filePath, items[0]._id, req.user);
                            };
                            return {
                                v: {
                                    v: rest().catch(function (err) {
                                        return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, items[0]['_id'], items[0].mediaType[fileIndex]['fileIndex']);
                                    }).then(function () {
                                        return res.json({ apiOK: true });
                                    })
                                }
                            };
                        }();

                        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                    } else {
                        var handleItems = [];
                        for (var i in items[0].mediaType) {
                            if ((0, _fs.existsSync)(filePath + '/' + items[0].mediaType[i]['fileIndex'] + '_complete')) {
                                handleItems.push(items[0].mediaType[i]);
                            }
                        }
                        if (handleItems.length < 1) {
                            return {
                                v: (0, _utility.handleError)(new _utility.HoError('need complete first'))
                            };
                        }
                        return {
                            v: _promise2.default.all(handleItems.map(function (m) {
                                return m.key ? !m.complete && new Date().getTime() / 1000 - items[0].utime > _constants.NOISE_TIME ? _mediaHandleTool2.default.handleMediaUpload(m, filePath, items[0]._id, req.user, m.key) : _mediaHandleTool2.default.handleMedia(m, filePath, items[0]._id, m.key, req.user).catch(function (err) {
                                    return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, items[0]['_id'], m['fileIndex']);
                                }) : _mediaHandleTool2.default.handleMediaUpload(m, filePath, items[0]._id, req.user).catch(function (err) {
                                    return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, items[0]['_id'], m['fileIndex']);
                                });
                            })).then(function () {
                                return res.json({ apiOK: true });
                            })
                        };
                    }
                case 'del':
                    if (items[0].mediaType.type) {
                        return {
                            v: (0, _mediaHandleTool.completeMedia)(items[0]._id, items[0].status === 1 ? 0 : items[0].status, items[0].mediaType['fileIndex']).then(function () {
                                return res.json({ apiOK: true });
                            })
                        };
                    } else {
                        var is_empty = true;
                        var _handleItems = [];
                        for (var _i2 in items[0].mediaType) {
                            is_empty = false;
                            if ((0, _fs.existsSync)((0, _utility.getFileLocation)(items[0].owner, items[0]._id) + '/' + items[0].mediaType[_i2]['fileIndex'] + '_complete')) {
                                _handleItems.push(items[0].mediaType[_i2]);
                            }
                        }
                        if (is_empty) {
                            return {
                                v: (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $unset: { mediaType: '' } }).then(function (item) {
                                    (0, _sendWs2.default)({
                                        type: 'file',
                                        data: items[0]._id
                                    }, items[0].adultonly);
                                    res.json({ apiOK: true });
                                })
                            };
                        }
                        if (_handleItems.length < 1) {
                            return {
                                v: (0, _utility.handleError)(new _utility.HoError('need complete first'))
                            };
                        }
                        return {
                            v: _promise2.default.all(_handleItems.map(function (m) {
                                return (0, _mediaHandleTool.completeMedia)(items[0]._id, 0, m['fileIndex']);
                            })).then(function () {
                                return res.json({ apiOK: true });
                            })
                        };
                    }
                default:
                    return {
                        v: (0, _utility.handleError)(new _utility.HoError('unknown action'))
                    };
            }
        }();

        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/feedback', function (req, res, next) {
    console.log('file feedback');
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
        untag: 1,
        owner: req.user._id
    }, {
        sort: ['utime', 'desc'],
        limit: 20
    }).then(function (items) {
        var getItem = function getItem() {
            return items.length < 1 && (0, _utility.checkAdmin)(1, req.user) ? (0, _mongoTool2.default)('find', _constants.STORAGEDB, { untag: 1 }, {
                sort: ['utime', 'desc'],
                limit: 20
            }) : _promise2.default.resolve(items);
        };
        return getItem().then(function (items) {
            var feedback_arr = [];
            var getFeedback = function getFeedback(item) {
                return _mediaHandleTool2.default.handleTag((0, _utility.getFileLocation)(item.owner, item._id), {
                    time: item.time,
                    height: item.height
                }, item.name, '', item.status).then(function (_ref) {
                    var _ref2 = (0, _slicedToArray3.default)(_ref, 3),
                        mediaType = _ref2[0],
                        mediaTag = _ref2[1],
                        DBdata = _ref2[2];

                    var temp_tag = [];
                    if (item.first === 1) {
                        item.tags.push('first item');
                    } else {
                        temp_tag.push('first item');
                    }
                    if (item.adultonly === 1) {
                        item.tags.push('18+');
                    } else {
                        if ((0, _utility.checkAdmin)(2, req.user)) {
                            temp_tag.push('18+');
                        }
                    }
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = (0, _getIterator3.default)(mediaTag.opt), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var _i3 = _step.value;

                            if (item.tags.indexOf(_i3) === -1) {
                                temp_tag.push(_i3);
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

                    temp_tag = (0, _mime.supplyTag)(item.tags, temp_tag);
                    if (!(0, _utility.checkAdmin)(1, req.user)) {
                        for (var i in item[req.user._id.toString()]) {
                            var index_tag = item.tags.indexOf(i);
                            if (index_tag !== -1) {
                                item.tags.splice(index_tag, 1);
                            }
                        }
                        return {
                            id: item._id,
                            name: item.name,
                            select: item[req.user._id.toString()],
                            option: temp_tag,
                            other: item.tags
                        };
                    } else {
                        return {
                            id: item._id,
                            name: item.name,
                            select: item.tags,
                            option: temp_tag,
                            other: []
                        };
                    }
                });
            };
            var recur_feedback = function recur_feedback(index) {
                return getFeedback(items[index]).then(function (feedback) {
                    feedback_arr.push(feedback);
                    index++;
                    if (index < items.length) {
                        return recur_feedback(index);
                    } else {
                        res.json({ feedbacks: feedback_arr });
                    }
                });
            };
            if (items.length < 1) {
                res.json({ feedbacks: feedback_arr });
            } else {
                return recur_feedback(0);
            }
        });
    });
});

exports.default = router;
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _fs = require('fs');

var _path = require('path');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _avconv = require('avconv');

var _avconv2 = _interopRequireDefault(_avconv);

var _readTorrent = require('read-torrent');

var _readTorrent2 = _interopRequireDefault(_readTorrent);

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

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

//1小時refresh一次
var stream_count = 0;
var stream_fresh = 3600;
var loop_fresh = function loop_fresh() {
    return new _promise2.default(function (resolve, reject) {
        stream_count = 0;
        setTimeout(function () {
            return resolve();
        }, stream_fresh * 1000);
    }).then(function () {
        return loop_fresh();
    });
};
loop_fresh();

router.get('/preview/:uid', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('preview file');
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1 || items[0].status !== 2 && items[0].status !== 3 && items[0].status !== 5 && items[0].status !== 6 && items[0].status !== 10) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            var previewPath = null;
            if (items[0].status === 5) {
                previewPath = _constants.STATIC_PATH + '/document.jpg';
            } else if (items[0].status === 6) {
                previewPath = _constants.STATIC_PATH + '/presentation.jpg';
            } else if (items[0].status === 10) {
                previewPath = _constants.STATIC_PATH + '/pdf.png';
            } else {
                var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
                if ((0, _fs.existsSync)(filePath + '_complete')) {
                    filePath = filePath + '_complete';
                }
                previewPath = '' + filePath + (items[0].status === 2 ? '.jpg' : '_s.jpg');
            }
            if (!(0, _fs.existsSync)(previewPath)) {
                console.log(previewPath);
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            (0, _fs.createReadStream)(previewPath).pipe(res);
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    });
});

router.get('/download/:uid', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('download file');
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length === 0) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
            console.log(filePath);
            var ret_string = null;
            if (items[0].status === 9) {
                if (items[0].magnet) {
                    ret_string = decodeURIComponent(items[0].magnet);
                } else if (items[0].mega) {
                    ret_string = decodeURIComponent(items[0].mega);
                } else {
                    filePath = (0, _fs.existsSync)(filePath + '_7z') ? filePath + '_7z' : (0, _fs.existsSync)(filePath + '.1.rar') ? filePath + '.1.rar' : filePath + '_zip';
                }
            }
            if (!(0, _fs.existsSync)(filePath) && !ret_string) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            StorageTagTool.setLatest(items[0]._id, req.session).then(function () {
                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $inc: { count: 1 } });
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            if (ret_string) {
                res.writeHead(200, {
                    'Content-Type': 'application/force-download',
                    'Content-disposition': 'attachment; filename=' + items[0].name + '.txt'
                });
                res.end(ret_string);
            } else {
                res.download(filePath, items[0].name);
            }
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    });
});

router.get('/subtitle/:uid/:lang/:index(\\d+|v)/:fresh(0+)?', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('subtitle file');
        var sendSub = function sendSub(filePath) {
            var fileIndex = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

            filePath = fileIndex === false ? filePath : filePath + '/' + fileIndex;
            var subPath = req.params.lang === 'en' ? filePath + '.en' : filePath;
            res.writeHead(200, { 'Content-Type': 'text/vtt' });
            (0, _fs.createReadStream)((0, _fs.existsSync)(subPath + '.vtt') ? subPath + '.vtt' : '/home/pi/app/public/123.vtt').pipe(res);
        };
        var id = req.params.uid.match(/^(you|dym|bil|yif|yuk|ope)_/);
        if (id) {
            var id_valid = (0, _utility.isValidString)(req.params.uid, 'name', 'external is not vaild');
            var filePath = null;
            switch (id[1]) {
                case 'dym':
                    filePath = (0, _utility.getFileLocation)('dailymotion', id_valid);
                    break;
                case 'bil':
                    filePath = (0, _utility.getFileLocation)('bilibili', id_valid);
                    break;
                case 'yif':
                    filePath = (0, _utility.getFileLocation)('yify', id_valid);
                    break;
                case 'yuk':
                    filePath = (0, _utility.getFileLocation)('youku', id_valid);
                    break;
                case 'ope':
                    filePath = (0, _utility.getFileLocation)('openload', id_valid);
                    break;
                default:
                    filePath = (0, _utility.getFileLocation)('youtube', id_valid);
                    break;
            }
            sendSub(filePath);
        } else {
            (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
                }
                if (items[0].status === 3) {
                    sendSub((0, _utility.getFileLocation)(items[0].owner, items[0]._id));
                } else {
                    var fileIndex = 0;
                    if (req.params.index && req.params.index !== 'v') {
                        fileIndex = Number(req.params.index);
                    } else {
                        for (var i in items[0]['playList']) {
                            if ((0, _mime.isVideo)(items[0]['playList'][i])) {
                                fileIndex = i;
                                break;
                            }
                        }
                    }
                    if (!(0, _mime.isVideo)(items[0]['playList'][fileIndex])) {
                        (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
                    }
                    sendSub((0, _utility.getFileLocation)(items[0].owner, items[0]._id), fileIndex);
                }
            }).catch(function (err) {
                return (0, _utility.handleError)(err, next);
            });
        }
    }, 1);
});

router.get('/video/:uid/file', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('video');
        stream_count++;
        if (stream_count > (0, _config.STREAM_LIMIT)(_ver.ENV_TYPE) && !(0, _utility.checkAdmin)(1, req.user)) {
            console.log(stream_count);
            (0, _utility.handleError)(new _utility.HoError('stream request too many!!!'));
        }
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1 || items[0].status !== 3 && items[0].status !== 4) {
                (0, _utility.handleError)(new _utility.HoError('cannot find video!!!'));
            }
            var videoPath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
            console.log(videoPath);
            var finalPath = videoPath + '_complete';
            if (!(0, _fs.existsSync)(finalPath)) {
                if (!(0, _fs.existsSync)(videoPath)) {
                    (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
                }
                finalPath = videoPath;
            }
            var total = (0, _fs.statSync)(finalPath).size;
            if (req.headers['range']) {
                var parts = req.headers.range.replace(/bytes(=|: )/, '').split('-');
                var partialend = parts[1];
                var start = parseInt(parts[0], 10);
                var end = partialend ? parseInt(partialend, 10) : total - 1;
                res.writeHead(206, {
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': 'video/mp4'
                });
                (0, _fs.createReadStream)(finalPath, {
                    start: start,
                    end: end
                }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': 'video/mp4'
                });
                (0, _fs.createReadStream)(finalPath).pipe(res);
            }
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    });
});

router.get('/torrent/:index(\\d+|v)/:uid/:type(images|resources|\\d+)/:number(image\\d+.png|sheet\.css|0+)?', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('torrent');
        var fileIndex = !isNaN(req.params.index) ? Number(req.params.index) : 0;
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('torrent can not be fund!!!'));
            }
            if (req.params.index === 'v') {
                for (var i in items[0]['playList']) {
                    if ((0, _mime.isVideo)(items[0]['playList'][i])) {
                        fileIndex = i;
                        break;
                    }
                }
            }
            var bufferPath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id) + '/' + fileIndex;
            var comPath = bufferPath + '_complete';
            var type = (0, _mime.isImage)(items[0].playList[fileIndex]) ? 2 : (0, _mime.isVideo)(items[0].playList[fileIndex]) || (0, _mime.isMusic)(items[0].playList[fileIndex]) ? 1 : (0, _mime.isDoc)(items[0].playList[fileIndex]) || (0, _mime.isZipbook)(items[0].playList[fileIndex]) ? 4 : 3;
            if (type === 1) {
                stream_count++;
                if (stream_count > (0, _config.STREAM_LIMIT)(_ver.ENV_TYPE) && !(0, _utility.checkAdmin)(1, req.user)) {
                    console.log(stream_count);
                    (0, _utility.handleError)(new _utility.HoError('stream request too many!!!'));
                }
                var outputPath = (0, _fs.existsSync)(comPath) ? comPath : (0, _fs.existsSync)(bufferPath) ? bufferPath : null;
                if ((0, _fs.existsSync)(bufferPath + '_error') || !outputPath) {
                    (0, _utility.handleError)(new _utility.HoError('video error!!!'));
                }
                console.log(outputPath);
                var total = (0, _fs.statSync)(outputPath).size;
                if (req.headers['range']) {
                    var parts = req.headers.range.replace(/bytes(=|: )/, '').split('-');
                    var partialend = parts[1];
                    var start = parseInt(parts[0], 10);
                    var end = partialend ? parseInt(partialend, 10) : total - 1;
                    res.writeHead(206, {
                        'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': end - start + 1,
                        'Content-Type': 'video/mp4'
                    });
                    (0, _fs.createReadStream)(outputPath, {
                        start: start,
                        end: end
                    }).pipe(res);
                } else {
                    res.writeHead(200, {
                        'Content-Length': total,
                        'Content-Type': 'video/mp4'
                    });
                    (0, _fs.createReadStream)(outputPath).pipe(res);
                }
            } else if (type === 4) {
                var torrentDoc = function torrentDoc() {
                    if (req.params.type === 'images' || req.params.type === 'resources') {
                        if (!req.params.number) {
                            (0, _utility.handleError)(new _utility.HoError('cannot find img name!!!'));
                        }
                        return _promise2.default.resolve(req.params.type === 'images' ? [bufferPath + '_doc/images/' + req.params.number, 'image/jpeg'] : [bufferPath + '_doc/resources/sheet.css', 'text/css']);
                    } else {
                        var _ret = function () {
                            var del = false;
                            if (items[0].present && items[0].present[fileIndex]) {
                                if (fileIndex === 0 && req.params.type.match(/^0+$/) || fileIndex === items[0].playList.length - 1 && Number(req.params.type) === items[0].present[fileIndex]) {
                                    del = true;
                                }
                            } else {
                                if (fileIndex === 0 || fileIndex === items[0].playList.length - 1) {
                                    del = true;
                                }
                            }
                            var data = del ? ['hdel', items[0]._id.toString()] : ['hmset', (0, _defineProperty3.default)({}, items[0]._id.toString(), req.params.type + '&' + fileIndex)];
                            var ext = (0, _mime.isDoc)(items[0].playList[fileIndex]);
                            if (req.params.type.match(/^0+$/)) {
                                req.params.type = !ext || ext.type === 'present' || ext.type === 'pdf' ? '1' : '';
                            }
                            return {
                                v: (0, _redisTool2.default)(data[0], 'record: ' + req.user._id, data[1]).then(function () {
                                    return !ext ? [bufferPath + '_img/' + req.params.type, 'image/jpeg'] : ext.type === 'present' ? [bufferPath + '_present/' + req.params.type + '.svg', 'image/svg+xml'] : ext.type === 'pdf' ? [bufferPath + '_pdf/' + (0, _utility.completeZero)(req.params.type, 3) + '.pdf', 'application/pdf'] : [bufferPath + '_doc/doc' + req.params.type + '.html', 'text/html'];
                                })
                            };
                        }();

                        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
                    }
                };
                return torrentDoc().then(function (_ref2) {
                    var _ref3 = (0, _slicedToArray3.default)(_ref2, 2),
                        docFilePath = _ref3[0],
                        docMime = _ref3[1];

                    console.log(docFilePath);
                    if (!(0, _fs.existsSync)(docFilePath)) {
                        (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
                    }
                    res.writeHead(200, { 'Content-Type': docMime });
                    (0, _fs.createReadStream)(docFilePath).pipe(res);
                });
            } else {
                var data = fileIndex === 0 || fileIndex === items[0].playList.length - 1 ? ['hdel', items[0]._id.toString()] : ['hmset', (0, _defineProperty3.default)({}, items[0]._id.toString(), '0&' + fileIndex)];
                return (0, _redisTool2.default)(data[0], 'record: ' + req.user._id, data[1]).then(function () {
                    return (0, _fs.existsSync)(comPath) ? res.download(comPath, items[0].playList[fileIndex]) : (0, _utility.handleError)(new _utility.HoError('need download first!!!'));
                });
            }
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    });
});

router.get('/image/:uid/:type(file|images|resources|\\d+)/:number(image\\d+.png||sheet\.css)?', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('image');
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
            var getRecord = function getRecord() {
                if (!items[0].present && items[0].status !== 5 && items[0].status !== 6) {
                    return _promise2.default.resolve([filePath, 'image/jpeg']);
                }
                if (req.params.type === 'images' || req.params.type === 'resources') {
                    if (!req.params.number) {
                        (0, _utility.handleError)(new _utility.HoError('cannot find img name!!!'));
                    }
                    return _promise2.default.resolve(req.params.type === 'images' ? [filePath + '_doc/images/' + req.params.number, 'image/jpeg'] : [filePath + '_doc/resources/sheet.css', 'text/css']);
                } else if (!isNaN(req.params.type)) {
                    console.log('image record');
                    var data = req.params.type === '1' || req.params.type === items[0].present.toString() ? ['hdel', items[0]._id.toString()] : ['hmset', (0, _defineProperty3.default)({}, items[0]._id.toString(), req.params.type)];
                    if (items[0].status === 5 && req.params.type === '1') {
                        req.params.type = '';
                    }
                    return (0, _redisTool2.default)(data[0], 'record: ' + req.user._id, data[1]).then(function () {
                        return items[0].status === 6 ? [filePath + '_present/' + req.params.type + '.svg', 'image/svg+xml'] : items[0].status === 5 ? [filePath + '_doc/doc' + req.params.type + '.html', 'text/html'] : items[0].status === 10 ? [filePath + '_pdf/' + (0, _utility.completeZero)(req.params.type, 3) + '.pdf', 'application/pdf'] : [filePath + '_img/' + req.params.type, 'image/jpeg'];
                    });
                } else {
                    console.log('image settime');
                    return (0, _redisTool2.default)('hget', 'record: ' + req.user._id, items[0]._id.toString()).then(function (item) {
                        return items[0].status === 6 ? [item ? filePath + '_present/' + item + '.svg' : filePath + '_present/1.svg', 'image/svg+xml'] : items[0].status === 5 ? [item && item !== '1' ? filePath + '_doc/doc' + item + '.html' : filePath + '_doc/doc.html', 'text/html'] : items[0].status === 10 ? [item ? filePath + '_pdf/' + (0, _utility.completeZero)(item, 3) + '.pdf' : filePath + '_pdf/001.pdf', 'application/pdf'] : [item ? filePath + '_img/' + item + '}' : filePath + '_img/1', 'image/jpeg'];
                    });
                }
            };
            return getRecord().then(function (_ref6) {
                var _ref7 = (0, _slicedToArray3.default)(_ref6, 2),
                    docFilePath = _ref7[0],
                    docMime = _ref7[1];

                console.log(docFilePath);
                if (!(0, _fs.existsSync)(docFilePath)) {
                    (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
                }
                res.writeHead(200, { 'Content-Type': docMime });
                (0, _fs.createReadStream)(docFilePath).pipe(res);
            });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    }, 1);
});

router.post('/upload/file', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('upload file');
        console.log(req.files);
        var oOID = (0, _mongoTool.objectID)();
        var filePath = (0, _utility.getFileLocation)(req.user._id, oOID);
        var mkdir = function mkdir(folderPath) {
            return !(0, _fs.existsSync)(folderPath) ? new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(folderPath, function (err) {
                    return err ? reject(err) : resolve();
                });
            }) : _promise2.default.resolve();
        };
        mkdir((0, _path.dirname)(filePath)).then(function () {
            return new _promise2.default(function (resolve, reject) {
                var stream = (0, _fs.createReadStream)(req.files.file.path);
                stream.on('error', function (err) {
                    return reject(err);
                });
                stream.on('close', function () {
                    return (0, _mime.isTorrent)(req.files.file.name) ? new _promise2.default(function (resolve2, reject2) {
                        return (0, _readTorrent2.default)(filePath, function (err, torrent) {
                            return err ? reject2(err) : resolve2(torrent);
                        });
                    }).then(function (torrent) {
                        var magnet = (0, _utility.torrent2Magnet)(torrent);
                        if (!magnet) {
                            (0, _utility.handleError)(new _utility.HoError('magnet create fail'));
                        }
                        console.log(magnet);
                        var encodeTorrent = (0, _utility.isValidString)(magnet, 'url');
                        if (encodeTorrent === false) {
                            (0, _utility.handleError)(new _utility.HoError('magnet is not vaild'));
                        }
                        var shortTorrent = magnet.match(/^magnet:[^&]+/);
                        if (!shortTorrent) {
                            (0, _utility.handleError)(new _utility.HoError('magnet create fail'));
                        }
                        return new _promise2.default(function (resolve2, reject2) {
                            return (0, _fs.unlink)(filePath, function (err) {
                                return err ? reject2(err) : resolve2();
                            });
                        }).then(function () {
                            return new _promise2.default(function (resolve2, reject2) {
                                return (0, _mkdirp2.default)(filePath, function (err) {
                                    return err ? reject2(err) : resolve2();
                                });
                            });
                        }).then(function () {
                            return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { magnet: {
                                    $regex: shortTorrent[0].match(/[^:]+$/)[0],
                                    $options: 'i'
                                } }, { limit: 1 });
                        }).then(function (items) {
                            if (items.length > 0) {
                                (0, _utility.handleError)(new _utility.HoError('already has one'));
                            }
                            return (0, _apiToolPlaylist2.default)('torrent info', magnet, filePath).then(function (info) {
                                var setTag = new _set2.default(['torrent', 'playlist', '播放列表']);
                                var optTag = new _set2.default();
                                var playList = info.files.map(function (file) {
                                    console.log(file.name);
                                    var mediaType = (0, _mime.extType)(file.name);
                                    if (mediaType) {
                                        var mediaTag = (0, _mime.extTag)(mediaType['type']);
                                        mediaTag.def.forEach(function (i) {
                                            return setTag.add((0, _tagTool.normalize)(i));
                                        });
                                        mediaTag.opt.forEach(function (i) {
                                            return optTag.add((0, _tagTool.normalize)(i));
                                        });
                                    }
                                    return file.path;
                                });
                                if (playList.length < 1) {
                                    (0, _utility.handleError)(new _utility.HoError('empty content!!!'));
                                }
                                playList = (0, _utility.sortList)(playList);
                                return resolve(['Playlist ' + info.name, setTag, optTag, {
                                    magnet: encodeTorrent,
                                    playList: playList
                                }]);
                            });
                        });
                    }) : resolve([req.files.file.name, new _set2.default(), new _set2.default(), {}]);
                });
                stream.pipe((0, _fs.createWriteStream)(filePath));
            });
        }).then(function (_ref8) {
            var _ref9 = (0, _slicedToArray3.default)(_ref8, 4),
                filename = _ref9[0],
                setTag = _ref9[1],
                optTag = _ref9[2],
                db_obj = _ref9[3];

            return new _promise2.default(function (resolve, reject) {
                return (0, _fs.unlink)(req.files.file.path, function (err) {
                    if (err) {
                        console.log(filePath);
                        (0, _utility.handleError)(err, 'Upload file');
                    }
                    return resolve();
                });
            }).then(function () {
                var name = (0, _utility.toValidName)(filename);
                if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                    name = (0, _mime.addPost)(name, '1');
                }
                return _mediaHandleTool2.default.handleTag(filePath, {
                    _id: oOID,
                    name: name,
                    owner: req.user._id,
                    utime: Math.round(new Date().getTime() / 1000),
                    size: db_obj['magnet'] ? 0 : req.files.file.size,
                    count: 0,
                    first: 1,
                    recycle: 0,
                    adultonly: (0, _utility.checkAdmin)(2, req.user) && JSON.parse(req.body.type) === 1 ? 1 : 0,
                    untag: 1,
                    status: db_obj['magnet'] ? 9 : 0
                }, name, '', 0).then(function (_ref10) {
                    var _ref11 = (0, _slicedToArray3.default)(_ref10, 3),
                        mediaType = _ref11[0],
                        mediaTag = _ref11[1],
                        DBdata = _ref11[2];

                    var isPreview = function isPreview() {
                        return mediaType.type === 'video' ? new _promise2.default(function (resolve, reject) {
                            var is_preview = true;
                            (0, _avconv2.default)(['-i', filePath]).once('exit', function (exitCode, signal, metadata2) {
                                if (metadata2 && metadata2.input && metadata2.input.stream) {
                                    var _iteratorNormalCompletion = true;
                                    var _didIteratorError = false;
                                    var _iteratorError = undefined;

                                    try {
                                        for (var _iterator = (0, _getIterator3.default)(metadata2.input.stream[0]), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                            var m = _step.value;

                                            console.log(m.type);
                                            console.log(m.codec);
                                            if (m.type === 'video' && m.codec !== 'h264') {
                                                is_preview = false;
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
                                }
                                if (is_preview) {
                                    DBdata['status'] = 3;
                                }
                                return resolve();
                            });
                        }) : _promise2.default.resolve();
                    };
                    return isPreview().then(function () {
                        setTag.add((0, _tagTool.normalize)(DBdata['name'])).add((0, _tagTool.normalize)(req.user.username));
                        if (req.body.path) {
                            var bodyPath = (0, _utility.getJson)(req.body.path);
                            if (Array.isArray(bodyPath) && bodyPath.length > 0) {
                                bodyPath.forEach(function (p) {
                                    return setTag.add((0, _tagTool.normalize)(p));
                                });
                            }
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
                        }, req.user._id, setArr), db_obj)).then(function (item) {
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
});

router.post('/upload/subtitle/:uid/:index(\\d+)?', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('upload subtitle');
        console.log(req.files);
        if (req.files.file.size > 10 * 1024 * 1024) {
            (0, _utility.handleError)(new _utility.HoError('size too large!!!'));
        }
        var ext = (0, _mime.isSub)(req.files.file.name);
        if (!ext) {
            (0, _utility.handleError)(new _utility.HoError('not valid subtitle!!!'));
        }
        var convertSub = function convertSub(filePath, id) {
            return new _promise2.default(function (resolve, reject) {
                return (0, _fs.unlink)(req.files.file.path, function (err) {
                    return err ? reject(err) : resolve();
                });
            }).then(function () {
                return (0, _utility.SRT2VTT)(filePath, ext).then(function () {
                    (0, _sendWs2.default)({
                        type: 'sub',
                        data: id
                    }, 0, 0);
                    res.json({ apiOK: true });
                });
            });
        };
        var saveSub = function saveSub(filePath, id) {
            var folderPath = (0, _path.dirname)(filePath);
            var mkFolder = function mkFolder(filePath) {
                return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                    return (0, _mkdirp2.default)(folderPath, function (err) {
                        return err ? reject(err) : resolve();
                    });
                });
            };
            return mkFolder().then(function () {
                if ((0, _fs.existsSync)(filePath + '.srt')) {
                    (0, _fs.renameSync)(filePath + '.srt', filePath + '.srt1');
                }
                if ((0, _fs.existsSync)(filePath + '.ass')) {
                    (0, _fs.renameSync)(filePath + '.ass', filePath + '.ass1');
                }
                if ((0, _fs.existsSync)(filePath + '.ssa')) {
                    (0, _fs.renameSync)(filePath + '.ssa', filePath + '.ssa1');
                }
                return new _promise2.default(function (resolve, reject) {
                    var stream = (0, _fs.createReadStream)(req.files.file.path);
                    stream.on('error', function (err) {
                        return reject(err);
                    });
                    stream.on('close', function () {
                        return resolve();
                    });
                    stream.pipe((0, _fs.createWriteStream)(filePath + '.' + ext));
                }).then(function () {
                    return convertSub(filePath, id);
                });
            });
        };
        var idMatch = req.params.uid.match(/^(you|dym|bil|yuk|ope)_/);
        if (idMatch) {
            var ex_type = 'youtube';
            switch (idMatch[1]) {
                case 'dym':
                    ex_type = 'dailymotion';
                    break;
                case 'bil':
                    ex_type = 'bilibili';
                    break;
                case 'yuk':
                    ex_type = 'youku';
                    break;
                case 'ope':
                    ex_type = 'openload';
                    break;
            }
            var id = (0, _utility.isValidString)(req.params.uid, 'name', 'external is not vaild');
            var filePath = (0, _utility.getFileLocation)(ex_type, id);
            saveSub((0, _utility.getJson)(req.body.lang) === 'en' ? filePath + '.en' : filePath, id).catch(function (err) {
                return (0, _utility.handleError)(err, next);
            });
        } else {
            (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    (0, _utility.handleError)(new _utility.HoError('file not exist!!!'));
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
                }
                if (items[0].thumb) {
                    (0, _utility.handleError)(new _utility.HoError('external file, please open video'));
                }
                var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
                if (items[0].status === 9) {
                    var fileIndex = 0;
                    if (req.params.index) {
                        fileIndex = Number(req.params.index);
                    } else {
                        for (var i in items[0]['playList']) {
                            if ((0, _mime.isVideo)(items[0]['playList'][i])) {
                                fileIndex = i;
                                break;
                            }
                        }
                    }
                    if (!(0, _mime.isVideo)(items[0]['playList'][fileIndex])) {
                        (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
                    }
                    filePath = filePath + '/' + fileIndex;
                }
                return saveSub((0, _utility.getJson)(req.body.lang) === 'en' ? filePath + '.en' : filePath, items[0]._id);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, next);
            });
        }
    });
});

exports.default = router;
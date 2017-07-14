'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _youtubeDl = require('youtube-dl');

var _fs = require('fs');

var _path = require('path');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _readline = require('readline');

var _readTorrent = require('read-torrent');

var _readTorrent2 = _interopRequireDefault(_readTorrent);

var _opensubtitlesApi = require('opensubtitles-api');

var _opensubtitlesApi2 = _interopRequireDefault(_opensubtitlesApi);

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _apiToolPlaylist = require('../models/api-tool-playlist');

var _apiToolPlaylist2 = _interopRequireDefault(_apiToolPlaylist);

var _apiTool = require('../models/api-tool');

var _apiTool2 = _interopRequireDefault(_apiTool);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _externalTool = require('../models/external-tool');

var _externalTool2 = _interopRequireDefault(_externalTool);

var _mime = require('../util/mime');

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/2drive/:uid', function (req, res, next) {
    console.log('external 2 drive');
    (0, _mongoTool2.default)('find', _constants.USERDB, { _id: req.user._id }, { limit: 1 }).then(function (userlist) {
        if (userlist.length < 1) {
            (0, _utility.handleError)(new _utility.HoError('do not find user!!!'));
        }
        if (!userlist[0].auto) {
            (0, _utility.handleError)(new _utility.HoError('user dont have google drive!!!'));
        }
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
            }
            if (items[0].status === 7 || items[0].status === 8 || items[0].thumb) {
                (0, _utility.handleError)(new _utility.HoError('file cannot downlad!!!'));
            }
            var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
            return (0, _apiToolGoogle2.default)('list folder', {
                folderId: userlist[0].auto,
                name: 'downloaded'
            }).then(function (downloadedList) {
                if (downloadedList.length < 1) {
                    (0, _utility.handleError)(new _utility.HoError('do not have downloaded folder!!!'));
                }
                var downloaded = downloadedList[0].id;
                StorageTagTool.setLatest(items[0]._id, req.session).then(function () {
                    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $inc: { count: 1 } });
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Set latest');
                });
                if (items[0].status === 9) {
                    if (items[0]['playList'].length > 0) {
                        var _ret = function () {
                            var recur_upload = function recur_upload(index) {
                                if (index < folderArr.length) {
                                    var parent = downloaded;
                                    if (folderArr[index].parent !== '.') {
                                        var i = null;
                                        for (i in folderArr) {
                                            if (folderArr[index].parent === folderArr[i].key) {
                                                break;
                                            }
                                        }
                                        parent = folderArr[i].id ? folderArr[i].id : false;
                                    }
                                    return parent ? (0, _apiToolGoogle2.default)('create', {
                                        name: folderArr[index].name,
                                        parent: parent
                                    }).then(function (metadata) {
                                        console.log(metadata);
                                        folderArr[index].id = metadata.id;
                                    }).then(function () {
                                        return next(index);
                                    }) : _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('do not find parent!!!')));
                                } else {
                                    var fIndex = index - folderArr.length;
                                    var _parent = downloaded;
                                    if (fileArr[fIndex].parent !== '.') {
                                        var _i = null;
                                        for (_i in folderArr) {
                                            if (fileArr[fIndex].parent === folderArr[_i].key) {
                                                break;
                                            }
                                        }
                                        _parent = folderArr[_i].id ? folderArr[_i].id : false;
                                    }
                                    return _parent ? (0, _apiToolGoogle2.default)('upload', {
                                        user: req.user,
                                        type: 'auto',
                                        name: fileArr[fIndex].name,
                                        filePath: fileArr[fIndex].filePath,
                                        parent: _parent
                                    }).then(function () {
                                        return next(index);
                                    }) : _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('do not find parent!!!')));
                                }
                            };

                            var folderArr = [];
                            var fileArr = [];
                            items[0]['playList'].forEach(function (v, i) {
                                var comPath = filePath + '/' + i + '_complete';
                                if ((0, _fs.existsSync)(comPath)) {
                                    var d = (0, _path.dirname)(v);
                                    fileArr.push({
                                        name: (0, _path.basename)(v),
                                        filePath: comPath,
                                        parent: d
                                    });
                                    for (; d !== '.'; d = (0, _path.dirname)(d)) {
                                        for (var j in folderArr) {
                                            if (folderArr[j].key === d) {
                                                folderArr.splice(j, 1);
                                                break;
                                            }
                                        }
                                        folderArr.splice(0, 0, { key: d, name: (0, _path.basename)(d), parent: (0, _path.dirname)(d) });
                                    }
                                }
                            });
                            console.log(fileArr);
                            console.log(folderArr);
                            var next = function next(index) {
                                index++;
                                if (index < folderArr.length + fileArr.length) {
                                    return recur_upload(index);
                                }
                            };

                            if (folderArr.length + fileArr.length > 0) {
                                return {
                                    v: recur_upload(0)
                                };
                            } else {
                                var zip_filePath = (0, _fs.existsSync)(filePath + '_zip') ? filePath + '_zip' : (0, _fs.existsSync)(filePath + '_7z') ? filePath + '_7z' : (0, _fs.existsSync)(filePath + '.1.rar') ? filePath + '.1.rar' : null;
                                if (zip_filePath) {
                                    var _ret2 = function () {
                                        console.log(zip_filePath);
                                        var recur_zip = function recur_zip(index, name) {
                                            return (0, _fs.existsSync)(filePath + '.' + index + '.rar') ? (0, _apiToolGoogle2.default)('upload', {
                                                user: req.user,
                                                type: 'auto',
                                                name: name + '.part' + index + '.rar',
                                                filePath: filePath + '.' + index + '.rar',
                                                parent: downloaded
                                            }).then(function () {
                                                return recur_zip(index + 1, name);
                                            }) : _promise2.default.resolve();
                                        };
                                        return {
                                            v: {
                                                v: (0, _apiToolGoogle2.default)('upload', {
                                                    user: req.user,
                                                    type: 'auto',
                                                    name: items[0].name,
                                                    filePath: zip_filePath,
                                                    parent: downloaded
                                                }).then(function () {
                                                    var rarName = items[0].name.match(/^(.*)\.part\d+\.rar$/);
                                                    if (rarName) {
                                                        return recur_zip(2, rarName[1]);
                                                    }
                                                })
                                            }
                                        };
                                    }();

                                    if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                                } else {
                                    var ret_string = items[0].magnet ? decodeURIComponent(items[0].magnet) : items[0].mega ? decodeURIComponent(items[0].mega) : null;
                                    if (ret_string) {
                                        console.log(ret_string);
                                        return {
                                            v: (0, _apiToolGoogle2.default)('upload', {
                                                user: req.user,
                                                type: 'auto',
                                                name: items[0].name + '.txt',
                                                body: ret_string,
                                                parent: downloaded
                                            })
                                        };
                                    }
                                }
                            }
                        }();

                        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
                    }
                } else {
                    return (0, _apiToolGoogle2.default)('upload', {
                        user: req.user,
                        type: 'auto',
                        name: items[0].name,
                        filePath: filePath,
                        parent: downloaded
                    });
                }
            });
        }).then(function () {
            return res.json({ apiOK: true });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSingle/:uid', function (req, res, next) {
    console.log('external getSingle');
    var id = req.params.uid.match(/^(you|dym|bil|yuk|ope)_(.*)/);
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('file is not youtube video!!!'));
    }
    var subIndex = 1;
    var url = null;
    var idsub = null;
    switch (id[1]) {
        case 'dym':
            url = 'http://www.dailymotion.com/embed/video/' + id[2];
            break;
        case 'bil':
            idsub = id[2].match(/^([^_]+)_(\d+)$/);
            url = idsub ? 'http://www.bilibili.com/video/' + idsub[1] + '/index_' + idsub[2] + '.html' : 'http://www.bilibili.com/video/' + id[2] + '/';
            break;
        case 'yuk':
            url = 'http://v.youku.com/v_show/id_' + id[2] + '.html';
            break;
        case 'ope':
            url = 'https://openload.co/embed/' + id[2] + '/';
            break;
        default:
            url = 'http://www.youtube.com/watch?v=' + id[2];
            break;
    }
    var getUrl = function getUrl() {
        return id[1] === 'bil' ? (0, _externalTool.bilibiliVideoUrl)(url) : (0, _externalTool.youtubeVideoUrl)(id[1], url);
    };
    getUrl().then(function (ret_obj) {
        return res.json(ret_obj);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/upload/url', function (req, res, next) {
    console.log('externel upload url');
    var url = (0, _utility.isValidString)(req.body.url, 'url', 'url is not vaild');
    var addurl = url.match(/^url%3A(.*)/);
    if (addurl) {
        var url_name = (0, _utility.toValidName)(addurl[1]);
        if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(url_name))) {
            url_name = (0, _mime.addPost)(url_name, '1');
        }
        _mediaHandleTool2.default.handleTag('', {
            _id: (0, _mongoTool.objectID)(),
            name: url_name,
            owner: req.user._id,
            utime: Math.round(new Date().getTime() / 1000),
            url: addurl[1],
            size: 0,
            count: 0,
            first: 1,
            recycle: 0,
            adultonly: (0, _utility.checkAdmin)(2, req.user) && (0, _utility.getJson)(req.body.type) === 1 ? 1 : 0,
            untag: 1,
            status: 7
        }, url_name, '', 7).then(function (_ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 3),
                mediaType = _ref2[0],
                mediaTag = _ref2[1],
                DBdata = _ref2[2];

            var setTag = new _set2.default();
            setTag.add((0, _tagTool.normalize)(DBdata['name'])).add((0, _tagTool.normalize)(req.user.username));
            if (req.body.path) {
                req.body.path.forEach(function (p) {
                    return setTag.add((0, _tagTool.normalize)(p));
                });
            }
            var optTag = new _set2.default();
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
                    res.json({
                        id: item[0]._id,
                        name: item[0].name,
                        select: setArr,
                        option: (0, _mime.supplyTag)(setArr, optArr),
                        other: []
                    });
                });
            });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    } else {
        (function () {
            var pureDownload = function pureDownload(err) {
                (0, _utility.handleError)(err, 'Url upload');
                return (0, _apiTool2.default)('download', req.user, decodeUrl, {
                    is_check: false,
                    filePath: filePath,
                    rest: function rest(_ref13) {
                        var _ref14 = (0, _slicedToArray3.default)(_ref13, 2),
                            pathname = _ref14[0],
                            filename = _ref14[1];

                        console.log(filename);
                        var getFile = function getFile() {
                            return !(0, _mime.isTorrent)(filename) ? _promise2.default.resolve([filename, new _set2.default(), new _set2.default()]) : new _promise2.default(function (resolve, reject) {
                                return (0, _readTorrent2.default)(filePath, function (err, torrent) {
                                    return err ? reject(err) : resolve(torrent);
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
                                return new _promise2.default(function (resolve, reject) {
                                    return (0, _fs.unlink)(filePath, function (err) {
                                        return err ? reject(err) : resolve();
                                    });
                                }).then(function () {
                                    return new _promise2.default(function (resolve, reject) {
                                        return (0, _mkdirp2.default)(filePath, function (err) {
                                            return err ? reject(err) : resolve();
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
                                        return ['Playlist ' + info.name, setTag, optTag, {
                                            magnet: encodeTorrent,
                                            playList: playList
                                        }];
                                    });
                                });
                            });
                        };
                        return getFile().then(function (_ref15) {
                            var _ref16 = (0, _slicedToArray3.default)(_ref15, 4),
                                filename = _ref16[0],
                                setTag = _ref16[1],
                                optTag = _ref16[2],
                                db_obj = _ref16[3];

                            return streamClose(filename, setTag, optTag, db_obj);
                        });
                    },
                    errHandle: function errHandle(err) {
                        return _promise2.default.reject(err);
                    }
                });
            };

            var streamClose = function streamClose(filename, setTag, optTag) {
                var db_obj = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

                if (!filename) {
                    return _promise2.default.resolve();
                }
                var name = (0, _utility.toValidName)(filename);
                if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                    name = (0, _mime.addPost)(name, '1');
                }
                var size = 0;
                if ((0, _fs.existsSync)(filePath)) {
                    var stats = (0, _fs.statSync)(filePath);
                    if (stats.isFile()) {
                        size = stats['size'];
                    }
                }
                var data = {
                    _id: oOID,
                    name: name,
                    owner: req.user._id,
                    utime: Math.round(new Date().getTime() / 1000),
                    size: size,
                    count: 0,
                    recycle: 0,
                    adultonly: (0, _utility.checkAdmin)(2, req.user) && (0, _utility.getJson)(req.body.type) === 1 ? 1 : 0,
                    untag: req.body.hide ? 0 : 1,
                    first: req.body.hide ? 0 : 1,
                    status: db_obj && (db_obj['magnet'] || db_obj['mega']) ? 9 : 0
                };
                return _mediaHandleTool2.default.handleTag(filePath, data, name, '', data['status']).then(function (_ref17) {
                    var _ref18 = (0, _slicedToArray3.default)(_ref17, 3),
                        mediaType = _ref18[0],
                        mediaTag = _ref18[1],
                        DBdata = _ref18[2];

                    if (is_media) {
                        DBdata['status'] = is_media;
                        var tmp = {};
                        for (var i in DBdata) {
                            if (i !== 'mediaType') {
                                tmp[i] = DBdata[i];
                            }
                        }
                        DBdata = tmp;
                    }
                    var isPreview = function isPreview() {
                        return mediaType.type === 'video' && DBdata['status'] === 1 ? new _promise2.default(function (resolve, reject) {
                            var is_preview = true;
                            Avconv(['-i', filePath]).once('exit', function (exitCode, signal, metadata2) {
                                if (metadata2 && metadata2.input && metadata2.input.stream) {
                                    var _iteratorNormalCompletion2 = true;
                                    var _didIteratorError2 = false;
                                    var _iteratorError2 = undefined;

                                    try {
                                        for (var _iterator2 = (0, _getIterator3.default)(metadata2.input.stream[0]), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                            var m = _step2.value;

                                            console.log(m.type);
                                            console.log(m.codec);
                                            if (m.type === 'video' && m.codec !== 'h264') {
                                                is_preview = false;
                                                break;
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
                                }
                                if (is_preview) {
                                    DBdata['status'] = 3;
                                }
                                return resolve();
                            });
                        }) : _promise2.default.resolve();
                    };
                    return isPreview().then(function () {
                        setTag.add((0, _tagTool.normalize)(DBdata['name'])).add((0, _tagTool.normalize)(req.user.username)).add('url upload');
                        if (req.body.path) {
                            req.body.path.forEach(function (p) {
                                return setTag.add((0, _tagTool.normalize)(p));
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
                        }, req.user._id, setArr), db_obj)).then(function (item) {
                            console.log(item);
                            console.log('save end');
                            (0, _sendWs2.default)({
                                type: 'file',
                                data: item[0]._id
                            }, item[0].adultonly);
                            (0, _sendWs2.default)({
                                type: req.user.username,
                                data: item[0]['name'] + ' upload complete'
                            }, item[0].adultonly);
                            return StorageTagTool.getRelativeTag(setArr, req.user, optArr).then(function (relative) {
                                var reli = relative.length < 5 ? relative.length : 5;
                                if ((0, _utility.checkAdmin)(2, req.user)) {
                                    item[0].adultonly === 1 ? setArr.push('18+') : optArr.push('18+');
                                }
                                item[0].first === 1 ? setArr.push('first item') : optArr.push('first item');
                                for (var _i2 = 0; _i2 < reli; _i2++) {
                                    var normal = (0, _tagTool.normalize)(relative[_i2]);
                                    if (!(0, _tagTool.isDefaultTag)(normal)) {
                                        if (!setArr.includes(normal) && !optArr.includes(normal)) {
                                            optArr.push(normal);
                                        }
                                    }
                                }
                                var recur_mhandle = function recur_mhandle(index) {
                                    var singel_mhandle = function singel_mhandle() {
                                        if (!(0, _mime.isVideo)(db_obj['playList'][index]) && !(0, _mime.isDoc)(db_obj['playList'][index]) && !(0, _mime.isZipbook)(db_obj['playList'][index])) {
                                            return _promise2.default.resolve();
                                        }
                                        return _mediaHandleTool2.default.handleTag(filePath + '/real/' + db_obj['playList'][index], {}, (0, _path.basename)(db_obj['playList'][index]), '', 0).then(function (_ref19) {
                                            var _ref20 = (0, _slicedToArray3.default)(_ref19, 3),
                                                mediaType = _ref20[0],
                                                mediaTag = _ref20[1],
                                                DBdata = _ref20[2];

                                            mediaType['fileIndex'] = index;
                                            mediaType['realPath'] = db_obj['playList'][index];
                                            DBdata['status'] = 9;
                                            DBdata['mediaType.' + index] = mediaType;
                                            console.log(DBdata);
                                            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: item[0]._id }, { $set: DBdata }).then(function (item2) {
                                                return _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, item[0]._id, req.user).catch(function (err) {
                                                    return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, item[0]._id, mediaType['fileIndex']);
                                                });
                                            });
                                        });
                                    };
                                    return singel_mhandle().then(function () {
                                        index++;
                                        if (index < db_obj['playList'].length) {
                                            return recur_mhandle(index);
                                        }
                                    });
                                };
                                var rest_handle = function rest_handle() {
                                    return db_obj && db_obj['mega'] && db_obj['playList'] ? recur_mhandle(0) : is_media ? _promise2.default.resolve() : _mediaHandleTool2.default.handleMediaUpload(mediaType, filePath, item[0]._id, req.user).catch(function (err) {
                                        return (0, _utility.handleError)(err, _mediaHandleTool.errorMedia, item[0]._id, mediaType['fileIndex']);
                                    });
                                };
                                return rest_handle().then(function () {
                                    return DBdata['untag'] ? res.json({
                                        id: item[0]._id,
                                        name: item[0].name,
                                        select: setArr,
                                        option: (0, _mime.supplyTag)(setArr, optArr),
                                        other: []
                                    }) : res.json({ id: item[0]._id });
                                });
                            });
                        });
                    });
                });
            };

            var decodeUrl = decodeURIComponent(url);
            var oOID = (0, _mongoTool.objectID)();
            var filePath = (0, _utility.getFileLocation)(req.user._id, oOID);
            var shortTorrentMatch = decodeUrl.match(/^magnet:[^&]+/);
            var folderPath = shortTorrentMatch ? filePath : (0, _path.dirname)(filePath);
            var mkfolder = function mkfolder() {
                return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                    return (0, _mkdirp2.default)(folderPath, function (err) {
                        return err ? reject(err) : resolve();
                    });
                });
            };
            var is_media = 0;
            mkfolder().then(function () {
                if (shortTorrentMatch) {
                    var shortTorrent = shortTorrentMatch[0];
                    if (shortTorrent === 'magnet:stop') {
                        return (0, _apiToolPlaylist2.default)('torrent stop', req.user).then(function () {
                            return res.json({ stop: true });
                        });
                    } else if (shortTorrent === 'magnet:stopzip') {
                        return (0, _apiToolPlaylist2.default)('zip stop', req.user).then(function () {
                            return res.json({ stop: true });
                        });
                    } else if (shortTorrent === 'magnet:stopmega') {
                        return (0, _apiToolPlaylist2.default)('mega stop', req.user).then(function () {
                            return res.json({ stop: true });
                        });
                    } else if (shortTorrent === 'magnet:stopapi') {
                        if (!(0, _utility.checkAdmin)(1, req.user)) {
                            (0, _utility.handleError)(new _utility.HoError('permission denied!'));
                        }
                        return (0, _apiTool2.default)('stop').then(function () {
                            return res.json({ stop: true });
                        });
                    } else if (shortTorrent === 'magnet:stopgoogle') {
                        if (!(0, _utility.checkAdmin)(1, req.user)) {
                            (0, _utility.handleError)(new _utility.HoError('permission denied!'));
                        }
                        return (0, _apiToolGoogle2.default)('stop').then(function () {
                            return res.json({ stop: true });
                        });
                    } else {
                        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { magnet: {
                                $regex: shortTorrent.match(/[^:]+$/)[0],
                                $options: 'i'
                            } }, { limit: 1 }).then(function (items) {
                            if (items.length > 0) {
                                (0, _utility.handleError)(new _utility.HoError('already has one'));
                            }
                            return (0, _apiToolPlaylist2.default)('torrent info', decodeUrl, filePath).then(function (info) {
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
                                return ['Playlist ' + info.name, setTag, optTag, {
                                    magnet: url,
                                    playList: playList
                                }];
                            });
                        });
                    }
                } else {
                    if (decodeUrl.match(/^(https|http):\/\/(www\.youtube\.com|youtu\.be)\//)) {
                        var _ret4 = function () {
                            var is_music = decodeUrl.match(/^(.*):music$/);
                            if (is_music) {
                                is_media = 4;
                                console.log('youtube music');
                                decodeUrl = is_music[1];
                                (0, _utility.isValidString)(decodeUrl, 'url', 'url is not vaild');
                            } else {
                                is_media = 3;
                                console.log('youtube');
                            }
                            return {
                                v: (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                                    owner: 'youtube',
                                    url: encodeURIComponent(decodeUrl)
                                }, { limit: 2 }).then(function (items) {
                                    if (items.length > 0) {
                                        var _iteratorNormalCompletion = true;
                                        var _didIteratorError = false;
                                        var _iteratorError = undefined;

                                        try {
                                            for (var _iterator = (0, _getIterator3.default)(items), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                                var i = _step.value;

                                                console.log(i);
                                                if (i.thumb && i.status === is_media) {
                                                    (0, _utility.handleError)(new _utility.HoError('already has one'));
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
                                    var getYoutubeInfo = function getYoutubeInfo(detaildata) {
                                        if (detaildata.length < 1) {
                                            (0, _utility.handleError)(new _utility.HoError('can not find playlist'));
                                        }
                                        var media_name = detaildata[0].snippet.title;
                                        var ctitle = detaildata[0].snippet.channelTitle;
                                        console.log(media_name);
                                        var setTag = new _set2.default();
                                        var optTag = new _set2.default();
                                        setTag.add((0, _tagTool.normalize)('youtube'));
                                        if (ctitle) {
                                            setTag.add((0, _tagTool.normalize)(ctitle));
                                        }
                                        if (detaildata[0].snippet.tags) {
                                            detaildata[0].snippet.tags.forEach(function (i) {
                                                return setTag.add((0, _tagTool.normalize)(i));
                                            });
                                        }
                                        var mediaTag = (0, _mime.extTag)(is_music ? 'music' : 'video');
                                        mediaTag.def.forEach(function (i) {
                                            return setTag.add((0, _tagTool.normalize)(i));
                                        });
                                        mediaTag.opt.forEach(function (i) {
                                            return optTag.add((0, _tagTool.normalize)(i));
                                        });
                                        return [media_name, setTag, optTag, {
                                            owner: 'youtube',
                                            untag: 0,
                                            thumb: detaildata[0].snippet.thumbnails.default.url,
                                            cid: detaildata[0].snippet.channelId,
                                            ctitle: ctitle,
                                            url: decodeUrl
                                        }];
                                    };
                                    var youtube_id = decodeUrl.match(/list=([^&]+)/);
                                    if (youtube_id) {
                                        return (0, _apiToolGoogle2.default)('y playlist', {
                                            id: youtube_id[1],
                                            caption: true
                                        }).then(function (detaildata) {
                                            return getYoutubeInfo(detaildata);
                                        });
                                    } else {
                                        youtube_id = decodeUrl.match(/v=([^&]+)/);
                                        if (!youtube_id) {
                                            (0, _utility.handleError)(new _utility.HoError('can not find youtube id!!!'));
                                        }
                                        return (0, _apiToolGoogle2.default)('y video', {
                                            id: youtube_id[1],
                                            caption: true
                                        }).then(function (detaildata) {
                                            return getYoutubeInfo(detaildata);
                                        });
                                    }
                                })
                            };
                        }();

                        if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
                    } else if (decodeUrl.match(/^(https|http):\/\/yts\.ag\/movie\//)) {
                        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                            owner: 'yify',
                            url: encodeURIComponent(decodeUrl)
                        }, { limit: 1 }).then(function (items) {
                            if (items.length > 0) {
                                (0, _utility.handleError)(new _utility.HoError('already has one'));
                            }
                            var yify_id = decodeUrl.match(/[^\/]+$/);
                            if (!yify_id) {
                                (0, _utility.handleError)(new _utility.HoError('yify url invalid'));
                            }
                            is_media = 3;
                            return _externalTool2.default.saveSingle('yify', yify_id[0]).then(function (_ref3) {
                                var _ref4 = (0, _slicedToArray3.default)(_ref3, 6),
                                    media_name = _ref4[0],
                                    setTag = _ref4[1],
                                    optTag = _ref4[2],
                                    owner = _ref4[3],
                                    thumb = _ref4[4],
                                    url = _ref4[5];

                                return [media_name, setTag, optTag, {
                                    owner: owner,
                                    untag: 0,
                                    thumb: thumb,
                                    url: url
                                }];
                            });
                        });
                    } else if (decodeUrl.match(/^(https|http):\/\/www\.cartoonmad\.com\/comic\//)) {
                        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                            owner: 'cartoonmad',
                            url: encodeURIComponent(decodeUrl)
                        }, { limit: 1 }).then(function (items) {
                            if (items.length > 0) {
                                (0, _utility.handleError)(new _utility.HoError('already has one'));
                            }
                            var cartoonmad_id = decodeUrl.match(/([^\/]+)\.html$/);
                            if (!cartoonmad_id) {
                                (0, _utility.handleError)(new _utility.HoError('cartoonmad url invalid'));
                            }
                            is_media = 2;
                            return _externalTool2.default.saveSingle('cartoonmad', cartoonmad_id[1]).then(function (_ref5) {
                                var _ref6 = (0, _slicedToArray3.default)(_ref5, 6),
                                    media_name = _ref6[0],
                                    setTag = _ref6[1],
                                    optTag = _ref6[2],
                                    owner = _ref6[3],
                                    thumb = _ref6[4],
                                    url = _ref6[5];

                                return [media_name, setTag, optTag, {
                                    owner: owner,
                                    untag: 0,
                                    thumb: thumb,
                                    url: url
                                }];
                            });
                        });
                    } else if (decodeUrl.match(/^(https|http):\/\/www\.bilibili\.com\//) || decodeUrl.match(/^(https|http):\/\/bangumi\.bilibili\.com\//)) {
                        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                            owner: 'bilibili',
                            url: encodeURIComponent(decodeUrl)
                        }, { limit: 1 }).then(function (items) {
                            if (items.length > 0) {
                                (0, _utility.handleError)(new _utility.HoError('already has one'));
                            }
                            var bili_id = decodeUrl.match(/([^\/]+)\/?$/);
                            if (!bili_id) {
                                (0, _utility.handleError)(new _utility.HoError('bilibili url invalid'));
                            }
                            is_media = 3;
                            return _externalTool2.default.saveSingle('bilibili', bili_id[1]).then(function (_ref7) {
                                var _ref8 = (0, _slicedToArray3.default)(_ref7, 6),
                                    media_name = _ref8[0],
                                    setTag = _ref8[1],
                                    optTag = _ref8[2],
                                    owner = _ref8[3],
                                    thumb = _ref8[4],
                                    url = _ref8[5];

                                return [media_name, setTag, optTag, {
                                    owner: owner,
                                    untag: 0,
                                    thumb: thumb,
                                    url: url
                                }];
                            });
                        });
                    } else if (decodeUrl.match(/^(https|http):\/\/mega\./)) {
                        return (0, _apiToolPlaylist2.default)('mega add', req.user, decodeUrl, filePath, {
                            rest: function rest(_ref9) {
                                var _ref10 = (0, _slicedToArray3.default)(_ref9, 4),
                                    filename = _ref10[0],
                                    setTag = _ref10[1],
                                    optTag = _ref10[2],
                                    db_obj = _ref10[3];

                                return streamClose(filename, setTag, optTag, db_obj);
                            },
                            errhandle: function errhandle(err) {
                                return pureDownload(err);
                            }
                        });
                    } else {
                        return _promise2.default.reject(new _utility.HoError('unknown type'));
                    }
                }
            }).catch(function (err) {
                return pureDownload(err);
            }).then(function (result) {
                return Array.isArray(result) ? result : [];
            }).then(function (_ref11) {
                var _ref12 = (0, _slicedToArray3.default)(_ref11, 4),
                    filename = _ref12[0],
                    setTag = _ref12[1],
                    optTag = _ref12[2],
                    db_obj = _ref12[3];

                return streamClose(filename, setTag, optTag, db_obj);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, next);
            });
        })();
    }
});

router.post('/subtitle/search/:uid/:index(\\d+)?', function (req, res, next) {
    console.log('subtitle search');
    var name = (0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild');
    var episode_match = req.body.episode ? req.body.episode.match(/^(s(\d*))?(e)?(\d+)$/i) : false;
    var episode = 0;
    var season = 0;
    var episode_1 = null;
    var episode_2 = null;
    var episode_3 = null;
    var episode_4 = null;
    if (episode_match) {
        if (!episode_match[1] && !episode_match[3]) {
            episode = Number(episode_match[4]);
            season = 1;
        } else if (!episode_match[1]) {
            episode = Number(episode_match[4]);
            season = 1;
        } else if (!episode_match[3]) {
            episode = 1;
            season = Number('' + episode_match[2] + episode_match[4]);
        } else if (episode_match[2] === '') {
            episode = Number(episode_match[4]);
            season = 1;
        } else {
            episode = Number(episode_match[4]);
            season = Number(episode_match[2]);
        }
        if (episode < 10) {
            if (season < 10) {
                episode_1 = ' s0' + season + 'e0' + episode;
                episode_2 = ' s' + season + 'e0' + episode;
                episode_3 = ' s0' + season;
                episode_4 = ' s' + season;
            } else {
                episode_1 = ' s' + season + 'e0' + episode;
                episode_2 = ' s' + season;
            }
        } else {
            if (season < 10) {
                episode_1 = ' s0' + season + 'e' + episode;
                episode_2 = ' s' + season + 'e' + episode;
                episode_3 = ' s0' + season;
                episode_4 = ' s' + season;
            } else {
                episode_1 = ' s' + season + 'e' + episode;
                episode_2 = ' s' + season;
            }
        }
    }
    console.log(season);
    console.log(episode);
    var idMatch = req.params.uid.match(/^(you|dym|bil|yuk|ope)_/);
    var type = 'youtube';
    switch (idMatch[1]) {
        case 'dym':
            type = 'dailymotion';
            break;
        case 'bil':
            type = 'bilibili';
            break;
        case 'yuk':
            type = 'youku';
            break;
        case 'ope':
            type = 'openload';
            break;
    }
    var getId = function getId() {
        return idMatch ? _promise2.default.resolve([(0, _utility.isValidString)(req.params.uid, 'name', 'external is not vaild'), (0, _utility.getFileLocation)(type, id)]) : (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
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
            return [items[0]._id, filePath];
        });
    };
    getId().then(function (_ref21) {
        var _ref22 = (0, _slicedToArray3.default)(_ref21, 2),
            id = _ref22[0],
            filePath = _ref22[1];

        var folderPath = (0, _path.dirname)(filePath);
        var mkfolder = function mkfolder() {
            return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(folderPath, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        };
        var getZh = function getZh(sub_url) {
            return sub_url ? SUB2VTT(sub_url, filePath, false) : _promise2.default.resolve();
        };
        var getEn = function getEn(sub_en_url) {
            return sub_en_url ? SUB2VTT(sub_en_url, filePath, false, 'en') : _promise2.default.resolve();
        };
        var OpenSubtitles = new _opensubtitlesApi2.default('hoder agent v0.1');
        return name.match(/^tt\d+$/i) ? OpenSubtitles.search((0, _assign2.default)({
            extensions: 'srt',
            imdbid: name
        }, episode ? {
            episode: episode,
            season: season
        } : {})).then(function (subtitles) {
            console.log(subtitles);
            var sub_en_url = subtitles.en ? subtitles.en.url : null;
            var sub_url = subtitles.ze ? subtitles.ze.url : subtitles.zt ? subtitles.zt.url : subtitles.zh ? subtitles.zh.url : null;
            if (!sub_url && !sub_en_url) {
                (0, _utility.handleError)(new _utility.HoError('cannot find subtitle!!!'));
            }
            return mkfolder().then(function () {
                return getZh(sub_url);
            }).then(function () {
                return getEn(sub_en_url);
            }).then(function () {
                (0, _sendWs2.default)({
                    type: 'sub',
                    data: id
                }, 0, 0);
                res.json({ apiOK: true });
            });
        }) : OpenSubtitles.search((0, _assign2.default)({
            extensions: 'srt',
            query: name
        }, episode ? {
            episode: episode,
            season: season
        } : {})).then(function (subtitles) {
            console.log(subtitles);
            var sub_en_url = subtitles.en ? subtitles.en.url : null;
            var restSub = function restSub() {
                return sub_en_url ? mkfolder().then(function () {
                    return getEn(sub_en_url);
                }) : _promise2.default.resolve();
            };
            var getSub = function getSub(name) {
                return (0, _externalTool.subHdUrl)(name).then(function (subtitles2) {
                    var zip_ext = (0, _mime.isZip)(subtitles2);
                    if (!zip_ext) {
                        (0, _utility.handleError)(new _utility.HoError('is not zip!!!'));
                    }
                    var sub_location = filePath + '_sub';
                    var mkfolder2 = function mkfolder2() {
                        return (0, _fs.existsSync)(sub_location) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                            return (0, _mkdirp2.default)(sub_location, function (err) {
                                return err ? reject(err) : resolve();
                            });
                        });
                    };
                    return mkfolder2().then(function () {
                        var sub_temp_location = sub_location + '/0';
                        var sub_zip_location = sub_location + '/0.' + zip_ext;
                        var i = void 0;
                        for (var _i3 = 0; _i3 <= 10; _i3++) {
                            if (_i3 >= 10) {
                                (0, _utility.handleError)(new _utility.HoError('too many sub!!!'));
                            }
                            sub_temp_location = sub_location + '/' + _i3;
                            sub_zip_location = sub_location + '/' + _i3 + '.' + zip_ext;
                            if (!(0, _fs.existsSync)(sub_temp_location)) {
                                break;
                            }
                        }
                        return (0, _apiTool2.default)('url', subtitles2, { filePath: sub_zip_location }).then(function () {
                            return new _promise2.default(function (resolve, reject) {
                                return (0, _mkdirp2.default)(sub_temp_location, function (err) {
                                    return err ? reject(err) : resolve();
                                });
                            }).then(function () {
                                return new _promise2.default(function (resolve, reject) {
                                    return _child_process2.default.exec(zip_ext === 'rar' || zip_ext === 'cbr' ? 'unrar x ' + sub_zip_location + ' ' + sub_temp_location : zip_ext === '7z' ? '7za x ' + sub_zip_location + ' -o' + sub_temp_location : (0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + sub_zip_location + ' ' + sub_temp_location, function (err, output) {
                                        return err ? reject(err) : resolve();
                                    });
                                }).then(function (output) {
                                    var choose = null;
                                    var pri_choose = 9;
                                    var pri_choose_temp = 8;
                                    var pri_choose_arr = ['big5', 'cht', '繁體', '繁体', 'gb', 'chs', '簡體', '简体'];
                                    var episode_pattern = new RegExp('(第0*' + episode + '集|ep?0*' + episode + ')', 'i');
                                    var episode_choose = null;
                                    var episode_pri_choose = 9;
                                    var episode_pri_choose_temp = 8;
                                    recur_dir(sub_temp_location);
                                    function recur_dir(dir) {
                                        (0, _fs.readdirSync)(dir).forEach(function (file, index) {
                                            var curPath = dir + '/' + file;
                                            if ((0, _fs.lstatSync)(curPath).isDirectory()) {
                                                recur_dir(curPath);
                                            } else {
                                                if ((0, _mime.isSub)(file)) {
                                                    if (episode && file.match(episode_pattern)) {
                                                        var pri_match = file.match(/(big5|cht|繁體|繁体|gb|chs|簡體|简体)/);
                                                        if (pri_match) {
                                                            episode_pri_choose_temp = pri_choose_arr.indexOf(pri_match[1]);
                                                        }
                                                        if (episode_pri_choose > episode_pri_choose_temp) {
                                                            episode_pri_choose = episode_pri_choose_temp;
                                                            episode_choose = curPath;
                                                        }
                                                    }
                                                    var pri_match2 = file.match(/(big5|cht|繁體|繁体|gb|chs|簡體|简体)/);
                                                    if (pri_match2) {
                                                        pri_choose_temp = pri_choose_arr.indexOf(pri_match2[1]);
                                                    }
                                                    if (pri_choose > pri_choose_temp) {
                                                        pri_choose = pri_choose_temp;
                                                        choose = curPath;
                                                    }
                                                }
                                            }
                                        });
                                    }
                                    if (episode_choose) {
                                        choose = episode_choose;
                                    }
                                    console.log('choose');
                                    console.log(choose);
                                    return SUB2VTT(choose, filePath, true).then(function () {
                                        (0, _utility.deleteFolderRecursive)(sub_temp_location);
                                        return new _promise2.default(function (resolve, reject) {
                                            return (0, _fs.unlink)(sub_zip_location, function (err) {
                                                return err ? reject(err) : resolve();
                                            });
                                        }).then(function () {
                                            (0, _sendWs2.default)({
                                                type: 'sub',
                                                data: id
                                            }, 0, 0);
                                            res.json({ apiOK: true });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            };
            return restSub().then(function () {
                return episode_1 ? getSub('' + name + episode_1).catch(function (err) {
                    return getSub('' + name + episode_2);
                }).catch(function (err) {
                    return episode_3 ? getSub('' + name + episode_3).catch(function (err) {
                        return getSub('' + name + episode_4);
                    }).catch(function (err) {
                        return season === 1 ? getSub(name) : _promise2.default.reject(err);
                    }) : season === 1 ? getSub(name) : _promise2.default.reject(err);
                }) : getSub(name);
            });
        });
        function SUB2VTT(choose_subtitle, subPath, is_file) {
            var lang = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '';

            if (!choose_subtitle) {
                (0, _utility.handleError)(new _utility.HoError('donot have sub!!!'));
            }
            var ext = false;
            if (is_file) {
                ext = (0, _mime.isSub)(choose_subtitle);
                if (!ext) {
                    (0, _utility.handleError)(new _utility.HoError('is not sub!!!'));
                }
            } else {
                ext = 'srt';
            }
            if (lang === 'en') {
                subPath = subPath + '.en';
            }
            if ((0, _fs.existsSync)(subPath + '.srt')) {
                (0, _fs.renameSync)(subPath + '.srt', subPath + '.srt1');
            }
            if ((0, _fs.existsSync)(subPath + '.ass')) {
                (0, _fs.renameSync)(subPath + '.ass', subPath + '.ass1');
            }
            if ((0, _fs.existsSync)(subPath + '.ssa')) {
                (0, _fs.renameSync)(subPath + '.ssa', subPath + '.ssa1');
            }
            if (is_file) {
                (0, _fs.renameSync)(choose_subtitle, subPath + '.' + ext);
                return (0, _utility.SRT2VTT)(subPath, ext);
            } else {
                return (0, _apiTool2.default)('url', choose_subtitle, { filePath: subPath + '.' + ext }).then(function () {
                    return (0, _utility.SRT2VTT)(subPath, ext);
                });
            }
        }
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSubtitle/:uid', function (req, res, next) {
    console.log('external getSub');
    var idMatch = req.params.uid.match(/^you_(.*)/);
    if (!idMatch) {
        (0, _utility.handleError)(new _utility.HoError('file is not youtube video!!!'));
    }
    var id = (0, _utility.isValidString)(req.params.uid, 'name', 'external is not vaild');
    (0, _apiToolGoogle.googleDownloadSubtitle)('http://www.youtube.com/watch?v=' + idMatch[1], (0, _utility.getFileLocation)('youtube', id)).then(function () {
        (0, _sendWs2.default)({
            type: 'sub',
            data: id
        }, 0, 0);
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/subtitle/fix/:uid/:lang/:adjust/:index(\\d+)?', function (req, res, next) {
    console.log('subtitle fix');
    if (!req.params.adjust.match(/^\-?\d+(\.\d+)?$/)) {
        (0, _utility.handleError)(new _utility.HoError('adjust time is not vaild'));
    }
    var getId = function getId() {
        var idMatch = req.params.uid.match(/^(you|dym)_/);
        if (idMatch) {
            var ex_type = idMatch[1] === 'dym' ? 'dailymotion' : idMatch[1] === 'bil' ? 'bilibili' : 'youtube';
            var _id = (0, _utility.isValidString)(req.params.uid, 'name', 'external is not vaild');
            var filePath = (0, _utility.getFileLocation)(ex_type, _id);
            filePath = req.params.lang === 'en' ? filePath + '.en' : filePath;
            return _promise2.default.resolve([_id, filePath]);
        } else {
            return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
                }
                if (items[0].status !== 3 && items[0].status !== 9) {
                    (0, _utility.handleError)(new _utility.HoError('file type error!!!'));
                }
                var fileIndex = 0;
                if (items[0].status === 9) {
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
                }
                var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
                if (items[0].status === 9) {
                    filePath = filePath + '/' + fileIndex;
                }
                filePath = req.params.lang === 'en' ? filePath + '.en' : filePath;
                return _promise2.default.resolve([items[0]._id, filePath]);
            });
        }
    };
    getId().then(function (_ref23) {
        var _ref24 = (0, _slicedToArray3.default)(_ref23, 2),
            id = _ref24[0],
            filePath = _ref24[1];

        var vtt = filePath + '.vtt';
        if (!(0, _fs.existsSync)(vtt)) {
            (0, _utility.handleError)(new _utility.HoError('do not have subtitle!!!'));
        }
        return new _promise2.default(function (resolve, reject) {
            var adjust = Number(req.params.adjust) * 1000;
            var write_data = '';
            var rl = (0, _readline.createInterface)({
                input: (0, _fs.createReadStream)(vtt),
                terminal: false
            });
            rl.on('line', function (line) {
                var time_match = line.match(/^(\d\d):(\d\d):(\d\d)\.(\d\d\d) --> (\d\d):(\d\d):(\d\d)\.(\d\d\d)$/);
                if (time_match) {
                    var stime = Number(time_match[1]) * 3600000 + Number(time_match[2]) * 60000 + Number(time_match[3]) * 1000 + Number(time_match[4]);
                    var etime = Number(time_match[5]) * 3600000 + Number(time_match[6]) * 60000 + Number(time_match[7]) * 1000 + Number(time_match[8]);
                    stime = stime + adjust;
                    if (stime < 0) {
                        stime = 0;
                    }
                    etime = etime + adjust;
                    if (etime < 0) {
                        etime = 0;
                    }
                    var temp = (0, _utility.completeZero)(Math.floor(stime / 3600000), 2);
                    stime = stime % 3600000;
                    var atime = temp + ':';
                    temp = (0, _utility.completeZero)(Math.floor(stime / 60000), 2);
                    stime = stime % 60000;
                    atime = '' + atime + temp + ':';
                    temp = (0, _utility.completeZero)(Math.floor(stime / 1000), 2);
                    stime = (0, _utility.completeZero)(stime % 1000, 3);
                    atime = '' + atime + temp + '.' + stime + ' --> ';
                    temp = (0, _utility.completeZero)(Math.floor(etime / 3600000), 2);
                    etime = etime % 3600000;
                    atime = '' + atime + temp + ':';
                    temp = (0, _utility.completeZero)(Math.floor(etime / 60000), 2);
                    etime = etime % 60000;
                    atime = '' + atime + temp + ':';
                    temp = (0, _utility.completeZero)(Math.floor(etime / 1000), 2);
                    etime = (0, _utility.completeZero)(etime % 1000, 3);
                    atime = '' + atime + temp + '.' + etime;
                    //console.log(atime);
                    write_data = '' + write_data + atime + "\r\n";
                } else {
                    write_data = '' + write_data + line + "\r\n";
                }
            }).on('close', function () {
                return resolve(write_data);
            });
        }).then(function (write_data) {
            return new _promise2.default(function (resolve, reject) {
                console.log(vtt);
                //console.log(write_data);
                (0, _fs.writeFile)(vtt, write_data, 'utf8', function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        }).then(function () {
            (0, _sendWs2.default)({
                type: 'sub',
                data: id
            }, 0, 0);
            res.json({ apiOK: true });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;
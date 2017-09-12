'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.errorMedia = exports.completeMedia = undefined;

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _constants = require('../constants');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _fs = require('fs');

var _path = require('path');

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _streamTranscoder = require('../util/stream-transcoder.js');

var _streamTranscoder2 = _interopRequireDefault(_streamTranscoder);

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

exports.default = {
    editFile: function editFile(uid, newName, user) {
        var _this = this;

        var name = (0, _utility.isValidString)(newName, 'name', 'name is not vaild');
        var id = (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild');
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length === 0) {
                (0, _utility.handleError)(new _utility.HoError('file not exist!!!'));
            }
            if (!(0, _utility.checkAdmin)(1, user) && (!(0, _utility.isValidString)(items[0].owner, 'uid') || !user._id.equals(items[0].owner))) {
                (0, _utility.handleError)(new _utility.HoError('file is not yours!!!'));
            }
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $set: { name: name } }).then(function (item2) {
                return StorageTagTool.addTag(uid, name, user);
            }).then(function (result) {
                if (!items[0].tags.includes(result.tag)) {
                    items[0].tags.splice(0, 0, result.tag);
                }
                if (items[0][user._id.toString()] && !items[0][user._id.toString()].includes(result.tag)) {
                    items[0][user._id.toString()].splice(0, 0, result.tag);
                }
                var filePath = (0, _utility.getFileLocation)(items[0].owner, items[0]._id);
                console.log(items[0]);
                return _this.handleTag(filePath, {
                    utime: Math.round(new Date().getTime() / 1000),
                    untag: 1,
                    time: items[0].time,
                    height: items[0].height
                }, newName, items[0].name, items[0].status).then(function (_ref) {
                    var _ref2 = (0, _slicedToArray3.default)(_ref, 3),
                        mediaType = _ref2[0],
                        mediaTag = _ref2[1],
                        DBdata = _ref2[2];

                    mediaTag.def = mediaTag.def.filter(function (i) {
                        return !items[0].tags.includes(i);
                    });
                    mediaTag.opt = mediaTag.opt.filter(function (i) {
                        return !items[0].tags.includes(i);
                    });
                    var tagsAdd = mediaTag.def.length > 0 ? {
                        $set: DBdata,
                        $addToSet: (0, _defineProperty3.default)({
                            tags: { $each: mediaTag.def }
                        }, user._id.toString(), { $each: mediaTag.def })
                    } : { $set: DBdata };
                    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, tagsAdd, { upsert: true }).then(function (item2) {
                        var result_tag = [];
                        var others_tag = [];
                        if (!(0, _utility.checkAdmin)(1, user)) {
                            result_tag = mediaTag.def.concat(items[0][user._id.toString()]);
                            result_tag.forEach(function (i) {
                                var index_tag = items[0].tags.indexOf(i);
                                if (index_tag !== -1) {
                                    items[0].tags.splice(index_tag, 1);
                                }
                            });
                            others_tag = items[0].tags;
                        } else {
                            result_tag = mediaTag.def.concat(items[0].tags);
                        }
                        return StorageTagTool.getRelativeTag(result_tag, user, mediaTag.opt).then(function (relative) {
                            var reli = relative.length < 5 ? relative.length : 5;
                            if ((0, _utility.checkAdmin)(2, user)) {
                                if (items[0].adultonly === 1) {
                                    result_tag.push('18+');
                                } else {
                                    mediaTag.opt.push('18+');
                                }
                            }
                            if (items[0].first === 1) {
                                result_tag.push('first item');
                            } else {
                                mediaTag.opt.push('first item');
                            }
                            for (var i = 0; i < reli; i++) {
                                var normal = (0, _tagTool.normalize)(relative[i]);
                                if (!(0, _tagTool.isDefaultTag)(normal)) {
                                    if (!result_tag.includes(normal) && !mediaTag.opt.includes(normal)) {
                                        mediaTag.opt.push(normal);
                                    }
                                }
                            }
                            return _this.handleMediaUpload(mediaType, filePath, items[0]._id, user).then(function () {
                                return {
                                    id: items[0]._id,
                                    name: name,
                                    select: result_tag,
                                    option: mediaTag.opt,
                                    other: others_tag,
                                    adultonly: items[0].adultonly
                                };
                            }).catch(function (err) {
                                return (0, _utility.handleError)(err, errorMedia, items[0]._id, mediaType['fileIndex']);
                            });
                        });
                    });
                });
            });
        });
    },
    handleTag: function handleTag(filePath, DBdata, newName, oldName, status) {
        var ret_mediaType = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : true;

        if (status === 7) {
            return _promise2.default.resolve([false, (0, _mime.extTag)('url'), DBdata]);
        } else if (status === 8) {
            return _promise2.default.resolve([false, {
                def: [],
                opt: []
            }, DBdata]);
        } else if (status === 9) {
            var mediaType = (0, _mime.extType)(newName);
            if (mediaType['type'] === 'zipbook') {
                return _promise2.default.resolve([mediaType, (0, _mime.extTag)(mediaType['type']), (0, _assign2.default)(DBdata, {
                    status: 1,
                    mediaType: mediaType
                })]);
            } else {
                return _promise2.default.resolve([false, {
                    def: [],
                    opt: []
                }, DBdata]);
            }
        } else {
            var _ret = function () {
                var mediaType = (0, _mime.extType)(newName);
                var oldType = (0, _mime.extType)(oldName);
                var mediaTag = {
                    def: [],
                    opt: []
                };
                var handleRest = function handleRest(first) {
                    var isVideo = false;
                    if (DBdata['height']) {
                        if (first) {
                            mediaType['hd'] = getHd(DBdata['height']);
                        }
                        isVideo = true;
                    }
                    if (DBdata['time']) {
                        mediaTag = (0, _mime.extTag)(mediaType['type']);
                        if (mediaType['type'] === 'music' && first) {
                            DBdata['status'] = 4;
                            mediaType = false;
                        } else if (isVideo && mediaType['type'] === 'video') {
                            if (first) {
                                mediaType['time'] = DBdata['time'];
                                DBdata['status'] = 1;
                            }
                            mediaTag.def = mediaTag.def.concat(getTimeTag(DBdata['time'], mediaTag.opt));
                            if (ret_mediaType) {
                                DBdata['mediaType'] = mediaType;
                            }
                        } else {
                            mediaType = false;
                        }
                    } else {
                        mediaType = false;
                    }
                    if (!first) {
                        mediaType = false;
                    }
                };
                var first = mediaType && (status === 0 || status === 1 || status === 5) && (!oldType || mediaType.ext !== oldType.ext || mediaType.type !== oldType.type) ? true : false;
                if (mediaType) {
                    switch (mediaType['type']) {
                        case 'video':
                        case 'music':
                            if (!DBdata['height'] && !DBdata['time']) {
                                return {
                                    v: new _promise2.default(function (resolve, reject) {
                                        return new _streamTranscoder2.default(filePath).on('metadata', function (meta) {
                                            return resolve(meta);
                                        }).on('error', function (err) {
                                            return reject(err);
                                        }).exec();
                                    }).then(function (meta) {
                                        console.log(meta);
                                        if (meta.input.streams) {
                                            var isVideo = false;
                                            var _iteratorNormalCompletion = true;
                                            var _didIteratorError = false;
                                            var _iteratorError = undefined;

                                            try {
                                                for (var _iterator = (0, _getIterator3.default)(meta.input.streams), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                                    var i = _step.value;

                                                    if (i.size) {
                                                        DBdata['height'] = i.size.height;
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

                                            DBdata['time'] = meta.input.duration;
                                        }
                                        handleRest(first);
                                        return [mediaType, mediaTag, DBdata];
                                    })
                                };
                            } else {
                                handleRest(first);
                                return {
                                    v: _promise2.default.resolve([mediaType, mediaTag, DBdata])
                                };
                            }
                            break;
                        case 'image':
                        case 'doc':
                        case 'rawdoc':
                        case 'sheet':
                        case 'present':
                        case 'zipbook':
                        case 'pdf':
                            if (first) {
                                DBdata['status'] = 1;
                                mediaTag = (0, _mime.extTag)(mediaType['type']);
                                if (ret_mediaType) {
                                    DBdata['mediaType'] = mediaType;
                                }
                            } else {
                                mediaType = false;
                            }
                            break;
                        case 'zip':
                            if (first || status === 2) {
                                DBdata['status'] = 1;
                                mediaTag = (0, _mime.extTag)(mediaType['type']);
                                if (ret_mediaType) {
                                    DBdata['mediaType'] = mediaType;
                                }
                            } else {
                                mediaType = false;
                            }
                            break;
                        default:
                            (0, _utility.handleError)(new _utility.HoError('unknown media type!!!'));
                    }
                }
                return {
                    v: _promise2.default.resolve([mediaType, mediaTag, DBdata])
                };
            }();

            if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
        }
    },
    handleMediaUpload: function handleMediaUpload(mediaType, filePath, fileID, user) {
        var _this2 = this;

        var add_noise = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

        if (!mediaType) {
            return _promise2.default.resolve();
        }
        var uploadPath = mediaType['realPath'] ? filePath + '/real/' + mediaType['realPath'] : filePath;
        if (mediaType['type'] === 'pdf') {
            var _ret2 = function () {
                filePath = mediaType['realPath'] ? filePath + '/' + mediaType['fileIndex'] : filePath;
                var comPath = mediaType['realPath'] ? filePath + '_complete' : filePath;
                var pdfPath = filePath + '_pdf';
                console.log(pdfPath);
                (0, _utility.deleteFolderRecursive)(pdfPath);
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return (0, _mkdirp2.default)(pdfPath, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    }).then(function () {
                        return new _promise2.default(function (resolve, reject) {
                            return _child_process2.default.exec('pdftk ' + comPath + ' burst output ' + pdfPath + '/%03d.pdf', function (err, output) {
                                return err ? reject(err) : resolve(output);
                            });
                        });
                    }).then(function () {
                        var number = 0;
                        (0, _fs.readdirSync)(pdfPath).forEach(function (file, index) {
                            return number++;
                        });
                        return completeMedia(fileID, 10, mediaType['fileIndex'], number);
                    })
                };
            }();

            if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
        } else if (mediaType['type'] === 'zipbook') {
            var _ret3 = function () {
                filePath = mediaType['realPath'] ? filePath + '/' + mediaType['fileIndex'] : filePath;
                var imgPath = filePath + '_img';
                var tempPath = imgPath + '/temp';
                (0, _utility.deleteFolderRecursive)(imgPath);
                (0, _utility.deleteFolderRecursive)(tempPath);
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return (0, _mkdirp2.default)(tempPath, function (err) {
                            return err ? reject(err) : resolve();
                        });
                    }).then(function () {
                        var is_processed = false;
                        var append = '';
                        var zip_type = mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr' ? 2 : mediaType['ext'] === '7z' ? 3 : 1;
                        var zipPath = mediaType['realPath'] ? filePath + '_complete' : filePath;
                        if ((0, _fs.existsSync)(filePath + '.1.rar')) {
                            zipPath = filePath + '.1.rar';
                            is_processed = true;
                        } else if ((0, _fs.existsSync)(filePath + '_zip')) {
                            zipPath = filePath + '_zip';
                            is_processed = true;
                        } else if ((0, _fs.existsSync)(filePath + '_7z')) {
                            zipPath = filePath + '_7z';
                            is_processed = true;
                        }
                        if ((0, _fs.existsSync)(filePath + '_zip_c')) {
                            zipPath = filePath + '_zip_c';
                        } else if ((0, _fs.existsSync)(filePath + '_7z_c')) {
                            zipPath = filePath + '_7z_c';
                        }
                        var cmdline = mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr' ? 'unrar x ' + zipPath + ' ' + tempPath : mediaType['ext'] === '7z' ? '7za x ' + zipPath + ' -o' + tempPath : (0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + zipPath + ' ' + tempPath;
                        console.log(cmdline);
                        return new _promise2.default(function (resolve, reject) {
                            return _child_process2.default.exec(cmdline, function (err, output) {
                                return err ? reject(err) : resolve(output);
                            });
                        }).then(function (output) {
                            var zip_arr = [];
                            var recurFolder = function recurFolder(indexFolder, initFolder, preFolder) {
                                (0, _fs.readdirSync)(initFolder).forEach(function (file, index) {
                                    var curPath = initFolder ? initFolder + '/' + file : file;
                                    var showPath = preFolder ? preFolder + '/' + file : file;
                                    if ((0, _fs.lstatSync)(curPath).isDirectory()) {
                                        if (indexFolder < 4) {
                                            recurFolder(indexFolder + 1, curPath, showPath);
                                        }
                                    } else {
                                        if ((0, _mime.isImage)(file)) {
                                            zip_arr.push(showPath);
                                        }
                                    }
                                });
                            };
                            recurFolder(0, tempPath, '');
                            if (zip_arr.length < 1) {
                                (0, _utility.handleError)(new _utility.HoError('empty zip'));
                            }
                            zip_arr = (0, _utility.sortList)(zip_arr);
                            zip_arr.forEach(function (s, i) {
                                return (0, _fs.renameSync)(tempPath + '/' + s, filePath + '_img/' + (Number(i) + 1));
                            });
                            (0, _utility.deleteFolderRecursive)(tempPath);
                            if (!is_processed) {
                                (0, _fs.renameSync)(zipPath, zip_type === 2 ? filePath + '.1.rar' : zip_type === 3 ? filePath + '_7z' : filePath + '_zip');
                            }
                            console.log(zip_arr);
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'media',
                                name: fileID.toString() + '.' + (0, _mime.isImage)(zip_arr[0]),
                                filePath: filePath + '_img/1',
                                rest: function rest(metadata) {
                                    if (!metadata.thumbnailLink) {
                                        (0, _utility.handleError)(new _utility.HoError('error type'));
                                    }
                                    mediaType['thumbnail'] = metadata.thumbnailLink;
                                    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, { $set: (0, _assign2.default)(typeof mediaType['fileIndex'] === 'number' ? (0, _defineProperty3.default)({}, 'present.' + mediaType['fileIndex'], zip_arr.length) : { present: zip_arr.length }, mediaType['realPath'] ? (0, _defineProperty3.default)({}, 'mediaType.' + mediaType['fileIndex'] + '.key', metadata.id) : { 'mediaType.key': metadata.id }) }).then(function (item) {
                                        return _this2.handleMedia(mediaType, filePath, fileID, metadata.id, user);
                                    });
                                },
                                errhandle: function errhandle(err) {
                                    return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                                }
                            });
                        });
                    })
                };
            }();

            if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
        } else if (mediaType['type'] === 'zip') {
            var _ret4 = function () {
                var cmdline = mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr' ? 'unrar v -v ' + filePath : mediaType['ext'] === '7z' ? '7za l ' + filePath : (0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + filePath;
                var zip_type = mediaType['ext'] === 'rar' || mediaType['ext'] === 'cbr' ? 2 : mediaType['ext'] === '7z' ? 3 : 1;
                var is_processed = false;
                var append = '';
                if ((0, _fs.existsSync)(filePath + '.1.rar')) {
                    append = '.1.rar';
                    is_processed = true;
                } else if ((0, _fs.existsSync)(filePath + '_zip')) {
                    append = '_zip';
                    is_processed = true;
                } else if ((0, _fs.existsSync)(filePath + '_7z')) {
                    append = '_7z';
                    is_processed = true;
                }
                if ((0, _fs.existsSync)(filePath + '_zip_c')) {
                    append = '_zip_c';
                } else if ((0, _fs.existsSync)(filePath + '_7z_c')) {
                    append = '_7z_c';
                }
                cmdline = '' + cmdline + append;
                console.log(cmdline);
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return _child_process2.default.exec(cmdline, function (err, output) {
                            return err ? reject(err) : resolve(output);
                        });
                    }).then(function (output) {
                        var tmplist = output.match(/[^\r\n]+/g);
                        if (!tmplist) {
                            (0, _utility.handleError)(new _utility.HoError('is not zip'));
                        }
                        var playlist = [];
                        if (zip_type === 2) {
                            var start = false;
                            for (var i in tmplist) {
                                if (tmplist[i].match(/^-------------------/)) {
                                    start = start ? false : true;
                                } else if (start) {
                                    var tmp = tmplist[i].match(/^[\s]+(\d+)[\s]+\d+[\s]+(\d+%|-->)/);
                                    if (tmp && tmp[1] !== '0') {
                                        var previous = tmplist[i - 1].trim();
                                        playlist.push(previous.match(/^\*/) ? previous.substr(1) : previous);
                                    }
                                }
                            }
                        } else if (zip_type === 3) {
                            var _start = false;
                            var _iteratorNormalCompletion2 = true;
                            var _didIteratorError2 = false;
                            var _iteratorError2 = undefined;

                            try {
                                for (var _iterator2 = (0, _getIterator3.default)(tmplist), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                    var _i = _step2.value;

                                    if (_i.match(/^-------------------/)) {
                                        if (_start) {
                                            break;
                                        } else {
                                            _start = true;
                                        }
                                    } else if (_start) {
                                        var _tmp = _i.substr(0, 38).match(/\d+$/);
                                        if (_tmp && _tmp[0] !== '0') {
                                            playlist.push(_i.substr(53));
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
                        } else {
                            for (var _i2 in tmplist) {
                                if (_i2 !== '0') {
                                    if (!tmplist[_i2].match(/\/$/)) {
                                        playlist.push(tmplist[_i2]);
                                    }
                                }
                            }
                        }
                        if (playlist.length < 1) {
                            (0, _utility.handleError)(new _utility.HoError('empty zip'));
                        }
                        playlist = (0, _utility.sortList)(playlist);
                        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: fileID }, { limit: 1 }).then(function (items) {
                            if (items.length < 1) {
                                (0, _utility.handleError)(new _utility.HoError('cannot find zip'));
                            }
                            var tagSet = new _set2.default();
                            var _iteratorNormalCompletion3 = true;
                            var _didIteratorError3 = false;
                            var _iteratorError3 = undefined;

                            try {
                                for (var _iterator3 = (0, _getIterator3.default)(playlist), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                    var _i3 = _step3.value;

                                    var _mediaType = (0, _mime.extType)(_i3);
                                    if (_mediaType) {
                                        (0, _mime.extTag)(_mediaType['type']).def.forEach(function (j) {
                                            return tagSet.add((0, _tagTool.normalize)(j));
                                        });
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

                            var utags = items[0][user._id] ? items[0][user._id] : [];
                            tagSet.forEach(function (t) {
                                if (!items[0].tags.includes(t)) {
                                    items[0].tags.push(t);
                                    utags.push(t);
                                }
                            });
                            var process = function process() {
                                if (is_processed) {
                                    return _promise2.default.resolve();
                                } else {
                                    (0, _fs.renameSync)(filePath, zip_type === 2 ? filePath + '.1.rar' : zip_type === 3 ? filePath + '_7z' : filePath + '_zip');
                                    return new _promise2.default(function (resolve, reject) {
                                        return (0, _mkdirp2.default)(filePath + '/real', function (err) {
                                            return err ? reject(err) : resolve();
                                        });
                                    });
                                }
                            };
                            return process().then(function () {
                                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, { $set: (0, _defineProperty3.default)({
                                        playList: playlist,
                                        tags: items[0].tags
                                    }, user._id, utags) }).then(function (item) {
                                    return completeMedia(fileID, 9, mediaType['fileIndex']);
                                });
                            });
                        });
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Zip get list fail!!!');
                    })
                };
            }();

            if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
        } else {
            if (mediaType['type'] === 'rawdoc') {
                mediaType['ext'] = 'txt';
            }
            var addNoise = function addNoise() {
                if (add_noise && mediaType['type'] === 'video') {
                    var _ret5 = function () {
                        var cmdline = 'cat ' + _constants.STATIC_PATH + '/noise >> "' + uploadPath + '"';
                        console.log(cmdline);
                        return {
                            v: new _promise2.default(function (resolve, reject) {
                                return _child_process2.default.exec(cmdline, function (err, output) {
                                    return err ? reject(err) : resolve(output);
                                });
                            }).then(function (output) {
                                return (0, _apiToolGoogle2.default)('delete', { fileId: add_noise });
                            })
                        };
                    }();

                    if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
                } else if (mediaType['type'] === 'video' && (0, _fs.statSync)(uploadPath).size > _constants.NOISE_SIZE) {
                    var _ret6 = function () {
                        var cmdline = 'cat ' + _constants.STATIC_PATH + '/noise >> "' + uploadPath + '"';
                        console.log(cmdline);
                        return {
                            v: new _promise2.default(function (resolve, reject) {
                                return _child_process2.default.exec(cmdline, function (err, output) {
                                    return err ? reject(err) : resolve(output);
                                });
                            })
                        };
                    }();

                    if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
                } else {
                    return _promise2.default.resolve();
                }
            };
            console.log(uploadPath);
            return addNoise().then(function () {
                return (0, _apiToolGoogle2.default)('upload', (0, _assign2.default)({
                    type: 'media',
                    name: fileID.toString() + '.' + mediaType['ext'],
                    filePath: uploadPath,
                    rest: function rest(metadata) {
                        if (metadata.exportLinks && metadata.exportLinks['application/pdf']) {
                            mediaType['thumbnail'] = metadata.exportLinks['application/pdf'];
                            if (mediaType['type'] === 'present') {
                                if (!metadata.alternateLink) {
                                    (0, _utility.handleError)(new _utility.HoError('error type'));
                                }
                                mediaType['alternate'] = metadata.alternateLink;
                            }
                        } else if (mediaType['type'] === 'video' && metadata.alternateLink) {
                            mediaType['thumbnail'] = metadata.alternateLink;
                        } else if (metadata.thumbnailLink) {
                            mediaType['thumbnail'] = metadata.thumbnailLink;
                        } else {
                            (0, _utility.handleError)(new _utility.HoError('error type'));
                        }
                        return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, { $set: mediaType['realPath'] ? (0, _defineProperty3.default)({}, 'mediaType.' + mediaType['fileIndex'] + '.key', metadata.id) : { 'mediaType.key': metadata.id } }).then(function (item) {
                            return _this2.handleMedia(mediaType, filePath, fileID, metadata.id, user);
                        });
                    },
                    errhandle: function errhandle(err) {
                        return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                    }
                }, mediaType['type'] === 'doc' || mediaType['type'] === 'rawdoc' || mediaType['type'] === 'sheet' || mediaType['type'] === 'present' ? { convert: true } : {}));
            });
        }
    },
    handleMedia: function handleMedia(mediaType, filePath, fileID, key, user) {
        if (mediaType['type'] === 'image' || mediaType['type'] === 'zipbook') {
            var checkThumb = function checkThumb() {
                return mediaType['thumbnail'] ? _promise2.default.resolve(mediaType['thumbnail']) : (0, _apiToolGoogle2.default)('get', { fileId: key }).then(function (filedata) {
                    console.log(filedata);
                    if (!filedata['thumbnailLink']) {
                        (0, _utility.handleError)(new _utility.HoError('error type'));
                    }
                    return filedata['thumbnailLink'];
                });
            };
            return checkThumb().then(function (thumbnail) {
                return (0, _apiToolGoogle2.default)('download', {
                    user: user,
                    url: thumbnail,
                    filePath: filePath + '.jpg',
                    rest: function rest() {
                        var rest1 = function rest1() {
                            return (0, _apiToolGoogle2.default)('delete', { fileId: key });
                        };
                        return rest1().then(function () {
                            return completeMedia(fileID, 2, mediaType['fileIndex']);
                        });
                    },
                    errhandle: function errhandle(err) {
                        return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                    }
                });
            });
        } else if (mediaType['type'] === 'video') {
            if (!mediaType.hasOwnProperty('time') && !mediaType.hasOwnProperty('hd')) {
                console.log(mediaType);
                (0, _utility.handleError)(new _utility.HoError('video can not be decoded!!!'));
            }
            return (0, _apiToolGoogle2.default)('download media', {
                user: user,
                key: key,
                filePath: mediaType['realPath'] ? filePath + '/' + mediaType['fileIndex'] + '_complete' : filePath + '_complete',
                hd: mediaType['hd'],
                rest: function rest(height) {
                    var setHd = function setHd() {
                        return height ? StorageTagTool.addTag(fileID, height, user) : _promise2.default.resolve();
                    };
                    return setHd().then(function () {
                        return completeMedia(fileID, 3, mediaType['fileIndex']);
                    });
                },
                errhandle: function errhandle(err) {
                    return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                }
            });
        } else if (mediaType['type'] === 'doc' || mediaType['type'] === 'rawdoc' || mediaType['type'] === 'sheet') {
            var _checkThumb = function _checkThumb() {
                return mediaType['thumbnail'] ? _promise2.default.resolve(mediaType['thumbnail']) : (0, _apiToolGoogle2.default)('get', { fileId: key }).then(function (filedata) {
                    console.log(filedata);
                    if (!filedata.exportLinks || !filedata.exportLinks['application/pdf']) {
                        (0, _utility.handleError)(new _utility.HoError('error type'));
                    }
                    return filedata.exportLinks['application/pdf'];
                });
            };
            return _checkThumb().then(function (thumbnail) {
                return (0, _apiToolGoogle2.default)('download doc', {
                    user: user,
                    exportlink: thumbnail,
                    filePath: mediaType['realPath'] ? filePath + '/' + mediaType['fileIndex'] : filePath,
                    rest: function rest(number) {
                        return (0, _apiToolGoogle2.default)('delete', { fileId: key }).then(function () {
                            return completeMedia(fileID, 5, mediaType['fileIndex'], number);
                        });
                    },
                    errhandle: function errhandle(err) {
                        return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                    }
                });
            });
        } else if (mediaType['type'] === 'present') {
            var _checkThumb2 = function _checkThumb2() {
                return mediaType['thumbnail'] ? _promise2.default.resolve([mediaType['thumbnail'], mediaType['alternate']]) : (0, _apiToolGoogle2.default)('get', { fileId: key }).then(function (filedata) {
                    console.log(filedata);
                    if (!filedata.exportLinks || !filedata.exportLinks['application/pdf']) {
                        (0, _utility.handleError)(new _utility.HoError('error type'));
                    }
                    return [filedata.exportLinks['application/pdf'], filedata.alternateLink];
                });
            };
            return _checkThumb2().then(function (_ref6) {
                var _ref7 = (0, _slicedToArray3.default)(_ref6, 2),
                    thumbnail = _ref7[0],
                    alternate = _ref7[1];

                return (0, _apiToolGoogle2.default)('download present', {
                    user: user,
                    exportlink: thumbnail,
                    alternate: alternate,
                    filePath: mediaType['realPath'] ? filePath + '/' + mediaType['fileIndex'] : filePath,
                    rest: function rest(number) {
                        return (0, _apiToolGoogle2.default)('delete', { fileId: key }).then(function () {
                            return completeMedia(fileID, 6, mediaType['fileIndex'], number);
                        });
                    },
                    errhandle: function errhandle(err) {
                        return (0, _utility.handleError)(err, errorMedia, fileID, mediaType['fileIndex']);
                    }
                });
            });
        }
    },
    singleDrive: function singleDrive(metadatalist, index, user, folderId, uploaded, handling, dirpath) {
        var _this3 = this;

        console.log('singleDrive');
        console.log(new Date());
        var metadata = metadatalist[index];
        console.log(metadata);
        var oOID = (0, _mongoTool.objectID)();
        var filePath = (0, _utility.getFileLocation)(user._id, oOID);
        var mkFolder = function mkFolder(folderPath) {
            return (0, _fs.existsSync)(folderPath) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(folderPath, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        };
        var handleDelete = function handleDelete() {
            return !metadata.userPermission || metadata.userPermission.role !== 'owner' ? (0, _apiToolGoogle2.default)('move parent', {
                fileId: metadata.id,
                rmFolderId: handling,
                addFolderId: uploaded
            }) : (0, _apiToolGoogle2.default)('delete', { fileId: metadata.id });
        };
        var handleRest = function handleRest(data, name) {
            var status = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
            var key = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
            var is_handled = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
            return _this3.handleTag(filePath, data, name, '', 0).then(function (_ref8) {
                var _ref9 = (0, _slicedToArray3.default)(_ref8, 3),
                    mediaType = _ref9[0],
                    mediaTag = _ref9[1],
                    DBdata = _ref9[2];

                if (key) {
                    mediaType['key'] = key;
                }
                var setTag = new _set2.default();
                setTag.add((0, _tagTool.normalize)(DBdata['name'])).add((0, _tagTool.normalize)(user.username));
                if (dirpath) {
                    dirpath.forEach(function (p) {
                        return setTag.add((0, _tagTool.normalize)(p));
                    });
                }
                mediaTag.def.forEach(function (i) {
                    return setTag.add((0, _tagTool.normalize)(i));
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
                return (0, _mongoTool2.default)('insert', _constants.STORAGEDB, (0, _assign2.default)(DBdata, (0, _defineProperty3.default)({
                    tags: setArr
                }, user._id, setArr), status ? { status: status } : {})).then(function (item) {
                    console.log(item);
                    console.log('save end');
                    (0, _sendWs2.default)({
                        type: 'file',
                        data: item[0]._id
                    }, item[0].adultonly);
                    return is_handled ? handleDelete() : _this3.handleMediaUpload(mediaType, filePath, item[0]['_id'], user).then(function () {
                        return handleDelete();
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, errorMedia, item[0]['_id'], mediaType['fileIndex']);
                    });
                });
            });
        };
        var handleFile = function handleFile() {
            var name = (0, _utility.toValidName)(metadata.title);
            if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                name = (0, _utility.addPost)(name, '1');
            }
            var adultonly = 0;
            if ((0, _utility.checkAdmin)(2, user)) {
                for (var i in dirpath) {
                    if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(i)).index === 0) {
                        adultonly = 1;
                        break;
                    }
                }
            }
            var data = {
                _id: oOID,
                name: name,
                owner: user._id,
                utime: Math.round(new Date().getTime() / 1000),
                size: metadata.fileSize,
                count: 0,
                first: 1,
                recycle: 0,
                status: 0,
                adultonly: adultonly,
                untag: 0
            };
            var mediaType = (0, _mime.extType)(name);
            switch (mediaType['type']) {
                case 'video':
                    if (!metadata.videoMediaMetadata) {
                        (0, _utility.handleError)(new _utility.HoError('not transcode yet'));
                        /*if (!metadata.userPermission || metadata.userPermission.role === 'owner') {
                            handleError(new HoError('not transcode yet'));
                        }
                        return GoogleApi('copy', {fileId: metadata.id});*/
                    }
                    return (0, _apiToolGoogle2.default)('move parent', {
                        fileId: metadata.id,
                        rmFolderId: folderId,
                        addFolderId: handling
                    }).then(function () {
                        return (0, _fs.existsSync)(filePath) ? (0, _apiToolGoogle2.default)('download media', {
                            user: user,
                            key: metadata.id,
                            filePath: filePath + '_complete',
                            hd: getHd(metadata.videoMediaMetadata.height),
                            rest: function rest() {
                                return handleRest(data, name, 3, metadata.id, true);
                            },
                            errhandle: function errhandle(err) {
                                return (0, _utility.handleError)(err, errDrive, metadata.id, folderId);
                            }
                        }) : (0, _apiToolGoogle2.default)('download', {
                            user: user,
                            url: metadata.downloadUrl,
                            filePath: filePath,
                            rest: function rest() {
                                return (0, _apiToolGoogle2.default)('download media', {
                                    user: user,
                                    key: metadata.id,
                                    filePath: filePath + '_complete',
                                    hd: getHd(metadata.videoMediaMetadata.height),
                                    rest: function rest() {
                                        return handleRest(data, name, 3, metadata.id, true);
                                    },
                                    errhandle: function errhandle(err) {
                                        return (0, _utility.handleError)(err, errDrive, metadata.id, folderId);
                                    }
                                });
                            },
                            errhandle: function errhandle(err) {
                                return (0, _utility.handleError)(err, errDrive, metadata.id, folderId);
                            }
                        });
                    }).catch(function (err) {
                        return errDrive(err, metadata.id, folderId);
                    });
                default:
                    return (0, _apiToolGoogle2.default)('move parent', {
                        fileId: metadata.id,
                        rmFolderId: folderId,
                        addFolderId: handling
                    }).then(function () {
                        return (0, _fs.existsSync)(filePath) ? handleRest(data, name) : (0, _apiToolGoogle2.default)('download', {
                            user: user,
                            url: metadata.downloadUrl,
                            filePath: filePath,
                            rest: function rest() {
                                return handleRest(data, name);
                            },
                            errhandle: function errhandle(err) {
                                return (0, _utility.handleError)(err, errDrive, metadata.id, folderId);
                            }
                        });
                    }).catch(function (err) {
                        return errDrive(err, metadata.id, folderId);
                    });
            }
        };
        var handleNext = function handleNext() {
            index++;
            if (index < metadatalist.length) {
                _this3.singleDrive(metadatalist, index, user, folderId, uploaded, handling, dirpath);
            }
        };
        return mkFolder((0, _path.dirname)(filePath)).then(function () {
            return handleFile();
        }).then(function () {
            return handleNext();
        }).catch(function (err) {
            (0, _utility.handleError)(err, 'Single Drive');
            return handleNext();
        });
    },
    checkMedia: function checkMedia() {
        var _this4 = this;

        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { mediaType: { $exists: true } }).then(function (items) {
            if (items.length > 0) {
                var _ret7 = function () {
                    var timeoutItems = [];
                    items.forEach(function (i) {
                        if (i.mediaType.type) {
                            if (i.mediaType.timeout) {
                                timeoutItems.push({
                                    item: i,
                                    mediaType: i.mediaType
                                });
                            }
                        } else {
                            var is_empty = true;
                            for (var j in i.mediaType) {
                                is_empty = false;
                                if (i.mediaType[j].timeout) {
                                    timeoutItems.push({
                                        item: i,
                                        mediaType: i.mediaType[j]
                                    });
                                }
                            }
                            if (is_empty) {
                                (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: i._id }, { $unset: { mediaType: '' } }).catch(function (err) {
                                    return (0, _utility.handleError)(err, 'Clean playlist');
                                });
                            }
                        }
                    });
                    console.log(timeoutItems);
                    if (timeoutItems.length > 0) {
                        var _ret8 = function () {
                            var recur_check = function recur_check(index) {
                                var single_check = function single_check() {
                                    var filePath = (0, _utility.getFileLocation)(timeoutItems[index].item.owner, timeoutItems[index].item._id);
                                    if (timeoutItems[index].mediaType.key) {
                                        if (timeoutItems[index].mediaType['realPath']) {
                                            if ((0, _fs.existsSync)(filePath + '/' + timeoutItems[index].mediaType['fileIndex'] + '_complete')) {
                                                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: timeoutItems[index].item._id }, { $set: (0, _defineProperty3.default)({}, 'mediaType.' + timeoutItems[index].mediaType['fileIndex'] + '.timeout', false) }).then(function (item) {
                                                    return _this4.handleMedia(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, timeoutItems[index].mediaType.key, {
                                                        _id: timeoutItems[index].item.owner,
                                                        perm: 1
                                                    }).catch(function (err) {
                                                        return (0, _utility.handleError)(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex']);
                                                    });
                                                });
                                            }
                                        } else {
                                            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: timeoutItems[index].item._id }, { $set: { 'mediaType.timeout': false } }).then(function (item) {
                                                return _this4.handleMedia(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, timeoutItems[index].mediaType.key, {
                                                    _id: timeoutItems[index].item.owner,
                                                    perm: 1
                                                }).catch(function (err) {
                                                    return (0, _utility.handleError)(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex']);
                                                });
                                            });
                                        }
                                    } else if (timeoutItems[index].mediaType['realPath']) {
                                        if ((0, _fs.existsSync)(filePath + '/' + timeoutItems[index].mediaType['fileIndex'] + '_complete')) {
                                            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: timeoutItems[index].item._id }, { $set: (0, _defineProperty3.default)({}, 'mediaType.' + timeoutItems[index].mediaType['fileIndex'] + '.timeout', false) }).then(function (item) {
                                                return _this4.handleMediaUpload(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, {
                                                    _id: timeoutItems[index].item.owner,
                                                    perm: 1
                                                }).catch(function (err) {
                                                    return (0, _utility.handleError)(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex']);
                                                });
                                            });
                                        }
                                    } else {
                                        return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: timeoutItems[index].item._id }, { $set: { 'mediaType.timeout': false } }).then(function (item) {
                                            return _this4.handleMediaUpload(timeoutItems[index].mediaType, filePath, timeoutItems[index].item._id, {
                                                _id: timeoutItems[index].item.owner,
                                                perm: 1
                                            }).catch(function (err) {
                                                return (0, _utility.handleError)(err, errorMedia, timeoutItems[index].item._id, timeoutItems[index].mediaType['fileIndex']);
                                            });
                                        });
                                    }
                                };
                                return single_check().then(function () {
                                    index++;
                                    if (index < timeoutItems.length) {
                                        return recur_check(index);
                                    }
                                });
                            };
                            return {
                                v: {
                                    v: recur_check(0)
                                }
                            };
                        }();

                        if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
                    }
                }();

                if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
            }
        });
    }
};
var completeMedia = exports.completeMedia = function completeMedia(fileID, status, fileIndex) {
    var number = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, (0, _assign2.default)({
        $set: (0, _assign2.default)({ status: typeof fileIndex === 'number' ? 9 : status }, number && number > 1 ? typeof fileIndex === 'number' ? (0, _defineProperty3.default)({}, 'present.' + fileIndex, number) : { present: number } : {}, status === 3 ? typeof fileIndex === 'number' ? (0, _defineProperty3.default)({}, 'mediaType.' + fileIndex + '.complete', true) : { 'mediaType.complete': true } : {})
    }, status === 3 ? {} : { $unset: typeof fileIndex === 'number' ? (0, _defineProperty3.default)({}, 'mediaType.' + fileIndex, '') : { mediaType: '' } })).then(function () {
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: fileID }, { limit: 1 });
    }).then(function (items) {
        if (items.length < 1) {
            (0, _utility.handleError)(new _utility.HoError('cannot find file!!!'));
        }
        console.log(items);
        (0, _sendWs2.default)({
            type: 'file',
            data: items[0]._id
        }, items[0].adultonly);
    });
};

var errorMedia = exports.errorMedia = function errorMedia(err, fileID, fileIndex) {
    var _ref13;

    return err.name === 'HoError' && err.message === 'timeout' ? (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, { $set: typeof fileIndex === 'number' ? (_ref13 = {}, (0, _defineProperty3.default)(_ref13, 'mediaType.' + fileIndex + '.timeout', true), (0, _defineProperty3.default)(_ref13, 'status', 9), _ref13) : { 'mediaType.timeout': true } }).then(function () {
        console.log(123);
        console.log(fileID);
        console.log(typeof fileIndex === 'undefined' ? 'undefined' : (0, _typeof3.default)(fileIndex));
        console.log(err);
        console.log(fileIndex);
        throw err;
    }) : (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: fileID }, { $set: typeof fileIndex === 'number' ? (0, _defineProperty3.default)({}, 'mediaType.' + fileIndex + '.err', err) : { 'mediaType.err': err } }).then(function () {
        console.log(456);
        console.log(fileID);
        console.log(err);
        console.log(typeof fileIndex === 'undefined' ? 'undefined' : (0, _typeof3.default)(fileIndex));
        console.log(fileIndex);
        throw err;
    });
};

var getHd = function getHd(height) {
    return height >= 2160 ? 2160 : height >= 1440 ? 1440 : height >= 1080 ? 1080 : height >= 720 ? 720 : height >= 480 ? 480 : height >= 360 ? 360 : height >= 240 ? 240 : 0;
};

var getTimeTag = function getTimeTag(time, opt) {
    if (time < 20 * 60 * 1000) {
        return [];
    } else if (time < 40 * 60 * 1000) {
        return opt.splice(2, 2);
    } else if (time < 60 * 60 * 1000) {
        return opt.splice(4, 2);
    } else {
        return opt.splice(0, 2);
    }
};

var errDrive = function errDrive(err, key, folderId) {
    return (0, _apiToolGoogle2.default)('move parent', {
        fileId: key,
        rmFolderId: handling,
        addFolderId: folderId
    }).then(function () {
        throw err;
    });
};
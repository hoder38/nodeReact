'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _crypto = require('crypto');

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);
var PasswordTagTool = (0, _tagTool2.default)(_constants.PASSWORDDB);
var StockTagTool = (0, _tagTool2.default)(_constants.STOCKDB);
var FitnessTagTool = (0, _tagTool2.default)(_constants.FITNESSDB);
var RankTagTool = (0, _tagTool2.default)(_constants.RANKDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

//storage
router.get('/' + _constants.STORAGEDB + '/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?', function (req, res, next) {
    console.log('get storage bookmark list');
    StorageTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(function (result) {
        return res.json({ bookmarkList: result.bookmarkList });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.STORAGEDB + '/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('get storage bookmark');
    StorageTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStorageItem)(req.user, result.items, result.mediaHadle),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.STORAGEDB + '/add', function (req, res, next) {
    console.log('storage add bookmark');
    var name = (0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild');
    StorageTagTool.addBookmark(name, req.user, req.session).then(function (result) {
        var parentList = StorageTagTool.searchTags(req.session).getArray();
        if (parentList.cur.length <= 0) {
            (0, _utility.handleError)(new _utility.HoError('empty parent list!!!'));
        }
        return newBookmarkItem(name, req.user, req.session, parentList.cur, parentList.exactly).then(function (_ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 4),
                bid = _ref2[0],
                bname = _ref2[1],
                select = _ref2[2],
                option = _ref2[3];

            return res.json((0, _assign2.default)(result, bid ? {
                bid: bid,
                bname: bname,
                other: []
            } : {}, select ? { select: select } : {}, option ? { option: option } : {}));
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

function newBookmarkItem(name, user, session, bpath, bexactly) {
    var bookmark_md5 = (0, _crypto.createHash)('md5').update(bpath.map(function (b, i) {
        return bexactly[i] ? b + '/1' : b + '/0';
    }).join('/')).digest('hex');
    return (0, _mongoTool2.default)('count', _constants.STORAGEDB, { bmd5: bookmark_md5 }).then(function (count) {
        if (count > 0) {
            return [null, null, null, null];
        }
        //000開頭讓排序在前
        if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
            name = (0, _mime.addPost)(name, '1');
        }
        var data = {
            _id: (0, _mongoTool.objectID)(),
            owner: user._id,
            utime: Math.round(new Date().getTime() / 1000),
            bmd5: bookmark_md5,
            btag: bpath,
            bexactly: bexactly,
            size: 0,
            count: 0,
            first: 1,
            recycle: 0,
            adultonly: 0,
            untag: 1,
            status: 8
        };
        var setTag = new _set2.default(['bookmark', '書籤']);
        setTag.add((0, _tagTool.normalize)(name)).add((0, _tagTool.normalize)(user.username));
        var channel = false;
        bpath.forEach(function (b) {
            var normal = (0, _tagTool.normalize)(b);
            var is_d = (0, _tagTool.isDefaultTag)(normal);
            if (!is_d) {
                setTag.add(normal);
            } else if (is_d.index === 0) {
                data['adultonly'] = 1;
            } else if (is_d.index === 30) {
                is_d = (0, _tagTool.isDefaultTag)(b);
                if (is_d[1] === 'ch') {
                    channel = is_d[2];
                }
            }
        });
        StorageTagTool.searchTags(session).getArray().cur.forEach(function (p) {
            var normal = (0, _tagTool.normalize)(p);
            var is_d = (0, _tagTool.isDefaultTag)(normal);
            if (!is_d) {
                setTag.add(normal);
            } else if (is_d.index === 0) {
                data['adultonly'] = 1;
            }
        });
        var getChannel = function getChannel() {
            return channel ? (0, _apiToolGoogle2.default)('y channel', { id: channel }).then(function (metadata) {
                var bookName = '000 Channel ' + name;
                setTag.add((0, _tagTool.normalize)(bookName)).add('channel').add('youtube').add('頻道');
                data['name'] = bookName;
                var keywords = metadata.items[0].brandingSettings.channel.keywords;
                if (keywords) {
                    keywords = keywords.split(',');
                    if (keywords.length === 1) {
                        var k1 = keywords[0].match(/\"[^\"]+\"/g);
                        keywords = keywords[0].replace(/\"[^\"]+\"/g, '').trim().split(/[\s]+/);
                        k1.forEach(function (k) {
                            return keywords.push(k.match(/[^\"]+/)[0]);
                        });
                    }
                    keywords.forEach(function (k) {
                        return setTag.add((0, _tagTool.normalize)(k));
                    });
                }
                return bookName;
            }) : StorageTagTool.getRelativeTag(bpath, user, [], bexactly).then(function (btags) {
                btags.forEach(function (b) {
                    return setTag.add((0, _tagTool.normalize)(b));
                });
                var bookName = '000 Bookmark ' + name;
                setTag.add((0, _tagTool.normalize)(bookName));
                data['name'] = bookName;
                return bookName;
            });
        };
        return getChannel().then(function (bname) {
            var setArr = [];
            setTag.forEach(function (s) {
                var is_d = (0, _tagTool.isDefaultTag)(s);
                if (!is_d) {
                    setArr.push(s);
                } else if (is_d.index === 0) {
                    data['adultonly'] = 1;
                }
            });
            data['tags'] = setArr;
            data[user._id] = setArr;
            return (0, _mongoTool2.default)('insert', _constants.STORAGEDB, data).then(function (item) {
                console.log(item);
                console.log('save end');
                (0, _sendWs2.default)({
                    type: 'file',
                    data: item[0]._id
                }, item[0].adultonly);
                var opt = [];
                var _iteratorNormalCompletion = true;
                var _didIteratorError = false;
                var _iteratorError = undefined;

                try {
                    for (var _iterator = (0, _getIterator3.default)(_constants.GENRE_LIST_CH), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                        var g = _step.value;

                        if (!setArr.includes(g)) {
                            opt.push(g);
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

                return StorageTagTool.getRelativeTag(setArr, user, opt).then(function (relative) {
                    var reli = relative.length < 5 ? relative.length : 5;
                    if ((0, _utility.checkAdmin)(2, user)) {
                        item[0].adultonly === 1 ? setArr.push('18+') : opt.push('18+');
                    }
                    item[0].first === 1 ? setArr.push('first item') : opt.push('first item');
                    for (var i = 0; i < reli; i++) {
                        var normal = (0, _tagTool.normalize)(relative[i]);
                        if (!(0, _tagTool.isDefaultTag)(normal)) {
                            if (!setArr.includes(normal) && !opt.includes(normal)) {
                                opt.push(normal);
                            }
                        }
                    }
                    return [item[0]._id, bname, setArr, opt];
                });
            });
        });
    });
}

router.delete('/' + _constants.STORAGEDB + '/del/:id', function (req, res, next) {
    console.log('del storage bookmark');
    StorageTagTool.delBookmark(req.params.id).then(function (result) {
        return res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.STORAGEDB + '/set/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('set storage bookmark');
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
        _id: (0, _utility.isValidString)(req.params.id, 'uid', 'bookmark is not vaild'),
        status: 8
    }, { limit: 1 }).then(function (items) {
        if (items.length < 1 || !items[0].btag || !items[0].bexactly) {
            (0, _utility.handleError)(new _utility.HoError('can not find object!!!'));
        }
        return StorageTagTool.setLatest(items[0]._id, req.session).then(function () {
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $inc: { count: 1 } });
        }).then(function () {
            return StorageTagTool.setBookmark(items[0].btag, items[0].bexactly, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
                return res.json({
                    itemList: (0, _utility.getStorageItem)(req.user, result.items, result.mediaHadle),
                    parentList: result.parentList,
                    latest: result.latest
                });
            });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.STORAGEDB + '/subscript/:id', function (req, res, next) {
    console.log('subscipt storage bookmark');
    if (req.body.path.length <= 0 || req.body.exactly.length <= 0) {
        (0, _utility.handleError)(new _utility.HoError('empty parent list!!!'));
    }
    var name = (0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild');
    var id = req.params.id.match(/^(you|ypl|kub|yif|mad|bbl|c99)_(.*)$/) ? (0, _utility.isValidString)(req.params.id, 'name', 'youtube is not vaild') : (0, _utility.isValidString)(req.params.id, 'uid', 'uid is not vaild');
    var bpath = req.body.path.map(function (p) {
        return (0, _utility.isValidString)(p, 'name', 'path name is not vaild');
    });
    var bexactly = req.body.exactly.map(function (e) {
        return e ? true : false;
    });
    StorageTagTool.addBookmark(name, req.user, req.session, bpath, bexactly).then(function (result) {
        return newBookmarkItem(name, req.user, req.session, bpath, bexactly).then(function (_ref3) {
            var _ref4 = (0, _slicedToArray3.default)(_ref3, 4),
                bid = _ref4[0],
                bname = _ref4[1],
                select = _ref4[2],
                option = _ref4[3];

            StorageTagTool.setLatest(id, req.session).then(function () {
                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $inc: { count: 1 } });
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            res.json((0, _assign2.default)(result, bid ? {
                bid: bid,
                bname: bname,
                other: []
            } : {}, select ? { select: select } : {}, option ? { option: option } : {}));
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//password
router.get('/' + _constants.PASSWORDDB + '/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?', function (req, res, next) {
    console.log('get password bookmark list');
    PasswordTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(function (result) {
        return res.json({ bookmarkList: result.bookmarkList });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.PASSWORDDB + '/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('get password bookmark');
    PasswordTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getPasswordItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.PASSWORDDB + '/add', function (req, res, next) {
    console.log('password add bookmark');
    PasswordTagTool.addBookmark((0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.PASSWORDDB + '/del/:id', function (req, res, next) {
    console.log('del password bookmark');
    PasswordTagTool.delBookmark(req.params.id).then(function (result) {
        return res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//stock
router.get('/' + _constants.STOCKDB + '/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?', function (req, res, next) {
    console.log('get stock bookmark list');
    StockTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(function (result) {
        return res.json({ bookmarkList: result.bookmarkList });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.STOCKDB + '/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('get stock bookmark');
    StockTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStockItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.STOCKDB + '/add', function (req, res, next) {
    console.log('stock add bookmark');
    StockTagTool.addBookmark((0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.STOCKDB + '/del/:id', function (req, res, next) {
    console.log('del stock bookmark');
    StockTagTool.delBookmark(req.params.id).then(function (result) {
        return res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//fitness
router.get('/' + _constants.FITNESSDB + '/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?', function (req, res, next) {
    console.log('get fitness bookmark list');
    FitnessTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(function (result) {
        return res.json({ bookmarkList: result.bookmarkList });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.FITNESSDB + '/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('get fitness bookmark');
    FitnessTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getFitnessItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.FITNESSDB + '/add', function (req, res, next) {
    console.log('fitness add bookmark');
    FitnessTagTool.addBookmark((0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.FITNESSDB + '/del/:id', function (req, res, next) {
    console.log('del fitness bookmark');
    FitnessTagTool.delBookmark(req.params.id).then(function (result) {
        return res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//rank
router.get('/' + _constants.RANKDB + '/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?', function (req, res, next) {
    console.log('get rank bookmark list');
    RankTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(function (result) {
        return res.json({ bookmarkList: result.bookmarkList });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.RANKDB + '/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('get rank bookmark');
    RankTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getRankItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.RANKDB + '/add', function (req, res, next) {
    console.log('rank add bookmark');
    RankTagTool.addBookmark((0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.RANKDB + '/del/:id', function (req, res, next) {
    console.log('del rank bookmark');
    RankTagTool.delBookmark(req.params.id).then(function (result) {
        return res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;
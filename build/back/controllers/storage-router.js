'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _utility = require('../util/utility');

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _externalTool = require('../models/external-tool');

var _externalTool2 = _interopRequireDefault(_externalTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

var _mime = require('../util/mime');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var OPTION_TAG = (0, _mime.getOptionTag)();
var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('storage reset');
    StorageTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStorageItem)(req.user, result.items),
            parentList: result.parentList
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('storage');
    StorageTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
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

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('storage get single');
    var page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        StorageTagTool.searchTags(req.session).resetArray();
    }
    StorageTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
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

router.get('/getRandom/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)', function (req, res, next) {
    console.log('storage random');
    (0, _redisTool2.default)('hgetall', 'tag: ' + req.user._id).then(function (items) {
        var count_list = OPTION_TAG.map(function (t) {
            var ret = 1;
            for (var i in items) {
                if (i === t) {
                    ret += Number(items[i]);
                    break;
                }
            }
            return ret;
        });
        return count_list;
    }).then(function (count) {
        var choose = (0, _utility.selectRandom)(count);
        var genre = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];
        var music_genre = [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
        var game_genre = [0, 4, 12, 24, 25, 42, 44, 45, 46, 47, 48, 49, 50];
        var random_tag = [OPTION_TAG[choose]];
        if (choose === 0) {
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [1, 2])]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose > 0 && choose < 3) {
            //pic type
            random_tag.splice(0, 0, OPTION_TAG[0]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose === 3) {
            //pic book
            random_tag.splice(0, 0, OPTION_TAG[0]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [1, 2])]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose === 4) {
            //video
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [5, 6, 7])]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose === 6) {
            //video type && video cate
            var mtype = (0, _utility.selectRandom)(count, [5, 6, 7]);
            if (mtype === 6) {
                random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
            } else {
                random_tag.splice(0, 0, OPTION_TAG[mtype]);
            }
            random_tag.splice(0, 0, OPTION_TAG[4]);
        } else if (choose > 4 && choose < 8) {
            //video type
            random_tag.splice(0, 0, OPTION_TAG[4]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose === 8) {
            //audio
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [9, 10, 11])]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, music_genre)]);
        } else if (choose === 10) {
            //audio type && video cate
            var mtype = (0, _utility.selectRandom)(count, [4, 8]);
            if (mtype === 4) {
                random_tag.splice(0, 0, OPTION_TAG[(0, _utility.selectRandom)(count, [5, 6, 7])]);
                random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
            } else {
                random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, music_genre)]);
            }
            random_tag.splice(0, 0, OPTION_TAG[mtype]);
        } else if (choose > 8 && choose < 12) {
            //audio type
            random_tag.splice(0, 0, OPTION_TAG[8]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, music_genre)]);
        } else if (choose === 12) {
            //doc
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [13, 14, 17, 18])]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose > 12 && choose < 15 || choose > 16 && choose < 19) {
            //doc type
            random_tag.splice(0, 0, OPTION_TAG[12]);
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, genre)]);
        } else if (choose === 15) {
            //pre
        } else if (choose === 16) {
            //sheet
        } else if (choose === 19) {
            //url
            random_tag.push(OPTION_TAG[(0, _utility.selectRandom)(count, [20, 21])]);
        } else if (choose > 19 && choose < 22) {
            //url type
            random_tag.splice(0, 0, OPTION_TAG[19]);
        } else if (choose === 22) {
            //zip
            random_tag.push(OPTION_TAG[23]);
        } else if (choose === 23) {
            //zip type
            random_tag.splice(0, 0, OPTION_TAG[22]);
        } else if (choose === 24 || choose === 25 || choose === 40) {
            //g m 9
            var _mtype = (0, _utility.selectRandom)(count, game_genre);
            if (_mtype > 23) {
                random_tag.splice(0, 0, '遊戲');
            } else {
                random_tag.splice(0, 0, OPTION_TAG[_mtype === 0 ? 2 : _mtype === 4 ? (0, _utility.selectRandom)(count, [5, 6, 7]) : (0, _utility.selectRandom)(count, [13, 14])]);
                random_tag.splice(0, 0, OPTION_TAG[_mtype]);
            }
        } else if (choose > 23 && choose < 44) {
            var _mtype2 = (0, _utility.selectRandom)(count, [0, 4, 12]);
            random_tag.splice(0, 0, OPTION_TAG[_mtype2 === 0 ? 2 : _mtype2 === 4 ? (0, _utility.selectRandom)(count, [5, 6, 7]) : (0, _utility.selectRandom)(count, [13, 14])]);
            random_tag.splice(0, 0, OPTION_TAG[_mtype2]);
        } else if (choose > 43 && choose < 51) {
            random_tag.splice(0, 0, '遊戲');
        } else if (choose > 50 && choose < 72) {
            random_tag.splice(0, 0, OPTION_TAG[(0, _utility.selectRandom)(count, [9, 10, 11])]);
            random_tag.splice(0, 0, OPTION_TAG[8]);
        } else {
            random_tag.splice(0, 0, '18+');
        }
        if (random_tag[0] === '影片') {
            var _mtype3 = 0;
            if (random_tag[1] === '電影') {
                _mtype3 = (0, _utility.selectRandom)([10, 1, 1, 1, 1]);
                if (_mtype3 === 3) {
                    //yify
                    random_tag = ['yify movie', 'no local', random_tag.splice(random_tag.length - 1, 1)[0]];
                } else if (_mtype3 === 4) {
                    //bilibili
                    random_tag = ['bilibili movie', 'no local'];
                }
            } else if (random_tag[1] === '動畫') {
                _mtype3 = (0, _utility.selectRandom)([8, 1, 1, 1]);
                if (_mtype3 === 3) {
                    //bilibili
                    random_tag = ['bilibili animation', 'no local'];
                }
            } else if (random_tag[1] === '電視劇') {
                _mtype3 = (0, _utility.selectRandom)([8, 1, 1]);
            }
            if (_mtype3 === 1) {
                random_tag = ['youtube video', 'no local'];
            } else if (_mtype3 === 2) {
                random_tag = ['youtube playlist', 'no local'];
            }
        } else if (random_tag[0] === '圖片' && (random_tag[1] === '漫畫' || random_tag[2] === '漫畫')) {
            var _mtype4 = (0, _utility.selectRandom)([4, 1]);
            if (_mtype4 === 1) {
                random_tag = ['cartoonmad comic', 'no local', OPTION_TAG[(0, _utility.selectRandom)(count, [24, 25, 27, 28, 32, 34, 35, 37, 38, 39, 40])]];
            }
        } else if (random_tag[0] === '音頻') {
            var _mtype5 = (0, _utility.selectRandom)([4, 1, 1]);
            if (_mtype5 === 1) {
                random_tag = ['music', 'youtube music', 'no local'];
            } else if (_mtype5 === 2) {
                random_tag = ['music', 'youtube music playlist', 'no local'];
            }
        }
        return random_tag;
    }).then(function (random) {
        StorageTagTool.searchTags(req.session).setArray('', random, random.map(function (t) {
            return true;
        }));
        return StorageTagTool.tagQuery(0, null, null, null, req.params.sortName, req.params.sortType, req.user, req.session);
    }).then(function (result) {
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

router.get('/single/:uid', function (req, res, next) {
    console.log('storage single');
    StorageTagTool.singleQuery(req.params.uid, req.user, req.session).then(function (result) {
        return result.empty ? res.json(result) : res.json({ item: (0, _utility.getStorageItem)(req.user, [result.item], result.mediaHadle)[0] });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/external/get/:sortName(name|mtime|count)/:pageToken?', function (req, res, next) {
    console.log('external get');
    var parentList = StorageTagTool.searchTags(req.session).getArray();
    var index = req.params.pageToken ? Number(req.params.pageToken.match(/^\d+/)) : 1;
    var pageToken = req.params.pageToken ? req.params.pageToken.match(/[^\d]+$/) : false;
    var itemList = [];
    _externalTool2.default.getSingleList('yify', StorageTagTool.getYifyQuery(parentList.cur, req.params.sortName, index)).then(function (list) {
        return itemList = list.map(function (item) {
            return {
                name: item.name,
                id: 'yif_' + item.id,
                tags: [].concat((0, _toConsumableArray3.default)(item.tags), ['first item']),
                recycle: 0,
                isOwn: false,
                utime: new Date(item.date).getTime() / 1000,
                thumb: item.thumb,
                noDb: true,
                status: 3,
                count: item.rating
            };
        });
    }).then(function () {
        return _externalTool2.default.getSingleList('bilibili', StorageTagTool.getBiliQuery(parentList.cur, req.params.sortName, index));
    }).then(function (list) {
        return itemList = [].concat((0, _toConsumableArray3.default)(itemList), (0, _toConsumableArray3.default)(list.map(function (item) {
            return {
                name: item.name,
                id: 'bbl_' + item.id,
                tags: [].concat((0, _toConsumableArray3.default)(item.tags), ['first item']),
                recycle: 0,
                isOwn: false,
                utime: item.date,
                thumb: item.thumb,
                noDb: true,
                status: 3,
                count: item.count
            };
        })));
    }).then(function () {
        var query = StorageTagTool.getMadQuery(parentList.cur, req.params.sortName, index);
        return query.post ? _externalTool2.default.getSingleList('cartoonmad', query.url, query.post) : _externalTool2.default.getSingleList('cartoonmad', query);
    }).then(function (list) {
        return itemList = [].concat((0, _toConsumableArray3.default)(itemList), (0, _toConsumableArray3.default)(list.map(function (item) {
            return {
                name: item.name,
                id: 'mad_' + item.id,
                tags: [].concat((0, _toConsumableArray3.default)(item.tags), ['first item']),
                recycle: 0,
                isOwn: false,
                utime: 0,
                thumb: item.thumb,
                noDb: true,
                status: 2,
                count: 0
            };
        })));
    }).then(function () {
        return StorageTagTool.getYoutubeQuery(parentList.cur, req.params.sortName, pageToken);
    }).then(function (query) {
        return query ? (0, _apiToolGoogle2.default)('y search', query).then(function (data) {
            return (0, _apiToolGoogle2.default)('y video', { id: data.video }).then(function (list) {
                itemList = [].concat((0, _toConsumableArray3.default)(itemList), (0, _toConsumableArray3.default)(getYoutubeItem(list, data.type)));
                return (0, _apiToolGoogle2.default)('y playlist', { id: data.playlist });
            }).then(function (list) {
                return res.json({
                    itemList: [].concat((0, _toConsumableArray3.default)(itemList), (0, _toConsumableArray3.default)(getYoutubeItem(list, data.type))),
                    pageToken: data.nextPageToken ? '' + (index + 1) + data.nextPageToken : '' + (index + 1)
                });
            });
        }) : res.json({
            itemList: itemList,
            pageToken: '' + (index + 1)
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

function getYoutubeItem(items, type) {
    var itemList = [];
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = (0, _getIterator3.default)(items), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var i = _step.value;

            if (i.snippet) {
                itemList.push({
                    name: i.kind === 'youtube#playlist' ? i.snippet.title + ' [playlist]' : i.snippet.title,
                    id: i.kind === 'youtube#playlist' ? 'ypl_' + i.id : 'you_' + i.id,
                    tags: i.snippet.tags ? [].concat((0, _toConsumableArray3.default)(i.snippet.tags), ['first item']) : ['first item'],
                    recycle: 0,
                    isOwn: false,
                    utime: new Date(i.snippet.publishedAt.match(/^\d\d\d\d-\d\d-\d\d/)[0]).getTime() / 1000,
                    thumb: i.snippet.thumbnails.default ? i.snippet.thumbnails.default.url : i.snippet.thumbnails.standard.url,
                    cid: i.snippet.channelId,
                    ctitle: i.snippet.channelTitle,
                    noDb: true,
                    count: i.statistics ? i.statistics.viewCount : 301,
                    status: i.kind === 'youtube#playlist' && Math.floor(type / 10) === 2 || i.kind !== 'youtube#playlist' && type % 10 === 2 ? 4 : 3
                });
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

    return itemList;
}

router.post('/getOptionTag', function (req, res, next) {
    console.log('storage option tag');
    var optionList = (0, _utility.checkAdmin)(2, req.user) ? new _set2.default(['first item', '18+']) : new _set2.default(['first item']);
    req.body.tags.length > 0 ? StorageTagTool.getRelativeTag(req.body.tags, req.user, [].concat((0, _toConsumableArray3.default)(optionList))).then(function (relative) {
        var reli = relative.length < 5 ? relative.length : 5;
        for (var i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        if (req.body.tags.includes('18+')) {
            _constants.ADULT_LIST.forEach(function (a) {
                return optionList.add(a);
            });
        } else if (req.body.tags.includes('game') || req.body.tags.includes('遊戲')) {
            _constants.GAME_LIST_CH.forEach(function (g) {
                return optionList.add(g);
            });
        } else if (req.body.tags.includes('audio') || req.body.tags.includes('音頻')) {
            _constants.MUSIC_LIST.forEach(function (m) {
                return optionList.add(m);
            });
        } else {
            _constants.GENRE_LIST_CH.forEach(function (g) {
                return optionList.add(g);
            });
        }
        res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList)) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    }) : res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList), (0, _toConsumableArray3.default)(_constants.GENRE_LIST_CH)) });
});

router.put('/addTag/:tag', function (req, res, next) {
    console.log('storage addTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : StorageTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'file',
                    data: result.id
                }, result.adultonly);
            }
            return new _promise2.default(function (resolve) {
                return setTimeout(function () {
                    return resolve(recur(index + 1));
                }, 500);
            });
        });
    };
    recur(0).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/sendTag/:uid', function (req, res, next) {
    console.log('storage sendTag');
    StorageTagTool.sendTag(req.params.uid, req.body.name, req.body.tags, req.user).then(function (result) {
        (0, _sendWs2.default)({
            type: 'file',
            data: result.id
        }, result.adultonly);
        res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/addTagUrl', function (req, res, next) {
    console.log('storage addTagUrl');
    var url = (0, _utility.isValidString)(req.body.url, 'url', 'invalid tag url');
    var getTaglist = function getTaglist() {
        if (req.body.url.match(/^(http|https):\/\/store\.steampowered\.com\/app\//)) {
            console.log('steam');
            return _externalTool2.default.parseTagUrl('steam', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/www\.imdb\.com\/title\//)) {
            console.log('imdb');
            return _externalTool2.default.parseTagUrl('imdb', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/www\.allmusic\.com\//)) {
            console.log('allmusic');
            return _externalTool2.default.parseTagUrl('allmusic', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/marvel\.wikia\.com\/wiki\//)) {
            console.log('marvel');
            return _externalTool2.default.parseTagUrl('marvel', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/dc\.wikia\.com\/wiki\//)) {
            console.log('dc');
            return _externalTool2.default.parseTagUrl('dc', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/thetvdb\.com\//)) {
            console.log('tvdb');
            return _externalTool2.default.parseTagUrl('tvdb', req.body.url);
        } else {
            return _promise2.default.reject(new _utility.HoError('invalid tag url'));
        }
    };
    getTaglist().then(function (taglist) {
        var recur = function recur(index, u) {
            var adultonly = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
            return index >= taglist.length ? _promise2.default.resolve((0, _sendWs2.default)({
                type: 'file',
                data: u
            }, adultonly)) : StorageTagTool.addTag(u, taglist[index], req.user, false).then(function (result) {
                return new _promise2.default(function (resolve) {
                    return setTimeout(function () {
                        return resolve(recur(index + 1, u, result.adultonly));
                    }, 500);
                });
            });
        };
        var recur_add = function recur_add(index) {
            return index >= req.body.uids.length ? res.json({ apiOK: true }) : recur(0, req.body.uids[index]).then(function () {
                return recur_add(index + 1);
            });
        };
        return req.body.uids ? recur_add(0) : res.json({ tags: taglist });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/delTag/:tag', function (req, res, next) {
    console.log('storage delTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : StorageTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'file',
                    data: result.id
                }, result.adultonly);
            }
            return new _promise2.default(function (resolve) {
                return setTimeout(function () {
                    return resolve(recur(index + 1));
                }, 500);
            });
        });
    };
    recur(0).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/recover/:uid', function (req, res, next) {
    console.log('storage recover file');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        console.log(user);
        (0, _utility.handleError)(new _utility.HoError('permission denied'));
    }
    return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
        if (items.length === 0) {
            (0, _utility.handleError)(new _utility.HoError('file can not be fund!!!'));
        }
        if (items[0].recycle !== 1) {
            (0, _utility.handleError)(new _utility.HoError('recycle file first!!!'));
        }
        return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $set: { recycle: 0 } }).then(function (item2) {
            (0, _sendWs2.default)({
                type: 'file',
                data: items[0]._id
            }, items[0].adultonly);
            res.json({ apiOK: true });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/media/saveParent/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('media saveParent');
    StorageTagTool.searchTags(req.session).saveArray((0, _utility.isValidString)(req.body.name, 'name', 'name is not vaild'), req.params.sortName, req.params.sortType);
    res.json({ apiOK: true });
});

router.get('/media/setTime/:id/:type/:obj?/:pageToken?/:back(back)?', function (req, res, next) {
    console.log('media setTime');
    var id = req.params.id.match(/^(you|ypl|yif|mad|bbl)_(.*)$/);
    var playlist = 0;
    var playlistId = null;
    var obj = req.params.obj;
    if (id) {
        if (id[1] === 'ypl') {
            playlist = 1;
            playlistId = id[2];
        } else if (id[1] === 'kub') {
            playlist = 3;
            playlistId = id[2];
        } else if (id[1] === 'yif') {
            playlist = 4;
            playlistId = id[2];
        } else if (id[1] === 'mad') {
            playlist = 5;
            playlistId = id[2];
        } else if (id[1] === 'bbl') {
            playlist = 6;
            playlistId = id[2];
        }
        id = (0, _utility.isValidString)(req.params.id, 'name', 'youtube is not vaild');
    } else {
        id = (0, _utility.isValidString)(req.params.id, 'uid', 'file is not vaild');
        if (obj && obj.match(/^(you_.*|external|\d+(\.\d+)?)$/)) {
            playlist = 2;
            if (obj === 'external') {
                obj = null;
            }
        }
    }
    var type = (0, _utility.isValidString)(req.params.type, 'name', 'type is not vaild');
    var first = function first() {
        if (playlist && obj) {
            if (!obj.match(/^(you_|\d+(\.\d+)?$)/)) {
                (0, _utility.handleError)(new _utility.HoError('external is not vaild'));
            }
            obj = (0, _utility.isValidString)(obj, 'name', 'external is not vaild');
            var pageToken = req.params.pageToken ? (0, _utility.isValidString)(req.params.pageToken, 'name') : false;
            return (0, _redisTool2.default)('hmset', 'record: ' + req.user._id, (0, _defineProperty3.default)({}, id.toString(), pageToken ? obj + '>>' + pageToken : obj));
        } else {
            return _promise2.default.resolve();
        }
    };
    var setTag = function setTag(id) {
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items) {
            var multi_cli = [];
            if (items.length > 0 && items[0].tags) {
                items[0].tags.forEach(function (t) {
                    if (OPTION_TAG.includes(t)) {
                        multi_cli.push(['hincrby', 'tag: ' + req.user._id, t, 1]);
                    }
                });
            }
            return (0, _redisTool2.default)('multi', multi_cli).then(function (ret) {
                return (0, _redisTool2.default)('hget', 'record: ' + req.user._id, id.toString());
            });
        });
    };
    var getRecord = function getRecord() {
        return type === 'url' ? _promise2.default.resolve({ apiOK: true }) : setTag(id).then(function (item) {
            var recordTime = 1;
            var rPageToken = null;
            if (item) {
                var timeMatch = item.match(/^(.*)>>(.*)$/);
                if (timeMatch) {
                    recordTime = timeMatch[1];
                    rPageToken = timeMatch[2];
                } else {
                    recordTime = item;
                }
            }
            var ret_rest = function ret_rest(obj, is_end, total) {
                var obj_arr = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
                var pageN = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;
                var pageP = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : null;
                var pageToken = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : null;
                var is_new = arguments.length > 7 && arguments[7] !== undefined ? arguments[7] : false;

                if (total < 1) {
                    (0, _utility.handleError)(new _utility.HoError('playlist is empty'));
                }
                var new_rest = function new_rest(is_new) {
                    return is_new ? (0, _redisTool2.default)('hmset', 'record: ' + req.user._id, (0, _defineProperty3.default)({}, id.toString(), pageToken ? obj.id + '>>' + pageToken : obj.id)) : _promise2.default.resolve();
                };
                return new_rest(is_new).then(function () {
                    return obj.id ? setTag(obj.id).then(function (item1) {
                        return (0, _assign2.default)({ playlist: (0, _assign2.default)({
                                obj: obj,
                                end: is_end,
                                total: total
                            }, obj_arr ? {
                                obj_arr: obj_arr,
                                pageN: pageN,
                                pageP: pageP,
                                pageToken: pageToken
                            } : {}) }, item1 && type !== 'music' ? { time: item1 } : {});
                    }) : { playlist: {
                            obj: obj,
                            end: is_end,
                            total: total
                        } };
                });
            };
            if (playlist) {
                if (playlist === 1) {
                    return _externalTool2.default.youtubePlaylist(playlistId, recordTime, rPageToken, req.params.back).then(function (_ref) {
                        var _ref2 = (0, _slicedToArray3.default)(_ref, 8),
                            obj = _ref2[0],
                            is_end = _ref2[1],
                            total = _ref2[2],
                            obj_arr = _ref2[3],
                            pageN = _ref2[4],
                            pageP = _ref2[5],
                            pageToken = _ref2[6],
                            is_new = _ref2[7];

                        return ret_rest(obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new);
                    });
                } else if (playlist === 2) {
                    return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: id }, { limit: 1 }).then(function (items1) {
                        if (items1.length < 1) {
                            (0, _utility.handleError)(new _utility.HoError('cannot find external'));
                        }
                        return _externalTool2.default.getSingleId(items1[0].owner, decodeURIComponent(items1[0].url), recordTime, rPageToken, req.params.back).then(function (_ref3) {
                            var _ref4 = (0, _slicedToArray3.default)(_ref3, 8),
                                obj = _ref4[0],
                                is_end = _ref4[1],
                                total = _ref4[2],
                                obj_arr = _ref4[3],
                                pageN = _ref4[4],
                                pageP = _ref4[5],
                                pageToken = _ref4[6],
                                is_new = _ref4[7];

                            return ret_rest(obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new);
                        });
                    });
                } else if (playlist > 2) {
                    var playurl = null;
                    var playtype = null;
                    if (playlist === 4) {
                        playurl = 'https://yts.ag/api/v2/movie_details.json?movie_id=' + playlistId;
                        playtype = 'yify';
                    } else if (playlist === 5) {
                        playurl = 'http://www.cartoomad.com/comic/' + playlistId + '.html';
                        playtype = 'cartoonmad';
                    } else if (playlist === 6) {
                        playurl = playlistId.match(/^av/) ? 'http://www.bilibili.com/video/' + playlistId + '/' : 'http://www.bilibili.com/bangumi/i/' + playlistId + '/';
                        playtype = 'bilibili';
                    }
                    return _externalTool2.default.getSingleId(playtype, playurl, recordTime).then(function (_ref5) {
                        var _ref6 = (0, _slicedToArray3.default)(_ref5, 3),
                            obj = _ref6[0],
                            is_end = _ref6[1],
                            total = _ref6[2];

                        return ret_rest(obj, is_end, total);
                    });
                }
            } else {
                return item && type !== 'music' ? { time: item } : { apiOK: true };
            }
        });
    };
    first().then(function () {
        return getRecord();
    }).then(function (result) {
        StorageTagTool.setLatest(id, req.session, type === 'url' ? false : type).then(function () {
            return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: id }, { $inc: { count: 1 } });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, 'Set latest');
        });
        res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/media/record/:id/:time/:pId?', function (req, res, next) {
    console.log('media record');
    if (!req.params.time.match(/^\d+(&\d+|\.\d+)?$/)) {
        (0, _utility.handleError)(new _utility.HoError('timestamp is not vaild'));
    }
    var id = req.params.id.match(/^(you|dym|bil|mad|yuk|ope)_/) ? (0, _utility.isValidString)(req.params.id, 'name', 'external is not vaild') : (0, _utility.isValidString)(req.params.id, 'uid', 'file is not vaild');
    var data = req.params.time === '0' ? ['hdel', id.toString()] : ['hmset', (0, _defineProperty3.default)({}, id.toString(), req.params.time)];
    return (0, _redisTool2.default)(data[0], 'record: ' + req.user._id, data[1]).then(function (ret) {
        return res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/media/more/:type(\\d+)/:page(\\d+)/:back(back)?', function (req, res, next) {
    console.log('more media');
    var saveName = '';
    var type = Number(req.params.type);
    switch (type) {
        case 2:
            saveName = 'image';
            break;
        case 3:
            saveName = 'video';
            break;
        case 4:
            saveName = 'music';
            break;
        default:
            (0, _utility.handleError)(new _utility.HoError('unknown type'));
    }
    var sql = StorageTagTool.saveSql(Number(req.params.page), saveName, req.params.back, req.user, req.session);
    if (!sql) {
        (0, _utility.handleError)(new _utility.HoError('query error'));
    }
    console.log(sql);
    if (sql.empty) {
        res.json({ itemList: [] });
    } else {
        if (type === 2) {
            sql.nosql['$or'] = [{ status: 2 }, { status: 5 }, { status: 6 }, { status: 10 }];
        } else {
            sql.nosql['status'] = type;
        }
        (0, _mongoTool2.default)('find', _constants.STORAGEDB, sql.nosql, sql.select, sql.options).then(function (items) {
            return res.json({
                itemList: (0, _utility.getStorageItem)(req.user, items),
                parentList: sql.parentList
            });
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    }
});

router.get('/torrent/query/:id', function (req, res, next) {
    console.log('torrent query');
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { _id: (0, _utility.isValidString)(req.params.id, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
        if (items.length < 1 || items[0].status !== 9) {
            (0, _utility.handleError)(new _utility.HoError('playlist can not be fund!!!'));
        }
        return (0, _redisTool2.default)('hget', 'record: ' + req.user._id, items[0]._id.toString()).then(function (item) {
            StorageTagTool.setLatest(items[0]._id, req.session).then(function () {
                return (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $inc: { count: 1 } });
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            res.json((0, _assign2.default)({
                id: items[0]._id,
                list: items[0].playList.map(function (l, i) {
                    var doc = 0;
                    var type = 1;
                    var ext = (0, _mime.isDoc)(l);
                    if (ext) {
                        type = 2;
                        doc = ext.type === 'present' ? 1 : ext.type === 'pdf' ? 3 : 2;
                    }
                    return (0, _assign2.default)({
                        name: l,
                        type: type === 2 || (0, _mime.isImage)(l) || (0, _mime.isZipbook)(l) ? 2 : (0, _mime.isVideo)(l) ? 3 : (0, _mime.isMusic)(l) ? 4 : 1,
                        doc: doc
                    }, items[0].present && items[0].present[i] ? { present: items[0].present[i] } : {});
                })
            }, item ? { time: item } : {}));
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/zipPassword/:uid', function (req, res, next) {
    console.log('zip password');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid', 'file is not vaild');
    var pwd = (0, _utility.isValidString)(req.body.pwd, 'altpwd', 'password is not vaild');
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
        _id: id,
        status: 9
    }, { limit: 1 }).then(function (items) {
        if (items.length < 1) {
            (0, _utility.handleError)(new _utility.HoError('zip can not be fund!!!'));
        }
        return (0, _mongoTool2.default)('update', _constants.STORAGEDB, {
            _id: id,
            status: 9
        }, { $set: { pwd: pwd } }).then(function (item) {
            return res.json({ apiOk: true });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;
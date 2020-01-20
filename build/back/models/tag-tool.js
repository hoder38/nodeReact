'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.completeMimeTag = undefined;

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

exports.default = process;
exports.isDefaultTag = isDefaultTag;
exports.normalize = normalize;

var _ver = require('../../../ver');

var _config = require('../config');

var _constants = require('../constants');

var _utility = require('../util/utility');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _mime = require('../util/mime');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function process(collection) {
    var getQuerySql = null;
    var getQueryTag = null;
    var getSortName = null;
    var parent_arr = [];
    switch (collection) {
        case _constants.STORAGEDB:
            getQuerySql = getStorageQuerySql;
            getQueryTag = getStorageQueryTag;
            getSortName = getStorageSortName;
            parent_arr = _constants.STORAGE_PARENT;
            break;
        case _constants.PASSWORDDB:
            getQuerySql = getPasswordQuerySql;
            getQueryTag = getPasswordQueryTag;
            getSortName = getPasswordSortName;
            parent_arr = _constants.PASSWORD_PARENT;
            break;
        case _constants.STOCKDB:
            getQuerySql = getStockQuerySql;
            getQueryTag = getStockQueryTag;
            getSortName = getStockSortName;
            parent_arr = _constants.STOCK_PARENT;
            break;
        case _constants.FITNESSDB:
            getQuerySql = getFitnessQuerySql;
            getQueryTag = getFitnessQueryTag;
            getSortName = getFitnessSortName;
            parent_arr = _constants.FITNESS_PARENT;
            break;
        case _constants.RANKDB:
            getQuerySql = getRankQuerySql;
            getQueryTag = getRankQueryTag;
            getSortName = getRankSortName;
            parent_arr = _constants.RANK_PARENT;
            break;
        default:
            return false;
    }
    var inParentArray = function inParentArray(parent) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = (0, _getIterator3.default)(parent_arr), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var p = _step.value;

                if (p.name === parent) {
                    return true;
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

        return false;
    };
    var getLatest = function getLatest(bookmark) {
        return (0, _mongoTool2.default)('find', collection + 'User', { _id: (0, _mongoTool.objectID)(bookmark) }, { limit: 1 }).then(function (items) {
            if (items.length > 0 && items[0].latest) {
                var youtubeMatch = items[0].latest.toString().match(/^y_(.*)$/);
                return youtubeMatch ? youtubeMatch[1] : items[0].latest;
            } else {
                return false;
            }
        });
    };
    var returnPath = function returnPath(items, parentList) {
        return parentList.bookmark ? getLatest(parentList.bookmark).then(function (latest) {
            return latest ? {
                items: items,
                parentList: parentList,
                latest: latest,
                bookmark: parentList.bookmark
            } : {
                items: items,
                parentList: parentList,
                bookmark: parentList.bookmark
            };
        }) : _promise2.default.resolve({
            items: items,
            parentList: parentList
        });
    };
    return {
        tagQuery: function tagQuery(page, tagName, exactly, index, sortName, sortType, user, session) {
            var customLimit = arguments.length > 8 && arguments[8] !== undefined ? arguments[8] : _constants.QUERY_LIMIT;

            var tags = this.searchTags(session);
            var parentList = null;
            if (!tagName) {
                parentList = tags.getArray();
            } else if (!index) {
                var defau = isDefaultTag(normalize(tagName));
                var validTagName = '';
                if (collection === _constants.STOCKDB && defau.index === 31 || collection === _constants.STORAGEDB && defau.index === 31) {
                    validTagName = tagName;
                } else {
                    validTagName = (0, _utility.isValidString)(tagName, 'name');
                    if (!validTagName) {
                        return (0, _utility.handleError)(new _utility.HoError('name not vaild!!!'));
                    }
                }
                parentList = tags.getArray(validTagName, exactly);
            } else {
                var _defau = isDefaultTag(normalize(tagName));
                var _validTagName = '';
                if (collection === _constants.STOCKDB && _defau.index === 31 || collection === _constants.STORAGEDB && _defau.index === 31) {
                    _validTagName = tagName;
                } else {
                    _validTagName = (0, _utility.isValidString)(tagName, 'name');
                    if (!_validTagName) {
                        return (0, _utility.handleError)(new _utility.HoError('name not vaild!!!'));
                    }
                }
                var validIndex = (0, _utility.isValidString)(index, 'parentIndex');
                if (!validIndex) {
                    return (0, _utility.handleError)(new _utility.HoError('parentIndex is not vaild!!!'));
                }
                parentList = tags.getArray(_validTagName, exactly, validIndex);
            }
            var sql = getQuerySql(user, parentList.cur, parentList.exactly);
            return sql ? (0, _mongoTool2.default)('find', collection, sql.nosql, sql.select ? sql.select : {}, (0, _assign2.default)({
                limit: customLimit,
                skip: page,
                sort: [[getSortName(sortName), sortType]]
            }, sql.skip ? { skip: page + sql.skip } : {}, sql.hint ? { hint: sql.hint } : {})).then(function (items) {
                var getCount = function getCount() {
                    return collection === _constants.FITNESSDB ? (0, _mongoTool2.default)('find', collection + 'Count', {
                        owner: user._id,
                        itemId: { '$in': items.map(function (i) {
                                return i._id;
                            }) }
                    }).then(function (counts) {
                        return items.map(function (i) {
                            var _iteratorNormalCompletion2 = true;
                            var _didIteratorError2 = false;
                            var _iteratorError2 = undefined;

                            try {
                                for (var _iterator2 = (0, _getIterator3.default)(counts), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                    var c = _step2.value;

                                    if (i._id.equals(c.itemId)) {
                                        i['count'] = c['count'];
                                        return i;
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

                            i['count'] = 0;
                            return i;
                        });
                    }) : _promise2.default.resolve(items);
                };
                return getCount().then(function (items) {
                    return sql.nosql.mediaType ? {
                        items: items,
                        parentList: parentList,
                        mediaHadle: 1
                    } : returnPath(items, parentList);
                });
            }) : returnPath([], parentList);
        },
        singleQuery: function singleQuery(uid, user, session) {
            var id = (0, _utility.isValidString)(uid, 'uid');
            if (!id) {
                return (0, _utility.handleError)(new _utility.HoError('uid is not vaild!!!'));
            }
            var parentList = this.searchTags(session).getArray();
            var sql = getQuerySql(user, parentList.cur, parentList.exactly);
            if (sql) {
                sql.nosql['_id'] = id;
                return (0, _mongoTool2.default)('find', collection, sql.nosql, sql.select ? sql.select : {}, {
                    limit: 1,
                    hint: { _id: 1 }
                }).then(function (items) {
                    var getCount = function getCount() {
                        return collection === _constants.FITNESSDB ? (0, _mongoTool2.default)('find', collection + 'Count', {
                            owner: user._id,
                            itemId: items[0]._id
                        }).then(function (counts) {
                            return [(0, _assign2.default)(items[0], { count: counts.length < 1 ? 0 : counts[0]['count'] })];
                        }) : _promise2.default.resolve(items);
                    };
                    return items.length < 1 ? { empty: true } : getCount().then(function (items) {
                        return sql.nosql.mediaType ? {
                            item: items[0],
                            mediaHadle: 1
                        } : { item: items[0] };
                    });
                });
            } else {
                return { empty: true };
            }
        },
        resetQuery: function resetQuery(sortName, sortType, user, session) {
            var parentList = this.searchTags(session).resetArray();
            var sql = getQuerySql(user, parentList.cur, parentList.exactly);
            return sql ? (0, _mongoTool2.default)('find', collection, sql.nosql, sql.select ? sql.select : {}, (0, _assign2.default)({
                limit: _constants.QUERY_LIMIT,
                sort: [[getSortName(sortName), sortType]]
            }, sql.hint ? { hint: sql.hint } : {})).then(function (items) {
                var getCount = function getCount() {
                    return collection === _constants.FITNESSDB ? (0, _mongoTool2.default)('find', collection + 'Count', {
                        owner: user._id,
                        itemId: { '$in': items.map(function (i) {
                                return i._id;
                            }) }
                    }).then(function (counts) {
                        return items.map(function (i) {
                            var _iteratorNormalCompletion3 = true;
                            var _didIteratorError3 = false;
                            var _iteratorError3 = undefined;

                            try {
                                for (var _iterator3 = (0, _getIterator3.default)(counts), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                    var c = _step3.value;

                                    if (i._id.equals(c.itemId)) {
                                        i['count'] = c['count'];
                                        return i;
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

                            i['count'] = 0;
                            return i;
                        });
                    }) : _promise2.default.resolve(items);
                };
                return getCount().then(function (items) {
                    return {
                        items: items,
                        parentList: parentList
                    };
                });
            }) : {
                items: [],
                parentList: parentList
            };
        },
        getYoutubeQuery: function getYoutubeQuery(search_arr, sortName, pageToken) {
            var query = {
                type: 0,
                maxResults: _constants.QUERY_LIMIT,
                order: sortName === 'count' ? 'viewCount' : sortName === 'mtime' ? 'date' : 'relevance'
            };
            var query_arr = [];
            var id_arr = [];
            var pl_arr = [];
            var _iteratorNormalCompletion4 = true;
            var _didIteratorError4 = false;
            var _iteratorError4 = undefined;

            try {
                for (var _iterator4 = (0, _getIterator3.default)(search_arr), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                    var i = _step4.value;

                    var index = isDefaultTag(normalize(i));
                    if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                        query_arr.push(denormalize(i));
                        //ymp
                    } else if (index.index === 11) {
                        query.type = 20 + query.type % 10;
                        //ym
                    } else if (index.index === 10) {
                        query.type = Math.floor(query.type / 10) * 10 + 2;
                        //yp
                    } else if (index.index === 9) {
                        query.type = 10 + query.type % 10;
                        //yv
                    } else if (index.index === 8 || index.index === 22) {
                        query.type = Math.floor(query.type / 10) * 10 + 1;
                    } else if (index.index === 30) {
                        var index1 = isDefaultTag(i);
                        if (index1[1] === 'ou') {
                            id_arr.push(index1[2]);
                        } else if (index1[1] === 'pl') {
                            pl_arr.push(index1[2]);
                        } else if (index1[1] === 'ch') {
                            query.channelId = index1[2];
                        } else {
                            query_arr.push(i);
                        }
                    }
                }
            } catch (err) {
                _didIteratorError4 = true;
                _iteratorError4 = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion4 && _iterator4.return) {
                        _iterator4.return();
                    }
                } finally {
                    if (_didIteratorError4) {
                        throw _iteratorError4;
                    }
                }
            }

            if (!query.type) {
                return false;
            }
            if (!query.channelId) {
                if (query_arr.length > 0) {
                    query.keyword = query_arr.join(' ');
                }
            }
            if (pageToken) {
                query.pageToken = pageToken;
            } else {
                if (id_arr.length > 0) {
                    query.id_arr = id_arr;
                }
                if (pl_arr.length > 0) {
                    query.pl_arr = pl_arr;
                }
            }
            return query;
        },
        getYifyQuery: function getYifyQuery(search_arr, sortName, page) {
            var search = false;
            var genre = null;
            var query_term = null;
            search_arr.forEach(function (s) {
                var normal = normalize(s);
                var index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (_constants.GENRE_LIST.includes(normal)) {
                        genre = normal;
                        query_term = null;
                    } else if (_constants.GENRE_LIST_CH.includes(normal)) {
                        genre = _constants.GENRE_LIST[_constants.GENRE_LIST_CH.indexOf(normal)];
                        query_term = null;
                    } else {
                        query_term = s;
                        genre = null;
                    }
                } else if (index.index === 13 || index.index === 22) {
                    search = true;
                }
            });
            if (search) {
                var url = 'https://yts.ag/api/v2/list_movies.json?sort_by=' + (sortName === 'count' ? 'rating' : sortName === 'mtime' ? 'year' : 'date_added');
                if (page > 1) {
                    url = url + '&page=' + page;
                }
                if (query_term) {
                    url = url + '&query_term=' + query_term;
                }
                if (genre) {
                    url = url + '&genre=' + genre;
                }
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getBiliQuery: function getBiliQuery(search_arr, sortName, page) {
            var is_movie = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

            var order = sortName === 'mtime' ? 2 : 0;
            var mOrder = sortName === 'count' ? 'hot' : 'default';
            var sOrder = sortName === 'count' ? 'click' : null;
            var s_country = -1;
            var s_year = 0;
            var query_term = null;
            var search = 0;
            search_arr.forEach(function (s) {
                var normal = normalize(s);
                var index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (s.match(/^\d\d\d\d$/)) {
                        if (Number(s) < 2100 && Number(s) > 1800) {
                            s_year = Number(s);
                            query_term = null;
                            s_country = -1;
                        } else {
                            query_term = s;
                            s_year = 0;
                            s_country = -1;
                        }
                    } else if (_constants.BILI_TYPE.includes(normal)) {
                        s_year = 0;
                        s_country = _constants.BILI_TYPE.indexOf(normal);
                        query_term = null;
                    } else {
                        s_year = 0;
                        query_term = denormalize(s);
                        s_country = -1;
                    }
                } else if (!is_movie && index.index === 15) {
                    search = 1;
                } else if (is_movie && index.index === 16) {
                    search = 2;
                }
            });
            if (search) {
                var url = '';
                if (query_term) {
                    var s_append = search === 2 ? sOrder ? '&tids_1=23&duration=4&order=&{sOrder}' : '&tids_1=23&duration=4' : '';
                    url = 'http://search.bilibili.com/ajax_api/' + (search === 2 ? 'video' : 'bangumi') + '?keyword=' + query_term + s_append;
                    if (page > 1) {
                        url = url + '&page=' + page;
                    }
                } else {
                    if (search === 2) {
                        var ch_type = 0;
                        var ch_page = 0;
                        if (s_country !== -1 && s_country !== 12) {
                            switch (s_country) {
                                case 0:
                                case 3:
                                case 4:
                                    ch_type = 147;
                                    break;
                                case 1:
                                    ch_type = 146;
                                    break;
                                case 2:
                                    ch_type = 145;
                                    break;
                                default:
                                    ch_type = 83;
                                    break;
                            }
                            ch_page = page;
                        } else {
                            if (page % 4 === 1) {
                                ch_type = 147;
                                ch_page = Math.round((page + 3) / 4);
                            } else if (page % 4 === 2) {
                                ch_type = 146;
                                ch_page = Math.round((page + 2) / 4);
                            } else if (page % 4 === 3) {
                                ch_type = 145;
                                ch_page = Math.round((page + 1) / 4);
                            } else {
                                ch_type = 83;
                                ch_page = Math.round(page / 4);
                            }
                        }
                        var d = new Date();
                        var pd = new Date(new Date(d).setMonth(d.getMonth() - 3));
                        url = 'http://www.bilibili.com/list/' + mOrder + '-' + ch_type + '-' + ch_page + '-' + pd.getFullYear() + '-' + (pd.getMonth() + 1) + '-' + (pd.getDate() + 1) + '~' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '.html';
                    } else {
                        if (s_country === 12) {
                            var _d = new Date();
                            var _pd = new Date(new Date(_d).setMonth(_d.getMonth() - 3));
                            url = 'http://www.bilibili.com/list/' + mOrder + '-32-' + page + '-' + _pd.getFullYear() + '-' + (_pd.getMonth() + 1) + '-' + (_pd.getDate() + 1) + '~' + _d.getFullYear() + '-' + (_d.getMonth() + 1) + '-' + _d.getDate() + '.html';
                        } else {
                            url = 'http://www.bilibili.com/api_proxy?app=bangumi&pagesize=20&action=site_season_index&page=' + page + '&indexType=' + order;
                            if (s_country !== -1) {
                                url = url + '&seasonArea=' + _constants.BILI_INDEX[s_country];
                            }
                            if (s_year) {
                                url = url + '&startYear=' + s_year;
                            }
                        }
                    }
                }
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getMadQuery: function getMadQuery(search_arr, sortName, page) {
            var query_term = null;
            var search = false;
            var tag = -1;
            var area = -1;
            var st = 0;
            var group = 0;
            var a18 = 0;
            search_arr.forEach(function (s) {
                var normal = normalize(s);
                var index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (index.index === 0) {
                        a18 = 1;
                    } else if (index.index === 6) {
                        a18 = 0;
                    } else {
                        var mIndex = _constants.DM5_LIST.indexOf(normal);
                        if (mIndex !== -1) {
                            if (mIndex < 21) {
                                tag = mIndex;
                            } else if (mIndex < 23) {
                                st = mIndex - 20;
                            } else if (mIndex < 26) {
                                group = mIndex - 22;
                            } else {
                                area = mIndex - 26;
                            }
                        } else {
                            query_term = s;
                        }
                    }
                } else if (index.index === 14 || index.index === 22) {
                    search = true;
                }
            });
            if (search) {
                query_term = a18 ? null : query_term;
                if (query_term) {
                    var url = 'http://www.dm5.com/search.ashx?d=1549960254987&language=1&t=' + query_term;
                    console.log(url);
                    return url;
                } else {
                    if (a18) {
                        tag = '-tag61';
                    } else {
                        tag = tag !== -1 ? '-tag' + _constants.DM5_TAG_LIST[tag] : '';
                    }
                    group = group ? '-group' + group : '';
                    st = st ? '-st' + st : '';
                    area = area !== -1 ? '-area' + _constants.DM5_AREA_LIST[area] : '';
                    var s = sortName === 'mtime' ? '-s2' : '';
                    var p = page > 1 ? '-p' + page : '';
                    var _url = 'http://www.dm5.com/manhua-list' + area + tag + group + st + s + p + '/';
                    console.log(_url);
                    return _url;
                }
            } else {
                return false;
            }
        },
        getKuboQuery: function getKuboQuery(search_arr, sortName, page) {
            var searchWord = null;
            var year = 0;
            var type = 0;
            var country = '';
            search_arr.forEach(function (s) {
                var normal = normalize(s);
                var index = isDefaultTag(normal);
                if (!index || index.index === 0 || index.index === 6 || index.index === 17) {
                    if (s.match(/^\d\d\d\d$/)) {
                        if (Number(s) < 2100 && Number(s) > 1800) {
                            year = Number(s);
                            searchWord = null;
                            country = '';
                        } else {
                            searchWord = s;
                            year = 0;
                            country = '';
                        }
                    } else if (_constants.KUBO_COUNTRY.includes(normal)) {
                        country = normal;
                        searchWord = null;
                        year = 0;
                    } else {
                        searchWord = s;
                        year = 0;
                        country = '';
                    }
                    //movie
                } else if (index.index === 18) {
                    type = 1;
                    //tv series
                } else if (index.index === 19) {
                    type = 2;
                    //tv show
                } else if (index.index === 20) {
                    type = 41;
                    //animation
                } else if (index.index === 21 || index.index === 22) {
                    type = 3;
                }
            });
            if (type) {
                var order = sortName === 'mtime' ? 'vod_addtime' : 'vod_hits_month';
                var sOrder = sortName === 'mtime' ? 1 : 2;
                var url = searchWord ? 'http://www.58b.tv/index.php?s=Vod-innersearch-q-' + searchWord + '-order-' + sOrder + '-page-' + page : 'http://www.58b.tv/vod-search-id-' + type + '-cid--tag--area-' + country + '-tag--year-' + year + '-wd--actor--order-' + order + '%20desc-p-' + page + '.html';
                console.log(url);
                return url;
            } else {
                return false;
            }
        },
        getRelativeTag: function getRelativeTag(tag_arr, user, pre_arr) {
            var exactly_arr = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

            var q_path = [];
            var normal = null;
            if (exactly_arr) {
                q_path = tag_arr;
            } else {
                q_path = ['all item'];
                var name = (0, _utility.isValidString)(tag_arr[(0, _utility.selectRandom)(tag_arr.length)], 'name');
                if (name === false) {
                    return _promise2.default.resolve(pre_arr);
                }
                console.log(name);
                normal = normalize(name);
                if (isDefaultTag(normal)) {
                    return _promise2.default.resolve(pre_arr);
                }
                q_path.push(normal);
                exactly_arr = [true, false];
            }
            var sql = getQuerySql(user, q_path, exactly_arr ? exactly_arr : q_path.map(function (q) {
                return false;
            }));
            return (0, _mongoTool2.default)('find', collection, sql.nosql, {
                _id: 0,
                tags: 1,
                name: 1
            }, (0, _assign2.default)({
                limit: _constants.RELATIVE_LIMIT,
                sort: [[getSortName('name'), 'desc']]
            }, sql.hint ? { hint: sql.hint } : {})).then(function (items) {
                var relative_arr = [];
                if (items.length > 0) {
                    (function () {
                        var u = _constants.RELATIVE_UNION;
                        var t = _constants.RELATIVE_INTER;
                        var counter_arr = [];
                        var index = items[0].tags.indexOf(normalize(items[0].name));
                        if (index !== -1) {
                            items[0].tags.splice(index, 1);
                        }
                        items[0].tags.forEach(function (e) {
                            if (!pre_arr.includes(e) && normal !== e) {
                                relative_arr.push(e);
                                counter_arr.push(0);
                            }
                        });
                        for (var i = 1; i < items.length; i++) {
                            if (t) {
                                var index1 = items[i].tags.indexOf(normalize(items[i].name));
                                if (index1 !== -1) {
                                    items[i].tags.splice(index1, 1);
                                }
                                items[i].tags.forEach(function (e) {
                                    if (!pre_arr.includes(e) && normal !== e) {
                                        var index2 = relative_arr.indexOf(e);
                                        if (index2 === -1) {
                                            relative_arr.push(e);
                                            counter_arr.push(0);
                                        } else {
                                            counter_arr[index2]++;
                                        }
                                    }
                                });
                                t--;
                            } else {
                                break;
                            }
                        }

                        var _loop = function _loop(_i) {
                            var index1 = items[_i].tags.indexOf(normalize(items[_i].name));
                            if (index1 !== -1) {
                                items[_i].tags.splice(index1, 1);
                            }
                            var temp = [];
                            relative_arr = relative_arr.filter(function (e, j) {
                                if (!pre_arr.includes(e) && normal !== e) {
                                    if (items[_i].tags.indexOf(e) !== -1) {
                                        temp.push(counter_arr[j] + 1);
                                        return true;
                                    } else {
                                        if (counter_arr[j] + _constants.RELATIVE_INTER >= _i) {
                                            temp.push(counter_arr[j]);
                                            return true;
                                        }
                                    }
                                }
                            });
                            counter_arr = temp;
                        };

                        for (var _i = _constants.RELATIVE_INTER + 1; _i < items.length; _i++) {
                            _loop(_i);
                        }
                        var _iteratorNormalCompletion5 = true;
                        var _didIteratorError5 = false;
                        var _iteratorError5 = undefined;

                        try {
                            for (var _iterator5 = (0, _getIterator3.default)(items), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                var _i2 = _step5.value;

                                if (u) {
                                    _i2.tags.forEach(function (e) {
                                        if (!pre_arr.includes(e) && normal !== e) {
                                            if (relative_arr.indexOf(e) === -1) {
                                                relative_arr.push(e);
                                            }
                                        }
                                    });
                                    u--;
                                } else {
                                    break;
                                }
                            }
                        } catch (err) {
                            _didIteratorError5 = true;
                            _iteratorError5 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion5 && _iterator5.return) {
                                    _iterator5.return();
                                }
                            } finally {
                                if (_didIteratorError5) {
                                    throw _iteratorError5;
                                }
                            }
                        }
                    })();
                }
                return pre_arr.concat(relative_arr);
            });
        },
        addTag: function addTag(uid, tag, user) {
            var checkValid = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

            var name = (0, _utility.isValidString)(tag, 'name');
            if (!name) {
                return (0, _utility.handleError)(new _utility.HoError('name is not vaild!!!'));
            }
            var id = (0, _utility.isValidString)(uid, 'uid');
            if (id === false) {
                return new _promise2.default(function (resolve, reject) {
                    return checkValid ? reject(new _utility.HoError('uid is not vaild')) : resolve({});
                });
            }
            var tagType = getQueryTag(user, name);
            if (!tagType.type) {
                console.log(tagType);
                return (0, _utility.handleError)(new _utility.HoError('not authority set default tag!!!'));
            }
            if (tagType.type === 2) {
                return (0, _mongoTool2.default)('find', collection, { _id: id }, { limit: 1 }).then(function (items) {
                    if (items.length < 1) {
                        return (0, _utility.handleError)(new _utility.HoError('can not find object!!!'));
                    }
                    return tagType.tag.hasOwnProperty('adultonly') && items[0].adultonly === tagType.tag.adultonly || tagType.tag.hasOwnProperty('first') && items[0].first === tagType.tag.first || tagType.tag.hasOwnProperty('important') && items[0].important === tagType.tag.important ? {
                        id: items[0]._id,
                        adultonly: items[0].adultonly,
                        tag: tagType.name
                    } : (0, _mongoTool2.default)('update', collection, { _id: id }, { $set: tagType.tag }).then(function (item2) {
                        return {
                            id: items[0]._id,
                            adultonly: items[0].adultonly,
                            tag: tagType.name
                        };
                    });
                });
            } else if (tagType.type === 3) {
                return {
                    id: items[0]._id,
                    adultonly: items[0].adultonly,
                    tag: tagType.name
                };
            } else if (tagType.type === 1) {
                return (0, _mongoTool2.default)('find', collection, { _id: id }, { limit: 1 }).then(function (items) {
                    if (items.length < 1) {
                        return (0, _utility.handleError)(new _utility.HoError('can not find object!!!'));
                    }
                    if (!items[0].tags.includes(tagType.tag.tags)) {
                        tagType.tag[user._id.toString()] = tagType.tag.tags;
                        return (0, _mongoTool2.default)('update', collection, { _id: id }, { $addToSet: tagType.tag }, { upsert: true }).then(function (item2) {
                            return {
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: tagType.tag.tags
                            };
                        });
                    } else {
                        return {
                            id: items[0]._id,
                            adultonly: items[0].adultonly,
                            tag: tagType.tag.tags
                        };
                    }
                });
            } else {
                console.log(tagType);
                return (0, _utility.handleError)(new _utility.HoError('unknown add tag type!!!'));
            }
        },
        delTag: function delTag(uid, tag, user) {
            var checkValid = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;

            var name = (0, _utility.isValidString)(tag, 'name');
            if (name === false) {
                name = (0, _utility.isValidString)(tag, 'url');
                if (!name) {
                    return (0, _utility.handleError)(new _utility.HoError('name is not vaild!!!'));
                }
            }
            var id = (0, _utility.isValidString)(uid, 'uid');
            if (id === false) {
                return new _promise2.default(function (resolve, reject) {
                    return checkValid ? reject(new _utility.HoError('uid is not vaild')) : resolve({});
                });
            }
            var tagType = getQueryTag(user, name, 0);
            if (!tagType.type) {
                console.log(tagType);
                return (0, _utility.handleError)(new _utility.HoError('not authority delete default tag!!!'));
            }
            return (0, _mongoTool2.default)('find', collection, { _id: id }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('can not find object!!!'));
                }
                if (tagType.type === 2) {
                    return (0, _mongoTool2.default)('update', collection, { _id: id }, { $set: tagType.tag }).then(function (item1) {
                        return {
                            id: items[0]._id,
                            adultonly: items[0].adultonly,
                            tag: tagType.name
                        };
                    });
                } else if (tagType.type === 1) {
                    if (tagType.tag.tags === normalize(items[0].name)) {
                        console.log(tagType.tag.tags);
                        console.log(normalize(items[0].name));
                        return (0, _utility.handleError)(new _utility.HoError('can not delete file name!!!'));
                    }
                    if ((0, _utility.checkAdmin)(1, user)) {
                        console.log('authority del tag');
                        if (!items[0].tags.includes(tagType.tag.tags)) {
                            return {
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: ''
                            };
                        } else {
                            for (var i in items[0]) {
                                if ((0, _utility.isValidString)(i, 'uid') || i === 'lovetv' || i === 'eztv') {
                                    tagType.tag[i] = tagType.tag.tags;
                                    return (0, _mongoTool2.default)('update', collection, { _id: id }, { $pull: tagType.tag }).then(function (item1) {
                                        return {
                                            id: items[0]._id,
                                            adultonly: items[0].adultonly,
                                            tag: tagType.tag.tags
                                        };
                                    });
                                }
                            }
                        }
                    } else {
                        if (!items[0][user._id.toString()] || !items[0][user._id.toString()].includes(tagType.tag.tags)) {
                            return {
                                id: items[0]._id,
                                adultonly: items[0].adultonly,
                                tag: ''
                            };
                        } else {
                            tagType.tag[user._id.toString()] = tagType.tag.tags;
                            return (0, _mongoTool2.default)('update', collection, { _id: id }, { $pull: tagType.tag }).then(function (item1) {
                                return {
                                    id: items[0]._id,
                                    adultonly: items[0].adultonly,
                                    tag: tagType.tag.tags
                                };
                            });
                        }
                    }
                } else {
                    console.log(tagType);
                    return (0, _utility.handleError)(new _utility.HoError('unknown del tag type!!!'));
                }
            });
        },
        sendTag: function sendTag(uid, objName, tags, user) {
            var _this = this;

            tags.reverse();
            var history = [];
            var select = [];
            var validName = (0, _utility.isValidString)(objName, 'name');
            if (!validName) {
                return (0, _utility.handleError)(new _utility.HoError('name is not vaild!!!'));
            }
            var normal = normalize(validName);
            var handle_tag = function handle_tag(index) {
                return tags[index].select ? _this.addTag(uid, tags[index].tag, user) : _this.delTag(uid, tags[index].tag, user);
            };
            var recur_tag = function recur_tag(index) {
                return handle_tag(index).then(function (result) {
                    if (result.tag !== normal) {
                        history.push(result.tag);
                        select.push(tags[index].select);
                    }
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Send tag');
                }).then(function () {
                    index++;
                    if (index < tags.length) {
                        return recur_tag(index);
                    }
                }).then(function () {
                    var id = (0, _utility.isValidString)(uid, 'uid');
                    if (!id) {
                        return (0, _utility.handleError)(new _utility.HoError('uid is not vaild!!!'));
                    }
                    return (0, _mongoTool2.default)('update', collection, { _id: id }, { $set: { untag: 0 } }).then(function (item) {
                        return (0, _mongoTool2.default)('find', collection, { _id: id }, { limit: 1 }).then(function (items) {
                            if (items.length < 1) {
                                return (0, _utility.handleError)(new _utility.HoError('can not find object!!!'));
                            }
                            return {
                                history: history,
                                select: select,
                                id: items[0]._id,
                                adultonly: items[0].adultonly
                            };
                        });
                    });
                });
            };
            return recur_tag(0);
        },
        searchTags: function searchTags(search) {
            if (!search[collection]) {
                search[collection] = {
                    tags: [],
                    exactly: [],
                    index: 0,
                    bookmark: '',
                    markIndex: 0,
                    save: {}
                };
            }
            return {
                getArray: function getArray() {
                    var value = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
                    var exactly = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
                    var index = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

                    if (value) {
                        if (index <= 0) {
                            if (search[collection].index > search[collection].tags.length) {
                                search[collection].index = search[collection].tags.length;
                            }
                            var pos = search[collection].tags.indexOf(value);
                            if (pos === -1 || pos >= search[collection].index) {
                                if (pos > search[collection].index) {
                                    search[collection].tags.splice(pos, 1);
                                }
                                search[collection].tags[search[collection].index] = value;
                                search[collection].exactly[search[collection].index] = exactly;
                                search[collection].index++;
                            } else {
                                search[collection].exactly[pos] = exactly;
                            }
                        } else {
                            search[collection].index = index < search[collection].tags.length ? index : search[collection].tags.length;
                        }
                    }
                    if (search[collection].index < search[collection].markIndex) {
                        search[collection].bookmark = '';
                        search[collection].markIndex = 0;
                    }
                    return {
                        cur: search[collection].tags.slice(0, search[collection].index),
                        his: search[collection].tags.slice(search[collection].index),
                        exactly: search[collection].exactly,
                        bookmark: search[collection].bookmark
                    };
                },
                resetArray: function resetArray() {
                    search[collection] = {
                        tags: [],
                        exactly: [],
                        index: 0,
                        bookmark: '',
                        markIndex: 0,
                        save: search[collection].save
                    };
                    return {
                        cur: [],
                        his: [],
                        exactly: [],
                        bookmark: ''
                    };
                },
                setArray: function setArray(bookmark, tagList, exactly) {
                    (0, _assign2.default)(search[collection], tagList ? {
                        tags: tagList,
                        exactly: exactly,
                        index: tagList.length,
                        save: search[collection].save
                    } : {}, bookmark ? {
                        bookmark: bookmark,
                        markIndex: tagList ? tagList.length : search[collection].tags.length
                    } : {
                        bookmark: '',
                        markIndex: 0
                    });
                },
                getBookmark: function getBookmark() {
                    return search[collection].bookmark ? search[collection].bookmark : false;
                },
                saveArray: function saveArray(saveName, sortName, sortType) {
                    search[collection].save[saveName] = {
                        tags: search[collection].tags.slice(0, search[collection].index),
                        exactly: search[collection].exactly,
                        bookmark: search[collection].bookmark,
                        sortName: getStorageSortName(sortName),
                        sortType: sortType
                    };
                },
                loadArray: function loadArray(saveName) {
                    return search[collection].save.hasOwnProperty(saveName) ? {
                        tags: search[collection].save[saveName].tags,
                        exactly: search[collection].save[saveName].exactly,
                        bookmark: search[collection].save[saveName].bookmark,
                        sortName: search[collection].save[saveName].sortName,
                        sortType: search[collection].save[saveName].sortType
                    } : false;
                }
            };
        },
        //bookmark
        getBookmarkList: function getBookmarkList(sortName, sortType, user) {
            return (0, _mongoTool2.default)('find', collection + 'User', { userId: user._id }, { sort: [[sortName, sortType]] }).then(function (items) {
                return { bookmarkList: items.map(function (i) {
                        return {
                            name: i.name,
                            id: i._id
                        };
                    }) };
            });
        },
        getBookmark: function getBookmark(id, sortName, sortType, user, session) {
            var _this2 = this;

            var validId = (0, _utility.isValidString)(id, 'uid');
            if (!validId) {
                return (0, _utility.handleError)(new _utility.HoError('bookmark is not vaild!!!'));
            }
            return (0, _mongoTool2.default)('find', collection + 'User', { _id: validId }, { limit: 1 }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('can not find bookmark!!!'));
                }
                _this2.searchTags(session).setArray(items[0]._id, items[0].tag, items[0].exactly);
                return _this2.tagQuery(0, null, null, null, sortName, sortType, user, session);
            });
        },
        setBookmark: function setBookmark(btag, bexactly, sortName, sortType, user, session) {
            this.searchTags(session).setArray('', btag, bexactly);
            return this.tagQuery(0, null, null, null, sortName, sortType, user, session);
        },
        addBookmark: function addBookmark(name, user, session, bpath, bexactly) {
            var tags = null;
            if (!bpath || !bexactly) {
                tags = this.searchTags(session);
                var parentList = tags.getArray();
                bpath = parentList.cur;
                bexactly = parentList.exactly;
            }
            if (bpath.length <= 0) {
                return (0, _utility.handleError)(new _utility.HoError('empty parent list!!!'));
            }
            return (0, _mongoTool2.default)('find', collection + 'User', {
                userId: user._id,
                name: name
            }, { limit: 1 }).then(function (items) {
                return items.length > 0 ? (0, _mongoTool2.default)('update', collection + 'User', {
                    userId: user._id,
                    name: name
                }, { $set: {
                        tag: bpath,
                        exactly: bexactly,
                        mtime: Math.round(new Date().getTime() / 1000)
                    } }).then(function (item1) {
                    if (tags) {
                        tags.setArray(items[0]._id);
                    }
                    return { apiOk: true };
                }) : (0, _mongoTool2.default)('count', collection + 'User', { userId: user._id }).then(function (count) {
                    if (count >= _constants.BOOKMARK_LIMIT) {
                        console.log(count);
                        return (0, _utility.handleError)(new _utility.HoError('too much bookmark!!!'));
                    }
                    return (0, _mongoTool2.default)('insert', collection + 'User', {
                        userId: user._id,
                        name: name,
                        tag: bpath,
                        exactly: bexactly,
                        mtime: Math.round(new Date().getTime() / 1000)
                    }).then(function (item1) {
                        if (tags) {
                            tags.setArray(item1[0]._id);
                        }
                        return {
                            name: item1[0].name,
                            id: item1[0]._id
                        };
                    });
                });
            });
        },
        delBookmark: function delBookmark(id) {
            var validId = (0, _utility.isValidString)(id, 'uid');
            if (!validId) {
                return (0, _utility.handleError)(new _utility.HoError('bookmark is not vaild!!!'));
            }
            return (0, _mongoTool2.default)('remove', collection + 'User', {
                _id: validId,
                $isolated: 1
            }).then(function (item) {
                return { id: id };
            });
        },
        parentList: function parentList() {
            return parent_arr;
        },
        adultonlyParentList: function adultonlyParentList() {
            return _constants.ADULTONLY_PARENT;
        },
        parentQuery: function parentQuery(tagName, sortName, sortType, page, user) {
            var name = (0, _utility.isValidString)(tagName, 'name');
            if (!name) {
                return (0, _utility.handleError)(new _utility.HoError('name is not vaild!!!'));
            }
            if (!inParentArray(name)) {
                if ((0, _utility.checkAdmin)(2, user)) {
                    if (!inAdultonlyArray(name)) {
                        console.log(name);
                        return (0, _utility.handleError)(new _utility.HoError('name is not allow'));
                    }
                } else {
                    console.log(name);
                    return (0, _utility.handleError)(new _utility.HoError('name is not allow'));
                }
            }
            return (0, _mongoTool2.default)('find', collection + 'Dir', { parent: name }, {
                limit: _constants.QUERY_LIMIT,
                skip: page,
                sort: [[sortName === 'mtime' ? 'qtime' : sortName, sortType]]
            }).then(function (taglist) {
                return { taglist: taglist.map(function (t) {
                        return {
                            id: t._id,
                            name: t.name
                        };
                    }) };
            });
        },
        queryParentTag: function queryParentTag(id, single, sortName, sortType, user, session) {
            var _this3 = this;

            var validId = (0, _utility.isValidString)(id, 'uid');
            if (!validId) {
                return (0, _utility.handleError)(new _utility.HoError('parent is not vaild!!!'));
            }
            return (0, _mongoTool2.default)('find', collection + 'Dir', { _id: validId }, { limit: 1 }).then(function (parents) {
                if (parents.length < 1) {
                    return (0, _utility.handleError)(new _utility.HoError('can not find dir'));
                }
                if (single === 'single') {
                    _this3.searchTags(session).resetArray();
                }
                return _this3.tagQuery(0, parents[0].name, true, null, sortName, sortType, user, session).then(function (result) {
                    return (0, _mongoTool2.default)('update', collection + 'Dir', { _id: parents[0]._id }, { $set: { qtime: Math.round(new Date().getTime() / 1000) } }).then(function (parent1) {
                        return result;
                    });
                });
            });
        },
        addParent: function addParent(parentName, tagName, user) {
            var name = (0, _utility.isValidString)(parentName, 'name');
            if (!name) {
                return (0, _utility.handleError)(new _utility.HoError('name is not vaild!!!'));
            }
            if (!inParentArray(name)) {
                if ((0, _utility.checkAdmin)(2, user)) {
                    if (!inAdultonlyArray(name)) {
                        console.log(name);
                        return (0, _utility.handleError)(new _utility.HoError('name is not allow'));
                    }
                } else {
                    console.log(name);
                    return (0, _utility.handleError)(new _utility.HoError('name is not allow'));
                }
            }
            var validName = (0, _utility.isValidString)(tagName, 'name');
            if (!validName) {
                return (0, _utility.handleError)(new _utility.HoError('tag name is not vaild!!!'));
            }
            var normal = normalize(validName);
            return (0, _mongoTool2.default)('find', collection + 'Dir', {
                parent: name,
                name: normal
            }, { limit: 1 }).then(function (parents) {
                return parents.length < 1 ? (0, _mongoTool2.default)('insert', collection + 'Dir', {
                    parent: name,
                    name: normal,
                    qtime: Math.round(new Date().getTime() / 1000)
                }).then(function (parent1) {
                    return {
                        name: parent1[0].name,
                        id: parent1[0]._id
                    };
                }) : {
                    name: parents[0].name,
                    id: parents[0]._id
                };
            });
        },
        delParent: function delParent(uid, user) {
            if (!(0, _utility.checkAdmin)(1, user)) {
                console.log(user);
                return (0, _utility.handleError)(new _utility.HoError('permission denied'));
            }
            var id = (0, _utility.isValidString)(uid, 'uid');
            if (!id) {
                return (0, _utility.handleError)(new _utility.HoError('parent is not vaild!!!'));
            }
            return (0, _mongoTool2.default)('remove', collection + 'Dir', {
                _id: id,
                $isolated: 1
            }).then(function (parent) {
                return parent ? { id: id } : { apiOK: true };
            });
        },
        setLatest: function setLatest(latest, session) {
            var saveName = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;

            var tags = this.searchTags(session);
            var bookmark = false;
            if (saveName) {
                var save = tags.loadArray(saveName);
                if (save) {
                    bookmark = save.bookmark;
                }
            } else {
                bookmark = tags.getBookmark();
            }
            return bookmark ? (0, _mongoTool2.default)('update', collection + 'User', { _id: (0, _mongoTool.objectID)(bookmark) }, { $set: { latest: latest } }) : _promise2.default.resolve();
        },
        saveSql: function saveSql(page, saveName, back, user, session) {
            var save = this.searchTags(session).loadArray(saveName);
            if (!save) {
                return false;
            }
            var sql = getQuerySql(user, save.tags, save.exactly);
            return sql ? {
                nosql: sql.nosql,
                options: (0, _assign2.default)({
                    limit: _constants.QUERY_LIMIT,
                    skip: sql.skip ? page + sql.skip : page,
                    sort: [[save.sortName, back === 'back' ? save.sortType === 'desc' ? 'asc' : 'desc' : save.sortType]]
                }, sql.hint ? { hint: sql.hint } : {}),
                select: sql.select ? sql.select : {},
                parentList: {
                    cur: save.tags,
                    his: [],
                    exactly: save.exactly,
                    bookmark: save.bookmark
                }
            } : { empty: true };
        }
    };
}

function inAdultonlyArray(parent) {
    var _iteratorNormalCompletion6 = true;
    var _didIteratorError6 = false;
    var _iteratorError6 = undefined;

    try {
        for (var _iterator6 = (0, _getIterator3.default)(_constants.ADULTONLY_PARENT), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
            var i = _step6.value;

            if (i.name === parent) {
                return true;
            }
        }
    } catch (err) {
        _didIteratorError6 = true;
        _iteratorError6 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion6 && _iterator6.return) {
                _iterator6.return();
            }
        } finally {
            if (_didIteratorError6) {
                throw _iteratorError6;
            }
        }
    }

    return false;
}

//stotage sql
var escapeRegExp = function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
};

var getStorageQuerySql = function getStorageQuerySql(user, tagList, exactly) {
    var nosql = {};
    var and = [];
    var is_first = true;
    //let is_adultonly = false;
    var is_adultonly = true;
    var is_tags = false;
    var skip = 0;
    nosql['adultonly'] = 0;
    /*if (tagList.length < 1) {
        if (!checkAdmin(2, user)) {
            nosql['adultonly'] = 0;
            is_adultonly = true;
        }
        if (!checkAdmin(1, user)) {
            nosql['recycle'] = 0;
        }
    } else {*/
    nosql['adultonly'] = 0;
    var _iteratorNormalCompletion7 = true;
    var _didIteratorError7 = false;
    var _iteratorError7 = undefined;

    try {
        for (var _iterator7 = (0, _getIterator3.default)((0, _entries2.default)(tagList)), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
            var _step7$value = (0, _slicedToArray3.default)(_step7.value, 2),
                i = _step7$value[0],
                tag = _step7$value[1];

            var normal = normalize(tag);
            var index = isDefaultTag(normal);
            if (index.index === 30) {
                continue;
            } else if (index.index === 31) {
                if (index[1] === '') {
                    skip = Number(index.index[2]);
                }
                continue;
            } else if (index.index === 0) {
                if ((0, _utility.checkAdmin)(2, user)) {
                    nosql['adultonly'] = 1;
                    //is_adultonly = true;
                }
                /*} else if (index.index === 17) {
                    if (checkAdmin(2, user)) {
                        nosql['adultonly'] = 0;
                        is_adultonly = true;
                    }*/
            } else if (index.index === 1) {
                if ((0, _utility.checkAdmin)(1, user)) {
                    var _ret3 = { nosql: {
                            mediaType: { $exists: true },
                            utime: { $lt: Math.round(new Date().getTime() / 1000) - _constants.HANDLE_TIME }
                        } };
                    console.log(_ret3.nosql);
                    return _ret3;
                }
            } else if (index.index === 2) {
                if ((0, _utility.checkAdmin)(1, user)) {
                    var unDay = user.unDay ? user.unDay : _constants.UNACTIVE_DAY;
                    var _ret4 = { nosql: {
                            count: { $lt: user.unHit ? user.unHit : _constants.UNACTIVE_HIT },
                            utime: { $lt: Math.round(new Date().getTime() / 1000) - unDay * 86400 }
                        } };
                    console.log(_ret4.nosql);
                    return _ret4;
                }
            } else if (index.index === 12) {
                if ((0, _utility.checkAdmin)(1, user)) {
                    var _unDay = user.unDay ? user.unDay : _constants.UNACTIVE_DAY;
                    var _ret5 = { nosql: {
                            count: { $lt: user.unHit ? user.unHit : _constants.UNACTIVE_HIT },
                            utime: { $lt: Math.round(new Date().getTime() / 1000) - _unDay * 86400 },
                            tags: 'playlist'
                        } };
                    console.log(_ret5.nosql);
                    return _ret5;
                }
            } else if (index.index === 3) {
                if ((0, _utility.checkAdmin)(1, user)) {
                    var _ret6 = { nosql: {
                            recycle: { $ne: 0 },
                            utime: { $lt: Math.round(new Date().getTime() / 1000) - _constants.HANDLE_TIME }
                        } };
                    console.log(_ret6.nosql);
                    return _ret6;
                }
            } else if (index.index === 4 || index.index === 6 || index.index === 8 || index.index === 9 || index.index === 10 || index.index === 11 || index.index === 13 || index.index === 14 || index.index === 15 || index.index === 16 || index.index === 18 || index.index === 19 || index.index === 20 || index.index === 21 || index.index === 22) {} else if (index.index === 5) {
                is_first = false;
            } else if (index.index === 7) {
                console.log('no local');
                return false;
            } else {
                if (exactly[i]) {
                    and.push({ tags: normal });
                    is_tags = true;
                } else {
                    and.push({ tags: { $regex: escapeRegExp(normal) } });
                }
            }
        }
    } catch (err) {
        _didIteratorError7 = true;
        _iteratorError7 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion7 && _iterator7.return) {
                _iterator7.return();
            }
        } finally {
            if (_didIteratorError7) {
                throw _iteratorError7;
            }
        }
    }

    if (!(0, _utility.checkAdmin)(1, user)) {
        nosql['recycle'] = 0;
    }
    /*if (!checkAdmin(2, user)) {
        nosql['adultonly'] = 0;
        is_adultonly = true;
    }
    }*/
    if (is_first) {
        nosql['first'] = 1;
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    var hint = (0, _assign2.default)({}, is_adultonly ? { adultonly: 1 } : {}, is_tags ? { tags: 1 } : {}, is_first ? { first: 1 } : {}, { name: 1 });
    var ret = (0, _assign2.default)({ nosql: nosql }, (0, _config.HINT)(_ver.ENV_TYPE) ? { hint: hint } : {}, skip ? { skip: skip } : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
};

function getStorageQueryTag(user, tag) {
    var del = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    var normal = normalize(tag);
    var index = isDefaultTag(normal);
    if (index.index === 0) {
        return (0, _utility.checkAdmin)(2, user) ? {
            tag: { adultonly: del },
            type: 2,
            name: _constants.DEFAULT_TAGS[0]
        } : { type: 0 };
    } else if (index.index === 4) {
        return {
            tag: { first: del },
            type: 2,
            name: _constants.DEFAULT_TAGS[4]
        };
    } else if (index) {
        return { type: 0 };
    } else {
        return {
            tag: { tags: normal },
            type: 1
        };
    }
}

function getStorageSortName(sortName) {
    switch (sortName) {
        case 'count':
            return sortName;
        case 'mtime':
            return 'utime';
        case 'name':
        default:
            return 'name';
    }
}

function getPasswordQuerySql(user, tagList, exactly) {
    var nosql = { owner: user._id };
    var and = [];
    var is_tags = false;
    var is_important = false;
    var skip = 0;
    if (tagList.length > 0) {
        var _iteratorNormalCompletion8 = true;
        var _didIteratorError8 = false;
        var _iteratorError8 = undefined;

        try {
            for (var _iterator8 = (0, _getIterator3.default)((0, _entries2.default)(tagList)), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                var _step8$value = (0, _slicedToArray3.default)(_step8.value, 2),
                    i = _step8$value[0],
                    tag = _step8$value[1];

                var normal = normalize(tag);
                var index = isDefaultTag(normal);
                if (index.index === 6) {
                    nosql['important'] = 1;
                    is_important = true;
                } else if (index.index === 31) {
                    if (index.index[1] === '') {
                        skip = Number(index.index[1]);
                    }
                    continue;
                } else if (index) {} else {
                    if (exactly[i]) {
                        and.push({ tags: normal });
                        is_tags = true;
                    } else {
                        and.push({ tags: { $regex: escapeRegExp(normal) } });
                    }
                }
            }
        } catch (err) {
            _didIteratorError8 = true;
            _iteratorError8 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion8 && _iterator8.return) {
                    _iterator8.return();
                }
            } finally {
                if (_didIteratorError8) {
                    throw _iteratorError8;
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    var hint = (0, _assign2.default)({ owner: 1 }, is_tags ? { tags: 1 } : {}, is_important ? { important: 1 } : {}, { name: 1 });
    var ret = (0, _assign2.default)({ nosql: nosql, select: {
            password: 0,
            prePassword: 0,
            owner: 0
        } }, (0, _config.HINT)(_ver.ENV_TYPE) ? { hint: hint } : {}, skip ? { skip: skip } : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getPasswordQueryTag(user, tag) {
    var del = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    var normal = normalize(tag);
    var index = isDefaultTag(normal);
    if (index.index === 6) {
        return {
            type: 3,
            name: ''
        };
    } else if (index) {
        return { type: 0 };
    } else {
        return {
            tag: { tags: normal },
            type: 1
        };
    }
}

function getPasswordSortName(sortName) {
    switch (sortName) {
        case 'count':
            return 'username';
        case 'mtime':
            return 'utime';
        case 'name':
        default:
            return 'name';
    }
}

function getStockQuerySql(user, tagList, exactly) {
    var nosql = {};
    var and = [];
    var is_tags = false;
    var is_important = false;
    var skip = 0;
    if (tagList.length > 0) {
        var _iteratorNormalCompletion9 = true;
        var _didIteratorError9 = false;
        var _iteratorError9 = undefined;

        try {
            for (var _iterator9 = (0, _getIterator3.default)((0, _entries2.default)(tagList)), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                var _step9$value = (0, _slicedToArray3.default)(_step9.value, 2),
                    i = _step9$value[0],
                    tag = _step9$value[1];

                var normal = normalize(tag);
                var index = isDefaultTag(normal);
                if (index.index === 6) {
                    nosql['important'] = 1;
                    is_important = true;
                } else if (index.index === 31) {
                    if (index.index[1] === '') {
                        skip = Number(index.index[1]);
                    } else if (index.index[1] === 'profit') {
                        nosql['profitIndex'] = { $gte: Number(index.index[1]) };
                    } else if (index.index[1] === 'safety') {
                        nosql['safetyIndex'] = { $gte: Number(index.index[1]) };
                    } else if (index.index[1] === 'manag') {
                        nosql['managementIndex'] = { $gte: Number(index.index[1]) };
                    }
                    continue;
                } else if (index) {} else {
                    if (exactly[i]) {
                        and.push({ tags: normal });
                        is_tags = true;
                    } else {
                        and.push({ tags: { $regex: escapeRegExp(normal) } });
                    }
                }
            }
        } catch (err) {
            _didIteratorError9 = true;
            _iteratorError9 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion9 && _iterator9.return) {
                    _iterator9.return();
                }
            } finally {
                if (_didIteratorError9) {
                    throw _iteratorError9;
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    var hint = (0, _assign2.default)({}, is_tags ? { tags: 1 } : {}, is_important ? { important: 1 } : {}, { profitIndex: 1 });
    var ret = (0, _assign2.default)({ nosql: nosql, select: {
            cash: 0,
            asset: 0,
            sales: 0
        } }, (0, _config.HINT)(_ver.ENV_TYPE) ? { hint: hint } : {}, skip ? { skip: skip } : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
}

function getStockQueryTag(user, tag) {
    var del = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    var normal = normalize(tag);
    var index = isDefaultTag(normal);
    if (index.index === 6) {
        return {
            tag: { important: del },
            type: 2,
            name: _constants.DEFAULT_TAGS[6]
        };
    } else if (index) {
        return { type: 0 };
    } else {
        return {
            tag: { tags: normal },
            type: 1
        };
    }
}

function getStockSortName(sortName) {
    switch (sortName) {
        case 'count':
            return 'managementIndex';
        case 'mtime':
            return 'safetyIndex';
        case 'name':
        default:
            return 'profitIndex';
    }
}

var getFitnessQuerySql = function getFitnessQuerySql(user, tagList, exactly) {
    var nosql = {};
    var and = [];
    var is_tags = false;
    var skip = 0;
    if (tagList.length < 1) {} else {
        var _iteratorNormalCompletion10 = true;
        var _didIteratorError10 = false;
        var _iteratorError10 = undefined;

        try {
            for (var _iterator10 = (0, _getIterator3.default)((0, _entries2.default)(tagList)), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                var _step10$value = (0, _slicedToArray3.default)(_step10.value, 2),
                    i = _step10$value[0],
                    tag = _step10$value[1];

                var normal = normalize(tag);
                var index = isDefaultTag(normal);
                if (index.index === 31) {
                    if (index[1] === '') {
                        skip = Number(index.index[2]);
                    }
                    continue;
                } else if (index) {} else {
                    if (exactly[i]) {
                        and.push({ tags: normal });
                        is_tags = true;
                    } else {
                        and.push({ tags: { $regex: escapeRegExp(normal) } });
                    }
                }
            }
        } catch (err) {
            _didIteratorError10 = true;
            _iteratorError10 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion10 && _iterator10.return) {
                    _iterator10.return();
                }
            } finally {
                if (_didIteratorError10) {
                    throw _iteratorError10;
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    var hint = (0, _assign2.default)({}, is_tags ? { tags: 1 } : {}, { name: 1 });
    var ret = (0, _assign2.default)({ nosql: nosql }, (0, _config.HINT)(_ver.ENV_TYPE) ? { hint: hint } : {}, skip ? { skip: skip } : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
};

function getFitnessQueryTag(user, tag) {
    var del = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    var normal = normalize(tag);
    var index = isDefaultTag(normal);
    if (index) {
        return { type: 0 };
    } else {
        return {
            tag: { tags: normal },
            type: 1
        };
    }
}
function getFitnessSortName(sortName) {
    switch (sortName) {
        case 'mtime':
            return 'price';
        case 'name':
        case 'count':
        default:
            return 'name';
    }
}

var getRankQuerySql = function getRankQuerySql(user, tagList, exactly) {
    var nosql = {};
    var and = [];
    var is_tags = false;
    var skip = 0;
    if (tagList.length < 1) {} else {
        var _iteratorNormalCompletion11 = true;
        var _didIteratorError11 = false;
        var _iteratorError11 = undefined;

        try {
            for (var _iterator11 = (0, _getIterator3.default)((0, _entries2.default)(tagList)), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                var _step11$value = (0, _slicedToArray3.default)(_step11.value, 2),
                    i = _step11$value[0],
                    tag = _step11$value[1];

                var normal = normalize(tag);
                var index = isDefaultTag(normal);
                if (index.index === 31) {
                    if (index[1] === '') {
                        skip = Number(index.index[2]);
                    }
                    continue;
                } else if (index) {} else {
                    if (exactly[i]) {
                        and.push({ tags: normal });
                        is_tags = true;
                    } else {
                        and.push({ tags: { $regex: escapeRegExp(normal) } });
                    }
                }
            }
        } catch (err) {
            _didIteratorError11 = true;
            _iteratorError11 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion11 && _iterator11.return) {
                    _iterator11.return();
                }
            } finally {
                if (_didIteratorError11) {
                    throw _iteratorError11;
                }
            }
        }
    }
    if (and.length > 0) {
        nosql.$and = and;
    }
    var hint = (0, _assign2.default)({}, is_tags ? { tags: 1 } : {}, { name: 1 });
    var ret = (0, _assign2.default)({ nosql: nosql }, (0, _config.HINT)(_ver.ENV_TYPE) ? { hint: hint } : {}, skip ? { skip: skip } : {});
    console.log(ret);
    console.log(ret.nosql);
    return ret;
};

function getRankQueryTag(user, tag) {
    var del = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    var normal = normalize(tag);
    var index = isDefaultTag(normal);
    if (index) {
        return { type: 0 };
    } else {
        return {
            tag: { tags: normal },
            type: 1
        };
    }
}
function getRankSortName(sortName) {
    switch (sortName) {
        case 'mtime':
            return 'start';
        case 'count':
            return 'type';
        case 'name':
        default:
            return 'name';
    }
}

//default tag
function isDefaultTag(tag) {
    var ret = { index: _constants.DEFAULT_TAGS.indexOf(tag) };
    if (ret.index !== -1) {
        return ret;
    } else {
        ret = tag.match(/^y(ou|ch|pl)_([a-zA-z\d\-\_]+)/);
        if (ret) {
            ret.index = 30;
            return ret;
        }
        ret = tag.match(/^(profit|safety|manag|)>(-?\d+)$/);
        if (ret) {
            ret.index = 31;
            return ret;
        }
    }
    return false;
}

function normalize(tag) {
    var result = '';
    [].concat((0, _toConsumableArray3.default)(tag)).forEach(function (str, i) {
        return result = '' + result + (tag.charCodeAt(i) === 12288 ? ' ' : tag.charCodeAt(i) > 65280 && tag.charCodeAt(i) < 65375 ? String.fromCharCode(tag.charCodeAt(i) - 65248) : String.fromCharCode(tag.charCodeAt(i)));
    });
    return result.toLowerCase(result).replace(/[零一二三四五六七八九十百千萬0123456789]+/g, function (a) {
        return cn2ArabNum(a);
    });
}

function cn2ArabNum(cn) {
    var cnChars = '零一二三四五六七八九';
    var mulChars = '十百千萬';
    var arab = 0;
    var tmp = [];
    var mul = 0;
    var state = 0;
    var aum = 0;
    if (!cn) {
        return 0;
    }
    cn = cn.replace(/[零一二三四五六七八九]/g, function (a) {
        return cnChars.indexOf(a);
    });
    if (cn.match(/^[十百千萬]/)) {
        cn = '1' + cn;
    }
    var pow = 1;
    while (cn.length > 0) {
        tmp = cn.match(/[\d]+$/);
        if (tmp) {
            pow = 1;
            for (var i = 0; i < aum + mul; i++) {
                pow = pow * 10;
            }
            arab = arab + tmp[0] * pow;
            state = mul;
            mul = 0;
            cn = cn.slice(0, tmp.index);
        } else {
            if (mul > 0) {
                pow = 1;
                for (var _i3 = 0; _i3 < aum + mul; _i3++) {
                    pow = pow * 10;
                }
                arab = arab + pow;
                state = mul;
                mul = 0;
            }
            mul = Math.floor(mulChars.indexOf(cn[cn.length - 1]) + 1);
            if (mul <= state) {
                aum = aum + state;
                state = 0;
            }
            cn = cn.slice(0, -1);
        }
    }
    return arab;
}

//[^\x00-\x7F]+ 非英數
function denormalize(tag) {
    var r = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '萬'];
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 1000, 10000].forEach(function (v, i) {
        return tag = tag.replace(new RegExp('(^|[^\x00-\x7F])' + v + '([^\x00-\x7F]|$)'), '$1' + r[i] + '$2');
    });
    return tag;
}

var completeMimeTag = exports.completeMimeTag = function completeMimeTag(add) {
    var tool = add ? process(_constants.STORAGEDB) : null;
    var search_number = 0;
    var recur_com = function recur_com() {
        return (0, _mongoTool2.default)('find', _constants.STORAGEDB, {}, {
            limit: _constants.RELATIVE_LIMIT,
            skip: search_number,
            sort: '_id'
        }).then(function (items) {
            var recur_item = function recur_item(index) {
                var complete_tag = [];
                var getTag = function getTag(tag, list, trans) {
                    var option_index = list.indexOf(tag);
                    if (option_index !== -1) {
                        if (!items[index].tags.includes(trans[option_index])) {
                            for (var j in items[index]) {
                                if ((0, _utility.isValidString)(j, 'uid') || j === 'eztv' || j === 'lovetv') {
                                    if (items[index][j].includes(list[option_index])) {
                                        complete_tag.push({
                                            owner: j,
                                            tag: trans[option_index]
                                        });
                                        return trans[option_index];
                                    }
                                }
                            }
                        }
                    }
                    return false;
                };
                var completeNext = function completeNext() {
                    index++;
                    if (index < items.length) {
                        return recur_item(index);
                    } else {
                        search_number += items.length;
                        console.log(search_number);
                        if (items.length < _constants.RELATIVE_LIMIT) {
                            console.log('end');
                        } else {
                            return recur_com();
                        }
                    }
                };
                if (items.length === 0) {
                    console.log('end');
                } else {
                    items[index].tags.forEach(function (i) {
                        var tran_tag = getTag(i, _constants.DM5_ORI_LIST, _constants.DM5_CH_LIST);
                        if (tran_tag) {
                            getTag(tran_tag, _constants.GENRE_LIST_CH, _constants.GENRE_LIST);
                        }
                        if (!getTag(i, _constants.GENRE_LIST, _constants.GENRE_LIST_CH)) {
                            getTag(i, _constants.GENRE_LIST_CH, _constants.GENRE_LIST);
                        }
                        if (!getTag(i, _constants.GAME_LIST, _constants.GAME_LIST_CH)) {
                            getTag(i, _constants.GAME_LIST_CH, _constants.GAME_LIST);
                        }
                        if (!getTag(i, _constants.MEDIA_LIST, _constants.MEDIA_LIST_CH)) {
                            getTag(i, _constants.MEDIA_LIST_CH, _constants.MEDIA_LIST);
                        }
                    });
                    if (complete_tag.length > 0) {
                        var _ret7 = function () {
                            var addNext = function addNext(tIndex) {
                                tIndex++;
                                if (tIndex < complete_tag.length) {
                                    return recur_add(tIndex);
                                } else {
                                    return completeNext();
                                }
                            };

                            console.log(items[index].name);
                            console.log(complete_tag);
                            var recur_add = function recur_add(tIndex) {
                                return tool.addTag(items[index]._id, complete_tag[tIndex].tag, {
                                    _id: complete_tag[tIndex].owner,
                                    perm: 1
                                }).then(function () {
                                    return addNext(tIndex);
                                }).catch(function (err) {
                                    (0, _utility.handleError)(err, 'Complete tag');
                                    return addNext(tIndex);
                                });
                            };
                            if (add) {
                                return {
                                    v: recur_add(0)
                                };
                            } else {
                                return {
                                    v: completeNext()
                                };
                            }
                        }();

                        if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
                    } else {
                        return completeNext();
                    }
                }
            };
            return recur_item(0);
        });
    };
    return recur_com();
};
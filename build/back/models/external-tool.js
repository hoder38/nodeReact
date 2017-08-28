'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.youtubeVideoUrl = exports.bilibiliVideoUrl = exports.subHdUrl = undefined;

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _constants = require('../constants');

var _opencc = require('opencc');

var _opencc2 = _interopRequireDefault(_opencc);

var _htmlparser = require('htmlparser2');

var _htmlparser2 = _interopRequireDefault(_htmlparser);

var _path = require('path');

var _youtubeDl = require('youtube-dl');

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _fs = require('fs');

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _tagTool = require('../models/tag-tool');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _apiTool = require('./api-tool');

var _apiTool2 = _interopRequireDefault(_apiTool);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var opencc = new _opencc2.default('s2t.json');

var dramaList = ['http://tw01.lovetvshow.info/2013/05/drama-list.html', 'http://cn.lovetvshow.info/2012/05/drama-list.html', 'http://kr.vslovetv.com/2012/04/drama-list.html', 'http://jp03.jplovetv.com/2012/08/drama-list.html', 'http://www.lovetvshow.com/'];

var recur_loveList = function recur_loveList(dramaIndex, next) {
    return (0, _apiTool2.default)('url', dramaList[dramaIndex]).then(function (raw_data) {
        var list = [];
        var year = null;
        if (dramaIndex === 4) {
            year = '台灣';
        }
        var main = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0];
        var table = null;
        var table2 = null;
        if (dramaIndex === 4) {
            var tables = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'widget HTML')[0], 'div', 'widget-content')[0], 'table');
            table = tables[1];
            table2 = tables[2];
        } else {
            table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0];
            var tbody = (0, _utility.findTag)(table, 'tbody')[0];
            if (tbody) {
                table = tbody;
            }
        }
        var getList = function getList(table) {
            return table.children.forEach(function (t) {
                return (0, _utility.findTag)(t, 'td').forEach(function (d) {
                    var h = (0, _utility.findTag)(d, 'h3')[0];
                    if (h) {
                        var a = (0, _utility.findTag)(h, 'a')[0];
                        if (a) {
                            var name = (0, _utility.findTag)(a)[0];
                            if (name) {
                                if (name.match(/�/)) {
                                    return true;
                                }
                                var dramaType = dramaIndex === 4 ? null : (0, _utility.findTag)(h)[0];
                                if (year) {
                                    /*const url = (dramaIndex === 0) ? addPre(a.attribs.href, 'http://tw.lovetvshow.info') : (dramaIndex === 1) ? addPre(a.attribs.href, 'http://cn.lovetvshow.info') : (dramaIndex === 2) ? addPre(a.attribs.href, 'http://kr.vslovetv.com') : addPre(a.attribs.href, 'http://jp.jplovetv.com');*/
                                    var url = a.attribs.href;
                                    list.push((0, _assign2.default)({
                                        name: name,
                                        url: url + '?max-results=300',
                                        year: year
                                    }, dramaType ? { type: dramaType.match(/^\(([^\)]+)/)[1] } : {}));
                                }
                                return true;
                            }
                        }
                        var getY = function getY(node) {
                            if (dramaIndex === 4) {
                                var y = (0, _utility.findTag)(node)[0].match(/^(大陸綜藝節目)?(韓國綜藝節目)?/);
                                if (y) {
                                    if (y[1]) {
                                        year = '大陸';
                                    } else if (y[2]) {
                                        year = '韓國';
                                    }
                                }
                            } else {
                                var _y = (0, _utility.findTag)(node)[0].match(/^(Pre-)?\d+/);
                                if (_y) {
                                    year = _y[0];
                                }
                            }
                        };
                        var s = (0, _utility.findTag)(h, 'span')[0];
                        if (s) {
                            getY(s);
                        } else {
                            var f = (0, _utility.findTag)(h, 'font')[0];
                            if (f) {
                                getY(f);
                            } else {
                                var strong = (0, _utility.findTag)(h, 'strong')[0];
                                if (strong) {
                                    var span = (0, _utility.findTag)(strong, 'span')[0];
                                    if (span) {
                                        getY(span);
                                    } else {
                                        var font = (0, _utility.findTag)(strong, 'font')[0];
                                        if (font) {
                                            getY(font);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            });
        };
        getList(table);
        if (table2) {
            getList(table2);
        }
        console.log(list.length);
        return next(0, dramaIndex, list);
    });
};

exports.default = {
    //type要補到deltag裡
    getList: function getList(type) {
        var is_clear = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

        var clearExtenal = function clearExtenal() {
            return is_clear ? (0, _mongoTool2.default)('remove', _constants.STORAGEDB, {
                owner: type,
                $isolated: 1
            }).then(function (item) {
                console.log('perm external file');
                console.log(item);
            }) : _promise2.default.resolve();
        };

        var _ret = function () {
            switch (type) {
                case 'lovetv':
                    var recur_loveSave = function recur_loveSave(index, dramaIndex, list) {
                        var external_item = list[index];
                        var name = (0, _utility.toValidName)(external_item.name);
                        if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                            name = (0, _mime.addPost)(name, '1');
                        }
                        return (0, _mongoTool2.default)('count', _constants.STORAGEDB, {
                            owner: type,
                            name: name
                        }, { limit: 1 }).then(function (count) {
                            if (count > 0) {
                                return nextLove(index + 1, dramaIndex, list);
                            }
                            var setTag = new _set2.default(['tv show', '電視劇', '影片', 'video']);
                            if (dramaIndex === 0) {
                                setTag.add('台灣').add('臺灣');
                            } else if (dramaIndex === 1) {
                                setTag.add('大陸').add('中國');
                            } else if (dramaIndex === 2) {
                                setTag.add('韓國');
                            } else if (dramaIndex === 3) {
                                setTag.add('日本');
                            } else if (dramaIndex === 4) {
                                setTag.add('綜藝節目');
                            }
                            setTag.add((0, _tagTool.normalize)(name)).add((0, _tagTool.normalize)(type));
                            if (external_item.type) {
                                setTag.add((0, _tagTool.normalize)(external_item.type));
                            }
                            setTag.add((0, _tagTool.normalize)(external_item.year));
                            if ((0, _tagTool.normalize)(external_item.year) === '台灣') {
                                setTag.add('臺灣');
                            } else if ((0, _tagTool.normalize)(external_item.year) === '大陸') {
                                setTag.add('中國');
                            }
                            var setArr = [];
                            var adultonly = 0;
                            setTag.forEach(function (s) {
                                var is_d = (0, _tagTool.isDefaultTag)(s);
                                if (!is_d) {
                                    setArr.push(s);
                                } else if (is_d.index === 0) {
                                    adultonly = 1;
                                }
                            });
                            return (0, _mongoTool2.default)('insert', _constants.STORAGEDB, (0, _defineProperty3.default)({
                                _id: (0, _mongoTool.objectID)(),
                                name: name,
                                owner: type,
                                utime: Math.round(new Date().getTime() / 1000),
                                url: (0, _utility.isValidString)(external_item.url, 'url', 'url is not vaild'),
                                size: 0,
                                count: 0,
                                first: 1,
                                recycle: 0,
                                adultonly: adultonly,
                                untag: 0,
                                status: 3,
                                tags: setArr,
                                thumb: 'love-thumb-md.png'
                            }, type, setArr)).then(function (item) {
                                console.log('lovetv save');
                                console.log(item[0].name);
                                return nextLove(index + 1, dramaIndex, list);
                            });
                        });
                    };

                    var nextLove = function nextLove(index, dramaIndex, list) {
                        if (index < list.length) {
                            return recur_loveSave(index, dramaIndex, list);
                        } else {
                            dramaIndex++;
                            if (dramaIndex < dramaList.length) {
                                return recur_loveList(dramaIndex, nextLove);
                            }
                        }
                        return _promise2.default.resolve();
                    };

                    return {
                        v: clearExtenal().then(function () {
                            return recur_loveList(0, nextLove);
                        })
                    };
                case 'eztv':
                    var recur_eztvSave = function recur_eztvSave(index, list) {
                        var external_item = list[index];
                        var name = (0, _utility.toValidName)(external_item.name);
                        if ((0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                            name = (0, _mime.addPost)(name, '1');
                        }
                        return (0, _mongoTool2.default)('count', _constants.STORAGEDB, {
                            owner: type,
                            name: name
                        }, { limit: 1 }).then(function (count) {
                            if (count > 0) {
                                return nextEztv(index + 1, list);
                            }
                            var url = (0, _utility.isValidString)(external_item.url, 'url', 'url is not vaild');
                            return (0, _apiTool2.default)('url', external_item.url, { referer: 'https://eztv.ag/' }).then(function (raw_data) {
                                var tables = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table');
                                var info = tables[1] ? (0, _utility.findTag)((0, _utility.findTag)(tables[1], 'tr')[1], 'td')[0] : (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(tables[0], 'tr')[1], 'td')[0], 'center')[0], 'table', 'section_thread_post show_info_description')[0], 'tr')[1], 'td')[0];
                                var setTag = new _set2.default(['tv show', '電視劇', '歐美', '西洋', '影片', 'video']);
                                (0, _utility.findTag)(info).forEach(function (n) {
                                    var infoMatch = false;
                                    if (infoMatch = n.match(/\d+$/)) {
                                        setTag.add(infoMatch[0]);
                                    } else if (infoMatch = n.match(/^Genre:(.*)$/i)) {
                                        var genre = infoMatch[1].match(/([a-zA-Z\-]+)/g);
                                        if (genre) {
                                            genre.map(function (g) {
                                                return setTag.add((0, _tagTool.normalize)(g));
                                            });
                                        }
                                    } else if (infoMatch = n.match(/^Network:(.*)$/i)) {
                                        var network = infoMatch[1].match(/[a-zA-Z\-]+/);
                                        if (network) {
                                            setTag.add((0, _tagTool.normalize)(network[0]));
                                        }
                                    }
                                });
                                var show_name = external_item.url.match(/\/shows\/\d+\/([^\/]+)/);
                                if (show_name) {
                                    setTag.add((0, _tagTool.normalize)(show_name[1].replace(/\-/g, ' ')));
                                }
                                (0, _utility.findTag)(info, 'a').forEach(function (a) {
                                    var imdb = a.attribs.href.match(/http:\/\/www\.imdb\.com\/title\/(tt\d+)\//);
                                    if (imdb) {
                                        setTag.add((0, _tagTool.normalize)(imdb[1]));
                                    }
                                });
                                var setArr = [];
                                var adultonly = 0;
                                setTag.forEach(function (s) {
                                    var is_d = (0, _tagTool.isDefaultTag)(s);
                                    if (!is_d) {
                                        setArr.push(s);
                                    } else if (is_d.index === 0) {
                                        adultonly = 1;
                                    }
                                });
                                return (0, _mongoTool2.default)('insert', _constants.STORAGEDB, (0, _defineProperty3.default)({
                                    _id: (0, _mongoTool.objectID)(),
                                    name: name,
                                    owner: type,
                                    utime: Math.round(new Date().getTime() / 1000),
                                    url: url,
                                    size: 0,
                                    count: 0,
                                    first: 1,
                                    recycle: 0,
                                    adultonly: adultonly,
                                    untag: 0,
                                    status: 3,
                                    tags: setArr,
                                    thumb: 'eztv-logo-small.png'
                                }, type, setArr)).then(function (item) {
                                    console.log('eztvtv save');
                                    console.log(item[0].name);
                                    return nextEztv(index + 1, list);
                                });
                            });
                        });
                    };
                    var eztvList = function eztvList() {
                        return (0, _apiTool2.default)('url', 'https://eztv.ag/showlist/', { referer: 'https://eztv.ag/' }).then(function (raw_data) {
                            var list = [];
                            (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[1], 'tr').forEach(function (t) {
                                var d = (0, _utility.findTag)(t, 'td', 'forum_thread_post')[0];
                                if (d) {
                                    var a = (0, _utility.findTag)(d, 'a')[0];
                                    list.push({
                                        name: (0, _utility.findTag)(a)[0],
                                        url: (0, _utility.addPre)(a.attribs.href, 'https://eztv.ag')
                                    });
                                }
                            });
                            console.log(list.length);
                            return nextEztv(0, list);
                        });
                    };

                    var nextEztv = function nextEztv(index, list) {
                        if (index < list.length) {
                            return recur_eztvSave(index, list);
                        }
                        return _promise2.default.resolve();
                    };

                    return {
                        v: clearExtenal().then(function () {
                            return eztvList();
                        })
                    };
                default:
                    (0, _utility.handleError)(new _utility.HoError('unknown external type'));
            }
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    },
    getSingleList: function getSingleList(type, url) {
        var post = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

        if (!url) {
            return _promise2.default.resolve([]);
        }
        switch (type) {
            case 'yify':
                return (0, _apiTool2.default)('url', url, {
                    referer: 'https://yts.ag/',
                    is_json: true
                }).then(function (raw_data) {
                    if (raw_data['status'] !== 'ok' || !raw_data['data']) {
                        (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                    }
                    return raw_data['data']['movies'] ? raw_data['data']['movies'].map(function (m) {
                        var tags = new _set2.default(['movie', '電影']);
                        tags.add(m['year'].toString());
                        m['genres'].forEach(function (g) {
                            var genre_item = (0, _tagTool.normalize)(g);
                            if (_constants.GENRE_LIST.includes(genre_item)) {
                                tags.add(genre_item).add(_constants.GENRE_LIST_CH[_constants.GENRE_LIST.indexOf(genre_item)]);
                            }
                        });
                        return {
                            name: m['title'],
                            id: m['id'],
                            thumb: m['small_cover_image'],
                            date: m['year'] + '-01-01',
                            rating: m['rating'],
                            tags: [].concat((0, _toConsumableArray3.default)(tags))
                        };
                    }) : [];
                });
            case 'bilibili':
                if (url.match(/(https|http):\/\/www\.bilibili\.com\/list\//)) {
                    return (0, _apiTool2.default)('url', url, { referer: 'http://www.bilibili.com/' }).then(function (raw_data) {
                        return (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data)[1], 'li').map(function (v) {
                            var a = (0, _utility.findTag)((0, _utility.findTag)(v.children[1], 'div', 'l-l')[0], 'a')[0];
                            var img = (0, _utility.findTag)(a, 'img')[0];
                            return {
                                id: a.attribs.href.match(/av\d+/)[0],
                                name: opencc.convertSync(img.attribs.alt),
                                thumb: img.attribs['data-img'],
                                date: new Date('1970-01-01').getTime() / 1000,
                                tags: ['movie', '電影'],
                                count: opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(v.children[1], 'div', 'l-r')[0], 'div', 'v-info')[0], 'span', 'v-info-i gk')[0], 'span')[0].attribs.number)
                            };
                        });
                    });
                } else if (url.match(/(https|http):\/\/www\.bilibili\.com\//)) {
                    return (0, _apiTool2.default)('url', url, {
                        referer: 'http://www.bilibili.com/',
                        is_json: true
                    }).then(function (raw_data) {
                        if (!raw_data || raw_data['message'] !== 'success' || !raw_data['result'] || !raw_data['result']['list']) {
                            console.log(raw_data);
                            (0, _utility.handleError)(new _utility.HoError('bilibili api fail'));
                        }
                        return raw_data['result']['list'].map(function (l) {
                            return {
                                id: l['season_id'],
                                name: opencc.convertSync(l['title']),
                                thumb: l['cover'],
                                date: l['pub_time'],
                                count: 0,
                                tags: ['animation', '動畫']
                            };
                        });
                    });
                } else {
                    return (0, _apiTool2.default)('url', url, {
                        referer: 'http://www.bilibili.com/',
                        is_json: true
                    }).then(function (json_data) {
                        if (!json_data || json_data.code !== 0 && json_data.code !== 1) {
                            console.log(json_data);
                            (0, _utility.handleError)(new _utility.HoError('bilibili api fail'));
                        }
                        var list = [];
                        if (json_data['html']) {
                            var dom = _htmlparser2.default.parseDOM(json_data['html']);
                            list = (0, _utility.findTag)(dom, 'li', 'video matrix ').map(function (v) {
                                var a = (0, _utility.findTag)(v, 'a')[0];
                                var img = (0, _utility.findTag)(a.children[1], 'img')[0];
                                return {
                                    id: a.attribs.href.match(/av\d+/)[0],
                                    name: opencc.convertSync(img.attribs.title),
                                    thumb: img.attribs.src,
                                    date: new Date('1970-01-01').getTime() / 1000,
                                    tags: ['movie', '電影'],
                                    count: opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(v, 'div', 'info')[0], 'div', 'tags')[0], 'span', 'so-icon watch-num')[0])[0])
                                };
                            });
                            if (list.length < 1) {
                                list = (0, _utility.findTag)(dom, 'li', 'synthetical').map(function (v) {
                                    var a = (0, _utility.findTag)(v, 'div', 'left-img')[0].children[1];
                                    return {
                                        id: a.attribs.href.match(/\d+$/)[0],
                                        name: opencc.convertSync(a.attribs.title),
                                        thumb: (0, _utility.findTag)(a, 'img')[0].attribs.src,
                                        date: new Date('1970-01-01').getTime() / 1000,
                                        tags: ['animation', '動畫'],
                                        count: 0
                                    };
                                });
                            }
                        }
                        return list;
                    });
                }
            case 'cartoonmad':
                return (0, _apiTool2.default)('url', url, {
                    referer: 'http://www.cartoonmad.com/',
                    post: post,
                    not_utf8: true
                }).then(function (raw_data) {
                    var list = [];
                    var tr = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr')[3], 'td')[0], 'table')[0], 'tr');
                    if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(tr[1], 'td')[1], 'table')[0], 'td')[0], 'table').length > 0) {
                        tr.forEach(function (v, i) {
                            if (i === 1) {
                                list = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(v, 'td')[1], 'table')[0], 'td').map(function (vv) {
                                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(vv, 'table')[0], 'tr')[0], 'td')[0], 'a')[0];
                                    return {
                                        id: a.attribs.href.match(/\d+/)[0],
                                        name: a.attribs.title,
                                        thumb: (0, _utility.findTag)(a, 'img')[0].attribs.src,
                                        tags: ['漫畫', 'comic']
                                    };
                                });
                            } else if (i % 2 === 1) {
                                list = list.concat((0, _utility.findTag)(v, 'td').map(function (vv) {
                                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(vv, 'table')[0], 'tr')[0], 'td')[0], 'a')[0];
                                    return {
                                        id: a.attribs.href.match(/\d+/)[0],
                                        name: a.attribs.title,
                                        thumb: (0, _utility.findTag)(a, 'img')[0].attribs.src,
                                        tags: ['漫畫', 'comic']
                                    };
                                }));
                            }
                        });
                    }
                    return list;
                });
            case 'bls':
                return (0, _apiTool2.default)('url', 'http://www.bls.gov/bls/newsrels.htm#latest-releases').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = (0, _utility.completeZero)(date.getMonth() + 1, 2) + '/' + (0, _utility.completeZero)(date.getDate(), 2) + '/' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'section')[0], 'div', 'wrapper-outer')[0], 'div', 'wrapper')[0], 'div', 'container')[0], 'table', 'main-content-table')[0], 'tr')[0], 'td', 'main-content-td')[0], 'div', 'bodytext')[0], 'ul')[0], 'li').forEach(function (l) {
                        if ((0, _utility.findTag)(l)[0] === docDate) {
                            var a = (0, _utility.findTag)(l, 'a')[0];
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'http://www.bls.gov'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)(a)[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'cen':
                return (0, _apiTool2.default)('url', 'http://www.census.gov/economic-indicators/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'innerPage')[0], 'div', 'econ-content-container')[0], 'table', 'indicator-table')[0], 'tbody')[0], 'tr').forEach(function (r) {
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(r, 'td', 'indicator_dates')[0], 'div')[0], 'p')[0], 'span')[0])[0] === docDate) {
                            var div = (0, _utility.findTag)((0, _utility.findTag)(r, 'td', 'indicator_data')[0], 'div')[0];
                            list.push({
                                url: (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)(div, 'p', 'supplemental_links')[0], 'a')[0].attribs.href, 'http://www.census.gov'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(div, 'h3')[0], 'a')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'bea':
                return (0, _apiTool2.default)('url', 'http://www.bea.gov/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getMonth() + 1 + '/' + date.getDate() + '/' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'cfinclude')[0], 'div', 'content')[0], 'div', 'col-sm-4 home-right pull-right')[0], 'div', 'menuPod_wrapper')[0], 'div', 'menuPod_header')[0], 'div', 'latestStatistics_wrapper')[0], 'a').forEach(function (a) {
                        var first = (0, _utility.findTag)(a, 'div', 'releaseHeader first')[0];
                        if (!(0, _utility.findTag)(a, 'div', 'releaseHeader first')[0]) {
                            first = (0, _utility.findTag)(a, 'div', 'releaseHeader')[0];
                        }
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(first, 'ul', 'latestStatistics_section')[0], 'li', 'date')[0], 'span')[0])[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'http://www.bea.gov'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(a, 'div', 'releaseContent')[0], 'ul', 'latestStatistics_section')[0], 'li')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'ism':
                return (0, _apiTool2.default)('url', 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var docStr = 'FOR RELEASE: ' + docDate;
                    var list = [];
                    if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'bodywrapper')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'span')[0], 'p')[0], 'strong')[0])[0] === docStr) {
                        list.push({
                            url: 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1',
                            name: (0, _utility.toValidName)('Manufacturing ISM'),
                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                        });
                    }
                    return (0, _apiTool2.default)('url', 'https://www.instituteforsupplymanagement.org/ISMReport/NonMfgROB.cfm?SSO=1').then(function (raw_data) {
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'bodywrapper')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'p')[0], 'strong')[0])[0] === docStr) {
                            list.push({
                                url: 'https://www.instituteforsupplymanagement.org/ISMReport/NonMfgROB.cfm?SSO=1',
                                name: (0, _utility.toValidName)('Non-Manufacturing ISM'),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                        return list;
                    });
                });
            case 'cbo':
                return (0, _apiTool2.default)('url', 'https://www.conference-board.org/data/consumerconfidence.cfm').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getDate() + ' ' + _constants.MONTH_SHORTS[date.getMonth()] + '. ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container tcb-wrapper')[0], 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0] === docDate) {
                        list.push({
                            url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                            name: (0, _utility.toValidName)('Consumer Confidence Survey'),
                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                        });
                    }
                    return (0, _apiTool2.default)('url', 'https://www.conference-board.org/data/bcicountry.cfm?cid=1').then(function (raw_data) {
                        docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                        console.log(docDate);
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container tcb-wrapper')[0], 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: 'https://www.conference-board.org/data/bcicountry.cfm?cid=1',
                                name: (0, _utility.toValidName)('US Business Cycle Indicators'),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                        return list;
                    });
                });
            case 'sem':
                return (0, _apiTool2.default)('url', 'http://www.semi.org/en/NewsFeeds/SEMIHighlights/index.rss').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = (0, _utility.completeZero)(date.getDate(), 2) + ' ' + _constants.MONTH_SHORTS[date.getMonth()] + ' ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'atom:link')[0], 'item').forEach(function (e) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(e, 'pubdate')[0])[0].match(/^[a-zA-Z]+, (\d\d [a-zA-Z]+ \d\d\d\d)/)[1] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)((0, _utility.findTag)(e)[0], 'http://www.semi.org'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)(e, 'title')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'oec':
                return (0, _apiTool2.default)('url', 'http://www.oecd.org/newsroom/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getDate() + ' ' + _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'newsroom-lists')[0], 'div', 'news-col block')[1], 'ul', 'block-list')[0], 'li', 'news-event-item linked ').forEach(function (l) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(l, 'p')[0])[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)((0, _utility.findTag)(l, 'a')[0].attribs.href, 'http://www.oecd.org'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)(l, 'span')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'dol':
                return (0, _apiTool2.default)('url', 'http://www.dol.gov/newsroom/releases').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + (0, _utility.completeZero)(date.getDate(), 2) + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    var section = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'site-wrapper')[0], 'div', 'main-container container')[0], 'div', 'row')[0], 'section', 'col-sm-12')[0], 'div', 'region region-content')[0], 'section', 'block-system-main')[0];
                    var divs = (0, _utility.findTag)(section, 'div', 'field field-name-title field-type-ds field-label-hidden');
                    for (var i in divs) {
                        var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(divs[i], 'div')[0], 'div')[0], 'a')[0];
                        if ((0, _utility.findTag)(a)[0] === 'Unemployment Insurance Weekly Claims Report' && (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(section, 'div', 'field field-name-field-release-date field-type-datetime field-label-hidden')[i], 'div')[0], 'div')[0], 'span')[0])[0].match(/[a-zA-Z]+ \d\d, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'http://www.dol.gov'),
                                name: (0, _utility.toValidName)('Unemployment Insurance Weekly Claims Report'),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    }
                    return list;
                });
            case 'rea':
                return (0, _apiTool2.default)('url', 'http://www.realtor.org/topics/existing-home-sales').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    var link = false;
                    var today = false;
                    var lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'page clearfix')[0], 'section', 'section-content')[0], 'div', 'zone-content-wrapper')[0], 'div', 'zone-content')[0], 'div', 'region-content')[0], 'div', 'region-inner region-content-inner')[0], 'div', 'block-system-main')[0], 'div', 'block-inner clearfix')[0], 'div', 'content clearfix')[0], 'div', 'clearfix panel-display omega-grid rotheme-12-twocol-8-4-stacked')[0], 'div', 'panel-panel grid-8')[0], 'div', 'grid-8 alpha omega')[0], 'div', 'inside')[0], 'div', 'panel-pane pane-entity-field pane-node-body')[0], 'div', 'pane-content')[0], 'div', 'field field-name-body field-type-text-with-summary field-label-hidden')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'ul')[0], 'li');
                    var _iteratorNormalCompletion = true;
                    var _didIteratorError = false;
                    var _iteratorError = undefined;

                    try {
                        for (var _iterator = (0, _getIterator3.default)(lis), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                            var l = _step.value;

                            var a = (0, _utility.findTag)(l, 'a')[0];
                            if ((0, _utility.findTag)(a)[0] === 'Read the full news release') {
                                link = a.attribs.href;
                            }
                            var dateMatch = a.attribs.href.match(/\d\d\d\d-\d\d-\d\d/);
                            if (dateMatch && dateMatch[0] === docDate) {
                                today = true;
                            }
                            if (link && today) {
                                list.push({
                                    url: (0, _utility.addPre)(link, 'http://www.realtor.org'),
                                    name: (0, _utility.toValidName)('Existing-Home Sales'),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
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

                    return list;
                });
            case 'sca':
                return (0, _apiTool2.default)('url', 'http://www.sca.isr.umich.edu/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    if (date.getDate() === 15 || date.getDate() === 28) {
                        list.push({
                            url: 'http://www.sca.isr.umich.edu/',
                            name: (0, _utility.toValidName)('Michigan Consumer Sentiment Index'),
                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                        });
                    }
                    return list;
                });
            case 'fed':
                return (0, _apiTool2.default)('url', 'http://www.federalreserve.gov/feeds/speeches_and_testimony.xml').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = '' + date.getFullYear() + (0, _utility.completeZero)(date.getMonth() + 1, 2) + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'item').forEach(function (t) {
                        var link = (0, _utility.findTag)(t)[0];
                        if (link.match(/\d\d\d\d\d\d\d\d/)[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)(link, 'http://www.federalreserve.gov'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)(t, 'title')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return (0, _apiTool2.default)('url', 'http://www.federalreserve.gov/releases/g17/Current/default.htm').then(function (raw_data) {
                        docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                        console.log(docDate);
                        var content = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0];
                        if ((0, _utility.findTag)((0, _utility.findTag)(content, 'div', 'dates')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                            var as = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'h3')[0], 'span')[0], 'a');
                            var _iteratorNormalCompletion2 = true;
                            var _didIteratorError2 = false;
                            var _iteratorError2 = undefined;

                            try {
                                for (var _iterator2 = (0, _getIterator3.default)(as), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                                    var i = _step2.value;

                                    if ((0, _utility.findTag)(i)[0].match(/pdf/i)) {
                                        list.push({
                                            url: (0, _utility.addPre)(i.attribs.href, 'https://www.federalreserve.gov/releases/g17/Current'),
                                            name: (0, _utility.toValidName)('INDUSTRIAL PRODUCTION AND CAPACITY UTILIZATION'),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                        });
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
                        return (0, _apiTool2.default)('url', 'http://www.federalreserve.gov/releases/g19/current/default.htm').then(function (raw_data) {
                            if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'dates')[0])[2] === ': ' + docDate) {
                                list.push({
                                    url: 'http://www.federalreserve.gov/releases/g19/current/default.htm',
                                    name: (0, _utility.toValidName)('Consumer Credit'),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                            return list;
                        });
                    });
                });
            case 'sea':
                return (0, _apiTool2.default)('url', 'http://www.seaj.or.jp/english/statistics/page_en.php?CMD=1').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'table')[2], 'tr')[0], 'td')[2], 'table')[5], 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[0], 'table')[0], 'tr').forEach(function (t) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[2])[0] === docDate) {
                            var urlS = (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1], 'a')[0].attribs.href;
                            urlS = urlS.match(/^(http|https):\/\//) ? urlS : 'http://' + (0, _path.join)('www.seaj.or.jp/english/statistics', urlS);
                            list.push({
                                url: urlS,
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0])[0] + ' ' + (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0])[1]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'tri':
                return (0, _apiTool2.default)('url', 'http://www.tri.org.tw').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    var docDate = date.getFullYear() - 1911 + '.' + (date.getMonth() + 1) + '.' + date.getDate();
                    console.log(docDate);
                    var list = [];
                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content01LText')[0], 'div')[1], 'div', 'consumerText')[0], 'a')[0];
                    if ((0, _utility.findTag)(a)[0].match(/\d\d\d\.\d\d?\.\d\d?/)[0] === docDate) {
                        list.push({
                            url: (0, _utility.addPre)(a.attribs.href, 'http://www.tri.org.tw'),
                            name: (0, _utility.toValidName)('消費者信心指數調查報告'),
                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                        });
                    }
                    return list;
                });
            case 'ndc':
                return (0, _apiTool2.default)('url', 'http://index.ndc.gov.tw/n/json/data/news', { post: {} }).then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    var json_data = (0, _utility.getJson)(raw_data);
                    var _iteratorNormalCompletion3 = true;
                    var _didIteratorError3 = false;
                    var _iteratorError3 = undefined;

                    try {
                        for (var _iterator3 = (0, _getIterator3.default)(json_data), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                            var i = _step3.value;

                            if (i.date === docDate) {
                                var list_match = i.content.match(/href="([^"]+pdf)".*?title="(.*?\d\d\d\d?年\d\d?月[^"]+)/g);
                                if (list_match) {
                                    var _iteratorNormalCompletion4 = true;
                                    var _didIteratorError4 = false;
                                    var _iteratorError4 = undefined;

                                    try {
                                        for (var _iterator4 = (0, _getIterator3.default)(list_match), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                                            var j = _step4.value;

                                            var item_match = j.match(/href="([^"]+pdf)".*?title="(.*?\d\d\d\d?年\d\d?月[^"]+)/);
                                            if (item_match) {
                                                list.push({
                                                    url: (0, _utility.addPre)(item_match[1], 'http://index.ndc.gov.tw').replace(/&amp;/g, '&'),
                                                    name: (0, _utility.toValidName)(item_match[2]),
                                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                                });
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
                                }
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

                    return list;
                });
            case 'sta':
                return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=489&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '/' + (date.getMonth() + 1) + '/' + date.getDate();
                    console.log(docDate);
                    var list = [];
                    var findDoc = function findDoc(title, raw_data) {
                        var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                        var html2 = (0, _utility.findTag)(html, 'html')[0];
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'table')[0], 'tr').forEach(function (t) {
                            if ((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1])[0] === docDate) {
                                list.push({
                                    url: (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0], 'a')[0].attribs.href, 'http://www.stat.gov.tw'),
                                    name: (0, _utility.toValidName)(title),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                        });
                    };
                    findDoc('物價指數', raw_data);
                    return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=497&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                        findDoc('經濟成長率', raw_data);
                        return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=527&CtUnit=1818&BaseDSD=29&MP=4').then(function (raw_data) {
                            findDoc('受僱員工薪資與生產力', raw_data);
                            return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2294&CtUnit=1818&BaseDSD=29&mp=4').then(function (raw_data) {
                                var pDate = new Date(new Date(date).setMonth(date.getMonth() - 1));
                                var docDate1 = pDate.getFullYear() - 1911 + '\u5E74' + (pDate.getMonth() + 1) + '\u6708';
                                console.log(docDate1);
                                var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                                var html2 = (0, _utility.findTag)(html, 'html')[0];
                                var lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                                var link = null;
                                var _iteratorNormalCompletion5 = true;
                                var _didIteratorError5 = false;
                                var _iteratorError5 = undefined;

                                try {
                                    for (var _iterator5 = (0, _getIterator3.default)(lis), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                        var l = _step5.value;

                                        var a = (0, _utility.findTag)(l, 'a')[0];
                                        var dateMatch = (0, _utility.findTag)(a)[0].match(/^\d\d\d年\d\d?月/);
                                        if (dateMatch && dateMatch[0] === docDate1) {
                                            link = (0, _utility.addPre)(a.attribs.href, 'http://www.stat.gov.tw');
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

                                return link ? (0, _apiTool2.default)('url', link).then(function (raw_data) {
                                    var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                                    var html2 = (0, _utility.findTag)(html, 'html')[0];
                                    if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'cp')[0], 'div', 'article')[0], 'div', 'p_date')[0])[0].match(/\d\d\d\d\/\d\d?\/\d\d?$/)[0] === docDate) {
                                        list.push({
                                            url: link,
                                            name: (0, _utility.toValidName)('失業率'),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                        });
                                    }
                                    return list;
                                }) : list;
                            });
                        });
                    });
                });
            case 'mof':
                return (0, _apiTool2.default)('url', 'http://www.mof.gov.tw/Pages/List.aspx?nodeid=281').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'div', 'wrapper')[0], 'div', 'wrapperInner')[0], 'div', 'contentBox')[0], 'div', 'subpageBox')[0], 'div', 'rowBox_2column_s1')[0], 'div', 'rowBox_2column_s1_col-1')[0], 'div', 'normalListBox')[0], 'div', 'normalListBox_data')[0], 'div', 'tableBox')[0], 'table', 'table_list printArea')[0], 'tr').forEach(function (t) {
                        var td = (0, _utility.findTag)(t, 'td')[3];
                        if (td && (0, _utility.findTag)((0, _utility.findTag)(td, 'div')[0])[0] === docDate) {
                            var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1], 'div')[0], 'a')[0];
                            if (a.attribs.title.match(/海關進出口貿易/)) {
                                list.push({
                                    url: (0, _utility.addPre)(a.attribs.href, 'http://www.mof.gov.tw'),
                                    name: (0, _utility.toValidName)(a.attribs.title),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                        }
                    });
                    return list;
                });
            case 'moe':
                return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2299&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    var pDate = new Date(new Date(date).setMonth(date.getMonth() - 1));
                    var docDate1 = pDate.getFullYear() - 1911 + '\u5E74' + (pDate.getMonth() + 1) + '\u6708';
                    console.log(docDate1);
                    var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                    if (!html) {
                        console.log(raw_data);
                        (0, _utility.handleError)(new _utility.HoError('empty html'));
                    }
                    var html2 = (0, _utility.findTag)(html, 'html')[0];
                    var lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                    var dUrl = false;
                    var _iteratorNormalCompletion6 = true;
                    var _didIteratorError6 = false;
                    var _iteratorError6 = undefined;

                    try {
                        for (var _iterator6 = (0, _getIterator3.default)(lis), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                            var l = _step6.value;

                            var a = (0, _utility.findTag)(l, 'a')[0];
                            if (a.attribs.title.match(/^\d\d\d年\d\d?月/)[0] === docDate1) {
                                dUrl = (0, _utility.addPre)(a.attribs.href, 'http://www.moea.gov.tw');
                                break;
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

                    ;
                    var industrial = function industrial() {
                        return dUrl ? (0, _apiTool2.default)('url', dUrl).then(function (raw_data) {
                            var detail = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0];
                            var texts = (0, _utility.findTag)(detail);
                            var _iteratorNormalCompletion7 = true;
                            var _didIteratorError7 = false;
                            var _iteratorError7 = undefined;

                            try {
                                for (var _iterator7 = (0, _getIterator3.default)(texts), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                                    var t = _step7.value;

                                    var matchT = t.match(/\d\d\d\d-\d\d-\d\d/);
                                    if (matchT && matchT[0] === docDate) {
                                        list.push({
                                            url: dUrl,
                                            name: (0, _utility.toValidName)('工業生產'),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                        });
                                        break;
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
                        }) : _promise2.default.resolve();
                    };
                    return industrial().then(function () {
                        return (0, _apiTool2.default)('url', 'http://www.stat.gov.tw/lp.asp?ctNode=2300&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                            html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                            if (!html) {
                                console.log(raw_data);
                                (0, _utility.handleError)(new _utility.HoError('empty html'));
                            }
                            var html2 = (0, _utility.findTag)(html, 'html')[0];
                            lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                            dUrl = false;
                            var _iteratorNormalCompletion8 = true;
                            var _didIteratorError8 = false;
                            var _iteratorError8 = undefined;

                            try {
                                for (var _iterator8 = (0, _getIterator3.default)(lis), _step8; !(_iteratorNormalCompletion8 = (_step8 = _iterator8.next()).done); _iteratorNormalCompletion8 = true) {
                                    var l = _step8.value;

                                    var a = (0, _utility.findTag)(l, 'a')[0];
                                    var aMatch = a.attribs.title.match(/^\d\d\d年\d\d?月/);
                                    if (aMatch && aMatch[0] === docDate1) {
                                        dUrl = (0, _utility.addPre)(a.attribs.href, 'http://www.moea.gov.tw');
                                        break;
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

                            ;
                            var output = function output() {
                                return dUrl ? (0, _apiTool2.default)('url', dUrl).then(function (raw_data) {
                                    var detail = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0];
                                    var texts = (0, _utility.findTag)(detail);
                                    var _iteratorNormalCompletion9 = true;
                                    var _didIteratorError9 = false;
                                    var _iteratorError9 = undefined;

                                    try {
                                        for (var _iterator9 = (0, _getIterator3.default)(texts), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                                            var t = _step9.value;

                                            var matchT = t.match(/\d\d\d\d-\d\d-\d\d/);
                                            if (matchT && matchT[0] === docDate) {
                                                list.push({
                                                    url: dUrl,
                                                    name: (0, _utility.toValidName)('外銷訂單統計'),
                                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                                });
                                                break;
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
                                }) : _promise2.default.resolve();
                            };
                            return output().then(function () {
                                return list;
                            });
                        });
                    });
                });
            case 'cbc':
                return (0, _apiTool2.default)('url', 'http://www.cbc.gov.tw/rss.asp?ctNodeid=302').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = (0, _utility.completeZero)(date.getDate(), 2) + ' ' + _constants.MONTH_SHORTS[date.getMonth()] + ' ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'rss')[0], 'channel')[0], 'item').forEach(function (t) {
                        if ((0, _utility.findTag)((0, _utility.findTag)(t, 'pubdate')[0])[0].match(/\d\d [a-zA-Z]+ \d\d\d\d/)[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)((0, _utility.findTag)(t)[0], 'http://www.cbc.gov.tw'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)((0, _utility.findTag)(t, 'title')[0])[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            default:
                return _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('unknown external type')));
        }
    },
    save2Drive: function save2Drive(type, obj, parent) {
        var mkFolder = function mkFolder(folderPath) {
            return !(0, _fs.existsSync)(folderPath) ? new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(folderPath, function (err) {
                    return err ? reject(err) : resolve();
                });
            }) : _promise2.default.resolve();
        };
        var filePath = (0, _utility.getFileLocation)(type, (0, _mongoTool.objectID)());
        console.log(filePath);
        var driveName = '';
        switch (type) {
            case 'bls':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper-basic')[0], 'div', 'main-content-full-width')[0], 'div', 'bodytext')[0], 'h4')[1], 'a')[0];
                    if (!(0, _utility.findTag)(a)[0].match(/PDF/i)) {
                        (0, _utility.handleError)(new _utility.HoError('cannot find release'));
                    }
                    var url = (0, _utility.addPre)(a.attribs.href, 'http://www.bls.gov');
                    driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                    console.log(driveName);
                    return mkFolder((0, _path.dirname)(filePath)).then(function () {
                        return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath: filePath,
                                parent: parent,
                                rest: function rest() {
                                    return updateDocDate(type, obj.date);
                                },
                                errhandle: function errhandle(err) {
                                    throw err;
                                }
                            });
                        });
                    });
                });
            case 'cen':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + (0, _path.extname)(obj.url);
                console.log(driveName);
                return mkFolder((0, _path.dirname)(filePath)).then(function () {
                    return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                        return (0, _apiToolGoogle2.default)('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: filePath,
                            parent: parent,
                            rest: function rest() {
                                return updateDocDate(type, obj.date);
                            },
                            errhandle: function errhandle(err) {
                                throw err;
                            }
                        });
                    });
                });
            case 'bea':
                console.log(obj);
                var ext1 = (0, _path.extname)(obj.url);
                if (ext1 === '.pdf') {
                    driveName = obj.name + ' ' + obj.date + ext1;
                    console.log(driveName);
                    return mkFolder((0, _path.dirname)(filePath)).then(function () {
                        return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath: filePath,
                                parent: parent,
                                rest: function rest() {
                                    return updateDocDate(type, obj.date);
                                },
                                errhandle: function errhandle(err) {
                                    throw err;
                                }
                            });
                        });
                    });
                }
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'cfinclude')[0], 'table')[0], 'tr')[0], 'td', 'sidebar')[0], 'div', 'sidebarRight')[0], 'ul', 'related_files')[0], 'li')[0], 'a')[0];
                    if (!(0, _utility.findTag)(a)[0].match(/^Full Release/)) {
                        (0, _utility.handleError)(new _utility.HoError('cannot find release'));
                    }
                    var url = (0, _utility.addPre)(a.attribs.href, 'http://www.bea.gov');
                    driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                    console.log(driveName);
                    return mkFolder((0, _path.dirname)(filePath)).then(function () {
                        return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath: filePath,
                                parent: parent,
                                rest: function rest() {
                                    return updateDocDate(type, obj.date);
                                },
                                errhandle: function errhandle(err) {
                                    throw err;
                                }
                            });
                        });
                    });
                });
            case 'ism':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.txt';
                console.log(driveName);
                return (0, _apiToolGoogle2.default)('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent: parent,
                    rest: function rest() {
                        return updateDocDate(type, obj.date);
                    },
                    errhandle: function errhandle(err) {
                        throw err;
                    }
                });
            case 'cbo':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.txt';
                console.log(driveName);
                return (0, _apiToolGoogle2.default)('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent: parent,
                    rest: function rest() {
                        return updateDocDate(type, obj.date);
                    },
                    errhandle: function errhandle(err) {
                        throw err;
                    }
                });
            case 'sem':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.txt';
                console.log(driveName);
                return (0, _apiToolGoogle2.default)('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent: parent,
                    rest: function rest() {
                        return updateDocDate(type, obj.date);
                    },
                    errhandle: function errhandle(err) {
                        throw err;
                    }
                });
            case 'oec':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'block')[0], 'div', 'webEditContent')[0], 'p')[2], 'strong')[0], 'a')[0];
                    if (!(0, _utility.findTag)(a)[0].match(/pdf/i)) {
                        (0, _utility.handleError)(new _utility.HoError('cannot find release'));
                    }
                    var url = (0, _utility.addPre)(a.attribs.href, 'http://www.oecd.org');
                    driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                    console.log(driveName);
                    return mkFolder((0, _path.dirname)(filePath)).then(function () {
                        return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath: filePath,
                                parent: parent,
                                rest: function rest() {
                                    return updateDocDate(type, obj.date);
                                },
                                errhandle: function errhandle(err) {
                                    throw err;
                                }
                            });
                        });
                    });
                });
            case 'dol':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.pdf';
                console.log(driveName);
                return mkFolder((0, _path.dirname)(filePath)).then(function () {
                    return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                        return (0, _apiToolGoogle2.default)('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: filePath,
                            parent: parent,
                            rest: function rest() {
                                return updateDocDate(type, obj.date);
                            },
                            errhandle: function errhandle(err) {
                                throw err;
                            }
                        });
                    });
                });
            case 'rea':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.txt';
                console.log(driveName);
                return (0, _apiToolGoogle2.default)('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent: parent,
                    rest: function rest() {
                        return updateDocDate(type, obj.date);
                    },
                    errhandle: function errhandle(err) {
                        throw err;
                    }
                });
            case 'sca':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.txt';
                console.log(driveName);
                return (0, _apiToolGoogle2.default)('upload', {
                    type: 'auto',
                    name: driveName,
                    body: obj.url,
                    parent: parent,
                    rest: function rest() {
                        return updateDocDate(type, obj.date);
                    },
                    errhandle: function errhandle(err) {
                        throw err;
                    }
                });
            case 'fed':
                console.log(obj);
                var ext = (0, _path.extname)(obj.url);
                if (ext === '.pdf') {
                    driveName = obj.name + ' ' + obj.date + ext;
                    console.log(driveName);
                    return mkFolder((0, _path.dirname)(filePath)).then(function () {
                        return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                            return (0, _apiToolGoogle2.default)('upload', {
                                type: 'auto',
                                name: driveName,
                                filePath: filePath,
                                parent: parent,
                                rest: function rest() {
                                    return updateDocDate(type, obj.date);
                                },
                                errhandle: function errhandle(err) {
                                    throw err;
                                }
                            });
                        });
                    });
                }
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var share = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'row')[0], 'div', 'page-header')[0], 'div', 'header-group')[0], 'div', 'shareDL')[0];
                    if (share) {
                        var a = (0, _utility.findTag)(share, 'a')[0];
                        if ((0, _utility.findTag)((0, _utility.findTag)(a, 'span')[1])[0].match(/pdf/i)) {
                            var _ret2 = function () {
                                var url = (0, _utility.addPre)(a.attribs.href, 'https://www.federalreserve.gov');
                                driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                                console.log(driveName);
                                return {
                                    v: mkFolder((0, _path.dirname)(filePath)).then(function () {
                                        return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                            return (0, _apiToolGoogle2.default)('upload', {
                                                type: 'auto',
                                                name: driveName,
                                                filePath: filePath,
                                                parent: parent,
                                                rest: function rest() {
                                                    return updateDocDate(type, obj.date);
                                                },
                                                errhandle: function errhandle(err) {
                                                    throw err;
                                                }
                                            });
                                        });
                                    })
                                };
                            }();

                            if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                        }
                    }
                    driveName = obj.name + ' ' + obj.date + '.txt';
                    console.log(driveName);
                    return (0, _apiToolGoogle2.default)('upload', {
                        type: 'auto',
                        name: driveName,
                        body: obj.url,
                        parent: parent,
                        rest: function rest() {
                            return updateDocDate(type, obj.date);
                        },
                        errhandle: function errhandle(err) {
                            throw err;
                        }
                    });
                });
            case 'sea':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + '.pdf';
                console.log(driveName);
                return mkFolder((0, _path.dirname)(filePath)).then(function () {
                    return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                        return (0, _apiToolGoogle2.default)('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: filePath,
                            parent: parent,
                            rest: function rest() {
                                return updateDocDate(type, obj.date);
                            },
                            errhandle: function errhandle(err) {
                                throw err;
                            }
                        });
                    });
                });
            case 'tri':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    return (0, _apiTool2.default)('url', (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content01LText')[0], 'div')[0], 'table', 'text6')[0], 'tr')[1], 'td')[1], 'a')[0].attribs.href, 'http://www.tri.org.tw/page')).then(function (raw_data) {
                        var url = (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'content')[0], 'div', 'content01')[0], 'div', 'content02L')[0], 'div', 'content02LText')[0], 'div')[0], 'table', 'text6')[0], 'tr')[4], 'td')[0], 'a')[0].attribs.href, 'http://www.tri.org.tw');
                        driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                        console.log(driveName);
                        return mkFolder((0, _path.dirname)(filePath)).then(function () {
                            return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                return (0, _apiToolGoogle2.default)('upload', {
                                    type: 'auto',
                                    name: driveName,
                                    filePath: filePath,
                                    parent: parent,
                                    rest: function rest() {
                                        return updateDocDate(type, obj.date);
                                    },
                                    errhandle: function errhandle(err) {
                                        throw err;
                                    }
                                });
                            });
                        });
                    });
                });
            case 'ndc':
                console.log(obj);
                driveName = obj.name + ' ' + obj.date + (0, _path.extname)(obj.url);
                console.log(driveName);
                return mkFolder((0, _path.dirname)(filePath)).then(function () {
                    return (0, _apiTool2.default)('url', obj.url, { filePath: filePath }).then(function () {
                        return (0, _apiToolGoogle2.default)('upload', {
                            type: 'auto',
                            name: driveName,
                            filePath: filePath,
                            parent: parent,
                            rest: function rest() {
                                return updateDocDate(type, obj.date);
                            },
                            errhandle: function errhandle(err) {
                                throw err;
                            }
                        });
                    });
                });
            case 'sta':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                    var html2 = (0, _utility.findTag)(html, 'html')[0];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'cp')[0], 'div', 'article')[0], 'p').forEach(function (p) {
                        var as = (0, _utility.findTag)(p, 'a');
                        if (as.length > 0) {
                            var _iteratorNormalCompletion10 = true;
                            var _didIteratorError10 = false;
                            var _iteratorError10 = undefined;

                            try {
                                for (var _iterator10 = (0, _getIterator3.default)(as), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                                    var a = _step10.value;

                                    if (a.attribs.href.match(/\.pdf$/i)) {
                                        var _ret3 = function () {
                                            var url = (0, _utility.addPre)(a.attribs.href, 'http://www.stat.gov.tw');
                                            driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                                            console.log(driveName);
                                            return {
                                                v: mkFolder((0, _path.dirname)(filePath)).then(function () {
                                                    return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                                        return (0, _apiToolGoogle2.default)('upload', {
                                                            type: 'auto',
                                                            name: driveName,
                                                            filePath: filePath,
                                                            parent: parent,
                                                            rest: function rest() {
                                                                return updateDocDate(type, obj.date);
                                                            },
                                                            errhandle: function errhandle(err) {
                                                                throw err;
                                                            }
                                                        });
                                                    });
                                                })
                                            };
                                        }();

                                        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
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
                        var bs = (0, _utility.findTag)(p, 'b');
                        if (bs.length > 0) {
                            var _iteratorNormalCompletion11 = true;
                            var _didIteratorError11 = false;
                            var _iteratorError11 = undefined;

                            try {
                                for (var _iterator11 = (0, _getIterator3.default)(bs), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                                    var b = _step11.value;

                                    as = (0, _utility.findTag)(b, 'a');
                                    if (as.length > 0) {
                                        var _iteratorNormalCompletion12 = true;
                                        var _didIteratorError12 = false;
                                        var _iteratorError12 = undefined;

                                        try {
                                            for (var _iterator12 = (0, _getIterator3.default)(as), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                                                var _a = _step12.value;

                                                if (_a.attribs.href.match(/\.pdf$/i)) {
                                                    var _ret4 = function () {
                                                        var url = (0, _utility.addPre)(_a.attribs.href, 'http://www.stat.gov.tw');
                                                        driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                                                        console.log(driveName);
                                                        return {
                                                            v: mkFolder((0, _path.dirname)(filePath)).then(function () {
                                                                return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                                                    return (0, _apiToolGoogle2.default)('upload', {
                                                                        type: 'auto',
                                                                        name: driveName,
                                                                        filePath: filePath,
                                                                        parent: parent,
                                                                        rest: function rest() {
                                                                            return updateDocDate(type, obj.date);
                                                                        },
                                                                        errhandle: function errhandle(err) {
                                                                            throw err;
                                                                        }
                                                                    });
                                                                });
                                                            })
                                                        };
                                                    }();

                                                    if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
                                                }
                                            }
                                        } catch (err) {
                                            _didIteratorError12 = true;
                                            _iteratorError12 = err;
                                        } finally {
                                            try {
                                                if (!_iteratorNormalCompletion12 && _iterator12.return) {
                                                    _iterator12.return();
                                                }
                                            } finally {
                                                if (_didIteratorError12) {
                                                    throw _iteratorError12;
                                                }
                                            }
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
                    });
                });
            case 'mof':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url, { referer: 'http://www.mof.gov.tw/Pages/List.aspx?nodeid=281' }).then(function (raw_data) {
                    var ps = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'div', 'wrapper')[0], 'div', 'wrapperInner')[0], 'div', 'contentBox')[0], 'div', 'subpageBox')[0], 'div', 'rowBox_2column_s1')[0], 'div', 'rowBox_2column_s1_col-1')[0], 'div', 'displayDocBox printArea')[0], 'div', 'displayDocBox_content')[0], 'div', 'msgBox imgBottom')[0], 'div', 'msgBox_main')[0], 'div', 'displayDocBox_text')[0], 'p');
                    var _iteratorNormalCompletion13 = true;
                    var _didIteratorError13 = false;
                    var _iteratorError13 = undefined;

                    try {
                        for (var _iterator13 = (0, _getIterator3.default)(ps), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                            var p = _step13.value;

                            var pc = (0, _utility.findTag)(p)[0];
                            if (pc && pc.match(/本文及附表/)) {
                                var _ret5 = function () {
                                    var url = (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(p, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'http://www.mof.gov.tw');
                                    driveName = obj.name + ' ' + obj.date + (0, _path.extname)(url);
                                    console.log(driveName);
                                    return {
                                        v: mkFolder((0, _path.dirname)(filePath)).then(function () {
                                            return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                                return (0, _apiToolGoogle2.default)('upload', {
                                                    type: 'auto',
                                                    name: driveName,
                                                    filePath: filePath,
                                                    parent: parent,
                                                    rest: function rest() {
                                                        return updateDocDate(type, obj.date);
                                                    },
                                                    errhandle: function errhandle(err) {
                                                        throw err;
                                                    }
                                                });
                                            });
                                        })
                                    };
                                }();

                                if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
                            }
                        }
                    } catch (err) {
                        _didIteratorError13 = true;
                        _iteratorError13 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion13 && _iterator13.return) {
                                _iterator13.return();
                            }
                        } finally {
                            if (_didIteratorError13) {
                                throw _iteratorError13;
                            }
                        }
                    }

                    ;
                });
            case 'moe':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var files = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'aspnetForm')[0], 'div')[2], 'div', 'ctl00_Float_layer')[0], 'div', 'divContent')[0], 'div', 'container')[0], 'div', 'div-table-content')[0], 'div', 'row div-tr-content')[0], 'div', 'div-table-content')[0], 'div', 'ctl00_div_Content')[0], 'div', 'divNewsDetail')[0], 'div', 'ctl00_holderContent_wUctlNewsDetail_divFiles')[0], 'div', 'table-files')[0], 'div', 'tr-files');
                    var _iteratorNormalCompletion14 = true;
                    var _didIteratorError14 = false;
                    var _iteratorError14 = undefined;

                    try {
                        for (var _iterator14 = (0, _getIterator3.default)(files), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                            var f = _step14.value;

                            var kind = (0, _utility.findTag)(f, 'div', 'td-filesKind')[0];
                            if (kind) {
                                var a = (0, _utility.findTag)(kind, 'a')[0];
                                if (a.attribs.title.match(/新聞稿.*pdf/)) {
                                    var _ret6 = function () {
                                        var url = a.attribs.href;
                                        url = url.match(/^(http|https):\/\//) ? url : 'http://' + (0, _path.join)('www.moea.gov.tw/MNS/populace/news', url);
                                        driveName = obj.name + ' ' + obj.date + '.pdf';
                                        console.log(driveName);
                                        return {
                                            v: mkFolder((0, _path.dirname)(filePath)).then(function () {
                                                return (0, _apiTool2.default)('url', url, { filePath: filePath }).then(function () {
                                                    return (0, _apiToolGoogle2.default)('upload', {
                                                        type: 'auto',
                                                        name: driveName,
                                                        filePath: filePath,
                                                        parent: parent,
                                                        rest: function rest() {
                                                            return updateDocDate(type, obj.date);
                                                        },
                                                        errhandle: function errhandle(err) {
                                                            throw err;
                                                        }
                                                    });
                                                });
                                            })
                                        };
                                    }();

                                    if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
                                }
                            }
                        }
                    } catch (err) {
                        _didIteratorError14 = true;
                        _iteratorError14 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion14 && _iterator14.return) {
                                _iterator14.return();
                            }
                        } finally {
                            if (_didIteratorError14) {
                                throw _iteratorError14;
                            }
                        }
                    }
                });
            case 'cbc':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var dlPdf = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'main')[0], 'div', 'cp')[0], 'div', 'zone.content')[0], 'div', 'Article')[0], 'div', 'Body')[0], 'div', 'download')[0];
                    var downloadList = [];
                    if (dlPdf) {
                        (0, _utility.findTag)((0, _utility.findTag)(dlPdf, 'ul')[0], 'li').forEach(function (l) {
                            (0, _utility.findTag)(l, 'a').forEach(function (a) {
                                if (a.attribs.href.match(/\.(pdf|xlsx)$/i)) {
                                    downloadList.push((0, _utility.addPre)(a.attribs.href, 'http://www.cbc.gov.tw'));
                                }
                            });
                        });
                    }
                    var recur_down = function recur_down(dIndex) {
                        if (dIndex < downloadList.length) {
                            var _ret7 = function () {
                                driveName = obj.name + ' ' + obj.date + '.' + dIndex + (0, _path.extname)(downloadList[dIndex]);
                                console.log(driveName);
                                var subPath = (0, _utility.getFileLocation)(type, (0, _mongoTool.objectID)());
                                return {
                                    v: mkFolder((0, _path.dirname)(subPath)).then(function () {
                                        return (0, _apiTool2.default)('url', downloadList[dIndex], { filePath: subPath }).then(function () {
                                            return (0, _apiToolGoogle2.default)('upload', {
                                                type: 'auto',
                                                name: driveName,
                                                filePath: subPath,
                                                parent: parent,
                                                rest: function rest() {
                                                    return recur_down(dIndex + 1);
                                                },
                                                errhandle: function errhandle(err) {
                                                    throw err;
                                                }
                                            });
                                        });
                                    })
                                };
                            }();

                            if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
                        } else {
                            return updateDocDate(type, obj.date);
                        }
                    };
                    driveName = obj.name + ' ' + obj.date + '.txt';
                    console.log(driveName);
                    return (0, _apiToolGoogle2.default)('upload', {
                        type: 'auto',
                        name: driveName,
                        body: obj.url,
                        parent: parent,
                        rest: function rest() {
                            return recur_down(0);
                        },
                        errhandle: function errhandle(err) {
                            throw err;
                        }
                    });
                });
            default:
                (0, _utility.handleError)(new _utility.HoError('unknown external type'));
        }
    },
    parseTagUrl: function parseTagUrl(type, url) {
        var taglist = new _set2.default();
        switch (type) {
            case 'imdb':
                return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                    taglist.add('歐美');
                    var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                    var title = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html, 'head')[0], 'title')[0])[0];
                    title = title.match(/^(.*?) \((\d\d\d\d)\) - IMDb$/);
                    taglist.add(title[1]).add(title[2]);
                    var main = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html, 'body')[0], 'div', 'wrapper')[0], 'div', 'root')[0], 'div', 'pagecontent')[0], 'div', 'content-2-wide')[0];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'main_top')[0], 'div', 'title-overview')[0], 'div', 'title-overview-widget')[0], 'div', 'minPosterWithPlotSummaryHeight')[0], 'div', 'plot_summary_wrapper')[0], 'div', 'plot_summary minPlotHeightWithPoster')[0], 'div', 'credit_summary_item').forEach(function (d) {
                        return (0, _utility.findTag)(d, 'span').forEach(function (s) {
                            var cast = (0, _utility.findTag)(s, 'a');
                            if (cast.length > 0) {
                                taglist.add((0, _utility.findTag)((0, _utility.findTag)(cast[0], 'span')[0])[0]);
                            }
                        });
                    });
                    var main_bottom = (0, _utility.findTag)(main, 'div', 'main_bottom')[0];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleCast')[0], 'table', 'cast_list')[0], 'tr').forEach(function (t) {
                        var cast = (0, _utility.findTag)(t, 'td');
                        if (cast.length > 1) {
                            taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(cast[1], 'a')[0], 'span')[0])[0]);
                        }
                    });
                    var _iteratorNormalCompletion15 = true;
                    var _didIteratorError15 = false;
                    var _iteratorError15 = undefined;

                    try {
                        for (var _iterator15 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleStoryLine')[0], 'div', 'see-more inline canwrap')), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                            var t = _step15.value;

                            if ((0, _utility.findTag)((0, _utility.findTag)(t, 'h4')[0])[0] === 'Genres:') {
                                (0, _utility.findTag)(t, 'a').forEach(function (a) {
                                    var genre = (0, _utility.findTag)(a)[0].toLowerCase().trim();
                                    taglist.add(genre);
                                    var index = _constants.GENRE_LIST.indexOf(genre);
                                    if (index !== -1) {
                                        taglist.add(_constants.GENRE_LIST_CH[index]);
                                    }
                                });
                                break;
                            }
                        }
                    } catch (err) {
                        _didIteratorError15 = true;
                        _iteratorError15 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion15 && _iterator15.return) {
                                _iterator15.return();
                            }
                        } finally {
                            if (_didIteratorError15) {
                                throw _iteratorError15;
                            }
                        }
                    }

                    var _iteratorNormalCompletion16 = true;
                    var _didIteratorError16 = false;
                    var _iteratorError16 = undefined;

                    try {
                        for (var _iterator16 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleDetails')[0], 'div', 'txt-block')), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                            var _t = _step16.value;

                            if ((0, _utility.findTag)((0, _utility.findTag)(_t, 'h4')[0])[0] === 'Country:') {
                                (0, _utility.findTag)(_t, 'a').forEach(function (a) {
                                    return taglist.add((0, _utility.findTag)(a)[0]);
                                });
                                break;
                            }
                        }
                    } catch (err) {
                        _didIteratorError16 = true;
                        _iteratorError16 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion16 && _iterator16.return) {
                                _iterator16.return();
                            }
                        } finally {
                            if (_didIteratorError16) {
                                throw _iteratorError16;
                            }
                        }
                    }

                    return [].concat((0, _toConsumableArray3.default)(taglist)).map(function (t) {
                        return (0, _utility.toValidName)(t.toLowerCase());
                    });
                });
            case 'steam':
                return (0, _apiTool2.default)('url', url, { cookie: 'birthtime=536425201; lastagecheckage=1-January-1987' }).then(function (raw_data) {
                    taglist.add('歐美').add('遊戲').add('game');
                    var info = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'responsive_page_frame with_header')[0], 'div', 'responsive_page_content')[0], 'div', 'responsive_page_template_content')[0], 'div', 'game_page_background game')[0], 'div', 'page_content_ctn')[0], 'div', 'page_content')[0], 'div', 'rightcol game_meta_data')[0], 'div', 'block responsive_apppage_details_left game_details underlined_links')[0], 'div')[0], 'div')[0], 'div')[0];
                    (0, _utility.findTag)(info).forEach(function (i) {
                        var name = i.trim();
                        if (name !== ',') {
                            var date = name.match(/^\d?\d [a-zA-Z][a-zA-Z][a-zA-Z], (\d\d\d\d)$/);
                            taglist.add(date ? date[1] : name);
                        }
                    });
                    (0, _utility.findTag)(info, 'a').forEach(function (i) {
                        var a = (0, _utility.findTag)(i)[0].toLowerCase();
                        if (a === 'sports') {
                            a = 'sport';
                        }
                        taglist.add(a);
                        var index = _constants.GAME_LIST.indexOf(a);
                        if (index !== -1) {
                            taglist.add(_constants.GAME_LIST_CH[index]);
                        }
                    });
                    return [].concat((0, _toConsumableArray3.default)(taglist)).map(function (t) {
                        return (0, _utility.toValidName)(t.toLowerCase());
                    });
                });
            case 'allmusic':
                return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                    taglist.add('歐美').add('音樂').add('music');
                    var overflow = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[1];
                    if (overflow.attribs.class === 'overflow-container album') {
                        var container = (0, _utility.findTag)((0, _utility.findTag)(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0];
                        var content = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(container, 'div', 'content')[0], 'header')[0], 'hgroup')[0];
                        var basic = (0, _utility.findTag)((0, _utility.findTag)(container, 'div', 'sidebar')[0], 'section', 'basic-info')[0];
                        taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'h2', 'album-artist')[0], 'span')[0], 'a')[0])[0]).add((0, _utility.findTag)((0, _utility.findTag)(content, 'h1', 'album-title')[0])[0].trim()).add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(basic, 'div', 'release-date')[0], 'span')[0])[0].match(/\d+$/)[0]);
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(basic, 'div', 'genre')[0], 'div')[0], 'a').forEach(function (a) {
                            var genre = (0, _utility.findTag)(a)[0].toLowerCase();
                            var index = _constants.MUSIC_LIST_WEB.indexOf(genre);
                            taglist.add(index !== -1 ? _constants.MUSIC_LIST[index] : genre);
                        });
                    } else if (overflow.attribs.class === 'overflow-container song') {
                        var overview = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0], 'div', 'content overview')[0];
                        var _content = (0, _utility.findTag)((0, _utility.findTag)(overview, 'header')[0], 'hgroup')[0];
                        taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_content, 'h2', 'song-artist')[0], 'span')[0], 'a')[0])[0]).add((0, _utility.findTag)((0, _utility.findTag)(_content, 'h1', 'song-title')[0])[0].trim()).add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(overview, 'section', 'appearances')[0], 'table')[0], 'tbody')[0], 'tr')[0], 'td', 'year')[0])[0].trim());
                    } else if (overflow.attribs.class === 'overflow-container artist') {
                        var _container = (0, _utility.findTag)((0, _utility.findTag)(overflow, 'div', 'cmn_wrap')[0], 'div', 'content-container')[0];
                        taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_container, 'div', 'content')[0], 'header')[0], 'div', 'artist-bio-container')[0], 'hgroup')[0], 'h1', 'artist-name')[0])[0].trim());
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_container, 'div', 'sidebar')[0], 'section', 'basic-info')[0], 'div', 'genre')[0], 'div')[0], 'a').forEach(function (a) {
                            var genre = (0, _utility.findTag)(a)[0].toLowerCase();
                            var index = _constants.MUSIC_LIST_WEB.indexOf(genre);
                            taglist.add(index !== -1 ? _constants.MUSIC_LIST[index] : genre);
                        });
                    }
                    return [].concat((0, _toConsumableArray3.default)(taglist)).map(function (t) {
                        return (0, _utility.toValidName)(t.toLowerCase());
                    });
                });
            case 'marvel':
            case 'dc':
                return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                    taglist.add('歐美').add('漫畫').add('comic').add(type);
                    var _iteratorNormalCompletion17 = true;
                    var _didIteratorError17 = false;
                    var _iteratorError17 = undefined;

                    try {
                        for (var _iterator17 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'WikiaSiteWrapper')[0], 'section', 'WikiaPage')[0], 'div', 'WikiaPageContentWrapper')[0], 'article', 'WikiaMainContent')[0], 'div', 'WikiaMainContentContainer')[0], 'div', 'WikiaArticle')[0], 'div', 'mw-content-text')[0], 'div')), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                            var div = _step17.value;

                            if (div.attribs.class !== 'center') {
                                (0, _utility.findTag)(div, 'div').forEach(function (d, i) {
                                    if (i === 0) {
                                        var name = (0, _utility.findTag)(d);
                                        if (name.length > 0) {
                                            taglist.add(name[0]);
                                        } else {
                                            var _iteratorNormalCompletion18 = true;
                                            var _didIteratorError18 = false;
                                            var _iteratorError18 = undefined;

                                            try {
                                                for (var _iterator18 = (0, _getIterator3.default)(d.children), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                                                    var c = _step18.value;

                                                    name = (0, _utility.findTag)(c);
                                                    if (c.type === 'tag' && name.length > 0) {
                                                        taglist.add(name[0]);
                                                        break;
                                                    }
                                                }
                                            } catch (err) {
                                                _didIteratorError18 = true;
                                                _iteratorError18 = err;
                                            } finally {
                                                try {
                                                    if (!_iteratorNormalCompletion18 && _iterator18.return) {
                                                        _iterator18.return();
                                                    }
                                                } finally {
                                                    if (_didIteratorError18) {
                                                        throw _iteratorError18;
                                                    }
                                                }
                                            }
                                        }
                                    } else {
                                        var dd = (0, _utility.findTag)(d, 'div');
                                        if (dd.length > 0) {
                                            if ((0, _utility.findTag)(dd[0]).length > 0) {
                                                if ((0, _utility.findTag)(dd[0])[0].match(/First appearance/i)) {
                                                    var date = (0, _utility.findTag)(dd[2], 'div');
                                                    if (date.length > 0) {
                                                        taglist.add((0, _utility.findTag)((0, _utility.findTag)(date[0], 'a')[0])[0].match(/\d+$/)[0]);
                                                    }
                                                } else if ((0, _utility.findTag)(dd[0])[0].match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                                    (0, _utility.findTag)(dd[1], 'a').forEach(function (a) {
                                                        return taglist.add((0, _utility.findTag)(a)[0]);
                                                    });
                                                }
                                            } else if ((0, _utility.findTag)(dd[0], 'span').length > 0 && (0, _utility.findTag)((0, _utility.findTag)(dd[0], 'span')[1])[0].match(/(creator|Editor\-in\-Chief|Cover Artist|writer|penciler|inker|letterer|editor)/i)) {
                                                (0, _utility.findTag)(dd[1], 'a').forEach(function (a) {
                                                    return taglist.add((0, _utility.findTag)(a)[0]);
                                                });
                                            }
                                        }
                                    }
                                });
                                break;
                            }
                        }
                    } catch (err) {
                        _didIteratorError17 = true;
                        _iteratorError17 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion17 && _iterator17.return) {
                                _iterator17.return();
                            }
                        } finally {
                            if (_didIteratorError17) {
                                throw _iteratorError17;
                            }
                        }
                    }

                    return [].concat((0, _toConsumableArray3.default)(taglist)).map(function (t) {
                        return (0, _utility.toValidName)(t.toLowerCase());
                    });
                });
            case 'tvdb':
                return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                    taglist.add('歐美').add('電視劇').add('tv show');
                    var fanart = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[2], 'td', 'maincontent')[0], 'div', 'fanart')[0];
                    taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(fanart, 'table')[0], 'tr')[0], 'td')[2], 'div', 'content')[0], 'h1')[0])[0]);
                    (0, _utility.findTag)(fanart, 'div', 'content').forEach(function (c, i) {
                        if (i === 0) {
                            (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(c, 'table')[0], 'tr')[0], 'td')[0], 'table')[0], 'tr').forEach(function (t) {
                                var label = (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0])[0];
                                if (label === 'First Aired:') {
                                    taglist.add((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1])[0].match(/\d+$/)[0]);
                                } else if (label === 'Network:') {
                                    taglist.add((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1])[0]);
                                } else if (label === 'Genre:') {
                                    (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[1]).forEach(function (d) {
                                        var g = d.toLowerCase();
                                        if (g === 'science-fiction') {
                                            g = 'sci-fi';
                                        }
                                        var index = _constants.GENRE_LIST.indexOf(g);
                                        taglist.add(g);
                                        if (index !== -1) {
                                            taglist.add(_constants.GENRE_LIST_CH[index]);
                                        }
                                    });
                                }
                            });
                        } else {
                            if ((0, _utility.findTag)((0, _utility.findTag)(c, 'h1')[0])[0] === 'Actors') {
                                (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(c, 'table')[0], 'tr')[0], 'td').forEach(function (t) {
                                    return taglist.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(t, 'table')[0], 'tr')[0], 'td')[0], 'h2')[0], 'a')[0])[0]);
                                });
                            }
                        }
                    });
                    return [].concat((0, _toConsumableArray3.default)(taglist)).map(function (t) {
                        return (0, _utility.toValidName)(t.toLowerCase());
                    });
                });
            default:
                return _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('unknown external type')));
        }
    },
    youtubePlaylist: function youtubePlaylist(id, index) {
        var pageToken = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
        var back = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;

        return (0, _apiToolGoogle2.default)('y playItem', (0, _assign2.default)({ id: id }, pageToken ? { pageToken: pageToken } : {})).then(function (_ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 4),
                vId_arr = _ref2[0],
                total = _ref2[1],
                nPageToken = _ref2[2],
                pPageToken = _ref2[3];

            if (total <= 0) {
                (0, _utility.handleError)(new _utility.HoError('playlist is empty'));
            }
            var ret_obj = back ? vId_arr[vId_arr.length - 1] : vId_arr[0];
            var is_new = true;
            if (index === 1) {
                is_new = false;
            } else {
                var _iteratorNormalCompletion19 = true;
                var _didIteratorError19 = false;
                var _iteratorError19 = undefined;

                try {
                    for (var _iterator19 = (0, _getIterator3.default)(vId_arr), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
                        var i = _step19.value;

                        if (i.id === index) {
                            ret_obj = i;
                            is_new = false;
                            break;
                        }
                    }
                } catch (err) {
                    _didIteratorError19 = true;
                    _iteratorError19 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion19 && _iterator19.return) {
                            _iterator19.return();
                        }
                    } finally {
                        if (_didIteratorError19) {
                            throw _iteratorError19;
                        }
                    }
                }
            }
            return [ret_obj, false, total, vId_arr, nPageToken, pPageToken, pageToken, is_new];
        });
    },
    getSingleId: function getSingleId(type, url, index) {
        var _this = this;

        var pageToken = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;
        var back = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;

        var sub_index = 0;
        if (typeof index === 'number' || index.match(/^[\d\.]+$/)) {
            if (index < 1) {
                (0, _utility.handleError)(new _utility.HoError('index must > 0'));
            }
            sub_index = Math.round(+index * 1000) % 1000;
            if (sub_index === 0) {
                sub_index++;
            }
            index = Math.floor(+index);
        } else if (type !== 'youtube') {
            (0, _utility.handleError)(new _utility.HoError('index invalid'));
        }
        console.log(url);
        var saveList = function saveList(getlist, raw_list, is_end, etime) {
            var exGet = function exGet() {
                return etime === -1 ? _promise2.default.resolve([raw_list, is_end]) : !etime || etime < new Date().getTime() / 1000 ? getlist() : _promise2.default.resolve([[], false]);
            };
            exGet().then(function (_ref3) {
                var _ref4 = (0, _slicedToArray3.default)(_ref3, 2),
                    raw_list = _ref4[0],
                    is_end = _ref4[1];

                if (raw_list.length > 0) {
                    return (0, _redisTool2.default)('hmset', 'url: ' + encodeURIComponent(url), {
                        raw_list: (0, _stringify2.default)(raw_list),
                        is_end: is_end,
                        etime: Math.round(new Date().getTime() / 1000 + _constants.CACHE_EXPIRE)
                    });
                }
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Redis');
            });
        };

        var _ret8 = function () {
            switch (type) {
                case 'youtube':
                    var youtube_id = url.match(/list=([^&]+)/);
                    return {
                        v: youtube_id ? _this.youtubePlaylist(youtube_id[1], index, pageToken, back) : [{
                            id: 'you_' + url.match(/v=([^&]+)/)[1],
                            index: 1,
                            showId: 1
                        }, false, 1]
                    };
                case 'lovetv':
                    var prefix = url.match(/^((http|https):\/\/[^\/]+)\//);
                    if (!prefix) {
                        (0, _utility.handleError)(new _utility.HoError('invaild url'));
                    }
                    prefix = prefix[1];
                    var lovetvGetlist = function lovetvGetlist() {
                        return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                            var list = [];
                            var outer = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'Blog1')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer');
                            var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(outer[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0], 'table')[0];
                            if (table) {
                                (0, _utility.findTag)(table, 'tr').forEach(function (t) {
                                    var h = (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0], 'h3')[0];
                                    if (h) {
                                        var a = (0, _utility.findTag)(h, 'a')[0];
                                        if (a) {
                                            var name = (0, _utility.findTag)(a)[0];
                                            if (!name.match(/Synopsis$/i)) {
                                                list.splice(0, 0, {
                                                    name: name,
                                                    url: a.attribs.href
                                                });
                                            }
                                        }
                                    }
                                });
                            } else {
                                var _iteratorNormalCompletion20 = true;
                                var _didIteratorError20 = false;
                                var _iteratorError20 = undefined;

                                try {
                                    for (var _iterator20 = (0, _getIterator3.default)(outer), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
                                        var o = _step20.value;

                                        var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(o, 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'h3')[0], 'a')[0];
                                        var name = (0, _utility.findTag)(a)[0];
                                        if (name.match(/劇集列表/)) {
                                            url = a.attribs.href;
                                            console.log(url);
                                            return lovetvGetlist();
                                        }
                                        if (!name.match(/Synopsis$/i)) {
                                            list.splice(0, 0, {
                                                name: name,
                                                url: a.attribs.href
                                            });
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError20 = true;
                                    _iteratorError20 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion20 && _iterator20.return) {
                                            _iterator20.return();
                                        }
                                    } finally {
                                        if (_didIteratorError20) {
                                            throw _iteratorError20;
                                        }
                                    }
                                }
                            }
                            var is_end = false;
                            var _iteratorNormalCompletion21 = true;
                            var _didIteratorError21 = false;
                            var _iteratorError21 = undefined;

                            try {
                                for (var _iterator21 = (0, _getIterator3.default)(list), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
                                    var _i = _step21.value;

                                    if (_i.url.match(/大結局/)) {
                                        is_end = true;
                                        break;
                                    }
                                }
                            } catch (err) {
                                _didIteratorError21 = true;
                                _iteratorError21 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion21 && _iterator21.return) {
                                        _iterator21.return();
                                    }
                                } finally {
                                    if (_didIteratorError21) {
                                        throw _iteratorError21;
                                    }
                                }
                            }

                            return list.length < 1 ? (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                                owner: type,
                                url: encodeURIComponent(url)
                            }).then(function (items) {
                                if (items.length < 1) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot find lovetv url'));
                                }
                                var nextLove = function nextLove(index, dramaIndex, list) {
                                    var _iteratorNormalCompletion22 = true;
                                    var _didIteratorError22 = false;
                                    var _iteratorError22 = undefined;

                                    try {
                                        var _loop = function _loop() {
                                            var i = _step22.value;

                                            if (i.name === items[0].name) {
                                                return {
                                                    v: (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $set: { url: (0, _utility.isValidString)(i.url, 'url', 'url is not vaild') } }).then(function (item) {
                                                        url = i.url;
                                                        return lovetvGetlist();
                                                    })
                                                };
                                            }
                                        };

                                        for (var _iterator22 = (0, _getIterator3.default)(list), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                                            var _ret9 = _loop();

                                            if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
                                        }
                                    } catch (err) {
                                        _didIteratorError22 = true;
                                        _iteratorError22 = err;
                                    } finally {
                                        try {
                                            if (!_iteratorNormalCompletion22 && _iterator22.return) {
                                                _iterator22.return();
                                            }
                                        } finally {
                                            if (_didIteratorError22) {
                                                throw _iteratorError22;
                                            }
                                        }
                                    }

                                    dramaIndex++;
                                    if (dramaIndex < dramaList.length) {
                                        return recur_loveList(dramaIndex, nextLove);
                                    }
                                    (0, _utility.handleError)(new _utility.HoError('cannot find lovetv'));
                                };
                                return recur_loveList(0, nextLove);
                            }) : [list, is_end];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                var choose = raw_list[index - 1];
                                if (!choose) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                return (0, _apiTool2.default)('url', !choose.url.match(/^(http|https):\/\//) ? '' + prefix + choose.url : choose.url).then(function (raw_data) {
                                    var obj = [];
                                    var vs = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0];
                                    var getV = function getV(v) {
                                        var vType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

                                        if (v) {
                                            var vIds = (0, _utility.findTag)((0, _utility.findTag)(v, 'div', 'video_ids' + vType)[0])[0].match(/[^,]+/g);
                                            if (vIds.length > 0) {
                                                var t = Number((0, _utility.findTag)((0, _utility.findTag)(v, 'div', 'video_type' + vType)[0])[0]);
                                                if (t === 17) {
                                                    for (var _i2 = 1; _i2 <= vIds[1]; _i2++) {
                                                        obj.push('bil_av' + vIds[0] + '_' + _i2);
                                                    }
                                                } else if (t === 1) {
                                                    var _iteratorNormalCompletion23 = true;
                                                    var _didIteratorError23 = false;
                                                    var _iteratorError23 = undefined;

                                                    try {
                                                        for (var _iterator23 = (0, _getIterator3.default)(vIds), _step23; !(_iteratorNormalCompletion23 = (_step23 = _iterator23.next()).done); _iteratorNormalCompletion23 = true) {
                                                            var _i3 = _step23.value;

                                                            obj.push('you_' + _i3);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError23 = true;
                                                        _iteratorError23 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion23 && _iterator23.return) {
                                                                _iterator23.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError23) {
                                                                throw _iteratorError23;
                                                            }
                                                        }
                                                    }
                                                } else if (t === 10) {
                                                    var _iteratorNormalCompletion24 = true;
                                                    var _didIteratorError24 = false;
                                                    var _iteratorError24 = undefined;

                                                    try {
                                                        for (var _iterator24 = (0, _getIterator3.default)(vIds), _step24; !(_iteratorNormalCompletion24 = (_step24 = _iterator24.next()).done); _iteratorNormalCompletion24 = true) {
                                                            var _i4 = _step24.value;

                                                            obj.push('yuk_' + _i4);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError24 = true;
                                                        _iteratorError24 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion24 && _iterator24.return) {
                                                                _iterator24.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError24) {
                                                                throw _iteratorError24;
                                                            }
                                                        }
                                                    }
                                                } else if (t === 3) {
                                                    //open
                                                    var _iteratorNormalCompletion25 = true;
                                                    var _didIteratorError25 = false;
                                                    var _iteratorError25 = undefined;

                                                    try {
                                                        for (var _iterator25 = (0, _getIterator3.default)(vIds), _step25; !(_iteratorNormalCompletion25 = (_step25 = _iterator25.next()).done); _iteratorNormalCompletion25 = true) {
                                                            var _i5 = _step25.value;

                                                            obj.push('ope_' + _i5);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError25 = true;
                                                        _iteratorError25 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion25 && _iterator25.return) {
                                                                _iterator25.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError25) {
                                                                throw _iteratorError25;
                                                            }
                                                        }
                                                    }
                                                } else if (t === 12) {
                                                    //up2stream
                                                    var _iteratorNormalCompletion26 = true;
                                                    var _didIteratorError26 = false;
                                                    var _iteratorError26 = undefined;

                                                    try {
                                                        for (var _iterator26 = (0, _getIterator3.default)(vIds), _step26; !(_iteratorNormalCompletion26 = (_step26 = _iterator26.next()).done); _iteratorNormalCompletion26 = true) {
                                                            var _i6 = _step26.value;

                                                            obj.push('up2_' + _i6);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError26 = true;
                                                        _iteratorError26 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion26 && _iterator26.return) {
                                                                _iterator26.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError26) {
                                                                throw _iteratorError26;
                                                            }
                                                        }
                                                    }
                                                } else if (t === 19) {
                                                    //愛奇藝
                                                    var _iteratorNormalCompletion27 = true;
                                                    var _didIteratorError27 = false;
                                                    var _iteratorError27 = undefined;

                                                    try {
                                                        for (var _iterator27 = (0, _getIterator3.default)(vIds), _step27; !(_iteratorNormalCompletion27 = (_step27 = _iterator27.next()).done); _iteratorNormalCompletion27 = true) {
                                                            var _i7 = _step27.value;

                                                            obj.push('iqi_' + _i7);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError27 = true;
                                                        _iteratorError27 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion27 && _iterator27.return) {
                                                                _iterator27.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError27) {
                                                                throw _iteratorError27;
                                                            }
                                                        }
                                                    }
                                                } else if (t === 6) {
                                                    //line tv
                                                    var _iteratorNormalCompletion28 = true;
                                                    var _didIteratorError28 = false;
                                                    var _iteratorError28 = undefined;

                                                    try {
                                                        for (var _iterator28 = (0, _getIterator3.default)(vIds), _step28; !(_iteratorNormalCompletion28 = (_step28 = _iterator28.next()).done); _iteratorNormalCompletion28 = true) {
                                                            var _i8 = _step28.value;

                                                            obj.push('lin_' + _i8);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError28 = true;
                                                        _iteratorError28 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion28 && _iterator28.return) {
                                                                _iterator28.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError28) {
                                                                throw _iteratorError28;
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    var _iteratorNormalCompletion29 = true;
                                                    var _didIteratorError29 = false;
                                                    var _iteratorError29 = undefined;

                                                    try {
                                                        for (var _iterator29 = (0, _getIterator3.default)(vIds), _step29; !(_iteratorNormalCompletion29 = (_step29 = _iterator29.next()).done); _iteratorNormalCompletion29 = true) {
                                                            var _i9 = _step29.value;

                                                            obj.push('dym_' + _i9);
                                                        }
                                                    } catch (err) {
                                                        _didIteratorError29 = true;
                                                        _iteratorError29 = err;
                                                    } finally {
                                                        try {
                                                            if (!_iteratorNormalCompletion29 && _iterator29.return) {
                                                                _iterator29.return();
                                                            }
                                                        } finally {
                                                            if (_didIteratorError29) {
                                                                throw _iteratorError29;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    };
                                    var div1 = (0, _utility.findTag)((0, _utility.findTag)(vs, 'p')[0], 'div', 'video_div')[0];
                                    getV(div1 ? div1 : (0, _utility.findTag)(vs, 'div', 'video_div')[0]);
                                    getV((0, _utility.findTag)(vs, 'div', 'video_div_s2')[0], '_s2');
                                    getV((0, _utility.findTag)(vs, 'div', 'video_div_s3')[0], '_s3');
                                    if (!obj) {
                                        (0, _utility.handleError)(new _utility.HoError('no source'));
                                    }
                                    if (sub_index > obj.length) {
                                        sub_index = 1;
                                    }
                                    console.log(obj);
                                    saveList(lovetvGetlist, raw_list, is_end, etime);
                                    return [(0, _assign2.default)({
                                        id: obj[sub_index - 1],
                                        index: index,
                                        showId: index
                                    }, obj.length > 1 ? {
                                        sub: obj.length,
                                        index: (index * 1000 + sub_index) / 1000,
                                        showId: (index * 1000 + sub_index) / 1000
                                    } : {}), is_end, raw_list.length];
                                });
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : lovetvGetlist().then(function (_ref5) {
                                var _ref6 = (0, _slicedToArray3.default)(_ref5, 2),
                                    raw_list = _ref6[0],
                                    is_end = _ref6[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                case 'eztv':
                    var eztvGetlist = function eztvGetlist() {
                        var getEzList = function getEzList(tr) {
                            var list = [];
                            tr.reverse().forEach(function (tr) {
                                var td = (0, _utility.findTag)(tr, 'td', 'forum_thread_post');
                                var a = (0, _utility.findTag)(td[2], 'a', 'magnet')[0];
                                if (a) {
                                    var episodeMatch = a.attribs.title.match(/ S?(\d+)[XE](\d+) /i);
                                    if (episodeMatch) {
                                        var season = episodeMatch[1].length === 1 ? '00' + episodeMatch[1] : episodeMatch[1].length === 2 ? '0' + episodeMatch[1] : episodeMatch[1];
                                        season = episodeMatch[2].length === 1 ? season + '00' + episodeMatch[2] : episodeMatch[2].length === 2 ? season + '0' + episodeMatch[2] : '' + season + episodeMatch[2];
                                        var sizeMatch = (0, _utility.findTag)(td[3])[0].match(/^(\d+\.?\d+?) ([MG])/);
                                        var size = sizeMatch[2] === 'G' ? Number(sizeMatch[1]) * 1000 : Number(sizeMatch[1]);
                                        var data = {
                                            magnet: a.attribs.href,
                                            name: (0, _utility.findTag)((0, _utility.findTag)(td[1], 'a')[0])[0],
                                            season: season,
                                            size: size
                                        };
                                        var si = -1;
                                        for (var _i10 in list) {
                                            if (list[_i10][0]['season'] === season) {
                                                si = _i10;
                                                break;
                                            }
                                        }
                                        if (si === -1) {
                                            list.push([data]);
                                        } else {
                                            var isInsert = false;
                                            for (var _i11 in list[si]) {
                                                if (list[si][_i11].size > size) {
                                                    list[si].splice(_i11, 0, data);
                                                    isInsert = true;
                                                    break;
                                                }
                                            }
                                            if (!isInsert) {
                                                list[si].push(data);
                                            }
                                        }
                                    }
                                }
                            });
                            return list;
                        };
                        if (url.match(/^https:\/\/eztv\.ag\/search\//)) {
                            console.log('start more');
                            return (0, _apiTool2.default)('url', url, { referer: 'https://eztv.ag/' }).then(function (raw_data) {
                                return [getEzList((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[2], 'tr', 'forum_header_border')), false];
                            });
                        } else {
                            return (0, _apiTool2.default)('url', url, { referer: 'https://eztv.ag/' }).then(function (raw_data) {
                                var center = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'div')[6], 'table', 'forum_header_border_normal')[0], 'tr')[1], 'td')[0], 'center')[0];
                                var tr = (0, _utility.findTag)((0, _utility.findTag)(center, 'table', 'forum_header_noborder')[0], 'tr', 'forum_header_border');
                                var trLength = tr.length;
                                console.log(trLength);
                                var is_end = false;
                                var _iteratorNormalCompletion30 = true;
                                var _didIteratorError30 = false;
                                var _iteratorError30 = undefined;

                                try {
                                    for (var _iterator30 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(center, 'table')[0], 'tr')[4], 'td')[0], 'b')), _step30; !(_iteratorNormalCompletion30 = (_step30 = _iterator30.next()).done); _iteratorNormalCompletion30 = true) {
                                        var _i12 = _step30.value;

                                        if ((0, _utility.findTag)(_i12)[0] === 'Ended') {
                                            is_end = true;
                                            break;
                                        }
                                    }
                                } catch (err) {
                                    _didIteratorError30 = true;
                                    _iteratorError30 = err;
                                } finally {
                                    try {
                                        if (!_iteratorNormalCompletion30 && _iterator30.return) {
                                            _iterator30.return();
                                        }
                                    } finally {
                                        if (_didIteratorError30) {
                                            throw _iteratorError30;
                                        }
                                    }
                                }

                                if (trLength < 100) {
                                    return [getEzList(tr), is_end];
                                } else {
                                    console.log('too much');
                                    var show_name = url.match(/^https:\/\/[^\/]+\/shows\/\d+\/([^\/]+)/);
                                    if (!show_name) {
                                        (0, _utility.handleError)(new _utility.HoError('unknown name!!!'));
                                    }
                                    return (0, _apiTool2.default)('url', 'https://eztv.ag/search/' + show_name[1], { referer: 'https://eztv.ag/' }).then(function (raw_data) {
                                        var tr1 = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'header_holder')[0], 'table', 'forum_header_border')[2], 'tr', 'forum_header_border');
                                        var trLength1 = tr1.length;
                                        console.log(trLength1);
                                        if (trLength1 > trLength) {
                                            tr = tr1;
                                        }
                                        return [getEzList(tr), is_end];
                                    });
                                }
                            });
                        }
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                var choose = raw_list[index - 1];
                                if (!choose) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                var chooseMag = choose.splice(choose.length - 1, 1)[0];
                                var ret_obj = {
                                    index: index,
                                    showId: index,
                                    is_magnet: true,
                                    complete: false
                                };
                                var final_check = function final_check() {
                                    (0, _utility.isValidString)(chooseMag.magnet, 'url', 'magnet is not vaild');
                                    return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { magnet: {
                                            $regex: chooseMag.magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                                            $options: 'i'
                                        } }, { limit: 1 }).then(function (items) {
                                        return [(0, _assign2.default)(ret_obj, { title: chooseMag.name }, items.length > 0 ? { id: items[0]._id } : { magnet: chooseMag.magnet }), is_end, raw_list.length];
                                    });
                                };
                                var recur_check = function recur_check(mIndex) {
                                    return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { magnet: {
                                            $regex: choose[mIndex].magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                                            $options: 'i'
                                        } }, { limit: 1 }).then(function (items) {
                                        if (items.length > 0) {
                                            return [(0, _assign2.default)(ret_obj, {
                                                id: items[0]._id,
                                                title: choose[mIndex].name
                                            }), is_end, raw_list.length];
                                        } else {
                                            mIndex++;
                                            return mIndex < choose.length ? recur_check(mIndex) : final_check();
                                        }
                                    });
                                };
                                saveList(eztvGetlist, raw_list, is_end, etime);
                                return choose.length > 0 ? recur_check(0) : final_check();
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : eztvGetlist().then(function (_ref7) {
                                var _ref8 = (0, _slicedToArray3.default)(_ref7, 2),
                                    raw_list = _ref8[0],
                                    is_end = _ref8[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                case 'yify':
                    var yifyGetlist = function yifyGetlist() {
                        return (0, _apiTool2.default)('url', url, { referer: 'https://yts.ag/' }).then(function (raw_data) {
                            var json_data = (0, _utility.getJson)(raw_data);
                            if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                                (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                            }
                            var magnet = null;
                            var _iteratorNormalCompletion31 = true;
                            var _didIteratorError31 = false;
                            var _iteratorError31 = undefined;

                            try {
                                for (var _iterator31 = (0, _getIterator3.default)(json_data['data']['movie']['torrents']), _step31; !(_iteratorNormalCompletion31 = (_step31 = _iterator31.next()).done); _iteratorNormalCompletion31 = true) {
                                    var _i13 = _step31.value;

                                    if (_i13['quality'] === '1080p' || !magnet && _i13['quality'] === '720p') {
                                        magnet = 'magnet:?xt=urn:btih:' + _i13['hash'] + '&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969';
                                    }
                                }
                            } catch (err) {
                                _didIteratorError31 = true;
                                _iteratorError31 = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion31 && _iterator31.return) {
                                        _iterator31.return();
                                    }
                                } finally {
                                    if (_didIteratorError31) {
                                        throw _iteratorError31;
                                    }
                                }
                            }

                            return [[{
                                magnet: magnet,
                                title: json_data['data']['movie']['title']
                            }], false];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                (0, _utility.isValidString)(raw_list[0].magnet, 'url', 'magnet is not vaild');
                                saveList(yifyGetlist, raw_list, is_end, etime);
                                return (0, _mongoTool2.default)('find', _constants.STORAGEDB, { magnet: {
                                        $regex: raw_list[0].magnet.match(/^magnet:[^&]+/)[0].match(/[^:]+$/)[0],
                                        $options: 'i'
                                    } }, { limit: 1 }).then(function (items) {
                                    return [(0, _assign2.default)({
                                        index: 1,
                                        showId: 1,
                                        title: raw_list[0].title,
                                        is_magnet: true,
                                        complete: false
                                    }, items.length > 0 ? { id: items[0]._id } : { magnet: raw_list[0].magnet }), is_end, raw_list.length];
                                });
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : yifyGetlist().then(function (_ref9) {
                                var _ref10 = (0, _slicedToArray3.default)(_ref9, 2),
                                    raw_list = _ref10[0],
                                    is_end = _ref10[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                case 'bilibili':
                    var bilibiliGetlist = function bilibiliGetlist() {
                        var bili_id = url.match(/(av)?\d+/);
                        if (!bili_id) {
                            (0, _utility.handleError)(new _utility.HoError('bilibili id invalid'));
                        }
                        var getBangumi = function getBangumi(sId) {
                            return (0, _apiTool2.default)('url', 'http://bangumi.bilibili.com/jsonp/seasoninfo/' + sId + '.ver?callback=seasonListCallback&jsonp=jsonp&_=' + new Date().getTime(), { referer: url }).then(function (raw_data) {
                                var json_data = (0, _utility.getJson)(raw_data.match(/^[^\(]+\((.*)\);$/)[1]);
                                if (!json_data.result || !json_data.result.episodes) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot get episodes'));
                                }
                                return [json_data.result.episodes.map(function (e) {
                                    return {
                                        id: 'bil_av' + e.av_id + '_' + e.page,
                                        name: e.index_title
                                    };
                                }).reverse(), json_data.result.seasons];
                            });
                        };
                        return bili_id[1] ? (0, _apiTool2.default)('url', url, { referer: 'http://www.bilibili.com/' }).then(function (raw_data) {
                            var select = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'b-page-body')[0], 'div', 'player-wrapper')[0], 'div', 'main-inner')[0], 'div', 'v-plist')[0], 'div', 'plist')[0], 'select');
                            return select.length > 0 ? [(0, _utility.findTag)(select[0], 'option').map(function (o) {
                                return {
                                    id: 'bil_' + bili_id[0] + '_' + o.attribs.value.match(/index_(\d+)\.html/)[1],
                                    name: (0, _utility.findTag)(o)[0]
                                };
                            }), false] : [[{
                                id: 'bil_' + bili_id[0],
                                name: 'bil'
                            }], false];
                        }) : getBangumi(bili_id[0]).then(function (_ref11) {
                            var _ref12 = (0, _slicedToArray3.default)(_ref11, 2),
                                list = _ref12[0],
                                seasons = _ref12[1];

                            var recur_season = function recur_season(index) {
                                return getBangumi(seasons[index].season_id).then(function (_ref13) {
                                    var _ref14 = (0, _slicedToArray3.default)(_ref13, 2),
                                        slist = _ref14[0],
                                        sseasons = _ref14[1];

                                    list = list.concat(slist);
                                    index++;
                                    return index < seasons.length ? recur_season(index) : [list, false];
                                });
                            };
                            return seasons.length > 0 ? recur_season(0) : [list, false];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                var choose = raw_list[index - 1];
                                if (!choose) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                saveList(bilibiliGetlist, raw_list, is_end, etime);
                                return [{
                                    index: index,
                                    showId: index,
                                    id: choose.id,
                                    title: choose.name
                                }, is_end, raw_list.length];
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : bilibiliGetlist().then(function (_ref15) {
                                var _ref16 = (0, _slicedToArray3.default)(_ref15, 2),
                                    raw_list = _ref16[0],
                                    is_end = _ref16[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                case 'cartoonmad':
                    if (!url.match(/\d+/)) {
                        (0, _utility.handleError)(new _utility.HoError('comic id invalid'));
                    }
                    var madGetlist = function madGetlist() {
                        return (0, _apiTool2.default)('url', url, {
                            referer: 'http://www.cartoonmad.com/',
                            not_utf8: true
                        }).then(function (raw_data) {
                            var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr')[3], 'td')[0], 'table')[0], 'tr')[1], 'td')[1], 'table');
                            var is_end = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table[0], 'tr')[6], 'td')[0], 'img')[1].attribs.src.match(/\/image\/chap9\.gif$/) ? true : false;
                            var list = [];
                            (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table[2], 'tr')[0], 'td')[0], 'fieldset')[0], 'table').forEach(function (t) {
                                (0, _utility.findTag)(t, 'tr').forEach(function (r) {
                                    (0, _utility.findTag)(r, 'td').forEach(function (d) {
                                        var a = (0, _utility.findTag)(d, 'a');
                                        if (a.length > 0) {
                                            list.push(a[0].attribs.href);
                                        }
                                    });
                                });
                            });
                            return [list, is_end];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                var choose = raw_list[index - 1];
                                if (!choose) {
                                    (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                return (0, _apiTool2.default)('url', !choose.match(/^(https|http):\/\//) ? choose.match(/^\//) ? 'http://www.cartoomad.com' + choose : 'http://www.cartoomad.com/' + choose : choose, {
                                    referer: 'http://www.cartoonmad.com/',
                                    not_utf8: true
                                }).then(function (raw_data) {
                                    var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                                    var sub = Number(choose.match(/(\d\d\d)\d\d\d\.html$/)[1]);
                                    var pre_obj = [];
                                    for (var _i14 = 1; _i14 <= sub; _i14++) {
                                        pre_obj.push(_i14 < 10 ? '00' + _i14 + '.jpg' : _i14 < 100 ? '0' + _i14 + '.jpg' : _i14 + '.jpg');
                                    }
                                    saveList(madGetlist, raw_list, is_end, etime);
                                    return [{
                                        index: (index * 1000 + sub_index) / 1000,
                                        showId: (index * 1000 + sub_index) / 1000,
                                        title: (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(body, 'table')[0], 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[1], 'center')[0], 'li')[0], 'a')[1])[0],
                                        pre_url: (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(body, 'tr')[0], 'td')[0], 'a')[0], 'img')[0].attribs.src.match(/^(.*?)[^\/]+$/)[1],
                                        sub: sub,
                                        pre_obj: pre_obj
                                    }, is_end, raw_list.length];
                                });
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : madGetlist().then(function (_ref17) {
                                var _ref18 = (0, _slicedToArray3.default)(_ref17, 2),
                                    raw_list = _ref18[0],
                                    is_end = _ref18[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                default:
                    (0, _utility.handleError)(new _utility.HoError('unknown external type'));
            }
        }();

        if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
    },
    saveSingle: function saveSingle(type, id) {
        var url = null;
        switch (type) {
            case 'yify':
                var getMid = function getMid() {
                    return isNaN(id) ? (0, _apiTool2.default)('url', 'https://yts.ag/movie/' + id, { referer: 'https://yts.ag/' }).then(function (raw_data) {
                        return (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main-content')[0], 'div', 'movie-content')[0], 'div', 'row')[0], 'div', 'movie-info')[0].attribs['data-movie-id'];
                    }) : _promise2.default.resolve(id);
                };
                return getMid().then(function (mid) {
                    url = 'https://yts.ag/api/v2/movie_details.json?with_cast=true&movie_id=' + mid;
                    return (0, _apiTool2.default)('url', url, { referer: 'https://yts.ag/' }).then(function (raw_data) {
                        var json_data = (0, _utility.getJson)(raw_data);
                        if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                            (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                        }
                        var setTag = new _set2.default(['yify', 'video', '影片', 'movie', '電影']);
                        setTag.add(json_data['data']['movie']['imdb_code']).add(json_data['data']['movie']['year'].toString());
                        json_data['data']['movie']['genres'].forEach(function (i) {
                            return setTag.add(i);
                        });
                        if (json_data['data']['movie']['cast']) {
                            json_data['data']['movie']['cast'].forEach(function (i) {
                                return setTag.add(i.name);
                            });
                        }
                        var newTag = new _set2.default();
                        setTag.forEach(function (i) {
                            return newTag.add(_constants.TRANS_LIST.includes(i) ? _constants.TRANS_LIST_CH[_constants.TRANS_LIST.indexOf(i)] : i);
                        });
                        return [json_data['data']['movie']['title'], newTag, new _set2.default(), 'yify', json_data['data']['movie']['small_cover_image'], url];
                    });
                });
            case 'cartoonmad':
                url = 'http://www.cartoonmad.com/comic/' + id + '.html';
                return (0, _apiTool2.default)('url', url, {
                    referer: 'http://www.cartoonmad.com/',
                    not_utf8: true
                }).then(function (raw_data) {
                    var info = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'table')[0], 'tr')[0], 'td')[1], 'table')[0], 'tr');
                    var comicPath = (0, _utility.findTag)((0, _utility.findTag)(info[2], 'td')[1], 'a');
                    var table = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(info[3], 'td')[0], 'table')[0], 'tr')[1], 'td')[1], 'table')[0];
                    var setTag = new _set2.default(['cartoonmad', '漫畫', 'comic', '圖片集', 'image book', '圖片', 'image']);
                    var category = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[2], 'td')[0], 'a')[0])[0];
                    setTag.add(category.match(/^(.*)系列$/)[1]);
                    var author = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[4], 'td')[0])[0];
                    setTag.add(author.match(/原創作者： (.*)/)[1]);
                    var type = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[12], 'td')[0], 'a').map(function (a) {
                        return setTag.add((0, _utility.findTag)(a)[0]);
                    });
                    var newTag = new _set2.default();
                    setTag.forEach(function (i) {
                        return newTag.add(_constants.TRANS_LIST.includes(i) ? _constants.TRANS_LIST_CH[_constants.TRANS_LIST.indexOf(i)] : i);
                    });
                    return [(0, _utility.findTag)(comicPath[comicPath.length - 1])[0], newTag, new _set2.default(), 'cartoonmad', (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(table, 'tr')[1], 'td')[0], 'table')[0], 'tr')[0], 'td')[0], 'img')[0].attribs.src, url];
                });
            case 'bilibili':
                url = id.match(/^av/) ? 'http://www.bilibili.com/video/' + id + '/' : 'http://bangumi.bilibili.com/anime/' + id + '/';
                return (0, _apiTool2.default)('url', url, {
                    referer: 'http://www.bilibili.com/',
                    not_utf8: true
                }).then(function (raw_data) {
                    var name = '';
                    var thumb = '';
                    var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                    var wrapper = (0, _utility.findTag)(body, 'div', 'main-container-wrapper');
                    var setTag = new _set2.default(['bilibili', '影片', 'video']);
                    if (wrapper.length > 0) {
                        setTag.add('動畫').add('animation');
                        var info = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(wrapper[0], 'div', 'main-container')[0], 'div', 'page-info-wrp')[0], 'div', 'bangumi-info-wrapper')[0], 'div', 'main-inner')[0], 'div', 'info-content')[0];
                        var img = (0, _utility.findTag)((0, _utility.findTag)(info, 'div', 'bangumi-preview')[0], 'img')[0];
                        name = img.attribs.alt;
                        thumb = img.attribs.src;
                        var infoR = (0, _utility.findTag)(info, 'div', 'bangumi-info-r')[0];
                        setTag.add((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(infoR, 'div', 'info-row info-update')[0], 'em')[0], 'span')[0])[0].match(/^\d+/)[0]);
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(infoR, 'div', 'info-row info-cv')[0], 'em')[0], 'span').forEach(function (s) {
                            return setTag.add(opencc.convertSync((0, _utility.findTag)(s)[0]));
                        });
                        (0, _utility.findTag)((0, _utility.findTag)(infoR, 'div', 'b-head')[0], 'a').forEach(function (a) {
                            return setTag.add(opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)(a, 'span')[0])[0]));
                        });
                    } else {
                        var main = (0, _utility.findTag)((0, _utility.findTag)(body, 'div', 'b-page-body')[0], 'div', 'main-inner');
                        var _info = (0, _utility.findTag)((0, _utility.findTag)(main[0], 'div', 'viewbox')[0], 'div', 'info')[0];
                        (0, _utility.findTag)((0, _utility.findTag)(_info, 'div', 'tminfo')[0], 'span').forEach(function (s) {
                            if ((0, _utility.findTag)((0, _utility.findTag)(s, 'a')[0])[0].match(/动画$/)) {
                                setTag.add('動畫').add('animation');
                            } else if ((0, _utility.findTag)((0, _utility.findTag)(s, 'a')[0])[0].match(/电影$/)) {
                                setTag.add('電影').add('movie');
                            }
                        });
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main[1], 'div', 'v_large')[0], 'div', 'v_info')[0], 'div', 's_tag')[0], 'ul')[0], 'li').forEach(function (l) {
                            return setTag.add(opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)(l, 'a')[0])[0]));
                        });
                        name = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_info, 'div', 'v-title')[0], 'h1')[0])[0];
                        thumb = (0, _utility.findTag)(body, 'img')[0].attribs.src;
                    }
                    var newTag = new _set2.default();
                    setTag.forEach(function (i) {
                        return newTag.add(_constants.TRANS_LIST.includes(i) ? _constants.TRANS_LIST_CH[_constants.TRANS_LIST.indexOf(i)] : i);
                    });
                    return [name, newTag, new _set2.default(), 'bilibili', thumb, url];
                });
            default:
                (0, _utility.handleError)(new _utility.HoError('unknown external type'));
        }
    }
};
var subHdUrl = exports.subHdUrl = function subHdUrl(str) {
    return (0, _apiTool2.default)('url', 'http://subhd.com/search/' + encodeURIComponent(str)).then(function (raw_data) {
        var list = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container list')[0], 'div', 'row')[0], 'div', 'col-md-9')[0];
        if ((0, _utility.findTag)(list)[0] && (0, _utility.findTag)(list)[0].match(/暂时没有/)) {
            return null;
        }
        var big_item = (0, _utility.findTag)(list, 'div', 'box')[0];
        if (!big_item) {
            console.log(raw_data);
            (0, _utility.handleError)(new _utility.HoError('sub data error!!!'));
        }
        var sub_id = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(big_item, 'div', 'pull-left lb_r')[0], 'table')[0], 'tr')[0], 'td')[0], 'h4')[0], 'a')[0].attribs.href;
        return (0, _apiTool2.default)('url', 'http://subhd.com/ajax/down_ajax', {
            post: { sub_id: sub_id.match(/\d+$/)[0] },
            is_json: true,
            referer: 'http://subhd.com' + sub_id
        }).then(function (data) {
            console.log(data);
            return data.success ? data.url : _promise2.default.reject(new _utility.HoError('too many times!!!'));
        });
    });
};

var bilibiliVideoUrl = exports.bilibiliVideoUrl = function bilibiliVideoUrl(url) {
    console.log(url);
    var id = url.match(/(av)?(\d+)\/(index_(\d+)\.html)?$/);
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('bilibili id invalid'));
    }
    var page = id[3] ? Number(id[4]) : 1;
    return (0, _apiTool2.default)('url', 'http://api.bilibili.com/view?type=json&appkey=8e9fc618fbd41e28&id=' + id[2] + '&page=1&batch=true', { referer: 'http://api.bilibili.com/' }).then(function (raw_data) {
        var json_data = (0, _utility.getJson)(raw_data);
        if (!json_data.list) {
            (0, _utility.handleError)(new _utility.HoError('cannot get list'));
        }
        return {
            title: json_data.list[page].part,
            video: [],
            embed: ['//static.hdslb.com/miniloader.swf?aid=' + id[2] + '&page=' + page]
        };
    });
};

var youtubeVideoUrl = exports.youtubeVideoUrl = function youtubeVideoUrl(id, url) {
    var ret_obj = {
        title: id,
        video: []
    };
    if (id === 'lin') {
        ret_obj['iframe'] = ['//tv.line.me/embed/' + url.match(/[^\/]+$/)[0] + '?isAutoPlay=true'];
    } else if (id === 'iqi') {
        var iqiId = url.match(/([^\/]+)\.html$/)[1].split('-');
        ret_obj['embed'] = ['//player.video.qiyi.com/' + iqiId[0] + '/0/0/v_' + iqiId[1] + '.swf-albumId=' + iqiId[2] + '-tvId=' + iqiId[3] + '-isPurchase=0-cnId=2'];
    } else if (id === 'ope') {
        ret_obj['iframe'] = [url];
    } else {
        return new _promise2.default(function (resolve, reject) {
            return (0, _youtubeDl.getInfo)(url, [], { maxBuffer: 10 * 1024 * 1024 }, function (err, info) {
                return err ? reject(err) : resolve(info);
            });
        }).then(function (info) {
            ret_obj.title = info.title;
            var ret_info = info.formats ? info.formats : info;
            if (id === 'you') {
                (function () {
                    var audio_size = 0;
                    ret_info.forEach(function (i) {
                        if (i.format_note === 'DASH audio') {
                            if (!audio_size) {
                                audio_size = i.filesize;
                                ret_obj['audio'] = i.url;
                            } else if (audio_size > i.filesize) {
                                audio_size = i.filesize;
                                ret_obj['audio'] = i.url;
                            }
                        } else if (i.format_note !== 'DASH video' && (i.ext === 'mp4' || i.ext === 'webm')) {
                            ret_obj['video'].splice(0, 0, i.url);
                        }
                    });
                })();
            } else if (id === 'dym') {
                ret_info.forEach(function (i) {
                    if (i.format_id.match(/^(http-)?\d+$/) && (i.ext === 'mp4' || i.ext === 'webm')) {
                        ret_obj['video'].splice(0, 0, i.url.replace(/^https:/i, 'http:'));
                    }
                });
            } else if (id === 'lin') {
                ret_obj['iframe'] = ['//tv.line.me/embed/' + url.match(/[^\/]+$/)[0] + '?isAutoPlay=true'];
            } else if (id === 'iqi') {
                var _iqiId = url.match(/([^\/]+)\.html$/)[1].split('-');
                ret_obj['embed'] = ['//player.video.qiyi.com/' + _iqiId[0] + '/0/0/' + _iqiId[1] + '.swf-albumId=' + _iqiId[2] + '-tvId=' + _iqiId[3] + '-isPurchase=0-cnId=2'];
            } else {
                if (Array.isArray(ret_info)) {
                    ret_info.forEach(function (i) {
                        if (i.ext === 'mp4' || i.ext === 'webm') {
                            ret_obj['video'].splice(0, 0, i.url);
                        }
                    });
                } else {
                    if (ret_info.ext === 'mp4' || ret_info.ext === 'webm') {
                        ret_obj['video'].splice(0, 0, ret_info.url);
                    }
                }
            }
            if (id === 'yuk') {
                ret_obj['iframe'] = [];
                ret_obj['video'].map(function (i) {
                    if (i.match(/type=flv/)) {
                        ret_obj['iframe'].push('//player.youku.com/embed/' + url.match(/id_([\da-zA-Z=]+)\.html$/)[1]);
                    }
                });
            }
            return ret_obj;
        });
    }
    return _promise2.default.resolve(ret_obj);
};

var updateDocDate = function updateDocDate(type, date) {
    return (0, _mongoTool2.default)('update', _constants.DOCDB, { type: type }, { $set: { type: type, date: date } }, { upsert: true });
};
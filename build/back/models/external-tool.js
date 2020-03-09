'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.youtubeVideoUrl = exports.kuboVideoUrl = exports.bilibiliVideoUrl = exports.subHdUrl = undefined;

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

var _kubo = require('../util/kubo');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var opencc = new _opencc2.default('s2t.json');

var dramaList = ['https://tw02.lovetvshow.info/', 'https://cn.lovetvshow.info/2012/05/drama-list.html', 'https://kr19.vslovetv.com/', 'https://jp04.jplovetv.com/2012/08/drama-list.html', 'https://www.lovetvshow.com/', 'https://krsp01.vslovetv.com/'];

var recur_loveList = function recur_loveList(dramaIndex, next) {
    return (0, _apiTool2.default)('url', dramaList[dramaIndex]).then(function (raw_data) {
        var list = [];
        var year = null;
        if (dramaIndex === 4) {
            year = '台灣';
        }
        var top = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0];
        if (dramaIndex === 0 || dramaIndex === 2 || dramaIndex === 5) {
            (function () {
                var krscript = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(top, 'div', 'column-right-outer')[0], 'div', 'column-right-inner')[0], 'aside')[0], 'div', 'sidebar-right-1')[0], 'div', 'Label1')[0], 'div', 'widget-content list-label-widget-content')[0], 'script')[0].children[0].data;
                var urlList = krscript.match(/https?\:\/\/[^\']+/g);
                krscript.match(/var OldLabel = \"[^\"]+/g).forEach(function (n, i) {
                    var krst = n.match(/(?:Pre)?(\d\d\d\d)(?:韓國|台灣)電視劇\-(.*)$/);
                    if (krst) {
                        if (krst[1].match(/�/)) {
                            return true;
                        }
                        list.push({
                            name: krst[2],
                            url: urlList[i],
                            year: krst[1]
                        });
                    }
                });
            })();
        } else {
            var main = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(top, 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0];
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
                                        var url = dramaIndex === 0 ? (0, _utility.addPre)(a.attribs.href, 'https://tw01.lovetvshow.info') : dramaIndex === 1 ? (0, _utility.addPre)(a.attribs.href, 'https://cn.lovetvshow.info') : dramaIndex === 2 ? (0, _utility.addPre)(a.attribs.href, 'https://vslovetv.com') : dramaIndex === 3 ? (0, _utility.addPre)(a.attribs.href, 'https://jp.jplovetv.com') : (0, _utility.addPre)(a.attribs.href, 'https://www.lovetvshow.com');
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

        var _ret2 = function () {
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
                            var url = (0, _utility.isValidString)(external_item.url, 'url');
                            if (!url) {
                                return (0, _utility.handleError)(new _utility.HoError('url is not vaild'));
                            }
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
                                thumb: 'love-thumb-md.png'
                            }, type, setArr)).then(function (item) {
                                console.log('lovetv save');
                                console.log(item[0].name);
                                (0, _sendWs2.default)('love: ' + item[0].name, 0, 0, true);
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
                            var url = (0, _utility.isValidString)(external_item.url, 'url');
                            if (!url) {
                                return (0, _utility.handleError)(new _utility.HoError('url is not vaild'));
                            }
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
                                    var imdb = a.attribs.href.match(/(https|http):\/\/www\.imdb\.com\/title\/(tt\d+)\//);
                                    if (imdb) {
                                        setTag.add((0, _tagTool.normalize)(imdb[2]));
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
                                    (0, _sendWs2.default)('eztvtv: ' + item[0].name, 0, 0, true);
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
                                    var name = (0, _utility.findTag)(a)[0];
                                    if (name !== 'Dark Mon£y') {
                                        list.push({
                                            name: name,
                                            url: (0, _utility.addPre)(a.attribs.href, 'https://eztv.ag')
                                        });
                                    }
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
                    return {
                        v: (0, _utility.handleError)(new _utility.HoError('unknown external type'))
                    };
            }
        }();

        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
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
                        return (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                    }
                    return raw_data['data']['movies'] ? raw_data['data']['movies'].map(function (m) {
                        var tags = new _set2.default(['movie', '電影']);
                        tags.add(m['year'].toString());
                        if (m['genres']) {
                            m['genres'].forEach(function (g) {
                                var genre_item = (0, _tagTool.normalize)(g);
                                if (_constants.GENRE_LIST.includes(genre_item)) {
                                    tags.add(genre_item).add(_constants.GENRE_LIST_CH[_constants.GENRE_LIST.indexOf(genre_item)]);
                                }
                            });
                        }
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
                            return (0, _utility.handleError)(new _utility.HoError('bilibili api fail'));
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
                            return (0, _utility.handleError)(new _utility.HoError('bilibili api fail'));
                        }
                        var list = [];
                        if (json_data['html']) {
                            var dom = _htmlparser2.default.parseDOM(json_data['html']);
                            list = (0, _utility.findTag)(dom, 'li', 'video matrix ').map(function (v) {
                                var a = (0, _utility.findTag)(v, 'a')[0];
                                return {
                                    id: a.attribs.href.match(/av\d+/)[0],
                                    name: opencc.convertSync(a.attribs.title),
                                    thumb: 'http:' + (0, _utility.findTag)((0, _utility.findTag)(a, 'div', 'img')[0], 'img')[0].attribs['data-src'],
                                    date: new Date('1970-01-01').getTime() / 1000,
                                    tags: ['movie', '電影'],
                                    count: opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(v, 'div', 'info')[0], 'div', 'tags')[0], 'span', 'so-icon watch-num')[0])[0])
                                };
                            });
                            if (list.length < 1) {
                                list = (0, _utility.findTag)(dom, 'li', 'synthetical').map(function (v) {
                                    var a = (0, _utility.findTag)(v, 'div', 'left-img')[0].children[1];
                                    return {
                                        id: a.attribs.href.match(/\/anime\/(\d+)/)[1],
                                        name: opencc.convertSync(a.attribs.title),
                                        thumb: 'http:' + (0, _utility.findTag)(a, 'img')[0].attribs['data-src'],
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
            case 'kubo':
                return (0, _apiTool2.default)('url', url, { referer: 'http://www.58b.tv/' }).then(function (raw_data) {
                    var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                    var main = (0, _utility.findTag)(body, 'div', 'main')[0];
                    if (main) {
                        var _ret3 = function () {
                            var type_id = url.match(/vod-search-id-(\d+)/);
                            if (!type_id) {
                                return {
                                    v: (0, _utility.handleError)(new _utility.HoError('unknown kubo type'))
                                };
                            }
                            return {
                                v: (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'list')[0], 'div', 'listlf')[0], 'ul')[0], 'li').map(function (l) {
                                    var a = (0, _utility.findTag)(l, 'a')[0];
                                    var img = (0, _utility.findTag)(a, 'img')[0];
                                    var tags = new _set2.default();
                                    if (type_id[1] === '1') {
                                        tags = new _set2.default(['電影', 'movie']);
                                    } else if (type_id[1] === '3') {
                                        tags = new _set2.default(['動畫', 'animation']);
                                    } else {
                                        tags = new _set2.default(['電視劇', 'tv show']);
                                        if (type_id[1] === '41') {
                                            tags.add('綜藝節目');
                                        }
                                    }
                                    var count = 0;
                                    var date = '1970-01-01';
                                    (0, _utility.findTag)(l, 'p').forEach(function (p) {
                                        var t = (0, _utility.findTag)(p)[0];
                                        if (t) {
                                            if (t === '主演：') {
                                                (0, _utility.findTag)(p, 'a').forEach(function (b) {
                                                    return tags.add((0, _utility.findTag)(b)[0]);
                                                });
                                            } else {
                                                var match = t.match(/^地區\/年份：([^\/]+)\/(\d+)$/);
                                                if (match) {
                                                    tags.add(match[1]).add(match[2]);
                                                } else {
                                                    match = t.match(/^月熱度：(\d+)/);
                                                    if (match) {
                                                        count = Number(match[1]);
                                                    } else {
                                                        match = t.match(/^更新：(\d\d\d\d\-\d\d\-\d\d)/);
                                                        if (match) {
                                                            date = match[1];
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    return {
                                        name: img.attribs.alt,
                                        id: a.attribs.href.match(/\d+/)[0],
                                        thumb: img.attribs['data-original'],
                                        tags: tags,
                                        count: count,
                                        date: date
                                    };
                                })
                            };
                        }();

                        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                    } else {
                        return (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(body, 'div')[0], 'div', 'wrapper_wrapper')[0], 'div', 'container')[0], 'div', 'content_left')[0], 'div', 'ires')[0], 'ol')[0], 'li', 'g').map(function (g) {
                            var tr = (0, _utility.findTag)((0, _utility.findTag)(g, 'table')[0], 'tr')[0];
                            var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(tr, 'td')[0], 'div')[0], 'a')[0];
                            var td = (0, _utility.findTag)(tr, 'td')[1];
                            var a1 = (0, _utility.findTag)((0, _utility.findTag)(td, 'h3')[0], 'a')[0];
                            var name = '';
                            a1.children.forEach(function (c) {
                                if (c.data) {
                                    name = '' + name + c.data;
                                } else {
                                    var t = (0, _utility.findTag)(c)[0];
                                    name = t ? '' + name + t : '' + name + (0, _utility.findTag)((0, _utility.findTag)(c, 'b')[0])[0];
                                }
                            });
                            name = name.match(/^(.*)-([^\-]+)$/);
                            var tags = new _set2.default([(0, _tagTool.normalize)(name[2])]);
                            var count = 0;
                            var date = '1970-01-01';
                            for (var i in _constants.KUBO_TYPE) {
                                var index = _constants.KUBO_TYPE[i].indexOf(name[2]);
                                if (index !== -1) {
                                    if (i === '0') {
                                        tags.add('movie').add('電影');
                                        switch (index) {
                                            case 0:
                                                tags.add('action').add('動作');
                                                break;
                                            case 1:
                                                tags.add('comedy').add('喜劇');
                                                break;
                                            case 2:
                                                tags.add('romance').add('浪漫');
                                                break;
                                            case 3:
                                                tags.add('sci-fi').add('科幻');
                                                break;
                                            case 4:
                                                tags.add('horror').add('恐怖');
                                                break;
                                            case 5:
                                                tags.add('drama').add('劇情');
                                                break;
                                            case 6:
                                                tags.add('war').add('戰爭');
                                                break;
                                            case 7:
                                                tags.add('animation').add('動畫');
                                                break;
                                        }
                                    } else if (i === '1') {
                                        tags.add('tv show').add('電視劇');
                                    } else if (i === '2') {
                                        tags.add('tv show').add('電視劇').add('綜藝節目');
                                    } else if (i === '3') {
                                        tags.add('animation').add('動畫');
                                    }
                                    break;
                                }
                            }
                            var div = (0, _utility.findTag)(td, 'div')[0];
                            var span = (0, _utility.findTag)((0, _utility.findTag)(div, 'div', 'kv')[0], 'span')[0];
                            var _iteratorNormalCompletion = true;
                            var _didIteratorError = false;
                            var _iteratorError = undefined;

                            try {
                                for (var _iterator = (0, _getIterator3.default)((0, _utility.findTag)(span)), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                    var t = _step.value;

                                    var match = t.match(/月熱度:(\d+)/);
                                    if (match) {
                                        count = Number(match[1]);
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

                            (0, _utility.findTag)(span, 'a').forEach(function (s) {
                                if ((0, _utility.findTag)(s)[0]) {
                                    tags.add((0, _tagTool.normalize)((0, _utility.findTag)(s)[0]));
                                }
                            });
                            (0, _utility.findTag)(div, 'div', 'osl').forEach(function (o) {
                                var ot = (0, _utility.findTag)(o)[0];
                                if (ot) {
                                    var matcho = ot.match(/别名:(.*)/);
                                    if (matcho) {
                                        tags.add((0, _tagTool.normalize)(matcho[1]));
                                    }
                                }
                                (0, _utility.findTag)(o, 'a').forEach(function (s) {
                                    var st = (0, _utility.findTag)(s)[0];
                                    if (st) {
                                        tags.add((0, _tagTool.normalize)((0, _utility.findTag)(s)[0]));
                                    }
                                });
                            });
                            var cite = (0, _utility.findTag)(span, 'cite')[0];
                            if (cite) {
                                var matchDate = (0, _utility.findTag)(cite)[0].match(/(\d\d\d\d)年(\d\d)月(\d\d)日/);
                                if (matchDate) {
                                    date = matchDate[1] + '-' + matchDate[2] + '-' + matchDate[3];
                                }
                            }
                            return {
                                id: a.attribs.href.match(/\d+/)[0],
                                name: name[1],
                                thumb: (0, _utility.findTag)(a, 'img')[0].attribs.src,
                                date: date,
                                tags: tags,
                                count: count
                            };
                        });
                    }
                });
            case 'dm5':
                return (0, _apiTool2.default)('url', url, {
                    referer: 'http://www.dm5.com/',
                    post: post,
                    is_dm5: true
                }).then(function (raw_data) {
                    var list = [];
                    var data = _htmlparser2.default.parseDOM(raw_data);
                    if ((0, _utility.findTag)(data, 'html').length > 0) {
                        (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(data, 'html')[0], 'body')[0], 'section', 'box container pb40 overflow-Show')[0], 'div', 'box-body')[0], 'ul', 'mh-list col7')[0], 'li').forEach(function (l) {
                            var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(l, 'div', 'mh-item')[0], 'div', 'mh-tip-wrap')[0], 'div', 'mh-item-tip')[0], 'a')[0];
                            list.push({
                                id: a.attribs.href.match(/\/([^\/]+)/)[1],
                                name: opencc.convertSync(a.attribs.title),
                                thumb: (0, _utility.findTag)((0, _utility.findTag)(l, 'div', 'mh-item')[0], 'p', 'mh-cover')[0].attribs.style.match(/url\(([^\)]+)/)[1],
                                tags: ['漫畫', 'comic']
                            });
                        });
                    } else {
                        data.forEach(function (l) {
                            list.push({
                                id: l.attribs.href.match(/\/([^\/]+)/)[1],
                                name: opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(l, 'p')[0], 'span')[0])[0]),
                                thumb: 'dm5.png',
                                tags: ['漫畫', 'comic']
                            });
                        });
                    }
                    return list;
                });
            case 'bls':
                return (0, _apiTool2.default)('url', 'https://www.bls.gov/bls/newsrels.htm#latest-releases').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = (0, _utility.completeZero)(date.getMonth() + 1, 2) + '/' + (0, _utility.completeZero)(date.getDate(), 2) + '/' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'section')[0], 'div', 'wrapper-outer')[0], 'div', 'wrapper')[0], 'div', 'container')[0], 'table', 'main-content-table')[0], 'tr')[0], 'td', 'main-content-td')[0], 'div', 'bodytext')[0], 'div', 'bls')[0], 'ul')[0], 'li').forEach(function (l) {
                        if ((0, _utility.findTag)(l)[0] === docDate) {
                            var a = (0, _utility.findTag)(l, 'a')[0];
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'https://www.bls.gov'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)(a)[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'cen':
                return (0, _apiTool2.default)('url', 'https://www.census.gov/economic-indicators/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'econ-content-container')[0], 'table', 'indicator-table')[0], 'tbody')[0], 'tr').forEach(function (r) {
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
                return (0, _apiTool2.default)('url', 'https://www.bea.gov/news/current-releases').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    var trs = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div')[0], 'div', 'row')[0], 'section')[0], 'div', 'region region-content')[0], 'div')[0], 'div')[0], 'div', 'view-content')[0], 'div')[0], 'table')[0], 'tbody')[0], 'tr');
                    var _iteratorNormalCompletion2 = true;
                    var _didIteratorError2 = false;
                    var _iteratorError2 = undefined;

                    try {
                        for (var _iterator2 = (0, _getIterator3.default)(trs), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                            var tr = _step2.value;

                            if ((0, _utility.findTag)((0, _utility.findTag)(tr, 'td')[1])[0].match(/^[a-zA-Z]+ \d\d?, \d\d\d\d/)[0] === docDate) {
                                var a = (0, _utility.findTag)((0, _utility.findTag)(tr, 'td')[0], 'a')[0];
                                list.push({
                                    url: (0, _utility.addPre)(a.attribs.href, 'http://www.bea.gov'),
                                    name: (0, _utility.toValidName)((0, _utility.findTag)(a)[0]),
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

                    return list;
                });
            case 'ism':
                return (0, _apiTool2.default)('url', 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var docStr = 'FOR RELEASE: ' + docDate;
                    var list = [];
                    if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container mt-4')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'span')[0], 'p')[0], 'strong')[0])[0] === docStr) {
                        list.push({
                            url: 'https://www.instituteforsupplymanagement.org/ISMReport/MfgROB.cfm?SSO=1',
                            name: (0, _utility.toValidName)('Manufacturing ISM'),
                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                        });
                    }
                    return (0, _apiTool2.default)('url', 'https://www.instituteforsupplymanagement.org/ISMReport/NonMfgROB.cfm?SSO=1').then(function (raw_data) {
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container mt-4')[0], 'div', 'column2')[0], 'div', 'home_feature_container')[0], 'div', 'content')[0], 'div', 'column1_list')[0], 'div', 'formatted_content')[0], 'p')[0], 'strong')[0])[0] === docStr) {
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
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getDate() + ' ' + _constants.MONTH_SHORTS[date.getMonth()] + '. ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                    if (body) {
                        var con = (0, _utility.findTag)(body, 'div', 'container tcb-wrapper')[0];
                        if (con) {
                            if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(con, 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0] === docDate) {
                                list.push({
                                    url: 'https://www.conference-board.org/data/consumerconfidence.cfm',
                                    name: (0, _utility.toValidName)('Consumer Confidence Survey'),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                        }
                    }
                    return (0, _apiTool2.default)('url', 'https://www.conference-board.org/data/bcicountry.cfm?cid=1').then(function (raw_data) {
                        docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                        console.log(docDate);
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container')[0], 'div', 'wrap')[0], 'div', 'content')[0], 'p', 'date')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
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
                return (0, _apiTool2.default)('url', 'http://www1.semi.org/en/NewsFeeds/SEMIHighlights/index.rss').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                return (0, _apiTool2.default)('url', 'https://www.dol.gov/newsroom/releases').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    var divs = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'dialog-off-canvas-main-canvas')[0], 'div')[0], 'main', 'cd-main-content')[0], 'div', 'layout-content inner-content-page')[0], 'div')[0], 'div', 'block-opa-theme-content')[0], 'div', 'views-element-container')[0], 'div')[0], 'div');
                    for (var i in divs) {
                        var div = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(divs[i], 'div', 'image-left-teaser')[0], 'div', 'row dol-feed-block')[0], 'div', 'left-teaser-text')[0];
                        var a = (0, _utility.findTag)(div, 'a')[0];
                        if (a && (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(a, 'h3')[0], 'span')[0])[0] === 'Unemployment Insurance Weekly Claims Report' && (0, _utility.findTag)((0, _utility.findTag)(div, 'p')[0])[0].match(/[a-zA-Z]+ \d+, \d\d\d\d$/)[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href.trim(), 'https://www.dol.gov'),
                                name: (0, _utility.toValidName)('Unemployment Insurance Weekly Claims Report'),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    }
                    return list;
                });
            case 'rea':
                return (0, _apiTool2.default)('url', 'https://www.nar.realtor/newsroom').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'main')[0], 'div', 'content-push push')[0], 'div', 'layout-constrain')[0], 'div', 'region-content')[0], 'div', 'layout-content-aside has-aside')[0], 'div', 'secondary-content')[0], 'div', 'pane-node-field-below-paragraph pane pane--nodefield-below-paragraph')[0], 'div', 'pane__content')[0], 'div', 'field field--below-paragraph')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'div', 'layout--flex-grid layout--fg-9-3')[0], 'div', 'flex-column')[0], 'div')[0], 'div', 'field field--search-query')[0], 'div', 'field-items')[0], 'div', 'field-item even')[0], 'div', 'field_search_query_content_list')[0], 'div').forEach(function (d) {
                        var content = (0, _utility.findTag)((0, _utility.findTag)(d, 'article')[0], 'div', 'card-view__content')[0];
                        if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'div', 'card-view__footer')[0], 'div', 'node__date')[0], 'span')[0])[0] === docDate) {
                            var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'div', 'card-view__header')[0], 'h3', 'card-view__title')[0], 'a')[0];
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'https://www.nar.realtor'),
                                name: (0, _utility.toValidName)((0, _utility.findTag)(a)[0]),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            case 'sca':
                return (0, _apiTool2.default)('url', 'http://www.sca.isr.umich.edu/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                    return (0, _apiTool2.default)('url', 'https://www.federalreserve.gov/releases/g17/Current/default.htm').then(function (raw_data) {
                        docDate = _constants.MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
                        console.log(docDate);
                        var content = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0];
                        if ((0, _utility.findTag)((0, _utility.findTag)(content, 'div', 'dates')[0])[0].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                            var as = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'h3')[0], 'span')[0], 'a');
                            var _iteratorNormalCompletion3 = true;
                            var _didIteratorError3 = false;
                            var _iteratorError3 = undefined;

                            try {
                                for (var _iterator3 = (0, _getIterator3.default)(as), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                    var i = _step3.value;

                                    if ((0, _utility.findTag)(i)[0].match(/pdf/i)) {
                                        list.push({
                                            url: (0, _utility.addPre)(i.attribs.href, 'https://www.federalreserve.gov/releases/g17/Current'),
                                            name: (0, _utility.toValidName)('INDUSTRIAL PRODUCTION AND CAPACITY UTILIZATION'),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
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
                        }
                        return (0, _apiTool2.default)('url', 'https://www.federalreserve.gov/releases/g19/current/default.htm').then(function (raw_data) {
                            if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'dates')[0])[1].match(/[a-zA-Z]+ \d\d?, \d\d\d\d$/)[0] === docDate) {
                                list.push({
                                    url: 'https://www.federalreserve.gov/releases/g19/current/default.htm',
                                    name: (0, _utility.toValidName)('Consumer Credit'),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                            return list;
                        });
                    });
                });
            case 'sea':
                return (0, _apiTool2.default)('url', 'http://www.seaj.or.jp/english/statistics/').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                return (0, _apiTool2.default)('url', 'https://index.ndc.gov.tw/n/json/data/news', {
                    post: {},
                    referer: 'https://index.ndc.gov.tw/n/zh_tw/data/news'
                }).then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    var json_data = (0, _utility.getJson)(raw_data);
                    if (json_data === false) {
                        return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                    }
                    var _iteratorNormalCompletion4 = true;
                    var _didIteratorError4 = false;
                    var _iteratorError4 = undefined;

                    try {
                        for (var _iterator4 = (0, _getIterator3.default)(json_data), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                            var i = _step4.value;

                            if (i.date === docDate) {
                                var list_match = i.content.match(/href="([^"]+pdf)".*?title="(.*?\d\d\d\d?年\d\d?月[^"]+)/g);
                                if (list_match) {
                                    var _iteratorNormalCompletion5 = true;
                                    var _didIteratorError5 = false;
                                    var _iteratorError5 = undefined;

                                    try {
                                        for (var _iterator5 = (0, _getIterator3.default)(list_match), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                                            var j = _step5.value;

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

                    return list;
                });
            case 'sta':
                return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=489&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                                    url: (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0], 'a')[0].attribs.href, 'https://www.stat.gov.tw'),
                                    name: (0, _utility.toValidName)(title),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                        });
                    };
                    findDoc('物價指數', raw_data);
                    return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=497&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                        findDoc('經濟成長率', raw_data);
                        return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=527&CtUnit=1818&BaseDSD=29&MP=4').then(function (raw_data) {
                            findDoc('受僱員工薪資與生產力', raw_data);
                            return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=2294&CtUnit=1818&BaseDSD=29&mp=4').then(function (raw_data) {
                                var pDate = new Date(new Date(date).setMonth(date.getMonth() - 1));
                                var docDate1 = pDate.getFullYear() - 1911 + '\u5E74' + (pDate.getMonth() + 1) + '\u6708';
                                console.log(docDate1);
                                var html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                                var html2 = (0, _utility.findTag)(html, 'html')[0];
                                var lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                                var link = null;
                                var _iteratorNormalCompletion6 = true;
                                var _didIteratorError6 = false;
                                var _iteratorError6 = undefined;

                                try {
                                    for (var _iterator6 = (0, _getIterator3.default)(lis), _step6; !(_iteratorNormalCompletion6 = (_step6 = _iterator6.next()).done); _iteratorNormalCompletion6 = true) {
                                        var l = _step6.value;

                                        var a = (0, _utility.findTag)(l, 'a')[0];
                                        var dateMatch = (0, _utility.findTag)(a)[0].match(/^\d\d\d年\d\d?月/);
                                        if (dateMatch && dateMatch[0] === docDate1) {
                                            link = (0, _utility.addPre)(a.attribs.href, 'https://www.stat.gov.tw');
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
                return (0, _apiTool2.default)('url', 'https://www.mof.gov.tw/multiplehtml/384fb3077bb349ea973e7fc6f13b6974').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    var application = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'function-cabinet')[0], 'div', 'container')[0], 'div', 'row')[0], 'div', 'left-content')[0], 'div', 'left-content-text')[0], 'div', ' paging-content')[0], 'div', 'application')[0];
                    if (application) {
                        var _iteratorNormalCompletion7 = true;
                        var _didIteratorError7 = false;
                        var _iteratorError7 = undefined;

                        try {
                            for (var _iterator7 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(application, 'table')[0], 'tbody')[0], 'tr')), _step7; !(_iteratorNormalCompletion7 = (_step7 = _iterator7.next()).done); _iteratorNormalCompletion7 = true) {
                                var l = _step7.value;

                                if ((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(l, 'td')[2], 'span')[0])[0] === docDate) {
                                    var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(l, 'td')[1], 'span')[0], 'a')[0];
                                    var name = (0, _utility.findTag)(a)[0];
                                    if (name.match(/海關進出口貿易/)) {
                                        list.push({
                                            url: (0, _utility.addPre)(a.attribs.href, 'https://www.mof.gov.tw'),
                                            name: (0, _utility.toValidName)(name),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                        });
                                        break;
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
                    }
                    return list;
                });
            case 'moe':
                return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=2299&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
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
                        return (0, _utility.handleError)(new _utility.HoError('empty html'));
                    }
                    var html2 = (0, _utility.findTag)(html, 'html')[0];
                    var lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                    var dUrl = false;
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
                    var industrial = function industrial() {
                        return dUrl ? (0, _apiTool2.default)('url', dUrl).then(function (raw_data) {
                            var matchT = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'main')[0], 'div', 'Float_layer')[0], 'div', 'divContent')[0], 'div', 'divContainer')[0], 'div', 'divDetail')[0], 'div', 'divRightContent')[0], 'div', 'div_Content')[0], 'div', 'container')[0], 'div')[0], 'div', 'divPageDetail')[0], 'div', 'div-top-info')[0], 'div', 'div-top-info-flex')[0], 'div', 'div-top-left-info')[0], 'div', 'div-sub-info')[0], 'div', 'div-begin-date')[0])[0].match(/\d\d\d\d-\d\d-\d\d/);
                            console.log(matchT);
                            if (matchT && matchT[0] === docDate) {
                                list.push({
                                    url: dUrl,
                                    name: (0, _utility.toValidName)('工業生產'),
                                    date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                });
                            }
                        }) : _promise2.default.resolve();
                    };
                    return industrial().then(function () {
                        return (0, _apiTool2.default)('url', 'https://www.stat.gov.tw/lp.asp?ctNode=2300&CtUnit=1818&BaseDSD=29').then(function (raw_data) {
                            html = (0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0];
                            if (!html) {
                                console.log(raw_data);
                                return (0, _utility.handleError)(new _utility.HoError('empty html'));
                            }
                            var html2 = (0, _utility.findTag)(html, 'html')[0];
                            lis = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(html2 ? html2 : html, 'body')[0], 'div', 'wrap')[0], 'table', 'layout')[0], 'tr')[0], 'td', 'center')[0], 'div', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li');
                            dUrl = false;
                            var _iteratorNormalCompletion9 = true;
                            var _didIteratorError9 = false;
                            var _iteratorError9 = undefined;

                            try {
                                for (var _iterator9 = (0, _getIterator3.default)(lis), _step9; !(_iteratorNormalCompletion9 = (_step9 = _iterator9.next()).done); _iteratorNormalCompletion9 = true) {
                                    var l = _step9.value;

                                    var a = (0, _utility.findTag)(l, 'a')[0];
                                    var aMatch = a.attribs.title.match(/^\d\d\d年\d\d?月/);
                                    if (aMatch && aMatch[0] === docDate1) {
                                        dUrl = (0, _utility.addPre)(a.attribs.href, 'http://www.moea.gov.tw');
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

                            ;
                            var output = function output() {
                                return dUrl ? (0, _apiTool2.default)('url', dUrl).then(function (raw_data) {
                                    var matchT = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'main')[0], 'div', 'Float_layer')[0], 'div', 'divContent')[0], 'div', 'divContainer')[0], 'div', 'divDetail')[0], 'div', 'divRightContent')[0], 'div', 'div_Content')[0], 'div', 'container')[0], 'div')[0], 'div', 'divPageDetail')[0], 'div', 'div-top-info')[0], 'div', 'div-top-info-flex')[0], 'div', 'div-top-left-info')[0], 'div', 'div-sub-info')[0], 'div', 'div-begin-date')[0])[0].match(/\d\d\d\d-\d\d-\d\d/);
                                    console.log(matchT);
                                    if (matchT && matchT[0] === docDate) {
                                        list.push({
                                            url: dUrl,
                                            name: (0, _utility.toValidName)('外銷訂單統計'),
                                            date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                                        });
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
                return (0, _apiTool2.default)('url', 'https://www.cbc.gov.tw/tw/sp-news-list-1.html').then(function (raw_data) {
                    var date = new Date(url);
                    if (isNaN(date.getTime())) {
                        return (0, _utility.handleError)(new _utility.HoError('date invalid'));
                    }
                    date = new Date(new Date(date).setDate(date.getDate() - 1));
                    var docDate = date.getFullYear() + '-' + (0, _utility.completeZero)(date.getMonth() + 1, 2) + '-' + (0, _utility.completeZero)(date.getDate(), 2);
                    console.log(docDate);
                    var list = [];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0], 'div', 'center')[0], 'div', 'container')[0], 'section', 'lp')[0], 'div', 'list')[0], 'ul')[0], 'li').forEach(function (l) {
                        var a = (0, _utility.findTag)(l, 'a')[0];
                        if ((0, _utility.findTag)((0, _utility.findTag)(a, 'time')[0])[0] === docDate) {
                            list.push({
                                url: (0, _utility.addPre)(a.attribs.href, 'https://www.cbc.gov.tw/tw'),
                                name: (0, _utility.toValidName)(a.attribs.title),
                                date: date.getMonth() + 1 + '_' + date.getDate() + '_' + date.getFullYear()
                            });
                        }
                    });
                    return list;
                });
            default:
                return (0, _utility.handleError)(new _utility.HoError('unknown external type'));
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
                        return (0, _utility.handleError)(new _utility.HoError('cannot find release'));
                    }
                    var url = (0, _utility.addPre)(a.attribs.href, 'https://www.bls.gov');
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
                                    return (0, _utility.handleError)(err);
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
                                return (0, _utility.handleError)(err);
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
                                    return (0, _utility.handleError)(err);
                                }
                            });
                        });
                    });
                }
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var hs = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[0], 'div')[0], 'div', 'row')[0], 'div', 'test')[0], 'div', 'region region-content')[0], 'article')[0], 'div', 'row')[0], 'div', 'container')[0], 'div', 'tab-content')[0], 'div', 'menu1')[0], 'div', 'row')[0], 'div')[0], 'h3');
                    var _iteratorNormalCompletion10 = true;
                    var _didIteratorError10 = false;
                    var _iteratorError10 = undefined;

                    try {
                        for (var _iterator10 = (0, _getIterator3.default)(hs), _step10; !(_iteratorNormalCompletion10 = (_step10 = _iterator10.next()).done); _iteratorNormalCompletion10 = true) {
                            var h = _step10.value;

                            var a = (0, _utility.findTag)(h, 'a')[0];
                            if ((0, _utility.findTag)(a)[0].match(/^Full Release/)) {
                                var _ret4 = function () {
                                    var url = (0, _utility.addPre)(a.attribs.href, 'http://www.bea.gov');
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
                                                        return (0, _utility.handleError)(err);
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
                        return (0, _utility.handleError)(err);
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
                        return (0, _utility.handleError)(err);
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
                        return (0, _utility.handleError)(err);
                    }
                });
            case 'oec':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var _iteratorNormalCompletion11 = true;
                    var _didIteratorError11 = false;
                    var _iteratorError11 = undefined;

                    try {
                        for (var _iterator11 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'section container')[0], 'div', 'row')[0], 'div', 'col-sm-9 leftnav-content-wrapper')[0], 'div', 'doc-type-container')[0], 'div', 'block')[0], 'div', 'webEditContent')[0], 'p')), _step11; !(_iteratorNormalCompletion11 = (_step11 = _iterator11.next()).done); _iteratorNormalCompletion11 = true) {
                            var p = _step11.value;

                            var s = (0, _utility.findTag)(p, 'strong')[0];
                            if (s) {
                                var a = (0, _utility.findTag)(s, 'a')[0];
                                if (!a) {
                                    var ss = (0, _utility.findTag)(s, 'strong')[0];
                                    if (ss) {
                                        a = (0, _utility.findTag)(ss, 'a')[0];
                                    }
                                }
                                if (a) {
                                    if ((0, _utility.findTag)(a)[0].match(/pdf/i)) {
                                        var _ret5 = function () {
                                            var url = (0, _utility.addPre)(a.attribs.href, 'http://www.oecd.org');
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
                                                                return (0, _utility.handleError)(err);
                                                            }
                                                        });
                                                    });
                                                })
                                            };
                                        }();

                                        if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
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
                                return (0, _utility.handleError)(err);
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
                        return (0, _utility.handleError)(err);
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
                        return (0, _utility.handleError)(err);
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
                                    return (0, _utility.handleError)(err);
                                }
                            });
                        });
                    });
                }
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var match = obj.url.match(/^https\:\/\/www\.federalreserve\.gov\/releases\/(g\d+)\/current\//i);
                    if (match) {
                        var _ret6 = function () {
                            var url = '' + match[0] + match[1] + '.pdf';
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
                                                return (0, _utility.handleError)(err);
                                            }
                                        });
                                    });
                                })
                            };
                        }();

                        if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
                    } else {
                        var share = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'row')[0], 'div', 'page-header')[0], 'div', 'header-group')[0], 'div', 'shareDL')[0];
                        if (share) {
                            var a = (0, _utility.findTag)(share, 'a')[0];
                            if ((0, _utility.findTag)((0, _utility.findTag)(a, 'span')[1])[0].match(/pdf/i)) {
                                var _ret7 = function () {
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
                                                        return (0, _utility.handleError)(err);
                                                    }
                                                });
                                            });
                                        })
                                    };
                                }();

                                if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
                            }
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
                            return (0, _utility.handleError)(err);
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
                                return (0, _utility.handleError)(err);
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
                                        return (0, _utility.handleError)(err);
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
                                return (0, _utility.handleError)(err);
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
                            var _iteratorNormalCompletion12 = true;
                            var _didIteratorError12 = false;
                            var _iteratorError12 = undefined;

                            try {
                                for (var _iterator12 = (0, _getIterator3.default)(as), _step12; !(_iteratorNormalCompletion12 = (_step12 = _iterator12.next()).done); _iteratorNormalCompletion12 = true) {
                                    var a = _step12.value;

                                    if (a.attribs.href.match(/\.pdf$/i)) {
                                        var _ret8 = function () {
                                            var url = (0, _utility.addPre)(a.attribs.href, 'https://www.stat.gov.tw');
                                            if (url.match(/87231699T64V6LTY/)) {
                                                return 'continue';
                                            }
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
                                                                return (0, _utility.handleError)(err);
                                                            }
                                                        });
                                                    });
                                                })
                                            };
                                        }();

                                        switch (_ret8) {
                                            case 'continue':
                                                continue;

                                            default:
                                                if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
                                        }
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
                        var bs = (0, _utility.findTag)(p, 'b');
                        if (bs.length > 0) {
                            var _iteratorNormalCompletion13 = true;
                            var _didIteratorError13 = false;
                            var _iteratorError13 = undefined;

                            try {
                                for (var _iterator13 = (0, _getIterator3.default)(bs), _step13; !(_iteratorNormalCompletion13 = (_step13 = _iterator13.next()).done); _iteratorNormalCompletion13 = true) {
                                    var b = _step13.value;

                                    as = (0, _utility.findTag)(b, 'a');
                                    if (as.length > 0) {
                                        var _iteratorNormalCompletion14 = true;
                                        var _didIteratorError14 = false;
                                        var _iteratorError14 = undefined;

                                        try {
                                            for (var _iterator14 = (0, _getIterator3.default)(as), _step14; !(_iteratorNormalCompletion14 = (_step14 = _iterator14.next()).done); _iteratorNormalCompletion14 = true) {
                                                var _a = _step14.value;

                                                if (_a.attribs.href.match(/\.pdf$/i)) {
                                                    var _ret9 = function () {
                                                        var url = (0, _utility.addPre)(_a.attribs.href, 'https://www.stat.gov.tw');
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
                                                                            return (0, _utility.handleError)(err);
                                                                        }
                                                                    });
                                                                });
                                                            })
                                                        };
                                                    }();

                                                    if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
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
                        }
                    });
                });
            case 'mof':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url, { referer: 'https://www.mof.gov.tw/' }).then(function (raw_data) {
                    var ps = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'function-cabinet')[0], 'div', 'container')[0], 'div', 'row')[0], 'div', 'left-content')[0], 'div', 'left-content-text')[0], 'div')[1], 'article')[0], 'p');
                    var _iteratorNormalCompletion15 = true;
                    var _didIteratorError15 = false;
                    var _iteratorError15 = undefined;

                    try {
                        for (var _iterator15 = (0, _getIterator3.default)(ps), _step15; !(_iteratorNormalCompletion15 = (_step15 = _iterator15.next()).done); _iteratorNormalCompletion15 = true) {
                            var p = _step15.value;

                            var pc = (0, _utility.findTag)(p)[0];
                            if (pc && pc.match(/本文及附表/)) {
                                var _ret10 = function () {
                                    var url = (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(p, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'https://www.mof.gov.tw');
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
                                                        return (0, _utility.handleError)(err);
                                                    }
                                                });
                                            });
                                        })
                                    };
                                }();

                                if ((typeof _ret10 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret10)) === "object") return _ret10.v;
                            } else {
                                var sp = (0, _utility.findTag)(p, 'span')[0];
                                var pcsp = (0, _utility.findTag)(sp)[0];
                                if (pcsp && pcsp.match(/本文及附表/)) {
                                    var _ret11 = function () {
                                        var a = (0, _utility.findTag)((0, _utility.findTag)(sp, 'strong')[0], 'a')[0];
                                        var url = a ? (0, _utility.addPre)(a.attribs.href, 'https://www.mof.gov.tw') : (0, _utility.addPre)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(sp, 'span')[0], 'strong')[0], 'span')[0], 'a')[0].attribs.href, 'https://www.mof.gov.tw');
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
                                                            return (0, _utility.handleError)(err);
                                                        }
                                                    });
                                                });
                                            })
                                        };
                                    }();

                                    if ((typeof _ret11 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret11)) === "object") return _ret11.v;
                                }
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

                    ;
                });
            case 'moe':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var files = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'form', 'form1')[0], 'main')[0], 'div', 'Float_layer')[0], 'div', 'divContent')[0], 'div', 'divContainer')[0], 'div', 'divDetail')[0], 'div', 'divRightContent')[0], 'div', 'div_Content')[0], 'div', 'news-detail-backcolor')[0], 'div', 'container')[0], 'div', 'divPageDetail_Content')[0], 'div')[0], 'div', 'div-flex-info')[0], 'div', 'div-right-info')[0], 'div')[0], 'div')[0], 'div');
                    var _iteratorNormalCompletion16 = true;
                    var _didIteratorError16 = false;
                    var _iteratorError16 = undefined;

                    try {
                        for (var _iterator16 = (0, _getIterator3.default)(files), _step16; !(_iteratorNormalCompletion16 = (_step16 = _iterator16.next()).done); _iteratorNormalCompletion16 = true) {
                            var f = _step16.value;

                            var a = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(f, 'div')[1], 'div')[0], 'div')[0], 'a')[0];
                            if (a.attribs.title.match(/新聞稿及全部附表.*pdf/)) {
                                var _ret12 = function () {
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
                                                        return (0, _utility.handleError)(err);
                                                    }
                                                });
                                            });
                                        })
                                    };
                                }();

                                if ((typeof _ret12 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret12)) === "object") return _ret12.v;
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
                });
            case 'cbc':
                console.log(obj);
                return (0, _apiTool2.default)('url', obj.url).then(function (raw_data) {
                    var download = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0], 'div', 'center')[0], 'div', 'container')[0], 'div', 'file_download')[0];
                    var downloadList = [];
                    if (download) {
                        (0, _utility.findTag)((0, _utility.findTag)(download, 'ul')[0], 'li').forEach(function (l) {
                            return (0, _utility.findTag)(l, 'a').forEach(function (a) {
                                if (a.attribs.title.match(/\.(pdf|xlsx)$/i)) {
                                    downloadList.push({
                                        url: (0, _utility.addPre)(a.attribs.href, 'https://www.cbc.gov.tw/tw'),
                                        name: a.attribs.title
                                    });
                                }
                            });
                        });
                    }
                    var recur_down = function recur_down(dIndex) {
                        if (dIndex < downloadList.length) {
                            var _ret13 = function () {
                                driveName = obj.name + ' ' + obj.date + '.' + dIndex + (0, _path.extname)(downloadList[dIndex].name);
                                console.log(driveName);
                                var subPath = (0, _utility.getFileLocation)(type, (0, _mongoTool.objectID)());
                                return {
                                    v: mkFolder((0, _path.dirname)(subPath)).then(function () {
                                        return (0, _apiTool2.default)('url', downloadList[dIndex].url, { filePath: subPath }).then(function () {
                                            return (0, _apiToolGoogle2.default)('upload', {
                                                type: 'auto',
                                                name: driveName,
                                                filePath: subPath,
                                                parent: parent,
                                                rest: function rest() {
                                                    return recur_down(dIndex + 1);
                                                },
                                                errhandle: function errhandle(err) {
                                                    return (0, _utility.handleError)(err);
                                                }
                                            });
                                        });
                                    })
                                };
                            }();

                            if ((typeof _ret13 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret13)) === "object") return _ret13.v;
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
                            return (0, _utility.handleError)(err);
                        }
                    });
                });
            default:
                return (0, _utility.handleError)(new _utility.HoError('unknown external type'));
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
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'main_top')[0], 'div', 'title-overview')[0], 'div', 'title-overview-widget')[0], 'div', 'plot_summary_wrapper')[0], 'div', 'plot_summary ')[0], 'div', 'credit_summary_item').forEach(function (d) {
                        return (0, _utility.findTag)(d, 'a').forEach(function (a) {
                            if (a.attribs.href.match(/^\/name\//)) {
                                taglist.add((0, _utility.findTag)(a)[0]);
                            }
                        });
                    });
                    var main_bottom = (0, _utility.findTag)(main, 'div', 'main_bottom')[0];
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleCast')[0], 'table', 'cast_list')[0], 'tr').forEach(function (t) {
                        var cast = (0, _utility.findTag)(t, 'td');
                        if (cast.length > 1) {
                            taglist.add((0, _utility.findTag)((0, _utility.findTag)(cast[1], 'a')[0])[0]);
                        }
                    });
                    var _iteratorNormalCompletion17 = true;
                    var _didIteratorError17 = false;
                    var _iteratorError17 = undefined;

                    try {
                        for (var _iterator17 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleStoryLine')[0], 'div', 'see-more inline canwrap')), _step17; !(_iteratorNormalCompletion17 = (_step17 = _iterator17.next()).done); _iteratorNormalCompletion17 = true) {
                            var t = _step17.value;

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

                    var _iteratorNormalCompletion18 = true;
                    var _didIteratorError18 = false;
                    var _iteratorError18 = undefined;

                    try {
                        for (var _iterator18 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)(main_bottom, 'div', 'titleDetails')[0], 'div', 'txt-block')), _step18; !(_iteratorNormalCompletion18 = (_step18 = _iterator18.next()).done); _iteratorNormalCompletion18 = true) {
                            var _t = _step18.value;

                            if ((0, _utility.findTag)((0, _utility.findTag)(_t, 'h4')[0])[0] === 'Country:') {
                                (0, _utility.findTag)(_t, 'a').forEach(function (a) {
                                    return taglist.add((0, _utility.findTag)(a)[0]);
                                });
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
                    var _iteratorNormalCompletion19 = true;
                    var _didIteratorError19 = false;
                    var _iteratorError19 = undefined;

                    try {
                        for (var _iterator19 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'WikiaSiteWrapper')[0], 'section', 'WikiaPage')[0], 'div', 'WikiaPageContentWrapper')[0], 'article', 'WikiaMainContent')[0], 'div', 'WikiaMainContentContainer')[0], 'div', 'WikiaArticle')[0], 'div', 'mw-content-text')[0], 'div')), _step19; !(_iteratorNormalCompletion19 = (_step19 = _iterator19.next()).done); _iteratorNormalCompletion19 = true) {
                            var div = _step19.value;

                            if (div.attribs.class !== 'center') {
                                (0, _utility.findTag)(div, 'div').forEach(function (d, i) {
                                    if (i === 0) {
                                        var name = (0, _utility.findTag)(d);
                                        if (name.length > 0) {
                                            taglist.add(name[0]);
                                        } else {
                                            var _iteratorNormalCompletion20 = true;
                                            var _didIteratorError20 = false;
                                            var _iteratorError20 = undefined;

                                            try {
                                                for (var _iterator20 = (0, _getIterator3.default)(d.children), _step20; !(_iteratorNormalCompletion20 = (_step20 = _iterator20.next()).done); _iteratorNormalCompletion20 = true) {
                                                    var c = _step20.value;

                                                    name = (0, _utility.findTag)(c);
                                                    if (c.type === 'tag' && name.length > 0) {
                                                        taglist.add(name[0]);
                                                        break;
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
                return (0, _utility.handleError)(new _utility.HoError('unknown external type'));
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
                return (0, _utility.handleError)(new _utility.HoError('playlist is empty'));
            }
            var ret_obj = back ? vId_arr[vId_arr.length - 1] : vId_arr[0];
            var is_new = true;
            if (index === 1) {
                is_new = false;
            } else {
                var _iteratorNormalCompletion21 = true;
                var _didIteratorError21 = false;
                var _iteratorError21 = undefined;

                try {
                    for (var _iterator21 = (0, _getIterator3.default)(vId_arr), _step21; !(_iteratorNormalCompletion21 = (_step21 = _iterator21.next()).done); _iteratorNormalCompletion21 = true) {
                        var i = _step21.value;

                        if (i.id === index) {
                            ret_obj = i;
                            is_new = false;
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
                return (0, _utility.handleError)(new _utility.HoError('index must > 0'));
            }
            sub_index = Math.round(+index * 1000) % 1000;
            if (sub_index === 0) {
                sub_index++;
            }
            index = Math.floor(+index);
        } else if (type !== 'youtube') {
            return (0, _utility.handleError)(new _utility.HoError('index invalid'));
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

        var _ret14 = function () {
            switch (type) {
                case 'youtube':
                    var youtube_id = url.match(/list=([^&]+)/);
                    return {
                        v: youtube_id ? _this.youtubePlaylist(youtube_id[1], index, pageToken, back) : _promise2.default.resolve([{
                            id: 'you_' + url.match(/v=([^&]+)/)[1],
                            index: 1,
                            showId: 1
                        }, false, 1])
                    };
                case 'lovetv':
                    var prefix = url.match(/^((http|https):\/\/[^\/]+)\//);
                    if (!prefix) {
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('invaild url'))
                        };
                    }
                    prefix = prefix[1];
                    var lovetvGetlist = function lovetvGetlist() {
                        return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                            var list = [];
                            var content = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0];
                            if (content) {
                                var outer = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(content, 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'Blog1')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer');
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
                                    var _iteratorNormalCompletion22 = true;
                                    var _didIteratorError22 = false;
                                    var _iteratorError22 = undefined;

                                    try {
                                        for (var _iterator22 = (0, _getIterator3.default)(outer), _step22; !(_iteratorNormalCompletion22 = (_step22 = _iterator22.next()).done); _iteratorNormalCompletion22 = true) {
                                            var o = _step22.value;

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
                                }
                            } else {
                                (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'wrapper')[0], 'div', 'main')[0], 'div', 'container')[0], 'div', 'content')[0], 'div')[2], 'div', 'entry-content')[0], 'table')[0], 'tbody')[0], 'tr').forEach(function (t) {
                                    var h = (0, _utility.findTag)((0, _utility.findTag)(t, 'td')[0], 'h3')[0];
                                    if (h) {
                                        var _a2 = (0, _utility.findTag)(h, 'a')[0];
                                        var _name = (0, _utility.findTag)(_a2)[0];
                                        if (!_name.match(/Synopsis$/i)) {
                                            list.splice(0, 0, {
                                                name: _name,
                                                url: _a2.attribs.href
                                            });
                                        }
                                    }
                                });
                            }
                            var is_end = false;
                            var _iteratorNormalCompletion23 = true;
                            var _didIteratorError23 = false;
                            var _iteratorError23 = undefined;

                            try {
                                for (var _iterator23 = (0, _getIterator3.default)(list), _step23; !(_iteratorNormalCompletion23 = (_step23 = _iterator23.next()).done); _iteratorNormalCompletion23 = true) {
                                    var _i = _step23.value;

                                    if (_i.name.match(/大結局/)) {
                                        is_end = true;
                                        break;
                                    }
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

                            return list.length < 1 ? (0, _mongoTool2.default)('find', _constants.STORAGEDB, {
                                owner: type,
                                url: encodeURIComponent(url)
                            }).then(function (items) {
                                if (items.length < 1) {
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find lovetv url'));
                                }
                                var nextLove = function nextLove(index, dramaIndex, list) {
                                    var _iteratorNormalCompletion24 = true;
                                    var _didIteratorError24 = false;
                                    var _iteratorError24 = undefined;

                                    try {
                                        var _loop = function _loop() {
                                            var i = _step24.value;

                                            if (i.name === items[0].name) {
                                                var validUrl = (0, _utility.isValidString)(i.url, 'url');
                                                if (!validUrl) {
                                                    return {
                                                        v: (0, _utility.handleError)(new _utility.HoError('url is not vaild'))
                                                    };
                                                }
                                                return {
                                                    v: (0, _mongoTool2.default)('update', _constants.STORAGEDB, { _id: items[0]._id }, { $set: { url: validUrl } }).then(function (item) {
                                                        url = i.url;
                                                        return lovetvGetlist();
                                                    })
                                                };
                                            }
                                        };

                                        for (var _iterator24 = (0, _getIterator3.default)(list), _step24; !(_iteratorNormalCompletion24 = (_step24 = _iterator24.next()).done); _iteratorNormalCompletion24 = true) {
                                            var _ret15 = _loop();

                                            if ((typeof _ret15 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret15)) === "object") return _ret15.v;
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

                                    dramaIndex++;
                                    if (dramaIndex < dramaList.length) {
                                        return recur_loveList(dramaIndex, nextLove);
                                    }
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find lovetv'));
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
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                saveList(lovetvGetlist, raw_list, is_end, etime);
                                return [(0, _assign2.default)({
                                    id: 'ope_' + new Buffer(!choose.url.match(/^(http|https):\/\//) ? '' + prefix + choose.url : choose.url).toString('base64'),
                                    title: choose.name,
                                    index: index,
                                    showId: index
                                }), is_end, raw_list.length];
                                /*return Api('url', !choose.url.match(/^(http|https):\/\//) ? `${prefix}${choose.url}` : choose.url).then(raw_data => {
                                    let obj = [];
                                    const vs = findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'content')[0], 'div', 'content-outer')[0], 'div', 'fauxborder-left content-fauxborder-left')[0], 'div', 'content-inner')[0], 'div', 'main-outer')[0], 'div', 'fauxborder-left main-fauxborder-left')[0], 'div', 'region-inner main-inner')[0], 'div', 'columns fauxcolumns')[0], 'div', 'columns-inner')[0], 'div', 'column-center-outer')[0], 'div', 'column-center-inner')[0], 'div', 'main')[0], 'div', 'widget Blog')[0], 'div', 'blog-posts hfeed')[0], 'div', 'date-outer')[0], 'div', 'date-posts')[0], 'div', 'post-outer')[0], 'div')[0], 'div', 'post-body entry-content')[0];
                                    const getV = (v, vType='') => {
                                        if (v) {
                                            const vIds = findTag(findTag(v, 'div', `video_ids${vType}`)[0])[0].match(/[^,]+/g);
                                            if (vIds.length > 0) {
                                                const t = Number(findTag(findTag(v, 'div', `video_type${vType}`)[0])[0]);
                                                if (t === 17) {
                                                    for (let i = 1; i <= vIds[1]; i++) {
                                                        obj.push(`bil_av${vIds[0]}_${i}`);
                                                    }
                                                } else if (t === 1) {
                                                    for (let i of vIds) {
                                                        obj.push(`you_${i}`);
                                                    }
                                                } else if (t === 10) {
                                                    for (let i of vIds) {
                                                        obj.push(`yuk_${i}`);
                                                    }
                                                } else if (t === 3) {
                                                    //open
                                                    for (let i of vIds) {
                                                        obj.push(`ope_${i}`);
                                                    }
                                                } else if (t === 12) {
                                                    //up2stream
                                                    for (let i of vIds) {
                                                        obj.push(`up2_${i}`);
                                                    }
                                                } else if (t === 19) {
                                                    //愛奇藝
                                                    for (let i of vIds) {
                                                        obj.push(`iqi_${i}`);
                                                    }
                                                } else if (t === 6) {
                                                    //line tv
                                                    for (let i of vIds) {
                                                        obj.push(`lin_${i}`);
                                                    }
                                                } else {
                                                    for (let i of vIds) {
                                                        obj.push(`dym_${i}`);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    const div1 = findTag(findTag(vs, 'p')[0], 'div', 'video_div')[0];
                                    getV(div1 ? div1 : findTag(vs, 'div', 'video_div')[0]);
                                    getV(findTag(vs, 'div', 'video_div_s2')[0], '_s2');
                                    getV(findTag(vs, 'div', 'video_div_s3')[0], '_s3');
                                    if (!obj) {
                                        return handleError(new HoError('no source'));
                                    }
                                    if (sub_index > obj.length) {
                                        sub_index = 1;
                                    }
                                    console.log(obj);
                                    saveList(lovetvGetlist, raw_list, is_end, etime);
                                    return [Object.assign({
                                        id: obj[sub_index-1],
                                        index: index,
                                        showId: index,
                                    }, (obj.length > 1) ? {
                                        sub: obj.length,
                                        index: (index * 1000 + sub_index) / 1000,
                                        showId: (index * 1000 + sub_index) / 1000,
                                    } : {}), is_end, raw_list.length];
                                });*/
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
                                        for (var _i2 in list) {
                                            if (list[_i2][0]['season'] === season) {
                                                si = _i2;
                                                break;
                                            }
                                        }
                                        if (si === -1) {
                                            list.push([data]);
                                        } else {
                                            var isInsert = false;
                                            for (var _i3 in list[si]) {
                                                if (list[si][_i3].size > size) {
                                                    list[si].splice(_i3, 0, data);
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
                                var _iteratorNormalCompletion25 = true;
                                var _didIteratorError25 = false;
                                var _iteratorError25 = undefined;

                                try {
                                    for (var _iterator25 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(center, 'table')[0], 'tr')[4], 'td')[0], 'b')), _step25; !(_iteratorNormalCompletion25 = (_step25 = _iterator25.next()).done); _iteratorNormalCompletion25 = true) {
                                        var _i4 = _step25.value;

                                        if ((0, _utility.findTag)(_i4)[0] === 'Ended') {
                                            is_end = true;
                                            break;
                                        }
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

                                if (trLength < 100) {
                                    return [getEzList(tr), is_end];
                                } else {
                                    console.log('too much');
                                    var show_name = url.match(/^https:\/\/[^\/]+\/shows\/\d+\/([^\/]+)/);
                                    if (!show_name) {
                                        return (0, _utility.handleError)(new _utility.HoError('unknown name!!!'));
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
                                var choose = raw_list[index - 1].slice();
                                if (!choose) {
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                var chooseMag = choose.splice(choose.length - 1, 1)[0];
                                var ret_obj = {
                                    index: index,
                                    showId: index,
                                    is_magnet: true,
                                    complete: false
                                };
                                var final_check = function final_check() {
                                    if (!(0, _utility.isValidString)(chooseMag.magnet, 'url')) {
                                        return (0, _utility.handleError)(new _utility.HoError('magnet is not vaild'));
                                    }
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
                            if (json_data === false) {
                                return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                            }
                            if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                                return (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                            }
                            var magnet = null;
                            var _iteratorNormalCompletion26 = true;
                            var _didIteratorError26 = false;
                            var _iteratorError26 = undefined;

                            try {
                                for (var _iterator26 = (0, _getIterator3.default)(json_data['data']['movie']['torrents']), _step26; !(_iteratorNormalCompletion26 = (_step26 = _iterator26.next()).done); _iteratorNormalCompletion26 = true) {
                                    var _i5 = _step26.value;

                                    if (_i5['quality'] === '1080p' || !magnet && _i5['quality'] === '720p') {
                                        magnet = 'magnet:?xt=urn:btih:' + _i5['hash'] + '&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969';
                                    }
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

                            return [[{
                                magnet: magnet,
                                title: json_data['data']['movie']['title']
                            }], false];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                if (!(0, _utility.isValidString)(raw_list[0].magnet, 'url')) {
                                    return (0, _utility.handleError)(new _utility.HoError('magnet is not vaild'));
                                }
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
                            return (0, _utility.handleError)(new _utility.HoError('bilibili id invalid'));
                        }
                        var getBangumi = function getBangumi(sId) {
                            return (0, _apiTool2.default)('url', 'http://bangumi.bilibili.com/jsonp/seasoninfo/' + sId + '.ver?callback=seasonListCallback&jsonp=jsonp&_=' + new Date().getTime(), { referer: url }).then(function (raw_data) {
                                var json_data = (0, _utility.getJson)(raw_data.match(/^[^\(]+\((.*)\);$/)[1]);
                                if (json_data === false) {
                                    return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                                }
                                if (!json_data.result || !json_data.result.episodes) {
                                    return (0, _utility.handleError)(new _utility.HoError('cannot get episodes'));
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
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
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
                case 'kubo':
                    var kuboGetlist = function kuboGetlist() {
                        return (0, _apiTool2.default)('url', url).then(function (raw_data) {
                            var list = [];
                            var is_end = false;
                            var main = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0];
                            var _iteratorNormalCompletion27 = true;
                            var _didIteratorError27 = false;
                            var _iteratorError27 = undefined;

                            try {
                                for (var _iterator27 = (0, _getIterator3.default)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'datal')[0], 'div', 'vmain')[0], 'div', 'vshow')[0], 'p')), _step27; !(_iteratorNormalCompletion27 = (_step27 = _iterator27.next()).done); _iteratorNormalCompletion27 = true) {
                                    var p = _step27.value;
                                    var _iteratorNormalCompletion29 = true;
                                    var _didIteratorError29 = false;
                                    var _iteratorError29 = undefined;

                                    try {
                                        for (var _iterator29 = (0, _getIterator3.default)((0, _utility.findTag)(p)), _step29; !(_iteratorNormalCompletion29 = (_step29 = _iterator29.next()).done); _iteratorNormalCompletion29 = true) {
                                            var pt = _step29.value;

                                            if (pt.match(/完結/)) {
                                                is_end = true;
                                                break;
                                            }
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

                                    if (is_end) {
                                        break;
                                    }
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

                            var flvUrl = null;
                            var listY = [];
                            (0, _utility.findTag)((0, _utility.findTag)(main, 'div', 'topRow')[0], 'div', 'hideCont').forEach(function (h) {
                                var ul = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(h, 'ul')[0], 'div', 'vmain')[0], 'div', 'vpl')[0], 'ul')[0];
                                var div = (0, _utility.findTag)(ul, 'div')[0];
                                if (div) {
                                    ul = div;
                                }
                                var _iteratorNormalCompletion28 = true;
                                var _didIteratorError28 = false;
                                var _iteratorError28 = undefined;

                                try {
                                    for (var _iterator28 = (0, _getIterator3.default)((0, _utility.findTag)(ul, 'li')), _step28; !(_iteratorNormalCompletion28 = (_step28 = _iterator28.next()).done); _iteratorNormalCompletion28 = true) {
                                        var l = _step28.value;

                                        var a = (0, _utility.findTag)(l, 'a')[0];
                                        var urlMatch = (0, _utility.addPre)(a.attribs.href, 'http://www.58b.tv').match(/youtube\.php\?(.*)$/);
                                        if (urlMatch) {
                                            listY.push({
                                                name: (0, _utility.findTag)(a)[0],
                                                id: 'kdy_' + urlMatch[1]
                                            });
                                        } else {
                                            if (a.attribs.href.match(/vod\-play\-id\-/)) {
                                                flvUrl = (0, _utility.addPre)(a.attribs.href, 'http://www.58b.tv');
                                                break;
                                            }
                                        }
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
                            });
                            return flvUrl ? (0, _apiTool2.default)('url', flvUrl).then(function (raw_data) {
                                var ff_urls = '';
                                var jM = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'playmar')[0], 'div', 'play')[0], 'div')[0], 'script')[0])[0].match(/^\s*var\s*ff_urls\s*=\s*['"](.*)['"];?\s*$/);
                                if (jM) {
                                    ff_urls = (0, _utility.getJson)(jM[1].replace(/\\\"/g, '"'));
                                }
                                var list1 = [];
                                var list2 = [];
                                var lists = [];
                                var listO = [];
                                ff_urls.Data.forEach(function (f) {
                                    if (f.playname === 'bj58') {
                                        list = f.playurls.map(function (p) {
                                            return {
                                                name: p[0],
                                                id: 'kur_' + new Buffer(p[2]).toString('base64')
                                            };
                                        });
                                    } else if (f.playname === 'bj') {
                                        list1 = f.playurls.map(function (p) {
                                            return {
                                                name: p[0],
                                                id: 'kyu_' + p[1].match(/^(.*)_wd1$/)[1]
                                            };
                                        });
                                    } else if (f.playname === 'bj2') {
                                        list2 = f.playurls.map(function (p) {
                                            return {
                                                name: p[0],
                                                id: 'kur_' + new Buffer(p[2]).toString('base64')
                                            };
                                        });
                                    } else if (f.playname.match(/^bj/)) {
                                        lists = f.playurls.map(function (p) {
                                            return {
                                                name: p[0],
                                                id: 'kur_' + new Buffer(p[2]).toString('base64')
                                            };
                                        });
                                    } else {
                                        listO = f.playurls.map(function (p) {
                                            return {
                                                name: p[0],
                                                id: 'kur_' + new Buffer(p[2]).toString('base64')
                                            };
                                        });
                                    }
                                });
                                list = list.concat(listY);
                                list = list.concat(list1);
                                list = list.concat(list2);
                                list = list.concat(lists);
                                list = list.concat(listO);
                                return [list, is_end];
                            }) : [listY, is_end];
                        });
                    };
                    return {
                        v: (0, _redisTool2.default)('hgetall', 'url: ' + encodeURIComponent(url)).then(function (item) {
                            var sendList = function sendList(raw_list, is_end, etime) {
                                var choose = raw_list[index - 1];
                                if (!choose) {
                                    return (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                }
                                saveList(kuboGetlist, raw_list, is_end, etime);
                                return [(0, _assign2.default)({
                                    index: index,
                                    showId: index,
                                    id: choose.id,
                                    title: choose.name
                                }, choose.id.match(/^(kdy|kyu)_/) ? {
                                    index: (index * 1000 + sub_index) / 1000,
                                    showId: (index * 1000 + sub_index) / 1000,
                                    id: choose.id + '_' + sub_index
                                } : {}), is_end, raw_list.length];
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : kuboGetlist().then(function (_ref17) {
                                var _ref18 = (0, _slicedToArray3.default)(_ref17, 2),
                                    raw_list = _ref18[0],
                                    is_end = _ref18[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                case 'dm5':
                    var madGetlist = function madGetlist() {
                        return (0, _apiTool2.default)('url', url, {
                            referer: 'http://www.dm5.com/',
                            cookie: 'SERVERID=node1; isAdult=1; frombot=1',
                            is_dm5: true
                        }).then(function (raw_data) {
                            var list = [];
                            var body = (0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0];
                            var is_end = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(body, 'div')[1], 'section', 'banner_detail')[0], 'div', 'banner_detail_form')[0], 'div', 'info')[0], 'p', 'tip')[0], 'span', 'block')[0], 'span')[0])[0] === '已完结' ? true : false;
                            (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(body, 'div', 'view-comment')[0], 'div', 'container')[0], 'div', 'left-bar')[0], 'div', 'tempc')[0], 'div', 'chapterlistload')[0], 'ul').forEach(function (u) {
                                var li = (0, _utility.findTag)(u, 'li');
                                var more = (0, _utility.findTag)(u, 'ul');
                                if (more.length > 0) {
                                    li = li.concat((0, _utility.findTag)(more[0], 'li'));
                                }
                                li.reverse().forEach(function (l) {
                                    var a = (0, _utility.findTag)(l, 'a')[0];
                                    var title = (0, _utility.findTag)(a)[0];
                                    if (!title) {
                                        title = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(a, 'div', 'info')[0], 'p', 'title ')[0])[0];
                                    }
                                    list.push({
                                        title: opencc.convertSync(title),
                                        url: (0, _utility.addPre)(a.attribs.href, 'http://www.dm5.com')
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
                                    index = 1;
                                    choose = raw_list[index - 1];
                                    if (!choose) {
                                        return (0, _utility.handleError)(new _utility.HoError('cannot find external index'));
                                    }
                                }
                                saveList(madGetlist, raw_list, is_end, etime);
                                return [{
                                    index: (index * 1000 + sub_index) / 1000,
                                    showId: (index * 1000 + sub_index) / 1000,
                                    title: choose.title,
                                    pre_url: choose.url
                                }, is_end, raw_list.length];
                            };
                            return item ? sendList(JSON.parse(item.raw_list), item.is_end === 'false' ? false : item.is_end, item.etime) : madGetlist().then(function (_ref19) {
                                var _ref20 = (0, _slicedToArray3.default)(_ref19, 2),
                                    raw_list = _ref20[0],
                                    is_end = _ref20[1];

                                return sendList(raw_list, is_end, -1);
                            });
                        })
                    };
                default:
                    return {
                        v: (0, _utility.handleError)(new _utility.HoError('unknown external type'))
                    };
            }
        }();

        if ((typeof _ret14 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret14)) === "object") return _ret14.v;
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
                        if (json_data === false) {
                            return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
                        }
                        if (json_data['status'] !== 'ok' || !json_data['data']['movie']) {
                            return (0, _utility.handleError)(new _utility.HoError('yify api fail'));
                        }
                        var setTag = new _set2.default(['yify', 'video', '影片', 'movie', '電影']);
                        setTag.add(json_data['data']['movie']['imdb_code']).add(json_data['data']['movie']['year'].toString());
                        if (json_data['data']['movie']['genres']) {
                            json_data['data']['movie']['genres'].forEach(function (i) {
                                return setTag.add(i);
                            });
                        }
                        if (json_data['data']['movie']['cast']) {
                            json_data['data']['movie']['cast'].forEach(function (i) {
                                return setTag.add(i.name);
                            });
                        }
                        var newTag = new _set2.default();
                        setTag.forEach(function (i) {
                            return newTag.add(_constants.GENRE_LIST.includes(i) ? _constants.GENRE_LIST_CH[_constants.GENRE_LIST.indexOf(i)] : i);
                        });
                        return [json_data['data']['movie']['title'], newTag, new _set2.default(), 'yify', json_data['data']['movie']['small_cover_image'], url];
                    });
                });
            case 'kubo':
                url = 'http://www.58b.tv/vod-read-id-' + id + '.html';
                return (0, _apiTool2.default)('url', url, { referer: 'http://www.58b.tv/' }).then(function (raw_data) {
                    var vmain = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'main')[0], 'div', 'datal')[0], 'div', 'vmain')[0];
                    var img = (0, _utility.findTag)((0, _utility.findTag)(vmain, 'div', 'vpic')[0], 'img')[0];
                    var name = img.attribs.alt;
                    var thumb = img.attribs.src;
                    var tags = new _set2.default(['kubo', '酷播', '影片', 'video']);
                    (0, _utility.findTag)((0, _utility.findTag)(vmain, 'div', 'vshow')[0], 'p').forEach(function (p) {
                        var t = (0, _utility.findTag)(p)[0];
                        if (t) {
                            var match = (0, _utility.findTag)(p)[0].match(/^別名:(.*)$/);
                            if (match) {
                                match[1].split('/').forEach(function (m) {
                                    return tags.add(m);
                                });
                            } else {
                                if (t === '類型：') {
                                    (0, _utility.findTag)(p, 'a').forEach(function (a) {
                                        return tags.add((0, _utility.findTag)(a)[0]);
                                    });
                                } else if (t === '分類：') {
                                    (0, _utility.findTag)(p, 'font').forEach(function (a) {
                                        return tags.add((0, _utility.findTag)(a)[0]);
                                    });
                                    var _type = (0, _utility.findTag)((0, _utility.findTag)(p, 'a')[0])[0];
                                    tags.add(_type);
                                    for (var _i6 in _constants.KUBO_TYPE) {
                                        var index = _constants.KUBO_TYPE[_i6].indexOf(_type);
                                        if (index !== -1) {
                                            if (_i6 === '0') {
                                                tags.add('movie').add('電影');
                                                switch (index) {
                                                    case 0:
                                                        tags.add('action').add('動作');
                                                        break;
                                                    case 1:
                                                        tags.add('comedy').add('喜劇');
                                                        break;
                                                    case 2:
                                                        tags.add('romance').add('浪漫');
                                                        break;
                                                    case 3:
                                                        tags.add('sci-fi').add('科幻');
                                                        break;
                                                    case 4:
                                                        tags.add('horror').add('恐怖');
                                                        break;
                                                    case 5:
                                                        tags.add('drama').add('劇情');
                                                        break;
                                                    case 6:
                                                        tags.add('war').add('戰爭');
                                                        break;
                                                    case 7:
                                                        tags.add('animation').add('動畫');
                                                        break;
                                                }
                                            } else if (_i6 === '1') {
                                                tags.add('tv show').add('電視劇');
                                            } else if (_i6 === '2') {
                                                tags.add('tv show').add('電視劇').add('綜藝節目');
                                            } else if (_i6 === '3') {
                                                tags.add('animation').add('動畫');
                                            }
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    });
                    var newTag = new _set2.default();
                    tags.forEach(function (t) {
                        var index = _constants.DM5_ORI_LIST.indexOf(t);
                        newTag.add(index !== -1 ? _constants.DM5_CH_LIST[index] : t);
                    });
                    return [img.attribs.alt, newTag, new _set2.default(), 'kubo', img.attribs.src, url];
                });
            case 'dm5':
                url = 'http://www.dm5.com/' + id + '/';
                return (0, _apiTool2.default)('url', url, { is_dm5: true }).then(function (raw_data) {
                    var info = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div')[1], 'section', 'banner_detail')[0], 'div', 'banner_detail_form')[0];
                    var setTag = new _set2.default(['dm5', '漫畫', 'comic', '圖片集', 'image book', '圖片', 'image']);
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(info, 'div', 'info')[0], 'p', 'subtitle')[0], 'a').forEach(function (a) {
                        return setTag.add(opencc.convertSync((0, _utility.findTag)(a)[0]));
                    });
                    (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(info, 'div', 'info')[0], 'p', 'tip')[0], 'span', 'block')[1], 'a').forEach(function (a) {
                        return setTag.add(opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)(a, 'span')[0])[0]));
                    });
                    var newTag = new _set2.default();
                    setTag.forEach(function (i) {
                        return newTag.add(_constants.DM5_ORI_LIST.includes(i) ? _constants.DM5_CH_LIST[_constants.DM5_ORI_LIST.indexOf(i)] : i);
                    });
                    return [opencc.convertSync((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(info, 'div', 'info')[0], 'p', 'title')[0])[0]), newTag, new _set2.default(), 'dm5', (0, _utility.findTag)((0, _utility.findTag)(info, 'div', 'cover')[0], 'img')[0].attribs.src, url];
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
                        return newTag.add(_constants.DM5_ORI_LIST.includes(i) ? _constants.DM5_CH_LIST[_constants.DM5_ORI_LIST.indexOf(i)] : i);
                    });
                    return [name, newTag, new _set2.default(), 'bilibili', thumb, url];
                });
            default:
                return (0, _utility.handleError)(new _utility.HoError('unknown external type'));
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
            return (0, _utility.handleError)(new _utility.HoError('sub data error!!!'));
        }
        var sub_id = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(big_item, 'div', 'pull-left lb_r')[0], 'table')[0], 'tr')[0], 'td')[0], 'h4')[0], 'a')[0].attribs.href;
        return (0, _apiTool2.default)('url', 'http://subhd.com/ajax/down_ajax', {
            post: { sub_id: sub_id.match(/\d+$/)[0] },
            is_json: true,
            referer: 'http://subhd.com' + sub_id
        }).then(function (data) {
            console.log(data);
            return data.success ? data.url : (0, _utility.handleError)(new _utility.HoError('too many times!!!'));
        });
    });
};

var bilibiliVideoUrl = exports.bilibiliVideoUrl = function bilibiliVideoUrl(url) {
    console.log(url);
    var id = url.match(/(av)?(\d+)\/(index_(\d+)\.html)?$/);
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('bilibili id invalid'));
    }
    var page = id[3] ? Number(id[4]) : 1;
    return (0, _apiTool2.default)('url', 'http://api.bilibili.com/view?type=json&appkey=8e9fc618fbd41e28&id=' + id[2] + '&page=1&batch=true', { referer: 'http://api.bilibili.com/' }).then(function (raw_data) {
        var json_data = (0, _utility.getJson)(raw_data);
        if (json_data === false) {
            return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
        }
        if (!json_data.list) {
            return (0, _utility.handleError)(new _utility.HoError('cannot get list'));
        }
        return {
            title: json_data.list[page - 1].part,
            video: [],
            embed: ['//static.hdslb.com/miniloader.swf?aid=' + id[2] + '&page=' + page]
        };
    });
};

var kuboVideoUrl = exports.kuboVideoUrl = function kuboVideoUrl(id, url) {
    var subIndex = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;

    console.log(url);
    if (id === 'kdy') {
        return (0, _apiTool2.default)('url', url, { referer: 'http://www.58b.tv/' }).then(function (raw_data) {
            var iframes = (0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)((0, _utility.findTag)(_htmlparser2.default.parseDOM(raw_data), 'html')[0], 'body')[0], 'div', 'container')[0], 'div', 'youtube-player')[0], 'iframe');
            if (subIndex > iframes.length) {
                subIndex = iframes.length;
            }
            var getUrl = function getUrl(youUrl) {
                return youUrl.match(/www\.youtube\.com/) ? youtubeVideoUrl('you', 'http://www.youtube.com/watch?v=' + youUrl.match(/embed\/(.*)$/)[1]) : youtubeVideoUrl('dym', 'http://www.dailymotion.com/embed/video/' + youUrl.match(/url\=(.*)$/)[1]);
            };
            if (!iframes[subIndex - 1]) {
                console.log(iframes);
                return (0, _utility.handleError)(new _utility.HoError('cannot find mp4'));
            }
            return getUrl(iframes[subIndex - 1].attribs.src).then(function (ret_obj) {
                return (0, _assign2.default)(ret_obj, iframes.length > 1 ? { sub: iframes.length } : {});
            });
        });
    } else if (id === 'kud') {
        return _promise2.default.resolve({
            video: [],
            url: [url]
        });
        /*return Api('url', url, {referer: 'http://www.58b.tv/'}).then(raw_data => {
            let ret_obj = {video: []};
            const script = findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'script')[0];
            if (!script) {
                return handleError(new HoError('cannot find mp4'));
            }
            const videoData = findTag(script)[0];
            if (videoData) {
                JuicyCodes.Run(videoData.match(/\((.*)\)/)[1].replace(/["\+]/g, ''));
                kuboInfo.sources.forEach(s => {
                    if (s.type === 'video/mp4') {
                        ret_obj.video.splice(0, 0, s.file);
                    }
                });
                if (ret_obj.video.length < 1) {
                    console.log(ret_obj.video);
                    return handleError(new HoError('cannot find mp4'));
                }
                return ret_obj;
            } else {
                return handleError(new HoError('cannot find videoData'));
                return Api('url', `http://www.99tw.net/redirect?id=${url.match(/\&kubovid\=(\d+)/)[1]}&pid=${subIndex}`, {referer: 'http://www.58b.tv/'}).then(raw_data => {
                    for (let i of findTag(findTag(findTag(Htmlparser.parseDOM(raw_data), 'html')[0], 'body')[0], 'script')) {
                        const videoData = findTag(i)[0];
                        if (videoData) {
                            const videoMatch = videoData.match(/videoDetail = ([^\]]+\])/);
                            if (videoMatch) {
                                let bps = 0;
                                getJson(videoMatch[1].replace(/'/g, '"').replace(/bps/g, '"bps"').replace(/src/g, '"src"').replace(/type/g, '"type"')).forEach(i => {
                                    if (i.bps) {
                                        if (parseInt(i.bps) > bps) {
                                            bps = parseInt(i.bps);
                                            ret_obj.video.splice(0, 0, i.src);
                                        } else {
                                            ret_obj.video.push(i.src);
                                        }
                                    }
                                });
                                if (ret_obj.video.length < 1) {
                                    console.log(ret_obj.video);
                                    return handleError(new HoError('cannot find mp4'));
                                }
                                return ret_obj;
                            }
                        }
                    }
                });
            }
        });*/
    } else if (id === 'kyu') {
        return (0, _apiTool2.default)('url', 'http://www.58b.tv/jx/show.php?playlist=1&fmt=1&rand=' + new Date().getTime(), {
            referer: 'http://www.58b.tv/',
            post: { url: new Buffer(url).toString('base64') }
        }).then(function (raw_data) {
            var json_data = (0, _utility.getJson)(raw_data);
            if (json_data === false) {
                return (0, _utility.handleError)(new _utility.HoError('json parse error!!!'));
            }
            if (json_data['code'] === '404') {
                console.log(json_data);
                return (0, _utility.handleError)(new _utility.HoError('try later'));
            }
            if (!json_data['mp4']) {
                console.log(json_data);
                return (0, _utility.handleError)(new _utility.HoError('cannot find mp4'));
            }
            if (subIndex > json_data['mp4'].length) {
                subIndex = json_data['mp4'].length;
            }
            if (!json_data['mp4'][subIndex - 1]) {
                console.log(json_data);
                return (0, _utility.handleError)(new _utility.HoError('cannot find mp4'));
            }
            return (0, _assign2.default)({ video: [json_data['mp4'][subIndex - 1].url] }, json_data['mp4'].length > 1 ? { sub: json_data['mp4'].length } : {});
        });
    } else {
        return _promise2.default.resolve({
            video: [],
            url: [url]
        });
    }
};

var youtubeVideoUrl = exports.youtubeVideoUrl = function youtubeVideoUrl(id, url) {
    console.log(url);
    var ret_obj = { video: [] };
    if (id === 'lin') {
        ret_obj['iframe'] = ['//tv.line.me/embed/' + url.match(/[^\/]+$/)[0] + '?isAutoPlay=true'];
    } else if (id === 'iqi') {
        var iqiId = url.match(/([^\/]+)\.html$/)[1].split('-');
        ret_obj['embed'] = ['//player.video.qiyi.com/' + iqiId[0] + '/0/0/v_' + iqiId[1] + '.swf-albumId=' + iqiId[2] + '-tvId=' + iqiId[3] + '-isPurchase=0-cnId=2'];
        //} else if (id === 'ope') {
        //    ret_obj['iframe'] = [url];
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
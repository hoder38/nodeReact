'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getExtname = exports.changeExt = exports.mediaMIME = exports.isKindle = exports.isSub = exports.isDoc = exports.isZipbook = exports.isZip = exports.isTorrent = exports.isMusic = exports.isImage = exports.isVideo = exports.extType = exports.extTag = exports.addPost = exports.getOptionTag = undefined;

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

exports.supplyTag = supplyTag;

var _constants = require('../constants');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var getOptionTag = exports.getOptionTag = function getOptionTag() {
    return [].concat((0, _toConsumableArray3.default)(_constants.MEDIA_LIST_CH), (0, _toConsumableArray3.default)(_constants.GENRE_LIST_CH), (0, _toConsumableArray3.default)(_constants.GAME_LIST_CH), (0, _toConsumableArray3.default)(_constants.MUSIC_LIST), (0, _toConsumableArray3.default)(_constants.ADULT_LIST));
};

var addPost = exports.addPost = function addPost(str, post) {
    var result = str.match(_constants.EXT_FILENAME);
    return result && result[1] ? str.replace(_constants.EXT_FILENAME, function (a) {
        return '(' + post + ').' + result[1].toLowerCase();
    }) : str + '(' + post + ')';
};

var extTag = exports.extTag = function extTag(type) {
    try {
        return JSON.parse((0, _stringify2.default)(_constants.MEDIA_TAG[type]));
    } catch (x) {
        console.log(_constants.MEDIA_TAG[type]);
        return {};
    }
};

var extType = exports.extType = function extType(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (_constants.IMAGE_EXT.includes(extName)) {
        return {
            type: 'image',
            ext: extName
        };
    } else if (_constants.ZIP_EXT.includes(extName)) {
        if (name.match(/\.book\.(zip|7z|rar)$/)) {
            return {
                type: 'zipbook',
                ext: extName
            };
        } else if (extName === 'cbr' || extName === 'cbz') {
            return {
                type: 'zipbook',
                ext: extName
            };
        } else {
            if (extName === '001') {
                if (name.match(/\.zip\.001$/)) {
                    return {
                        type: 'zip',
                        ext: 'zip'
                    };
                } else if (name.match(/\.7z\.001$/)) {
                    return {
                        type: 'zip',
                        ext: '7z'
                    };
                } else {
                    return false;
                }
            } else {
                return {
                    type: 'zip',
                    ext: extName
                };
            }
        }
    } else if (_constants.VIDEO_EXT.includes(extName)) {
        return {
            type: 'video',
            ext: extName
        };
    } else if (_constants.MUSIC_EXT.includes(extName)) {
        return {
            type: 'music',
            ext: extName
        };
    } else if (_constants.DOC_EXT.doc.includes(extName)) {
        return {
            type: 'doc',
            ext: extName
        };
    } else if (_constants.DOC_EXT.present.includes(extName)) {
        return {
            type: 'present',
            ext: extName
        };
    } else if (_constants.DOC_EXT.sheet.includes(extName)) {
        return {
            type: 'sheet',
            ext: extName
        };
    } else if (_constants.DOC_EXT.pdf.includes(extName)) {
        return {
            type: 'pdf',
            ext: extName
        };
    } else if (_constants.DOC_EXT.rawdoc.includes(extName)) {
        return {
            type: 'rawdoc',
            ext: extName
        };
    } else {
        return false;
    }
};

var isVideo = exports.isVideo = function isVideo(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.VIDEO_EXT.includes(extName) ? extName : false;
};

var isImage = exports.isImage = function isImage(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.IMAGE_EXT.includes(extName) ? extName : false;
};

var isMusic = exports.isMusic = function isMusic(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.MUSIC_EXT.includes(extName) ? extName : false;
};

var isTorrent = exports.isTorrent = function isTorrent(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.TORRENT_EXT.includes(extName) ? extName : false;
};

var isZip = exports.isZip = function isZip(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (_constants.ZIP_EXT.includes(extName)) {
        if (extName === '001') {
            if (name.match(/zip\.001$/)) {
                return 'zip';
            } else if (name.match(/7z\.001$/)) {
                return '7z';
            }
        } else {
            return extName;
        }
    } else {
        return false;
    }
};

var isZipbook = exports.isZipbook = function isZipbook(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (_constants.ZIP_EXT.includes(extName)) {
        return name.match(/\.book\.(zip|7z|rar)$/) || extName === 'cbr' || extName === 'cbz' ? extName : false;
    } else {
        return false;
    }
};

var isDoc = exports.isDoc = function isDoc(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (_constants.DOC_EXT.doc.includes(extName)) {
        return { type: 'doc', ext: extName };
    } else if (_constants.DOC_EXT.present.includes(extName)) {
        return { type: 'present', ext: extName };
    } else if (_constants.DOC_EXT.sheet.includes(extName)) {
        return { type: 'sheet', ext: extName };
    } else if (_constants.DOC_EXT.pdf.includes(extName)) {
        return { type: 'pdf', ext: extName };
    } else if (_constants.DOC_EXT.rawdoc.includes(extName)) {
        return { type: 'rawdoc', ext: extName };
    } else {
        return false;
    }
};

var isSub = exports.isSub = function isSub(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.SUB_EXT.includes(extName) ? extName : false;
};

var isKindle = exports.isKindle = function isKindle(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return _constants.KINDLE_EXT.includes(extName) ? extName : extName.match(/^azw\d$/) ? extName : false;
};

var mediaMIME = exports.mediaMIME = function mediaMIME(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = result && result[1] ? result[1].toLowerCase() : '';
    return _constants.MIME_EXT[extName] ? _constants.MIME_EXT[extName] : false;
};

function supplyTag(tags, retTags) {
    var otherTags = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : [];

    if (tags.includes('18+')) {
        return [].concat((0, _toConsumableArray3.default)(retTags), (0, _toConsumableArray3.default)(_constants.ADULT_LIST.filter(function (i) {
            return !tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i);
        })));
    } else if (tags.includes('game') || tags.includes('遊戲')) {
        return [].concat((0, _toConsumableArray3.default)(retTags), (0, _toConsumableArray3.default)(_constants.GAME_LIST_CH.filter(function (i) {
            return !tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i);
        })));
    } else if (tags.includes('audio') || tags.includes('音頻')) {
        return [].concat((0, _toConsumableArray3.default)(retTags), (0, _toConsumableArray3.default)(_constants.MUSIC_LIST.filter(function (i) {
            return !tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i);
        })));
    } else {
        return [].concat((0, _toConsumableArray3.default)(retTags), (0, _toConsumableArray3.default)(_constants.GENRE_LIST_CH.filter(function (i) {
            return !tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i);
        })));
    }
}

var changeExt = exports.changeExt = function changeExt(str, ext) {
    return str.replace(_constants.EXT_FILENAME, function (a) {
        return '.' + ext;
    });
};

var getExtname = exports.getExtname = function getExtname(name) {
    var result = name.match(_constants.EXT_FILENAME);
    var extName = result && result[0] ? result[0].toLowerCase() : '';
    var frontName = name.substr(0, name.length - extName.length);
    return {
        front: frontName,
        ext: extName
    };
};
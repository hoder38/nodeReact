'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.STOCK_MODE = exports.STOCK_DATE = exports.STREAM_LIMIT = exports.MEGA_LIMIT = exports.ZIP_LIMIT = exports.TORRENT_LIMIT = exports.API_LIMIT = exports.CHECK_MEDIA = exports.UPDATE_EXTERNAL = exports.UPDATE_STOCK = exports.AUTO_DOWNLOAD = exports.AUTO_UPLOAD = exports.HINT = exports.NAS_PREFIX = exports.NAS_TMP = exports.GOOGLE_BACKUP_FOLDER = exports.GOOGLE_MEDIA_FOLDER = exports.SESS_PORT = exports.SESS_IP = exports.DB_PORT = exports.DB_IP = exports.DB_NAME = exports.WS_PORT = exports.COM_PORT = exports.EXTENT_FILE_PORT = exports.FILE_PORT = exports.EXTENT_PORT = exports.PORT = exports.FILE_IP = exports.IP = exports.EXTENT_FILE_IP = exports.EXTENT_IP = undefined;

var _constants = require('./constants');

var _nodeDevConfig = require('../../config/node-dev-config');

var _nodeDevConfig2 = _interopRequireDefault(_nodeDevConfig);

var _nodeReleaseConfig = require('../../config/node-release-config');

var _nodeReleaseConfig2 = _interopRequireDefault(_nodeReleaseConfig);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var EXTENT_IP = exports.EXTENT_IP = function EXTENT_IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.EXTENT_IP : _nodeDevConfig2.default.EXTENT_IP;
};
var EXTENT_FILE_IP = exports.EXTENT_FILE_IP = function EXTENT_FILE_IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.EXTENT_FILE_IP : _nodeDevConfig2.default.EXTENT_FILE_IP;
};
var IP = exports.IP = function IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.IP : _nodeDevConfig2.default.IP;
};
var FILE_IP = exports.FILE_IP = function FILE_IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.FILE_IP : _nodeDevConfig2.default.FILE_IP;
};
var PORT = exports.PORT = function PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.PORT : _nodeDevConfig2.default.PORT;
};
var EXTENT_PORT = exports.EXTENT_PORT = function EXTENT_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.EXTENT_PORT : _nodeDevConfig2.default.EXTENT_PORT;
};
var FILE_PORT = exports.FILE_PORT = function FILE_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.FILE_PORT : _nodeDevConfig2.default.FILE_PORT;
};
var EXTENT_FILE_PORT = exports.EXTENT_FILE_PORT = function EXTENT_FILE_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.EXTENT_FILE_PORT : _nodeDevConfig2.default.EXTENT_FILE_PORT;
};
var COM_PORT = exports.COM_PORT = function COM_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.COM_PORT : _nodeDevConfig2.default.COM_PORT;
};
var WS_PORT = exports.WS_PORT = function WS_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.WS_PORT : _nodeDevConfig2.default.WS_PORT;
};
var DB_NAME = exports.DB_NAME = function DB_NAME(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.DB_NAME : _nodeDevConfig2.default.DB_NAME;
};
var DB_IP = exports.DB_IP = function DB_IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.DB_IP : _nodeDevConfig2.default.DB_IP;
};
var DB_PORT = exports.DB_PORT = function DB_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.DB_PORT : _nodeDevConfig2.default.DB_PORT;
};
var SESS_IP = exports.SESS_IP = function SESS_IP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.SESS_IP : _nodeDevConfig2.default.SESS_IP;
};
var SESS_PORT = exports.SESS_PORT = function SESS_PORT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.SESS_PORT : _nodeDevConfig2.default.SESS_PORT;
};
var GOOGLE_MEDIA_FOLDER = exports.GOOGLE_MEDIA_FOLDER = function GOOGLE_MEDIA_FOLDER(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.GOOGLE_MEDIA_FOLDER : _nodeDevConfig2.default.GOOGLE_MEDIA_FOLDER;
};
var GOOGLE_BACKUP_FOLDER = exports.GOOGLE_BACKUP_FOLDER = function GOOGLE_BACKUP_FOLDER(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.GOOGLE_BACKUP_FOLDER : _nodeDevConfig2.default.GOOGLE_BACKUP_FOLDER;
};
var NAS_TMP = exports.NAS_TMP = function NAS_TMP(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.NAS_TMP : _nodeDevConfig2.default.NAS_TMP;
};
var NAS_PREFIX = exports.NAS_PREFIX = function NAS_PREFIX(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.NAS_PREFIX : _nodeDevConfig2.default.NAS_PREFIX;
};
var HINT = exports.HINT = function HINT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.HINT : _nodeDevConfig2.default.HINT;
};
var AUTO_UPLOAD = exports.AUTO_UPLOAD = function AUTO_UPLOAD(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.AUTO_UPLOAD : _nodeDevConfig2.default.AUTO_UPLOAD;
};
var AUTO_DOWNLOAD = exports.AUTO_DOWNLOAD = function AUTO_DOWNLOAD(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.AUTO_DOWNLOAD : _nodeDevConfig2.default.AUTO_DOWNLOAD;
};
var UPDATE_STOCK = exports.UPDATE_STOCK = function UPDATE_STOCK(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.UPDATE_STOCK : _nodeDevConfig2.default.UPDATE_STOCK;
};
var UPDATE_EXTERNAL = exports.UPDATE_EXTERNAL = function UPDATE_EXTERNAL(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.UPDATE_EXTERNAL : _nodeDevConfig2.default.UPDATE_EXTERNAL;
};
var CHECK_MEDIA = exports.CHECK_MEDIA = function CHECK_MEDIA(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.CHECK_MEDIA : _nodeDevConfig2.default.CHECK_MEDIA;
};
var API_LIMIT = exports.API_LIMIT = function API_LIMIT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.API_LIMIT : _nodeDevConfig2.default.API_LIMIT;
};
var TORRENT_LIMIT = exports.TORRENT_LIMIT = function TORRENT_LIMIT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.TORRENT_LIMIT : _nodeDevConfig2.default.TORRENT_LIMIT;
};
var ZIP_LIMIT = exports.ZIP_LIMIT = function ZIP_LIMIT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.ZIP_LIMIT : _nodeDevConfig2.default.ZIP_LIMIT;
};
var MEGA_LIMIT = exports.MEGA_LIMIT = function MEGA_LIMIT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.MEGA_LIMIT : _nodeDevConfig2.default.MEGA_LIMIT;
};
var STREAM_LIMIT = exports.STREAM_LIMIT = function STREAM_LIMIT(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.STREAM_LIMIT : _nodeDevConfig2.default.STREAM_LIMIT;
};
var STOCK_DATE = exports.STOCK_DATE = function STOCK_DATE(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.STOCK_DATE : _nodeDevConfig2.default.STOCK_DATE;
};
var STOCK_MODE = exports.STOCK_MODE = function STOCK_MODE(env) {
  return env === _constants.RELEASE ? _nodeReleaseConfig2.default.STOCK_MODE : _nodeDevConfig2.default.STOCK_MODE;
};
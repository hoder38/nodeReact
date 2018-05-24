'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

exports.mainInit = mainInit;
exports.init = init;

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _ver = require('../../../ver');

var _config = require('../config');

var _utility = require('./utility');

var _net = require('net');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var wsServer = null;
var client = null;

function mainInit(server) {
    wsServer = new _ws2.default.Server({
        perMessageDeflate: false,
        server: server,
        path: '/f'
    });
    wsServer.on('connection', function (ws) {
        ws.on('message', function (message) {
            console.log(message);
            try {
                console.log(JSON.parse(message));
            } catch (e) {
                (0, _utility.handleError)(e, 'Web socket');
            }
        });
        ws.on('close', function (reasonCode, description) {
            return console.log('Peer disconnected with reason: ' + reasonCode + ' ' + description);
        });
    });
}

function init() {
    client = (0, _net.connect)((0, _config.COM_PORT)(_ver.ENV_TYPE), (0, _config.FILE_IP)(_ver.ENV_TYPE), function () {
        return console.log('connected to server!');
    });
    client.on('end', function () {
        return console.log('disconnected from server');
    });
}

exports.default = function (data, adultonly, auth) {
    if (wsServer) {
        (function () {
            data.level = auth && adultonly ? 2 : adultonly ? 1 : 0;
            var sendData = (0, _stringify2.default)(data);
            wsServer.clients.forEach(function each(client) {
                client.send(sendData);
            });
        })();
    }
    if (client) {
        client.write((0, _stringify2.default)({
            send: 'web',
            data: data,
            adultonly: adultonly ? 1 : 0,
            auth: auth ? 1 : 0
        }));
    }
};
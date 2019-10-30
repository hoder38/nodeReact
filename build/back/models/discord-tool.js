'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.init = undefined;

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.default = discordSend;

var _constants = require('../constants');

var _ver = require('../../../ver');

var _discord = require('discord.js');

var _discord2 = _interopRequireDefault(_discord);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _stockTool = require('../models/stock-tool');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var channel = null;
var init = exports.init = function init() {
    var client = new _discord2.default.Client();
    client.on('ready', function () {
        console.log('Logged in as ' + client.user.tag + '!');
        channel = client.channels.find(function (val) {
            return val.id === _ver.DISCORD_CHANNEL;
        });
        channel.send('Nice to serve you!!!');
    });
    client.on('message', function (msg) {
        if (!msg.author.bot) {
            var cmd = msg.content.toLowerCase();
            switch (cmd) {
                case 'checkdoc':
                    checkDoc(msg);
                    break;
                case 'stock':
                    stockPrice(msg);
                    break;
                case 'help':
                default:
                    help(msg);
                    break;
            }
        }
    });
    client.login(_ver.DISCORD_TOKEN);
};

var help = function help(msg) {
    return msg.reply('\nCommand:\ncheckdoc\nstock');
};

var checkDoc = function checkDoc(msg) {
    return (0, _mongoTool2.default)('find', _constants.DOCDB).then(function (doclist) {
        return msg.reply(doclist.reduce(function (a, v) {
            return a + '\ntype: ' + v.type + ', date: ' + v.date;
        }, ''));
    }).catch(function (err) {
        return msg.reply(err.message);
    });
};

var stockPrice = function stockPrice(msg) {
    return (0, _stockTool.stockShow)().then(function (ret) {
        return ret.length > 0 ? msg.reply(ret) : _promise2.default.resolve();
    }).catch(function (err) {
        return msg.reply(err.message);
    });
};

function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}
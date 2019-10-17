'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.init = undefined;
exports.default = discordSend;

var _ver = require('../../../ver');

var _discord = require('discord.js');

var _discord2 = _interopRequireDefault(_discord);

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
            msg.reply(msg.content + '妳妹');
        }
    });
    client.login(_ver.DISCORD_TOKEN);
};

function discordSend(msg) {
    if (channel) {
        channel.send(msg);
    }
}
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.linebotParser = undefined;
exports.default = line;

var _linebot = require('linebot');

var _linebot2 = _interopRequireDefault(_linebot);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var bot = (0, _linebot2.default)({
    channelId: '1653318480',
    channelSecret: 'de3b387c0ad66650ebfe15f21d1a4fc8',
    channelAccessToken: 'wfB79E8JugjnoFgK3Sipu7gMe2pvyMDoMnupyyBSe60M1x8wH7qjtOhVHGRj9o+8ehG9n3JtHegFn7tNVwTx40jiw6YxnPShXQFPvQ7HQ3vd1pacGATnMZaVxZGWsGGXTUNm6BD48u5G5wzHAgLiSAdB04t89/1O/w1cDnyilFU='
});
bot.on('message', function (event) {
    if (event.message.type === 'text') {
        (function () {
            var msg = event.message.text;
            event.reply(msg).then(function (data) {
                console.log(msg);
            }).catch(function (error) {
                console.log('error：' + error);
            });
        })();
    }
});
var linebotParser = exports.linebotParser = bot.parser();
function line() {
    return 123;
}
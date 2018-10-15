'use strict';

var _fs = require('fs');

var _ver = require('../../../ver');

var _config = require('../config');

var _https = require('https');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _expressSession = require('express-session');

var _expressSession2 = _interopRequireDefault(_expressSession);

var _bodyParser = require('body-parser');

var _passport = require('passport');

var _passport2 = _interopRequireDefault(_passport);

var _connectMultiparty = require('connect-multiparty');

var _connectMultiparty2 = _interopRequireDefault(_connectMultiparty);

var _net = require('net');

var _sessionTool = require('../models/session-tool');

var _sessionTool2 = _interopRequireDefault(_sessionTool);

var _loginRouter = require('./login-router');

var _loginRouter2 = _interopRequireDefault(_loginRouter);

var _fileBasicRouter = require('./file-basic-router');

var _fileBasicRouter2 = _interopRequireDefault(_fileBasicRouter);

var _fileOtherRouter = require('./file-other-router');

var _fileOtherRouter2 = _interopRequireDefault(_fileOtherRouter);

var _fileRouter = require('./file-router');

var _fileRouter2 = _interopRequireDefault(_fileRouter);

var _externalRouter = require('./external-router');

var _externalRouter2 = _interopRequireDefault(_externalRouter);

var _playlistRouter = require('./playlist-router');

var _playlistRouter2 = _interopRequireDefault(_playlistRouter);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

var _background = require('../cmd/background');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//global


//model
var credentials = {
    pfx: (0, _fs.readFileSync)(_ver.PFX),
    passphrase: _ver.PFX_PWD,
    ca: (0, _fs.readFileSync)(_ver.CA),
    ciphers: ["ECDHE-RSA-AES256-SHA384", "DHE-RSA-AES256-SHA384", "ECDHE-RSA-AES256-SHA256", "DHE-RSA-AES256-SHA256", "ECDHE-RSA-AES128-SHA256", "DHE-RSA-AES128-SHA256", "HIGH", "!aNULL", "!eNULL", "!EXPORT", "!DES", "!RC4", "!MD5", "!PSK", "!SRP", "!CAMELLIA"].join(':'),
    honorCipherOrder: true
};

//background


//util


//router


//external


//config

credentials.agent = new _https.Agent(credentials);
var app = (0, _express2.default)();
var server = (0, _https.createServer)(credentials, app);
(0, _sendWs.mainInit)(server);
(0, _background.autoUpload)();
(0, _background.checkMedia)();
(0, _background.updateExternal)();
(0, _background.autoDownload)();
(0, _background.updateStock)();
(0, _background.filterStock)();
(0, _background.dbBackup)();

app.use((0, _bodyParser.urlencoded)({ extended: true }));
app.use((0, _bodyParser.json)({ extended: true }));
app.use((0, _expressSession2.default)((0, _sessionTool2.default)(_expressSession2.default).config));
app.use((0, _connectMultiparty2.default)({ uploadDir: (0, _config.NAS_TMP)(_ver.ENV_TYPE) }));
app.use(_passport2.default.initialize());
app.use(_passport2.default.session());
app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    req.method === 'OPTIONS' ? res.json({ apiOK: true }) : next();
});

app.use(function (req, res, next) {
    (0, _utility.showLog)(req, next);
});

app.use('/f/api', _fileBasicRouter2.default);
//torrent
app.use('/f/api/torrent', _playlistRouter2.default);
//external&subtitle&upload
app.use('/f/api/external', _externalRouter2.default);
//file&media
app.use('/f/api/file', _fileRouter2.default);
//other&stock
app.use('/f', _fileOtherRouter2.default);
//login
app.use('/f', (0, _loginRouter2.default)());

//view
app.all('*', function (req, res, next) {
    return (0, _utility.handleError)(new _utility.HoError('page not found', { code: 404 }), next);
});

//error handle
app.use(function (err, req, res, next) {
    (0, _utility.handleError)(err, 'Send');
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
});
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.on('uncaughtException', function (err) {
    return (0, _utility.handleError)(err, 'Threw exception');
});

//client
var server0 = (0, _net.createServer)(function (c) {
    console.log('client connected');
    c.on('end', function () {
        console.log('client disconnected');
    });
    c.on('data', function (data) {
        try {
            var recvData = JSON.parse(data.toString());
            console.log('websocket: ' + recvData.send);
            (0, _sendWs2.default)(recvData.data, recvData.adultonly, recvData.auth);
        } catch (e) {
            (0, _utility.handleError)(e, 'Client');
            console.log(data);
        }
    });
}).listen((0, _config.COM_PORT)(_ver.ENV_TYPE));

server.listen((0, _config.FILE_PORT)(_ver.ENV_TYPE), (0, _config.FILE_IP)(_ver.ENV_TYPE));
console.log('start express server\n');
console.log('Server running at https://' + (0, _config.EXTENT_FILE_IP)(_ver.ENV_TYPE) + ':' + (0, _config.EXTENT_FILE_PORT)(_ver.ENV_TYPE) + ' ' + new Date());
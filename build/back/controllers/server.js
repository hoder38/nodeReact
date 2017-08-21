'use strict';

var _fs = require('fs');

var _path = require('path');

var _constants = require('../constants');

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

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _sessionTool = require('../models/session-tool');

var _sessionTool2 = _interopRequireDefault(_sessionTool);

var _loginRouter = require('./login-router');

var _loginRouter2 = _interopRequireDefault(_loginRouter);

var _homeRouter = require('./home-router');

var _homeRouter2 = _interopRequireDefault(_homeRouter);

var _basicRouter = require('./basic-router');

var _basicRouter2 = _interopRequireDefault(_basicRouter);

var _userRouter = require('./user-router');

var _userRouter2 = _interopRequireDefault(_userRouter);

var _storageRouter = require('./storage-router');

var _storageRouter2 = _interopRequireDefault(_storageRouter);

var _passwordRouter = require('./password-router');

var _passwordRouter2 = _interopRequireDefault(_passwordRouter);

var _stockRouter = require('./stock-router');

var _stockRouter2 = _interopRequireDefault(_stockRouter);

var _fitnessRouter = require('./fitness-router');

var _fitnessRouter2 = _interopRequireDefault(_fitnessRouter);

var _rankRouter = require('./rank-router');

var _rankRouter2 = _interopRequireDefault(_rankRouter);

var _bookmarkRouter = require('./bookmark-router');

var _bookmarkRouter2 = _interopRequireDefault(_bookmarkRouter);

var _parentRouter = require('./parent-router');

var _parentRouter2 = _interopRequireDefault(_parentRouter);

var _otherRouter = require('./other-router');

var _otherRouter2 = _interopRequireDefault(_otherRouter);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//global


//util


//router


//model


//constant
var credentials = {
    pfx: (0, _fs.readFileSync)(_ver.PFX),
    passphrase: _ver.PFX_PWD,
    ca: (0, _fs.readFileSync)(_ver.CA),
    ciphers: ["ECDHE-RSA-AES256-SHA384", "DHE-RSA-AES256-SHA384", "ECDHE-RSA-AES256-SHA256", "DHE-RSA-AES256-SHA256", "ECDHE-RSA-AES128-SHA256", "DHE-RSA-AES128-SHA256", "HIGH", "!aNULL", "!eNULL", "!EXPORT", "!DES", "!RC4", "!MD5", "!PSK", "!SRP", "!CAMELLIA"].join(':'),
    honorCipherOrder: true
};

//external


//config

credentials.agent = new _https.Agent(credentials);
var app = (0, _express2.default)();
var server = (0, _https.createServer)(credentials, app);
(0, _sendWs.init)();

app.use((0, _bodyParser.urlencoded)({ extended: true }));
app.use((0, _bodyParser.json)({ extended: true }));
app.use((0, _expressSession2.default)((0, _sessionTool2.default)(_expressSession2.default).config));
app.use(_passport2.default.initialize());
app.use(_passport2.default.session());
app.use(_express2.default.static(_constants.STATIC_PATH));

app.use(function (req, res, next) {
    (0, _utility.showLog)(req, next);
});

app.use('/api', _basicRouter2.default);

app.use('/api/homepage', _homeRouter2.default);

app.use('/api/user', _userRouter2.default);

app.use('/api/storage', _storageRouter2.default);

app.use('/api/password', _passwordRouter2.default);

app.use('/api/stock', _stockRouter2.default);

app.use('/api/fitness', _fitnessRouter2.default);

app.use('/api/rank', _rankRouter2.default);

app.use('/api/bookmark', _bookmarkRouter2.default);

app.use('/api/parent', _parentRouter2.default);

//other
app.use('/', _otherRouter2.default);
//login
app.use('/', (0, _loginRouter2.default)('https://' + (0, _config.EXTENT_FILE_IP)(_ver.ENV_TYPE) + ':' + (0, _config.EXTENT_FILE_PORT)(_ver.ENV_TYPE)));

//view
app.get('*', function (req, res, next) {
    console.log('view');
    var stream = (0, _fs.createReadStream)(_constants.STATIC_PATH + '/' + (0, _config.APP_HTML)(_ver.ENV_TYPE));
    stream.on('error', function (err) {
        (0, _utility.handleError)(err);
    });
    stream.pipe(res);
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

server.listen((0, _config.PORT)(_ver.ENV_TYPE), (0, _config.IP)(_ver.ENV_TYPE));
console.log('start express server\n');
console.log('Server running at https://' + (0, _config.EXTENT_IP)(_ver.ENV_TYPE) + ':' + (0, _config.EXTENT_PORT)(_ver.ENV_TYPE) + ' ' + new Date());
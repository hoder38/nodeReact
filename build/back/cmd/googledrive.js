'use strict';

var _constants = require('../constants');

var _ver = require('../../../ver');

var _googleapis = require('googleapis');

var _readline = require('readline');

var rl = (0, _readline.createInterface)({
    input: process.stdin,
    output: process.stdout
});

var oauth2Client = new _googleapis.auth.OAuth2(_ver.GOOGLE_ID, _ver.GOOGLE_SECRET, _ver.GOOGLE_REDIRECT);

var url = oauth2Client.generateAuthUrl({
    scope: _constants.GOOGLE_SCOPE,
    access_type: 'offline'
});

console.log('Visit the url: ', url);

var getAccessToken = function getAccessToken(code) {
    oauth2Client.getToken(code, function (err, tokens) {
        if (err) {
            console.log('Error while trying to retrieve access token', err);
        } else {
            console.log(tokens);
            oauth2Client.credentials = tokens;
        }
    });
};

rl.question('Enter the code here:', getAccessToken);
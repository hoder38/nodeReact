'use strict';

var _readline = require('readline');

var _tdameritradeTool = require('../models/tdameritrade-tool');

var rl = (0, _readline.createInterface)({
    input: process.stdin,
    output: process.stdout
});

console.log('Visit the url: ', (0, _tdameritradeTool.generateAuthUrl)());

var getAccessToken = function getAccessToken(code) {
    (0, _tdameritradeTool.getToken)(code).catch(function (err) {
        console.log('Error while trying to retrieve access token', err);
    });
};

rl.question('Enter the code here:', getAccessToken);
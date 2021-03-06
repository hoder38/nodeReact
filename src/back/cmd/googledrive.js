import { GOOGLE_SCOPE } from '../constants.js'
import { GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT } from '../../../ver.js'
import googleapis from 'googleapis'
const { auth } = googleapis;
import readline from 'readline'
const { createInterface } = readline;

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

const oauth2Client = new auth.OAuth2(GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT);

const url = oauth2Client.generateAuthUrl({
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
});

console.log('Visit the url: ', url);

const getAccessToken = code => {
    oauth2Client.getToken(code, (err, tokens) => {
        if (err) {
            console.log('Error while trying to retrieve access token', err);
        } else {
            console.log(tokens);
            oauth2Client.credentials = tokens;
        }
    });
};

rl.question('Enter the code here:', getAccessToken);
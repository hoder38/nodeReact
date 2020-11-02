import { createInterface } from 'readline'
import { generateAuthUrl, getToken } from '../models/tdameritrade-tool'

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log('Visit the url: ', generateAuthUrl());

const getAccessToken = code => {
    getToken(code).catch(err => {
        console.log('Error while trying to retrieve access token', err);
    });
};

rl.question('Enter the code here:', getAccessToken);
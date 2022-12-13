import { STORAGEDB } from '../constants.js'
import { ENV_TYPE } from '../../../ver.js'
import { EXTENT_FILE_IP, EXTENT_FILE_PORT } from '../config.js'
import Express from 'express'
import httpsModule from 'https'
const { request: HttpsRequest } = httpsModule;
import Mongo from '../models/mongo-tool.js'
import { handleError, HoError, checkLogin } from '../util/utility.js'

const router = Express.Router();

router.get('/refresh', function(req, res, next) {
    console.log('refresh');
    res.end('refresh');
});

router.get('/privacy', function(req, res, next) {
    console.log('privacy');
    res.end('privacy');
});

router.get('/homepage', function(req, res, next) {
    console.log('utility');
    res.end('homepage');
});

router.get('/s', function(req, res, next) {
    console.log('short');
    Mongo('find', STORAGEDB, {status: 7}, {
        sort: [[
            'utime',
            'desc',
        ]],
        limit: 1,
    }).then(items => {
        if (items.length < 1) {
            return handleError(new HoError('cannot find url'));
        }
        if (!items[0].url) {
            return handleError(new HoError('dont have url'));
        }
        const url = decodeURIComponent(items[0].url);
        res.header('Content-Type', 'text/plain');
        res.statusCode = 302;
        res.header('Location', url);
        res.end(`302. Redirecting to ${url}`);
    }).catch(err => handleError(err, next));
});

/*router.get('/subtitle/:uid/:lang/:index(\\d+|v)/:fresh(0+)?', function(req, res, next) {
    checkLogin(req, res, () => {
        console.log('subtitle');
        const subReq = HttpsRequest({
            host: EXTENT_FILE_IP(ENV_TYPE),
            port: EXTENT_FILE_PORT(ENV_TYPE),
            path: `/subtitle/${req.params.uid}/${req.params.lang}/${req.params.index}`,
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer' : req.headers['referer'],
                'User-Agent' : 'Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0',
            }
        }, sub => {
            if (sub.statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'text/vtt' });
                sub.pipe(res);
            }
        });
        subReq.end();
    });
});*/

export default router

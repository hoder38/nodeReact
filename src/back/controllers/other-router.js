import { STORAGEDB } from '../constants.js'
import Mongo from '../models/mongo-tool.js'
import Express from 'express'
import createLogger from '../util/logger.js'
import { handleError, HoError } from '../util/utility.js'

const router = Express.Router();
const log = createLogger('other-router');

router.get('/refresh', function(req, res, next) {
    log.debug('refresh endpoint hit');
    res.end('refresh');
});

router.get('/privacy', function(req, res, next) {
    log.debug('privacy endpoint hit');
    res.end('privacy');
});

router.get('/homepage', function(req, res, next) {
    log.debug('homepage endpoint hit');
    res.end('homepage');
});

router.get('/s', function(req, res, next) {
    log.debug('short URL redirect');
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

export default router

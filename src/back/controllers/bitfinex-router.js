import Express from 'express'
import BitfinexTool from '../models/bitfinex-tool.js'
import createLogger from '../util/logger.js'
import { checkLogin, handleError } from '../util/utility.js'

const router = Express.Router();
const log = createLogger('bitfinex-router');

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    log.debug('bitfinex query');
    res.json(BitfinexTool.query(Number(req.params.page), req.params.name, req.params.sortName, req.params.sortType, req.user, req.session));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    log.debug('bitfinex get single');
    res.json(BitfinexTool.query(Number(req.params.page), req.params.name, req.params.sortName, req.params.sortType, req.user, req.session));
});

router.get('/single/:sortName(name|mtime|count)/:sortType(desc|asc)/:uid/:user?', function(req, res, next) {
    log.debug('BitfinexTool single');
    res.json(BitfinexTool.query(0, null, req.params.sortName, req.params.sortType, req.user, req.session, Number(req.params.uid)));
});

router.get('/parent', function(req, res, next){
    log.debug('bitfinex parent');
    res.json(BitfinexTool.parent());
});

router.route('/bot').get(function(req, res, next) {
    log.debug('get bot');
    BitfinexTool.getBot(req.user._id).then(list => res.json(list)).catch(err => handleError(err, next));
}).put(function(req, res, next) {
    log.debug('update bot');
    log.debug({ body: req.body }, 'bot update payload');
    BitfinexTool.updateBot(req.user._id, req.body, req.user.username).then(list => res.json(list)).catch(err => handleError(err, next));
});

router.get('/bot/del/:type', function(req, res, next) {
    log.debug('del bot');
    BitfinexTool.deleteBot(req.user._id, req.params.type, req.user.username).then(list => res.json(list)).catch(err => handleError(err, next));
});

router.get('/bot/close/:credit', function(req, res, next) {
    log.debug('close credit');
    BitfinexTool.closeCredit(req.user.username, req.params.credit).then(() => res.json({apiOK: true})).catch(err => handleError(err, next));
});

export default router

import Express from 'express'
import BitfinexTool from '../models/bitfinex-tool.js'
import { checkLogin, handleError } from '../util/utility'

const router = Express.Router();

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.route('/bot').get(function(req, res, next) {
    console.log('get bot');
    BitfinexTool.getBot(req.user._id).then(list => res.json(list)).catch(err => handleError(err, next));
}).put(function(req, res, next) {
    console.log('update bot');
    console.log(req.body);
    BitfinexTool.updateBot(req.user._id, req.body).then(list => res.json(list)).catch(err => handleError(err, next));
});

router.get('/bot/del/:type', function(req, res, next) {
    console.log('del bot');
    BitfinexTool.deleteBot(req.user._id, req.params.type).then(list => res.json(list)).catch(err => handleError(err, next));
});

export default router

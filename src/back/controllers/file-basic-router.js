import Express from 'express'
import { checkLogin } from '../util/utility'

const router = Express.Router();

router.get('/testLogin', function(req, res, next) {
    checkLogin(req, res, () => res.json({apiOK: true}), 1);
});

export default router
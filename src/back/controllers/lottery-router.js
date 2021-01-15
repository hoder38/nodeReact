import Express from 'express'
import Lottery from '../models/lottery-tool.js'
import { checkLogin, isValidString, handleError, HoError } from '../util/utility.js'
import sendWs from '../util/sendWs.js'

const router = Express.Router();

let isSelecting = false;

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/get', function(req, res, next) {
    console.log('lottery get');
    Lottery.getInit(req.user._id).then(data => res.json(data)).catch(err => handleError(err, next));
});

router.get('/select/:uid', function(req, res, next) {
    console.log('lottery select');
    if (isSelecting) {
        return handleError(new HoError('someone is lotterying!!!'), next);
    }
    isSelecting = true;
    Lottery.select(req.params.uid, req.user._id).then(data => {
        isSelecting = false;
        sendWs({
            type: 'select',
            data,
        });
        res.json({apiOK: true});
    }).catch(err => {
        isSelecting = false;
        return handleError(err, next);
    });
});

router.get('/single/:uid', function(req, res, next) {
    console.log('lottery single');
    Lottery.getData(req.params.uid).then(data => res.json({item: data})).catch(err => handleError(err, next));
});

router.get('/userlist', function(req, res, next) {
    console.log('lottery userlist');
    Lottery.getData().then(data => res.json(data)).catch(err => handleError(err, next));
});

export default router
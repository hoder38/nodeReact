import { FITNESSDB } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import FitnessTool from '../models/fitness-tool.js'
import { checkLogin, handleError, getFitnessItem, checkAdmin, HoError } from '../util/utility'
import sendWs from '../util/sendWs'

const router = Express.Router();
const FitnessTagTool = TagTool(FITNESSDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('fitness');
    FitnessTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getFitnessItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('fitness get single');
    const page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        FitnessTagTool.searchTags(req.session).resetArray();
    }
    FitnessTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getFitnessItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    console.log('fitness reset');
    FitnessTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getFitnessItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

router.get('/single/:uid', function(req, res, next) {
    console.log('fitness single');
    FitnessTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getFitnessItem(req.user, [result.item])})).catch(err => handleError(err, next));
});

router.post('/getOptionTag', function(req, res,next) {
    console.log('fitness option tag');
    let optionList = new Set();
    req.body.tags.length > 0 ? FitnessTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [...optionList]});
});

router.put('/addTag/:tag', function(req, res, next) {
    console.log('fitness addTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : FitnessTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'fitness',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.put('/delTag/:tag', function(req, res, next) {
    console.log('fitness delTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : FitnessTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'fitness',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.post('/newRow', function(req, res, next) {
    console.log('new fitness');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('permission denied'), next);
    }
    FitnessTool.newRow(req.body).then(result => {
        sendWs({
            type: 'fitness',
            data: result.id,
        });
        res.json({id: result.id});
    }).catch(err => handleError(err, next));
});

router.put('/editRow/:uid', function(req, res, next) {
    console.log('edit fitness');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('permission denied'), next);
    }
    FitnessTool.editRow(req.params.uid, req.body, req.session).then(() => {
        sendWs({
            type: 'fitness',
            data: req.params.uid,
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.delete('/delRow/:uid', function(req, res, next) {
    console.log('del fitness');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('permission denied'), next);
    }
    FitnessTool.delRow(req.params.uid).then(() => {
        sendWs({
            type: 'fitness',
            data: req.params.uid,
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.get('/getPoint', function(req, res, next) {
    console.log('get fitness point');
    FitnessTool.getPoint(req.user).then(result => res.json({point: result})).catch(err => handleError(err, next));
});

router.put('/exchange/:uid', function(req, res, next) {
    console.log('exchange fitness');
    FitnessTool.exchange(req.params.uid, req.user, req.body.exchange, req.session).then(result => {
        sendWs({
            type: 'fitness',
            data: req.params.uid,
        });
        res.json({point: result});
    }).catch(err => handleError(err, next));
});

router.get('/getStat/:index?/:uid?', function(req, res, next) {
    console.log('get fitness statistic');
    FitnessTool.getStat(req.user._id, req.params.index, req.params.uid).then(result => {
        res.json(result ? result : {apiOK: true});
    }).catch(err => handleError(err, next));
});

router.get('/reset', function(req, res, next) {
    console.log('reset fitness');
    FitnessTool.resetDate(req.user._id).then(result => res.json({apiOK: true})).catch(err => handleError(err, next));
});

export default router
import { RANKDB } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import RankTool from '../models/rank-tool.js'
import { checkLogin, getRankItem, handleError, checkAdmin } from '../util/utility'
import sendWs from '../util/sendWs'

const router = Express.Router();
const RankTagTool = TagTool(RANKDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('rank');
    RankTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getRankItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('rank get single');
    const page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        RankTagTool.searchTags(req.session).resetArray();
    }
    RankTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getRankItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    console.log('rank reset');
    RankTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getRankItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

router.get('/single/:uid', function(req, res, next) {
    console.log('rank single');
    RankTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getRankItem(req.user, [result.item])})).catch(err => handleError(err, next));
});

router.post('/getOptionTag', function(req, res,next) {
    console.log('rank option tag');
    let optionList = new Set();
    req.body.tags.length > 0 ? RankTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [...optionList]});
});

router.put('/addTag/:tag', function(req, res, next) {
    console.log('rank addTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : RankTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'rank',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.put('/delTag/:tag', function(req, res, next) {
    console.log('rank delTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : RankTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'rank',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.post('/newRow', function(req, res, next) {
    console.log('new rank');
    if (!checkAdmin(1, req.user)) {
        return handleError(new HoError('permission denied'), next);
    }
    RankTool.newRow(req.body).then(result => {
        sendWs({
            type: 'rank',
            data: result.id,
        });
        res.json({id: result.id});
    }).catch(err => handleError(err, next));
});

router.delete('/delRow/:uid', function(req, res, next) {
    console.log('del rank');
    if (!checkAdmin(1, req.user)) {
        return handleError(new HoError('permission denied'), next);
    }
    RankTool.delRow(req.params.uid).then(() => {
        sendWs({
            type: 'rank',
            data: req.params.uid,
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.get('/getChart/:uid', function(req, res, next) {
    console.log('get rank chart');
    RankTool.getChart(req.params.uid, req.user, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get('/getItem', function(req, res, next) {
    console.log('get rank item');
    RankTool.getItem().then(result => res.json({item: result})).catch(err => handleError(err, next));
});

export default router
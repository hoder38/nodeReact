import { STORAGEDB, PASSWORDDB, STOCKDB, FITNESSDB, RANKDB, BITFINEX } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import { checkLogin, checkAdmin, handleError, getStorageItem, getPasswordItem, getStockItem, getFitnessItem, getRankItem } from '../util/utility'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);
const PasswordTagTool = TagTool(PASSWORDDB);
const StockTagTool = TagTool(STOCKDB);
const FitnessTagTool = TagTool(FITNESSDB);
const RankTagTool = TagTool(RANKDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

//storage
router.get(`/${STORAGEDB}/list`, function(req, res, next) {
    console.log('storage parent list');
    res.json({parentList: StorageTagTool.parentList().concat(checkAdmin(2, req.user) ? StorageTagTool.adultonlyParentList() : []).map(l => ({
        name: l.name,
        show: l.tw,
    }))});
});

router.get(`/${STORAGEDB}/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)`, function(req, res, next) {
    console.log('storage show taglist');
    StorageTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get(`/${STORAGEDB}/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?`, function(req, res, next) {
    console.log('storage parent query');
    StorageTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStorageItem(req.user, result.items, result.mediaHadle),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${STORAGEDB}/add`, function(req, res,next) {
    console.log('storage parent add');
    StorageTagTool.addParent(req.body.name, req.body.tag, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${STORAGEDB}/del/:id`, function(req, res, next) {
    console.log('storage parent del');
    StorageTagTool.delParent(req.params.id, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

//password
router.get(`/${PASSWORDDB}/list`, function(req, res, next) {
    console.log('password parent list');
    res.json({parentList: PasswordTagTool.parentList().map(l => ({
        name: l.name,
        show: l.tw,
    }))});
});

router.get(`/${PASSWORDDB}/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)`, function(req, res, next) {
    console.log('password show taglist');
    PasswordTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get(`/${PASSWORDDB}/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?`, function(req, res, next) {
    console.log('password parent query');
    PasswordTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${PASSWORDDB}/add`, function(req, res,next) {
    console.log('password parent add');
    PasswordTagTool.addParent(req.body.name, req.body.tag, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${PASSWORDDB}/del/:id`, function(req, res, next) {
    console.log('storage parent del');
    PasswordTagTool.delParent(req.params.id, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

//stock
router.get(`/${STOCKDB}/list`, function(req, res, next) {
    console.log('stock parent list');
    res.json({parentList: StockTagTool.parentList().map(l => ({
        name: l.name,
        show: l.tw,
    }))});
});

router.get(`/${STOCKDB}/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)`, function(req, res, next) {
    console.log('stock show taglist');
    StockTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get(`/${STOCKDB}/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?`, function(req, res, next) {
    console.log('stock parent query');
    StockTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStockItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${STOCKDB}/add`, function(req, res,next) {
    console.log('stock parent add');
    StockTagTool.addParent(req.body.name, req.body.tag, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${STOCKDB}/del/:id`, function(req, res, next) {
    console.log('stock parent del');
    StockTagTool.delParent(req.params.id, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

//fitness
router.get(`/${FITNESSDB}/list`, function(req, res, next) {
    console.log('fitness parent list');
    res.json({parentList: FitnessTagTool.parentList().map(l => ({
        name: l.name,
        show: l.tw,
    }))});
});

router.get(`/${FITNESSDB}/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)`, function(req, res, next) {
    console.log('fitness show taglist');
    FitnessTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get(`/${FITNESSDB}/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?`, function(req, res, next) {
    console.log('fitness parent query');
    FitnessTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getFitnessItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${FITNESSDB}/add`, function(req, res,next) {
    console.log('fitness parent add');
    FitnessTagTool.addParent(req.body.name, req.body.tag, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${FITNESSDB}/del/:id`, function(req, res, next) {
    console.log('fitness parent del');
    FitnessTagTool.delParent(req.params.id, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

//rank
router.get(`/${RANKDB}/list`, function(req, res, next) {
    console.log('rank parent list');
    res.json({parentList: RankTagTool.parentList().map(l => ({
        name: l.name,
        show: l.tw,
    }))});
});

router.get(`/${RANKDB}/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)`, function(req, res, next) {
    console.log('rank show taglist');
    RankTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get(`/${RANKDB}/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?`, function(req, res, next) {
    console.log('rank parent query');
    RankTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getRankItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${RANKDB}/add`, function(req, res,next) {
    console.log('rank parent add');
    RankTagTool.addParent(req.body.name, req.body.tag, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${RANKDB}/del/:id`, function(req, res, next) {
    console.log('rank parent del');
    RankTagTool.delParent(req.params.id, req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

export default router
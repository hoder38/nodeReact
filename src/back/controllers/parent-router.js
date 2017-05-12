import { STORAGEDB } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import { checkLogin, checkAdmin, handleError, getStorageItem } from '../util/utility'

const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

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

export default router
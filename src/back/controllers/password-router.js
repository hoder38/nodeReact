import { PASSWORDDB } from '../constants.js'
import Express from 'express'
import TagTool from '../models/tag-tool.js'
import PasswordTool from '../models/password-tool.js'
import { checkLogin, handleError, getPasswordItem } from '../util/utility.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js'

const log = createLogger('password-router');
const router = Express.Router();
const PasswordTagTool = TagTool(PASSWORDDB);

// All password routes require authenticated session
router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

/**
 * GET /get/:sortName/:sortType/:page/:name?/:exactly?/:index?
 * Paginated password list with tag-based filtering and sorting.
 */
router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    log.debug({ sort: req.params.sortName, page: req.params.page, name: req.params.name }, 'list passwords');
    PasswordTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

/**
 * GET /getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?
 * Single-page password query; resets search array on first page with name filter.
 */
router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    log.debug({ sort: req.params.sortName, page: req.params.page, name: req.params.name }, 'get single page');
    const page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        PasswordTagTool.searchTags(req.session).resetArray();
    }
    PasswordTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

/**
 * GET /reset/:sortName/:sortType
 * Reset search state and return fresh results.
 */
router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    log.debug({ sort: req.params.sortName }, 'reset password query');
    PasswordTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

/**
 * GET /single/:uid
 * Retrieve a single password entry by ID (metadata only, not decrypted).
 */
router.get('/single/:uid', function(req, res, next) {
    log.debug({ id: req.params.uid }, 'get single entry');
    PasswordTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getPasswordItem(req.user, [result.item])})).catch(err => handleError(err, next));
});

/**
 * POST /getOptionTag
 * Get related tags for auto-complete suggestions based on current tag selection.
 */
router.post('/getOptionTag', function(req, res,next) {
    log.debug({ tagCount: req.body.tags?.length }, 'get option tags');
    let optionList = new Set();
    req.body.tags.length > 0 ? PasswordTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [...optionList]});
});

/**
 * PUT /addTag/:tag
 * Add a tag to multiple password entries (body.uids). Sends WebSocket updates.
 */
router.put('/addTag/:tag', function(req, res, next) {
    log.debug({ tag: req.params.tag, count: req.body.uids?.length }, 'add tag to entries');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : PasswordTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'password',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

/**
 * PUT /delTag/:tag
 * Remove a tag from multiple password entries (body.uids). Sends WebSocket updates.
 */
router.put('/delTag/:tag', function(req, res, next) {
    log.debug({ tag: req.params.tag, count: req.body.uids?.length }, 'delete tag from entries');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : PasswordTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'password',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

/**
 * POST /newRow
 * Create a new password entry. Sends WebSocket notification on success.
 */
router.post('/newRow', function(req, res, next) {
    log.info({ name: req.body.name }, 'creating new password entry');
    PasswordTool.newRow(req.body, req.user).then(result => {
        sendWs({
            type: 'password',
            data: result.id,
        });
        log.info({ id: result.id }, 'password entry created via API');
        res.json({id: result.id});
    }).catch(err => handleError(err, next));
});

/**
 * PUT /editRow/:uid
 * Update an existing password entry. Sends WebSocket notification on success.
 */
router.put('/editRow/:uid', function(req, res, next) {
    log.info({ id: req.params.uid }, 'editing password entry');
    PasswordTool.editRow(req.params.uid, req.body, req.user, req.session).then(() => {
        sendWs({
            type: 'password',
            data: req.params.uid,
        });
        log.info({ id: req.params.uid }, 'password entry edited via API');
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

/**
 * PUT /delRow/:uid
 * Delete a password entry. Sends WebSocket notification on success.
 */
router.put('/delRow/:uid', function(req, res, next) {
    log.info({ id: req.params.uid }, 'deleting password entry');
    PasswordTool.delRow(req.params.uid, req.body.userPW, req.user).then(() => {
        sendWs({
            type: 'password',
            data: req.params.uid,
        });
        log.info({ id: req.params.uid }, 'password entry deleted via API');
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

/**
 * PUT /getPW/:uid/:type?
 * Decrypt and return a stored password.
 * type='pre' returns previous password, otherwise returns current password.
 */
router.put('/getPW/:uid/:type?', function(req, res, next) {
    log.debug({ id: req.params.uid, type: req.params.type || 'current' }, 'decrypt password request');
    PasswordTool.getPassword(req.params.uid, req.body.userPW, req.user, req.session, req.params.type).then(result => res.json({password: result.password})).catch(err => handleError(err, next));
});

/**
 * GET /generate/:type
 * Generate a random 16-character password.
 * type: 3=digits, 2=alphanumeric, 1=alphanumeric+special
 */
router.get('/generate/:type(\\d)', function(req, res, next) {
    log.debug({ type: req.params.type }, 'generate random password');
    res.json({password: PasswordTool.generatePW(Number(req.params.type))});
});

export default router
import { PASSWORDDB } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import PasswordTool from '../models/password-tool.js'
import { checkLogin, handleError, getPasswordItem } from '../util/utility'
import sendWs from '../util/sendWs'

const router = Express.Router();
const PasswordTagTool = TagTool(PASSWORDDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('password');
    PasswordTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('password get single');
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

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    console.log('password reset');
    PasswordTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

router.get('/single/:uid', function(req, res, next) {
    console.log('password single');
    PasswordTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getPasswordItem(req.user, [result.item])})).catch(err => handleError(err, next));
});

router.post('/getOptionTag', function(req, res,next) {
    console.log('password option tag');
    let optionList = new Set();
    req.body.tags.length > 0 ? PasswordTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [...optionList]});
});

router.put('/addTag/:tag', function(req, res, next) {
    console.log('password addTag');
    Promise.all(req.body.uids.map(u => PasswordTagTool.addTag(u, req.params.tag, req.user, false))).then(result => {
        result.forEach(r => {
            if (r.id) {
                sendWs({
                    type: 'password',
                    data: r.id,
                });
            }
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.put('/delTag/:tag', function(req, res, next) {
    console.log('password delTag');
    Promise.all(req.body.uids.map(u => PasswordTagTool.delTag(u, req.params.tag, req.user, false))).then(result => {
        result.forEach(r => {
            if (r.id) {
                sendWs({
                    type: 'password',
                    data: r.id,
                });
            }
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.post('/newRow', function(req, res, next) {
    console.log('new password');
    PasswordTool.newRow(req.body, req.user).then(result => {
        sendWs({
            type: 'password',
            data: result.id,
        });
        res.json({id: result.id});
    }).catch(err => handleError(err, next));
});

router.put('/editRow/:uid', function(req, res, next) {
    console.log('edit password');
    PasswordTool.editRow(req.params.uid, req.body, req.user, req.session).then(() => {
        sendWs({
            type: 'password',
            data: req.params.uid,
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.put('/delRow/:uid', function(req, res, next) {
    console.log('del password');
    PasswordTool.delRow(req.params.uid, req.body.userPW, req.user).then(() => {
        sendWs({
            type: 'password',
            data: req.params.uid,
        });
        res.json({apiOK: true});
    }).catch(err => handleError(err, next));
});

router.put('/getPW/:uid/:type?', function(req, res, next) {
    console.log('get password');
    PasswordTool.getPassword(req.params.uid, req.body.userPW, req.user, req.session, req.params.type).then(result => res.json({password: result.password})).catch(err => handleError(err, next));
});

router.get('/generate/:type(\\d)', function(req, res, next) {
    console.log('generate password');
    res.json({password: PasswordTool.generatePW(Number(req.params.type))});
});

export default router
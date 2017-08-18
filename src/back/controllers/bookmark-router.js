import { STORAGEDB, GENRE_LIST_CH, PASSWORDDB, STOCKDB, FITNESSDB, RANKDB } from '../constants'
import Express from 'express'
import { createHash } from 'crypto'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import { checkLogin, handleError, HoError, checkAdmin, isValidString, getStorageItem, getPasswordItem, getStockItem, getFitnessItem, getRankItem } from '../util/utility'
import { addPost } from '../util/mime'
import Mongo, { objectID } from '../models/mongo-tool'
import GoogleApi from '../models/api-tool-google'
import sendWs from '../util/sendWs'

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
router.get(`/${STORAGEDB}/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?`, function (req, res, next) {
    console.log('get storage bookmark list');
    StorageTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(result => res.json({bookmarkList: result.bookmarkList})).catch(err => handleError(err, next));
});

router.get(`/${STORAGEDB}/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('get storage bookmark');
    StorageTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStorageItem(req.user, result.items, result.mediaHadle),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${STORAGEDB}/add`, function (req, res, next) {
    console.log('storage add bookmark');
    const name = isValidString(req.body.name, 'name', 'name is not vaild');
    StorageTagTool.addBookmark(name, req.user, req.session).then(result => {
        const parentList = StorageTagTool.searchTags(req.session).getArray();
        if (parentList.cur.length <= 0) {
            handleError(new HoError('empty parent list!!!'));
        }
        return newBookmarkItem(name, req.user, req.session, parentList.cur, parentList.exactly).then(([bid, bname, select, option]) => res.json(Object.assign(result, bid ? {
            bid,
            bname,
            other: [],
        } : {}, select ? {select} : {}, option ? {option} : {})));
    }).catch(err => handleError(err, next));
});

function newBookmarkItem(name, user, session, bpath, bexactly) {
    const bookmark_md5 = createHash('md5').update(bpath.map((b, i) => bexactly[i] ? `${b}/1` : `${b}/0`).join('/')).digest('hex');
    return Mongo('count', STORAGEDB, {bmd5: bookmark_md5}).then(count => {
        if (count > 0) {
            return [null, null, null, null];
        }
        //000開頭讓排序在前
        if (isDefaultTag(normalize(name))) {
            name = addPost(name, '1');
        }
        let data = {
            _id: objectID(),
            owner: user._id,
            utime: Math.round(new Date().getTime() / 1000),
            bmd5: bookmark_md5,
            btag: bpath,
            bexactly,
            size: 0,
            count: 0,
            first: 1,
            recycle: 0,
            adultonly: 0,
            untag: 1,
            status: 8,
        };
        let setTag = new Set(['bookmark', '書籤']);
        setTag.add(normalize(name)).add(normalize(user.username));
        let channel = false;
        bpath.forEach(b => {
            const normal = normalize(b);
            let is_d = isDefaultTag(normal);
            if (!is_d) {
                setTag.add(normal);
            } else if (is_d.index === 0) {
                data['adultonly'] = 1;
            } else if (is_d.index === 30) {
                is_d = isDefaultTag(b);
                if (is_d[1] === 'ch') {
                    channel = is_d[2];
                }
            }
        });
        StorageTagTool.searchTags(session).getArray().cur.forEach(p => {
            const normal = normalize(p);
            const is_d = isDefaultTag(normal);
            if (!is_d) {
                setTag.add(normal);
            } else if (is_d.index === 0) {
                data['adultonly'] = 1;
            }
        });
        const getChannel = () => channel ? GoogleApi('y channel', {id: channel}).then(metadata => {
            const bookName = `000 Channel ${name}`;
            setTag.add(normalize(bookName)).add('channel').add('youtube').add('頻道');
            data['name'] = bookName;
            let keywords = metadata.items[0].brandingSettings.channel.keywords;
            if (keywords) {
                keywords = keywords.split(',');
                if (keywords.length === 1) {
                    const k1 = keywords[0].match(/\"[^\"]+\"/g);
                    keywords = keywords[0].replace(/\"[^\"]+\"/g,'').trim().split(/[\s]+/);
                    k1.forEach(k => keywords.push(k.match(/[^\"]+/)[0]));
                }
                keywords.forEach(k => setTag.add(normalize(k)));
            }
            return bookName;
        }) : StorageTagTool.getRelativeTag(bpath, user, [], bexactly).then(btags => {
            btags.forEach(b => setTag.add(normalize(b)));
            const bookName = `000 Bookmark ${name}`;
            setTag.add(normalize(bookName));
            data['name'] = bookName;
            return bookName;
        });
        return getChannel().then(bname => {
            let setArr = [];
            setTag.forEach(s => {
                const is_d = isDefaultTag(s);
                if (!is_d) {
                    setArr.push(s);
                } else if (is_d.index === 0) {
                    data['adultonly'] = 1;
                }
            });
            data['tags'] = setArr;
            data[user._id] = setArr;
            return Mongo('insert', STORAGEDB, data).then(item => {
                console.log(item);
                console.log('save end');
                sendWs({
                    type: 'file',
                    data: item[0]._id,
                }, item[0].adultonly);
                let opt = [];
                for (let g of GENRE_LIST_CH) {
                    if (!setArr.includes(g)) {
                        opt.push(g);
                    }
                }
                return StorageTagTool.getRelativeTag(setArr, user, opt).then(relative => {
                    const reli = relative.length < 5 ? relative.length : 5;
                    if (checkAdmin(2, user)) {
                        item[0].adultonly === 1 ? setArr.push('18+') : opt.push('18+');
                    }
                    item[0].first === 1 ? setArr.push('first item') : opt.push('first item');
                    for (let i = 0; i < reli; i++) {
                        const normal = normalize(relative[i]);
                        if (!isDefaultTag(normal)) {
                            if (!setArr.includes(normal)&& !opt.includes(normal)) {
                                opt.push(normal);
                            }
                        }
                    }
                    return [
                        item[0]._id,
                        bname,
                        setArr,
                        opt,
                    ];
                });
            });
        });
    });
}

router.delete(`/${STORAGEDB}/del/:id`, function (req, res, next) {
    console.log('del storage bookmark');
    StorageTagTool.delBookmark(req.params.id).then(result => res.json({id: result.id})).catch(err => handleError(err, next));
});

router.get(`/${STORAGEDB}/set/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('set storage bookmark');
    Mongo('find', STORAGEDB, {
        _id: isValidString(req.params.id, 'uid', 'bookmark is not vaild'),
        status: 8,
    }, {limit: 1}).then(items => {
        if (items.length < 1 || !items[0].btag || !items[0].bexactly) {
            handleError(new HoError('can not find object!!!'));
        }
        return StorageTagTool.setLatest(items[0]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$inc: {count: 1}})).then(() => StorageTagTool.setBookmark(items[0].btag, items[0].bexactly, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
            itemList: getStorageItem(req.user, result.items, result.mediaHadle),
            parentList: result.parentList,
            latest: result.latest,
        })));
    }).catch(err => handleError(err, next));
});

router.post(`/${STORAGEDB}/subscript/:id`, function(req, res, next) {
    console.log('subscipt storage bookmark');
    if (req.body.path.length <= 0 || req.body.exactly.length <= 0) {
        handleError(new HoError('empty parent list!!!'));
    }
    const name = isValidString(req.body.name, 'name', 'name is not vaild');
    const id = req.params.id.match(/^(you|ypl|kub|yif|mad|bbl|c99)_(.*)$/) ? isValidString(req.params.id, 'name', 'youtube is not vaild') : isValidString(req.params.id, 'uid', 'uid is not vaild');
    const bpath = req.body.path.map(p => isValidString(p, 'name', 'path name is not vaild'));
    const bexactly = req.body.exactly.map(e => e ? true : false);
    StorageTagTool.addBookmark(name, req.user, req.session, bpath, bexactly).then(result => newBookmarkItem(name, req.user, req.session, bpath, bexactly).then(([bid, bname, select, option]) => {
        StorageTagTool.setLatest(id, req.session).then(() => Mongo('update', STORAGEDB, {_id: id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
        res.json(Object.assign(result, bid ? {
            bid,
            bname,
            other: [],
        } : {}, select ? {select} : {}, option ? {option} : {}));
    })).catch(err => handleError(err, next));
});

//password
router.get(`/${PASSWORDDB}/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?`, function (req, res, next) {
    console.log('get password bookmark list');
    PasswordTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(result => res.json({bookmarkList: result.bookmarkList})).catch(err => handleError(err, next));
});

router.get(`/${PASSWORDDB}/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('get password bookmark');
    PasswordTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getPasswordItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${PASSWORDDB}/add`, function (req, res, next) {
    console.log('password add bookmark');
    PasswordTagTool.addBookmark(isValidString(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${PASSWORDDB}/del/:id`, function (req, res, next) {
    console.log('del password bookmark');
    PasswordTagTool.delBookmark(req.params.id).then(result => res.json({id: result.id})).catch(err => handleError(err, next));
});

//stock
router.get(`/${STOCKDB}/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?`, function (req, res, next) {
    console.log('get stock bookmark list');
    StockTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(result => res.json({bookmarkList: result.bookmarkList})).catch(err => handleError(err, next));
});

router.get(`/${STOCKDB}/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('get stock bookmark');
    StockTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStockItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${STOCKDB}/add`, function (req, res, next) {
    console.log('stock add bookmark');
    StockTagTool.addBookmark(isValidString(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${STOCKDB}/del/:id`, function (req, res, next) {
    console.log('del stock bookmark');
    StockTagTool.delBookmark(req.params.id).then(result => res.json({id: result.id})).catch(err => handleError(err, next));
});

//fitness
router.get(`/${FITNESSDB}/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?`, function (req, res, next) {
    console.log('get fitness bookmark list');
    FitnessTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(result => res.json({bookmarkList: result.bookmarkList})).catch(err => handleError(err, next));
});

router.get(`/${FITNESSDB}/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('get fitness bookmark');
    FitnessTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getFitnessItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${FITNESSDB}/add`, function (req, res, next) {
    console.log('fitness add bookmark');
    FitnessTagTool.addBookmark(isValidString(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${FITNESSDB}/del/:id`, function (req, res, next) {
    console.log('del fitness bookmark');
    FitnessTagTool.delBookmark(req.params.id).then(result => res.json({id: result.id})).catch(err => handleError(err, next));
});

//rank
router.get(`/${RANKDB}/getList/:sortName(name|mtime)/:sortType(desc|asc)/:page(0)?`, function (req, res, next) {
    console.log('get rank bookmark list');
    RankTagTool.getBookmarkList(req.params.sortName, req.params.sortType, req.user).then(result => res.json({bookmarkList: result.bookmarkList})).catch(err => handleError(err, next));
});

router.get(`/${RANKDB}/get/:id/:sortName(name|mtime|count)/:sortType(desc|asc)`, function (req, res, next) {
    console.log('get rank bookmark');
    RankTagTool.getBookmark(req.params.id, req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getRankItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.post(`/${RANKDB}/add`, function (req, res, next) {
    console.log('rank add bookmark');
    RankTagTool.addBookmark(isValidString(req.body.name, 'name', 'name is not vaild'), req.user, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.delete(`/${RANKDB}/del/:id`, function (req, res, next) {
    console.log('del rank bookmark');
    RankTagTool.delBookmark(req.params.id).then(result => res.json({id: result.id})).catch(err => handleError(err, next));
});

export default router
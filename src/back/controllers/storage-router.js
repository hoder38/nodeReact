import { STORAGEDB, RELATIVE_LIMIT, ADULT_LIST, GENRE_LIST_CH, GAME_LIST_CH, MUSIC_LIST } from '../constants'
import Express from 'express'
import { checkLogin, handleError, handleReject, checkAdmin, isValidString, selectRandom, getStorageItem, HoError } from '../util/utility'
import TagTool from '../models/tag-tool'
import GoogleApi from '../models/api-tool-google'
import External from '../models/external-tool'
import Mongo from '../models/mongo-tool'
import Redis from '../models/redis-tool'
import { getOptionTag, isImage, isMusic, isVideo, isDoc, isZipbook } from '../util/mime'
import sendWs from '../util/sendWs'

const OPTION_TAG = getOptionTag();
const router = Express.Router();
const StorageTagTool = TagTool(STORAGEDB);

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    console.log('storage reset');
    StorageTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStorageItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('storage');
    StorageTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStorageItem(req.user, result.items, result.mediaHadle),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('storage get single');
    const page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        StorageTagTool.searchTags(req.session).resetArray();
    }
    StorageTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStorageItem(req.user, result.items, result.mediaHadle),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getRandom/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)', function(req, res, next){
    console.log('storage random');
    Redis('hgetall', `tag: ${req.user._id}`).then(items => {
        const count_list = OPTION_TAG.map(t => {
            let ret = 1;
            for(let i in items) {
                if (i === t) {
                    ret += Number(items[i]);
                    break;
                }
            }
            return ret;
        });
        return count_list;
    }).then(count => {
        const choose = selectRandom(count);
        const genre = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43];
        const music_genre = [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
        const game_genre = [0, 4, 12, 24, 25, 42, 44, 45, 46, 47, 48, 49, 50];
        let random_tag = [OPTION_TAG[choose]];
        if (choose === 0) {
            random_tag.push(OPTION_TAG[selectRandom(count, [1, 2])]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose > 0 && choose < 3) {
            //pic type
            random_tag.splice(0, 0, OPTION_TAG[0]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose === 3) {
            //pic book
            random_tag.splice(0, 0, OPTION_TAG[0]);
            random_tag.push(OPTION_TAG[selectRandom(count, [1, 2])]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose === 4) {
            //video
            random_tag.push(OPTION_TAG[selectRandom(count, [5, 6, 7])]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose === 6) {
            //video type && video cate
            var mtype = selectRandom(count, [5, 6, 7]);
            if (mtype === 6) {
                random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
            } else {
                random_tag.splice(0, 0, OPTION_TAG[mtype]);
            }
            random_tag.splice(0, 0, OPTION_TAG[4]);
        } else if (choose > 4 && choose < 8) {
            //video type
            random_tag.splice(0, 0, OPTION_TAG[4]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose === 8) {
            //audio
            random_tag.push(OPTION_TAG[selectRandom(count, [9, 10, 11])]);
            random_tag.push(OPTION_TAG[selectRandom(count, music_genre)]);
        } else if (choose === 10) {
            //audio type && video cate
            var mtype = selectRandom(count, [4, 8]);
            if (mtype === 4) {
                random_tag.splice(0, 0, OPTION_TAG[selectRandom(count, [5, 6, 7])]);
                random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
            } else {
                random_tag.push(OPTION_TAG[selectRandom(count, music_genre)]);
            }
            random_tag.splice(0, 0, OPTION_TAG[mtype]);
        } else if (choose > 8 && choose < 12) {
            //audio type
            random_tag.splice(0, 0, OPTION_TAG[8]);
            random_tag.push(OPTION_TAG[selectRandom(count, music_genre)]);
        } else if (choose === 12) {
            //doc
            random_tag.push(OPTION_TAG[selectRandom(count, [13, 14, 17, 18])]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose > 12 && choose < 15 || choose > 16 && choose < 19) {
            //doc type
            random_tag.splice(0, 0, OPTION_TAG[12]);
            random_tag.push(OPTION_TAG[selectRandom(count, genre)]);
        } else if (choose === 15) {
            //pre
        } else if (choose === 16) {
            //sheet
        } else if (choose === 19) {
            //url
            random_tag.push(OPTION_TAG[selectRandom(count, [20, 21])]);
        } else if (choose > 19 && choose < 22) {
            //url type
            random_tag.splice(0, 0, OPTION_TAG[19]);
        } else if (choose === 22) {
            //zip
            random_tag.push(OPTION_TAG[23]);
        } else if (choose === 23) {
            //zip type
            random_tag.splice(0, 0, OPTION_TAG[22]);
        } else if (choose === 24 || choose === 25 || choose === 40) {
            //g m 9
            const mtype = selectRandom(count, game_genre);
            if (mtype > 23) {
                random_tag.splice(0, 0, '遊戲');
            } else{
                random_tag.splice(0, 0, OPTION_TAG[mtype === 0 ? 2 : mtype === 4 ? selectRandom(count, [5, 6, 7]) : selectRandom(count, [13, 14])]);
                random_tag.splice(0, 0, OPTION_TAG[mtype]);
            }
        } else if (choose > 23 && choose < 44) {
            const mtype = selectRandom(count, [0, 4, 12]);
            random_tag.splice(0, 0, OPTION_TAG[mtype === 0 ? 2 : mtype === 4 ? selectRandom(count, [5, 6, 7]) : selectRandom(count, [13, 14])]);
            random_tag.splice(0, 0, OPTION_TAG[mtype]);
        } else if (choose > 43 && choose < 51) {
            random_tag.splice(0, 0, '遊戲');
        } else if (choose > 50 && choose < 72) {
            random_tag.splice(0, 0, OPTION_TAG[selectRandom(count, [9, 10, 11])]);
            random_tag.splice(0, 0, OPTION_TAG[8]);
        } else {
            random_tag.splice(0, 0, '18+');
        }
        if (random_tag[0] === '影片') {
            let mtype = 0;
            if (random_tag[1] === '電影') {
                mtype = selectRandom([10, 1, 1, 1, 1]);
                if (mtype === 3) {
                    //yify
                    random_tag = ['yify movie', 'no local', random_tag.splice(random_tag.length -1, 1)[0]];
                } else if (mtype === 4) {
                    //bilibili
                    random_tag = ['bilibili movie', 'no local'];
                }
            } else if (random_tag[1] === '動畫') {
                mtype = selectRandom([8, 1, 1, 1]);
                if (mtype === 3) {
                    //bilibili
                    random_tag = ['bilibili animation', 'no local'];
                }
            } else if (random_tag[1] === '電視劇') {
                mtype = selectRandom([8, 1, 1]);
            }
            if (mtype === 1) {
                random_tag = ['youtube video', 'no local'];
            } else if (mtype === 2) {
                random_tag = ['youtube playlist', 'no local'];
            }
        } else if (random_tag[0] === '圖片' && (random_tag[1] === '漫畫' || random_tag[2] === '漫畫')) {
            const mtype = selectRandom([4, 1]);
            if (mtype === 1) {
                random_tag = ['cartoonmad comic', 'no local', OPTION_TAG[selectRandom(count, [24, 25, 27, 28, 32, 34, 35, 37, 38, 39, 40])]];
            }
        } else if (random_tag[0] === '音頻') {
            const mtype = selectRandom([4, 1, 1]);
            if (mtype === 1) {
                random_tag = ['music','youtube music', 'no local'];
            } else if (mtype === 2) {
                random_tag = ['music','youtube music playlist', 'no local'];
            }
        }
        return random_tag;
    }).then(random => {
        StorageTagTool.searchTags(req.session).setArray('', random, random.map(t => true));
        return StorageTagTool.tagQuery(0, null, null, null, req.params.sortName, req.params.sortType, req.user, req.session);
    }).then(result => res.json({
        itemList: getStorageItem(req.user, result.items, result.mediaHadle),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/single/:uid', function(req, res, next) {
    console.log('storage single');
    StorageTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getStorageItem(req.user, [result.item], result.mediaHadle)[0]})).catch(err => handleError(err, next));
});

router.get('/external/get/:sortName(name|mtime|count)/:pageToken?', function(req, res, next) {
    console.log('external get');
    const parentList = StorageTagTool.searchTags(req.session).getArray();
    const index = req.params.pageToken ? Number(req.params.pageToken.match(/^\d+/)) : 1;
    const pageToken = req.params.pageToken ? req.params.pageToken.match(/[^\d]+$/) : false;
    let itemList = [];
    External.getSingleList('kubo', StorageTagTool.getKuboQuery(parentList.cur, req.params.sortName, index)).then(list => itemList = list.map(item => ({
        name: item.name,
        id: `kub_${item.id}`,
        tags: [...item.tags, 'first item'],
        recycle: 0,
        isOwn: false,
        utime: new Date(item.date).getTime()/1000,
        thumb: item.thumb,
        noDb: true,
        status: 3,
        count: item.count,
    }))).then(() => External.getSingleList('yify', StorageTagTool.getYifyQuery(parentList.cur, req.params.sortName, index))).then(list => itemList = [...itemList, ...list.map(item => ({
        name: item.name,
        id: `yif_${item.id}`,
        tags: [...item.tags, 'first item'],
        recycle: 0,
        isOwn: false,
        utime: new Date(item.date).getTime()/1000,
        thumb: item.thumb,
        noDb: true,
        status: 3,
        count: item.rating,
    }))]).then(() => External.getSingleList('bilibili', StorageTagTool.getBiliQuery(parentList.cur, req.params.sortName, index))).then(list => itemList = [...itemList, ...list.map(item => ({
        name: item.name,
        id: `bbl_${item.id}`,
        tags: [...item.tags, 'first item'],
        recycle: 0,
        isOwn: false,
        utime: item.date,
        thumb: item.thumb,
        noDb: true,
        status: 3,
        count: item.count,
    }))]).then(() => External.getSingleList('bilibili', StorageTagTool.getBiliQuery(parentList.cur, req.params.sortName, index, true))).then(list => itemList = [...itemList, ...list.map(item => ({
        name: item.name,
        id: `bbl_${item.id}`,
        tags: [...item.tags, 'first item'],
        recycle: 0,
        isOwn: false,
        utime: item.date,
        thumb: item.thumb,
        noDb: true,
        status: 3,
        count: item.count,
    }))]).then(() => {
        const query = StorageTagTool.getMadQuery(parentList.cur, req.params.sortName, index);
        return query.post ? External.getSingleList('cartoonmad', query.url, query.post) : External.getSingleList('cartoonmad', query);
    }).then(list => itemList = [...itemList, ...list.map(item => ({
        name: item.name,
        id: `mad_${item.id}`,
        tags: [...item.tags, 'first item'],
        recycle: 0,
        isOwn: false,
        utime: 0,
        thumb: item.thumb,
        noDb: true,
        status: 2,
        count: 0,
    }))]).then(() => StorageTagTool.getYoutubeQuery(parentList.cur, req.params.sortName, pageToken)).then(query => query ? GoogleApi('y search', query).then(data => GoogleApi('y video', {id: data.video}).then(list => {
        itemList = [...itemList, ...getYoutubeItem(list, data.type)];
        return GoogleApi('y playlist', {id: data.playlist})
    }).then(list => res.json({
        itemList: [...itemList, ...getYoutubeItem(list, data.type)],
        pageToken: data.nextPageToken ? `${index + 1}${data.nextPageToken}` : `${index + 1}`,
    }))) : res.json({
        itemList: itemList,
        pageToken: `${index + 1}`,
    })).catch(err => handleError(err, next));
});

function getYoutubeItem(items, type) {
    let itemList = [];
    for (let i of items) {
        if (i.snippet) {
            itemList.push({
                name: i.kind === 'youtube#playlist' ? `${i.snippet.title} [playlist]` : i.snippet.title,
                id: i.kind === 'youtube#playlist' ? `ypl_${i.id}` : `you_${i.id}`,
                tags: i.snippet.tags ? [...i.snippet.tags , 'first item'] : ['first item'],
                recycle: 0,
                isOwn: false,
                utime: new Date(i.snippet.publishedAt.match(/^\d\d\d\d-\d\d-\d\d/)[0]).getTime()/1000,
                thumb: i.snippet.thumbnails.default ? i.snippet.thumbnails.default.url : i.snippet.thumbnails.standard.url,
                cid: i.snippet.channelId,
                ctitle: i.snippet.channelTitle,
                noDb: true,
                count: i.statistics ? i.statistics.viewCount : 301,
                status: ((i.kind === 'youtube#playlist' && Math.floor(type/10) === 2) || (i.kind !== 'youtube#playlist' && type%10 === 2)) ? 4 : 3,
            });
        }
    }
    return itemList;
}

router.post('/getOptionTag', function(req, res, next) {
    console.log('storage option tag');
    let optionList = checkAdmin(2, req.user) ? new Set(['first item', '18+']) : new Set(['first item']);
    req.body.tags.length > 0 ? StorageTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        if (req.body.tags.includes('18+')) {
            ADULT_LIST.forEach(a => optionList.add(a));
        } else if (req.body.tags.includes('game') || req.body.tags.includes('遊戲')) {
            GAME_LIST_CH.forEach(g => optionList.add(g));
        } else if (req.body.tags.includes('audio') || req.body.tags.includes('音頻')) {
            MUSIC_LIST.forEach(m => optionList.add(m));
        } else {
            GENRE_LIST_CH.forEach(g => optionList.add(g));
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [
        ...optionList,
        ...GENRE_LIST_CH,
    ]});
});

router.put('/addTag/:tag', function(req, res, next) {
    console.log('storage addTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : StorageTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'file',
                data: result.id,
            }, result.adultonly);
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.put('/sendTag/:uid', function(req, res, next){
    console.log('storage sendTag');
    StorageTagTool.sendTag(req.params.uid, req.body.name, req.body.tags, req.user).then(result => {
        sendWs({
            type: 'file',
            data: result.id,
        }, result.adultonly);
        res.json(result);
    }).catch(err => handleError(err, next));
});

router.put('/addTagUrl', function(req, res, next) {
    console.log('storage addTagUrl');
    const url = isValidString(req.body.url, 'url');
    if (!url) {
        handleError(new HoError('invalid tag url'), next);
    }
    const getTaglist = () => {
        if (req.body.url.match(/^(http|https):\/\/store\.steampowered\.com\/app\//)) {
            console.log('steam');
            return External.parseTagUrl('steam', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/www\.imdb\.com\/title\//)) {
            console.log('imdb');
            return External.parseTagUrl('imdb', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/www\.allmusic\.com\//)) {
            console.log('allmusic');
            return External.parseTagUrl('allmusic', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/marvel\.wikia\.com\/wiki\//)) {
            console.log('marvel');
            return External.parseTagUrl('marvel', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/dc\.wikia\.com\/wiki\//)) {
            console.log('dc');
            return External.parseTagUrl('dc', req.body.url);
        } else if (req.body.url.match(/^(http|https):\/\/thetvdb\.com\//)) {
            console.log('tvdb');
            return External.parseTagUrl('tvdb', req.body.url);
        } else {
            return Promise.reject(new HoError('invalid tag url'));
        }
    }
    getTaglist().then(taglist => {
        const recur = (index, u, adultonly=false) => (index >= taglist.length) ? Promise.resolve(sendWs({
            type: 'file',
            data: u,
        }, adultonly)) : StorageTagTool.addTag(u, taglist[index], req.user, false).then(result => new Promise(resolve => setTimeout(() => resolve(recur(index + 1, u, result.adultonly)), 500)));
        const recur_add = index => (index >= req.body.uids.length) ? res.json({apiOK: true}) : recur(0, req.body.uids[index]).then(() => recur_add(index + 1));
        return req.body.uids ? recur_add(0) : res.json({tags: taglist})
    }).catch(err => handleError(err, next));
});

router.put('/delTag/:tag', function(req, res, next) {
    console.log('storage delTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : StorageTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'file',
                data: result.id,
            }, result.adultonly);
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.put('/recover/:uid', function(req, res, next) {
    console.log('storage recover file');
    if (!checkAdmin(1, req.user)) {
        console.log(user);
        handleError(new HoError('permission denied'), next);
    }
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        if (items.length === 0) {
            return handleReject(new HoError('file can not be fund!!!'));
        }
        if (items[0].recycle !== 1) {
            return handleReject(new HoError('recycle file first!!!'));
        }
        return Mongo('update', STORAGEDB, {_id: items[0]._id}, {$set: {recycle: 0}}).then(item2 => {
            sendWs({
                type: 'file',
                data: items[0]._id,
            }, items[0].adultonly);
            res.json({apiOK: true});
        });
    }).catch(err => handleError(err, next));
});

router.post('/media/saveParent/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next) {
    console.log('media saveParent');
    const name = isValidString(req.body.name, 'name');
    if (!name) {
        handleError(new HoError('name is not vaild'), next);
    }
    StorageTagTool.searchTags(req.session).saveArray(name, req.params.sortName, req.params.sortType);
    res.json({apiOK: true});
});

router.get('/media/setTime/:id/:type/:obj?/:pageToken?/:back(back)?', function(req, res, next){
    console.log('media setTime');
    let id = req.params.id.match(/^(you|ypl|yif|mad|bbl|kub)_(.*)$/);
    let playlist = 0;
    let playlistId = null;
    let obj = req.params.obj;
    if (id) {
        if (id[1] === 'ypl') {
            playlist = 1;
            playlistId = id[2];
        } else if (id[1] === 'kub') {
            playlist = 3;
            playlistId = id[2];
        } else if (id[1] === 'yif') {
            playlist = 4;
            playlistId = id[2];
        } else if (id[1] === 'mad') {
            playlist = 5;
            playlistId = id[2];
        } else if (id[1] === 'bbl') {
            playlist = 6;
            playlistId = id[2];
        }
        id = isValidString(req.params.id, 'name');
        if (!id) {
            handleError(new HoError('youtube is not vaild'), next);
        }
    } else {
        id = isValidString(req.params.id, 'uid');
        if (!id) {
            handleError(new HoError('file is not vaild'), next);
        }
        if (obj && obj.match(/^(you_.*|external|\d+(\.\d+)?)$/)) {
            playlist = 2;
            if (obj === 'external') {
                obj = null;
            }
        }
    }
    const type = isValidString(req.params.type, 'name');
    if (!type) {
        handleError(new HoError('type is not vaild'), next);
    }
    const first = () => {
        if (playlist && obj) {
            if (!obj.match(/^(you_|\d+(\.\d+)?$)/)) {
                return handleReject(new HoError('external is not vaild'));
            }
            obj = isValidString(obj, 'name');
            if (!obj) {
                return handleReject(new HoError('external is not vaild'));
            }
            const pageToken = req.params.pageToken ? isValidString(req.params.pageToken, 'name') : false;
            return Redis('hmset', `record: ${req.user._id}`, {[id.toString()]: pageToken ? `${obj}>>${pageToken}` : obj});
        } else {
            return Promise.resolve();
        }
    }
    const setTag = id => Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        let multi_cli = [];
        if (items.length > 0 && items[0].tags) {
            items[0].tags.forEach(t => {
                if (OPTION_TAG.includes(t)) {
                    multi_cli.push(['hincrby', `tag: ${req.user._id}`, t, 1]);
                }
            });
        }
        return Redis('multi', multi_cli).then(ret => Redis('hget', `record: ${req.user._id}`, id.toString()));
    });
    const getRecord = () => (type === 'url') ? Promise.resolve({apiOK: true}) : setTag(id).then(item => {
        let recordTime = 1;
        let rPageToken = null;
        if (item) {
            const timeMatch = item.match(/^(.*)>>(.*)$/);
            if (timeMatch) {
                recordTime = timeMatch[1];
                rPageToken = timeMatch[2];
            } else {
                recordTime = item;
            }
        }
        const ret_rest = (obj, is_end, total, obj_arr=null, pageN=null, pageP=null, pageToken=null, is_new=false) => {
            if (total < 1) {
                return handleReject(new HoError('playlist is empty'));
            }
            const new_rest = is_new => is_new ? Redis('hmset', `record: ${req.user._id}`, {[id.toString()]: pageToken ? `${obj.id}>>${pageToken}` : obj.id}) : Promise.resolve();
            return new_rest(is_new).then(() => obj.id ? setTag(obj.id).then(item1 => Object.assign({playlist: Object.assign({
                obj: obj,
                end: is_end,
                total: total,
            }, obj_arr ? {
                obj_arr: obj_arr,
                pageN: pageN,
                pageP: pageP,
                pageToken: pageToken,
            } : {})}, (item1 && type !== 'music') ? {time: item1} : {})) : {playlist: {
                obj: obj,
                end: is_end,
                total: total,
            }});
        }
        if (playlist) {
            if (playlist === 1) {
                return External.youtubePlaylist(playlistId, recordTime, rPageToken, req.params.back).then(([obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new]) => ret_rest(obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new));
            } else if (playlist === 2) {
                return Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items1 => {
                    if (items1.length < 1) {
                        return handleReject(new HoError('cannot find external'));
                    }
                    return External.getSingleId(items1[0].owner, decodeURIComponent(items1[0].url), recordTime, rPageToken, req.params.back).then(([obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new]) => ret_rest(obj, is_end, total, obj_arr, pageN, pageP, pageToken, is_new));
                });
            } else if (playlist > 2) {
                let playurl = null;
                let playtype = null;
                if (playlist === 3) {
                    playurl = `http://www.99kubo.com/vod-read-id-${playlistId}.html`;
                    playtype = 'kubo';
                } else if (playlist === 4) {
                    playurl = `https://yts.ag/api/v2/movie_details.json?movie_id=${playlistId}`;
                    playtype = 'yify';
                } else if (playlist === 5) {
                    playurl = `http://www.cartoomad.com/comic/${playlistId}.html`;
                    playtype = 'cartoonmad';
                } else if (playlist === 6) {
                    playurl = playlistId.match(/^av/) ? `http://www.bilibili.com/video/${playlistId}/` : `http://www.bilibili.com/bangumi/i/${playlistId}/`;
                    playtype = 'bilibili';
                }
                return External.getSingleId(playtype, playurl, recordTime).then(([obj, is_end, total]) => ret_rest(obj, is_end, total));
            }
        } else {
            return (item && type !== 'music') ? {time: item} : {apiOK: true};
        }
    });
    first().then(() => getRecord()).then(result => {
        StorageTagTool.setLatest(id, req.session, (type === 'url') ? false : type).then(() => Mongo('update', STORAGEDB, {_id: id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
        res.json(result);
    }).catch(err => handleError(err, next));
});

router.get('/media/record/:id/:time/:pId?', function(req, res, next) {
    console.log('media record');
    if (!req.params.time.match(/^\d+(&\d+|\.\d+)?$/)) {
        handleError(new HoError('timestamp is not vaild'), next);
    }
    const id = req.params.id.match(/^(you|dym|bil|mad|yuk|ope|lin|iqi|bbl|kud|kyu|kdy|kub|kur)_/) ? isValidString(req.params.id, 'name') : isValidString(req.params.id, 'uid');
    if (!id) {
        handleError(new HoError('file is not vaild'), next);
    }
    const data = req.params.time === '0' ? [
        'hdel',
        id.toString(),
    ] : [
        'hmset',
        {[id.toString()]: req.params.time},
    ]
    return Redis(data[0], `record: ${req.user._id}`, data[1]).then(ret => res.json({apiOK: true})).catch(err => handleError(err, next));
});

router.get('/media/more/:type(\\d+)/:page(\\d+)/:back(back)?', function(req, res, next) {
    console.log('more media');
    let saveName = '';
    let type = Number(req.params.type);
    switch (type) {
        case 2:
        saveName = 'image';
        break;
        case 3:
        saveName = 'video';
        break;
        case 4:
        saveName = 'music';
        break;
        default:
        handleError(new HoError('unknown type'), next);
    }
    let sql = StorageTagTool.saveSql(Number(req.params.page), saveName, req.params.back, req.user, req.session);
    if (!sql) {
        handleError(new HoError('query error'), next);
    }
    console.log(sql);
    if (sql.empty) {
        res.json({itemList: []});
    } else {
        if (type === 2) {
            sql.nosql['$or'] = [{status: 2}, {status: 5}, {status: 6}, {status: 10}];
        } else {
            sql.nosql['status'] = type;
        }
        Mongo('find', STORAGEDB, sql.nosql, sql.select, sql.options).then(items => res.json({
            itemList: getStorageItem(req.user, items),
            parentList: sql.parentList,
        })).catch(err => handleError(err, next));
    }
});

router.get('/torrent/query/:id', function (req, res,next) {
    console.log('torrent query');
    const id = isValidString(req.params.id, 'uid');
    if (!id) {
        handleError(new HoError('file is not vaild'), next);
    }
    Mongo('find', STORAGEDB, {_id: id}, {limit: 1}).then(items => {
        if (items.length < 1 || items[0].status !== 9) {
            return handleReject(new HoError('playlist can not be fund!!!'));
        }
        return Redis('hget', `record: ${req.user._id}`, items[0]._id.toString()).then(item => {
            StorageTagTool.setLatest(items[0]._id, req.session).then(() => Mongo('update', STORAGEDB, {_id: items[0]._id}, {$inc: {count: 1}})).catch(err => handleError(err, 'Set latest'));
            res.json(Object.assign({
                id: items[0]._id,
                list: items[0].playList.map((l, i) => {
                    let doc = 0;
                    let type = 1;
                    const ext = isDoc(l);
                    if (ext) {
                        type = 2;
                        doc = (ext.type === 'present') ? 1 : (ext.type === 'pdf') ? 3 : 2;
                    }
                    return Object.assign({
                        name: l,
                        type: (type === 2 || isImage(l) || isZipbook(l)) ? 2 : isVideo(l) ? 3 : isMusic(l) ? 4 : 1,
                        doc,
                    }, (items[0].present && items[0].present[i]) ? {present: items[0].present[i]} : {});
                }),
            }, item ? {time: item} : {}))
        });
    }).catch(err => handleError(err, next));
});

router.put('/zipPassword/:uid', function (req, res, next){
    console.log('zip password');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('file is not vaild'), next);
    }
    const pwd = isValidString(req.body.pwd, 'altpwd');
    if (!pwd) {
        handleError(new HoError('password is not vaild'), next);
    }
    Mongo('find', STORAGEDB, {
        _id: id,
        status: 9,
    }, {limit: 1}).then(items => {
        if (items.length < 1) {
            return handleReject(new HoError('zip can not be fund!!!'));
        }
        return Mongo('update', STORAGEDB, {
            _id: id,
            status: 9,
        }, {$set: {pwd}}).then(item => res.json({apiOk: true}));
    }).catch(err => handleError(err, next));
});

export default router
import { STOCKDB } from '../constants.js'
import Express from 'express'
import TagTool from '../models/tag-tool.js'
import StockTool from '../models/stock-tool.js'
import { checkLogin, handleError, getStockItem, isValidString, HoError } from '../util/utility.js'
import sendWs from '../util/sendWs.js'

const router = Express.Router();
const StockTagTool = TagTool(STOCKDB);

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('stock');
    StockTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStockItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function(req, res, next) {
    console.log('stock get single');
    const page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        StockTagTool.searchTags(req.session).resetArray();
    }
    StockTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStockItem(req.user, result.items),
        parentList: result.parentList,
        latest: result.latest,
        bookmarkID: result.bookmark,
    })).catch(err => handleError(err, next));
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next){
    console.log('stock reset');
    StockTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(result => res.json({
        itemList: getStockItem(req.user, result.items),
        parentList: result.parentList,
    })).catch(err => handleError(err, next));
});

router.post('/getOptionTag', function(req, res,next) {
    console.log('stock option tag');
    let optionList = new Set(['important']);
    req.body.tags.length > 0 ? StockTagTool.getRelativeTag(req.body.tags, req.user, [...optionList]).then(relative => {
        const reli = relative.length < 5 ? relative.length : 5;
        for (let i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({relative: [...optionList]});
    }).catch(err => handleError(err, next)) : res.json({relative: [...optionList]});
});

router.get('/single/:uid', function(req, res, next) {
    console.log('stock single');
    StockTagTool.singleQuery(req.params.uid, req.user, req.session).then(result => result.empty ? res.json(result) : res.json({item: getStockItem(req.user, [result.item])})).catch(err => handleError(err, next));
});

router.put('/addTag/:tag', function(req, res, next) {
    console.log('stock addTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : StockTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'stock',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.put('/delTag/:tag', function(req, res, next) {
    console.log('stock delTag');
    const recur = index => (index >= req.body.uids.length) ? Promise.resolve(res.json({apiOK: true})) : StockTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(result => {
        if (result.id) {
            sendWs({
                type: 'stock',
                data: result.id,
            });
        }
        return new Promise(resolve => setTimeout(() => resolve(recur(index + 1)), 500));
    });
    recur(0).catch(err => handleError(err, next));
});

router.get('/querySimple/:uid', function(req, res,next) {
    console.log('stock query simple');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        return handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getSingleStockV2(id, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get('/getPER/:uid', function(req, res,next) {
    console.log('stock get per');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        return handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getStockPERV2(id).then(([result, result2, result3, index, start]) => {
        StockTagTool.setLatest(id, req.session).catch(err => handleError(err, 'Set latest'));
        res.json({per: `${index}: ${result} ${result2} ${result3} ${start}`});
    }).catch(err => handleError(err, next));
});

/*router.get('/getPredictPER/:uid', function(req, res,next) {
    console.log('stock get predict');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        return handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getPredictPERWarp(id, req.session).then(([result, index]) => res.json({per: `${index}: ${result}`})).catch(err => handleError(err, next));
});

router.get('/getPoint/:uid/:price?', function(req, res, next) {
    console.log('stock get point');
    const id = isValidString(req.params.uid, 'uid', 'uid is not vaild');
    if (!id) {
        return handleError(new HoError('uid is not vaild'), next);
    }
    let price = 0;
    if (req.params.price) {
        if (!req.params.price.match(/\d+(\.\d+)?/)) {
            return handleError(new HoError('price is not vaild'), next);
        }
        price = Number(req.params.price);
    }
    StockTool.getStockPoint(id, price, req.session).then(point => res.json({point})).catch(err => handleError(err, next));
});*/

router.get('/getInterval/:uid', function(req, res,next) {
    console.log('stock get interval');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        return handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getIntervalWarp(id, req.session).then(([result, index]) => res.json({interval: `${index}: ${result}`})).catch(err => handleError(err, next));
});

/*router.put('/filter/:tag/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next) {
    console.log('stock filter');
    const name = isValidString(req.params.tag, 'name');
    if (!name) {
        return  handleError(new HoError('name is not vaild'), next);
    }
    let per = false;
    if (req.body.per) {
        per = req.body.per.match(/^([<>])(\d+)$/);
        if (!per) {
            return handleError(new HoError('per is not vaild'), next);
        }
        per[2] = Number(per[2]);
    }
    let pdr = false;
    if (req.body.pdr) {
        pdr = req.body.pdr.match(/^([<>])(\d+)$/);
        if (!pdr) {
            return handleError(new HoError('pdr is not vaild'), next);
        }
        pdr[2] = Number(pdr[2]);
    }
    let pbr = false;
    if (req.body.pbr) {
        pbr = req.body.pbr.match(/^([<>])(\d+\.?\d*)$/);
        if (!pbr) {
            return handleError(new HoError('pbr is not vaild'), next);
        }
        pbr[2] = Number(pbr[2]);
    }
    let pre = false;
    if (req.body.pre) {
        pre = req.body.pre.match(/^([<>])(\d+)$/);
        if (!pre) {
            return handleError(new HoError('pre is not vaild'), next);
        }
        pre[2] = Number(pre[2]);
    }
    let interval = false;
    if (req.body.interval) {
        interval = req.body.interval.match(/^([<>])(\d+)$/);
        if (!interval) {
            return handleError(new HoError('interval is not vaild'), next);
        }
        interval[2] = Number(interval[2]);
    }
    let vol = false;
    if (req.body.vol) {
        vol = req.body.vol.match(/^([<>])(\d+)$/);
        if (!vol) {
            return handleError(new HoError('vol is not vaild'), next);
        }
        vol[2] = Number(vol[2]);
    }
    let close = false;
    if (req.body.close) {
        close = req.body.close.match(/^([<>])(\d+)$/);
        if (!close) {
            return handleError(new HoError('close is not vaild'), next);
        }
        close[2] = Number(close[2]);
    }
    res.json({apiOK: true});
    StockTool.stockFilterWarp({
        name,
        sortName: req.params.sortName,
        sortType: req.params.sortType,
        twse: {
            close,
            per,
            pdr,
            pbr,
            pre,
            interval,
            vol,
        },
        usse: {},
    }, req.user, req.session).then(number => {
        sendWs({
            type: req.user.username,
            data: `Filter ${name}: ${number}`,
        }, 0);
    }).catch(err => {
        sendWs({
            type: req.user.username,
            data: `Filter fail: ${err.message}`,
        }, 0);
        return handleError(err, 'Stock filter');
    });
});*/

router.get('/getTotal', function(req, res,next) {
    console.log('stock get total');
    StockTool.getStockTotal(req.user).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.put('/updateTotal/:real(1|0)?', function(req, res,next) {
    console.log('stock update total');
    StockTool.updateStockTotal(req.user, req.body.info, (req.params.real === '1') ? true : false).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

export default router
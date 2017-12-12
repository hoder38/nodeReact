import { STOCKDB, STOCK_FILTER_LIMIT } from '../constants'
import Express from 'express'
import TagTool from '../models/tag-tool'
import StockTool from '../models/stock-tool.js'
import { checkLogin, handleError, getStockItem, isValidString, HoError } from '../util/utility'
import sendWs from '../util/sendWs'

const router = Express.Router();
const StockTagTool = TagTool(STOCKDB);
let stockFiltering = false;
let stockIntervaling = false;

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
        handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getSingleStock(id, req.session).then(result => res.json(result)).catch(err => handleError(err, next));
});

router.get('/getPER/:uid', function(req, res,next) {
    console.log('stock get per');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getStockPER(id).then(([result, index, start]) => StockTool.getStockYield(id).then(result_1 => {
        StockTagTool.setLatest(id, req.session).catch(err => handleError(err, 'Set latest'));
        res.json({per: `${index}: ${result} ${result_1} ${start}`});
    })).catch(err => handleError(err, next));
});

router.get('/getPredictPER/:uid', function(req, res,next) {
    console.log('stock get predict');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getPredictPER(id, req.session).then(([result, index]) => res.json({per: `${index}: ${result}`})).catch(err => handleError(err, next));
});

router.get('/getPoint/:uid/:price?', function(req, res, next) {
    console.log('stock get point');
    const id = isValidString(req.params.uid, 'uid', 'uid is not vaild');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    StockTool.getStockPoint(id, req.params.price ? !req.params.price.match(/\d+(\.\d+)?/) ? handleError(new HoError('price is not vaild'), next) : Number(req.params.price) : 0, req.session).then(point => res.json({point})).catch(err => handleError(err, next));
});

router.get('/getInterval/:uid', function(req, res,next) {
    console.log('stock get interval');
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        handleError(new HoError('uid is not vaild'), next);
    }
    if (stockIntervaling) {
        handleError(new HoError('there is another inverval running'), next);
    }
    stockIntervaling = true;
    StockTool.getInterval(id, req.session).then(([result, index]) => {
        stockIntervaling = false;
        res.json({interval: `${index}: ${result}`});
    }).catch(err => {
        stockIntervaling = false;
        return handleError(err, next)
    });
});

router.put('/filter/:tag/:sortName(name|mtime|count)/:sortType(desc|asc)', function(req, res, next) {
    console.log('stock filter');
    const name = isValidString(req.params.tag, 'name');
    if (!name) {
        handleError(new HoError('name is not vaild'), next);
    }
    let per = false;
    if (req.body.per) {
        per = req.body.per.match(/^([<>])(\d+)$/);
        if (!per) {
            handleError(new HoError('per is not vaild'), next);
        }
        per[2] = Number(per[2]);
    }
    let yieldNumber = false;
    if (req.body.yield) {
        yieldNumber = req.body.yield.match(/^([<>])(\d+)$/);
        if (!yieldNumber) {
            handleError(new HoError('yield is not vaild'), next);
        }
        yieldNumber[2] = Number(yieldNumber[2]);
    }
    let pp = false;
    if (req.body.p) {
        pp = req.body.p.match(/^([<>])(\d+)$/);
        if (!pp) {
            handleError(new HoError('p is not vaild'), next);
        }
        pp[2] = Number(pp[2]);
    }
    let ss = false;
    if (req.body.s) {
        ss = req.body.s.match(/^([<>])(\-?\d+)$/);
        if (!ss) {
            handleError(new HoError('s is not vaild'), next);
        }
        ss[2] = Number(ss[2]);
    }
    let mm = false;
    if (req.body.m) {
        mm = req.body.m.match(/^([<>])(\d+\.?\d*)$/);
        if (!mm) {
            handleError(new HoError('m is not vaild'), next);
        }
        mm[2] = Number(mm[2]);
    }
    if (stockFiltering) {
        handleError(new HoError('there is another filter running'), next);
    }
    stockFiltering = true;
    let first = true;
    let last = false;
    let queried = 0;
    let filterNum = 0;
    const recur_query = () => StockTagTool.tagQuery(queried, '', false, 0, req.params.sortName, req.params.sortType, req.user, req.session, STOCK_FILTER_LIMIT).then(result => {
        console.log(queried);
        if (first) {
            res.json({apiOK: true});
        }
        if (result.items.length < STOCK_FILTER_LIMIT) {
            last = true;
        }
        queried += result.items.length;
        first = false;
        if (result.items.length < 1) {
            stockFiltering = false;
            return sendWs({
                type: req.user.username,
                data: `Filter ${name}: ${filterNum}`,
            }, 0);
        }
        let first_stage = [];
        result.items.forEach(i => {
            const is_name = i.tags.includes(name) ? true : false;
            const pok = pp ? ((pp[1] === '>' && i.profitIndex > pp[2]) || (pp[1] === '<' && i.profitIndex < pp[2])) ? true : false : true;
            const sok = ss ? ((ss[1] === '>' && i.safetyIndex > ss[2]) || (ss[1] === '<' && i.safetyIndex < ss[2])) ? true : false : true;
            const mok = mm ? ((mm[1] === '>' && i.managementIndex > mm[2]) || (mm[1] === '<' && i.managementIndex < mm[2])) ? true : false : true;
            if (is_name) {
                filterNum++;
            } else if (!is_name && pok && sok && mok) {
                first_stage.push(i);
            }
        });
        if (first_stage.length < 1) {
            stockFiltering = false;
            return sendWs({type: req.user.username,
                data: `Filter ${name}: ${filterNum}`,
            }, 0);
        }
        const recur_per = index => {
            const nextFilter = () => {
                index++;
                if (index < first_stage.length) {
                    return recur_per(index);
                }
                if (!last) {
                    return recur_query();
                }
                stockFiltering = false;
                return sendWs({
                    type: req.user.username,
                    data: `Filter ${name}: ${filterNum}`,
                }, 0);
            }
            const addFilter = () => StockTagTool.addTag(first_stage[index]._id, name, req.user).then(add_result => {
                filterNum++;
                sendWs({
                    type: 'stock',
                    data: add_result.id,
                }, 0, 1);
                if (filterNum >= STOCK_FILTER_LIMIT) {
                    stockFiltering = false;
                    return sendWs({
                        type: req.user.username,
                        data: `Filter ${name}: ${filterNum}`,
                    }, 0);
                }
                return nextFilter();
            });
            if (per) {
                return StockTool.getStockPER(first_stage[index]._id).then(([stockPer]) => {
                    if (per && stockPer > 0 && ((per[1] === '>' && stockPer > (per[2] * 2 / 3)) || (per[1] === '<' && stockPer < (per[2] * 4 /3)))) {
                        console.log(stockPer);
                        console.log(first_stage[index].name);
                        if (yieldNumber) {
                            return StockTool.getStockYield(first_stage[index]._id).then(stockYield => {
                                if (yieldNumber && stockYield > 0 && ((yieldNumber[1] === '>' && stockYield > (yieldNumber[2] * 2 / 3)) || (yieldNumber[1] === '<' && stockYield < (yieldNumber[2] * 4 /3)))) {
                                    console.log(stockYield);
                                    return addFilter();
                                } else {
                                    return nextFilter();
                                }
                            });
                        } else {
                            return addFilter();
                        }
                    } else {
                        return nextFilter();
                    }
                });
            } else if (yieldNumber) {
                return StockTool.getStockYield(first_stage[index]._id).then(stockYield => {
                    if (yieldNumber && stockYield > 0 && ((yieldNumber[1] === '>' && stockYield > (yieldNumber[2] * 2 / 3)) || (yieldNumber[1] === '<' && stockYield < (yieldNumber[2] * 4 /3)))) {
                        console.log(stockYield);
                        console.log(first_stage[index].name);
                        return addFilter();
                    } else {
                        return nextFilter();
                    }
                });
            } else {
                return addFilter();
            }
        }
        return recur_per(0);
    });
    return recur_query().catch(err => {
        stockFiltering = false;
        sendWs({
            type: req.user.username,
            data: `Filter fail: ${err.message}`,
        }, 0);
        handleError(err, next);
    });
});

router.use(function(req, res, next) {
    checkLogin(req, res, next);
});

export default router
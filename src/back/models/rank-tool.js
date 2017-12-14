import { RANKDB, RANK_LIMIT, USERDB, FITNESSDB, FITNESS_POINT } from '../constants'
import Mongo, { objectID } from '../models/mongo-tool'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import { isValidString, handleError, HoError, completeZero } from '../util/utility'

const RankTagTool = TagTool(RANKDB);

export default {
    getChart: function(uid, user, session) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', RANKDB, {_id: id}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('rank cannot find!!!'));
            }
            const getName = () => (items[0].type === FITNESSDB && items[0].itemId.equals(objectID(FITNESS_POINT))) ? Promise.resolve('point') : Mongo('find', items[0].type, {_id: items[0].itemId}).then(items1 => (items1.length < 1) ? 'unknown' : items1[0].name);
            const findData = () => items[0].history ? Promise.resolve(items[0].history) : Mongo('find', `${items[0].type}Count`, {
                itemId: items[0].itemId,
                start: {$gte: items[0].start},
            }, {
                limit: RANK_LIMIT,
                sort: [[
                    'count',
                    'desc',
                ]],
            }).then(items1 => items1.reverse());
            return getName().then(itemName => findData().then(itemData => {
                if (itemData.length < 1) {
                    return handleError(new HoError('no data!!!'));
                }
                let data = [];
                let labels = [];
                let owner = RANK_LIMIT;
                const recur = index => {
                    if (index >= itemData.length) {
                        return Promise.resolve();
                    }
                    if (user._id.equals(itemData[index].owner)) {
                        owner = index;
                        labels.push(user.username);
                        data.push(itemData[index].count);
                        return recur(index + 1);
                    } else {
                        return Mongo('find', USERDB, {_id: itemData[index].owner}).then(items2 => {
                            labels.push((items2.length < 1) ? 'unknown' : items2[0].username);
                            data.push(itemData[index].count);
                            return recur(index + 1);
                        });
                    }
                }
                const getUser = () => (owner === RANK_LIMIT && !items[0].history)? Mongo('find', `${items[0].type}Count`, {
                    itemId: items[0].itemId,
                    owner: user._id,
                }).then(items1 => {
                    if (items1.length < 1) {
                        return handleError(new HoError('rank cannot find user!!!'));
                    }
                    labels.push(user.username);
                    data.push(items1[0].count);
                }) : Promise.resolve();
                RankTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
                return recur(0).then(() => getUser().then(() => ({
                    labels,
                    data,
                    name: items[0].name,
                    itemName,
                    owner,
                })));
            }));
        });
    },
    newRow: function(data) {
        if (!data['name'] || !data['item']) {
            return handleError(new HoError('parameter lost!!!'));
        }
        const name = isValidString(data['name'], 'name');
        if (!name) {
            return handleError(new HoError('name not vaild!!!'));
        }
        const id = isValidString(data['item'], 'uid');
        if (!id) {
            return handleError(new HoError('item not vaild!!!'));
        }
        const date = new Date();
        const start = Number(`${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`);
        const getItem = () => id.equals(objectID(FITNESS_POINT)) ? Promise.resolve('point') : Mongo('find', FITNESSDB, {_id: id}).then(items1 => {
            if (items1.length < 1) {
                return handleError(new HoError('fitness row does not exist!!!'));
            }
            return items1[0].name;
        });
        return getItem().then(itemName => Mongo('find', RANKDB, {
            type: FITNESSDB,
            itemId: id,
            start,
        }).then(items => {
            if (items.length > 0) {
                return handleError(new HoError('double rank!!!'));
            }
            let setTag = new Set();
            setTag.add(normalize(name)).add(date.getFullYear().toString()).add(FITNESSDB).add('sport').add('運動').add(normalize(itemName));
            let setArr = [];
            setTag.forEach(s => {
                if (!isDefaultTag(s)) {
                    setArr.push(s);
                }
            });
            return Mongo('insert', RANKDB, {
                _id: objectID(),
                name,
                start,
                itemId: id,
                type: FITNESSDB,
                utime: Math.round(new Date().getTime() / 1000),
                tags: setArr,
            }).then(item => {
                console.log(item);
                console.log('save end');
                return Mongo('find', RANKDB, {
                    type: item[0].type,
                    itemId: item[0].itemId,
                }, {
                    limit: 2,
                    sort: [[
                        'start',
                        'desc',
                    ]],
                }).then(items1 => (items1.length < 2) ? ({id: item[0]._id}) : Mongo('find', `${items1[1].type}Count`, {
                    itemId: items1[1].itemId,
                    start: {$gte: items1[1].start},
                }, {
                    limit: RANK_LIMIT,
                    sort: [[
                        'count',
                        'desc',
                    ]],
                }).then(items2 => Mongo('update', RANKDB, {_id: items1[1]._id}, {$set: {history: items2.map(i => ({
                    owner: i.owner,
                    count: i.count,
                })).reverse()}}).then(item1 => ({id: item[0]._id}))));
            });
        }));
    },
    delRow: function(uid) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid not vaild!!!'));
        }
        return Mongo('find', RANKDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('rank row does not exist!!!'));
            }
            return Mongo('remove', RANKDB, {
                _id: items[0]._id,
                $isolated: 1,
            });
        });
    },
    getItem: function() {
        return Mongo('find', FITNESSDB, {type: 1}).then(items => [{
            id: FITNESS_POINT,
            name: 'point',
        }].concat(items.map(i => ({
            id: i._id,
            name: i.name,
        }))));
    }
}

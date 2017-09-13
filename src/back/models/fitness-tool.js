import { FITNESSDB, FITNESS_POINT, CHART_LIMIT } from '../constants'
import TagTool, { isDefaultTag, normalize } from '../models/tag-tool'
import Mongo, { objectID } from '../models/mongo-tool'
import Redis from '../models/redis-tool'
import { isValidString, handleError, handleReject, HoError, completeZero } from '../util/utility'

const FitnessTagTool = TagTool(FITNESSDB);

export default {
    newRow: function(data) {
        if (!data['price'] || !data['desc'] || !data['name']) {
            return handleReject(new HoError('parameter lost!!!'));
        }
        const name = isValidString(data['name'], 'name');
        if (!name) {
            return handleReject(new HoError('name not vaild!!!'));
        }
        const price = isValidString(data['price'], 'int');
        if (!price) {
            return handleReject(new HoError('price not vaild!!!'));
        }
        const desc = isValidString(data['desc'], 'desc');
        if (!desc) {
            return handleReject(new HoError('description not vaild!!!'));
        }
        let setTag = new Set();
        setTag.add(normalize(name)).add('sport').add('運動');
        //setTag.add(normalize(name)).add('game').add('遊戲');
        let setArr = [];
        setTag.forEach(s => {
            if (!isDefaultTag(s)) {
                setArr.push(s);
            }
        });
        return Mongo('insert', FITNESSDB, {
            _id: objectID(),
            name,
            price,
            desc,
            utime: Math.round(new Date().getTime() / 1000),
            type: 1,
            use: {},
            tags: setArr,
        }).then(item => {
            console.log(item);
            console.log('save end');
            return {id: item[0]._id};
        });
    },
    editRow: function(uid, data, session) {
        let name = '';
        if (data['name']) {
            name = isValidString(data['name'], 'name');
            if (!name) {
                return handleReject(new HoError('description not vaild!!!'));
            }
        }
        let price = '';
        if (data['price']) {
            price = isValidString(data['price'], 'int');
            if (!price) {
                return handleReject(new HoError('price not vaild!!!'));
            }
        }
        let desc = '';
        if (data['desc']) {
            desc = isValidString(data['desc'], 'desc');
            if (!desc) {
                return handleReject(new HoError('description not vaild!!!'));
            }
        }
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        return Mongo('find', FITNESSDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleReject(new HoError('fitness row does not exist!!!'));
            }
            let update_data = {};
            let setTag = new Set(items[0].tags);
            if (name) {
                setTag.add(normalize(name));
                update_data['name'] = name;
            }
            if (price) {
                update_data['price'] = price;
            }
            if (desc) {
                update_data['desc'] = desc;
            }
            let setArr = [];
            setTag.forEach(s => {
                if (!isDefaultTag(s)) {
                    setArr.push(s);
                }
            });
            update_data = Object.assign(update_data, {tags: setArr});
            console.log(update_data);
            FitnessTagTool.setLatest(items[0]._id, session).catch(err => handleError(err, 'Set latest'));
            return Mongo('update', FITNESSDB, {_id: items[0]._id}, {$set: update_data});
        });
    },
    delRow: function(uid) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        return Mongo('find', FITNESSDB, {_id: id}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleReject(new HoError('fitness row does not exist!!!'));
            }
            return Mongo('remove', FITNESSDB, {
                _id: items[0]._id,
                $isolated: 1,
            }).then(item => Mongo('remove', `${FITNESSDB}Count`, {
                itemId: items[0]._id,
                $isolated: 1,
            }));
        });
    },
    getPoint: function(user) {
        return Mongo('find', `${FITNESSDB}Count`, {
            owner: user._id,
            itemId: objectID(FITNESS_POINT),
        }).then(items => (items.length < 1) ? 0 : items[0].count);
    },
    exchange: function(uid, user, exchange, session) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        const number = isValidString(exchange, 'int');
        if (!number) {
            return handleReject(new HoError('exchange is not vaild!!!'));
        }
        const end = (id=null, itemCount=0) => Mongo('find', `${FITNESSDB}Count`, {
            owner: user._id,
            itemId: objectID(FITNESS_POINT),
        }).then(items => {
            if (items.length < 1) {
                return handleReject(new HoError('point row does not exist!!!'));
            }
            FitnessTagTool.setLatest(id, session).catch(err => handleError(err, 'Set latest'));
            return id ? Redis('hmget', `chart: ${user._id}`, [FITNESS_POINT, id.toString()]).then(item => {
                const date = new Date();
                const dateStr = `${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`;
                return Redis('hmset', `chart: ${user._id}`, {
                    [FITNESS_POINT]: JSON.stringify(Object.assign(item[0] ? JSON.parse(item[0]) : {}, {[dateStr] : items[0].count})),
                    [id.toString()]: JSON.stringify(Object.assign(item[1] ? JSON.parse(item[1]) : {}, {[dateStr] : itemCount})),
                }).then(() => items[0].count);
            }) : items[0].count;
        });
        return Mongo('find', `${FITNESSDB}Stat`, {owner: user._id}).then(items2 => {
            if (items2.length < 1) {
                return handleReject(new HoError('fitness stat row does not exist!!!'));
            }
            return Mongo('find', FITNESSDB, {_id: id}).then(items => {
                if (items.length < 1) {
                    return handleReject(new HoError('fitness row does not exist!!!'));
                }
                switch(items[0].type) {
                    case 1:
                    return Mongo('find', `${FITNESSDB}Count`, {
                        owner: user._id,
                        itemId: id,
                    }).then(items1 => Mongo('update', `${FITNESSDB}Count`, {
                        owner: user._id,
                        itemId: id,
                    }, {
                        $inc: {count: number},
                        $set: {start: items2[0].start},
                    }, {upsert: true}).then(item => {
                        const addPoint = Math.floor(((items1.length < 1) ? number : items1[0].count % items[0].price + number) / items[0].price);
                        const isAdd = () => addPoint ? Mongo('update', `${FITNESSDB}Count`, {
                            owner: user._id,
                            itemId: objectID(FITNESS_POINT),
                        }, {
                            $inc: {count: addPoint},
                            $set: {start: items2[0].start},
                        }, {upsert: true}) : Promise.resolve();
                        return isAdd().then(() => end(id, (items1.length < 1) ? number : items1[0].count + number));
                    }));
                    case 2:
                    return Mongo('find', `${FITNESSDB}Count`, {
                        owner: user._id,
                        itemId: objectID(FITNESS_POINT),
                    }).then(items1 => {
                        //以後改成多一個 remain point 原本的point不變
                        const max = Math.floor(items1[0].count / items[0].price);
                        const addCount = (number < max) ? number : max;
                        const isAdd = () => addCount ? Mongo('update', `${FITNESSDB}Count`, {
                            owner: user._id,
                            itemId: id,
                        }, {
                            $inc: {count: addCount},
                            $set: {start: items2[0].start},
                        }, {upsert: true}).then(item => Mongo('update', `${FITNESSDB}Count`, {
                            owner: user._id,
                            itemId: objectID(FITNESS_POINT),
                        }, {
                            $inc: {count: -addCount * items[0].price},
                            $set: {start: items2[0].start},
                        }, {upsert: true})) : Promise.resolve();
                        return isAdd().then(() => end());
                    });
                    break;
                    default:
                    return handleReject(new HoError('fitness type unknown!!!'));
                }
            });
        });
    },
    getStat: function(uid, index=0, typeId=FITNESS_POINT) {
        const tId = isValidString(typeId, 'uid');
        if (!tId) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        const cIndex = isValidString(index, 'perm');
        if (!cIndex || cIndex > CHART_LIMIT) {
            return handleReject(new HoError('index is not vaild!!!'));
        }
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        const date = new Date();
        const getStart = () => Mongo('find', `${FITNESSDB}Stat`, {owner: id}).then(items => {
            const get = () => (items.length < 1) ? Mongo('insert', `${FITNESSDB}Stat`, {
                owner: id,
                start: Number(`${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`),
                chart: [],
            }).then(item => [item[0].start.toString(), item[0].chart]) : Promise.resolve([items[0].start.toString(), items[0].chart]);
            return get();
        });
        const getChart = (tId, start, name) => Redis('hget', `chart: ${id}`, tId.toString()).then(item => {
            let date1 = date;
            let labels = [];
            let data = [];
            for (let i = 0; i < 365; i++) {
                const day = `${date1.getFullYear()}${completeZero(date1.getMonth() + 1, 2)}${completeZero(date1.getDate(), 2)}`;
                labels.push(day);
                data.push(0);
                if (day === start) {
                    break;
                }
                date1 = new Date(date1.setDate(date1.getDate() - 1));
            }
            labels.reverse();
            if (item) {
                item = JSON.parse(item);
                for (let i in item) {
                    const index = labels.indexOf(i);
                    if (index !== -1) {
                        data[index] = item[i];
                    }
                }
            }
            let j = 0;
            return {
                label: name,
                labels,
                data: data.map(i => {
                    j = (j > i) ? j : i;
                    return j;
                }),
            }
        });
        return (tId.equals(objectID(FITNESS_POINT))) ? cIndex ? getStart().then(([start, chart]) => {
            chart[cIndex - 1] = null;
            return Mongo('update', `${FITNESSDB}Stat`, {owner: id}, {$set: {chart}}).then(item => null);
        }) : Mongo('find', FITNESSDB, {type: 1}).then(items => getStart().then(([start, chart]) => {
            let ret_chart = [];
            const recur_chart = aIndex => {
                if (aIndex >= chart.length) {
                    return {
                        start,
                        fitness: items.map(i => ({
                            title: i.name,
                            id: i._id,
                        })),
                        chart: ret_chart,
                    }
                }
                if (!chart[aIndex]) {
                    ret_chart.push(null);
                    return recur_chart(aIndex + 1);
                }
                return Mongo('find', FITNESSDB, {_id: chart[aIndex]}).then(items1 => {
                    if (items.length < 1) {
                        ret_chart.push(null);
                        return recur_chart(aIndex + 1)
                    }
                    return getChart(items1[0]._id, start, items1[0].name).then(result => {
                        ret_chart.push(result);
                        return recur_chart(aIndex + 1);
                    });
                });
            }
            return getChart(tId, start, 'point').then(result => {
                ret_chart.push(result);
                return recur_chart(0);
            });
        })) : Mongo('find', FITNESSDB, {_id: tId}).then(items => {
            if (items.length < 1) {
                return handleReject(new HoError('fitness type unknown!!!'));
            }
            return getStart().then(([start, chart]) => {
                chart[cIndex - 1] = tId;
                return Mongo('update', `${FITNESSDB}Stat`, {owner: id}, {$set: {chart}}).then(item => getChart(tId, start, items[0].name).then(result => result));
            });
        });
    },
    resetDate: function(uid) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleReject(new HoError('uid is not vaild!!!'));
        }
        const date = new Date();
        return Mongo('update', `${FITNESSDB}Stat`, {owner: id}, {$set: {
            start: Number(`${date.getFullYear()}${completeZero(date.getMonth() + 1, 2)}${completeZero(date.getDate(), 2)}`),
            chart: [],
        }}).then(item => Mongo('remove', `${FITNESSDB}Count`, {
            owner: id,
            $isolated: 1,
        }).then(item1 => Redis('del', `chart: ${id}`)));
    }
}
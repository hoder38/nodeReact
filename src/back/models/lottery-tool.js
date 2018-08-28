import { ENV_TYPE } from '../../../ver'
import { NAS_TMP } from '../config'
import { LOTTERYDB } from '../constants'
import { handleError, HoError, bufferToString, isValidString, checkAdmin } from '../util/utility'
import { sendLotteryName } from '../models/api-tool-google'
import { createReadStream as FsCreateReadStream, writeFile as FsWriteFile, readFile as FsReadFile, appendFile as FsAppendFile, unlink as FsUnlink, existsSync as FsExistsSync } from 'fs'
import { createInterface } from 'readline'
import { encode as IconvEncode } from 'iconv-lite'
import Mongo from '../models/mongo-tool'

const getRewardItem = items => items.map(item => ({
    name: item.name,
    id: item._id,
    utime: item.utime,
    count: item.count,
    tags: item.option,
}));

const getUserItem = items => {
    const user = [];
    let i = 0;
    items.forEach(item => {
        for (let j = 0; j < item.count; j++) {
            user.push({
                id: i,
                name: item.name,
            });
            i++;
        }
    });
    if (user.length < 1) {
        user.push({
            id: -1,
            name: 'EMPTY',
        })
    }
    return user;
}

export default {
    getInit: function(owner) {
        return Mongo('find', LOTTERYDB, {type: 0}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return {name: false};
            } else {
                const name = items[0].name;
                const isOwner = owner.equals(items[0].owner);
                return Mongo('find', LOTTERYDB, {type: 2}, {
                    sort: [[
                        'owner',
                        'asc',
                    ]]
                }).then(items => {
                    const user = getUserItem(items);
                    return Mongo('find', LOTTERYDB, {type: 1}, {
                        sort: [[
                            'owner',
                            'asc',
                        ]]
                    }).then(items => ({
                        owner: isOwner,
                        name,
                        user,
                        reward: getRewardItem(items),
                    }));
                });
            }
        });
    },
    getData: function(uid=null) {
        if (uid) {
            const id = isValidString(uid, 'uid');
            if (!id) {
                return handleError(new HoError('invalid uid'));
            }
            return Mongo('find', LOTTERYDB, {_id: id}, {limit: 1}).then(items => {
                if (items.length < 1) {
                    return handleError(new HoError('Prize is not exist!!!'));
                }
                return getRewardItem(items);
            });
        } else {
            return Mongo('find', LOTTERYDB, {type: 2}, {
                sort: [[
                    'owner',
                    'asc',
                ]]
            }).then(items => getUserItem(items));
        }
    },
    newLottery: function(owner, name, type, big5, user, reward) {
        console.log(owner);
        console.log(name);
        console.log(type);
        console.log(big5);
        console.log(user);
        console.log(reward);
        //option remove:multiple
        const option = type === '1' ? [true, true] : type === '2' ? [false, true] :[true, false];
        return Mongo('find', LOTTERYDB, {type: 0}, {limit: 1}).then(items => {
            if (items.length > 0) {
                return handleError(new HoError('already has a lottery!!!'));
            }
            return Mongo('insert', LOTTERYDB, {
                type: 0,
                owner,
                name,
                count: (big5 === 'en') ? 0: 1,
                option,
            }).then(item => {
                console.log(item);
                const recurUser = index => (user.length <= index) ? Promise.resolve() : Mongo('insert', LOTTERYDB, Object.assign({
                    type: 2,
                    owner: index,
                    name: user[index][0],
                    count: user[index][1],
                    option: user[index].splice(3),
                }, isValidString(user[index][2], 'email') ? {utime: user[index][2]} : {})).then(item => {
                    console.log(item);
                    return recurUser(index + 1);
                });
                const recurReward = index => (reward.length <= index) ? Promise.resolve() : Mongo('insert', LOTTERYDB, {
                    type: 1,
                    owner: index,
                    name: reward[index][0],
                    count: reward[index][1],
                    option: [],
                }).then(item => {
                    console.log(item);
                    return recurReward(index + 1);
                });
                return recurUser(0).then(() => recurReward(0)).catch(err => Mongo('remove', LOTTERYDB, {$isolated: 1}).then(() => Promise.reject(err)));
            });
        });
    },
    input: function(filePath, big5=false) {
        let isUser = true;
        const user = [];
        const reward = [];
        const utfPath = `${NAS_TMP(ENV_TYPE)}/lottery.csv`;
        return new Promise((resolve, reject) => FsReadFile(filePath, (err,data) => err ? reject(err) : resolve(data))).then(data => new Promise((resolve, reject) => FsWriteFile(utfPath, bufferToString(data, big5), 'utf8', err => err ? reject(err) : resolve()))).then(() => new Promise((resolve, reject) => {
            //0 name 1 times 26 black times 27 black reward
            createInterface({input: FsCreateReadStream(utfPath)}).on('line', line => {
                const parse = line.split(',');
                if (!parse[0]) {
                    return false;
                }
                if (parse[0] === 'prize') {
                    isUser = false;
                    return false;
                }
                if (isUser) {
                    let isRepeat = false;
                    for (let i = 0; i < user.length; i++) {
                        if (user[i][0] === parse[0].trim()) {
                            let count = parse[1];
                            let mail = parse[2];
                            if (isValidString(parse[1], 'email')) {
                                count = parse[2];
                                mail = parse[1];
                            }
                            user[i][1] = count ? user[i][1] + (+count) : user[i][1] + 1;
                            if (!user[i][2]) {
                                user[i][2] = mail;
                            }
                            if (parse[26]) {
                                if (user[i][3]) {
                                    user[i][3] += (+parse[26]);
                                } else {
                                    user[i].push(+parse[26]);
                                }
                            }
                            if (parse.length > 27) {
                                for (let j = 27; j < parse.length; j++) {
                                    if (!parse[j]) {
                                        break;
                                    }
                                    if (user[i].length < 4) {
                                        user[i].push(0);
                                    }
                                    user[i].push(+parse[j]-1);
                                }
                            }
                            isRepeat = true;
                            break;
                        }
                    }
                    if (!isRepeat) {
                        let count = parse[1];
                        let mail = parse[2];
                        if (isValidString(parse[1], 'email')) {
                            count = parse[2];
                            mail = parse[1];
                        }
                        const u = [parse[0].trim(), count ? +count : 1, mail];
                        if (parse[26]) {
                            u.push(+parse[26]);
                        }
                        if (parse.length > 27) {
                            for (let j = 27; j < parse.length; j++) {
                                if (!parse[j]) {
                                    break;
                                }
                                if (u.length < 4) {
                                    u.push(0);
                                }
                                u.push(+parse[j]-1);
                            }
                        }
                        user.push(u);
                    }
                } else {
                    reward.push([parse[0].trim(), parse[1] ? +parse[1] : 1]);
                }
            }).on('close', () => {
                if (user.length < 1 || reward.length < 1) {
                    reject(new HoError('user or prize is empty!!!'));
                } else {
                    resolve({user, reward});
                }
            });
        }));
    },
    select: function(uid, owner) {
        const id = isValidString(uid, 'uid');
        if (!id) {
            return handleError(new HoError('invalid uid'));
        }
        return Mongo('find', LOTTERYDB, {type: 0}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('lottery is not exist'));
            }
            if (!owner.equals(items[0].owner)) {
                return handleError(new HoError('You are not the owner'));
            }
            const lotteryName = items[0].name;
            const remove = items[0].option[0];
            const multiple = items[0].option[1];
            return Mongo('find', LOTTERYDB, {_id: id}, {limit: 1}).then(rewards => {
                if (rewards.length < 1) {
                    return handleError(new HoError('Prize is not exist!!!'));
                }
                console.log(rewards);
                const rewardName = rewards[0].name;
                const type = typeof rewards[0].utime;
                const quantity = type === 'object' ? 0 : type === 'number' ? rewards[0].count - rewards[0].utime : rewards[0].count;
                const prizedlist = [];
                const number = rewards[0].owner;
                if (quantity < 1) {
                    return handleError(new HoError('Prize has already opened!!!'));
                }
                let userlist = [];
                let rewardlist = new Map();
                console.log(quantity);
                //reward以後者優先
                return Mongo('find', LOTTERYDB, {type: 2}).then(items => {
                    items.forEach(item => {
                        let q = item.count;
                        if (item.option.length > 1) {
                            q = multiple ? q - item.option.length + 1 : 0;
                            for (let i = 1; i < item.option.length; i++) {
                                rewardlist.set(item.option[i], {
                                    id: item._id,
                                    name: item.name,
                                    count: item.count,
                                    mail: item.utime,
                                });
                            }
                        }
                        if (q > 0) {
                            if (item.option.length > 0) {
                                q += item.option[0];
                            }
                            for (let i = 0; i < q; i++) {
                                userlist.push({
                                    id: item._id,
                                    name: item.name,
                                    count: item.count,
                                    mail: item.utime,
                                });
                            }
                        }
                    });
                    for (let i = 0; i < quantity; i++) {
                        let black = false;
                        let name = '';
                        if (rewardlist.has(number)) {
                            black = true;
                            name = rewardlist.get(number);
                            rewardlist.delete(number);
                        }
                        if (!black) {
                            if (userlist.length < 1) {
                                if (rewardlist.size > 0) {
                                    for(let j of rewardlist.keys()) {
                                        name = rewardlist.get(j);
                                        rewardlist.delete(j);
                                        break;
                                    }
                                    prizedlist.push(name);
                                    continue;
                                } else {
                                    break;
                                }
                            }
                            const result = Math.floor(Math.random() * userlist.length);
                            name = userlist[result];
                            if (remove) {
                                if (multiple) {
                                    userlist.splice(result,1);
                                } else {
                                    userlist = userlist.filter(v => v.name !== name.name);
                                }
                            }
                        }
                        prizedlist.push(name);
                    }
                    if (prizedlist.length < 1) {
                        return handleError(new HoError('There is no user left!!!'));
                    }
                    //db
                    let utime = rewards[0].utime ? rewards[0].utime + prizedlist.length : prizedlist.length;
                    if (utime >= rewards[0].count) {
                        utime = Math.round(new Date().getTime() / 1000);
                    }
                    const namelist = prizedlist.map(n => n.name);
                    return Mongo('update', LOTTERYDB, {_id: rewards[0]._id}, {$set: {
                        utime,
                        option: rewards[0].option.concat(namelist),
                    }}).then(item2 => {
                        if (remove) {
                            const recurUser = index => {
                                if (index >= prizedlist.length) {
                                    return Promise.resolve();
                                } else {
                                    if (multiple) {
                                        const count = prizedlist[index].count--;
                                        return (count < 1) ? Mongo('remove', LOTTERYDB, {
                                            _id: prizedlist[index].id,
                                            $isolated: 1,
                                        }).then(item3 => recurUser(index + 1)) : Mongo('update', LOTTERYDB, {_id: prizedlist[index].id}, {$set: {count}}).then(item3 => recurUser(index + 1));
                                    } else {
                                        return Mongo('remove', LOTTERYDB, {
                                            _id: prizedlist[index].id,
                                            $isolated: 1,
                                        }).then(item3 => recurUser(index + 1));
                                    }
                                }
                            }
                            return recurUser(0);
                        } else {
                            return Promise.resolve();
                        }
                    }).then(() => {
                        const recurSend = index => {
                            if (index >= prizedlist.length) {
                                return Promise.resolve();
                            } else {
                                if (isValidString(prizedlist[index].mail, 'email')) {
                                    return sendLotteryName(lotteryName, `恭喜${prizedlist[index].name}獲得${rewardName}！！！`, prizedlist[index].mail).then(() => recurSend(index + 1));
                                } else {
                                    return recurSend(index + 1);
                                }
                            }
                        }
                        console.log(namelist);
                        return recurSend(0).then(() => ({namelist, id, rewardName}));
                    });
                });
            });
        });
    },
    downloadCsv: function(user) {
        return Mongo('find', LOTTERYDB, {type: 0}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('lottery is not exist'));
            }
            if (checkAdmin(1 ,user) && !user._id.equals(items[0].owner)) {
                return handleError(new HoError('You are not the owner'));
            }
            const utfPath = `${NAS_TMP(ENV_TYPE)}/lotteryoutput.csv`;
            return Mongo('remove', LOTTERYDB, {$isolated: 1}).then(() => ({
                path: utfPath,
                name: items[0].name,
            }));
        });
    },
    outputCsv: function(user) {
        return Mongo('find', LOTTERYDB, {type: 0}, {limit: 1}).then(items => {
            if (items.length < 1) {
                return handleError(new HoError('lottery is not exist'));
            }
            if (checkAdmin(1 ,user) && !user._id.equals(items[0].owner)) {
                return handleError(new HoError('You are not the owner'));
            }
            const big5 = items[0].count;
            return Mongo('find', LOTTERYDB, {type: 2}, {
                sort: [[
                    'owner',
                    'asc',
                ]]
            }).then(items => items.map(item => (item.option.length > 0) ? [item.name, item.count, item.utime,'','','','','','','','','','','','','','','','','','','','','','',''].concat(item.option.map((o, i) => (i > 0) ? o + 1 : o)) : [item.name, item.count, item.utime])).then(user => {
                return Mongo('find', LOTTERYDB, {type: 1}, {
                    sort: [[
                        'owner',
                        'asc',
                    ]]
                }).then(items => items.map(item => [item.name, item.count].concat(item.option))).then(reward => {
                    const output = user.concat([['prize']]).concat(reward);
                    const utfPath = `${NAS_TMP(ENV_TYPE)}/lotteryoutput.csv`;
                    const recur = index => (index >= output.length) ? Promise.resolve() : new Promise((resolve, reject) => FsAppendFile(utfPath, big5 ? IconvEncode(`${output[index].join(',')}\n`, 'big5') : `${output[index].join(',')}\n`, big5 ? {} : 'utf8', err => err ? reject(err) : resolve())).then(() => recur(index + 1));
                    return FsExistsSync(utfPath) ? new Promise((resolve, reject) => FsUnlink(utfPath, err => err ? reject(err) : resolve())).then(() => recur(0)) : recur(0);
                });
            });
        });
    },
}
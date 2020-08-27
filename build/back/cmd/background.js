'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.filterBitfinex = exports.checkSetOffer = exports.setUserOffer = exports.rateCalculator = exports.checkStock = exports.dbBackup = exports.filterStock = exports.updateStock = exports.updateExternal = exports.checkMedia = exports.autoDownload = exports.autoUpload = undefined;

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _ver = require('../../../ver');

var _config = require('../config');

var _constants = require('../constants');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _stockTool = require('../models/stock-tool.js');

var _stockTool2 = _interopRequireDefault(_stockTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _tagTool = require('../models/tag-tool');

var _externalTool = require('../models/external-tool');

var _externalTool2 = _interopRequireDefault(_externalTool);

var _bitfinexTool = require('../models/bitfinex-tool');

var _apiToolPlaylist = require('../models/api-tool-playlist');

var _apiToolPlaylist2 = _interopRequireDefault(_apiToolPlaylist);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _cmd = require('./cmd');

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var stock_batch_list = [];
var stock_batch_list_2 = [];

var lastSetOffer = 0;

function bgError(err, type) {
    (0, _sendWs2.default)(type + ': ' + (err.message || err.msg), 0, 0, true);
    (0, _utility.handleError)(err, type);
}

var autoUpload = exports.autoUpload = function autoUpload() {
    if ((0, _config.AUTO_UPLOAD)(_ver.ENV_TYPE)) {
        var _ret = function () {
            var loopDrive = function loopDrive() {
                console.log('loopDrive');
                console.log(new Date());
                return (0, _mongoTool2.default)('find', _constants.USERDB, { auto: { $exists: true } }).then(function (userlist) {
                    return (0, _apiToolGoogle.userDrive)(userlist, 0);
                }).catch(function (err) {
                    return bgError(err, 'Loop drive');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.DRIVE_INTERVAL * 1000);
                    });
                }).then(function () {
                    return loopDrive();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 60000);
                }).then(function () {
                    return loopDrive();
                })
            };
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    }
};

var autoDownload = exports.autoDownload = function autoDownload() {
    if ((0, _config.AUTO_DOWNLOAD)(_ver.ENV_TYPE)) {
        var _ret2 = function () {
            var loopDoc = function loopDoc() {
                console.log('loopDoc');
                console.log(new Date());
                return (0, _mongoTool2.default)('find', _constants.USERDB, {
                    auto: { $exists: true },
                    perm: 1
                }).then(function (userlist) {
                    switch (new Date().getHours()) {
                        case 11:
                            return (0, _apiToolGoogle.autoDoc)(userlist, 0, 'am');
                        case 17:
                            return (0, _apiToolGoogle.autoDoc)(userlist, 0, 'jp');
                        case 18:
                            return (0, _apiToolGoogle.autoDoc)(userlist, 0, 'tw');
                        default:
                            return _promise2.default.resolve();
                    }
                }).catch(function (err) {
                    return bgError(err, 'Loop doc');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.DOC_INTERVAL * 1000);
                    });
                }).then(function () {
                    return loopDoc();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 120000);
                }).then(function () {
                    return loopDoc();
                })
            };
        }();

        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
    }
};

var checkMedia = exports.checkMedia = function checkMedia() {
    if ((0, _config.CHECK_MEDIA)(_ver.ENV_TYPE)) {
        var _ret3 = function () {
            var loopHandleMedia = function loopHandleMedia() {
                console.log('loopCheckMedia');
                console.log(new Date());
                return (0, _apiToolPlaylist2.default)('playlist kick').then(function () {
                    return _mediaHandleTool2.default.checkMedia();
                }).catch(function (err) {
                    return bgError(err, 'Loop checkMedia');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.MEDIA_INTERVAl * 1000);
                    });
                }).then(function () {
                    return loopHandleMedia();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 180000);
                }).then(function () {
                    return loopHandleMedia();
                })
            };
        }();

        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
    }
};

var updateExternal = exports.updateExternal = function updateExternal() {
    if ((0, _config.UPDATE_EXTERNAL)(_ver.ENV_TYPE)) {
        var _ret4 = function () {
            var loopUpdateExternal = function loopUpdateExternal() {
                console.log('loopUpdateExternal');
                console.log(new Date());
                console.log('complete tag');
                //return completeMimeTag(1).then(() => External.getList('lovetv')).then(() => External.getList('eztv')).catch(err => bgError(err, 'Loop updateExternal')).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), EXTERNAL_INTERVAL * 1000))).then(() => loopUpdateExternal());
                return (0, _tagTool.completeMimeTag)(1).then(function () {
                    return _externalTool2.default.getList('eztv');
                }).catch(function (err) {
                    return bgError(err, 'Loop updateExternal');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.EXTERNAL_INTERVAL * 1000);
                    });
                }).then(function () {
                    return loopUpdateExternal();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 240000);
                }).then(function () {
                    return loopUpdateExternal();
                })
            };
        }();

        if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
    }
};

var updateStockAnnual = function updateStockAnnual(year, folderList, updateList, index, uIndex) {
    console.log('updateAnnual');
    console.log(new Date());
    console.log(year);
    console.log(folderList[index]);
    console.log(updateList[uIndex]);
    return (0, _stockTool.getSingleAnnual)(year, folderList[index], updateList[uIndex]).then(function () {
        uIndex++;
        if (uIndex < updateList.length) {
            return updateStockAnnual(year, folderList, updateList, index, uIndex);
        } else {
            index++;
            if (index < folderList.length) {
                return updateStockAnnual(year, folderList, updateList, index, 0);
            }
        }
    });
};

var updateStockList = function updateStockList(list, type) {
    console.log('updateStockList');
    console.log(new Date());
    console.log(list[0]);
    return _stockTool2.default.getSingleStockV2(type, list[0], (0, _config.STOCK_MODE)(_ver.ENV_TYPE)).then(function () {
        list.splice(0, 1);
        if (list.length > 0) {
            return updateStockList(list, type);
        }
    });
};

var updateStock = exports.updateStock = function updateStock() {
    if ((0, _config.UPDATE_STOCK)(_ver.ENV_TYPE)) {
        var _ret5 = function () {
            var loopUpdateStock = function loopUpdateStock() {
                console.log('loopUpdateStock');
                console.log(new Date());
                var sDay = (0, _config.STOCK_DATE)(_ver.ENV_TYPE).indexOf(new Date().getDate());
                console.log(sDay);
                /*let use_stock_list = stock_batch_list;
                if (stock_batch_list.length > 0) {
                    console.log('stock_batch_list remain');
                    console.log(stock_batch_list.length);
                    stock_batch_list_2 = [...stock_batch_list];
                    stock_batch_list = [];
                    use_stock_list = stock_batch_list_2;
                } else if (stock_batch_list_2.length > 0) {
                    console.log('stock_batch_list_2 remain');
                    console.log(stock_batch_list_2.length);
                    stock_batch_list = [...stock_batch_list_2];
                    stock_batch_list_2 = [];
                    use_stock_list = stock_batch_list;
                }*/
                var use_stock_list = [];
                var parseStockList = function parseStockList() {
                    return sDay === -1 ? _promise2.default.resolve() : (0, _stockTool.getStockListV2)('twse', new Date().getFullYear(), new Date().getMonth() + 1).then(function (stocklist) {
                        /*Mongo('find', STOCKDB, {important: 1}).then(items => {
                        let annualList = [];
                        const year = new Date().getFullYear();
                        items.forEach(i => {
                        if (annualList.indexOf(i.index) === -1) {
                        annualList.push(i.index);
                        }
                        });*/
                        stocklist.forEach(function (i) {
                            if (use_stock_list.indexOf(i) === -1) {
                                use_stock_list.push(i);
                            }
                        });
                        /*let folderList = [];
                        const recur_find = (userlist, index) => (index < userlist.length) ? GoogleApi('list folder', {
                            folderId: userlist[index].auto,
                            name: 'downloaded',
                        }).then(downloadedList => {
                            if (downloadedList.length > 0) {
                                folderList.push(downloadedList[0].id);
                            }
                            return recur_find(userlist, index + 1);
                        }) : (folderList.length > 0) ? updateStockAnnual(year, folderList, annualList, 0, 0): Promise.resolve();
                        const nextUpdate = () => (annualList.length > 0) ? Mongo('find', USERDB, {
                            auto: {$exists: true},
                            perm: 1,
                        }).then(userlist => recur_find(userlist, 0)) : Promise.resolve();
                        return nextUpdate().then(() => updateStockList(use_stock_list, 'twse'));
                        }));*/
                        return updateStockList(use_stock_list, 'twse');
                    });
                };
                return parseStockList().catch(function (err) {
                    return bgError(err, 'Loop updateStock');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.STOCK_INTERVAL * 1000);
                    });
                }).then(function () {
                    return loopUpdateStock();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 300000);
                }).then(function () {
                    return loopUpdateStock();
                })
            };
        }();

        if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
    }
};

var filterStock = exports.filterStock = function filterStock() {
    //get db
    if ((0, _config.STOCK_FILTER)(_ver.ENV_TYPE)) {
        var _ret6 = function () {
            var loopStockFilter = function loopStockFilter() {
                console.log('loopStockFilter');
                console.log(new Date());
                var sd = new Date();
                var sdf = function sdf() {
                    return sd.getDay() === 5 && sd.getHours() === 23 ? _stockTool2.default.stockFilterWarp() : _promise2.default.resolve();
                };
                return sdf().catch(function (err) {
                    return bgError(err, 'Loop stockFilter');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.DOC_INTERVAL * 1000);
                    });
                }).then(function () {
                    return loopStockFilter();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 360000);
                }).then(function () {
                    return loopStockFilter();
                })
            };
        }();

        if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
    }
};

//暫不刪除pi上的備份
var dbBackup = exports.dbBackup = function dbBackup() {
    if ((0, _config.DB_BACKUP)(_ver.ENV_TYPE)) {
        var _ret7 = function () {
            var allBackup = function allBackup() {
                console.log('allBackup');
                console.log(new Date());
                var sd = new Date();
                var backupDate = '' + sd.getFullYear() + (0, _utility.completeZero)(sd.getMonth() + 1, 2) + (0, _utility.completeZero)(sd.getDate(), 2);
                var singleBackup = function singleBackup(index) {
                    if (index >= _constants.BACKUP_COLLECTION.length) {
                        return (0, _apiToolGoogle.googleBackupDb)(backupDate);
                    }
                    console.log(_constants.BACKUP_COLLECTION[index]);
                    return (0, _cmd.dbDump)(_constants.BACKUP_COLLECTION[index], backupDate).then(function () {
                        return singleBackup(index + 1);
                    });
                };
                var sdf = function sdf() {
                    return sd.getDate() === 2 ? singleBackup(0) : _promise2.default.resolve();
                };
                return sdf().catch(function (err) {
                    return bgError(err, 'Loop stockFilter');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.BACKUP_INTERVAL * 1000);
                    });
                }).then(function () {
                    return allBackup();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 420000);
                }).then(function () {
                    return allBackup();
                })
            };
        }();

        if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
    }
};

var checkStock = exports.checkStock = function checkStock() {
    if ((0, _config.CHECK_STOCK)(_ver.ENV_TYPE)) {
        var _ret8 = function () {
            var checkS = function checkS() {
                var newStr = new Date().getHours() >= 20 ? true : false;
                return (0, _stockTool.stockStatus)(newStr).catch(function (err) {
                    return bgError(err, 'Loop checkStock');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.PRICE_INTERVAL * 1000);
                    });
                }).then(function () {
                    return checkS();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 120000);
                }).then(function () {
                    return checkS();
                })
            };
        }();

        if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
    }
};

var rateCalculator = exports.rateCalculator = function rateCalculator() {
    if ((0, _config.BITFINEX_LOAN)(_ver.ENV_TYPE)) {
        var _ret9 = function () {
            var calR = function calR() {
                return (0, _bitfinexTool.calRate)([_constants.FUSD_SYM, _constants.FUSDT_SYM, _constants.FBTC_SYM, _constants.FETH_SYM, _constants.FOMG_SYM]).catch(function (err) {
                    return bgError(err, 'Loop rate calculator');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.RATE_INTERVAL * 1000);
                    });
                }).then(function () {
                    return calR();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 60000);
                }).then(function () {
                    return calR();
                })
            };
        }();

        if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
    }
};

var setUserOffer = exports.setUserOffer = function setUserOffer() {
    console.log('setUserOffer');
    console.log(new Date());
    if ((0, _config.BITFINEX_LOAN)(_ver.ENV_TYPE)) {
        var _ret10 = function () {
            var checkUser = function checkUser(index, userlist) {
                return index >= userlist.length ? _promise2.default.resolve() : (0, _bitfinexTool.setWsOffer)(userlist[index].username, userlist[index].bitfinex, userlist[index]._id).then(function () {
                    return checkUser(index + 1, userlist);
                });
            };
            var setO = function setO() {
                lastSetOffer = Math.round(new Date().getTime() / 1000);
                return (0, _mongoTool2.default)('find', _constants.USERDB, { bitfinex: { $exists: true } }).then(function (userlist) {
                    return checkUser(0, userlist).catch(function (err) {
                        if ((err.message || err.msg).includes('Maximum call stack size exceeded')) {
                            return (0, _bitfinexTool.resetBFX)();
                        } else {
                            (0, _bitfinexTool.resetBFX)(true);
                            return bgError(err, 'Loop set offer');
                        }
                    });
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.RATE_INTERVAL * 1000);
                    });
                }).then(function () {
                    return setO();
                });
            };
            if (lastSetOffer) {
                return {
                    v: setO()
                };
            } else {
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 90000);
                    }).then(function () {
                        return setO();
                    })
                };
            }
        }();

        if ((typeof _ret10 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret10)) === "object") return _ret10.v;
    }
};

var checkSetOffer = exports.checkSetOffer = function checkSetOffer() {
    if ((0, _config.BITFINEX_LOAN)(_ver.ENV_TYPE)) {
        var _ret11 = function () {
            var cso = function cso() {
                if (Math.round(new Date().getTime() / 1000) - lastSetOffer > 120) {
                    setUserOffer();
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, _constants.RATE_INTERVAL * 1000);
                }).then(function () {
                    return cso();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 120000);
                }).then(function () {
                    return cso();
                })
            };
        }();

        if ((typeof _ret11 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret11)) === "object") return _ret11.v;
    }
};

var filterBitfinex = exports.filterBitfinex = function filterBitfinex() {
    if ((0, _config.BITFINEX_FILTER)(_ver.ENV_TYPE)) {
        var _ret12 = function () {
            var cW = function cW() {
                return (0, _bitfinexTool.calWeb)(_constants.SUPPORT_PAIR[_constants.FUSD_SYM]).catch(function (err) {
                    return bgError(err, 'Loop bitfinex filter');
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, _constants.BACKUP_INTERVAL * 1000);
                    });
                }).then(function () {
                    return cW();
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 80000);
                }).then(function () {
                    return cW();
                })
            };
        }();

        if ((typeof _ret12 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret12)) === "object") return _ret12.v;
    }
};
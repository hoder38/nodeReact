'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.updateStock = exports.updateExternal = exports.checkMedia = exports.autoDownload = exports.autoUpload = undefined;

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

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

var _apiToolPlaylist = require('../models/api-tool-playlist');

var _apiToolPlaylist2 = _interopRequireDefault(_apiToolPlaylist);

var _apiToolGoogle = require('../models/api-tool-google');

var _apiToolGoogle2 = _interopRequireDefault(_apiToolGoogle);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var stock_batch_list = [];
var stock_batch_list_2 = [];

var autoUpload = exports.autoUpload = function autoUpload() {
    if ((0, _config.AUTO_UPLOAD)(_ver.ENV_TYPE)) {
        var _ret = function () {
            var loopDrive = function loopDrive() {
                console.log('loopDrive');
                console.log(new Date());
                return (0, _mongoTool2.default)('find', _constants.USERDB, { auto: { $exists: true } }).then(function (userlist) {
                    return (0, _apiToolGoogle.userDrive)(userlist, 0);
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
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Loop drive');
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
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Loop doc');
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
                    return _mediaHandleTool2.default.checkMedia().then(function () {
                        return new _promise2.default(function (resolve, reject) {
                            return setTimeout(function () {
                                return resolve();
                            }, _constants.MEDIA_INTERVAl * 1000);
                        });
                    }).then(function () {
                        return loopHandleMedia();
                    });
                });
            };
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 180000);
                }).then(function () {
                    return loopHandleMedia();
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Loop checkMedia');
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
                return (0, _tagTool.completeMimeTag)(1).then(function () {
                    return _externalTool2.default.getList('lovetv');
                }).then(function () {
                    return _externalTool2.default.getList('eztv');
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
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Loop updateExternal');
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
    return _stockTool2.default.getSingleStock(type, list[0], (0, _config.STOCK_MODE)(_ver.ENV_TYPE)).then(function () {
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
                var use_stock_list = stock_batch_list;
                if (stock_batch_list.length > 0) {
                    console.log('stock_batch_list remain');
                    console.log(stock_batch_list.length);
                    stock_batch_list_2 = [].concat((0, _toConsumableArray3.default)(stock_batch_list));
                    stock_batch_list = [];
                    use_stock_list = stock_batch_list_2;
                } else if (stock_batch_list_2.length > 0) {
                    console.log('stock_batch_list_2 remain');
                    console.log(stock_batch_list_2.length);
                    stock_batch_list = [].concat((0, _toConsumableArray3.default)(stock_batch_list_2));
                    stock_batch_list_2 = [];
                    use_stock_list = stock_batch_list;
                }
                var parseStockList = function parseStockList() {
                    return sDay === -1 ? _promise2.default.resolve() : (0, _stockTool.getStockList)('twse', Math.floor(sDay / 2) + 1).then(function (stocklist) {
                        return (0, _mongoTool2.default)('find', _constants.STOCKDB, { important: 1 }).then(function (items) {
                            var annualList = [];
                            var year = new Date().getFullYear();
                            items.forEach(function (i) {
                                if (use_stock_list.indexOf(i.index) === -1) {
                                    use_stock_list.push(i.index);
                                }
                                if (annualList.indexOf(i.index) === -1) {
                                    annualList.push(i.index);
                                }
                            });
                            stocklist.forEach(function (i) {
                                if (use_stock_list.indexOf(i) === -1) {
                                    use_stock_list.push(i);
                                }
                            });
                            var folderList = [];
                            var recur_find = function recur_find(userlist, index) {
                                return index < userlist.length ? (0, _apiToolGoogle2.default)('list folder', {
                                    folderId: userlist[index].auto,
                                    name: 'downloaded'
                                }).then(function (downloadedList) {
                                    if (downloadedList.length > 0) {
                                        folderList.push(downloadedList[0].id);
                                    }
                                    return recur_find(userlist, index + 1);
                                }) : folderList.length > 0 ? updateStockAnnual(year, folderList, annualList, 0, 0) : _promise2.default.resolve();
                            };
                            var nextUpdate = function nextUpdate() {
                                return annualList.length > 0 ? (0, _mongoTool2.default)('find', _constants.USERDB, {
                                    auto: { $exists: true },
                                    perm: 1
                                }).then(function (userlist) {
                                    return recur_find(userlist, 0);
                                }) : _promise2.default.resolve();
                            };
                            return nextUpdate().then(function () {
                                return updateStockList(use_stock_list, 'twse');
                            });
                        });
                    });
                };
                return parseStockList().then(function () {
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
                    }, 20000);
                }).then(function () {
                    return loopUpdateStock();
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Loop updateStock');
                })
            };
        }();

        if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
    }
};
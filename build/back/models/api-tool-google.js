'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.default = api;
exports.googleBackup = googleBackup;
exports.googleDownloadSubtitle = googleDownloadSubtitle;
exports.userDrive = userDrive;
exports.autoDoc = autoDoc;

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _googleapis = require('googleapis');

var _googleapis2 = _interopRequireDefault(_googleapis);

var _nodeFetch = require('node-fetch');

var _nodeFetch2 = _interopRequireDefault(_nodeFetch);

var _youtubeDl = require('youtube-dl');

var _youtubeDl2 = _interopRequireDefault(_youtubeDl);

var _path = require('path');

var _child_process = require('child_process');

var _child_process2 = _interopRequireDefault(_child_process);

var _mkdirp = require('mkdirp');

var _mkdirp2 = _interopRequireDefault(_mkdirp);

var _fs = require('fs');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _mediaHandleTool = require('../models/mediaHandle-tool');

var _mediaHandleTool2 = _interopRequireDefault(_mediaHandleTool);

var _externalTool = require('../models/external-tool');

var _externalTool2 = _interopRequireDefault(_externalTool);

var _utility = require('../util/utility');

var _mime = require('../util/mime');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var OAuth2 = _googleapis2.default.auth.OAuth2;
var oauth2Client = new OAuth2(_ver.GOOGLE_ID, _ver.GOOGLE_SECRET, _ver.GOOGLE_REDIRECT);
var tokens = {};
var api_ing = 0;
var api_pool = [];
var api_duration = 0;
var api_lock = false;

var setLock = function setLock() {
    console.log(api_lock);
    return api_lock ? new _promise2.default(function (resolve, reject) {
        return setTimeout(function () {
            return resolve(setLock());
        }, 500);
    }) : _promise2.default.resolve(api_lock = true);
};

function api(name, data) {
    console.log(name);
    console.log(data);
    return checkOauth().then(function () {
        if (name.match(/^y /)) {
            return youtubeAPI(name, data);
        }
        switch (name) {
            case 'stop':
                return stopApi();
            case 'list folder':
                return list(data);
            case 'list file':
                return listFile(data);
            case 'create':
                return create(data);
            case 'delete':
                return deleteFile(data);
            case 'get':
                return getFile(data);
            case 'copy':
                return copyFile(data);
            case 'move parent':
                return moveParent(data);
            case 'upload':
                if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                    console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                    expire().catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                } else {
                    api_ing++;
                    console.log('go ' + api_ing + ' ' + api_pool.length);
                    upload(data).catch(function (err) {
                        return handle_err(err, data.user);
                    }).then(function (rest) {
                        return get(rest);
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 500);
                });
            case 'download':
                if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                    console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                    expire().catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                } else {
                    api_ing++;
                    console.log('go ' + api_ing + ' ' + api_pool.length);
                    download(data).catch(function (err) {
                        return handle_err(err, data.user);
                    }).then(function (rest) {
                        return get(rest);
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 500);
                });
            case 'download media':
                if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                    console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                    expire().catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                } else {
                    api_ing++;
                    console.log('go ' + api_ing + ' ' + api_pool.length);
                    downloadMedia(data).catch(function (err) {
                        return handle_err(err, data.user);
                    }).then(function (rest) {
                        return get(rest);
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 500);
                });
            case 'download present':
                if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                    console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                    expire().catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                } else {
                    api_ing++;
                    console.log('go ' + api_ing + ' ' + api_pool.length);
                    downloadPresent(data).catch(function (err) {
                        return handle_err(err, data.user);
                    }).then(function (rest) {
                        return get(rest);
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 500);
                });
            case 'download doc':
                if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                    console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                    expire().catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                } else {
                    api_ing++;
                    console.log('go ' + api_ing + ' ' + api_pool.length);
                    downloadDoc(data).catch(function (err) {
                        return handle_err(err, data.user);
                    }).then(function (rest) {
                        return get(rest);
                    }).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Google api');
                    });
                }
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 500);
                });
            default:
                return _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('unknown api')));
        }
    });
}

function handle_err(err, user) {
    (0, _utility.handleError)(err, 'Google api');
    (0, _sendWs2.default)({
        type: user.username,
        data: 'Google api fail: ' + err.message
    }, 0);
}

function get() {
    var rest = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

    api_duration = 0;
    if (api_ing > 0) {
        api_ing--;
    }
    console.log('get google ' + api_ing + ' ' + api_pool.length);
    if (rest && typeof rest === 'function') {
        rest().catch(function (err) {
            return (0, _utility.handleError)(err, 'Google api rest');
        });
    }
    if (api_pool.length > 0) {
        var _ret = function () {
            var fun = api_pool.splice(0, 1)[0];
            if (fun) {
                switch (fun.name) {
                    case 'upload':
                        return {
                            v: upload(fun.data).catch(function (err) {
                                return handle_err(err, fun.data.user);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    case 'download':
                        return {
                            v: download(fun.data).catch(function (err) {
                                return handle_err(err, fun.data.user);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    case 'download media':
                        return {
                            v: downloadMedia(fun.data).catch(function (err) {
                                return handle_err(err, fun.data.user);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    case 'download present':
                        return {
                            v: downloadPresent(fun.data).catch(function (err) {
                                return handle_err(err, fun.data.user);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    case 'download doc':
                        return {
                            v: downloadDoc(fun.data).catch(function (err) {
                                return handle_err(err, fun.data.user);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    default:
                        return {
                            v: _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('unknown google api'))).catch(function (err) {
                                return (0, _utility.handleError)(err, 'Google api');
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                }
            }
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    }
    console.log('empty google ' + api_ing + ' ' + api_pool.length);
    return _promise2.default.resolve();
}

function expire() {
    console.log('expire google ' + api_ing + ' ' + api_pool.length);
    return setLock().then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        api_pool.push({
            name: name,
            data: data
        });
        var now = new Date().getTime() / 1000;
        if (!api_duration) {
            api_duration = now;
        } else if (now - api_duration > _constants.API_EXPIRE) {
            api_duration = 0;
            if (api_pool.length > 0) {
                var _ret2 = function () {
                    var fun = api_pool.splice(0, 1)[0];
                    if (fun) {
                        api_lock = false;
                        switch (fun.name) {
                            case 'upload':
                                return {
                                    v: upload(fun.data).catch(function (err) {
                                        return handle_err(err, fun.data.user);
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                            case 'download':
                                return {
                                    v: download(fun.data).catch(function (err) {
                                        return handle_err(err, fun.data.user);
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                            case 'download media':
                                return {
                                    v: downloadMedia(fun.data).catch(function (err) {
                                        return handle_err(err, fun.data.user);
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                            case 'download present':
                                return {
                                    v: downloadPresent(fun.data).catch(function (err) {
                                        return handle_err(err, fun.data.user);
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                            case 'download doc':
                                return {
                                    v: downloadDoc(fun.data).catch(function (err) {
                                        return handle_err(err, fun.data.user);
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                            default:
                                return {
                                    v: _promise2.default.reject((0, _utility.handleError)(new _utility.HoError('unknown google api'))).catch(function (err) {
                                        return (0, _utility.handleError)(err, 'Google api');
                                    }).then(function (rest) {
                                        return get(rest);
                                    })
                                };
                        }
                    }
                }();

                if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
            }
        }
        api_lock = false;
        console.log('empty google ' + api_ing + ' ' + api_pool.length);
        return _promise2.default.resolve();
    });
}

var checkOauth = function checkOauth() {
    return !tokens.access_token || !tokens.expiry_date ? (0, _mongoTool2.default)('find', 'accessToken', { api: 'google' }, { limit: 1 }).then(function (token) {
        if (token.length === 0) {
            (0, _utility.handleError)(new _utility.HoError('can not find token'));
        }
        console.log('first');
        tokens = token[0];
    }).then(function () {
        return setToken();
    }) : setToken();
};

var setToken = function setToken() {
    oauth2Client.setCredentials(tokens);
    return tokens.expiry_date < Date.now() - 600000 ? new _promise2.default(function (resolve, reject) {
        return oauth2Client.refreshAccessToken(function (err, refresh_tokens) {
            return err ? reject(err) : resolve(refresh_tokens);
        });
    }).then(function (token) {
        return (0, _mongoTool2.default)('update', 'accessToken', { api: 'google' }, { $set: token }).then(function (result) {
            console.log('expire');
            console.log(result);
            console.log(token);
            tokens = token;
            oauth2Client.setCredentials(tokens);
        });
    }) : _promise2.default.resolve();
};

function youtubeAPI(method, data) {
    var youtube = _googleapis2.default.youtube({
        version: 'v3',
        auth: oauth2Client
    });

    var _ret3 = function () {
        switch (method) {
            case 'y search':
                if (!data['order'] || !data['maxResults'] || !data['type']) {
                    (0, _utility.handleError)(new _utility.HoError('search parameter lost!!!'));
                }
                if (data['id_arr'] && data['id_arr'].length > 0) {
                    data['maxResults'] = data['id_arr'].length > 20 ? 0 : data['maxResults'] - data['id_arr'].length;
                }
                var type = '';
                switch (data['type']) {
                    case 1:
                    case 2:
                        type = 'video';
                        break;
                    case 10:
                    case 20:
                        type = 'playlist';
                        break;
                    default:
                        type = 'video,playlist';
                        break;
                }
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return youtube.search.list((0, _assign2.default)({
                            part: 'id',
                            maxResults: data['maxResults'],
                            order: data['order'],
                            type: type
                        }, data['keyword'] ? { q: data['keyword'] } : {}, data['channelId'] ? { channelId: data['channelId'] } : {}, data['pageToken'] ? { pageToken: data['pageToken'] } : {}), function (err, metadata) {
                            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata);
                        });
                    }).then(function (metadata) {
                        if (!metadata.items) {
                            (0, _utility.handleError)(new _utility.HoError('search error'));
                        }
                        var video_id = new _set2.default();
                        var playlist_id = new _set2.default();
                        if (metadata.items.length > 0 || data.id_arr && data.id_arr.length > 0 || data.pl_arr && data.pl_arr.length > 0) {
                            if (data.id_arr) {
                                video_id = new _set2.default(data.id_arr);
                            }
                            if (data.pl_arr) {
                                playlist_id = new _set2.default(data.pl_arr[i]);
                            }
                            metadata.items.forEach(function (i) {
                                if (i.id) {
                                    if (i.id.videoId) {
                                        video_id.add(i.id.videoId);
                                    } else if (i.id.playlistId) {
                                        playlist_id.add(i.id.playlistId);
                                    }
                                }
                            });
                        }
                        return {
                            type: data['type'],
                            video: [].concat((0, _toConsumableArray3.default)(video_id)).join(','),
                            playlist: [].concat((0, _toConsumableArray3.default)(playlist_id)).join(','),
                            nextPageToken: metadata.nextPageToken
                        };
                    })
                };
            case 'y video':
                if (!data['id']) {
                    return {
                        v: []
                    };
                }
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return youtube.videos.list({
                            part: 'snippet,statistics',
                            id: data['id']
                        }, function (err, metadata) {
                            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata.items);
                        });
                    })
                };
            case 'y channel':
                if (!data['id']) {
                    (0, _utility.handleError)(new _utility.HoError('channel parameter lost!!!'));
                }
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return youtube.channels.list({
                            part: 'snippet, brandingSettings',
                            id: data['id']
                        }, function (err, metadata) {
                            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata);
                        });
                    })
                };
            case 'y playlist':
                if (!data['id']) {
                    return {
                        v: []
                    };
                }
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return youtube.playlists.list({
                            part: 'snippet',
                            id: data['id']
                        }, function (err, metadata) {
                            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata.items);
                        });
                    })
                };
            case 'y playItem':
                if (!data['id']) {
                    (0, _utility.handleError)(new _utility.HoError('playItem parameter lost!!!'));
                }
                return {
                    v: new _promise2.default(function (resolve, reject) {
                        return youtube.playlistItems.list((0, _assign2.default)({
                            part: 'snippet',
                            playlistId: data['id'],
                            maxResults: 20
                        }, data['pageToken'] ? { pageToken: data['pageToken'] } : {}), function (err, metadata) {
                            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve([metadata.items.map(function (i) {
                                return {
                                    id: 'you_' + i.snippet.resourceId.videoId,
                                    index: i.snippet.position + 1,
                                    showId: i.snippet.position + 1
                                };
                            }), metadata.pageInfo.totalResults, metadata.nextPageToken, metadata.prevPageToken]);
                        });
                    })
                };
            default:
                console.log(method);
                (0, _utility.handleError)(new _utility.HoError('youtube api unknown!!!'));
        }
    }();

    if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
}

function upload(data) {
    if (!data['type'] || !data['name'] || !data['filePath'] && !data['body']) {
        (0, _utility.handleError)(new _utility.HoError('upload parameter lost!!!'));
    }
    var parent = {};
    var mimeType = '*/*';
    switch (data['type']) {
        case 'media':
            parent = { id: (0, _config.GOOGLE_MEDIA_FOLDER)(_ver.ENV_TYPE) };
            mimeType = (0, _mime.mediaMIME)(data['name']);
            if (!mimeType) {
                (0, _utility.handleError)(new _utility.HoError('upload mime type unknown!!!'));
            }
            break;
        case 'backup':
            parent = { id: (0, _config.GOOGLE_BACKUP_FOLDER)(_ver.ENV_TYPE) };
            break;
        case 'auto':
            parent = { id: data['parent'] };
            mimeType = (0, _mime.mediaMIME)(data['name']);
            if (!mimeType) {
                mimeType = 'text/plain';
            }
            break;
        default:
            (0, _utility.handleError)(new _utility.HoError('upload type unknown!!!'));
    }
    var param = data['filePath'] ? {
        resource: {
            title: data['name'],
            mimeType: mimeType,
            parents: [parent]
        },
        media: {
            mimeType: mimeType,
            body: (0, _fs.createReadStream)(data['filePath'])
        }
    } : {
        resource: {
            title: data['name'],
            mimeType: 'text/plain',
            parents: [parent]
        },
        media: {
            mimeType: 'text/plain',
            body: data['body']
        }
    };
    if (data['convert'] && data['convert'] === true) {
        param['convert'] = true;
    }
    var proc = function proc(index) {
        return new _promise2.default(function (resolve, reject) {
            return _googleapis2.default.drive({
                version: 'v2',
                auth: oauth2Client
            }).files.insert(param, function (err, metadata) {
                return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata);
            });
        }).then(function (metadata) {
            console.log(metadata);
            if (data['rest']) {
                return function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 0);
                    }).then(function () {
                        return data['rest'](metadata);
                    }).catch(function (err) {
                        return data['errhandle'](err);
                    });
                };
            }
        }).catch(function (err) {
            console.log(index);
            console.log(_constants.MAX_RETRY);
            (0, _utility.handleError)(err, 'google upload');
            if (index > _constants.MAX_RETRY) {
                console.log(data);
                (0, _utility.handleError)(err);
            }
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(checkOauth());
                }, index * 1000);
            }).then(function () {
                return proc(index + 1);
            });
        });
    };
    return proc(1);
}

function stopApi() {
    api_ing = 0;
    return _promise2.default.resolve();
}

function list(data) {
    if (!data['folderId']) {
        (0, _utility.handleError)(new _utility.HoError('list parameter lost!!!'));
    }
    var find_name = data['name'] ? ' and title = \'' + data['name'] + '\'' : '';
    var proc = function proc(index) {
        return new _promise2.default(function (resolve, reject) {
            return _googleapis2.default.drive({
                version: 'v2',
                auth: oauth2Client
            }).files.list({
                q: '\'' + data['folderId'] + '\' in parents and trashed = false and mimeType = \'application/vnd.google-apps.folder\'' + find_name,
                maxResults: data['max'] ? data['max'] : _constants.DRIVE_LIMIT
            }, function (err, metadata) {
                return err && err.code !== 'ECONNRESET' ? reject((0, _utility.handleError)(err)) : resolve(metadata);
            });
        }).then(function (metadata) {
            if (metadata && metadata.items) {
                return metadata.items;
            } else {
                console.log('drive empty');
                console.log(metadata);
                console.log(index);
                return index > _constants.MAX_RETRY ? [] : new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve(proc(index + 1));
                    }, 3000);
                });
            }
        });
    };
    return proc(1);
}

function listFile(data) {
    if (!data['folderId']) {
        (0, _utility.handleError)(new _utility.HoError('list parameter lost!!!'));
    }
    if (data['max']) {
        max = data['max'];
    }
    var proc = function proc(index) {
        return new _promise2.default(function (resolve, reject) {
            return _googleapis2.default.drive({
                version: 'v2',
                auth: oauth2Client
            }).files.list({
                q: '\'' + data['folderId'] + '\' in parents and trashed = false and mimeType != \'application/vnd.google-apps.folder\'',
                maxResults: data['max'] ? data['max'] : _constants.DRIVE_LIMIT
            }, function (err, metadata) {
                return err && err.code !== 'ECONNRESET' ? reject((0, _utility.handleError)(err)) : resolve(metadata);
            });
        }).then(function (metadata) {
            return metadata.items;
        }).catch(function (err) {
            return err.code == '401' ? index > _constants.MAX_RETRY ? _promise2.default.reject(err) : new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(proc(index + 1));
                }, _constants.OATH_WAITING * 1000);
            }) : _promise2.default.reject(err);
        });
    };
    return proc(1);
}

function create(data) {
    if (!data['name'] || !data['parent']) {
        (0, _utility.handleError)(new _utility.HoError('create parameter lost!!!'));
    }
    return new _promise2.default(function (resolve, reject) {
        return _googleapis2.default.drive({
            version: 'v2',
            auth: oauth2Client
        }).files.insert({ resource: {
                title: data['name'],
                mimeType: 'application/vnd.google-apps.folder',
                parents: [{ id: data['parent'] }]
            } }, function (err, metadata) {
            return err && err.code !== 'ECONNRESET' ? reject((0, _utility.handleError)(err)) : resolve(metadata);
        });
    });
}

function download(data) {
    if (!data['url'] || !data['filePath']) {
        (0, _utility.handleError)(new _utility.HoError('download parameter lost!!!'));
    }
    var temp = data['filePath'] + '_t';
    var checkTmp = function checkTmp() {
        return (0, _fs.existsSync)(temp) ? new _promise2.default(function (resolve, reject) {
            return (0, _fs.unlink)(temp, function (err) {
                return err ? reject(err) : resolve();
            });
        }) : _promise2.default.resolve();
    };
    var proc = function proc(index) {
        return (0, _nodeFetch2.default)(data['url'], { headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Bearer ' + oauth2Client.credentials.access_token
            } }).then(function (res) {
            return checkTmp().then(function () {
                return new _promise2.default(function (resolve, reject) {
                    var dest = (0, _fs.createWriteStream)(temp);
                    res.body.pipe(dest);
                    dest.on('finish', function () {
                        if (res.headers['content-length'] && Number(res.headers['content-length']) !== (0, _fs.statSync)(data['filePath'])['size']) {
                            (0, _utility.handleError)(new _utility.HoError('incomplete download'));
                        }
                        return resolve();
                    }).on('error', function (err) {
                        return reject(err);
                    });
                });
            });
        }).then(function () {
            (0, _fs.renameSync)(temp, data['filePath']);
            if (data['rest']) {
                return function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 0);
                    }).then(function () {
                        return data['rest']();
                    }).catch(function (err) {
                        return data['errhandle'](err);
                    });
                };
            }
        }).catch(function (err) {
            console.log(index);
            (0, _utility.handleError)(err, 'Google Fetch');
            if (index > _constants.MAX_RETRY) {
                console.log(data['url']);
                (0, _utility.handleError)(new _utility.HoError('timeout'));
            }
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(proc(index + 1));
                }, index * 1000);
            });
        });
    };
    return proc(1);
}

function deleteFile(data) {
    if (!data['fileId']) {
        (0, _utility.handleError)(new _utility.HoError('delete parameter lost!!!'));
    }
    return new _promise2.default(function (resolve, reject) {
        return _googleapis2.default.drive({
            version: 'v2',
            auth: oauth2Client
        }).files.trash({ fileId: data['fileId'] }, function (err) {
            return err && err.code !== 'ECONNRESET' ? reject((0, _utility.handleError)(err)) : resolve();
        });
    });
}

function getFile(data) {
    if (!data['fileId']) {
        (0, _utility.handleError)(new _utility.HoError('get parameter lost!!!'));
    }
    return new _promise2.default(function (resolve, reject) {
        return _googleapis2.default.drive({
            version: 'v2',
            auth: oauth2Client
        }).files.get({ fileId: data['fileId'] }, function (err, metadata) {
            return err && err.code !== 'ECONNRESET' ? reject((0, _utility.handleError)(err)) : resolve(metadata);
        });
    });
}

function copyFile(data) {
    if (!data['fileId']) {
        (0, _utility.handleError)(new _utility.HoError('copy parameter lost!!!'));
    }
    return new _promise2.default(function (resolve, reject) {
        return _googleapis2.default.drive({
            version: 'v2',
            auth: oauth2Client
        }).files.copy({ fileId: data['fileId'] }, function (err, metadata) {
            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve(metadata);
        });
    });
}

function moveParent(data) {
    if (!data['fileId'] || !data['rmFolderId'] || !data['addFolderId']) {
        (0, _utility.handleError)(new _utility.HoError('move parent parameter lost!!!'));
    }
    return new _promise2.default(function (resolve, reject) {
        return _googleapis2.default.drive({
            version: 'v2',
            auth: oauth2Client
        }).files.patch({
            fileId: data['fileId'],
            removeParents: data['rmFolderId'],
            addParents: data['addFolderId']
        }, function (err) {
            return err && err.code !== 'ECONNRESET' ? reject(err) : resolve();
        });
    });
}

function downloadMedia(data) {
    if (!data['key'] || !data['filePath']) {
        (0, _utility.handleError)(new _utility.HoError('get parameter lost!!!'));
    }
    var proc = function proc(index) {
        return new _promise2.default(function (resolve, reject) {
            return _youtubeDl2.default.exec('https://drive.google.com/open?id=' + data['key'], ['-F'], { maxBuffer: 10 * 1024 * 1024 }, function (err, output) {
                return err ? reject(err) : resolve(output);
            });
        }).then(function (output) {
            var info = [];
            var _iteratorNormalCompletion = true;
            var _didIteratorError = false;
            var _iteratorError = undefined;

            try {
                for (var _iterator = (0, _getIterator3.default)(output), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                    var _i2 = _step.value;

                    var row = _i2.match(/^(\d+)\s+mp4\s+\d+x(\d+)/);
                    if (row) {
                        info.push({
                            id: row[1],
                            height: row[2]
                        });
                    }
                }
            } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
            } finally {
                try {
                    if (!_iteratorNormalCompletion && _iterator.return) {
                        _iterator.return();
                    }
                } finally {
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                }
            }

            console.log(info);
            var media_id = null;
            var currentHeight = 0;
            for (var _i in info) {
                if (info[_i].height >= data['hd']) {
                    if (info[_i].height > currentHeight) {
                        media_id = info[_i].id;
                        currentHeight = info[_i].height;
                    }
                }
            }
            console.log(media_id);
            if (!media_id) {
                (0, _utility.handleError)(new _utility.HoError('quality low'));
            }
            var getSavePath = function getSavePath() {
                return (0, _fs.existsSync)(data['filePath']) ? (0, _fs.existsSync)(data['filePath'] + '_t') ? new _promise2.default(function (resolve, reject) {
                    return (0, _fs.unlink)(data['filePath'] + '_t', function (err) {
                        return err ? reject(err) : resolve(data['filePath'] + '_t');
                    });
                }) : _promise2.default.resolve(data['filePath'] + '_t') : _promise2.default.resolve(data['filePath']);
            };
            return getSavePath().then(function (savePath) {
                return new _promise2.default(function (resolve, reject) {
                    return _youtubeDl2.default.exec('https://drive.google.com/open?id=' + data['key'], ['--format=' + media_id, '-o', savePath, '--write-thumbnail'], { maxBuffer: 10 * 1024 * 1024 }, function (err, output) {
                        return err ? reject(err) : resolve(output);
                    });
                }).then(function (output) {
                    console.log(output);
                    var clearPath = function clearPath() {
                        return savePath === data['filePath'] ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                            return (0, _fs.unlink)(data['filePath'], function (err) {
                                return err ? reject(err) : resolve();
                            });
                        }).then(function () {
                            return (0, _fs.renameSync)(savePath, data['filePath']);
                        });
                    };
                    return clearPath().then(function () {
                        if ((0, _fs.existsSync)(savePath + '.jpg')) {
                            (0, _fs.renameSync)(savePath + '.jpg', data['filePath'] + '_s.jpg');
                        }
                        if (data['rest']) {
                            return function () {
                                return new _promise2.default(function (resolve, reject) {
                                    return setTimeout(function () {
                                        return resolve();
                                    }, 0);
                                }).then(function () {
                                    return data['rest'](currentHeight);
                                }).catch(function (err) {
                                    return data['errhandle'](err);
                                });
                            };
                        }
                    });
                });
            });
        }).catch(function (err) {
            console.log(index);
            (0, _utility.handleError)(err, 'Youtubedl Fetch');
            if (index > _constants.MAX_RETRY) {
                console.log(data['key']);
                (0, _utility.handleError)(new _utility.HoError('timeout'));
            }
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(proc(index + 1));
                }, Math.pow(2, index) * 10 * 1000);
            });
        });
    };
    return proc(1);
}

function downloadPresent(data) {
    if (!data['exportlink'] || !data['alternate'] || !data['filePath']) {
        (0, _utility.handleError)(new _utility.HoError('get parameter lost!!!'));
    }
    var number = 0;
    var present_html = data['filePath'] + '_b.htm';
    return download({
        url: data['alternate'],
        filePath: present_html
    }).then(function () {
        var exportlink = data['exportlink'].replace('=pdf', '=svg&pageid=p');
        var dir = data['filePath'] + '_present';
        var presentDir = function presentDir() {
            return (0, _fs.existsSync)(dir) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(dir, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        };
        var recur_present = function recur_present() {
            return new _promise2.default(function (resolve, reject) {
                return _child_process2.default.exec('grep -o "12,\\"p[0-9][0-9]*\\",' + number + ',0" ' + present_html, function (err, output) {
                    return err ? reject(err) : resolve(output);
                });
            }).then(function (output) {
                console.log(output);
                number++;
                var pageid = output.match(/\"p(\d+)\"/);
                if (!pageid) {
                    (0, _utility.handleError)(new _utility.HoError('can not find present'));
                }
                return download({
                    url: '' + exportlink + pageid[1],
                    filePath: dir + '/' + number + '.svg'
                }).then(function () {
                    return recur_present();
                });
            });
        };
        return presentDir().then(function () {
            return recur_present();
        });
    }).catch(function (err) {
        if (number > 0) {
            (0, _utility.handleError)(err, 'Google Present');
            if (data['rest']) {
                return function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 0);
                    }).then(function () {
                        return data['rest'](number);
                    }).catch(function (err) {
                        return data['errhandle'](err);
                    });
                };
            }
        } else {
            return _promise2.default.reject(err);
        }
    });
}

function downloadDoc(data) {
    if (!data['exportlink'] || !data['filePath']) {
        (0, _utility.handleError)(new _utility.HoError('get parameter lost!!!'));
    }
    var zip = data['filePath'] + '.zip';
    return download({
        url: data['exportlink'].replace('=pdf', '=zip'),
        filePath: zip
    }).then(function () {
        if (!(0, _fs.existsSync)(zip)) {
            (0, _utility.handleError)(new _utility.HoError('cannot find zip'));
        }
        var dir = data['filePath'] + '_doc';
        var docDir = function docDir() {
            return (0, _fs.existsSync)(dir) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
                return (0, _mkdirp2.default)(dir, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        };
        return docDir().then(function () {
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve();
                }, 5000);
            });
        }).then(function () {
            return new _promise2.default(function (resolve, reject) {
                return _child_process2.default.exec((0, _path.join)(__dirname, '../util/myuzip.py') + ' ' + zip + ' ' + dir, function (err, output) {
                    return err ? reject(err) : resolve(output);
                });
            });
        }).then(function (output) {
            return new _promise2.default(function (resolve, reject) {
                return (0, _fs.unlink)(zip, function (err) {
                    return err ? reject(err) : resolve();
                });
            });
        }).then(function () {
            var doc_index = 1;
            if ((0, _fs.existsSync)(dir)) {
                (0, _fs.readdirSync)(dir).forEach(function (file, index) {
                    var curPath = dir + '/' + file;
                    if (!(0, _fs.lstatSync)(curPath).isDirectory()) {
                        for (doc_index; doc_index < 100; doc_index++) {
                            if (doc_index === 1) {
                                var first = dir + '/doc.html';
                                if (!(0, _fs.existsSync)(first)) {
                                    (0, _fs.renameSync)(curPath, first);
                                    break;
                                }
                            } else {
                                var other = dir + '/doc' + doc_index + '.html';
                                if (!(0, _fs.existsSync)(other)) {
                                    (0, _fs.renameSync)(curPath, other);
                                    break;
                                }
                            }
                        }
                    }
                });
            }
            if (data['rest']) {
                return function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 0);
                    }).then(function () {
                        return data['rest'](doc_index);
                    }).catch(function (err) {
                        return data['errhandle'](err);
                    });
                };
            }
        });
    });
}

function googleBackup(user, id, name, filePath, tags, recycle) {
    var append = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : '';

    switch (recycle) {
        case 1:
            return api('upload', {
                user: user,
                type: 'backup',
                name: id + '.' + name,
                filePath: '' + filePath + append
            });
        case 2:
            return (0, _fs.existsSync)(filePath + '.srt') ? api('upload', {
                user: user,
                type: 'backup',
                name: id + '.' + name + '.srt',
                filePath: filePath + '.srt'
            }) : (0, _fs.existsSync)(filePath + '.ass') ? api('upload', {
                user: user,
                type: 'backup',
                name: id + '.' + name + '.ass',
                filePath: filePath + '.ass'
            }) : (0, _fs.existsSync)(filePath + '.ssa') ? api('upload', {
                user: user,
                type: 'backup',
                name: id + '.' + name + '.ssa',
                filePath: filePath + '.ssa'
            }) : _promise2.default.resolve();
        case 3:
            return api('upload', {
                user: user,
                type: 'backup',
                name: id + '.' + name + '.txt',
                body: tags.toString()
            });
        default:
            (0, _utility.handleError)(new _utility.HoError('recycle ' + recycle + ' denied!!!'));
    }
}

function googleDownloadSubtitle(url, filePath) {
    var sub_location = filePath + '_sub/youtube';
    console.log(sub_location);
    var mkfolder = function mkfolder() {
        return (0, _fs.existsSync)(sub_location) ? _promise2.default.resolve() : new _promise2.default(function (resolve, reject) {
            return (0, _mkdirp2.default)(sub_location, function (err) {
                return err ? reject(err) : resolve();
            });
        });
    };
    return mkfolder().then(function () {
        return new _promise2.default(function (resolve, reject) {
            return _youtubeDl2.default.getSubs(url, {
                auto: true,
                all: false,
                lang: 'zh-TW,zh-Hant,zh-CN,zh-Hans,zh-HK,zh-SG,en',
                cwd: sub_location
            }, function (err, info) {
                return err ? reject(err) : resolve(info);
            });
        }).then(function (info) {
            var choose = null;
            var en = null;
            var pri = 0;
            (0, _fs.readdirSync)(sub_location).forEach(function (file) {
                var sub_match = file.match(/\.([a-zA-Z\-]+)\.[a-zA-Z]{3}$/);
                if (sub_match) {
                    switch (sub_match[1]) {
                        case 'zh-TW':
                            if (pri < 7) {
                                pri = 7;
                                choose = file;
                            }
                            break;
                        case 'zh-Hant':
                            if (pri < 6) {
                                pri = 6;
                                choose = file;
                            }
                            break;
                        case 'zh-CN':
                            if (pri < 5) {
                                pri = 5;
                                choose = file;
                            }
                            break;
                        case 'zh-Hans':
                            if (pri < 4) {
                                pri = 4;
                                choose = file;
                            }
                            break;
                        case 'zh-HK':
                            if (pri < 3) {
                                pri = 3;
                                choose = file;
                            }
                            break;
                        case 'zh-SG':
                            if (pri < 2) {
                                pri = 2;
                                choose = file;
                            }
                            break;
                        case 'en':
                            en = file;
                            break;
                    }
                }
            });
            if (!choose && !en) {
                (0, _utility.handleError)(new _utility.HoError('sub donot have chinese and english!!!'));
            }
            var preSub = function preSub(sub, lang) {
                if (sub) {
                    var sub_ext = (0, _mime.isSub)(sub);
                    if (sub_ext) {
                        if ((0, _fs.existsSync)('' + filePath + lang + '.srt')) {
                            (0, _fs.renameSync)('' + filePath + lang + '.srt', '' + filePath + lang + '.srt1');
                        }
                        if ((0, _fs.existsSync)('' + filePath + lang + '.ass')) {
                            (0, _fs.renameSync)('' + filePath + lang + '.ass', '' + filePath + lang + '.ass1');
                        }
                        if ((0, _fs.existsSync)('' + filePath + lang + '.ssa')) {
                            (0, _fs.renameSync)('' + filePath + lang + '.ssa', '' + filePath + lang + '.ssa1');
                        }
                    }
                    return sub_ext;
                } else {
                    return false;
                }
            };
            var ext = preSub(choose, '');
            var en_ext = preSub(en, '.en');
            if (!ext && !en_ext) {
                (0, _utility.handleError)(new _utility.HoError('sub ext not support!!!'));
            }
            var renameSub = function renameSub(sub, lang, sub_ext) {
                if (sub_ext) {
                    (0, _fs.renameSync)(sub_location + '/' + sub, '' + filePath + lang + '.' + sub_ext);
                    return sub_ext === 'vtt' ? _promise2.default.resolve() : (0, _utility.SRT2VTT)(filePath + '}' + lang, sub_ext);
                } else {
                    return _promise2.default.resolve();
                }
            };
            return renameSub(choose, '', ext).then(function () {
                return renameSub(en, '.en', en_ext).then(function () {
                    return (0, _utility.deleteFolderRecursive)(sub_location);
                });
            });
        });
    });
}

function userDrive(userlist, index) {
    var drive_batch = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _constants.DRIVE_LIMIT;

    console.log('userDrive');
    console.log(new Date());
    console.log(userlist[index].username);
    var folderlist = [{
        id: userlist[index].auto,
        title: 'drive upload'
    }];
    var dirpath = [];
    var is_root = true;
    var uploaded = null;
    var handling = null;
    var file_count = 0;
    var getFolder = function getFolder(data) {
        return api('list folder', data).then(function (folder_metadataList) {
            if (is_root) {
                (function () {
                    var templist = [];
                    folder_metadataList.forEach(function (i) {
                        if (i.title !== 'uploaded' && i.title !== 'downloaded' && i.title !== 'handling') {
                            templist.push(i);
                        }
                    });
                    folder_metadataList = templist;
                })();
            }
            if (folder_metadataList.length > 0) {
                folderlist.push({ id: null });
                folderlist = folderlist.concat(folder_metadataList);
            } else {
                dirpath.pop();
            }
            is_root = false;
            return getDriveList();
        });
    };
    return getDriveList().then(function () {
        index++;
        if (index < userlist.length) {
            return userDrive(userlist, index);
        }
    });
    function getDriveList() {
        var current = folderlist.pop();
        while (folderlist.length !== 0 && !current.id) {
            dirpath.pop();
            current = folderlist.pop();
        }
        if (!current || !current.id) {
            return _promise2.default.resolve();
        }
        dirpath.push(current.title);
        var data = { folderId: current.id };
        return api('list file', data).then(function (metadataList) {
            if (metadataList.length > 0) {
                var _ret5 = function () {
                    if (metadataList.length > drive_batch - file_count) {
                        metadataList.splice(drive_batch - file_count);
                    }
                    var getUpload = function getUpload() {
                        return uploaded ? _promise2.default.resolve() : api('list folder', {
                            folderId: userlist[index].auto,
                            name: 'uploaded'
                        }).then(function (uploadedList) {
                            if (uploadedList.length < 1) {
                                (0, _utility.handleError)(new _utility.HoError('do not have uploaded folder!!!'));
                            }
                            uploaded = uploadedList[0].id;
                        });
                    };
                    var getHandle = function getHandle() {
                        return handling ? _promise2.default.resolve() : api('list folder', {
                            folderId: userlist[index].auto,
                            name: 'handling'
                        }).then(function (handlingList) {
                            if (handlingList.length < 1) {
                                (0, _utility.handleError)(new _utility.HoError('do not have handling folder!!!'));
                            }
                            handling = handlingList[0].id;
                        });
                    };
                    return {
                        v: getUpload().then(function () {
                            return getHandle();
                        }).then(function () {
                            return _mediaHandleTool2.default.singleDrive(metadataList, 0, userlist[index], data['folderId'], uploaded, handling, dirpath).then(function () {
                                file_count += metadataList.length;
                                return file_count < drive_batch ? getFolder(data) : _promise2.default.resolve();
                            });
                        })
                    };
                }();

                if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
            } else {
                return getFolder(data);
            }
        });
    }
}

function autoDoc(userlist, index, type) {
    var date = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : null;

    console.log('autoDoc');
    console.log(new Date());
    console.log(userlist[index].username);
    date = date ? date : new Date();
    if (!_constants.DOC_TYPE.hasOwnProperty(type)) {
        (0, _utility.handleError)(new _utility.HoError('do not have this country!!!'));
    }
    var downloaded = null;
    var downloaded_data = {
        folderId: userlist[index].auto,
        name: 'downloaded'
    };
    return api('list folder', downloaded_data).then(function (downloadedList) {
        if (downloadedList.length < 1) {
            (0, _utility.handleError)(new _utility.HoError('do not have downloaded folder!!!'));
        }
        downloaded = downloadedList[0].id;
        var download_ext_doc = function download_ext_doc(tIndex, doc_type) {
            return _externalTool2.default.getSingleList(doc_type[tIndex], date).then(function (doclist) {
                console.log(doclist);
                var recur_download = function recur_download(dIndex) {
                    var single_download = function single_download() {
                        return dIndex < doclist.length ? _externalTool2.default.save2Drive(doc_type[tIndex], doclist[dIndex], downloaded) : _promise2.default.resolve();
                    };
                    return single_download().then(function () {
                        dIndex++;
                        if (dIndex < doclist.length) {
                            return recur_download(dIndex);
                        } else {
                            tIndex++;
                            if (tIndex < doc_type.length) {
                                return download_ext_doc(tIndex, doc_type);
                            } else {
                                index++;
                                if (index < userlist.length) {
                                    return autoDoc(userlist, index, type, date);
                                }
                            }
                        }
                    });
                };
                return recur_download(0);
            });
        };
        return download_ext_doc(0, _constants.DOC_TYPE[type]).then(function () {
            index++;
            if (index < userlist.length) {
                autoDoc(userlist, index, type, date);
            }
        });
    });
}
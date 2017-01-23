import { ALERT_PUSH, ALERT_POP, SET_BASIC, SET_UPLOAD, SEND_GLB_PW, CLOSE_GLB_PW, SEND_GLB_CF,
    CLOSE_GLB_CF, FEEDBACK_POP, FEEDBACK_PUSH, BOOKMARK_POP, BOOKMARK_PUSH, SET_DIRS, DIR_POP,
    DIR_PUSH, USER_POP, USER_PUSH, ITEM_PUSH, ITEM_POP, SET_ITEM, SEND_GLB_IN, CLOSE_GLB_IN,
    PASS_PUSH, PASS_POP, SET_PASS, SET_PDIRS, PDIR_POP, PDIR_PUSH, PBOOKMARK_POP, PBOOKMARK_PUSH,
    STOCK_PUSH, STOCK_POP, SET_STOCK, SET_SDIRS, SDIR_PUSH, SDIR_POP, SBOOKMARK_POP, SBOOKMARK_PUSH } from '../constants'

export const alertPush = msg => ({
    type: ALERT_PUSH,
    msg,
})

export const alertPop = key => ({
    type: ALERT_POP,
    key,
})

export const setBasic = (id=null, url=null, edit=null, level=null, sub=null) => ({
    type: SET_BASIC,
    id,
    url,
    edit,
    level,
    sub,
})

export const setUpload = progress => ({
    type: SET_UPLOAD,
    progress,
})

export const sendGlbPw = callback => ({
    type: SEND_GLB_PW,
    callback,
})

export const closeGlbPw = () => ({
    type: CLOSE_GLB_PW,
})

export const sendGlbCf = (callback, text) => ({
    type: SEND_GLB_CF,
    callback,
    text,
})

export const closeGlbCf = () => ({
    type: CLOSE_GLB_CF,
})

export const feedbackPop = id => ({
    type: FEEDBACK_POP,
    id,
})

export const feedbackPush = simple => ({
    type: FEEDBACK_PUSH,
    simple,
})

export const bookmarkPop = id => ({
    type: BOOKMARK_POP,
    id,
})

export const bookmarkPush = (bookmark, sortName=null, sortType=null) => ({
    type: BOOKMARK_PUSH,
    bookmark,
    sortName,
    sortType,
})

export const setDirs = (dirs, rest) => ({
    type: SET_DIRS,
    dirs,
    rest,
})

export const dirPop = (name, id) => ({
    type: DIR_POP,
    name,
    id,
})

export const dirPush = (name, dir, sortName=null, sortType=null) => ({
    type: DIR_PUSH,
    name,
    dir,
    sortName,
    sortType,
})

export const userPop = id => ({
    type: USER_POP,
    id,
})

export const userPush = simple => ({
    type: USER_PUSH,
    simple,
})

export const itemPop = id => ({
    type: ITEM_POP,
    id,
})

export const itemPush = (item, path=null, bookmark=null, latest=null, sortName=null, sortType=null, pageToken=null, list='item') => ({
    type: ITEM_PUSH,
    item,
    path,
    bookmark,
    latest,
    sortName,
    sortType,
    pageToken,
    list,
})

export const setItem = (select, latest=null, bookmark=null, multi=null, list=null, id=null, opt=null, time=null) => ({
    type: SET_ITEM,
    select,
    latest,
    bookmark,
    multi,
    list,
    id,
    opt,
    time,
})

export const sendGlbIn = (input, callback, color, placeholder, value=null, option=null) => ({
    type: SEND_GLB_IN,
    input,
    callback,
    color,
    placeholder,
    value,
    option,
})

export const closeGlbIn = input => ({
    type: CLOSE_GLB_IN,
    input,
})

export const passPop = id => ({
    type: PASS_POP,
    id,
})

export const passPush = (item, path=null, bookmark=null, latest=null, sortName=null, sortType=null, pageToken=null, list='item') => ({
    type: PASS_PUSH,
    item,
    path,
    bookmark,
    latest,
    sortName,
    sortType,
    pageToken,
    list,
})

export const setPass = (select, latest=null, bookmark=null, multi=null, list=null, id=null, opt=null, time=null) => ({
    type: SET_PASS,
    select,
    latest,
    bookmark,
    multi,
    list,
    id,
    opt,
    time,
})

export const setPdirs = (dirs, rest) => ({
    type: SET_PDIRS,
    dirs,
    rest,
})

export const pdirPop = (name, id) => ({
    type: PDIR_POP,
    name,
    id,
})

export const pdirPush = (name, dir, sortName=null, sortType=null) => ({
    type: PDIR_PUSH,
    name,
    dir,
    sortName,
    sortType,
})

export const pbookmarkPop = id => ({
    type: PBOOKMARK_POP,
    id,
})

export const pbookmarkPush = (bookmark, sortName=null, sortType=null) => ({
    type: PBOOKMARK_PUSH,
    bookmark,
    sortName,
    sortType,
})

export const stockPop = id => ({
    type: STOCK_POP,
    id,
})

export const stockPush = (item, path=null, bookmark=null, latest=null, sortName=null, sortType=null, pageToken=null, list='item') => ({
    type: STOCK_PUSH,
    item,
    path,
    bookmark,
    latest,
    sortName,
    sortType,
    pageToken,
    list,
})

export const setStock = (select, latest=null, bookmark=null, multi=null, list=null, id=null, opt=null, time=null) => ({
    type: SET_STOCK,
    select,
    latest,
    bookmark,
    multi,
    list,
    id,
    opt,
    time,
})

export const setSdirs = (dirs, rest) => ({
    type: SET_SDIRS,
    dirs,
    rest,
})

export const sdirPop = (name, id) => ({
    type: SDIR_POP,
    name,
    id,
})

export const sdirPush = (name, dir, sortName=null, sortType=null) => ({
    type: SDIR_PUSH,
    name,
    dir,
    sortName,
    sortType,
})

export const sbookmarkPop = id => ({
    type: SBOOKMARK_POP,
    id,
})

export const sbookmarkPush = (bookmark, sortName=null, sortType=null) => ({
    type: SBOOKMARK_PUSH,
    bookmark,
    sortName,
    sortType,
})
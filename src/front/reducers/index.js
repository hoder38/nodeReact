import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import { FEEDBACK_POP, FEEDBACK_PUSH, USER_POP, USER_PUSH, ITEM_PUSH, ITEM_POP, SET_ITEM, SET_DIRS, DIR_POP, DIR_PUSH, BOOKMARK_POP, BOOKMARK_PUSH, PASS_PUSH, PASS_POP, SET_PASS, SET_PDIRS, PDIR_PUSH, PDIR_POP, PBOOKMARK_POP, PBOOKMARK_PUSH, STOCK_PUSH, STOCK_POP, SET_STOCK, SET_SDIRS, SDIR_PUSH, SDIR_POP, SBOOKMARK_POP, SBOOKMARK_PUSH, BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX } from '../constants.js'
import alertHandle from './alertHandle.js'
import basicDataHandle from './basicDataHandle.js'
import uploadDataHandle from './uploadDataHandle.js'
import simpleDataHandle from './simpleDataHandle.js'
import bookmarkDataHandle from './bookmarkDataHandle.js'
import dirDataHandle from './dirDataHandle.js'
import complexDataHandle from './complexDataHandle.js'
import glbPwHandle from './glbPwHandle.js'
import glbCfHandle from './glbCfHandle.js'
import glbInHandle from './glbInHandle.js'

const feedbackDataHandle = simpleDataHandle(FEEDBACK_PUSH, FEEDBACK_POP)
const userDataHandle = simpleDataHandle(USER_PUSH, USER_POP)

const itemDataHandle = complexDataHandle(ITEM_PUSH, ITEM_POP, SET_ITEM)
const passDataHandle = complexDataHandle(PASS_PUSH, PASS_POP, SET_PASS)
const stockDataHandle = complexDataHandle(STOCK_PUSH, STOCK_POP, SET_STOCK)
const bitfinexDataHandle = complexDataHandle(BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX)

const idirDataHandle = dirDataHandle(DIR_PUSH, DIR_POP, SET_DIRS)
const pdirDataHandle = dirDataHandle(PDIR_PUSH, PDIR_POP, SET_PDIRS)
const sdirDataHandle = dirDataHandle(SDIR_PUSH, SDIR_POP, SET_SDIRS)

const ibookmarkDataHandle = bookmarkDataHandle(BOOKMARK_PUSH, BOOKMARK_POP)
const pbookmarkDataHandle = bookmarkDataHandle(PBOOKMARK_PUSH, PBOOKMARK_POP)
const sbookmarkDataHandle = bookmarkDataHandle(SBOOKMARK_PUSH, SBOOKMARK_POP)

const ANoMoPi = history => combineReducers({
    router: connectRouter(history),
    alertHandle,
    basicDataHandle,
    uploadDataHandle,
    feedbackDataHandle,
    userDataHandle,
    ibookmarkDataHandle,
    pbookmarkDataHandle,
    sbookmarkDataHandle,
    idirDataHandle,
    pdirDataHandle,
    sdirDataHandle,
    itemDataHandle,
    passDataHandle,
    stockDataHandle,
    bitfinexDataHandle,
    glbPwHandle,
    glbCfHandle,
    glbInHandle,
})

export default ANoMoPi
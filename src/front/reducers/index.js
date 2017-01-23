import { combineReducers } from 'redux'
import { routerReducer } from 'react-router-redux'
import { FEEDBACK_POP, FEEDBACK_PUSH, USER_POP, USER_PUSH, ITEM_PUSH, ITEM_POP, SET_ITEM, SET_DIRS, DIR_POP, DIR_PUSH, BOOKMARK_POP, BOOKMARK_PUSH, PASS_PUSH, PASS_POP, SET_PASS, SET_PDIRS, PDIR_PUSH, PDIR_POP, PBOOKMARK_POP, PBOOKMARK_PUSH, STOCK_PUSH, STOCK_POP, SET_STOCK, SET_SDIRS, SDIR_PUSH, SDIR_POP, SBOOKMARK_POP, SBOOKMARK_PUSH } from '../constants'
import alertHandle from './alertHandle'
import basicDataHandle from './basicDataHandle'
import uploadDataHandle from './uploadDataHandle'
import simpleDataHandle from './simpleDataHandle'
import bookmarkDataHandle from './bookmarkDataHandle'
import dirDataHandle from './dirDataHandle'
import complexDataHandle from './complexDataHandle'
import glbPwHandle from './glbPwHandle'
import glbCfHandle from './glbCfHandle'
import glbInHandle from './glbInHandle'

const feedbackDataHandle = simpleDataHandle(FEEDBACK_PUSH, FEEDBACK_POP)
const userDataHandle = simpleDataHandle(USER_PUSH, USER_POP)

const itemDataHandle = complexDataHandle(ITEM_PUSH, ITEM_POP, SET_ITEM)
const passDataHandle = complexDataHandle(PASS_PUSH, PASS_POP, SET_PASS)
const stockDataHandle = complexDataHandle(STOCK_PUSH, STOCK_POP, SET_STOCK)

const idirDataHandle = dirDataHandle(DIR_PUSH, DIR_POP, SET_DIRS)
const pdirDataHandle = dirDataHandle(PDIR_PUSH, PDIR_POP, SET_PDIRS)
const sdirDataHandle = dirDataHandle(SDIR_PUSH, SDIR_POP, SET_SDIRS)

const ibookmarkDataHandle = bookmarkDataHandle(BOOKMARK_PUSH, BOOKMARK_POP)
const pbookmarkDataHandle = bookmarkDataHandle(PBOOKMARK_PUSH, PBOOKMARK_POP)
const sbookmarkDataHandle = bookmarkDataHandle(SBOOKMARK_PUSH, SBOOKMARK_POP)

const ANoMoPi = combineReducers({
    routing: routerReducer,
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
    glbPwHandle,
    glbCfHandle,
    glbInHandle,
})

export default ANoMoPi
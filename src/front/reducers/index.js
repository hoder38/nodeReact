import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import { FEEDBACK_POP, FEEDBACK_PUSH, USER_POP, USER_PUSH, ITEM_PUSH, ITEM_POP, SET_ITEM, SET_DIRS, DIR_POP, DIR_PUSH, BOOKMARK_POP, BOOKMARK_PUSH, PASS_PUSH, PASS_POP, SET_PASS, SET_PDIRS, PDIR_PUSH, PDIR_POP, PBOOKMARK_POP, PBOOKMARK_PUSH, STOCK_PUSH, STOCK_POP, SET_STOCK, SET_SDIRS, SDIR_PUSH, SDIR_POP, SBOOKMARK_POP, SBOOKMARK_PUSH/*, FITNESS_PUSH, FITNESS_POP, SET_FITNESS, SET_FDIRS, FDIR_PUSH, FDIR_POP, FBOOKMARK_POP, FBOOKMARK_PUSH, RANK_PUSH, RANK_POP, SET_RANK, SET_RDIRS, RDIR_PUSH, RDIR_POP, RBOOKMARK_POP, RBOOKMARK_PUSH, LOTTERY_PUSH, LOTTERY_POP, SET_LOTTERY*/, BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX } from '../constants.js'
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
//const fitnessDataHandle = complexDataHandle(FITNESS_PUSH, FITNESS_POP, SET_FITNESS)
//const rankDataHandle = complexDataHandle(RANK_PUSH, RANK_POP, SET_RANK)
//const lotteryDataHandle = complexDataHandle(LOTTERY_PUSH, LOTTERY_POP, SET_LOTTERY)
const bitfinexDataHandle = complexDataHandle(BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX)

const idirDataHandle = dirDataHandle(DIR_PUSH, DIR_POP, SET_DIRS)
const pdirDataHandle = dirDataHandle(PDIR_PUSH, PDIR_POP, SET_PDIRS)
const sdirDataHandle = dirDataHandle(SDIR_PUSH, SDIR_POP, SET_SDIRS)
//const fdirDataHandle = dirDataHandle(FDIR_PUSH, FDIR_POP, SET_FDIRS)
//const rdirDataHandle = dirDataHandle(RDIR_PUSH, RDIR_POP, SET_RDIRS)

const ibookmarkDataHandle = bookmarkDataHandle(BOOKMARK_PUSH, BOOKMARK_POP)
const pbookmarkDataHandle = bookmarkDataHandle(PBOOKMARK_PUSH, PBOOKMARK_POP)
const sbookmarkDataHandle = bookmarkDataHandle(SBOOKMARK_PUSH, SBOOKMARK_POP)
//const fbookmarkDataHandle = bookmarkDataHandle(FBOOKMARK_PUSH, FBOOKMARK_POP)
//const rbookmarkDataHandle = bookmarkDataHandle(RBOOKMARK_PUSH, RBOOKMARK_POP)

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
    //fbookmarkDataHandle,
    //rbookmarkDataHandle,
    idirDataHandle,
    pdirDataHandle,
    sdirDataHandle,
    //fdirDataHandle,
    //rdirDataHandle,
    itemDataHandle,
    passDataHandle,
    stockDataHandle,
    //fitnessDataHandle,
    //rankDataHandle,
    //lotteryDataHandle,
    bitfinexDataHandle,
    glbPwHandle,
    glbCfHandle,
    glbInHandle,
})

export default ANoMoPi
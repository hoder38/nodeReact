import {
  alertPush, alertPop, setBasic, setUpload,
  sendGlbPw, closeGlbPw, sendGlbCf, closeGlbCf,
  feedbackPop, feedbackPush, bookmarkPop, bookmarkPush,
  setDirs, dirPop, dirPush, userPop, userPush,
  itemPop, itemPush, setItem, sendGlbIn, closeGlbIn,
  passPop, passPush, setPass, setPdirs, pdirPop, pdirPush,
  pbookmarkPop, pbookmarkPush,
  stockPop, stockPush, setStock, setSdirs, sdirPop, sdirPush,
  sbookmarkPop, sbookmarkPush,
  bitfinexPop, bitfinexPush, setBitfinex,
} from './index.js';

import {
  ALERT_PUSH, ALERT_POP, SET_BASIC, SET_UPLOAD,
  SEND_GLB_PW, CLOSE_GLB_PW, SEND_GLB_CF, CLOSE_GLB_CF,
  FEEDBACK_POP, FEEDBACK_PUSH, BOOKMARK_POP, BOOKMARK_PUSH,
  SET_DIRS, DIR_POP, DIR_PUSH, USER_POP, USER_PUSH,
  ITEM_PUSH, ITEM_POP, SET_ITEM, SEND_GLB_IN, CLOSE_GLB_IN,
  PASS_PUSH, PASS_POP, SET_PASS, SET_PDIRS, PDIR_POP, PDIR_PUSH,
  PBOOKMARK_POP, PBOOKMARK_PUSH,
  STOCK_PUSH, STOCK_POP, SET_STOCK, SET_SDIRS, SDIR_POP, SDIR_PUSH,
  SBOOKMARK_POP, SBOOKMARK_PUSH,
  BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX,
} from '../constants.js';

describe('Action creators', () => {
  describe('alert', () => {
    test('alertPush', () => {
      expect(alertPush('error msg')).toEqual({ type: ALERT_PUSH, msg: 'error msg' });
    });
    test('alertPop', () => {
      expect(alertPop(3)).toEqual({ type: ALERT_POP, key: 3 });
    });
  });

  describe('basic', () => {
    test('setBasic with all params', () => {
      expect(setBasic('u1', '/img', true, 2, ['s1'], 1)).toEqual({
        type: SET_BASIC, id: 'u1', url: '/img', edit: true, level: 2, sub: ['s1'], fitness: 1,
      });
    });
    test('setBasic defaults to null', () => {
      const result = setBasic();
      expect(result.id).toBeNull();
      expect(result.url).toBeNull();
      expect(result.edit).toBeNull();
      expect(result.level).toBeNull();
      expect(result.sub).toBeNull();
      expect(result.fitness).toBeNull();
    });
  });

  describe('upload', () => {
    test('setUpload', () => {
      expect(setUpload(75)).toEqual({ type: SET_UPLOAD, progress: 75 });
    });
  });

  describe('global password', () => {
    test('sendGlbPw', () => {
      const cb = jest.fn();
      expect(sendGlbPw(cb)).toEqual({ type: SEND_GLB_PW, callback: cb });
    });
    test('closeGlbPw', () => {
      expect(closeGlbPw()).toEqual({ type: CLOSE_GLB_PW });
    });
  });

  describe('global confirm', () => {
    test('sendGlbCf', () => {
      const cb = jest.fn();
      expect(sendGlbCf(cb, 'Sure?')).toEqual({ type: SEND_GLB_CF, callback: cb, text: 'Sure?' });
    });
    test('closeGlbCf', () => {
      expect(closeGlbCf()).toEqual({ type: CLOSE_GLB_CF });
    });
  });

  describe('feedback', () => {
    test('feedbackPush', () => {
      expect(feedbackPush({ id: '1', msg: 'hi' })).toEqual({ type: FEEDBACK_PUSH, simple: { id: '1', msg: 'hi' } });
    });
    test('feedbackPop', () => {
      expect(feedbackPop('1')).toEqual({ type: FEEDBACK_POP, id: '1' });
    });
  });

  describe('user', () => {
    test('userPush', () => {
      expect(userPush({ id: 'u1' })).toEqual({ type: USER_PUSH, simple: { id: 'u1' } });
    });
    test('userPop', () => {
      expect(userPop('u1')).toEqual({ type: USER_POP, id: 'u1' });
    });
  });

  describe('bookmark (storage)', () => {
    test('bookmarkPush with sort', () => {
      expect(bookmarkPush([{ id: 'b1' }], 'name', 'asc')).toEqual({
        type: BOOKMARK_PUSH, bookmark: [{ id: 'b1' }], sortName: 'name', sortType: 'asc',
      });
    });
    test('bookmarkPush without sort', () => {
      expect(bookmarkPush({ id: 'b2' })).toEqual({
        type: BOOKMARK_PUSH, bookmark: { id: 'b2' }, sortName: null, sortType: null,
      });
    });
    test('bookmarkPop', () => {
      expect(bookmarkPop('b1')).toEqual({ type: BOOKMARK_POP, id: 'b1' });
    });
  });

  describe('dirs (storage)', () => {
    test('setDirs', () => {
      const rest = jest.fn();
      expect(setDirs([{ name: 'd1' }], rest)).toEqual({ type: SET_DIRS, dirs: [{ name: 'd1' }], rest });
    });
    test('dirPush with sort', () => {
      expect(dirPush('music', [{ id: 'f1' }], 'date', 'desc')).toEqual({
        type: DIR_PUSH, name: 'music', dir: [{ id: 'f1' }], sortName: 'date', sortType: 'desc',
      });
    });
    test('dirPush without sort', () => {
      expect(dirPush('video', { id: 'f2' })).toEqual({
        type: DIR_PUSH, name: 'video', dir: { id: 'f2' }, sortName: null, sortType: null,
      });
    });
    test('dirPop', () => {
      expect(dirPop('music', 'f1')).toEqual({ type: DIR_POP, name: 'music', id: 'f1' });
    });
  });

  describe('item (storage)', () => {
    test('itemPush with all params', () => {
      expect(itemPush([{ id: 'i1' }], { cur: [] }, 'bk1', 'lat', 'name', 'asc', 'tk1', 'item')).toEqual({
        type: ITEM_PUSH, item: [{ id: 'i1' }], path: { cur: [] }, bookmark: 'bk1',
        latest: 'lat', sortName: 'name', sortType: 'asc', pageToken: 'tk1', list: 'item',
      });
    });
    test('itemPush defaults', () => {
      const result = itemPush({ id: 'i2' });
      expect(result.path).toBeNull();
      expect(result.list).toBe('item');
    });
    test('itemPop', () => {
      expect(itemPop('i1')).toEqual({ type: ITEM_POP, id: 'i1' });
    });
    test('setItem', () => {
      expect(setItem(new Set(['a']), 'lat', 'bk', true, 'item', 'id1', 'opt1', 123)).toEqual({
        type: SET_ITEM, select: new Set(['a']), latest: 'lat', bookmark: 'bk',
        multi: true, list: 'item', id: 'id1', opt: 'opt1', time: 123,
      });
    });
  });

  describe('global input', () => {
    test('sendGlbIn', () => {
      const cb = jest.fn();
      expect(sendGlbIn('tag', cb, 'red', 'Enter tag', 'val', 'opt')).toEqual({
        type: SEND_GLB_IN, input: 'tag', callback: cb, color: 'red',
        placeholder: 'Enter tag', value: 'val', option: 'opt',
      });
    });
    test('sendGlbIn defaults', () => {
      const cb = jest.fn();
      const result = sendGlbIn('name', cb, 'blue', 'Enter');
      expect(result.value).toBeNull();
      expect(result.option).toBeNull();
    });
    test('closeGlbIn', () => {
      expect(closeGlbIn('tag')).toEqual({ type: CLOSE_GLB_IN, input: 'tag' });
    });
  });

  describe('password module', () => {
    test('passPush', () => {
      expect(passPush([{ id: 'p1' }], null, null, null, 'name', 'asc')).toEqual({
        type: PASS_PUSH, item: [{ id: 'p1' }], path: null, bookmark: null,
        latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item',
      });
    });
    test('passPop', () => {
      expect(passPop('p1')).toEqual({ type: PASS_POP, id: 'p1' });
    });
    test('setPass', () => {
      expect(setPass(new Set())).toEqual({
        type: SET_PASS, select: new Set(), latest: null, bookmark: null,
        multi: null, list: null, id: null, opt: null, time: null,
      });
    });
    test('setPdirs', () => {
      const rest = jest.fn();
      expect(setPdirs([], rest)).toEqual({ type: SET_PDIRS, dirs: [], rest });
    });
    test('pdirPush', () => {
      expect(pdirPush('cat', [{ id: 'd1' }], 'name', 'asc')).toEqual({
        type: PDIR_PUSH, name: 'cat', dir: [{ id: 'd1' }], sortName: 'name', sortType: 'asc',
      });
    });
    test('pdirPop', () => {
      expect(pdirPop('cat', 'd1')).toEqual({ type: PDIR_POP, name: 'cat', id: 'd1' });
    });
    test('pbookmarkPush', () => {
      expect(pbookmarkPush([{ id: 'b1' }], 'name', 'desc')).toEqual({
        type: PBOOKMARK_PUSH, bookmark: [{ id: 'b1' }], sortName: 'name', sortType: 'desc',
      });
    });
    test('pbookmarkPop', () => {
      expect(pbookmarkPop('b1')).toEqual({ type: PBOOKMARK_POP, id: 'b1' });
    });
  });

  describe('stock module', () => {
    test('stockPush', () => {
      expect(stockPush([{ id: 's1' }], null, null, null, 'name', 'asc')).toEqual({
        type: STOCK_PUSH, item: [{ id: 's1' }], path: null, bookmark: null,
        latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item',
      });
    });
    test('stockPop', () => {
      expect(stockPop('s1')).toEqual({ type: STOCK_POP, id: 's1' });
    });
    test('setStock', () => {
      expect(setStock(new Set())).toEqual({
        type: SET_STOCK, select: new Set(), latest: null, bookmark: null,
        multi: null, list: null, id: null, opt: null, time: null,
      });
    });
    test('setSdirs', () => {
      const rest = jest.fn();
      expect(setSdirs([], rest)).toEqual({ type: SET_SDIRS, dirs: [], rest });
    });
    test('sdirPush', () => {
      expect(sdirPush('sector', [{ id: 'd1' }], 'name', 'asc')).toEqual({
        type: SDIR_PUSH, name: 'sector', dir: [{ id: 'd1' }], sortName: 'name', sortType: 'asc',
      });
    });
    test('sdirPop', () => {
      expect(sdirPop('sector', 'd1')).toEqual({ type: SDIR_POP, name: 'sector', id: 'd1' });
    });
    test('sbookmarkPush', () => {
      expect(sbookmarkPush([{ id: 'b1' }], 'name', 'asc')).toEqual({
        type: SBOOKMARK_PUSH, bookmark: [{ id: 'b1' }], sortName: 'name', sortType: 'asc',
      });
    });
    test('sbookmarkPop', () => {
      expect(sbookmarkPop('b1')).toEqual({ type: SBOOKMARK_POP, id: 'b1' });
    });
  });

  describe('bitfinex module', () => {
    test('bitfinexPush has noScroll: true', () => {
      const result = bitfinexPush([{ id: 'bf1' }], null, null, null, 'name', 'asc');
      expect(result.type).toBe(BITFINEX_PUSH);
      expect(result.noScroll).toBe(true);
      expect(result.list).toBe('item');
    });
    test('bitfinexPop', () => {
      expect(bitfinexPop('bf1')).toEqual({ type: BITFINEX_POP, id: 'bf1' });
    });
    test('setBitfinex', () => {
      expect(setBitfinex(new Set())).toEqual({
        type: SET_BITFINEX, select: new Set(), latest: null, bookmark: null,
        multi: null, list: null, id: null, opt: null, time: null,
      });
    });
  });
});

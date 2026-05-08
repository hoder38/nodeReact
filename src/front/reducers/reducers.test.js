import alertHandle from './alertHandle.js';
import basicDataHandle from './basicDataHandle.js';
import uploadDataHandle from './uploadDataHandle.js';
import simpleDataHandle from './simpleDataHandle.js';
import bookmarkDataHandle from './bookmarkDataHandle.js';
import dirDataHandle from './dirDataHandle.js';
import glbPwHandle from './glbPwHandle.js';
import glbCfHandle from './glbCfHandle.js';
import glbInHandle from './glbInHandle.js';
import {
  ALERT_PUSH, ALERT_POP, SET_BASIC, SET_UPLOAD,
  SEND_GLB_PW, CLOSE_GLB_PW, SEND_GLB_CF, CLOSE_GLB_CF,
  SEND_GLB_IN, CLOSE_GLB_IN,
  FEEDBACK_PUSH, FEEDBACK_POP, USER_PUSH, USER_POP,
  BOOKMARK_PUSH, BOOKMARK_POP,
  SET_DIRS, DIR_PUSH, DIR_POP,
} from '../constants.js';

describe('alertHandle', () => {
  test('returns initial state', () => {
    expect(alertHandle(undefined, { type: 'INIT' })).toEqual([]);
  });

  test('ALERT_PUSH adds message with auto-incrementing key', () => {
    const s1 = alertHandle([], { type: ALERT_PUSH, msg: 'error 1' });
    expect(s1).toHaveLength(1);
    expect(s1[0].msg).toBe('error 1');
    expect(typeof s1[0].key).toBe('number');

    const s2 = alertHandle(s1, { type: ALERT_PUSH, msg: 'error 2' });
    expect(s2).toHaveLength(2);
    expect(s2[1].key).toBeGreaterThan(s2[0].key);
  });

  test('ALERT_PUSH extracts .message from Error objects', () => {
    const state = alertHandle([], { type: ALERT_PUSH, msg: new Error('bad') });
    expect(state[0].msg).toBe('bad');
  });

  test('ALERT_PUSH ignores empty/whitespace messages', () => {
    expect(alertHandle([], { type: ALERT_PUSH, msg: '' })).toEqual([]);
    expect(alertHandle([], { type: ALERT_PUSH, msg: '  ' })).toEqual([]);
  });

  test('ALERT_POP removes by key', () => {
    const s1 = alertHandle([], { type: ALERT_PUSH, msg: 'a' });
    const s2 = alertHandle(s1, { type: ALERT_PUSH, msg: 'b' });
    const result = alertHandle(s2, { type: ALERT_POP, key: s2[0].key });
    expect(result).toHaveLength(1);
    expect(result[0].msg).toBe('b');
  });
});

describe('basicDataHandle', () => {
  const initial = { id: 'guest', url: '', edit: false, level: 0, sub: [], fitness: 0 };

  test('returns initial state', () => {
    expect(basicDataHandle(undefined, { type: 'INIT' })).toEqual(initial);
  });

  test('SET_BASIC updates provided fields only', () => {
    const result = basicDataHandle(initial, {
      type: SET_BASIC, id: 'user1', url: null, edit: null, level: null, sub: null, fitness: null,
    });
    expect(result.id).toBe('user1');
    expect(result.url).toBe('');
    expect(result.edit).toBe(false);
  });

  test('SET_BASIC appends to sub array', () => {
    const result = basicDataHandle(initial, {
      type: SET_BASIC, id: null, url: null, edit: null, level: null, sub: 'newSub', fitness: null,
    });
    expect(result.sub).toEqual(['newSub']);
  });
});

describe('uploadDataHandle', () => {
  test('returns initial state 0', () => {
    expect(uploadDataHandle(undefined, { type: 'INIT' })).toBe(0);
  });

  test('SET_UPLOAD sets progress', () => {
    expect(uploadDataHandle(0, { type: SET_UPLOAD, progress: 50 })).toBe(50);
    expect(uploadDataHandle(50, { type: SET_UPLOAD, progress: 100 })).toBe(100);
  });
});

describe('glbPwHandle', () => {
  test('returns initial state', () => {
    expect(glbPwHandle(undefined, { type: 'INIT' })).toEqual([]);
  });

  test('SEND_GLB_PW pushes callback to front', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const s1 = glbPwHandle([], { type: SEND_GLB_PW, callback: cb1 });
    expect(s1).toEqual([cb1]);
    const s2 = glbPwHandle(s1, { type: SEND_GLB_PW, callback: cb2 });
    expect(s2).toEqual([cb2, cb1]);
  });

  test('CLOSE_GLB_PW removes first item', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const state = [cb1, cb2];
    const result = glbPwHandle(state, { type: CLOSE_GLB_PW });
    expect(result).toEqual([cb2]);
  });
});

describe('glbCfHandle', () => {
  test('returns initial state', () => {
    expect(glbCfHandle(undefined, { type: 'INIT' })).toEqual([]);
  });

  test('SEND_GLB_CF pushes callback+text to front', () => {
    const cb = jest.fn();
    const result = glbCfHandle([], { type: SEND_GLB_CF, callback: cb, text: 'Delete?' });
    expect(result).toEqual([cb, 'Delete?']);
  });

  test('CLOSE_GLB_CF removes first 2 items', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const state = [cb1, 'text1', cb2, 'text2'];
    const result = glbCfHandle(state, { type: CLOSE_GLB_CF });
    expect(result).toEqual([cb2, 'text2']);
  });
});

describe('glbInHandle', () => {
  test('returns initial state', () => {
    expect(glbInHandle(undefined, { type: 'INIT' })).toEqual([]);
  });

  test('SEND_GLB_IN adds input entry to front', () => {
    const cb = jest.fn();
    const result = glbInHandle([], {
      type: SEND_GLB_IN, input: 'tag', callback: cb, color: 'red',
      placeholder: 'Enter', value: null, option: null,
    });
    expect(result).toHaveLength(1);
    expect(result[0].input).toBe('tag');
    expect(result[0].value).toBe('');
    expect(result[0].option).toBe('');
  });

  test('SEND_GLB_IN replaces existing input with same name', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const s1 = glbInHandle([], {
      type: SEND_GLB_IN, input: 'tag', callback: cb1, color: 'red',
      placeholder: 'p1', value: 'v1', option: 'o1',
    });
    const s2 = glbInHandle(s1, {
      type: SEND_GLB_IN, input: 'tag', callback: cb2, color: 'blue',
      placeholder: 'p2', value: 'v2', option: 'o2',
    });
    expect(s2).toHaveLength(1);
    expect(s2[0].callback).toBe(cb2);
  });

  test('CLOSE_GLB_IN removes by input name', () => {
    const cb = jest.fn();
    const state = [
      { input: 'tag', callback: cb, color: 'red', placeholder: 'p', value: '', option: '', index: 0 },
      { input: 'name', callback: cb, color: 'blue', placeholder: 'q', value: '', option: '', index: 1 },
    ];
    const result = glbInHandle(state, { type: CLOSE_GLB_IN, input: 'tag' });
    expect(result).toHaveLength(1);
    expect(result[0].input).toBe('name');
  });

  test('CLOSE_GLB_IN with -1 clears all', () => {
    const state = [{ input: 'a' }, { input: 'b' }];
    expect(glbInHandle(state, { type: CLOSE_GLB_IN, input: -1 })).toEqual([]);
  });
});

describe('simpleDataHandle (factory)', () => {
  const reducer = simpleDataHandle(FEEDBACK_PUSH, FEEDBACK_POP);

  test('returns initial empty Map', () => {
    const state = reducer(undefined, { type: 'INIT' });
    expect(state).toBeInstanceOf(Map);
    expect(state.size).toBe(0);
  });

  test('PUSH single item', () => {
    const state = reducer(new Map(), { type: FEEDBACK_PUSH, simple: { id: 'f1', msg: 'hi' } });
    expect(state.get('f1')).toEqual({ id: 'f1', msg: 'hi' });
  });

  test('PUSH array replaces entire list', () => {
    const existing = new Map([['old', { id: 'old' }]]);
    const state = reducer(existing, {
      type: FEEDBACK_PUSH, simple: [{ id: 'a' }, { id: 'b' }],
    });
    expect(state.has('old')).toBe(false);
    expect(state.size).toBe(2);
  });

  test('POP removes item', () => {
    const existing = new Map([['f1', { id: 'f1' }], ['f2', { id: 'f2' }]]);
    const state = reducer(existing, { type: FEEDBACK_POP, id: 'f1' });
    expect(state.has('f1')).toBe(false);
    expect(state.has('f2')).toBe(true);
  });
});

describe('bookmarkDataHandle (factory)', () => {
  const reducer = bookmarkDataHandle(BOOKMARK_PUSH, BOOKMARK_POP);
  const initial = { list: new Map(), sortName: 'name', sortType: 'asc', page: 0, more: false };

  test('returns initial state', () => {
    const state = reducer(undefined, { type: 'INIT' });
    expect(state.sortName).toBe('name');
    expect(state.list.size).toBe(0);
  });

  test('PUSH with sort resets list', () => {
    const state = reducer(initial, {
      type: BOOKMARK_PUSH, bookmark: [{ id: 'b1' }, { id: 'b2' }],
      sortName: 'date', sortType: 'desc',
    });
    expect(state.sortName).toBe('date');
    expect(state.sortType).toBe('desc');
    expect(state.list.size).toBe(2);
  });

  test('PUSH without sort appends', () => {
    const prev = { ...initial, list: new Map([['b1', { id: 'b1' }]]) };
    const state = reducer(prev, {
      type: BOOKMARK_PUSH, bookmark: { id: 'b2' }, sortName: null, sortType: null,
    });
    expect(state.list.size).toBe(2);
  });

  test('POP removes item', () => {
    const prev = { ...initial, list: new Map([['b1', { id: 'b1' }], ['b2', { id: 'b2' }]]) };
    const state = reducer(prev, { type: BOOKMARK_POP, id: 'b1' });
    expect(state.list.has('b1')).toBe(false);
    expect(state.list.has('b2')).toBe(true);
  });
});

describe('dirDataHandle (factory)', () => {
  const reducer = dirDataHandle(DIR_PUSH, DIR_POP, SET_DIRS);

  test('returns initial empty array', () => {
    expect(reducer(undefined, { type: 'INIT' })).toEqual([]);
  });

  test('SET_DIRS initializes directories', () => {
    const rest = (dir, i) => ({ ...dir, index: i });
    const state = reducer([], {
      type: SET_DIRS, dirs: [{ name: 'music' }, { name: 'video' }], rest,
    });
    expect(state).toHaveLength(2);
    expect(state[0].name).toBe('music');
    expect(state[0].index).toBe(0);
    expect(state[0].list).toBeInstanceOf(Map);
    expect(state[0].sortName).toBe('name');
    expect(state[0].page).toBe(0);
    expect(state[0].more).toBe(true);
  });

  test('DIR_PUSH with sort resets dir list', () => {
    const prev = [{ name: 'music', list: new Map(), sortName: 'name', sortType: 'asc', page: 0, more: true }];
    const state = reducer(prev, {
      type: DIR_PUSH, name: 'music', dir: [{ id: 'f1' }, { id: 'f2' }],
      sortName: 'date', sortType: 'desc',
    });
    expect(state[0].sortName).toBe('date');
    expect(state[0].list.size).toBe(2);
    expect(state[0].page).toBe(2);
  });

  test('DIR_PUSH without sort appends', () => {
    const prev = [{ name: 'music', list: new Map([['f1', { id: 'f1' }]]), sortName: 'name', sortType: 'asc', page: 1, more: true }];
    const state = reducer(prev, {
      type: DIR_PUSH, name: 'music', dir: { id: 'f2' }, sortName: null, sortType: null,
    });
    expect(state[0].list.size).toBe(2);
    expect(state[0].more).toBe(true);
  });

  test('DIR_PUSH empty array sets more=false', () => {
    const prev = [{ name: 'music', list: new Map(), sortName: 'name', sortType: 'asc', page: 0, more: true }];
    const state = reducer(prev, {
      type: DIR_PUSH, name: 'music', dir: [], sortName: 'name', sortType: 'asc',
    });
    expect(state[0].more).toBe(false);
  });

  test('DIR_POP removes item from dir', () => {
    const prev = [{ name: 'music', list: new Map([['f1', { id: 'f1' }], ['f2', { id: 'f2' }]]), sortName: 'name', sortType: 'asc', page: 2, more: true }];
    const state = reducer(prev, { type: DIR_POP, name: 'music', id: 'f1' });
    expect(state[0].list.has('f1')).toBe(false);
    expect(state[0].page).toBe(1);
  });
});

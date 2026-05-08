import complexDataHandle from './complexDataHandle.js';
import { ITEM_PUSH, ITEM_POP, SET_ITEM, SET_BITFINEX, BITFINEX_PUSH, BITFINEX_POP } from '../constants.js';

describe('complexDataHandle (storage)', () => {
  const reducer = complexDataHandle(ITEM_PUSH, ITEM_POP, SET_ITEM);

  const getInitial = () => reducer(undefined, { type: 'INIT' });

  test('returns initial state', () => {
    const state = getInitial();
    expect(state.list).toBeInstanceOf(Map);
    expect(state.multi).toBe(false);
    expect(state.item.list).toBeInstanceOf(Set);
    expect(state.item.sortName).toBe('name');
    expect(state.item.more).toBe(true);
    expect(state.select).toBeInstanceOf(Set);
  });

  describe('SET_ITEM', () => {
    test('updates multi/select without list', () => {
      const prev = getInitial();
      const state = reducer(prev, {
        type: SET_ITEM, select: new Set(['a']), latest: null, bookmark: null,
        multi: true, list: null, id: null, opt: null, time: null,
      });
      expect(state.multi).toBe(true);
      expect(state.select).toEqual(new Set(['a']));
    });

    test('select as string copies item.list', () => {
      const prev = { ...getInitial(), item: { ...getInitial().item, list: new Set(['x', 'y']) } };
      const state = reducer(prev, {
        type: SET_ITEM, select: 'all', latest: null, bookmark: null,
        multi: null, list: null, id: null, opt: null, time: null,
      });
      expect(state.select).toEqual(new Set(['x', 'y']));
    });

    test('with list filters by status', () => {
      const itemList = new Set(['a', 'b', 'c']);
      const listMap = new Map([
        ['a', { id: 'a', status: 2, noDb: false }],
        ['b', { id: 'b', status: 3, noDb: false }],
        ['c', { id: 'c', status: 2, noDb: true }],
      ]);
      const prev = { ...getInitial(), list: listMap, item: { ...getInitial().item, list: itemList, bookmark: 'bk1' } };
      const state = reducer(prev, {
        type: SET_ITEM, select: null, latest: 'new_lat', bookmark: 'bk1',
        multi: null, list: 2, id: 'a', opt: 'myopt', time: null,
      });
      expect(state[2].list).toBeInstanceOf(Set);
      expect(state[2].list.has('a')).toBe(true);
      expect(state[2].list.has('c')).toBe(true);
      expect(state[2].list.has('b')).toBe(false);
      expect(state[2].page).toBe(1); // only 'a' has noDb=false
      expect(state[2].opt).toBe('myopt');
      expect(state.latest).toBe('new_lat');
    });

    test('with list as array sets complete=false on items', () => {
      const prev = getInitial();
      const items = [{ name: 'order1' }, { name: 'order2' }];
      const state = reducer(prev, {
        type: SET_ITEM, select: null, latest: null, bookmark: null,
        multi: null, list: items, id: 'myid', opt: null, time: 5,
      });
      expect(state[9]).toBeDefined();
      expect(state[9].more).toBe(false);
      expect(state[9].index).toBe(5);
    });

    test('latest only updates when bookmark matches', () => {
      const prev = { ...getInitial(), item: { ...getInitial().item, bookmark: 'bk1' }, latest: 'old' };
      // bookmark matches
      const s1 = reducer(prev, {
        type: SET_ITEM, select: null, latest: 'new', bookmark: 'bk1',
        multi: null, list: null, id: null, opt: null, time: null,
      });
      expect(s1.latest).toBe('new');

      // bookmark doesn't match
      const s2 = reducer(prev, {
        type: SET_ITEM, select: null, latest: 'new2', bookmark: 'bk_other',
        multi: null, list: null, id: null, opt: null, time: null,
      });
      expect(s2.latest).toBe('old');
    });
  });

  describe('ITEM_PUSH', () => {
    test('with sort resets item list (initial load)', () => {
      const prev = getInitial();
      const items = [{ id: 'i1', utime: 1609459200 }, { id: 'i2' }];
      const state = reducer(prev, {
        type: ITEM_PUSH, item: items, path: { cur: ['root'] },
        bookmark: 'bk1', latest: 'lat1', sortName: 'name', sortType: 'asc',
        pageToken: null, list: 'item',
      });
      expect(state.item.sortName).toBe('name');
      expect(state.item.list.size).toBe(2);
      expect(state.item.bookmark).toBe('bk1');
      expect(state.path).toEqual({ cur: ['root'] });
      expect(state.list.get('i1').utime).toMatch(/2021\/1\/1/);
    });

    test('with sort and empty array sets more=false', () => {
      const prev = getInitial();
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [], path: null, bookmark: null,
        latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item',
      });
      expect(state.item.more).toBe(false);
    });

    test('without sort appends (pagination)', () => {
      const prev = {
        ...getInitial(),
        list: new Map([['i1', { id: 'i1' }]]),
        item: { ...getInitial().item, list: new Set(['i1']), page: 1 },
      };
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [{ id: 'i2' }], path: null, bookmark: null,
        latest: null, sortName: null, sortType: null, pageToken: null, list: 'item',
      });
      expect(state.item.list.size).toBe(2);
      expect(state.item.page).toBe(2);
    });

    test('without sort empty array sets more=false', () => {
      const prev = {
        ...getInitial(),
        item: { ...getInitial().item, page: 5 },
      };
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [], path: null, bookmark: null,
        latest: null, sortName: null, sortType: null, pageToken: null, list: 'item',
      });
      expect(state.item.more).toBe(false);
      expect(state.item.page).toBe(5); // unchanged
    });

    test('with pageToken and matching path appends', () => {
      const prev = {
        ...getInitial(),
        path: { cur: ['root', 'sub'], exactly: [], his: [] },
        list: new Map([['i1', { id: 'i1' }]]),
        item: { ...getInitial().item, list: new Set(['i1']), page: 1, more: true },
      };
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [{ id: 'i2' }], path: { cur: ['root', 'sub'] },
        bookmark: null, latest: null, sortName: null, sortType: null,
        pageToken: 'nextToken', list: 'item',
      });
      expect(state.item.pageToken).toBe('nextToken');
      expect(state.item.list.size).toBe(2);
    });

    test('with pageToken and mismatching path ignores', () => {
      const prev = {
        ...getInitial(),
        path: { cur: ['root', 'other'], exactly: [], his: [] },
        item: { ...getInitial().item, list: new Set(['i1']), page: 1 },
      };
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [{ id: 'i2' }], path: { cur: ['root', 'sub'] },
        bookmark: null, latest: null, sortName: null, sortType: null,
        pageToken: 'tk', list: 'item',
      });
      // State unchanged because path doesn't match
      expect(state.item.list.size).toBe(1);
    });

    test('non-item list is ignored when sort is provided', () => {
      const prev = getInitial();
      const state = reducer(prev, {
        type: ITEM_PUSH, item: [{ id: 'x' }], path: null, bookmark: null,
        latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'other',
      });
      // Should return state unchanged (list !== 'item')
      expect(state).toBe(prev);
    });
  });

  describe('ITEM_POP', () => {
    test('removes from list, item.list, and select', () => {
      const prev = {
        ...getInitial(),
        list: new Map([['i1', { id: 'i1' }], ['i2', { id: 'i2' }]]),
        item: { ...getInitial().item, list: new Set(['i1', 'i2']), page: 2 },
        select: new Set(['i1']),
      };
      const state = reducer(prev, { type: ITEM_POP, id: 'i1' });
      expect(state.list.has('i1')).toBe(false);
      expect(state.item.list.has('i1')).toBe(false);
      expect(state.item.page).toBe(1);
      expect(state.select.has('i1')).toBe(false);
    });

    test('also removes from numbered sub-lists', () => {
      const prev = {
        ...getInitial(),
        list: new Map([['i1', { id: 'i1' }]]),
        item: { ...getInitial().item, list: new Set(['i1']), page: 1 },
        select: new Set(),
        2: { list: new Set(['i1']), page: 1 },
      };
      const state = reducer(prev, { type: ITEM_POP, id: 'i1' });
      expect(state[2].list.has('i1')).toBe(false);
      expect(state[2].page).toBe(0);
    });
  });
});

describe('complexDataHandle (bitfinex) — rest_item2 formatting', () => {
  const reducer = complexDataHandle(BITFINEX_PUSH, BITFINEX_POP, SET_BITFINEX);

  test('formats utime > 10000 with HH:MM:SS', () => {
    // 2021-01-01 00:00:00 UTC = 1609459200
    const items = [{ id: 'bf1', utime: 1609459200 }];
    const state = reducer(undefined, {
      type: BITFINEX_PUSH, item: items, path: null, bookmark: null,
      latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item', noScroll: true,
    });
    const item = state.list.get('bf1');
    // Should be formatted as M/D HH:MM:SS
    expect(item.utime).toMatch(/\d+\/\d+ \d{2}:\d{2}:\d{2}/);
  });

  test('keeps utime <= 10000 as-is', () => {
    const items = [{ id: 'bf2', utime: 5 }];
    const state = reducer(undefined, {
      type: BITFINEX_PUSH, item: items, path: null, bookmark: null,
      latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item', noScroll: true,
    });
    expect(state.list.get('bf2').utime).toBe(5);
  });

  test('without sort and pageToken appends to named sub-list', () => {
    const initial = reducer(undefined, { type: 'INIT' });
    // First push to set up
    const s1 = reducer(initial, {
      type: BITFINEX_PUSH, item: [{ id: 'bf1', utime: 20000 }], path: null, bookmark: null,
      latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item', noScroll: true,
    });
    // Append without sort
    const s2 = reducer(s1, {
      type: BITFINEX_PUSH, item: [{ id: 'bf2', utime: 30000 }], path: null, bookmark: null,
      latest: null, sortName: null, sortType: null, pageToken: null, list: 'item', noScroll: true,
    });
    expect(s2.item.list.size).toBe(2);
    expect(s2.item.page).toBe(2);
  });

  test('with pageToken and matching path', () => {
    const initial = reducer(undefined, { type: 'INIT' });
    const s1 = reducer(initial, {
      type: BITFINEX_PUSH, item: [{ id: 'bf1' }], path: { cur: ['a'] }, bookmark: null,
      latest: null, sortName: 'name', sortType: 'asc', pageToken: null, list: 'item', noScroll: true,
    });
    const s2 = reducer(s1, {
      type: BITFINEX_PUSH, item: [{ id: 'bf2' }], path: { cur: ['a'] }, bookmark: null,
      latest: null, sortName: null, sortType: null, pageToken: 'page2', list: 'item', noScroll: true,
    });
    expect(s2.item.pageToken).toBe('page2');
    expect(s2.item.list.size).toBe(2);
  });

  test('POP from numbered sub-lists (3 and 4)', () => {
    const initial = reducer(undefined, { type: 'INIT' });
    const state = {
      ...initial,
      list: new Map([['bf1', { id: 'bf1' }]]),
      item: { ...initial.item, list: new Set(['bf1']), page: 1 },
      select: new Set(['bf1']),
      3: { list: new Set(['bf1']), page: 1 },
      4: { list: new Set(['bf1']), page: 1 },
    };
    const result = reducer(state, { type: BITFINEX_POP, id: 'bf1' });
    expect(result[3].list.has('bf1')).toBe(false);
    expect(result[4].list.has('bf1')).toBe(false);
    expect(result[3].page).toBe(0);
    expect(result[4].page).toBe(0);
  });

  test('SET_BITFINEX with list=9 (array mode) sets complete=false', () => {
    const initial = reducer(undefined, { type: 'INIT' });
    const items = [{ name: 'order1' }, { name: 'order2' }];
    const state = reducer(initial, {
      type: SET_BITFINEX, select: null, latest: null, bookmark: null,
      multi: null, list: items, id: 'myid', opt: null, time: 3,
    });
    expect(state[9]).toBeDefined();
    expect(state[9].index).toBe(3);
    expect(state[9].more).toBe(false);
  });
});

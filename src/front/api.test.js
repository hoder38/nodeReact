/**
 * Tests for utility.js API functions (fetch-dependent).
 * Mocks isomorphic-fetch and configureStore history.
 */

// Mock isomorphic-fetch
jest.mock('isomorphic-fetch');

// Mock configureStore to provide a fake history
jest.mock('./configureStore.js', () => ({
  history: { push: jest.fn() },
}));

import fetch from 'isomorphic-fetch';
import { history } from './configureStore.js';
import { api, doLogin, doLogout, testLogin, getItemList, resetItemList, dirItemList, bookmarkItemList } from './utility.js';

beforeEach(() => {
  fetch.mockReset();
  history.push.mockReset();
});

describe('api()', () => {
  test('GET request without data', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: 1 }) });
    const result = await api('/api/test');
    expect(fetch).toHaveBeenCalledWith('/api/test', { credentials: 'include', method: 'GET' });
    expect(result).toEqual({ data: 1 });
  });

  test('POST request with data', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) });
    const result = await api('/api/item', { name: 'test' });
    expect(fetch).toHaveBeenCalledWith('/api/item', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    }));
    expect(result).toEqual({ ok: true });
  });

  test('PUT method with data', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await api('/api/item', { id: 1 }, 'PUT');
    expect(fetch).toHaveBeenCalledWith('/api/item', expect.objectContaining({ method: 'PUT' }));
  });

  test('DELETE method without data', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await api('/api/item/1', null, 'DELETE');
    expect(fetch).toHaveBeenCalledWith('/api/item/1', expect.objectContaining({ method: 'DELETE' }));
  });
});

describe('errorHandle (via api)', () => {
  test('400 throws response text', async () => {
    fetch.mockResolvedValue({ ok: false, status: 400, text: () => Promise.resolve('Bad request') });
    await expect(api('/api/test')).rejects.toBe('Bad request');
  });

  test('401 with relogin=true redirects to /Login', async () => {
    // Simulate being on a non-login page
    Object.defineProperty(window, 'location', { value: { pathname: '/Storage' }, writable: true });
    fetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('unauth') });
    await expect(api('/api/test', null, 'GET', true)).rejects.toThrow('');
    expect(history.push).toHaveBeenCalledWith('/Login');
  });

  test('401 with relogin=true and already on /Login does not redirect', async () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/Login' }, writable: true });
    fetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('') });
    await expect(api('/api/test', null, 'GET', true)).rejects.toThrow('');
    expect(history.push).not.toHaveBeenCalled();
  });

  test('401 with relogin=false throws response text', async () => {
    fetch.mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('unauthorized') });
    await expect(api('/api/test', null, 'GET', false)).rejects.toBe('unauthorized');
  });

  test('403 throws unknown API error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 403 });
    await expect(api('/api/test')).rejects.toThrow('unknown API!!!');
  });

  test('404 throws response text', async () => {
    fetch.mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('Not found') });
    await expect(api('/api/test')).rejects.toBe('Not found');
  });

  test('500 throws response text', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('Server error') });
    await expect(api('/api/test')).rejects.toBe('Server error');
  });

  test('unknown status throws generic error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 502 });
    await expect(api('/api/test')).rejects.toThrow('unknown error');
  });
});

describe('doLogin', () => {
  test('successful login without cascading', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ loginOK: true }) });
    await doLogin('user', 'pass');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('cascading login calls second server', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ loginOK: true, url: 'https://server2' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ loginOK: true }) });
    await doLogin('user', 'pass');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('https://server2/api/login');
  });

  test('failed login throws auth fail', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ loginOK: false }) });
    await expect(doLogin('user', 'wrong')).rejects.toThrow('auth fail!!!');
  });
});

describe('doLogout', () => {
  test('successful logout without cascading', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    await doLogout();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('cascading logout calls second server', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ url: 'https://server2' }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });
    await doLogout();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('testLogin', () => {
  test('calls /api/testLogin with relogin=false', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 'user1' }) });
    const result = await testLogin();
    expect(result).toEqual({ id: 'user1' });
    expect(fetch).toHaveBeenCalledWith('/api/testLogin', expect.objectContaining({ method: 'GET' }));
  });
});

describe('getItemList', () => {
  test('basic query without name', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [{ id: 'i1' }], parentList: ['p'], bookmarkID: 'bk', latest: 'lat',
    }) });
    const set = jest.fn();
    await getItemList('password', 'name', 'asc', set, 0, '', false);
    expect(fetch.mock.calls[0][0]).toBe('/api/password/get/name/asc/0');
    expect(set).toHaveBeenCalledWith([{ id: 'i1' }], ['p'], 'bk', 'lat', 'name', 'asc');
  });

  test('storage type also calls externalList', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        itemList: [{ id: 'i1' }], parentList: ['p'], bookmarkID: 'bk', latest: 'lat',
      }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({
        itemList: [{ id: 'e1' }], pageToken: 'tk2',
      }) });
    const set = jest.fn();
    await getItemList('storage', 'name', 'asc', set, 0, 'tk1');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toBe('/api/storage/external/get/name/tk1');
  });

  test('with push=true calls set differently', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [{ id: 'i1' }], parentList: ['p'], bookmarkID: 'bk', latest: 'lat',
    }) });
    const set = jest.fn();
    await getItemList('password', 'name', 'asc', set, 0, '', true);
    expect(set).toHaveBeenCalledWith([{ id: 'i1' }]);
  });

  test('with name uses search endpoint', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: '', latest: '',
    }) });
    const set = jest.fn();
    await getItemList('password', 'name', 'asc', set, 0, '', false, 'test', 0, true);
    expect(fetch.mock.calls[0][0]).toBe('/api/password/getSingle/name/asc/0/test/true/0');
  });

  test('with multi or index>0 uses get endpoint', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: '', latest: '',
    }) });
    const set = jest.fn();
    await getItemList('password', 'name', 'asc', set, 0, '', false, 'test', 0, false, true);
    expect(fetch.mock.calls[0][0]).toBe('/api/password/get/name/asc/0/test/false/0');
  });

  test('with invalid name rejects', async () => {
    const set = jest.fn();
    await expect(getItemList('password', 'name', 'asc', set, 0, '', false, 'a\\b'))
      .rejects.toBe('search tag is not vaild!!!');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('random storage query', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: '', latest: '',
    }) });
    const set = jest.fn();
    await getItemList('storage', 'name', 'asc', set, 0, '', false, null, 0, false, false, true);
    expect(fetch.mock.calls[0][0]).toBe('/api/storage/getRandom/name/asc/0');
  });
});

describe('resetItemList', () => {
  test('calls reset endpoint and sets', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [{ id: 'r1' }], parentList: [], bookmarkID: 'bk', latest: 'lat',
    }) });
    const set = jest.fn();
    await resetItemList('password', 'name', 'asc', set);
    expect(fetch.mock.calls[0][0]).toBe('/api/password/reset/name/asc');
    expect(set).toHaveBeenCalled();
  });
});

describe('dirItemList', () => {
  test('single query', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: '', latest: '',
    }) });
    const set = jest.fn();
    await dirItemList('password', 'name', 'asc', set, 'dir1', false);
    expect(fetch.mock.calls[0][0]).toBe('/api/parent/password/query/dir1/name/asc/single');
  });

  test('multi query', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: '', latest: '',
    }) });
    const set = jest.fn();
    await dirItemList('password', 'name', 'asc', set, 'dir1', true);
    expect(fetch.mock.calls[0][0]).toBe('/api/parent/password/query/dir1/name/asc');
  });
});

describe('bookmarkItemList', () => {
  test('calls bookmark endpoint', async () => {
    fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({
      itemList: [], parentList: [], bookmarkID: 'bk1', latest: '',
    }) });
    const set = jest.fn();
    await bookmarkItemList('stock', 'asc', 'name', 'asc', set, 'bk1');
    expect(fetch.mock.calls[0][0]).toBe('/api/bookmark/stock/asc/bk1/name/asc');
  });
});

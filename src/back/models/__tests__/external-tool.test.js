/**
 * external-tool.test.js — Comprehensive tests for external-tool.js
 *
 * ESM mocking: jest.unstable_mockModule() BEFORE dynamic import().
 * Module exports: default object (getSingleList, parseTagUrl,
 *   getSingleId, saveSingle).
 *
 * Strategy: Mock all external deps (Api, Mongo, Redis, GoogleApi, Htmlparser,
 *   youtubedl, Mkdirp, fs, ReadTorrent, OpenCC, sendWs, utility, tag-tool,
 *   mime, constants). Build minimal DOM-like structures for cheerio traversal.
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Helper: Build mock DOM nodes for findTag traversal
// ---------------------------------------------------------------------------
const mkNode = (tag, className, children = [], attribs = {}) => ({
  type: 'tag',
  name: tag,
  attribs: className ? { class: className, ...attribs } : { ...attribs },
  children: children.map(c =>
    typeof c === 'string' ? { type: 'text', data: c } : c
  ),
});
const mkText = data => ({ type: 'text', data });

// ---------------------------------------------------------------------------
// Mock setup — all BEFORE dynamic import
// ---------------------------------------------------------------------------
const mockApi = jest.fn();
jest.unstable_mockModule('../api-tool.js', () => ({ default: mockApi }));

const mockMongo = jest.fn();
const mockObjectID = jest.fn(() => 'mock-oid');
jest.unstable_mockModule('../mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

const mockRedis = jest.fn();
jest.unstable_mockModule('../redis-tool.js', () => ({ default: mockRedis }));

const mockGoogleApi = jest.fn();
jest.unstable_mockModule('../api-tool-google.js', () => ({ default: mockGoogleApi }));

const mockNormalize = jest.fn(s => s.toLowerCase());
const mockIsDefaultTag = jest.fn(() => false);
jest.unstable_mockModule('../tag-tool.js', () => ({
  normalize: mockNormalize,
  isDefaultTag: mockIsDefaultTag,
}));

const mockParseDOM = jest.fn();
const ELEMENT_TYPE = {Root:'root',Text:'text',Directive:'directive',Comment:'comment',Script:'script',Style:'style',Tag:'tag',CDATA:'cdata',Doctype:'doctype'};
jest.unstable_mockModule('htmlparser2', () => ({
  default: { parseDOM: mockParseDOM },
  ElementType: ELEMENT_TYPE,
  parseDocument: jest.fn(() => ({ type: 'root', children: [] })),
}));

const mockYoutubedl = jest.fn();
jest.unstable_mockModule('youtube-dl-exec', () => ({ default: mockYoutubedl }));

const mockMkdirp = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('mkdirp', () => ({ default: mockMkdirp }));

const mockFsExistsSync = jest.fn(() => false);
jest.unstable_mockModule('fs', () => ({
  default: { existsSync: mockFsExistsSync },
}));

const mockReadTorrent = jest.fn();
jest.unstable_mockModule('read-torrent', () => ({ default: mockReadTorrent }));

const mockOpenCC = {
  simplifiedToTraditional: jest.fn(s => `T(${s})`),
};
jest.unstable_mockModule('node-opencc', () => ({ default: mockOpenCC }));

const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({ default: mockSendWs }));

const mockAddPost = jest.fn((name, suf) => `${name}${suf}`);
jest.unstable_mockModule('../../util/mime.js', () => ({ addPost: mockAddPost }));

class MockHoError extends Error {
  constructor(msg) { super(msg); this.name = 'HoError'; }
}
const mockHandleError = jest.fn((err, type) => {
  if (type && typeof type === 'function') return type(err);
  if (type && typeof type === 'string') return undefined;
  return Promise.reject(err);
});
const mockToValidName = jest.fn(s => s);
const mockIsValidString = jest.fn((s, type) => s);
const mockGetJson = jest.fn(s => {
  try { return JSON.parse(s); } catch { return false; }
});
const mockCompleteZero = jest.fn((n, o) => String(n).padStart(o, '0'));
const mockGetFileLocation = jest.fn(() => '/tmp/mock/file.tmp');
const mockAddPre = jest.fn((url, pre) =>
  url.match(/^(https|http):\/\//) ? url : url.match(/^\//) ? `${pre}${url}` : `${pre}/${url}`
);
const mockTorrent2Magnet = jest.fn(() => 'magnet:?xt=urn:btih:HASH123');

jest.unstable_mockModule('../../util/utility.js', () => ({
  handleError: mockHandleError,
  HoError: MockHoError,
  toValidName: mockToValidName,
  isValidString: mockIsValidString,
  getJson: mockGetJson,
  completeZero: mockCompleteZero,
  getFileLocation: mockGetFileLocation,
  addPre: mockAddPre,
  torrent2Magnet: mockTorrent2Magnet,
}));

jest.unstable_mockModule('../../constants.js', () => ({
  GENRE_LIST: ['action', 'comedy', 'sci-fi', 'horror', 'drama'],
  GENRE_LIST_CH: ['動作', '喜劇', '科幻', '恐怖', '劇情'],
  DM5_ORI_LIST: ['ori1'],
  DM5_CH_LIST: ['ch1'],
  GAME_LIST: ['sports', 'racing'],
  GAME_LIST_CH: ['體育', '賽車'],
  MUSIC_LIST: ['搖滾'],
  MUSIC_LIST_WEB: ['rock'],
  CACHE_EXPIRE: 86400,
  STORAGEDB: 'storage',
  MONTH_NAMES: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  MONTH_SHORTS: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
}));

jest.unstable_mockModule('path', () => ({
  default: {
    dirname: jest.fn(p => p.replace(/\/[^/]+$/, '')),
    extname: jest.fn(p => { const m = p.match(/\.[^.]+$/); return m ? m[0] : ''; }),
    join: jest.fn((...args) => args.join('/')),
  },
}));

// ---------------------------------------------------------------------------
// Import module after mocks
// ---------------------------------------------------------------------------
let ExternalTool;

beforeAll(async () => {
  const mod = await import('../external-tool.js');
  ExternalTool = mod.default;
});

let consoleSpy;
beforeEach(() => {
  jest.clearAllMocks();
  consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  mockHandleError.mockImplementation((err, type) => {
    if (type && typeof type === 'function') return type(err);
    if (type && typeof type === 'string') return undefined;
    return Promise.reject(err);
  });
});
afterEach(() => { consoleSpy.mockRestore(); });

// ===========================================================================
// getSingleList
// ===========================================================================
describe('getSingleList', () => {
  test('returns [] when url is falsy', async () => {
    const result = await ExternalTool.getSingleList('yify', '');
    expect(result).toEqual([]);
  });

  test('unknown type → handleError', async () => {
    await expect(ExternalTool.getSingleList('unknown_type', 'http://x'))
      .rejects.toThrow('unknown external type');
  });

  // ----- yify -----
  describe('yify', () => {
    test('returns movies with genre mapping', async () => {
      mockApi.mockResolvedValue({
        status: 'ok',
        data: {
          movies: [{
            title: 'TestMovie',
            id: 123,
            small_cover_image: 'http://img/cover.jpg',
            year: 2020,
            rating: 8.5,
            genres: ['Action', 'Comedy'],
          }],
        },
      });
      const result = await ExternalTool.getSingleList('yify', 'https://yts.mx/page');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestMovie');
      expect(result[0].id).toBe(123);
      expect(result[0].rating).toBe(8.5);
    });

    test('returns [] when no movies', async () => {
      mockApi.mockResolvedValue({ status: 'ok', data: {} });
      const result = await ExternalTool.getSingleList('yify', 'https://yts.mx/page');
      expect(result).toEqual([]);
    });

    test('api fail → handleError', async () => {
      mockApi.mockResolvedValue({ status: 'fail' });
      await expect(ExternalTool.getSingleList('yify', 'https://yts.mx'))
        .rejects.toThrow('yify api fail');
    });

    test('genre not in GENRE_LIST is still added', async () => {
      mockApi.mockResolvedValue({
        status: 'ok',
        data: {
          movies: [{
            title: 'X', id: 1, small_cover_image: '', year: 2021,
            rating: 5, genres: ['Thriller'],
          }],
        },
      });
      const result = await ExternalTool.getSingleList('yify', 'http://yts.mx');
      expect(result[0].tags).toContain('movie');
    });

    test('genres undefined', async () => {
      mockApi.mockResolvedValue({
        status: 'ok',
        data: { movies: [{ title: 'X', id: 1, small_cover_image: '', year: 2021, rating: 5 }] },
      });
      const result = await ExternalTool.getSingleList('yify', 'http://yts.mx');
      expect(result).toHaveLength(1);
    });
  });



  // ----- dm5 -----
  describe('dm5', () => {
    test('dm5 — HTML format (has <html>)', async () => {
      const a = mkNode('a', null, [], { href: '/manga-abc/', title: 'TestManga' });
      const tipWrap = mkNode('div', null, [mkNode('div', null, [a], {id: 'mh-item-tip'})], {id: 'mh-tip-wrap'});
      const cover = mkNode('p', null, [], { id: 'mh-cover', style: 'url(http://cover.jpg)' });
      const item = mkNode('div', null, [tipWrap, cover], {id: 'mh-item'});
      const li = mkNode('li', null, [item]);
      const body = mkNode('body', null, [
        mkNode('section', 'box container pb40 overflow-Show', [
          mkNode('div', 'box-body', [
            mkNode('ul', null, [li], {id: 'mh-list col7'}),
          ]),
        ]),
      ]);
      const html = mkNode('html', null, [body]);
      mockParseDOM.mockReturnValue([html]);
      mockApi.mockResolvedValue('<html>');
      const result = await ExternalTool.getSingleList('dm5', 'http://dm5.com', { search: 'x' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('manga-abc');
      expect(result[0].tags).toContain('漫畫');
    });

    test('dm5 — non-HTML format (no <html>)', async () => {
      const spanChild = mkNode('span', null, [mkText('Part1')]);
      const textChild = mkText('Part2');
      const span = mkNode('span', null, [spanChild, textChild]);
      const p = mkNode('p', null, [span]);
      const item = { type: 'tag', name: 'a', attribs: { href: '/manga-xyz/' }, children: [p] };
      mockParseDOM.mockReturnValue([item]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('dm5', 'http://dm5.com');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Part1Part2');
      expect(result[0].thumb).toBe('dm5.png');
    });
  });
});

// ===========================================================================
// getSingleId
// ===========================================================================
describe('getSingleId', () => {
  test('numeric index < 1 → error', async () => {
    await expect(ExternalTool.getSingleId('youtube', 'http://x', 0))
      .rejects.toThrow('index must > 0');
  });
  test('unknown type → error', async () => {
    await expect(ExternalTool.getSingleId('unknown', 'http://x', 1))
      .rejects.toThrow('unknown external type');
  });

  // ----- yify getSingleId -----
  describe('yify', () => {
    test('yify — redis cached', async () => {
      mockRedis.mockResolvedValue({
        raw_list: JSON.stringify([{ magnet: 'magnet:?xt=urn:btih:HASH1&extra', title: 'Movie1' }]),
        is_end: 'false',
        etime: '999999',
      });
      mockIsValidString.mockReturnValue('magnet:?xt=urn:btih:HASH1&extra');
      mockMongo.mockResolvedValue([]);
      const result = await ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1);
      expect(result[0].magnet).toBe('magnet:?xt=urn:btih:HASH1&extra');
      expect(result[0].is_magnet).toBe(true);
    });

    test('yify — redis miss, api fetch with torrent', async () => {
      mockRedis.mockResolvedValue(null);
      const apiData = JSON.stringify({
        status: 'ok',
        data: {
          movie: {
            title: 'TestMovie',
            torrents: [
              { quality: '720p', url: 'http://torrent.url', type: 'web' },
            ],
          },
        },
      });
      mockApi.mockResolvedValue(apiData);
      mockGetJson.mockReturnValue({
        status: 'ok',
        data: {
          movie: {
            title: 'TestMovie',
            torrents: [{ quality: '720p', url: 'http://torrent.url', type: 'web' }],
          },
        },
      });
      mockReadTorrent.mockImplementation((url, cb) => cb(null, { infoHash: 'HASH123', name: 'test' }));
      mockTorrent2Magnet.mockReturnValue('magnet:?xt=urn:btih:HASH123');
      mockIsValidString.mockReturnValue('magnet:?xt=urn:btih:HASH123');
      mockMongo.mockResolvedValue([]);
      const result = await ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1);
      expect(result[0].title).toBe('TestMovie');
    });

    test('yify — torrent2Magnet returns null → error', async () => {
      mockRedis.mockResolvedValue(null);
      mockApi.mockResolvedValue('{}');
      mockGetJson.mockReturnValue({
        status: 'ok',
        data: {
          movie: {
            title: 'X',
            torrents: [{ quality: '1080p', url: 'http://t.url', type: 'bluray' }],
          },
        },
      });
      mockReadTorrent.mockImplementation((url, cb) => cb(null, {}));
      mockTorrent2Magnet.mockReturnValue(null);
      await expect(ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1))
        .rejects.toThrow('magnet create fail');
    });

    test('yify — ReadTorrent error', async () => {
      mockRedis.mockResolvedValue(null);
      mockApi.mockResolvedValue('{}');
      mockGetJson.mockReturnValue({
        status: 'ok',
        data: {
          movie: {
            title: 'X',
            torrents: [{ quality: '720p', url: 'http://t.url', type: 'web' }],
          },
        },
      });
      mockReadTorrent.mockImplementation((url, cb) => cb(new Error('read fail'), null));
      await expect(ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1)).rejects.toThrow('read fail');
    });

    test('yify — no magnet (no matching quality)', async () => {
      mockRedis.mockResolvedValue(null);
      mockApi.mockResolvedValue('{}');
      mockGetJson.mockReturnValue({
        status: 'ok',
        data: {
          movie: {
            title: 'X',
            torrents: [{ quality: '480p', url: 'http://t.url', type: 'web' }],
          },
        },
      });
      mockIsValidString.mockReturnValue(false);
      await expect(ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1))
        .rejects.toThrow('magnet is not vaild');
    });

    test('yify — 1080p bluray preferred over web', async () => {
      mockRedis.mockResolvedValue(null);
      mockApi.mockResolvedValue('{}');
      mockGetJson.mockReturnValue({
        status: 'ok',
        data: {
          movie: {
            title: 'X',
            torrents: [
              { quality: '1080p', url: 'http://web.url', type: 'web' },
              { quality: '1080p', url: 'http://bluray.url', type: 'bluray' },
            ],
          },
        },
      });
      mockReadTorrent.mockImplementation((url, cb) => cb(null, {}));
      mockTorrent2Magnet.mockReturnValue('magnet:?xt=urn:btih:BR');
      mockIsValidString.mockReturnValue('magnet:?xt=urn:btih:BR');
      mockMongo.mockResolvedValue([]);
      const result = await ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1);
      // The second torrent (bluray) should be selected
      expect(mockReadTorrent).toHaveBeenCalledWith('http://bluray.url', expect.any(Function));
    });

    test('yify — existing magnet in DB → returns id', async () => {
      mockRedis.mockResolvedValue({
        raw_list: JSON.stringify([{ magnet: 'magnet:?xt=urn:btih:HASH1&extra', title: 'M' }]),
        is_end: 'true',
        etime: '999',
      });
      mockIsValidString.mockReturnValue('magnet:?xt=urn:btih:HASH1&extra');
      mockMongo.mockResolvedValue([{ _id: 'existing-id' }]);
      const result = await ExternalTool.getSingleId('yify', 'http://yts.mx/movie/1', 1);
      expect(result[0].id).toBe('existing-id');
      expect(result[0].magnet).toBeUndefined();
    });
  });
  // ----- dm5 getSingleId -----
  describe('dm5', () => {
    test('dm5 — redis cached', async () => {
      mockRedis.mockResolvedValue({
        raw_list: JSON.stringify([{ title: 'Ch1', url: 'http://dm5.com/ch1' }]),
        is_end: 'true',
        etime: '999999',
      });
      const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manga', 1);
      expect(result[0].title).toBe('Ch1');
      expect(result[0].pre_url).toBe('http://dm5.com/ch1');
    });

    test('dm5 — choose not found, resets to index=1', async () => {
      mockRedis.mockResolvedValue({
        raw_list: JSON.stringify([{ title: 'Ch1', url: 'http://dm5.com/ch1' }]),
        is_end: 'false',
        etime: '999999',
      });
      const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manga', 5);
      expect(result[0].title).toBe('Ch1');
    });

    test('dm5 — both fallback choices fail → error', async () => {
      mockRedis.mockResolvedValue({
        raw_list: JSON.stringify([]),
        is_end: 'false',
        etime: '999999',
      });
      await expect(ExternalTool.getSingleId('dm5', 'http://dm5.com/manga', 5))
        .rejects.toThrow('cannot find external index');
    });
  });
});


// ===========================================================================
// saveSingle
// ===========================================================================
describe('saveSingle', () => {
  test('unknown type → error', async () => {
    await expect(ExternalTool.saveSingle('unknown', '123'))
      .rejects.toThrow('unknown external type');
  });

  test('yify — numeric id', async () => {
    mockApi.mockResolvedValue('{}');
    mockGetJson.mockReturnValue({
      status: 'ok',
      data: {
        movie: {
          title: 'TestMovie',
          imdb_code: 'tt123',
          year: 2020,
          genres: ['Action'],
          cast: [{ name: 'Actor1' }],
          small_cover_image: 'http://cover.jpg',
        },
      },
    });
    const result = await ExternalTool.saveSingle('yify', 123);
    expect(result[0]).toBe('TestMovie');
    expect(result[3]).toBe('yify');
  });

  test('yify — string id (needs page scrape)', async () => {
    const movieInfo = mkNode('div', 'movie-info', [], { 'data-movie-id': '456' });
    const row = mkNode('div', 'row', [movieInfo]);
    const movieContent = mkNode('div', 'movie-content', [row]);
    const mainContent = mkNode('div', 'main-content', [movieContent]);
    const body = mkNode('body', null, [mainContent]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockImplementation((type, url) => {
      if (url.includes('movie_details.json')) return Promise.resolve('{}');
      return Promise.resolve('<html>');
    });
    mockGetJson.mockReturnValue({
      status: 'ok',
      data: {
        movie: {
          title: 'TestM', imdb_code: 'tt1', year: 2021,
          small_cover_image: 'http://c.jpg',
        },
      },
    });
    const result = await ExternalTool.saveSingle('yify', 'test-movie');
    expect(result[0]).toBe('TestM');
  });

  test('yify — api fail', async () => {
    mockApi.mockResolvedValue('{}');
    mockGetJson.mockReturnValue({ status: 'fail' });
    await expect(ExternalTool.saveSingle('yify', 1)).rejects.toThrow('yify api fail');
  });

  test('yify — json parse error', async () => {
    mockApi.mockResolvedValue('bad');
    mockGetJson.mockReturnValue(false);
    await expect(ExternalTool.saveSingle('yify', 1)).rejects.toThrow('json parse error');
  });


  test('dm5 — extracts info', async () => {
    const bannerForm = mkNode('div', 'banner_detail_form', [
      mkNode('div', 'info', [
        mkNode('p', 'subtitle', [mkNode('a', null, [mkText('Author1')])]),
        mkNode('p', 'tip', [
          mkNode('span', 'block', [mkText('status')]),
          mkNode('span', 'block', [mkNode('a', null, [mkNode('span', null, [mkText('Genre1')])])]),
        ]),
        mkNode('p', 'title', [mkText('MangaTitle')]),
      ]),
      mkNode('div', 'cover', [mkNode('img', null, [], { src: 'http://cover.jpg' })]),
    ]);
    const bannerDetail = mkNode('section', 'banner_detail', [bannerForm]);
    const emptyClassDiv = mkNode('div', null, [bannerDetail]);
    emptyClassDiv.attribs.class = '';
    const body = mkNode('body', null, [emptyClassDiv]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.saveSingle('dm5', 'manga-123');
    expect(result[3]).toBe('dm5');
  });

  test('dm5 — no info div → error', async () => {
    const body = mkNode('body', null, [mkNode('div', 'other', [])]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.saveSingle('dm5', 'manga-123'))
      .rejects.toThrow('dm5 misses info');
  });
});



// ===========================================================================
// Edge cases & coverage helpers
// ===========================================================================
describe('edge cases', () => {

  // --- getSingleId yify non-cached ---
  test('getSingleId yify — non-cached, fetches from API with torrent', async () => {
    mockRedis.mockResolvedValue(null);
    const yifyData = {
      status: 'ok',
      data: {
        movie: {
          title: 'TestFilm',
          torrents: [
            { quality: '1080p', url: 'http://torrent.url/file.torrent', type: 'bluray' },
          ],
        },
      },
    };
    mockApi.mockResolvedValue(JSON.stringify(yifyData));
    mockGetJson.mockReturnValue(yifyData);
    mockReadTorrent.mockImplementation((url, cb) => cb(null, { infoHash: 'HASH' }));
    mockIsValidString.mockReturnValue('magnet:?xt=urn:btih:HASH123');
    mockMongo.mockResolvedValue([]);
    const result = await ExternalTool.getSingleId('yify', 'http://yts.mx/api/v2/movie_details.json?movie_id=123', 1);
    expect(result[0].title).toBe('TestFilm');
    expect(result[0].is_magnet).toBe(true);
  });

  // --- getSingleId dm5 non-cached ---
  test('getSingleId dm5 — non-cached, fetches chapter list', async () => {
    mockRedis.mockResolvedValue(null);
    const chapterA = mkNode('a', null, [mkText('Chapter 1')], { href: '/m12345/' });
    const chapterLi = mkNode('li', null, [chapterA]);
    const chapterUl = mkNode('ul', null, [chapterLi]);
    const chapterLoad = mkNode('div', null, [chapterUl], {id: 'chapterlistload'});
    // banner_detail to check completion
    const statusSpan = mkNode('span', null, [mkText('連載中')]);
    const blockSpan = mkNode('span', 'block', [statusSpan]);
    const tipP = mkNode('p', 'tip', [blockSpan]);
    const info = mkNode('div', 'info', [tipP]);
    const form = mkNode('div', 'banner_detail_form', [info]);
    const bannerSection = mkNode('section', 'banner_detail', [form]);
    const bannerDiv = mkNode('div', null, [bannerSection]);
    const body = mkNode('body', null, [bannerDiv, chapterLoad]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockMongo.mockResolvedValue([]);
    mockIsValidString.mockReturnValue('magnet:?hash');
    const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manhua-123/', 1);
    expect(result[0].title).toBe('Chapter 1');
  });


  // getSingleId dm5 — non-cached with nested ul (L2612-2613) and title from div.info (L2618-2619)
  test('getSingleId dm5 — chapters with nested ul and div.info title', async () => {
    mockRedis.mockImplementation((cmd, key) => {
      if (cmd === 'hgetall') return Promise.resolve(null);
      return Promise.resolve();
    });
    const chapterA = mkNode('a', null, [mkNode('div', 'info', [mkNode('p', 'title', [mkText('Chapter Title')])])], { href: '/m999/' });
    const nestedLi = mkNode('li', null, [chapterA]);
    const nestedUl = mkNode('ul', null, [nestedLi]);
    const mainA = mkNode('a', null, [mkText('Chapter 1')], { href: '/m888/' });
    const mainLi = mkNode('li', null, [mainA]);
    const chapterUl = mkNode('ul', null, [mainLi, nestedUl]);
    const chapterLoad = mkNode('div', null, [chapterUl], {id: 'chapterlistload'});
    const statusSpan = mkNode('span', null, [mkText('已完结')]);
    const blockSpan = mkNode('span', 'block', [statusSpan]);
    const tipP = mkNode('p', 'tip', [blockSpan]);
    const info = mkNode('div', 'info', [tipP]);
    const form = mkNode('div', 'banner_detail_form', [info]);
    const bannerSection = mkNode('section', 'banner_detail', [form]);
    const bannerDiv = mkNode('div', null, [bannerSection]);
    const body = mkNode('body', null, [bannerDiv, chapterLoad]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockMongo.mockResolvedValue([]);
    mockIsValidString.mockReturnValue('magnet:?hash');
    const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manhua-999/', 1);
    expect(result[1]).toBe(true); // is_end (已完结)
    expect(result[2]).toBe(2); // total count (mainLi reversed + nestedLi)
  });







  // getSingleId yify — json parse error (L2332-2333)
  test('getSingleId yify — non-cached json parse error', async () => {
    mockRedis.mockImplementation((cmd) => {
      if (cmd === 'hgetall') return Promise.resolve(null);
      return Promise.resolve();
    });
    mockApi.mockResolvedValue('bad json');
    mockGetJson.mockReturnValue(false);
    await expect(ExternalTool.getSingleId('yify', 'http://yts.mx/movie/test', 1))
      .rejects.toThrow('json parse error');
  });
});

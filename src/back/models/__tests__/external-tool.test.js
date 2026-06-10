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
// parseTagUrl
// ===========================================================================
describe('parseTagUrl', () => {
  test('unknown type → error', async () => {
    await expect(ExternalTool.parseTagUrl('unknown', 'http://x'))
      .rejects.toThrow('unknown external type');
  });

  test('imdb — extracts title and basic tags', async () => {
    // IMDB has deeply nested findTag chains. Build minimal DOM to exercise the title match.
    // The sections forEach with data-testid checks will iterate but not match — covers the default path.
    const titleTag = mkNode('title', null, [mkText('Inception (2010) - IMDb')]);
    const head = mkNode('head', null, [titleTag]);
    // Build IMDB DOM: html > body > div#__next > main > div > section > div > section > div > div > section[]
    const innerDiv = mkNode('div', null, []);
    const innerSection = mkNode('section', null, [mkNode('div', null, [innerDiv])]);
    const outerSection = mkNode('section', null, [mkNode('div', null, [innerSection])]);
    const main = mkNode('main', null, [mkNode('div', null, [outerSection])]);
    const nextDiv = mkNode('div', '__next', [main]);
    const body = mkNode('body', null, [nextDiv]);
    const html = mkNode('html', null, [head, body]);
    mockParseDOM.mockReturnValue([html]);
    mockApi.mockResolvedValue('<html>');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('imdb', 'http://imdb.com/title/tt123/');
    expect(result).toContain('歐美');
    expect(result).toContain('inception');
    expect(result).toContain('2010');
  });

  test('steam — extracts game info with genre mapping', async () => {
    // Steam: html > body > div.responsive_page_frame > ... > div.block > div > div > div
    // The innermost div contains text nodes + <a> tags
    const innerDiv = mkNode('div', null, [
      mkText('Valve, '),
      mkText('30 Jun, 2020'),
      mkNode('a', null, [mkText('sports')]),
    ]);
    const div2 = mkNode('div', null, [innerDiv]);
    const div1 = mkNode('div', null, [div2]);
    const block = mkNode('div', null, [div1], {id: 'appDetailsUnderlinedLinks'});
    const body = mkNode('body', null, [block]);
    const html = mkNode('html', null, [body]);
    mockParseDOM.mockReturnValue([html]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('steam', 'http://store.steampowered.com/app/123');
    expect(result).toContain('歐美');
    expect(result).toContain('遊戲');
    expect(result).toContain('game');
    // 'sports' → 'sport' remapping
    expect(result).toContain('sport');
  });

  test('marvel/dc — extracts comic info', async () => {
    const nameDiv = mkNode('div', null, [mkText('Spider-Man')]);
    const firstAppDiv = mkNode('div', null, [mkText('First appearance')]);
    const dateLink = mkNode('a', null, [mkText('August 1962')]);
    const dateDiv = mkNode('div', null, [dateLink]);
    const dd0 = mkNode('div', null, [firstAppDiv, mkNode('div', null, []), dateDiv]);
    const nonCenterDiv = mkNode('div', null, [nameDiv, dd0]);
    nonCenterDiv.attribs.class = 'not-center';
    const mwContent = mkNode('div', 'mw-content-text', [nonCenterDiv]);
    const wikiArticle = mkNode('div', 'WikiaArticle', [mwContent]);
    const mainContentContainer = mkNode('div', 'WikiaMainContentContainer', [wikiArticle]);
    const mainContent = mkNode('article', 'WikiaMainContent', [mainContentContainer]);
    const contentWrapper = mkNode('div', 'WikiaPageContentWrapper', [mainContent]);
    const wikiPage = mkNode('section', 'WikiaPage', [contentWrapper]);
    const siteWrapper = mkNode('div', 'WikiaSiteWrapper', [wikiPage]);
    const body = mkNode('body', null, [siteWrapper]);
    const html = mkNode('html', null, [body]);
    mockParseDOM.mockReturnValue([html]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('marvel', 'http://marvel.wikia.com/Spider-Man');
    expect(result).toContain('歐美');
    expect(result).toContain('漫畫');
    expect(result).toContain('comic');
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



  test('parseTagUrl allmusic — album', async () => {
    const artistLink = mkNode('a', null, [mkText('Artist1')]);
    const artistSpan = mkNode('span', null, [artistLink]);
    const albumArtist = mkNode('h2', null, [artistSpan], {id: 'album-artist'});
    const albumTitle = mkNode('h1', null, [mkText(' Album Title ')], {id: 'album-title'});
    const hgroup = mkNode('hgroup', null, [albumArtist, albumTitle]);
    const header = mkNode('header', null, [hgroup]);
    const contentDiv = mkNode('div', null, [header], {id: 'content'});
    const releaseDateSpan = mkNode('span', null, [mkText('September 15, 2020')]);
    const releaseDateDiv = mkNode('div', null, [releaseDateSpan], {id: 'release-date'});
    const genreLink = mkNode('a', null, [mkText('Rock')]);
    const genreInnerDiv = mkNode('div', null, [genreLink]);
    const genreDiv = mkNode('div', null, [genreInnerDiv], {id: 'genre'});
    const basicInfo = mkNode('section', null, [releaseDateDiv, genreDiv], {id: 'basic-info'});
    const sidebar = mkNode('div', null, [basicInfo], {id: 'sidebar'});
    const container = mkNode('div', null, [contentDiv, sidebar], {id: 'content-container'});
    const cmnWrap = mkNode('div', null, [container], {id: 'cmn_wrap'});
    const overflow = mkNode('div', 'overflow-container album', [cmnWrap]);
    // allmusic: findTag(body, 'div')[1] — need TWO divs in body
    const dummyDiv = mkNode('div', 'other', []);
    const body = mkNode('body', null, [dummyDiv, overflow]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('allmusic', 'http://allmusic.com/album/1');
    expect(result).toContain('歐美');
    expect(result).toContain('音樂');
  });

  test('parseTagUrl allmusic — song', async () => {
    const artistLink = mkNode('a', null, [mkText('SongArtist')]);
    const artistSpan = mkNode('span', null, [artistLink]);
    const songArtist = mkNode('h2', 'song-artist', [artistSpan]);
    const songTitle = mkNode('h1', 'song-title', [mkText(' SongTitle ')]);
    const hgroup = mkNode('hgroup', null, [songArtist, songTitle]);
    const header = mkNode('header', null, [hgroup]);
    const yearTd = mkNode('td', 'year', [mkText(' 2019 ')]);
    const tr = mkNode('tr', null, [yearTd]);
    const tbody = mkNode('tbody', null, [tr]);
    const table = mkNode('table', null, [tbody]);
    const appearances = mkNode('section', 'appearances', [table]);
    const overview = mkNode('div', 'content overview', [header, appearances]);
    const container = mkNode('div', 'content-container', [overview]);
    const cmnWrap = mkNode('div', 'cmn_wrap', [container]);
    const overflow = mkNode('div', 'overflow-container song', [cmnWrap]);
    const dummyDiv = mkNode('div', 'other', []);
    const body = mkNode('body', null, [dummyDiv, overflow]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('allmusic', 'http://allmusic.com/song/1');
    expect(result).toContain('音樂');
  });

  test('parseTagUrl allmusic — artist', async () => {
    const artistName = mkNode('h1', null, [mkText(' ArtistName ')], {id: 'artist-name'});
    const hgroup = mkNode('hgroup', null, [artistName]);
    const bioContainer = mkNode('div', null, [hgroup], {id: 'artist-bio-container'});
    const header = mkNode('header', null, [bioContainer]);
    const contentDiv = mkNode('div', null, [header], {id: 'content'});
    const genreLink = mkNode('a', null, [mkText('Rock')]);
    const genreInnerDiv = mkNode('div', null, [genreLink]);
    const genreDiv = mkNode('div', null, [genreInnerDiv], {id: 'genre'});
    const basicInfo = mkNode('section', null, [genreDiv], {id: 'basic-info'});
    const sidebar = mkNode('div', null, [basicInfo], {id: 'sidebar'});
    const container = mkNode('div', null, [contentDiv, sidebar], {id: 'content-container'});
    const cmnWrap = mkNode('div', null, [container], {id: 'cmn_wrap'});
    const overflow = mkNode('div', 'overflow-container artist', [cmnWrap]);
    const dummyDiv = mkNode('div', 'other', []);
    const body = mkNode('body', null, [dummyDiv, overflow]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('allmusic', 'http://allmusic.com/artist/1');
    expect(result).toContain('artistname');
  });

  test('parseTagUrl tvdb — extracts tv show info', async () => {
    const h1title = mkNode('h1', null, [mkText('ShowTitle')]);
    const row0td2_h1 = mkNode('h1', null, [mkText('ShowTitle')]);
    const contentDiv0_td0 = mkNode('td', null, [mkText('First Aired:')]);
    const contentDiv0_td1_date = mkNode('td', null, [mkText('2020-01-15')]);
    const networkTd0 = mkNode('td', null, [mkText('Network:')]);
    const networkTd1 = mkNode('td', null, [mkText('HBO')]);
    const genreTd0 = mkNode('td', null, [mkText('Genre:')]);
    const genreTd1 = mkNode('td', null, [mkText('Drama'), mkText('sci-fi')]);
    const tr0 = mkNode('tr', null, [contentDiv0_td0, contentDiv0_td1_date]);
    const tr1 = mkNode('tr', null, [networkTd0, networkTd1]);
    const tr2 = mkNode('tr', null, [genreTd0, genreTd1]);
    const table0 = mkNode('table', null, [mkNode('tr', null, [mkNode('td', null, [mkNode('table', null, [tr0, tr1, tr2])])])]);
    const content0 = mkNode('div', null, [h1title, table0], {id: 'content'});
    const actorH1 = mkNode('h1', null, [mkText('Actors')]);
    const actorName = mkNode('a', null, [mkText('Actor1')]);
    const actorH2 = mkNode('h2', null, [actorName]);
    const actorTd = mkNode('td', null, [mkNode('table', null, [mkNode('tr', null, [mkNode('td', null, [actorH2])])])]);
    const actorTr = mkNode('tr', null, [actorTd]);
    const actorTable = mkNode('table', null, [actorTr]);
    const content1 = mkNode('div', null, [actorH1, actorTable], {id: 'content'});
    const fanart = mkNode('div', null, [
      mkNode('table', null, [
        mkNode('tr', null, [
          mkNode('td', null, []),
          mkNode('td', null, []),
          mkNode('td', null, [mkNode('div', null, [h1title], {id: 'content'})]),
        ]),
      ]),
      content0, content1,
    ], {id: 'fanart'});
    const maincontent = mkNode('td', null, [fanart], {id: 'maincontent'});
    const tr2_ = mkNode('tr', null, []);
    const tr3 = mkNode('tr', null, []);
    const tr4 = mkNode('tr', null, [mkNode('td', null, []), mkNode('td', null, []), maincontent]);
    const table = mkNode('table', null, [tr2_, tr3, tr4]);
    const body = mkNode('body', null, [table]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('tvdb', 'http://thetvdb.com/show/1');
    expect(result).toContain('歐美');
    expect(result).toContain('電視劇');
  });
  // --- IMDB with cast/storyline/details sections ---
  test('imdb — with cast, storyline, details sections', async () => {
    const titleTag = mkNode('title', null, [mkText('TestMovie (2021) - IMDb')]);
    const head = mkNode('head', null, [titleTag]);
    // Cast section: sec > div[1] > div[1] > div(foreach) > div[1] > a > text
    const castA = mkNode('a', null, [mkText('ActorName')]);
    const castInner = mkNode('div', null, [mkNode('div', null, []), mkNode('div', null, [castA])]);  // div[1] has <a>
    const castOuter = mkNode('div', null, [mkNode('div', null, []), mkNode('div', null, [castInner])]);  // div[1] has cast divs
    const castSection = mkNode('section', null, [mkNode('div', null, []), castOuter]);
    castSection.attribs['data-testid'] = 'title-cast';
    // Storyline section: sec > div[1] > ul[1] > li[1] > div[0] > ul[0] > li(forEach) > a > text
    const genreA = mkNode('a', null, [mkText('Drama')]);
    const genreLiFinal = mkNode('li', null, [genreA]);
    const genreUlFinal = mkNode('ul', null, [genreLiFinal]);
    const genreInnerDiv = mkNode('div', null, [genreUlFinal]);
    const genreLi_skip = mkNode('li', null, []);
    const genreLi = mkNode('li', null, [genreInnerDiv]);
    const genreUl_skip = mkNode('ul', null, []);
    const genreUl = mkNode('ul', null, [genreLi_skip, genreLi]);
    const stDiv_skip = mkNode('div', null, []);
    const stDiv = mkNode('div', null, [genreUl_skip, genreUl]);
    const storylineSection = mkNode('section', null, [stDiv_skip, stDiv]);
    storylineSection.attribs['data-testid'] = 'Storyline';
    // Details section with Countries of origin
    const countryA = mkNode('a', null, [mkText('USA')]);
    const countryLi = mkNode('li', null, [countryA]);
    const countryUl = mkNode('ul', null, [countryLi]);
    const countryDiv = mkNode('div', null, [countryUl]);
    const detailDe = mkNode('li', null, [mkNode('a', null, [mkText('Countries of origin')]), countryDiv]);
    // Details with Languages
    const langA = mkNode('a', null, [mkText('English')]);
    const langLi = mkNode('li', null, [langA]);
    const langUl = mkNode('ul', null, [langLi]);
    const langDiv = mkNode('div', null, [langUl]);
    const langDe = mkNode('li', null, [mkNode('a', null, [mkText('Languages')]), langDiv]);
    const detailsSection = mkNode('section', null, [
      mkNode('div', null, []),
      mkNode('div', null, [mkNode('ul', null, [detailDe, langDe])]),
    ]);
    detailsSection.attribs['data-testid'] = 'Details';
    // Main structure
    const innerDiv = mkNode('div', null, [castSection, storylineSection, detailsSection]);
    const sec2 = mkNode('section', null, [mkNode('div', null, [innerDiv])]);
    const sec1 = mkNode('section', null, [mkNode('div', null, [sec2])]);
    const mainDiv = mkNode('div', null, [sec1]);
    const main = mkNode('main', null, [mainDiv]);
    const nextDiv = mkNode('div', '__next', [main]);
    const body = mkNode('body', null, [nextDiv]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [head, body])]);
    mockApi.mockResolvedValue('<html>');
    mockToValidName.mockImplementation(s => s);
    const result = await ExternalTool.parseTagUrl('imdb', 'http://imdb.com/title/tt999/');
    expect(result).toContain('歐美');
    expect(result).toContain('testmovie');
    expect(result).toContain('2021');
    expect(result).toContain('actorname');
    expect(result).toContain('drama');
    expect(result).toContain('usa');
    expect(result).toContain('english');
  });

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

  // parseTagUrl marvel — with First appearance and creator (L1886-1916)
  test('parseTagUrl marvel — with First appearance and creator', async () => {
    // mw-content-text has child divs. First non-center div is processed.
    // That div has child divs: div[0]=name, div[1+]=info
    // div[0] has text → name added
    // div[1] has inner divs: dd[0] text='First appearance', dd[2] > div > a text = 'Issue #1 2020'
    // div[2] has inner divs: dd[0] text='creator', dd[1] > a text = 'Stan Lee'
    const nameDiv = mkNode('div', null, [mkText('Marvel Hero')]);
    // First appearance block: dd[0]=label, dd[1]=filler, dd[2]=date container
    const firstAppLabelDiv = mkNode('div', null, [mkText('First appearance')]);
    const fillerDiv = mkNode('div', null, []);
    const dateLink = mkNode('a', null, [mkText('Issue #1 2020')], { href: '/issue/1' });
    const dateInnerDiv = mkNode('div', null, [dateLink]);
    const dateDiv = mkNode('div', null, [dateInnerDiv]);
    const firstAppBlock = mkNode('div', null, [firstAppLabelDiv, fillerDiv, dateDiv]);
    // Creator block: dd[0]=label, dd[1]=link container
    const creatorLabelDiv = mkNode('div', null, [mkText('creator')]);
    const creatorLink = mkNode('a', null, [mkText('Stan Lee')], { href: '/creator/1' });
    const creatorDiv = mkNode('div', null, [creatorLabelDiv, mkNode('div', null, [creatorLink])]);
    // The non-center div containing all info
    const infoDiv = mkNode('div', null, [nameDiv, firstAppBlock, creatorDiv]);
    const mwContent = mkNode('div', null, [infoDiv], {id: 'mw-content-text'});
    const wikiArticle = mkNode('div', null, [mwContent], {id: 'WikiaArticle'});
    const mainContent = mkNode('div', null, [wikiArticle], {id: 'WikiaMainContentContainer'});
    const article = mkNode('article', null, [mainContent], {id: 'WikiaMainContent'});
    const pageWrapper = mkNode('div', null, [article], {id: 'WikiaPageContentWrapper'});
    const wikiPage = mkNode('section', null, [pageWrapper], {id: 'WikiaPage'});
    const siteWrapper = mkNode('div', null, [wikiPage], {id: 'WikiaSiteWrapper'});
    const body = mkNode('body', null, [siteWrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('marvel', 'http://marvel.fandom.com/wiki/test');
    expect(result).toContain('marvel hero');
    expect(result).toContain('2020');
    expect(result).toContain('stan lee');
  });

  // parseTagUrl marvel — name from nested tag child (L1895-1899)
  test('parseTagUrl marvel — name from nested tag child', async () => {
    // div[0] has no direct text, but has a child tag with text
    const nameSpan = mkNode('span', null, [mkText('Nested Name')]);
    const nameDiv = mkNode('div', null, [nameSpan]); // no text children, only tag children
    const infoDiv = mkNode('div', null, [nameDiv]);
    const mwContent = mkNode('div', null, [infoDiv], {id: 'mw-content-text'});
    const wikiArticle = mkNode('div', null, [mwContent], {id: 'WikiaArticle'});
    const mainContent = mkNode('div', null, [wikiArticle], {id: 'WikiaMainContentContainer'});
    const article = mkNode('article', null, [mainContent], {id: 'WikiaMainContent'});
    const pageWrapper = mkNode('div', null, [article], {id: 'WikiaPageContentWrapper'});
    const wikiPage = mkNode('section', null, [pageWrapper], {id: 'WikiaPage'});
    const siteWrapper = mkNode('div', null, [wikiPage], {id: 'WikiaSiteWrapper'});
    const body = mkNode('body', null, [siteWrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('marvel', 'http://marvel.fandom.com/wiki/test2');
    expect(result).toContain('nested name');
  });

  // parseTagUrl marvel — span-based creator labels (L1915-1916)
  test('parseTagUrl marvel — span-based labels', async () => {
    const nameDiv = mkNode('div', null, [mkText('Hero')]);
    // dd[0] has no text but has spans. span[1] matches 'writer'.
    const span0 = mkNode('span', null, [mkText('label:')]);
    const span1 = mkNode('span', null, [mkText('writer')]);
    const labelDiv = mkNode('div', null, [span0, span1]);
    const creatorLink = mkNode('a', null, [mkText('JSmith')], { href: '/w' });
    const creatorValDiv = mkNode('div', null, [creatorLink]);
    const infoBlock = mkNode('div', null, [labelDiv, creatorValDiv]);
    const infoDiv = mkNode('div', null, [nameDiv, infoBlock]);
    const mwContent = mkNode('div', null, [infoDiv], {id: 'mw-content-text'});
    const wikiArticle = mkNode('div', null, [mwContent], {id: 'WikiaArticle'});
    const mainContent = mkNode('div', null, [wikiArticle], {id: 'WikiaMainContentContainer'});
    const article = mkNode('article', null, [mainContent], {id: 'WikiaMainContent'});
    const pageWrapper = mkNode('div', null, [article], {id: 'WikiaPageContentWrapper'});
    const wikiPage = mkNode('section', null, [pageWrapper], {id: 'WikiaPage'});
    const siteWrapper = mkNode('div', null, [wikiPage], {id: 'WikiaSiteWrapper'});
    const body = mkNode('body', null, [siteWrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('marvel', 'http://marvel.fandom.com/wiki/test3');
    expect(result).toContain('jsmith');
  });

  // parseTagUrl steam — GAME_LIST match (L1849) and sports→sport (L1844)
  test('parseTagUrl steam — game list match with racing and sports→sport', async () => {
    const innerDiv = mkNode('div', null, [
      mkText('Studio, '),
      mkText('15 Jan, 2020'),
      mkNode('a', null, [mkText('Racing')]),
      mkNode('a', null, [mkText('Sports')]),
    ]);
    const div2 = mkNode('div', null, [innerDiv]);
    const div1 = mkNode('div', null, [div2]);
    const block = mkNode('div', null, [div1], {id: 'appDetailsUnderlinedLinks'});
    const body = mkNode('body', null, [block]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('steam', 'http://store.steampowered.com/app/456');
    expect(result).toContain('sport');
    expect(result).toContain('racing');
    expect(result).toContain('賽車');
  });

  // parseTagUrl tvdb — science-fiction → sci-fi (L1943)
  test('parseTagUrl tvdb — science-fiction normalized to sci-fi', async () => {
    const nameH1 = mkNode('h1', null, [mkText('ShowName')]);
    const nameDiv = mkNode('div', null, [nameH1], {id: 'content'});
    const nameTd = mkNode('td', null, [nameDiv]);
    const skip = mkNode('td', null, []);
    const skip2 = mkNode('td', null, []);
    const nameRow = mkNode('tr', null, [skip, skip2, nameTd]);
    const nameTable = mkNode('table', null, [nameRow]);
    // Detail rows
    const labelTd1 = mkNode('td', null, [mkText('First Aired:')]);
    const valTd1 = mkNode('td', null, [mkText('October 1, 2020')]);
    const detailRow1 = mkNode('tr', null, [labelTd1, valTd1]);
    const labelTd2 = mkNode('td', null, [mkText('Network:')]);
    const valTd2 = mkNode('td', null, [mkText('HBO')]);
    const detailRow2 = mkNode('tr', null, [labelTd2, valTd2]);
    const labelTd3 = mkNode('td', null, [mkText('Genre:')]);
    const valTd3 = mkNode('td', null, [mkText('Science-Fiction'), mkText('Drama')]);
    const detailRow3 = mkNode('tr', null, [labelTd3, valTd3]);
    const innerTable = mkNode('table', null, [detailRow1, detailRow2, detailRow3]);
    const innerTd = mkNode('td', null, [innerTable]);
    const innerRow = mkNode('tr', null, [innerTd]);
    const mainTable = mkNode('table', null, [innerRow]);
    const contentDiv1 = mkNode('div', null, [mainTable], {id: 'content'});
    const contentDiv2 = mkNode('div', null, [], {id: 'content'});
    const fanart = mkNode('div', null, [nameTable, contentDiv1, contentDiv2], {id: 'fanart'});
    const maincontent = mkNode('td', null, [fanart], {id: 'maincontent'});
    const skipTr1 = mkNode('tr', null, []);
    const skipTr2 = mkNode('tr', null, []);
    const mainTr = mkNode('tr', null, [maincontent]);
    const outerTable = mkNode('table', null, [skipTr1, skipTr2, mainTr]);
    const body = mkNode('body', null, [outerTable]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('tvdb', 'http://thetvdb.com/show/1');
    expect(result).toContain('sci-fi');
    expect(result).toContain('科幻');
    expect(result).toContain('hbo');
    expect(result).toContain('2020');
  });

  // IMDB cast ul > li branch (L1811-1812)
  test('parseTagUrl imdb — cast section with ul>li structure', async () => {
    // div-based cast chain: sec > div[1] > div[1] > div.forEach(cast => cast > div[1] > a[0] > text)
    const castLink2 = mkNode('a', null, [mkText('DivActor')], { href: '/name/2' });
    const castActorDiv = mkNode('div', null, [castLink2]);
    const castSkipInner = mkNode('div', null, []);
    const castItem = mkNode('div', null, [castSkipInner, castActorDiv]);
    const innerSkip = mkNode('div', null, []);
    const innerContainer = mkNode('div', null, [castItem]);
    const outerSkip = mkNode('div', null, []);
    const outerContainer = mkNode('div', null, [innerSkip, innerContainer]);

    // ul>li cast chain: sec > ul[0] > li.forEach(li => li > div[0] > ul[0] > li.forEach(c => c > a[0] > text))
    const castLink = mkNode('a', null, [mkText('UlActor')], { href: '/name/1' });
    const innerLi = mkNode('li', null, [castLink]);
    const innerUl = mkNode('ul', null, [innerLi]);
    const liDiv = mkNode('div', null, [innerUl]);
    const outerLi = mkNode('li', null, [liDiv]);
    const outerUl = mkNode('ul', null, [outerLi]);

    const castSkipDiv = mkNode('div', null, []);
    const castSection = mkNode('section', null, [castSkipDiv, outerContainer, outerUl]);
    castSection.attribs['data-testid'] = 'title-cast';

    // Build the 8-level chain: body > div.__next > main > div[0] > section[0] > div[0] > section[0] > div[0] > div[0] > section(forEach)
    const innerDiv1 = mkNode('div', null, [castSection]);
    const innerDiv2 = mkNode('div', null, [innerDiv1]);
    const innerSection2 = mkNode('section', null, [innerDiv2]);
    const innerDiv3 = mkNode('div', null, [innerSection2]);
    const innerSection1 = mkNode('section', null, [innerDiv3]);
    const mainDiv = mkNode('div', null, [innerSection1]);
    const mainEl = mkNode('main', null, [mainDiv]);
    const next = mkNode('div', '__next', [mainEl]);
    const body = mkNode('body', null, [next]);
    const head = mkNode('head', null, [mkNode('title', null, [mkText('TestMovie (2020) - IMDb')])]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [head, body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.parseTagUrl('imdb', 'http://www.imdb.com/title/tt123');
    expect(result).toContain('ulactor');
    expect(result).toContain('divactor');
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

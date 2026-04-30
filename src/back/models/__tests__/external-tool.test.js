/**
 * external-tool.test.js — Comprehensive tests for external-tool.js
 *
 * ESM mocking: jest.unstable_mockModule() BEFORE dynamic import().
 * Module exports: default object (getSingleList, save2Drive, parseTagUrl,
 *   getSingleId, saveSingle) + internal updateDocDate.
 *
 * Strategy: Mock all external deps (Api, Mongo, Redis, GoogleApi, Htmlparser,
 *   youtubedl, Mkdirp, fs, ReadTorrent, OpenCC, sendWs, utility, tag-tool,
 *   mime, constants). Build minimal DOM-like structures for findTag traversal.
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
jest.unstable_mockModule('htmlparser2', () => ({
  default: { parseDOM: mockParseDOM },
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
const realFindTag = (node, tag = null, id = null) => {
  if (!node) return [];
  const children = Array.isArray(node) ? node : (node.children || []);
  if (!tag) {
    // Match real findTag: only return text-node strings (trimmed, non-empty)
    let result = [];
    for (const c of children) {
      if (c.type === 'text') {
        const str = c.data.toString().trim();
        if (str) result.push(str);
      }
    }
    return result;
  }
  let result = [];
  for (const c of children) {
    if ((c.type === 'tag' || c.type === 'script') && c.name === tag) {
      if (!id) {
        result.push(c);
      } else if (c.attribs) {
        for (const a of Object.keys(c.attribs)) {
          if (c.attribs[a].trim() === id) {
            result.push(c);
            break;
          }
        }
      }
    }
  }
  return result;
};
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
  findTag: realFindTag,
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
  DOCDB: 'docUpdate',
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
      const tipWrap = mkNode('div', 'mh-tip-wrap', [mkNode('div', 'mh-item-tip', [a])]);
      const cover = mkNode('p', 'mh-cover', [], { style: 'url(http://cover.jpg)' });
      const item = mkNode('div', 'mh-item', [tipWrap, cover]);
      const li = mkNode('li', null, [item]);
      const body = mkNode('body', null, [
        mkNode('section', 'box container pb40 overflow-Show', [
          mkNode('div', 'box-body', [
            mkNode('ul', 'mh-list col7', [li]),
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

  // ----- date-based types (bls, cen, bea, ism, cbo, etc.) -----
  describe('date-based types', () => {
    test('bls — date match', async () => {
      const dateStr = '01/14/2020';
      const a = mkNode('a', null, [mkText('Job Report')], { href: '/news/report.pdf' });
      const li = mkNode('li', null, [mkText(dateStr), a]);
      const body = mkNode('body', null, [
        mkNode('section', null, [
          mkNode('div', 'wrapper-outer', [
            mkNode('div', 'wrapper', [
              mkNode('div', 'container', [
                mkNode('div', 'main-content-full-width', [
                  mkNode('div', 'bodytext', [
                    mkNode('div', 'bls', [
                      mkNode('ul', null, [li]),
                    ]),
                  ]),
                ]),
              ]),
            ]),
          ]),
        ]),
      ]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      // url is the "date" param — January 15 2020 → subtract 1 day = Jan 14
      const result = await ExternalTool.getSingleList('bls', '2020-01-15');
      expect(result).toHaveLength(1);
    });

    test('bls — invalid date → error', async () => {
      mockApi.mockResolvedValue('');
      mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [])])]);
      await expect(ExternalTool.getSingleList('bls', 'not-a-date'))
        .rejects.toThrow('date invalid');
    });

    test('sca — date 15 or 28', async () => {
      mockApi.mockResolvedValue('');
      // url="2020-01-16" → subtract 1 = Jan 15 → date.getDate()===15
      const result = await ExternalTool.getSingleList('sca', '2020-01-16');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Michigan Consumer Sentiment Index');
    });

    test('sca — date not 15 or 28', async () => {
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('sca', '2020-01-11');
      expect(result).toEqual([]);
    });

    test('sem — rss match', async () => {
      // url="2020-01-15" → subtract 1 = Jan 14 → docDate = "14 January 2020"
      const item = mkNode('item', null, [
        mkText('http://www.semi.org/news1'),
        mkNode('pubdate', null, [mkText('Tue, 14 January 2020 12:00:00 GMT')]),
        mkNode('title', null, [mkText('SEMI Report')]),
      ]);
      const channel = mkNode('channel', null, [item]);
      const rss = mkNode('rss', null, [channel]);
      mockParseDOM.mockReturnValue([rss]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('sem', '2020-01-15');
      expect(result).toHaveLength(1);
    });

    test('ism — date.getDate() === 27', async () => {
      // url="2020-03-28" → subtract 1 = Mar 27 → date.getDate()===27
      const a = mkNode('a', null, [mkText('ISM PDF')], { href: '/ism.pdf' });
      const p = mkNode('p', null, [a]);
      const center = mkNode('center', null, [p]);
      const cardText = mkNode('div', 'card__text', [center]);
      const cardContent = mkNode('div', 'card__content', [cardText]);
      const card = mkNode('div', 'card', [cardContent]);
      const col1 = mkNode('div', 'col-md-4 card__col', [card]);
      const col2 = mkNode('div', 'col-md-4 card__col', [
        mkNode('div', 'card', [mkNode('div', 'card__content', [mkNode('div', 'card__text', [mkNode('center', null, [mkNode('p', null, [mkNode('a', null, [mkText('ISM2')], { href: '/ism2.pdf' })])])])])])
      ]);
      const row = mkNode('div', 'row justify-content-center', [col1, col2]);
      const cardColl = mkNode('div', 'cardCollection', [row]);
      const container = mkNode('div', 'container', [cardColl]);
      const component1 = mkNode('div', 'component', []);
      const component2 = mkNode('div', 'component', [container]);
      const main = mkNode('main', null, [component1, component2]);
      const rootDiv = mkNode('div', 'rootOfObserver', [main]);
      const body = mkNode('body', null, [rootDiv]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('ism', '2020-03-28');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    test('ism — date not 27', async () => {
      const body = mkNode('body', null, [
        mkNode('div', 'rootOfObserver', [mkNode('main', null, [mkNode('div', 'component', []), mkNode('div', 'component', [mkNode('div', 'container', [mkNode('div', 'cardCollection', [mkNode('div', 'row justify-content-center', [])])])])])]),
      ]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('ism', '2020-03-15');
      expect(result).toEqual([]);
    });

    test('cbo — with publicationWrap div', async () => {
      const pDate = mkNode('p', 'date', [mkText('March 15, 2020')]);
      const chConf = mkNode('div', 'chConferences', [pDate]);
      const mainCont = mkNode('div', 'mainContainer', [chConf]);
      const pubInner = mkNode('div', 'publctnInWrap mbN-80 pubHubGrayBox', [mainCont]);
      const section = mkNode('section', 'mbN-40', [pubInner]);
      const pubWrap = mkNode('div', 'publicationWrap esfPubWrap', [section]);
      const body = mkNode('body', null, [pubWrap]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      // url="2020-03-16" → subtract 1 → Mar 15 2020
      const result = await ExternalTool.getSingleList('cbo', '2020-03-16');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Consumer Confidence Survey');
    });

    test('cbo — else branch (esfTopicsBannerMain)', async () => {
      const pDate = mkNode('p', 'date', [mkText('March 15, 2020')]);
      const chConf = mkNode('div', 'chConferences', [pDate]);
      const mainCont = mkNode('div', 'mainContainer', [chConf]);
      const pubInner = mkNode('div', 'publctnInWrap mbN-80 pubHubGrayBox', [mainCont]);
      const section = mkNode('section', 'mbN-40', [pubInner]);
      const pubWrap = mkNode('div', 'publicationWrap esfPubWrap esfTopicsBannerMain', [section]);
      const body = mkNode('body', null, [pubWrap]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('cbo', '2020-03-16');
      expect(result).toHaveLength(1);
    });

    test('ndc — json match', async () => {
      const jsonStr = JSON.stringify([
        { date: '2020-01-14', content: 'href="http://ndc.gov.tw/file.pdf" title="景氣指標2020年01月test"' },
      ]);
      mockApi.mockResolvedValue(jsonStr);
      mockGetJson.mockReturnValue([
        { date: '2020-01-14', content: 'href="http://ndc.gov.tw/file.pdf" title="景氣指標2020年01月test"' },
      ]);
      const result = await ExternalTool.getSingleList('ndc', '2020-01-15');
      expect(result).toHaveLength(1);
    });

    test('ndc — json parse error', async () => {
      mockApi.mockResolvedValue('bad json');
      mockGetJson.mockReturnValue(false);
      await expect(ExternalTool.getSingleList('ndc', '2020-01-15'))
        .rejects.toThrow('json parse error');
    });

    test('ndc — no date match', async () => {
      mockApi.mockResolvedValue('[]');
      mockGetJson.mockReturnValue([{ date: '2020-01-01', content: '' }]);
      const result = await ExternalTool.getSingleList('ndc', '2020-01-15');
      expect(result).toEqual([]);
    });

    test('ndc — no list_match in content', async () => {
      mockApi.mockResolvedValue('[]');
      mockGetJson.mockReturnValue([{ date: '2020-01-14', content: 'no links here' }]);
      const result = await ExternalTool.getSingleList('ndc', '2020-01-15');
      expect(result).toEqual([]);
    });

    test('tri — date match', async () => {
      // TRI uses ROC calendar: 2020-1911=109
      // url="2020-01-15" → docDate="109.1.15"
      const a = mkNode('a', null, [mkText('109.1.15 消費者信心指數')], { href: '/report.pdf' });
      const consText = mkNode('div', 'consumerText', [a]);
      const divs = [
        mkNode('div', null, []),
        mkNode('div', null, [consText]),
      ];
      const content01LText = mkNode('div', 'content01LText', divs);
      const content02L = mkNode('div', 'content02L', [content01LText]);
      const content01 = mkNode('div', 'content01', [content02L]);
      const content = mkNode('div', 'content', [content01]);
      const main = mkNode('div', 'main', [content]);
      const body = mkNode('body', null, [main]);
      mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
      mockApi.mockResolvedValue('');
      const result = await ExternalTool.getSingleList('tri', '2020-01-15');
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('消費者信心指數調查報告');
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
    const block = mkNode('div', 'block responsive_apppage_details_left game_details underlined_links', [div1]);
    const rightcol = mkNode('div', 'rightcol game_meta_data', [block]);
    const pageContent = mkNode('div', 'page_content', [rightcol]);
    const pageContentCtn = mkNode('div', 'page_content_ctn', [pageContent]);
    const gameBg = mkNode('div', 'game_page_background game', [pageContentCtn]);
    const respTemp = mkNode('div', 'responsive_page_template_content', [gameBg]);
    const respContent = mkNode('div', 'responsive_page_content', [respTemp]);
    const respFrame = mkNode('div', 'responsive_page_frame with_header', [respContent]);
    const body = mkNode('body', null, [respFrame]);
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
// save2Drive
// ===========================================================================
describe('save2Drive', () => {
  test('unknown type → error', async () => {
    await expect(ExternalTool.save2Drive('unknown', {}, 'parent'))
      .rejects.toThrow('unknown external type');
  });

  test('cen — downloads and uploads, rest/errhandle callbacks', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    const result = await ExternalTool.save2Drive('cen', { name: 'Report', date: '1_15_2020', url: 'http://census.gov/report.pdf' }, 'parent-id');
    expect(mockGoogleApi).toHaveBeenCalled();
    expect(mockMongo).toHaveBeenCalled(); // updateDocDate called via rest()
  });

  test('cen — errhandle callback invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.errhandle) opts.errhandle(new Error('test'));
      return Promise.resolve('ok');
    });
    mockMkdirp.mockResolvedValue();
    const result = await ExternalTool.save2Drive('cen', { name: 'R', date: '1_1_2020', url: 'http://x.pdf' }, 'pid');
    expect(mockHandleError).toHaveBeenCalled();
  });

  test('cbo — text upload, rest callback invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    const result = await ExternalTool.save2Drive('cbo', { name: 'CC', date: '1_15_2020', url: 'http://cbo.gov' }, 'pid');
    expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({
      body: 'http://cbo.gov',
    }));
    expect(mockMongo).toHaveBeenCalled();
  });

  test('sem — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('sem', { name: 'SEMI', date: '1_1_2020', url: 'http://semi.org' }, 'pid');
    expect(mockGoogleApi).toHaveBeenCalled();
    expect(mockMongo).toHaveBeenCalled();
  });

  test('ism — pdf upload, rest invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('ism', { name: 'ISM', date: '3_27_2020', url: 'http://ism.org/report.pdf' }, 'pid');
    expect(mockGoogleApi).toHaveBeenCalled();
    expect(mockMongo).toHaveBeenCalled();
  });

  test('ism — non-pdf → text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('ism', { name: 'ISM', date: '3_27_2020', url: 'http://ism.org/report' }, 'pid');
    expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({
      body: 'http://ism.org/report',
    }));
    expect(mockMongo).toHaveBeenCalled();
  });

  test('bea — pdf ext, rest invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('bea', { name: 'BEA', date: '1_1_2020', url: 'http://bea.gov/report.pdf' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('bea — non-pdf, finds Full Release link, rest invoked', async () => {
    const a = mkNode('a', null, [mkText('Full Release PDF')], { href: '/full.pdf' });
    const h3 = mkNode('h3', null, [a]);
    const divInner = mkNode('div', null, [h3]);
    const row = mkNode('div', 'row', [mkNode('div', 'container', [mkNode('div', 'tab-content', [mkNode('div', 'menu1', [mkNode('div', 'row', [divInner])])])])]);
    const article = mkNode('article', null, [row]);
    const region = mkNode('div', 'region region-content', [article]);
    const test_ = mkNode('div', 'test', [region]);
    const row2 = mkNode('div', 'row', [test_]);
    const div1 = mkNode('div', null, [row2]);
    const div0 = mkNode('div', null, [div1]);
    const body = mkNode('body', null, [div0]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockImplementation((type, url, opts) => {
      if (opts && opts.filePath) return Promise.resolve('');
      return Promise.resolve('<html>');
    });
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('bea', { name: 'BEA', date: '1_1_2020', url: 'http://bea.gov/page' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('dol — pdf download, rest invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('dol', { name: 'DOL', date: '1_1_2020', url: 'http://dol.gov' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('rea — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('rea', { name: 'NAR', date: '1_1_2020', url: 'http://nar.realtor' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('sca — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('sca', { name: 'UMICH', date: '1_1_2020', url: 'http://sca.isr.umich.edu/' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('sea — pdf download, rest invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('sea', { name: 'SEAJ', date: '1_1_2020', url: 'http://seaj.or.jp/data.pdf' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('fed — pdf ext, rest invoked', async () => {
    mockApi.mockResolvedValue('');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('fed', { name: 'FED', date: '1_1_2020', url: 'http://fed.gov/speech.pdf' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('fed — non-pdf, match g17/current → construct pdf url, rest invoked', async () => {
    mockApi.mockImplementation((type, url, opts) => {
      if (opts && opts.filePath) return Promise.resolve('');
      return Promise.resolve('<html>');
    });
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [])])]);
    await ExternalTool.save2Drive('fed', { name: 'FED', date: '1_1_2020', url: 'https://www.federalreserve.gov/releases/g17/current/default.htm' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('fed — non-pdf, no match, shareDL with pdf, rest invoked', async () => {
    const aShare = mkNode('a', null, [
      mkNode('span', null, [mkText('icon')]),
      mkNode('span', null, [mkText('Download PDF')]),
    ], { href: '/speech/speech.pdf' });
    const shareDL = mkNode('div', 'shareDL', [aShare]);
    const headerGroup = mkNode('div', 'header-group', [shareDL]);
    const pageHeader = mkNode('div', 'page-header', [headerGroup]);
    const row = mkNode('div', 'row', [pageHeader]);
    const content = mkNode('div', 'content', [row]);
    const body = mkNode('body', null, [content]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockImplementation((type, url, opts) => {
      if (opts && opts.filePath) return Promise.resolve('');
      return Promise.resolve('<html>');
    });
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('fed', { name: 'FED', date: '1_1_2020', url: 'http://fed.gov/speech' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('fed — non-pdf, no match, no shareDL → text upload fallback, rest invoked', async () => {
    mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [mkNode('div', 'content', [mkNode('div', 'row', [mkNode('div', 'page-header', [mkNode('div', 'header-group', [])])])])])])]);
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('fed', { name: 'FED', date: '1_1_2020', url: 'http://fed.gov/speech' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('ndc — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('ndc', { name: 'NDC', date: '1_1_2020', url: 'http://ndc.gov.tw' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('sta — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('sta', { name: 'STA', date: '1_1_2020', url: 'http://stat.gov.tw' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('mof — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('mof', { name: 'MOF', date: '1_1_2020', url: 'http://mof.gov.tw' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('moe — text upload, rest invoked', async () => {
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('moe', { name: 'MOE', date: '1_1_2020', url: 'http://moea.gov.tw' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('bls — finds PDF version link, rest invoked', async () => {
    const pdfLink = mkNode('a', null, [mkText('PDF version')], { href: '/report.pdf' });
    const spanInner = mkNode('span', null, [pdfLink]);
    const div1 = mkNode('div', null, [spanInner]);
    const highlight = mkNode('div', 'highlight-box-green', [div1]);
    const bodytext = mkNode('div', 'bodytext', [highlight]);
    const mainContent = mkNode('div', 'main-content', [bodytext]);
    const wrapper = mkNode('div', 'wrapper-basic', [mainContent]);
    const body = mkNode('body', null, [wrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('bls', { name: 'BLS', date: '1_1_2020', url: 'http://bls.gov/page' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('oec — finds PDF link in nested structure, rest invoked', async () => {
    const pdfLink = mkNode('a', null, [mkText('Download pdf report')], { href: '/report.pdf' });
    const strong = mkNode('strong', null, [pdfLink]);
    const p = mkNode('p', null, [strong]);
    const webEdit = mkNode('div', 'webEditContent', [p]);
    const block = mkNode('div', 'block', [webEdit]);
    const docType = mkNode('div', 'doc-type-container', [block]);
    const col = mkNode('div', 'col-sm-9 leftnav-content-wrapper', [docType]);
    const row = mkNode('div', 'row', [col]);
    const container = mkNode('div', 'section container', [row]);
    const body = mkNode('body', null, [container]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('oec', { name: 'OEC', date: '1_1_2020', url: 'http://oecd.org/report' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('cbc — downloads attachments recursively', async () => {
    const a = mkNode('a', null, [mkText('File')], { href: '/file.pdf', title: 'report.pdf' });
    const li = mkNode('li', null, [a]);
    const ul = mkNode('ul', null, [li]);
    const download = mkNode('div', 'file_download', [ul]);
    const container = mkNode('div', 'container', [download]);
    const center = mkNode('div', 'center', [container]);
    const wrapper = mkNode('div', 'wrapper', [center]);
    const body = mkNode('body', null, [wrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMkdirp.mockResolvedValue();
    mockMongo.mockResolvedValue();
    await ExternalTool.save2Drive('cbc', { name: 'CBC', date: '1_1_2020', url: 'http://cbc.gov.tw/news' }, 'pid');
    expect(mockGoogleApi).toHaveBeenCalled();
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
    const albumArtist = mkNode('h2', 'album-artist', [artistSpan]);
    const albumTitle = mkNode('h1', 'album-title', [mkText(' Album Title ')]);
    const hgroup = mkNode('hgroup', null, [albumArtist, albumTitle]);
    const header = mkNode('header', null, [hgroup]);
    const contentDiv = mkNode('div', 'content', [header]);
    const releaseDateSpan = mkNode('span', null, [mkText('September 15, 2020')]);
    const releaseDateDiv = mkNode('div', 'release-date', [releaseDateSpan]);
    const genreLink = mkNode('a', null, [mkText('Rock')]);
    const genreInnerDiv = mkNode('div', null, [genreLink]);
    const genreDiv = mkNode('div', 'genre', [genreInnerDiv]);
    const basicInfo = mkNode('section', 'basic-info', [releaseDateDiv, genreDiv]);
    const sidebar = mkNode('div', 'sidebar', [basicInfo]);
    const container = mkNode('div', 'content-container', [contentDiv, sidebar]);
    const cmnWrap = mkNode('div', 'cmn_wrap', [container]);
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
    const artistName = mkNode('h1', 'artist-name', [mkText(' ArtistName ')]);
    const hgroup = mkNode('hgroup', null, [artistName]);
    const bioContainer = mkNode('div', 'artist-bio-container', [hgroup]);
    const header = mkNode('header', null, [bioContainer]);
    const contentDiv = mkNode('div', 'content', [header]);
    const genreLink = mkNode('a', null, [mkText('Rock')]);
    const genreInnerDiv = mkNode('div', null, [genreLink]);
    const genreDiv = mkNode('div', 'genre', [genreInnerDiv]);
    const basicInfo = mkNode('section', 'basic-info', [genreDiv]);
    const sidebar = mkNode('div', 'sidebar', [basicInfo]);
    const container = mkNode('div', 'content-container', [contentDiv, sidebar]);
    const cmnWrap = mkNode('div', 'cmn_wrap', [container]);
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
    const content0 = mkNode('div', 'content', [h1title, table0]);
    const actorH1 = mkNode('h1', null, [mkText('Actors')]);
    const actorName = mkNode('a', null, [mkText('Actor1')]);
    const actorH2 = mkNode('h2', null, [actorName]);
    const actorTd = mkNode('td', null, [mkNode('table', null, [mkNode('tr', null, [mkNode('td', null, [actorH2])])])]);
    const actorTr = mkNode('tr', null, [actorTd]);
    const actorTable = mkNode('table', null, [actorTr]);
    const content1 = mkNode('div', 'content', [actorH1, actorTable]);
    const fanart = mkNode('div', 'fanart', [
      mkNode('table', null, [
        mkNode('tr', null, [
          mkNode('td', null, []),
          mkNode('td', null, []),
          mkNode('td', null, [mkNode('div', 'content', [h1title])]),
        ]),
      ]),
      content0, content1,
    ]);
    const maincontent = mkNode('td', 'maincontent', [fanart]);
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
  // --- getSingleList economic types with DOM matching ---
  test('getSingleList cen — date match returns items', async () => {
    const date = new Date('2020-01-16');
    const expectedDate = 'January 15';
    const h3 = mkNode('h3', null, [mkText(`${expectedDate}th, 2020`)]);
    const headerDiv = mkNode('div', 'header', [h3]);
    const h2 = mkNode('h2', null, [mkNode('a', null, [mkText('Report Title')])]);
    const headerDiv2 = mkNode('div', 'header', [h2]);
    const pdfA = mkNode('a', null, [mkText('PDF')], { href: '/report.pdf' });
    const pdfDiv = mkNode('div', 'pdf', [pdfA]);
    const dropDiv = mkNode('div', 'dropdown', [mkNode('div', null, [pdfDiv])]);
    const buttonDiv = mkNode('div', 'button', [dropDiv]);
    const article = mkNode('article', null, [headerDiv, headerDiv2, buttonDiv]);
    const section2 = mkNode('section', null, [article]);
    const sectionC = mkNode('section', 'container', [section2]);
    const body = mkNode('body', null, [sectionC]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('cen', '2020-01-16');
    expect(result).toBeDefined();
  });

  test('getSingleList oec — date match returns items', async () => {
    const dateStr = '15 January 2020';
    const p = mkNode('p', null, [mkText(dateStr)]);
    const span = mkNode('span', null, [mkText('OECD Report')]);
    const a = mkNode('a', null, [], { href: '/report-page' });
    const li = mkNode('li', 'news-event-item linked', [p, span, a]);
    const ul = mkNode('ul', 'block-list', [li]);
    const newsCol1 = mkNode('div', 'news-col block', []);
    const newsCol2 = mkNode('div', 'news-col block', [ul]);
    const newsLists = mkNode('div', 'newsroom-lists', [newsCol1, newsCol2]);
    const col = mkNode('div', 'col-sm-9 leftnav-content-wrapper', [newsLists]);
    const row = mkNode('div', 'row', [col]);
    const container = mkNode('div', 'section container', [row]);
    const body = mkNode('body', null, [container]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('oec', '2020-01-16');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OECD Report');
  });

  // --- getSingleList date validation errors ---
  test('getSingleList dol — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('dol', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList rea — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('rea', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList fed — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('fed', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList sea — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('sea', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList cen — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('cen', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList bea — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('bea', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList oec — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('oec', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList ism — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('ism', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList cbo — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('cbo', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList sem — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('sem', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList sca — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('sca', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList tri — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('tri', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList ndc — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('ndc', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList sta — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('sta', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList mof — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('mof', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList moe — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('moe', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList cbc — date invalid → error', async () => {
    mockApi.mockResolvedValue('');
    await expect(ExternalTool.getSingleList('cbc', 'not-a-date'))
      .rejects.toThrow('date invalid');
  });

  test('getSingleList sta — returns JSON parsed items', async () => {
    mockApi.mockResolvedValue(JSON.stringify([
      { Subject: 'TestReport', ReleaseDate: '01/14/2020 12:00:00', url: 'http://stat.gov/report.pdf' },
    ]));
    const result = await ExternalTool.getSingleList('sta', '2020-01-15');
    expect(result).toBeDefined();
  });

  test('getSingleList mof — empty body returns empty list', async () => {
    mockApi.mockResolvedValue('');
    mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [])])]);
    const result = await ExternalTool.getSingleList('mof', '2020-01-15');
    expect(result).toHaveLength(0);
  });

  test('getSingleList moe — empty body', async () => {
    mockApi.mockResolvedValue('');
    mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [])])]);
    const result = await ExternalTool.getSingleList('moe', '2020-01-15');
    expect(result).toBeDefined();
  });

  test('getSingleList cbc — empty body returns empty', async () => {
    mockApi.mockResolvedValue('');
    mockParseDOM.mockReturnValue([mkNode('html', null, [mkNode('body', null, [])])]);
    const result = await ExternalTool.getSingleList('cbc', '2020-01-15');
    expect(result).toBeDefined();
  });

  // --- getSingleList fed — full three-API chain ---
  test('getSingleList fed — with matching speeches and releases', async () => {
    // First Api call returns XML (RSS), second+third return HTML
    const dateStr = '20200114'; // Jan 14, 2020 (date-1 from Jan 15)
    const rssItem = mkNode('item', null, [
      mkNode('title', null, [mkText('Fed Speech')]),
      mkText(`/newsevents/speech/${dateStr}a.htm`),
    ]);
    const channel = mkNode('channel', null, [rssItem]);
    const rss = mkNode('rss', null, [channel]);
    rss.type = 'tag';
    // g17 page
    const datesDiv = mkNode('div', 'dates', [mkText('January 14, 2020')]);
    const pdfA = mkNode('a', null, [mkText('pdf')], { href: '/ip_full.pdf' });
    const span = mkNode('span', null, [pdfA]);
    const h3 = mkNode('h3', null, [span]);
    const g17Content = mkNode('div', 'content', [datesDiv, h3]);
    const g17Body = mkNode('body', null, [g17Content]);
    // g19 page
    const g19DatesDiv = mkNode('div', 'dates', [mkText('skip'), mkText('January 14, 2020')]);
    const g19Content = mkNode('div', 'content', [g19DatesDiv]);
    const g19Body = mkNode('body', null, [g19Content]);
    let apiCallCount = 0;
    mockApi.mockImplementation(() => {
      apiCallCount++;
      return Promise.resolve('');
    });
    let parseDOMCallCount = 0;
    mockParseDOM.mockImplementation(() => {
      parseDOMCallCount++;
      if (parseDOMCallCount === 1) return [rss]; // first call is RSS
      if (parseDOMCallCount === 2) return [mkNode('html', null, [g17Body])]; // g17
      return [mkNode('html', null, [g19Body])]; // g19
    });
    const result = await ExternalTool.getSingleList('fed', '2020-01-15');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // --- getSingleList sea — date match ---
  test('getSingleList sea — with matching table rows', async () => {
    const dateStr = '2020-01-14'; // date-1 from Jan 15
    const td1 = mkNode('td', null, [mkText(dateStr)]);
    const td2 = mkNode('td', null, [mkNode('a', null, [mkText('Report')], { href: '/report.pdf' })]);
    const tr = mkNode('tr', null, [td1, td2]);
    const tbody = mkNode('tbody', null, [tr]);
    const table = mkNode('table', null, [tbody]);
    const tableResp = mkNode('div', 'table-responsive', [table]);
    const innerSection = mkNode('section', null, [tableResp]);
    const section2 = mkNode('section', null, [innerSection]);
    const section1_skip = mkNode('section', null, []);
    const main = mkNode('main', 'col-md-9 order-md-last', [section1_skip, section2]);
    const rowCol = mkNode('div', 'row column-content', [main]);
    const pageContent = mkNode('div', 'pagecontent', [rowCol]);
    const body = mkNode('body', null, [pageContent]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('sea', '2020-01-15');
    expect(result).toBeDefined();
  });

  // --- getSingleList dol — with DOM matching typeDiv path ---
  test('getSingleList dol — typeDiv path with matching title', async () => {
    const docDate = 'January 14, 2020'; // date-1
    const p = mkNode('p', null, [mkText(`Published: ${docDate}`)]);
    const span = mkNode('span', null, [mkText('Unemployment Insurance Weekly Claims Report')]);
    const h3 = mkNode('h3', null, [span]);
    const innerDiv = mkNode('div', null, [h3, p]);
    const aDiv = mkNode('div', null, [innerDiv]);
    const a = mkNode('a', null, [aDiv], { href: ' /report '});
    const divX = mkNode('div', null, [a]);
    const viewsDiv = mkNode('div', null, [divX]);
    const viewsContainer = mkNode('div', 'views-element-container', [viewsDiv]);
    const homepageBlock = mkNode('div', 'homepage-block homepage-news-block', [viewsContainer]);
    const layoutRegion = mkNode('div', 'layout__region layout__region--second', [homepageBlock]);
    const div4 = mkNode('div', null, [layoutRegion]);
    const div3 = mkNode('div', null, [div4]);
    const article = mkNode('article', null, [div3]);
    const blockContent = mkNode('div', 'block-opa-theme-content', [article]);
    const layoutContent = mkNode('div', 'layout-content', [blockContent]);
    const mainEl = mkNode('main', null, [layoutContent]);
    const divInner = mkNode('div', null, [mainEl]);
    const dialogDiv = mkNode('div', 'dialog-off-canvas-main-canvas', [divInner]);
    const body = mkNode('body', null, [dialogDiv]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('dol', '2020-01-15');
    expect(result).toBeDefined();
  });

  // --- getSingleList rea — empty list for non-matching date ---
  test('getSingleList rea — returns empty for no match', async () => {
    const layout = mkNode('div', 'layout-constrain', [mkNode('div', 'region-content', [])]);
    const push = mkNode('div', 'content-push push', [layout]);
    const main = mkNode('main', null, [push]);
    const wrapper = mkNode('div', 'page-wrapper', [main]);
    const body = mkNode('body', null, [wrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('rea', '2020-01-15');
    expect(result).toHaveLength(0);
  });

  // --- getSingleId dm5 non-cached ---
  test('getSingleId dm5 — non-cached, fetches chapter list', async () => {
    mockRedis.mockResolvedValue(null);
    const chapterA = mkNode('a', null, [mkText('Chapter 1')], { href: '/m12345/' });
    const chapterLi = mkNode('li', null, [chapterA]);
    const chapterUl = mkNode('ul', null, [chapterLi]);
    const chapterLoad = mkNode('div', 'chapterlistload', [chapterUl]);
    const tempc = mkNode('div', 'tempc', [chapterLoad]);
    const leftBar = mkNode('div', 'left-bar', [tempc]);
    const container = mkNode('div', 'container', [leftBar]);
    const viewComment = mkNode('div', 'view-comment', [container]);
    // banner_detail to check completion
    const statusSpan = mkNode('span', null, [mkText('連載中')]);
    const blockSpan = mkNode('span', 'block', [statusSpan]);
    const tipP = mkNode('p', 'tip', [blockSpan]);
    const info = mkNode('div', 'info', [tipP]);
    const form = mkNode('div', 'banner_detail_form', [info]);
    const bannerSection = mkNode('section', 'banner_detail', [form]);
    const bannerDiv = mkNode('div', null, [bannerSection]);
    const body = mkNode('body', null, [bannerDiv, viewComment]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockMongo.mockResolvedValue([]);
    mockIsValidString.mockReturnValue('magnet:?hash');
    const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manhua-123/', 1);
    expect(result[0].title).toBe('Chapter 1');
  });
  // --- save2Drive tri --- 
  test('save2Drive tri — two-page fetch with PDF link', async () => {
    // tri needs 2 API calls (page1 → page2 link → download)
    // page1: html > body > div.main > div.content > div.content01 > div.content02L > div.content01LText > div > table.text6 > tr[1] > td[1] > a
    const link1A = mkNode('a', null, [mkText('Link')], { href: '/page2' });
    const link1Td_skip = mkNode('td', null, []);
    const link1Td = mkNode('td', null, [link1A]);
    const link1Tr_skip = mkNode('tr', null, []);
    const link1Tr = mkNode('tr', null, [link1Td_skip, link1Td]);
    const table1 = mkNode('table', 'text6', [link1Tr_skip, link1Tr]);
    const div1 = mkNode('div', null, [table1]);
    const textDiv = mkNode('div', 'content01LText', [div1]);
    const content02L = mkNode('div', 'content02L', [textDiv]);
    const content01 = mkNode('div', 'content01', [content02L]);
    const contentDiv = mkNode('div', 'content', [content01]);
    const mainDiv = mkNode('div', 'main', [contentDiv]);
    const body1 = mkNode('body', null, [mainDiv]);
    // page2: same structure but tr[4] > td[0] > a
    const link2A = mkNode('a', null, [mkText('Download')], { href: '/report.pdf' });
    const link2Td = mkNode('td', null, [link2A]);
    const skip2a = mkNode('tr', null, []);
    const skip2b = mkNode('tr', null, []);
    const skip2c = mkNode('tr', null, []);
    const skip2d = mkNode('tr', null, []);
    const link2Tr = mkNode('tr', null, [link2Td]);
    const table2 = mkNode('table', 'text6', [skip2a, skip2b, skip2c, skip2d, link2Tr]);
    const div2 = mkNode('div', null, [table2]);
    const textDiv2 = mkNode('div', 'content02LText', [div2]);
    const content02L2 = mkNode('div', 'content02L', [textDiv2]);
    const content012 = mkNode('div', 'content01', [content02L2]);
    const contentDiv2 = mkNode('div', 'content', [content012]);
    const mainDiv2 = mkNode('div', 'main', [contentDiv2]);
    const body2 = mkNode('body', null, [mainDiv2]);
    let parseCount = 0;
    mockParseDOM.mockImplementation(() => {
      parseCount++;
      return parseCount === 1 ? [mkNode('html', null, [body1])] : [mkNode('html', null, [body2])];
    });
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('tri', { name: 'TRI', date: '1_1_2020', url: 'http://tri.org.tw/page' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  // --- save2Drive oec — nested strong > strong > a path ---
  test('save2Drive oec — nested strong > strong > a', async () => {
    const pdfLink = mkNode('a', null, [mkText('Download pdf')], { href: '/deep.pdf' });
    const innerStrong = mkNode('strong', null, [pdfLink]);
    const outerStrong = mkNode('strong', null, [innerStrong]); // no direct <a>, needs strong>strong>a
    const p = mkNode('p', null, [outerStrong]);
    const webEdit = mkNode('div', 'webEditContent', [p]);
    const block = mkNode('div', 'block', [webEdit]);
    const docType = mkNode('div', 'doc-type-container', [block]);
    const col = mkNode('div', 'col-sm-9 leftnav-content-wrapper', [docType]);
    const row = mkNode('div', 'row', [col]);
    const container = mkNode('div', 'section container', [row]);
    const body = mkNode('body', null, [container]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockGoogleApi.mockImplementation((op, opts) => {
      if (opts.rest) opts.rest(); if (opts.errhandle) opts.errhandle(new Error("cb"));
      return Promise.resolve('ok');
    });
    mockMongo.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    await ExternalTool.save2Drive('oec', { name: 'OEC2', date: '1_1_2020', url: 'http://oecd.org/nested' }, 'pid');
    expect(mockMongo).toHaveBeenCalled();
  });

  // --- getSingleList mof with DOM match ---
  test('getSingleList mof — with matching date returns items', async () => {
    // mof does NOT subtract 1 day
    const date = new Date('2020-01-15');
    const docDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    // tr: td[0]=filler, td[1]=span>a (link), td[2]=span (date)
    const linkA = mkNode('a', null, [mkText('海關進出口貿易統計速報')], { href: '/report.pdf' });
    const spanA = mkNode('span', null, [linkA]);
    const td0 = mkNode('td', null, []);
    const td1 = mkNode('td', null, [spanA]);
    const dateSpan = mkNode('span', null, [mkText(docDate)]);
    const td2 = mkNode('td', null, [dateSpan]);
    const tr = mkNode('tr', null, [td0, td1, td2]);
    const tbody = mkNode('tbody', null, [tr]);
    const table = mkNode('table', null, [tbody]);
    const application = mkNode('div', 'application', [table]);
    const pagingContent = mkNode('div', 'paging-content', [application]);
    const leftContentText = mkNode('div', 'left-content-text', [pagingContent]);
    const leftContent = mkNode('div', 'left-content', [leftContentText]);
    const row = mkNode('div', 'row', [leftContent]);
    const container = mkNode('div', 'container', [row]);
    const functionCabinet = mkNode('div', 'function-cabinet', [container]);
    const body = mkNode('body', null, [functionCabinet]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('mof', '2020-01-15');
    expect(result.length).toBe(1);
    expect(result[0].name).toMatch(/海關進出口貿易/);
  });

  // --- sta/moe use 34-deep findTag DOM structure ---
  // Helper to build the stat.gov.tw wrapper structure
  function mkStatGovDOM(innerContent) {
    // 34-deep: html > body > form > div.group sys-root > div > div > div > div.group base-wrapper > div > div > div > div.base-content > div > div > div > div.group base-page-area > div > div > div > div.group base-section > div > div > div > div.group page-content > div > div > div > div.area-table rwd-straight > div > div > div > table > tbody
    const tbody = mkNode('tbody', null, innerContent);
    const table = mkNode('table', null, [tbody]);
    const d1 = mkNode('div', null, [table]);
    const d2 = mkNode('div', null, [d1]);
    const d3 = mkNode('div', null, [d2]);
    const areaTable = mkNode('div', 'area-table rwd-straight', [d3]);
    const d4 = mkNode('div', null, [areaTable]);
    const d5 = mkNode('div', null, [d4]);
    const d6 = mkNode('div', null, [d5]);
    const pageContent = mkNode('div', 'group page-content', [d6]);
    const d7 = mkNode('div', null, [pageContent]);
    const d8 = mkNode('div', null, [d7]);
    const d9 = mkNode('div', null, [d8]);
    const baseSection = mkNode('div', 'group base-section', [d9]);
    const d10 = mkNode('div', null, [baseSection]);
    const d11 = mkNode('div', null, [d10]);
    const d12 = mkNode('div', null, [d11]);
    const basePageArea = mkNode('div', 'group base-page-area', [d12]);
    const d13 = mkNode('div', null, [basePageArea]);
    const d14 = mkNode('div', null, [d13]);
    const d15 = mkNode('div', null, [d14]);
    const baseContent = mkNode('div', 'base-content', [d15]);
    const d16 = mkNode('div', null, [baseContent]);
    const d17 = mkNode('div', null, [d16]);
    const d18 = mkNode('div', null, [d17]);
    const baseWrapper = mkNode('div', 'group base-wrapper', [d18]);
    const d19 = mkNode('div', null, [baseWrapper]);
    const d20 = mkNode('div', null, [d19]);
    const d21 = mkNode('div', null, [d20]);
    const sysRoot = mkNode('div', 'group sys-root', [d21]);
    const form = mkNode('form', null, [sysRoot]);
    form.type = 'tag';
    const body = mkNode('body', null, [form]);
    return mkNode('html', null, [body]);
  }

  // getSingleList sta — full DOM with matching items
  test('getSingleList sta — DOM match with 消費者物價指數', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const rocDate = `${date.getFullYear() - 1911}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const linkA = mkNode('a', null, [mkText('消費者物價指數報告')], { href: '/sta/report1' });
    const spanA = mkNode('span', null, [linkA]);
    const td0 = mkNode('td', null, [spanA]);
    const dateSpan = mkNode('span', null, [mkText(rocDate)]);
    const td1 = mkNode('td', null, [dateSpan]);
    const tr = mkNode('tr', null, [td0, td1]);
    // Add rows for other match types
    const linkA2 = mkNode('a', null, [mkText('經濟成長率概估')], { href: '/sta/report2' });
    const spanA2 = mkNode('span', null, [linkA2]);
    const td0b = mkNode('td', null, [spanA2]);
    const dateSpan2 = mkNode('span', null, [mkText(rocDate)]);
    const td1b = mkNode('td', null, [dateSpan2]);
    const tr2 = mkNode('tr', null, [td0b, td1b]);
    const linkA3 = mkNode('a', null, [mkText('工業及服務業受僱員工人數')], { href: '/sta/report3' });
    const spanA3 = mkNode('span', null, [linkA3]);
    const td0c = mkNode('td', null, [spanA3]);
    const dateSpan3 = mkNode('span', null, [mkText(rocDate)]);
    const td1c = mkNode('td', null, [dateSpan3]);
    const tr3 = mkNode('tr', null, [td0c, td1c]);
    const linkA4 = mkNode('a', null, [mkText('失業人數統計')], { href: '/sta/report4' });
    const spanA4 = mkNode('span', null, [linkA4]);
    const td0d = mkNode('td', null, [spanA4]);
    const dateSpan4 = mkNode('span', null, [mkText(rocDate)]);
    const td1d = mkNode('td', null, [dateSpan4]);
    const tr4 = mkNode('tr', null, [td0d, td1d]);
    mockParseDOM.mockReturnValue([mkStatGovDOM([tr, tr2, tr3, tr4])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('sta', '2020-01-15');
    expect(result.length).toBe(4);
  });

  // getSingleList moe — full DOM with two-API chain
  test('getSingleList moe — DOM match with 工業生產 and 外銷訂單統計', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const rocDate = `${date.getFullYear() - 1911}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    // first API: moe page 1 — 工業生產
    const linkA1 = mkNode('a', null, [mkText('工業生產報告')], { href: '/moe/report1' });
    const spanA1 = mkNode('span', null, [linkA1]);
    const td01 = mkNode('td', null, [spanA1]);
    const dateSpan1 = mkNode('span', null, [mkText(rocDate)]);
    const td11 = mkNode('td', null, [dateSpan1]);
    const tr1 = mkNode('tr', null, [td01, td11]);
    const dom1 = mkStatGovDOM([tr1]);
    // second API: moe page 2 — 外銷訂單統計
    const linkA2 = mkNode('a', null, [mkText('外銷訂單統計報告')], { href: '/moe/report2' });
    const spanA2 = mkNode('span', null, [linkA2]);
    const td02 = mkNode('td', null, [spanA2]);
    const dateSpan2 = mkNode('span', null, [mkText(rocDate)]);
    const td12 = mkNode('td', null, [dateSpan2]);
    const tr2 = mkNode('tr', null, [td02, td12]);
    const dom2 = mkStatGovDOM([tr2]);
    let parseCount = 0;
    mockParseDOM.mockImplementation(() => {
      parseCount++;
      return parseCount === 1 ? [dom1] : [dom2];
    });
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('moe', '2020-01-15');
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('工業生產');
    expect(result[1].name).toBe('外銷訂單統計');
  });

  // getSingleList cbc — with matching date item
  test('getSingleList cbc — DOM match returns items', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const timeNode = mkNode('time', null, [mkText(docDate)]);
    const a = mkNode('a', null, [mkText('Report')], { href: '/news/1', title: 'CBC Report' });
    const li = mkNode('li', null, [timeNode, a]);
    const ul = mkNode('ul', null, [li]);
    const listDiv = mkNode('div', 'list', [ul]);
    const lp = mkNode('section', 'lp', [listDiv]);
    const container = mkNode('div', 'container', [lp]);
    const center = mkNode('div', 'center', [container]);
    const wrapper = mkNode('div', 'wrapper', [center]);
    const body = mkNode('body', null, [wrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('cbc', '2020-01-15');
    expect(result.length).toBe(1);
  });

  // getSingleList bea — DOM match with date matching
  test('getSingleList bea — DOM match returns items', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const linkA = mkNode('a', null, [mkText('GDP Report')], { href: '/report.pdf' });
    const td0 = mkNode('td', null, [linkA]);
    const td1 = mkNode('td', null, [mkText(docDate)]);
    const tr = mkNode('tr', null, [td0, td1]);
    const tbody = mkNode('tbody', null, [tr]);
    const table = mkNode('table', null, [tbody]);
    const viewContent = mkNode('div', 'view-content', [mkNode('div', null, [table])]);
    const d1 = mkNode('div', null, [viewContent]);
    const d2 = mkNode('div', null, [d1]);
    const regionContent = mkNode('div', 'region region-content', [d2]);
    const section = mkNode('section', null, [regionContent]);
    const row = mkNode('div', 'row', [section]);
    const d3 = mkNode('div', null, [row]);
    const d4 = mkNode('div', null, [d3]);
    const body = mkNode('body', null, [d4]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('bea', '2020-01-15');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('GDP Report');
  });

  // getSingleList sea — DOM match with date in td[2]
  test('getSingleList sea — DOM match returns items with proper URL', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const td0 = mkNode('td', null, [mkText('SEAJ Report'), mkText('Details')]);
    const td1 = mkNode('td', null, [mkNode('a', null, [mkText('File')], { href: '/report.pdf' })]);
    const td2 = mkNode('td', null, [mkText(docDate)]);
    const tr = mkNode('tr', null, [td0, td1, td2]);
    const tbody = mkNode('tbody', null, [tr]);
    const table = mkNode('table', null, [tbody]);
    const tableResp = mkNode('div', 'table-responsive', [table]);
    const innerSection2 = mkNode('section', null, [tableResp]);
    const section2 = mkNode('section', null, [innerSection2]);
    const section1_skip = mkNode('section', null, []);
    const main = mkNode('main', 'col-md-9 order-md-last', [section1_skip, section2]);
    const rowCol = mkNode('div', 'row column-content', [main]);
    const pageContent = mkNode('div', 'pagecontent', [rowCol]);
    const body = mkNode('body', null, [pageContent]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('sea', '2020-01-15');
    expect(result.length).toBe(1);
  });

  // getSingleList dol — non-typeDiv path (line 966, 979-983)
  test('getSingleList dol — non-typeDiv path with matching title', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const span = mkNode('span', null, [mkText('Unemployment Insurance Weekly Claims Report')]);
    const h3 = mkNode('h3', null, [span]);
    const a = mkNode('a', null, [h3], { href: ' /report ' });
    const p = mkNode('p', null, [mkText(`Published: ${docDate}`)]);
    const leftTeaser = mkNode('div', 'left-teaser-text', [a, p]);
    const rowFeed = mkNode('div', 'row dol-feed-block', [leftTeaser]);
    const imageLeft = mkNode('div', 'image-left-teaser', [rowFeed]);
    const divItem = mkNode('div', null, [imageLeft]);
    const viewsDiv = mkNode('div', null, [divItem]);
    const viewsContainer = mkNode('div', 'views-element-container', [viewsDiv]);
    const layoutContentInner = mkNode('div', 'layout-content inner-content-page', [mkNode('div', 'block-opa-theme-content', [viewsContainer])]);
    const main = mkNode('main', null, [layoutContentInner]);
    const divInner = mkNode('div', null, [main]);
    const dialogDiv = mkNode('div', 'dialog-off-canvas-main-canvas', [divInner]);
    const body = mkNode('body', null, [dialogDiv]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('dol', '2020-01-15');
    expect(result.length).toBe(1);
  });

  // getSingleList rea — full DOM match with date matching
  test('getSingleList rea — full DOM match returns items', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const dateSpan = mkNode('span', null, [mkText(docDate)]);
    const nodeDate = mkNode('div', 'node__date', [dateSpan]);
    const footer = mkNode('div', 'card-view__footer', [nodeDate]);
    const titleA = mkNode('a', null, [mkText('NAR Report')], { href: '/news/1' });
    const titleH3 = mkNode('h3', 'card-view__title', [titleA]);
    const header = mkNode('div', 'card-view__header', [titleH3]);
    const content = mkNode('div', 'card-view__content', [header, footer]);
    const article = mkNode('article', null, [content]);
    const dItem = mkNode('div', null, [article]);
    const fieldSearchQueryList = mkNode('div', 'field_search_query_content_list', [dItem]);
    const fieldItemEven = mkNode('div', 'field-item even', [fieldSearchQueryList]);
    const fieldItems = mkNode('div', 'field-items', [fieldItemEven]);
    const fieldSearchQuery = mkNode('div', 'field field--search-query', [fieldItems]);
    const innerDiv = mkNode('div', null, [fieldSearchQuery]);
    const flexColumn = mkNode('div', 'flex-column', [innerDiv]);
    const layoutFlex = mkNode('div', 'layout--flex-grid layout--fg-9-3', [flexColumn]);
    const fieldItemEven2Div = mkNode('div', null, [layoutFlex]);
    const fieldItemEven2 = mkNode('div', 'field-item even', [fieldItemEven2Div]);
    const fieldItems2 = mkNode('div', 'field-items', [fieldItemEven2]);
    const fieldBelowParagraph = mkNode('div', 'field field--below-paragraph', [fieldItems2]);
    const paneContent = mkNode('div', 'pane__content', [fieldBelowParagraph]);
    const paneNode = mkNode('div', 'pane-node-field-below-paragraph pane pane--nodefield-below-paragraph', [paneContent]);
    const secondaryContent = mkNode('div', 'secondary-content', [paneNode]);
    const layoutContentAside = mkNode('div', 'layout-content-aside has-aside', [secondaryContent]);
    const regionContent = mkNode('div', 'region-content', [layoutContentAside]);
    const layout = mkNode('div', 'layout-constrain', [regionContent]);
    const push = mkNode('div', 'content-push push', [layout]);
    const mainEl = mkNode('main', null, [push]);
    const pageWrapper = mkNode('div', 'page-wrapper', [mainEl]);
    const body = mkNode('body', null, [pageWrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('rea', '2020-01-15');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('NAR Report');
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
    const mwContent = mkNode('div', 'mw-content-text', [infoDiv]);
    const wikiArticle = mkNode('div', 'WikiaArticle', [mwContent]);
    const mainContent = mkNode('div', 'WikiaMainContentContainer', [wikiArticle]);
    const article = mkNode('article', 'WikiaMainContent', [mainContent]);
    const pageWrapper = mkNode('div', 'WikiaPageContentWrapper', [article]);
    const wikiPage = mkNode('section', 'WikiaPage', [pageWrapper]);
    const siteWrapper = mkNode('div', 'WikiaSiteWrapper', [wikiPage]);
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
    const mwContent = mkNode('div', 'mw-content-text', [infoDiv]);
    const wikiArticle = mkNode('div', 'WikiaArticle', [mwContent]);
    const mainContent = mkNode('div', 'WikiaMainContentContainer', [wikiArticle]);
    const article = mkNode('article', 'WikiaMainContent', [mainContent]);
    const pageWrapper = mkNode('div', 'WikiaPageContentWrapper', [article]);
    const wikiPage = mkNode('section', 'WikiaPage', [pageWrapper]);
    const siteWrapper = mkNode('div', 'WikiaSiteWrapper', [wikiPage]);
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
    const mwContent = mkNode('div', 'mw-content-text', [infoDiv]);
    const wikiArticle = mkNode('div', 'WikiaArticle', [mwContent]);
    const mainContent = mkNode('div', 'WikiaMainContentContainer', [wikiArticle]);
    const article = mkNode('article', 'WikiaMainContent', [mainContent]);
    const pageWrapper = mkNode('div', 'WikiaPageContentWrapper', [article]);
    const wikiPage = mkNode('section', 'WikiaPage', [pageWrapper]);
    const siteWrapper = mkNode('div', 'WikiaSiteWrapper', [wikiPage]);
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
    const block = mkNode('div', 'block responsive_apppage_details_left game_details underlined_links', [div1]);
    const rightcol = mkNode('div', 'rightcol game_meta_data', [block]);
    const pageContent = mkNode('div', 'page_content', [rightcol]);
    const pageContentCtn = mkNode('div', 'page_content_ctn', [pageContent]);
    const gameBg = mkNode('div', 'game_page_background game', [pageContentCtn]);
    const respTemp = mkNode('div', 'responsive_page_template_content', [gameBg]);
    const respContent = mkNode('div', 'responsive_page_content', [respTemp]);
    const respFrame = mkNode('div', 'responsive_page_frame with_header', [respContent]);
    const body = mkNode('body', null, [respFrame]);
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
    const nameDiv = mkNode('div', 'content', [nameH1]);
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
    const contentDiv1 = mkNode('div', 'content', [mainTable]);
    const contentDiv2 = mkNode('div', 'content', []);
    const fanart = mkNode('div', 'fanart', [nameTable, contentDiv1, contentDiv2]);
    const maincontent = mkNode('td', 'maincontent', [fanart]);
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
    const chapterLoad = mkNode('div', 'chapterlistload', [chapterUl]);
    const tempc = mkNode('div', 'tempc', [chapterLoad]);
    const leftBar = mkNode('div', 'left-bar', [tempc]);
    const container = mkNode('div', 'container', [leftBar]);
    const viewComment = mkNode('div', 'view-comment', [container]);
    const statusSpan = mkNode('span', null, [mkText('已完结')]);
    const blockSpan = mkNode('span', 'block', [statusSpan]);
    const tipP = mkNode('p', 'tip', [blockSpan]);
    const info = mkNode('div', 'info', [tipP]);
    const form = mkNode('div', 'banner_detail_form', [info]);
    const bannerSection = mkNode('section', 'banner_detail', [form]);
    const bannerDiv = mkNode('div', null, [bannerSection]);
    const body = mkNode('body', null, [bannerDiv, viewComment]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('<html>');
    mockMongo.mockResolvedValue([]);
    mockIsValidString.mockReturnValue('magnet:?hash');
    const result = await ExternalTool.getSingleId('dm5', 'http://dm5.com/manhua-999/', 1);
    expect(result[1]).toBe(true); // is_end (已完结)
    expect(result[2]).toBe(2); // total count (mainLi reversed + nestedLi)
  });
  // getSingleList dol — typeDiv path with matching title (L969-978)
  test('getSingleList dol — typeDiv path with matching title', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const span = mkNode('span', null, [mkText('Unemployment Insurance Weekly Claims Report')]);
    const h3 = mkNode('h3', null, [span]);
    const p = mkNode('p', null, [mkText(docDate)]);
    const innerDiv = mkNode('div', null, [h3, p]);
    const aDiv = mkNode('div', null, [innerDiv]);
    const a = mkNode('a', null, [aDiv], { href: ' /report-typeDiv ' });
    const outerDiv = mkNode('div', null, [a]);
    const divItem = mkNode('div', null, [outerDiv]);
    const viewsDiv = mkNode('div', null, [divItem]);
    const viewsContainer = mkNode('div', 'views-element-container', [viewsDiv]);
    const hpBlock = mkNode('div', 'homepage-block homepage-news-block', [viewsContainer]);
    const layoutRegion = mkNode('div', 'layout__region layout__region--second', [hpBlock]);
    const innerDivChain = mkNode('div', null, [layoutRegion]);
    const innerDivChain2 = mkNode('div', null, [innerDivChain]);
    const article = mkNode('article', null, [innerDivChain2]);
    const blockContent = mkNode('div', 'block-opa-theme-content', [article]);
    const layoutContent = mkNode('div', 'layout-content', [blockContent]);
    const main = mkNode('main', null, [layoutContent]);
    const divInner = mkNode('div', null, [main]);
    const dialogDiv = mkNode('div', 'dialog-off-canvas-main-canvas', [divInner]);
    const body = mkNode('body', null, [dialogDiv]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('dol', '2020-01-15');
    expect(result.length).toBe(1);
    expect(result[0].url).toContain('/report-typeDiv');
  });

  // getSingleList rea — content-layout-wrapper-wide path (L1005-1006)
  test('getSingleList rea — content-layout-wrapper-wide path', async () => {
    const date = new Date('2020-01-15');
    date.setDate(date.getDate() - 1);
    const docDate = `${['January','February','March','April','May','June','July','August','September','October','November','December'][date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const dateSpan = mkNode('span', null, [mkText(docDate)]);
    const nodeDate = mkNode('div', 'node__date', [dateSpan]);
    const cardFooter = mkNode('div', 'card-view__footer', [nodeDate]);
    const linkA = mkNode('a', null, [mkText('Report Title')], { href: '/report-wide' });
    const h3Title = mkNode('h3', 'card-view__title', [linkA]);
    const cardHeader = mkNode('div', 'card-view__header', [h3Title]);
    const cardContent = mkNode('div', 'card-view__content', [cardHeader, cardFooter]);
    const articleNode = mkNode('article', null, [cardContent]);
    const d = mkNode('div', null, [articleNode]);
    const searchContent = mkNode('div', 'field_search_query_content_list', [d]);
    const fieldItemEven2 = mkNode('div', 'field-item even', [searchContent]);
    const fieldItems2 = mkNode('div', 'field-items', [fieldItemEven2]);
    const searchQuery = mkNode('div', 'field field--search-query', [fieldItems2]);
    const innerDiv = mkNode('div', null, [searchQuery]);
    const flexCol = mkNode('div', 'flex-column', [innerDiv]);
    const flexGrid = mkNode('div', 'layout--flex-grid layout--fg-9-3', [flexCol]);
    const fieldItemDiv = mkNode('div', null, [flexGrid]);
    const fieldItemEven = mkNode('div', 'field-item even', [fieldItemDiv]);
    const fieldItems = mkNode('div', 'field-items', [fieldItemEven]);
    const fieldBelow = mkNode('div', 'field field--below-paragraph', [fieldItems]);
    const paneContent = mkNode('div', 'pane__content', [fieldBelow]);
    const pane = mkNode('div', 'pane-node-field-below-paragraph pane pane--nodefield-below-paragraph', [paneContent]);
    const secondaryContent = mkNode('div', 'secondary-content', [pane]);
    const layoutContentAside = mkNode('div', 'layout-content-aside has-aside', [secondaryContent]);
    const regionContent = mkNode('div', 'region-content', [layoutContentAside]);
    // Wrap with content-layout-wrapper-wide path
    const contentLayoutWrapper = mkNode('div', 'content-layout-wrapper', [regionContent]);
    const contentLayoutWrapperWide = mkNode('div', 'content-layout-wrapper-wide', [contentLayoutWrapper]);
    const layoutConstrain = mkNode('div', 'layout-constrain', [contentLayoutWrapperWide]);
    const contentPush = mkNode('div', 'content-push push', [layoutConstrain]);
    const main = mkNode('main', null, [contentPush]);
    const pageWrapper = mkNode('div', 'page-wrapper', [main]);
    const body = mkNode('body', null, [pageWrapper]);
    mockParseDOM.mockReturnValue([mkNode('html', null, [body])]);
    mockApi.mockResolvedValue('');
    const result = await ExternalTool.getSingleList('rea', '2020-01-15');
    expect(result.length).toBe(1);
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

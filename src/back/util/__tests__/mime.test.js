/**
 * mime.test.js — Comprehensive tests for src/back/util/mime.js
 *
 * Pure utility module — no mocking needed. Tests real constants integration.
 * 18 exported functions, 100% branch/line coverage target.
 *
 * Run: docker exec -w /app reactnode-server npx jest src/back/util/__tests__/mime.test.js
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const mockLog = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};

jest.unstable_mockModule('../logger.js', () => ({
    default: () => mockLog,
}));

import {
    MEDIA_LIST_CH,
    GENRE_LIST_CH,
    GAME_LIST_CH,
    MUSIC_LIST,
    ADULT_LIST,
    MEDIA_TAG,
    IMAGE_EXT,
    ZIP_EXT,
    VIDEO_EXT,
    MUSIC_EXT,
    DOC_EXT,
    MIME_EXT,
    TORRENT_EXT,
    SUB_EXT,
    KINDLE_EXT,
} from '../../constants.js';

const {
    getOptionTag,
    addPost,
    extTag,
    extType,
    isVideo,
    isImage,
    isMusic,
    isTorrent,
    isZip,
    isZipbook,
    isDoc,
    isSub,
    isKindle,
    isCSV,
    mediaMIME,
    supplyTag,
    changeExt,
    getExtname,
} = await import('../mime.js');

beforeEach(() => {
    jest.clearAllMocks();
});


// ===========================================================================
// 1. getOptionTag()
// ===========================================================================
describe('getOptionTag', () => {
    test('returns an array', () => {
        const result = getOptionTag();
        expect(Array.isArray(result)).toBe(true);
    });

    test('length equals sum of all source lists', () => {
        const result = getOptionTag();
        const expectedLen =
            MEDIA_LIST_CH.length +
            GENRE_LIST_CH.length +
            GAME_LIST_CH.length +
            MUSIC_LIST.length +
            ADULT_LIST.length;
        expect(result.length).toBe(expectedLen);
    });

    test('includes all MEDIA_LIST_CH items', () => {
        const result = getOptionTag();
        MEDIA_LIST_CH.forEach(item => expect(result).toContain(item));
    });

    test('includes all GENRE_LIST_CH items', () => {
        const result = getOptionTag();
        GENRE_LIST_CH.forEach(item => expect(result).toContain(item));
    });

    test('includes all GAME_LIST_CH items', () => {
        const result = getOptionTag();
        GAME_LIST_CH.forEach(item => expect(result).toContain(item));
    });

    test('includes all MUSIC_LIST items', () => {
        const result = getOptionTag();
        MUSIC_LIST.forEach(item => expect(result).toContain(item));
    });

    test('includes all ADULT_LIST items', () => {
        const result = getOptionTag();
        ADULT_LIST.forEach(item => expect(result).toContain(item));
    });

    test('concatenation order: MEDIA → GENRE → GAME → MUSIC → ADULT', () => {
        const result = getOptionTag();
        let offset = 0;
        // MEDIA_LIST_CH first
        MEDIA_LIST_CH.forEach((item, i) => expect(result[offset + i]).toBe(item));
        offset += MEDIA_LIST_CH.length;
        // GENRE_LIST_CH second
        GENRE_LIST_CH.forEach((item, i) => expect(result[offset + i]).toBe(item));
        offset += GENRE_LIST_CH.length;
        // GAME_LIST_CH third
        GAME_LIST_CH.forEach((item, i) => expect(result[offset + i]).toBe(item));
        offset += GAME_LIST_CH.length;
        // MUSIC_LIST fourth
        MUSIC_LIST.forEach((item, i) => expect(result[offset + i]).toBe(item));
        offset += MUSIC_LIST.length;
        // ADULT_LIST last
        ADULT_LIST.forEach((item, i) => expect(result[offset + i]).toBe(item));
    });

    test('snapshot stability', () => {
        expect(getOptionTag()).toMatchSnapshot();
    });
});


// ===========================================================================
// 2. addPost(str, post)
// ===========================================================================
describe('addPost', () => {
    test('file with extension: inserts postfix before ext', () => {
        expect(addPost('movie.mp4', '1')).toBe('movie(1).mp4');
    });

    test('uppercase ext is lowercased', () => {
        expect(addPost('photo.JPG', '2')).toBe('photo(2).jpg');
    });

    test('no extension: appends postfix directly', () => {
        expect(addPost('README', 'copy')).toBe('README(copy)');
    });

    test('multi-dot filename: only last ext replaced', () => {
        expect(addPost('archive.tar.gz', '1')).toBe('archive.tar(1).gz');
    });

    test('mixed-case extension', () => {
        expect(addPost('data.Csv', '3')).toBe('data(3).csv');
    });

    test('numeric postfix', () => {
        expect(addPost('song.mp3', '99')).toBe('song(99).mp3');
    });

    test('postfix with special characters', () => {
        expect(addPost('doc.pdf', 'v2.1')).toBe('doc(v2.1).pdf');
    });

    test('empty string filename', () => {
        expect(addPost('', 'x')).toBe('(x)');
    });

    test('dot-leading name (.gitignore)', () => {
        const result = addPost('.gitignore', '1');
        // EXT_FILENAME captures 'gitignore' as extension
        expect(result).toBe('(1).gitignore');
    });

    test('very long postfix', () => {
        const longPost = 'a'.repeat(100);
        expect(addPost('f.txt', longPost)).toBe(`f(${longPost}).txt`);
    });

    test('extension-only name (.env)', () => {
        expect(addPost('.env', 'bak')).toBe('(bak).env');
    });
});


// ===========================================================================
// 3. extTag(type)
// ===========================================================================
describe('extTag', () => {
    const VALID_TYPES = ['image', 'zipbook', 'video', 'music', 'doc', 'pdf', 'present', 'sheet', 'rawdoc', 'url', 'zip'];

    test.each(VALID_TYPES)('valid type "%s" returns object with def and opt', (type) => {
        const result = extTag(type);
        expect(result).toHaveProperty('def');
        expect(result).toHaveProperty('opt');
        expect(Array.isArray(result.def)).toBe(true);
        expect(Array.isArray(result.opt)).toBe(true);
    });

    test.each(VALID_TYPES)('snapshot for type "%s"', (type) => {
        expect(extTag(type)).toMatchSnapshot();
    });

    test('returns deep clone — mutation does not affect original', () => {
        const first = extTag('image');
        first.def.push('MUTATED');
        const second = extTag('image');
        expect(second.def).not.toContain('MUTATED');
        expect(second).toEqual(MEDIA_TAG.image);
    });

    test('invalid type returns empty object', () => {
        expect(extTag('unknown')).toEqual({});
    });

    test('undefined type returns empty object', () => {
        expect(extTag(undefined)).toEqual({});
    });

    test('null type returns empty object', () => {
        expect(extTag(null)).toEqual({});
    });

    test('empty string returns empty object', () => {
        expect(extTag('')).toEqual({});
    });

    test('logger.warn called on invalid type', () => {
        extTag('nonexistent');
        expect(mockLog.warn).toHaveBeenCalledWith({ type: 'nonexistent' }, 'failed to clone MEDIA_TAG entry');
    });
});


// ===========================================================================
// 4. extType(name) — 17 branches
// ===========================================================================
describe('extType', () => {
    // B1: No regex match
    test('no extension returns false', () => {
        expect(extType('README')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(extType('')).toBe(false);
    });

    // B2: IMAGE_EXT
    test.each(IMAGE_EXT)('image ext "%s"', (ext) => {
        expect(extType(`file.${ext}`)).toEqual({ type: 'image', ext });
    });

    test('image case insensitive', () => {
        expect(extType('photo.JPG')).toEqual({ type: 'image', ext: 'jpg' });
    });

    // B3: ZIP → zipbook (.book.zip/7z/rar)
    test('zipbook via .book.zip', () => {
        expect(extType('manga.book.zip')).toEqual({ type: 'zipbook', ext: 'zip' });
    });

    test('zipbook via .book.7z', () => {
        expect(extType('manga.book.7z')).toEqual({ type: 'zipbook', ext: '7z' });
    });

    test('zipbook via .book.rar', () => {
        expect(extType('manga.book.rar')).toEqual({ type: 'zipbook', ext: 'rar' });
    });

    // B4: ZIP → cbr/cbz
    test('zipbook via cbr', () => {
        expect(extType('comic.cbr')).toEqual({ type: 'zipbook', ext: 'cbr' });
    });

    test('zipbook via cbz', () => {
        expect(extType('comic.cbz')).toEqual({ type: 'zipbook', ext: 'cbz' });
    });

    // B5: ZIP → 001 → .zip.001
    test('.zip.001 split archive', () => {
        expect(extType('archive.zip.001')).toEqual({ type: 'zip', ext: 'zip' });
    });

    // B6: ZIP → 001 → .7z.001
    test('.7z.001 split archive', () => {
        expect(extType('archive.7z.001')).toEqual({ type: 'zip', ext: '7z' });
    });

    // B7: ZIP → 001 → other (false)
    test('.rar.001 split archive returns false', () => {
        expect(extType('archive.rar.001')).toBe(false);
    });

    test('bare .001 returns false', () => {
        expect(extType('data.001')).toBe(false);
    });

    // B8: ZIP → regular
    test('regular zip', () => {
        expect(extType('files.zip')).toEqual({ type: 'zip', ext: 'zip' });
    });

    test('regular rar', () => {
        expect(extType('files.rar')).toEqual({ type: 'zip', ext: 'rar' });
    });

    test('regular 7z', () => {
        expect(extType('files.7z')).toEqual({ type: 'zip', ext: '7z' });
    });

    // B9: VIDEO_EXT
    test.each(VIDEO_EXT)('video ext "%s"', (ext) => {
        expect(extType(`clip.${ext}`)).toEqual({ type: 'video', ext });
    });

    test('video case insensitive', () => {
        expect(extType('MOVIE.MP4')).toEqual({ type: 'video', ext: 'mp4' });
    });

    // B10: MUSIC_EXT
    test.each(MUSIC_EXT)('music ext "%s"', (ext) => {
        expect(extType(`track.${ext}`)).toEqual({ type: 'music', ext });
    });

    // B11: DOC_EXT.doc
    test.each(DOC_EXT.doc)('doc ext "%s"', (ext) => {
        expect(extType(`file.${ext}`)).toEqual({ type: 'doc', ext });
    });

    // B12: DOC_EXT.present
    test.each(DOC_EXT.present)('present ext "%s"', (ext) => {
        expect(extType(`file.${ext}`)).toEqual({ type: 'present', ext });
    });

    // B13: DOC_EXT.sheet
    test.each(DOC_EXT.sheet)('sheet ext "%s"', (ext) => {
        expect(extType(`file.${ext}`)).toEqual({ type: 'sheet', ext });
    });

    // B14: DOC_EXT.pdf
    test('pdf ext', () => {
        expect(extType('manual.pdf')).toEqual({ type: 'pdf', ext: 'pdf' });
    });

    // B15: DOC_EXT.rawdoc
    test.each(DOC_EXT.rawdoc)('rawdoc ext "%s"', (ext) => {
        expect(extType(`file.${ext}`)).toEqual({ type: 'rawdoc', ext });
    });

    // B16: No category match → false
    test('unknown ext returns false', () => {
        expect(extType('program.exe')).toBe(false);
    });

    test('.xyz returns false', () => {
        expect(extType('data.xyz')).toBe(false);
    });

    // Edge cases
    test('multi-dot resolves last extension', () => {
        // .tar.gz → gz is not a known ext → false
        expect(extType('archive.tar.gz')).toBe(false);
    });

    test('dot-only filename', () => {
        expect(extType('.')).toBe(false);
    });

    test('trailing dot', () => {
        expect(extType('file.')).toBe(false);
    });

    test('path-like input', () => {
        expect(extType('/path/to/movie.mp4')).toEqual({ type: 'video', ext: 'mp4' });
    });

    test('spaces in filename', () => {
        expect(extType('my file.mp4')).toEqual({ type: 'video', ext: 'mp4' });
    });

    test('unicode filename', () => {
        expect(extType('映画.mp4')).toEqual({ type: 'video', ext: 'mp4' });
    });

    // Snapshot: full classification map
    test('snapshot — full type classification map', () => {
        const samples = {
            'photo.jpg':       { type: 'image', ext: 'jpg' },
            'movie.mp4':       { type: 'video', ext: 'mp4' },
            'song.mp3':        { type: 'music', ext: 'mp3' },
            'file.zip':        { type: 'zip', ext: 'zip' },
            'manga.book.zip':  { type: 'zipbook', ext: 'zip' },
            'comic.cbr':       { type: 'zipbook', ext: 'cbr' },
            'notes.txt':       { type: 'doc', ext: 'txt' },
            'slides.pptx':     { type: 'present', ext: 'pptx' },
            'data.xlsx':       { type: 'sheet', ext: 'xlsx' },
            'manual.pdf':      { type: 'pdf', ext: 'pdf' },
            'app.js':          { type: 'rawdoc', ext: 'js' },
            'archive.zip.001': { type: 'zip', ext: 'zip' },
            'archive.7z.001':  { type: 'zip', ext: '7z' },
        };
        for (const [name, expected] of Object.entries(samples)) {
            expect(extType(name)).toEqual(expected);
        }
    });
});


// ===========================================================================
// 5. isVideo(name)
// ===========================================================================
describe('isVideo', () => {
    test.each(VIDEO_EXT)('recognizes video ext "%s"', (ext) => {
        expect(isVideo(`file.${ext}`)).toBe(ext);
    });

    test('uppercase ext is lowercased', () => {
        expect(isVideo('clip.MP4')).toBe('mp4');
    });

    test('non-video returns false', () => {
        expect(isVideo('photo.jpg')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isVideo('README')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isVideo('')).toBe(false);
    });
});


// ===========================================================================
// 6. isImage(name)
// ===========================================================================
describe('isImage', () => {
    test.each(IMAGE_EXT)('recognizes image ext "%s"', (ext) => {
        expect(isImage(`file.${ext}`)).toBe(ext);
    });

    test('uppercase ext is lowercased', () => {
        expect(isImage('icon.PNG')).toBe('png');
    });

    test('non-image returns false', () => {
        expect(isImage('movie.mp4')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isImage('file')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isImage('')).toBe(false);
    });
});


// ===========================================================================
// 7. isMusic(name)
// ===========================================================================
describe('isMusic', () => {
    test.each(MUSIC_EXT)('recognizes music ext "%s"', (ext) => {
        expect(isMusic(`file.${ext}`)).toBe(ext);
    });

    test('uppercase ext is lowercased', () => {
        expect(isMusic('audio.WAV')).toBe('wav');
    });

    test('non-music returns false', () => {
        expect(isMusic('doc.pdf')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isMusic('track')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isMusic('')).toBe(false);
    });
});


// ===========================================================================
// 8. isTorrent(name)
// ===========================================================================
describe('isTorrent', () => {
    test('valid torrent file', () => {
        expect(isTorrent('file.torrent')).toBe('torrent');
    });

    test('uppercase TORRENT', () => {
        expect(isTorrent('file.TORRENT')).toBe('torrent');
    });

    test('non-torrent returns false', () => {
        expect(isTorrent('file.zip')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isTorrent('torrentfile')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isTorrent('')).toBe(false);
    });
});


// ===========================================================================
// 9. isZip(name)
// ===========================================================================
describe('isZip', () => {
    test('regular zip', () => {
        expect(isZip('a.zip')).toBe('zip');
    });

    test('regular rar', () => {
        expect(isZip('a.rar')).toBe('rar');
    });

    test('regular 7z', () => {
        expect(isZip('a.7z')).toBe('7z');
    });

    test('cbr is zip', () => {
        expect(isZip('a.cbr')).toBe('cbr');
    });

    test('cbz is zip', () => {
        expect(isZip('a.cbz')).toBe('cbz');
    });

    test('.zip.001 → zip', () => {
        expect(isZip('a.zip.001')).toBe('zip');
    });

    test('.7z.001 → 7z', () => {
        expect(isZip('a.7z.001')).toBe('7z');
    });

    test('.rar.001 → false', () => {
        expect(isZip('a.rar.001')).toBe(false);
    });

    test('bare .001 → false', () => {
        expect(isZip('data.001')).toBe(false);
    });

    test('non-zip ext returns false', () => {
        expect(isZip('video.mp4')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isZip('archive')).toBe(false);
    });

    test('case insensitive', () => {
        expect(isZip('a.ZIP')).toBe('zip');
    });

    test('empty string returns false', () => {
        expect(isZip('')).toBe(false);
    });
});


// ===========================================================================
// 10. isZipbook(name)
// ===========================================================================
describe('isZipbook', () => {
    test('.book.zip', () => {
        expect(isZipbook('manga.book.zip')).toBe('zip');
    });

    test('.book.7z', () => {
        expect(isZipbook('manga.book.7z')).toBe('7z');
    });

    test('.book.rar', () => {
        expect(isZipbook('manga.book.rar')).toBe('rar');
    });

    test('cbr file', () => {
        expect(isZipbook('comic.cbr')).toBe('cbr');
    });

    test('cbz file', () => {
        expect(isZipbook('comic.cbz')).toBe('cbz');
    });

    test('regular zip (not book) returns false', () => {
        expect(isZipbook('files.zip')).toBe(false);
    });

    test('regular 7z (not book) returns false', () => {
        expect(isZipbook('files.7z')).toBe(false);
    });

    test('non-zip ext returns false', () => {
        expect(isZipbook('photo.jpg')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isZipbook('comicbook')).toBe(false);
    });

    test('.book.001 returns false (001 not matched by book regex, not cbr/cbz)', () => {
        expect(isZipbook('data.book.001')).toBe(false);
    });

    test('case: .book.ZIP — now correctly detected with case-insensitive regex', () => {
        expect(isZipbook('manga.book.ZIP')).toBe('zip');
    });

    test('empty string returns false', () => {
        expect(isZipbook('')).toBe(false);
    });
});


// ===========================================================================
// 11. isDoc(name)
// ===========================================================================
describe('isDoc', () => {
    // All doc subtypes
    test.each(DOC_EXT.doc)('doc ext "%s"', (ext) => {
        expect(isDoc(`file.${ext}`)).toEqual({ type: 'doc', ext });
    });

    test.each(DOC_EXT.present)('present ext "%s"', (ext) => {
        expect(isDoc(`file.${ext}`)).toEqual({ type: 'present', ext });
    });

    test.each(DOC_EXT.sheet)('sheet ext "%s"', (ext) => {
        expect(isDoc(`file.${ext}`)).toEqual({ type: 'sheet', ext });
    });

    test('pdf ext', () => {
        expect(isDoc('file.pdf')).toEqual({ type: 'pdf', ext: 'pdf' });
    });

    test.each(DOC_EXT.rawdoc)('rawdoc ext "%s"', (ext) => {
        expect(isDoc(`file.${ext}`)).toEqual({ type: 'rawdoc', ext });
    });

    test('unknown ext returns false', () => {
        expect(isDoc('file.exe')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isDoc('Makefile')).toBe(false);
    });

    test('case insensitive', () => {
        expect(isDoc('FILE.TXT')).toEqual({ type: 'doc', ext: 'txt' });
    });

    test('empty string returns false', () => {
        expect(isDoc('')).toBe(false);
    });
});


// ===========================================================================
// 12. isSub(name)
// ===========================================================================
describe('isSub', () => {
    test.each(SUB_EXT)('subtitle ext "%s"', (ext) => {
        expect(isSub(`movie.${ext}`)).toBe(ext);
    });

    test('case insensitive', () => {
        expect(isSub('file.SRT')).toBe('srt');
    });

    test('non-subtitle returns false', () => {
        expect(isSub('movie.mp4')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isSub('subtitles')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isSub('')).toBe(false);
    });
});


// ===========================================================================
// 13. isKindle(name)
// ===========================================================================
describe('isKindle', () => {
    // Static KINDLE_EXT members
    test.each(KINDLE_EXT)('static kindle ext "%s"', (ext) => {
        expect(isKindle(`book.${ext}`)).toBe(ext);
    });

    // Dynamic azwN pattern
    test('dynamic azw3', () => {
        expect(isKindle('book.azw3')).toBe('azw3');
    });

    test('dynamic azw4', () => {
        expect(isKindle('book.azw4')).toBe('azw4');
    });

    test('dynamic azw0', () => {
        expect(isKindle('book.azw0')).toBe('azw0');
    });

    test('dynamic azw9', () => {
        expect(isKindle('book.azw9')).toBe('azw9');
    });

    // Edge: azw10 (2 digits) → regex requires exactly 1
    test('azw10 returns false (regex needs exactly 1 digit)', () => {
        expect(isKindle('book.azw10')).toBe(false);
    });

    test('azwX (non-digit) returns false', () => {
        expect(isKindle('book.azwX')).toBe(false);
    });

    test('non-kindle ext returns false', () => {
        expect(isKindle('file.mp4')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isKindle('kindle')).toBe(false);
    });

    test('case insensitive', () => {
        expect(isKindle('book.MOBI')).toBe('mobi');
    });

    test('empty string returns false', () => {
        expect(isKindle('')).toBe(false);
    });
});


// ===========================================================================
// 14. isCSV(name)
// ===========================================================================
describe('isCSV', () => {
    test('valid csv', () => {
        expect(isCSV('data.csv')).toBe('csv');
    });

    test('uppercase CSV', () => {
        expect(isCSV('DATA.CSV')).toBe('csv');
    });

    test('non-csv returns false', () => {
        expect(isCSV('data.xlsx')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(isCSV('csvfile')).toBe(false);
    });

    test('similar ext csv2 returns false', () => {
        expect(isCSV('file.csv2')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(isCSV('')).toBe(false);
    });
});


// ===========================================================================
// 15. mediaMIME(name)
// ===========================================================================
describe('mediaMIME', () => {
    // Test every MIME_EXT entry
    test.each(Object.entries(MIME_EXT))('MIME for ext "%s" → "%s"', (ext, mime) => {
        expect(mediaMIME(`file.${ext}`)).toBe(mime);
    });

    test('case insensitive', () => {
        expect(mediaMIME('FILE.MP4')).toBe('video/mp4');
    });

    test('unknown ext returns false', () => {
        expect(mediaMIME('file.xyz')).toBe(false);
    });

    test('no extension returns false', () => {
        expect(mediaMIME('README')).toBe(false);
    });

    test('empty string returns false', () => {
        expect(mediaMIME('')).toBe(false);
    });

    // Specific MIME values for critical types
    test('jpg → image/jpeg', () => {
        expect(mediaMIME('photo.jpg')).toBe('image/jpeg');
    });

    test('png → image/png', () => {
        expect(mediaMIME('icon.png')).toBe('image/png');
    });

    test('mp4 → video/mp4', () => {
        expect(mediaMIME('clip.mp4')).toBe('video/mp4');
    });

    test('mkv → video/x-matroska', () => {
        expect(mediaMIME('film.mkv')).toBe('video/x-matroska');
    });

    test('pdf → application/pdf', () => {
        expect(mediaMIME('doc.pdf')).toBe('application/pdf');
    });

    test('docx → openxmlformats word', () => {
        expect(mediaMIME('file.docx')).toBe(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
    });

    test('zip → application/zip', () => {
        expect(mediaMIME('file.zip')).toBe('application/zip');
    });
});


// ===========================================================================
// 16. supplyTag(tags, retTags, otherTags)
// ===========================================================================
describe('supplyTag', () => {
    // S1: Adult branch ('18+')
    test('18+ tag → uses ADULT_LIST', () => {
        const result = supplyTag(['18+'], []);
        ADULT_LIST.forEach(item => {
            if (item !== '18+') expect(result).toContain(item);
        });
    });

    test('18+ with existing tags excluded', () => {
        const result = supplyTag(['18+', 'ol'], ['中出']);
        expect(result).not.toContain('ol');
        // '中出' is in retTags → appears at front via ...retTags spread
        expect(result[0]).toBe('中出');
        // '中出' is excluded from the ADULT_LIST filtered portion, so appears only once
        const count = result.filter(i => i === '中出').length;
        expect(count).toBe(1);
    });

    test('18+ with otherTags excluded', () => {
        const result = supplyTag(['18+'], [], ['多p']);
        expect(result).not.toContain('多p');
    });

    // S2: Game branch ('game')
    test('game tag → uses GAME_LIST_CH', () => {
        const result = supplyTag(['game'], []);
        GAME_LIST_CH.forEach(item => {
            if (item !== 'game') expect(result).toContain(item);
        });
    });

    // S3: Game branch ('遊戲')
    test('遊戲 tag → uses GAME_LIST_CH', () => {
        const result = supplyTag(['遊戲'], []);
        GAME_LIST_CH.forEach(item => {
            if (item !== '遊戲') expect(result).toContain(item);
        });
    });

    test('game with exclusions', () => {
        const result = supplyTag(['game', '動作'], ['冒險']);
        expect(result).not.toContain('動作');
        // '冒險' excluded from GAME_LIST_CH portion but present as first via retTags
        expect(result[0]).toBe('冒險');
        // Check it's not duplicated — count occurrences
        const count = result.filter(i => i === '冒險').length;
        expect(count).toBe(1);
    });

    // S4: Audio branch ('audio')
    test('audio tag → uses MUSIC_LIST', () => {
        const result = supplyTag(['audio'], []);
        MUSIC_LIST.forEach(item => {
            if (item !== 'audio') expect(result).toContain(item);
        });
    });

    // S5: Audio branch ('音頻')
    test('音頻 tag → uses MUSIC_LIST', () => {
        const result = supplyTag(['音頻'], []);
        MUSIC_LIST.forEach(item => {
            if (item !== '音頻') expect(result).toContain(item);
        });
    });

    // S6: Default branch (GENRE_LIST_CH)
    test('no category tag → uses GENRE_LIST_CH', () => {
        const result = supplyTag(['動作'], []);
        expect(result).not.toContain('動作');
        GENRE_LIST_CH.forEach(item => {
            if (item !== '動作') expect(result).toContain(item);
        });
    });

    test('empty tags → full GENRE_LIST_CH', () => {
        const result = supplyTag([], []);
        GENRE_LIST_CH.forEach(item => expect(result).toContain(item));
        expect(result.length).toBe(GENRE_LIST_CH.length);
    });

    // Priority: 18+ > game > audio > default
    test('18+ takes priority over game', () => {
        const result = supplyTag(['18+', 'game'], []);
        // Should use ADULT_LIST, not GAME_LIST_CH
        ADULT_LIST.forEach(item => {
            if (item !== '18+' && item !== 'game') expect(result).toContain(item);
        });
    });

    test('game takes priority over audio', () => {
        const result = supplyTag(['game', 'audio'], []);
        // Should use GAME_LIST_CH, not MUSIC_LIST
        GAME_LIST_CH.forEach(item => {
            if (item !== 'game' && item !== 'audio') expect(result).toContain(item);
        });
    });

    // otherTags default parameter
    test('omitted otherTags defaults to empty array', () => {
        expect(() => supplyTag([], [])).not.toThrow();
    });

    // retTags preservation
    test('retTags appear first in result', () => {
        const result = supplyTag([], ['x', 'y']);
        expect(result[0]).toBe('x');
        expect(result[1]).toBe('y');
    });

    // Comprehensive filter: item in all three arrays
    test('item in tags excluded from supply list', () => {
        const result = supplyTag(['動作'], []);
        expect(result).not.toContain('動作');
    });

    test('item in retTags excluded from supply list', () => {
        const result = supplyTag([], ['動作']);
        // '動作' is in retTags → appears first but NOT duplicated from GENRE_LIST_CH
        const count = result.filter(i => i === '動作').length;
        expect(count).toBe(1);
    });

    test('item in otherTags excluded from supply list', () => {
        const result = supplyTag([], [], ['動作']);
        expect(result).not.toContain('動作');
    });
});


// ===========================================================================
// 17. changeExt(str, ext)
// ===========================================================================
describe('changeExt', () => {
    test('replace extension', () => {
        expect(changeExt('video.avi', 'mp4')).toBe('video.mp4');
    });

    test('multi-dot name replaces last ext', () => {
        expect(changeExt('file.tar.gz', 'bz2')).toBe('file.tar.bz2');
    });

    test('no extension appends new ext', () => {
        expect(changeExt('README', 'txt')).toBe('README.txt');
    });

    test('same extension', () => {
        expect(changeExt('file.mp4', 'mp4')).toBe('file.mp4');
    });

    test('uppercase source ext', () => {
        expect(changeExt('IMG.JPG', 'png')).toBe('IMG.png');
    });

    test('empty ext parameter', () => {
        expect(changeExt('file.txt', '')).toBe('file.');
    });

    test('empty string filename', () => {
        expect(changeExt('', 'txt')).toBe('.txt');
    });
});


// ===========================================================================
// 18. getExtname(name)
// ===========================================================================
describe('getExtname', () => {
    test('normal file', () => {
        expect(getExtname('photo.jpg')).toEqual({ front: 'photo', ext: '.jpg' });
    });

    test('multi-dot filename', () => {
        expect(getExtname('archive.tar.gz')).toEqual({ front: 'archive.tar', ext: '.gz' });
    });

    test('no extension', () => {
        expect(getExtname('README')).toEqual({ front: 'README', ext: '' });
    });

    test('uppercase ext is lowercased', () => {
        expect(getExtname('FILE.TXT')).toEqual({ front: 'FILE', ext: '.txt' });
    });

    test('dot-leading name (.gitignore)', () => {
        const result = getExtname('.gitignore');
        // EXT_FILENAME result[0] matches '.gitignore' (full), lowercased
        expect(result.ext).toBe('.gitignore');
        expect(result.front).toBe('');
    });

    test('only extension (.env)', () => {
        expect(getExtname('.env')).toEqual({ front: '', ext: '.env' });
    });

    test('empty string', () => {
        expect(getExtname('')).toEqual({ front: '', ext: '' });
    });

    test('multiple dots in version', () => {
        expect(getExtname('v1.2.3.tar.gz')).toEqual({ front: 'v1.2.3.tar', ext: '.gz' });
    });

    test('path-like input', () => {
        expect(getExtname('/path/to/file.mp4')).toEqual({ front: '/path/to/file', ext: '.mp4' });
    });
});


// ===========================================================================
// Cross-cutting: common edge cases across is* functions
// ===========================================================================
describe('Cross-cutting edge cases', () => {
    const checkers = [
        { fn: isVideo, name: 'isVideo' },
        { fn: isImage, name: 'isImage' },
        { fn: isMusic, name: 'isMusic' },
        { fn: isTorrent, name: 'isTorrent' },
        { fn: isZip, name: 'isZip' },
        { fn: isZipbook, name: 'isZipbook' },
        { fn: isSub, name: 'isSub' },
        { fn: isCSV, name: 'isCSV' },
    ];

    test.each(checkers)('$name: trailing dot returns false', ({ fn }) => {
        expect(fn('file.')).toBe(false);
    });

    test.each(checkers)('$name: path-like input works', ({ fn }) => {
        // Won't match any category (unless .exe happened to) but shouldn't crash
        expect(() => fn('/some/path/file.xyz')).not.toThrow();
    });

    test.each(checkers)('$name: spaces in name do not crash', ({ fn }) => {
        expect(() => fn('my file name.xyz')).not.toThrow();
    });

    test.each(checkers)('$name: unicode filename does not crash', ({ fn }) => {
        expect(() => fn('日本語.xyz')).not.toThrow();
    });
});


// ===========================================================================
// Bug discovery tests
// ===========================================================================
describe('Bug Discovery', () => {
    test('isZipbook — uppercase .book.ZIP now correctly detected', () => {
        // Fixed: regex now uses /i flag for case-insensitive matching
        const result = isZipbook('manga.book.ZIP');
        expect(result).toBe('zip');
    });

    test('isZip — .ZIP.001 now resolves correctly', () => {
        // Fixed: regex now uses /i flag for case-insensitive matching
        const result = isZip('archive.ZIP.001');
        expect(result).toBe('zip');
    });

    test('extType — .ZIP.001 now resolves correctly', () => {
        expect(extType('archive.ZIP.001')).toEqual({ type: 'zip', ext: 'zip' });
    });

    test('isKindle — operator precedence in ternary chain', () => {
        // Fixed: explicit parentheses for clarity
        expect(isKindle('book.azw3')).toBe('azw3'); // dynamic path
        expect(isKindle('book.azw')).toBe('azw');    // static path
        expect(isKindle('book.xyz')).toBe(false);    // neither
    });

    test('isZipbook — .book.7Z uppercase detected', () => {
        expect(isZipbook('manga.book.7Z')).toBe('7z');
    });

    test('isZipbook — .book.RAR uppercase detected', () => {
        expect(isZipbook('manga.book.RAR')).toBe('rar');
    });

    test('isZip — .7Z.001 uppercase detected', () => {
        expect(isZip('archive.7Z.001')).toBe('7z');
    });

    test('extType — .book.ZIP uppercase detected as zipbook', () => {
        expect(extType('manga.book.ZIP')).toEqual({ type: 'zipbook', ext: 'zip' });
    });

    test('extType — .7Z.001 uppercase detected as zip', () => {
        expect(extType('archive.7Z.001')).toEqual({ type: 'zip', ext: '7z' });
    });
});

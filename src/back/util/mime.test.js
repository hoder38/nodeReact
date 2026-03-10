import { jest } from '@jest/globals';

// 1. Mocking constants.js
jest.unstable_mockModule('../constants.js', () => ({
    MEDIA_LIST_CH: ['圖片', '影片'],
    GENRE_LIST_CH: ['動作', '喜劇'],
    GAME_LIST_CH: ['休閒', '策略'],
    MUSIC_LIST: ['pop', 'rock'],
    ADULT_LIST: ['無碼', '熟女'],
    EXT_FILENAME: /(?:\.([^.]+))?$/,
    MEDIA_TAG: {
        image: { def: ['圖片'], opt: ['相片'] },
        video: { def: ['影片'], opt: ['電影'] },
    },
    IMAGE_EXT: ['jpg', 'png'],
    ZIP_EXT: ['zip', '7z', 'rar', 'cbr', 'cbz', '001'],
    VIDEO_EXT: ['mp4', 'mkv'],
    MUSIC_EXT: ['mp3', 'wav'],
    DOC_EXT: {
        doc: ['doc', 'txt'],
        present: ['ppt'],
        sheet: ['xls'],
        pdf: ['pdf'],
        rawdoc: ['js', 'py'],
    },
    MIME_EXT: {
        jpg: 'image/jpeg',
        mp4: 'video/mp4',
        zip: 'application/zip',
    },
    TORRENT_EXT: ['torrent'],
    SUB_EXT: ['srt', 'vtt'],
    KINDLE_EXT: ['mobi', 'azw3'],
}));

// 2. Importing the module under test
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
    getExtname
} = await import('./mime.js');

describe('MIME & File Utility (mime.js)', () => {

    describe('getOptionTag', () => {
        it('should aggregate all tag categories', () => {
            const tags = getOptionTag();
            expect(tags).toContain('圖片');
            expect(tags).toContain('動作');
            expect(tags).toContain('休閒');
            expect(tags).toContain('pop');
            expect(tags).toContain('無碼');
            expect(tags.length).toBe(10);
        });
    });

    describe('addPost', () => {
        it('should append postfix to filename with extension', () => {
            expect(addPost('test.jpg', 'v1')).toBe('test(v1).jpg');
            expect(addPost('image.PNG', 'edit')).toBe('image(edit).png');
        });

        it('should append postfix to filename without extension', () => {
            expect(addPost('test', 'v1')).toBe('test(v1)');
        });

        it('should handle filenames with multiple dots', () => {
            expect(addPost('archive.tar.gz', 'fix')).toBe('archive.tar(fix).gz');
        });
    });

    describe('extTag', () => {
        it('should return cloned tag object for valid type', () => {
            const tag1 = extTag('image');
            const tag2 = extTag('image');
            expect(tag1).toEqual({ def: ['圖片'], opt: ['相片'] });
            expect(tag1).not.toBe(tag2); // Ensure they are separate object references
        });

        it('should return empty object for invalid type', () => {
            const tag = extTag('nonexistent');
            expect(tag).toEqual({});
        });
    });

    describe('extType', () => {
        it('should classify images', () => {
            expect(extType('test.jpg')).toEqual({ type: 'image', ext: 'jpg' });
        });

        it('should classify zipbook special cases', () => {
            expect(extType('comic.book.zip')).toEqual({ type: 'zipbook', ext: 'zip' });
            expect(extType('manga.cbr')).toEqual({ type: 'zipbook', ext: 'cbr' });
        });

        it('should classify split archives', () => {
            expect(extType('data.zip.001')).toEqual({ type: 'zip', ext: 'zip' });
            expect(extType('data.7z.001')).toEqual({ type: 'zip', ext: '7z' });
            expect(extType('data.rar.001')).toBe(false);
        });

        it('should classify other zips', () => {
            expect(extType('archive.rar')).toEqual({ type: 'zip', ext: 'rar' });
        });

        it('should classify video and music', () => {
            expect(extType('movie.mp4')).toEqual({ type: 'video', ext: 'mp4' });
            expect(extType('song.mp3')).toEqual({ type: 'music', ext: 'mp3' });
        });

        it('should classify documents', () => {
            expect(extType('doc.txt')).toEqual({ type: 'doc', ext: 'txt' });
            expect(extType('slides.ppt')).toEqual({ type: 'present', ext: 'ppt' });
            expect(extType('data.xls')).toEqual({ type: 'sheet', ext: 'xls' });
            expect(extType('paper.pdf')).toEqual({ type: 'pdf', ext: 'pdf' });
            expect(extType('script.js')).toEqual({ type: 'rawdoc', ext: 'js' });
        });

        it('should return false for no extension or unknown type', () => {
            expect(extType('noextension')).toBe(false);
            expect(extType('unknown.xyz')).toBe(false);
        });
    });

    describe('Boolean Checkers', () => {
        it('isVideo', () => {
            expect(isVideo('test.mp4')).toBe('mp4');
            expect(isVideo('test.jpg')).toBe(false);
            expect(isVideo('noext')).toBe(false);
        });

        it('isImage', () => {
            expect(isImage('test.jpg')).toBe('jpg');
            expect(isImage('test.mp4')).toBe(false);
        });

        it('isMusic', () => {
            expect(isMusic('test.mp3')).toBe('mp3');
            expect(isMusic('test.wav')).toBe('wav');
            expect(isMusic('test.jpg')).toBe(false);
        });

        it('isTorrent', () => {
            expect(isTorrent('file.torrent')).toBe('torrent');
            expect(isTorrent('file.zip')).toBe(false);
        });

        it('isZip', () => {
            expect(isZip('data.zip')).toBe('zip');
            expect(isZip('data.zip.001')).toBe('zip');
            expect(isZip('data.7z.001')).toBe('7z');
            expect(isZip('data.rar.001')).toBe(false);
            expect(isZip('file.txt')).toBe(false);
        });

        it('isZipbook', () => {
            expect(isZipbook('comic.book.zip')).toBe('zip');
            expect(isZipbook('manga.cbz')).toBe('cbz');
            expect(isZipbook('normal.zip')).toBe(false);
        });

        it('isDoc', () => {
            expect(isDoc('test.txt')).toEqual({ type: 'doc', ext: 'txt' });
            expect(isDoc('test.pdf')).toEqual({ type: 'pdf', ext: 'pdf' });
            expect(isDoc('test.js')).toEqual({ type: 'rawdoc', ext: 'js' });
            expect(isDoc('test.jpg')).toBe(false);
        });

        it('isSub', () => {
            expect(isSub('sub.srt')).toBe('srt');
            expect(isSub('movie.mp4')).toBe(false);
        });

        it('isKindle', () => {
            expect(isKindle('book.mobi')).toBe('mobi');
            expect(isKindle('book.azw3')).toBe('azw3');
            expect(isKindle('book.azw4')).toBe('azw4'); // Matches azw\d
            expect(isKindle('book.pdf')).toBe(false); // pdf is in KINDLE_EXT in actual constants but not in my mock KINDLE_EXT
        });

        it('isCSV', () => {
            expect(isCSV('data.csv')).toBe('csv');
            expect(isCSV('data.txt')).toBe(false);
        });
    });

    describe('mediaMIME', () => {
        it('should return correct MIME type', () => {
            expect(mediaMIME('test.jpg')).toBe('image/jpeg');
            expect(mediaMIME('movie.mp4')).toBe('video/mp4');
            expect(mediaMIME('data.zip')).toBe('application/zip');
        });

        it('should return false for unknown extension', () => {
            expect(mediaMIME('unknown.xyz')).toBe(false);
            expect(mediaMIME('noext')).toBe(false);
        });
    });

    describe('supplyTag', () => {
        it('should suggest adult tags if 18+ is present', () => {
            const tags = ['18+'];
            const ret = supplyTag(tags, ['existing']);
            expect(ret).toContain('existing');
            expect(ret).toContain('無碼');
            expect(ret).toContain('熟女');
        });

        it('should suggest game tags if game is present', () => {
            const tags = ['game'];
            const ret = supplyTag(tags, []);
            expect(ret).toContain('休閒');
            expect(ret).toContain('策略');
        });

        it('should suggest music tags if audio is present', () => {
            const tags = ['音頻'];
            const ret = supplyTag(tags, []);
            expect(ret).toContain('pop');
            expect(ret).toContain('rock');
        });

        it('should suggest genre tags by default', () => {
            const tags = ['random'];
            const ret = supplyTag(tags, []);
            expect(ret).toContain('動作');
            expect(ret).toContain('喜劇');
        });

        it('should filter out existing and other tags', () => {
            const tags = ['18+', '無碼'];
            const ret = supplyTag(tags, ['熟女'], ['other']);
            // ADULT_LIST is ['無碼', '熟女']
            // '無碼' is in tags -> filtered
            // '熟女' is in retTags -> filtered
            expect(ret).toEqual(['熟女']); // Only retTags
        });
    });

    describe('String Helpers', () => {
        it('changeExt', () => {
            expect(changeExt('image.png', 'jpg')).toBe('image.jpg');
        });

        it('getExtname', () => {
            expect(getExtname('my.file.txt')).toEqual({ front: 'my.file', ext: '.txt' });
            expect(getExtname('noextension')).toEqual({ front: 'noextension', ext: '' });
        });
    });
});

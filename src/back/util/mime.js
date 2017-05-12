import { GENRE_LIST_CH, MEDIA_LIST_CH, MUSIC_LIST, ADULT_LIST, GAME_LIST_CH, EXT_FILENAME, MEDIA_TAG, IMAGE_EXT, ZIP_EXT, VIDEO_EXT, MUSIC_EXT, RAW_DOC_EXT, DOC_EXT, MIME_EXT, TORRENT_EXT, SUB_EXT } from '../constants'

export const getOptionTag = () => [
    ...MEDIA_LIST_CH,
    ...GENRE_LIST_CH,
    ...GAME_LIST_CH,
    ...MUSIC_LIST,
    ...ADULT_LIST,
]

export const addPost = (str, post) => {
    const result = str.match(EXT_FILENAME);
    return (result && result[1]) ? str.replace(EXT_FILENAME, a => `(${post}).${result[1].toLowerCase()}`) : `${str}(${post})`;
}

export const extTag = type => {
    try {
        return JSON.parse(JSON.stringify(MEDIA_TAG[type]));
    } catch (x) {
        console.log(MEDIA_TAG[type]);
        return {};
    }
}

export const extType = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (IMAGE_EXT.includes(extName)) {
        return {
            type: 'image',
            ext: extName,
        };
    } else if (ZIP_EXT.includes(extName)) {
        if (name.match(/\.book\.(zip|7z|rar)$/)) {
            return {
                type: 'zipbook',
                ext: extName,
            };
        } else if (extName === 'cbr' || extName === 'cbz') {
            return {
                type: 'zipbook',
                ext: extName,
            };
        } else {
            if (extName === '001') {
                if (name.match(/\.zip\.001$/)) {
                    return {
                        type: 'zip',
                        ext: 'zip',
                    };
                } else if (name.match(/\.7z\.001$/)) {
                    return {
                        type: 'zip',
                        ext: '7z',
                    };
                } else {
                    return false;
                }
            } else {
                return {
                    type: 'zip',
                    ext: extName,
                };
            }
        }
    } else if (VIDEO_EXT.includes(extName)) {
        return {
            type: 'video',
            ext: extName,
        };
    } else if (MUSIC_EXT.includes(extName)) {
        return {
            type: 'music',
            ext: extName,
        };
    } else if (DOC_EXT.doc.includes(extName)) {
        return {
            type: 'doc',
            ext: extName,
        };
    } else if (DOC_EXT.present.includes(extName)) {
        return {
            type: 'present',
            ext: extName,
        };
    } else if (DOC_EXT.sheet.includes(extName)) {
        return {
            type: 'sheet',
            ext: extName,
        };
    } else if (DOC_EXT.pdf.includes(extName)) {
        return {
            type: 'pdf',
            ext: extName,
        };
    } else if (RAW_DOC_EXT.includes(extName)) {
        return {
            type: 'rawdoc',
            ext: extName,
        };
    } else {
        return false;
    }
}

export const isVideo = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
         extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return VIDEO_EXT.includes(extName) ? extName : false;
}

export const isImage = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return IMAGE_EXT.includes(extName) ? extName : false;
}

export const isMusic = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return MUSIC_EXT.includes(extName) ? extName :  false;
}

export const isTorrent = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return TORRENT_EXT.includes(extName) ? extName : false;
}

export const isZip = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (ZIP_EXT.includes(extName)) {
        if (extName === '001') {
            if (name.match(/zip\.001$/)) {
                return 'zip';
            } else if (name.match(/7z\.001$/)) {
                return '7z';
            }
        } else {
            return extName;
        }
    } else {
        return false;
    }
}

export const isZipbook = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (ZIP_EXT.includes(extName)) {
        return (name.match(/\.book\.(zip|7z|rar)$/) || extName === 'cbr' || extName === 'cbz') ? extName : false;
    } else {
        return false;
    }
}

export const isDoc = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    if (DOC_EXT.doc.includes(extName)) {
        return {type: 'doc', ext: extName};
    } else if (DOC_EXT.present.includes(extName)) {
        return {type: 'present', ext: extName};
    } else if (DOC_EXT.sheet.includes(extName)) {
        return {type: 'sheet', ext: extName};
    } else if (DOC_EXT.pdf.includes(extName)) {
        return {type: 'pdf', ext: extName};
    } else if (DOC_EXT.rawdoc.includes(extName)) {
        return {type: 'rawdoc', ext: extName};
    } else {
        return false;
    }
}

export const isSub = name => {
    const result = name.match(EXT_FILENAME);
    let extName = '';
    if (result && result[1]) {
        extName = result[1].toLowerCase();
    } else {
        return false;
    }
    return SUB_EXT.includes(extName) ? extName : false;
}

export const mediaMIME = name => {
    const result = name.match(EXT_FILENAME);
    const extName = (result && result[1]) ? result[1].toLowerCase() : '';
    return MIME_EXT[extName] ? MIME_EXT[extName] : false;
}

export function supplyTag(tags, retTags, otherTags=[]) {
    if (tags.includes('18+')) {
        return [...retTags, ...ADULT_LIST.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))];
    } else if (tags.includes('game') || tags.includes('遊戲')) {
        return [...retTags, ...GAME_LIST_CH.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))];
    } else if (tags.includes('audio') || tags.includes('音頻')) {
        return [...retTags, ...MUSIC_LIST.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))];
    } else {
        return [...retTags, ...GENRE_LIST_CH.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))];
    }
}

export const changeExt = (str, ext) => str.replace(EXT_FILENAME, a => `.${ext}`);
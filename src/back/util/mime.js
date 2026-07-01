import { GENRE_LIST_CH, MEDIA_LIST_CH, MUSIC_LIST, ADULT_LIST, GAME_LIST_CH, EXT_FILENAME, MEDIA_TAG, IMAGE_EXT, ZIP_EXT, VIDEO_EXT, MUSIC_EXT, DOC_EXT, MIME_EXT, TORRENT_EXT, SUB_EXT, KINDLE_EXT } from '../constants.js'
import createLogger from './logger.js'

const log = createLogger('mime')

/**
 * Return all selectable media-related tags.
 */
export const getOptionTag = () => [
    ...MEDIA_LIST_CH,
    ...GENRE_LIST_CH,
    ...GAME_LIST_CH,
    ...MUSIC_LIST,
    ...ADULT_LIST,
]

/**
 * Insert a postfix before the file extension.
 */
export const addPost = (str, post) => {
    const result = str.match(EXT_FILENAME)
    return (result && result[1]) ? str.replace(EXT_FILENAME, () => `(${post}).${result[1].toLowerCase()}`) : `${str}(${post})`
}

/**
 * Clone the tag metadata for a media type.
 */
export const extTag = type => {
    try {
        return JSON.parse(JSON.stringify(MEDIA_TAG[type]))
    } catch (x) {
        log.warn({ type }, 'failed to clone MEDIA_TAG entry')
        return {}
    }
}

/**
 * Detect the normalized media type for a filename.
 */
export const extType = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    if (IMAGE_EXT.includes(extName)) {
        return {
            type: 'image',
            ext: extName,
        }
    } else if (ZIP_EXT.includes(extName)) {
        if (name.match(/\.book\.(zip|7z|rar)$/i)) {
            return {
                type: 'zipbook',
                ext: extName,
            }
        } else if (extName === 'cbr' || extName === 'cbz') {
            return {
                type: 'zipbook',
                ext: extName,
            }
        } else {
            if (extName === '001') {
                if (name.match(/\.zip\.001$/i)) {
                    return {
                        type: 'zip',
                        ext: 'zip',
                    }
                } else if (name.match(/\.7z\.001$/i)) {
                    return {
                        type: 'zip',
                        ext: '7z',
                    }
                } else {
                    return false
                }
            } else {
                return {
                    type: 'zip',
                    ext: extName,
                }
            }
        }
    } else if (VIDEO_EXT.includes(extName)) {
        return {
            type: 'video',
            ext: extName,
        }
    } else if (MUSIC_EXT.includes(extName)) {
        return {
            type: 'music',
            ext: extName,
        }
    } else if (DOC_EXT.doc.includes(extName)) {
        return {
            type: 'doc',
            ext: extName,
        }
    } else if (DOC_EXT.present.includes(extName)) {
        return {
            type: 'present',
            ext: extName,
        }
    } else if (DOC_EXT.sheet.includes(extName)) {
        return {
            type: 'sheet',
            ext: extName,
        }
    } else if (DOC_EXT.pdf.includes(extName)) {
        return {
            type: 'pdf',
            ext: extName,
        }
    } else if (DOC_EXT.rawdoc.includes(extName)) {
        return {
            type: 'rawdoc',
            ext: extName,
        }
    } else {
        return false
    }
}

/**
 * Return the video extension when applicable.
 */
export const isVideo = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
         extName = result[1].toLowerCase()
    } else {
        return false
    }
    return VIDEO_EXT.includes(extName) ? extName : false
}

/**
 * Return the image extension when applicable.
 */
export const isImage = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return IMAGE_EXT.includes(extName) ? extName : false
}

/**
 * Return the music extension when applicable.
 */
export const isMusic = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return MUSIC_EXT.includes(extName) ? extName : false
}

/**
 * Return the torrent extension when applicable.
 */
export const isTorrent = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return TORRENT_EXT.includes(extName) ? extName : false
}

/**
 * Return the archive extension when applicable.
 */
export const isZip = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    if (ZIP_EXT.includes(extName)) {
        if (extName === '001') {
            if (name.match(/zip\.001$/i)) {
                return 'zip'
            } else if (name.match(/7z\.001$/i)) {
                return '7z'
            } else {
                return false
            }
        } else {
            return extName
        }
    } else {
        return false
    }
}

/**
 * Return the comic/archive extension when applicable.
 */
export const isZipbook = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    if (ZIP_EXT.includes(extName)) {
        return (name.match(/\.book\.(zip|7z|rar)$/i) || extName === 'cbr' || extName === 'cbz') ? extName : false
    } else {
        return false
    }
}

/**
 * Return the document category when applicable.
 */
export const isDoc = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    if (DOC_EXT.doc.includes(extName)) {
        return { type: 'doc', ext: extName }
    } else if (DOC_EXT.present.includes(extName)) {
        return { type: 'present', ext: extName }
    } else if (DOC_EXT.sheet.includes(extName)) {
        return { type: 'sheet', ext: extName }
    } else if (DOC_EXT.pdf.includes(extName)) {
        return { type: 'pdf', ext: extName }
    } else if (DOC_EXT.rawdoc.includes(extName)) {
        return { type: 'rawdoc', ext: extName }
    } else {
        return false
    }
}

/**
 * Return the subtitle extension when applicable.
 */
export const isSub = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return SUB_EXT.includes(extName) ? extName : false
}

/**
 * Return the Kindle extension when applicable.
 */
export const isKindle = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return KINDLE_EXT.includes(extName) ? extName : (extName.match(/^azw\d$/) ? extName : false)
}

/**
 * Return the CSV extension when applicable.
 */
export const isCSV = name => {
    const result = name.match(EXT_FILENAME)
    let extName = ''
    if (result && result[1]) {
        extName = result[1].toLowerCase()
    } else {
        return false
    }
    return extName === 'csv' ? extName : false
}

/**
 * Return the MIME type for a filename.
 */
export const mediaMIME = name => {
    const result = name.match(EXT_FILENAME)
    const extName = (result && result[1]) ? result[1].toLowerCase() : ''
    return MIME_EXT[extName] ? MIME_EXT[extName] : false
}

/**
 * Supply missing related tags based on the current tag set.
 */
export function supplyTag(tags, retTags, otherTags = []) {
    if (tags.includes('18+')) {
        return [...retTags, ...ADULT_LIST.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))]
    } else if (tags.includes('game') || tags.includes('遊戲')) {
        return [...retTags, ...GAME_LIST_CH.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))]
    } else if (tags.includes('audio') || tags.includes('音頻')) {
        return [...retTags, ...MUSIC_LIST.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))]
    } else {
        return [...retTags, ...GENRE_LIST_CH.filter(i => (!tags.includes(i) && !retTags.includes(i) && !otherTags.includes(i)))]
    }
}

/**
 * Replace the current file extension.
 */
export const changeExt = (str, ext) => str.replace(EXT_FILENAME, () => `.${ext}`)

/**
 * Split a filename into basename and extension.
 */
export const getExtname = name => {
    const result = name.match(EXT_FILENAME)
    const extName = (result && result[0]) ? result[0].toLowerCase() : ''
    const frontName = name.substr(0, name.length - extName.length)
    return {
        front: frontName,
        ext: extName,
    }
}

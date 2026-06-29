import Child_process from 'child_process'
import fsModule from 'fs'
const { createReadStream, createWriteStream } = fsModule

/**
 * Safe wrapper around execFile — avoids shell injection by passing arguments as an array.
 * Returns a Promise that resolves with stdout string.
 * For commands needing a child process handle (e.g., to store in a pool for cancellation),
 * use execFileWithHandle which returns { promise, chp }.
 */
export function execSafe(cmd, args, options = {}) {
    return new Promise((resolve, reject) => {
        Child_process.execFile(cmd, args, options, (err, stdout) => {
            if (err) {
                if (options.allowExitCode && options.allowExitCode.includes(err.code)) {
                    return resolve(stdout);
                }
                return reject(err);
            }
            resolve(stdout);
        });
    });
}

/**
 * Like execSafe but also returns the child process handle.
 * Returns { chp, promise }.
 */
export function execFileWithHandle(cmd, args, options = {}) {
    let chp;
    const promise = new Promise((resolve, reject) => {
        chp = Child_process.execFile(cmd, args, options, (err, stdout) => {
            if (err) {
                if (options.allowExitCode && options.allowExitCode.includes(err.code)) {
                    return resolve(stdout);
                }
                return reject(err);
            }
            resolve(stdout);
        });
    });
    return { chp, promise };
}

/**
 * Concatenate multiple files into a destination using streams (replaces shell `cat a b >> dest`).
 * Returns a Promise.
 */
export function concatFiles(srcPaths, destPath) {
    return new Promise((resolve, reject) => {
        const out = createWriteStream(destPath, { flags: 'a' });
        out.on('error', reject);

        let idx = 0;
        const pipeNext = () => {
            if (idx >= srcPaths.length) {
                out.end();
                return resolve();
            }
            const rs = createReadStream(srcPaths[idx]);
            rs.on('error', reject);
            rs.pipe(out, { end: false });
            rs.on('end', () => {
                idx++;
                pipeNext();
            });
        };
        pipeNext();
    });
}

/**
 * Append a file's contents to another file (replaces shell `cat src >> dest`).
 * Returns a Promise.
 */
export function appendFile(srcPath, destPath) {
    return concatFiles([srcPath], destPath);
}

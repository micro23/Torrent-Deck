import fs from 'fs'

export function sameFileVersion(first: fs.Stats, second: fs.Stats) {
    return first.dev === second.dev && first.ino === second.ino && first.size === second.size
        && first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs
}

// Check the opened descriptor as well as the path. A watcher can see a file
// replaced after stat(), including by a special file that would block open().
export async function readFileVersion(filePath: string, expected: fs.Stats): Promise<Buffer | undefined> {
    const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK)
    try {
        const opened = await handle.stat()
        if (!opened.isFile() || !sameFileVersion(opened, expected)) return
        const data = await handle.readFile()
        if (data.length === expected.size && sameFileVersion(expected, await fs.promises.stat(filePath))) {
            return data
        }
    } finally {
        await handle.close()
    }
}

import '/libs/jszip.min.js'

const cachePrefix = 'crxInstallerIcon:'
const maxIconBytes = 256 * 1024
const maxArchiveBytes = 32 * 1024 * 1024
const pending = new Map()
const failedUntil = new Map()
const queue = []
let activeDownloads = 0

function preferredSize(a, b, target) {
    const x = Number(a.size) || 0
    const y = Number(b.size) || 0
    if ((x >= target) !== (y >= target)) return x >= target ? -1 : 1
    return x >= target ? x - y : y - x
}

export function browserIconURLs(extension, target = 32) {
    return [...new Set([...(extension.icons || [])]
        .filter(icon => typeof icon.url === 'string' && /^(?:moz-extension:|chrome-extension:|https?:|blob:|data:image\/)/i.test(icon.url))
        .sort((a, b) => preferredSize(a, b, target))
        .map(icon => icon.url))]
}

function manifestIconPaths(manifest) {
    const paths = []
    for (const icons of [manifest.icons, manifest.action?.default_icon, manifest.browser_action?.default_icon, manifest.page_action?.default_icon]) {
        if (typeof icons === 'string') paths.push(icons)
        else if (icons && typeof icons === 'object') {
            paths.push(...Object.entries(icons).map(([size, path]) => ({size, path}))
                .sort((a, b) => preferredSize(a, b, 64)).map(icon => icon.path))
        }
    }
    return [...new Set(paths.filter(path => typeof path === 'string'))]
}

export async function readArchiveIcon(archive, manifest) {
    const types = {png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif'}
    for (const originalPath of manifestIconPaths(manifest)) {
        if (/^[a-z][a-z\d+.-]*:/i.test(originalPath)) continue
        const parts = []
        for (const part of originalPath.replace(/\\/g, '/').split('/')) {
            if (!part || part === '.') continue
            if (part === '..') parts.pop()
            else parts.push(part)
        }
        const path = parts.join('/')
        const type = types[path.split('.').pop()?.toLowerCase()]
        const entry = archive.file(path)
        if (!type || !entry || entry.dir) continue
        try {
            const encoded = await entry.async('base64')
            if (encoded.length && encoded.length <= Math.ceil(maxIconBytes / 3) * 4) return `data:${type};base64,${encoded}`
        } catch {
            // Try the next declared size if this file is missing or unreadable.
        }
    }
    return null
}

async function saveIcon(id, version, dataURL) {
    if (!dataURL) return
    try {
        await chrome.storage.local.set({[cachePrefix + id]: {version, dataURL}})
    } catch {
        // A full or unavailable cache must not block installation or rendering.
    }
}

export async function cacheArchiveIcon(archive) {
    try {
        const manifest = JSON.parse(await archive.file('manifest.json').async('text'))
        const id = manifest.browser_specific_settings?.gecko?.id
        if (id) await saveIcon(id, manifest.version, await readArchiveIcon(archive, manifest))
    } catch {
        // Icon extraction is optional; the normal package validation remains authoritative.
    }
}

function scheduleDownload(task) {
    return new Promise((resolve, reject) => {
        queue.push({task, resolve, reject})
        drainQueue()
    })
}

function drainQueue() {
    while (activeDownloads < 2 && queue.length) {
        const {task, resolve, reject} = queue.shift()
        activeDownloads++
        Promise.resolve().then(task).then(resolve, reject).finally(() => {
            activeDownloads--
            drainQueue()
        })
    }
}

async function downloadStoreIcon(id) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    try {
        const response = await fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140&acceptformat=crx3&x=id%3D${encodeURIComponent(id)}%26installsource%3Dondemand%26uc`, {signal: controller.signal})
        if (!response.ok) throw new Error('Icon package request failed')
        if (Number(response.headers.get('content-length')) > maxArchiveBytes) throw new Error('Icon package exceeds size limit')
        const reader = response.body?.getReader()
        if (!reader) throw new Error('Streaming response unavailable')
        const chunks = []
        let size = 0
        try {
            while (true) {
                const {done, value} = await reader.read()
                if (done) break
                size += value.byteLength
                if (size > maxArchiveBytes) throw new Error('Icon package exceeds size limit')
                chunks.push(value)
            }
        } catch (error) {
            await reader.cancel().catch(() => {})
            throw error
        } finally {
            reader.releaseLock()
        }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        const archive = await new JSZip().loadAsync(bytes)
        const manifest = JSON.parse(await archive.file('manifest.json').async('text'))
        return await readArchiveIcon(archive, manifest)
    } finally {
        controller.abort()
        clearTimeout(timeout)
    }
}

export async function resolveExtensionIcon(extension) {
    try {
        const result = await chrome.storage.local.get([cachePrefix + extension.id])
        const cached = result[cachePrefix + extension.id]
        if (cached?.version === extension.version && typeof cached.dataURL === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(cached.dataURL)) return cached.dataURL
    } catch {
        // Continue without a persistent cache.
    }
    const storeId = extension.id.match(/^([a-p]{32})@CWS_CRXInstaller$/)?.[1]
    if (!storeId) return null
    const key = `${extension.id}:${extension.version}`
    if ((failedUntil.get(key) || 0) > Date.now()) return null
    if (!pending.has(key)) {
        const operation = scheduleDownload(async () => {
            try {
                const dataURL = await downloadStoreIcon(storeId)
                if (dataURL) await saveIcon(extension.id, extension.version, dataURL)
                else failedUntil.set(key, Date.now() + 300000)
                return dataURL
            } catch {
                failedUntil.set(key, Date.now() + 300000)
                return null
            }
        }).finally(() => pending.delete(key))
        pending.set(key, operation)
    }
    return pending.get(key)
}

export function showExtensionIcon(extension, image, fallback, target = 32) {
    const urls = browserIconURLs(extension, target)
    let index = 0
    let usedCache = false
    image.hidden = true
    fallback.hidden = false
    image.referrerPolicy = 'no-referrer'
    const isAttached = () => image.isConnected
    async function tryNext() {
        if (!isAttached()) return
        image.hidden = true
        fallback.hidden = false
        if (index < urls.length) {
            image.src = urls[index++]
        } else if (!usedCache) {
            usedCache = true
            const cached = await resolveExtensionIcon(extension)
            if (cached && isAttached()) image.src = cached
        }
    }
    image.addEventListener('load', () => { image.hidden = false; fallback.hidden = true })
    image.addEventListener('error', tryNext)
    // Begin after the card has been attached, so removed cards cannot start fallback work.
    queueMicrotask(() => { if (isAttached()) tryNext() })
}

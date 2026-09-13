import {patchExt} from '/patchExt.js'

export const storeIdFor = id => id.match(/^([a-p]{32})@CWS_CRXInstaller$/)?.[1]

export function compareVersions(left, right) {
    const parse = value => /^\d+(?:\.\d+){0,3}$/.test(value) ? value.split('.').map(Number) : null
    const a = parse(left)
    const b = parse(right)
    if (!a || !b) return null
    for (let i = 0; i < 4; i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1
    }
    return 0
}

export async function queryStoreVersion(extensionId, signal) {
    const id = storeIdFor(extensionId)
    if (!id) return null
    const response = await fetch(`https://clients2.google.com/service/update2/crx?prodversion=140&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`, {signal})
    if (!response.ok) throw new Error(`Version check failed (HTTP ${response.status})`)
    const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
    const version = xml.querySelector('updatecheck')?.getAttribute('version')
    if (!version || compareVersions(version, version) === null) throw new Error('The Web Store did not return a version')
    return version
}

export async function prepareStoreUpdate(extension, signal) {
    const id = storeIdFor(extension.id)
    if (!id) throw new Error('This extension must be updated from a file')
    const response = await fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`, {signal})
    if (!response.ok) throw new Error(`Update download failed (HTTP ${response.status})`)
    const limit = 64 * 1024 * 1024
    if (Number(response.headers.get('content-length')) > limit) throw new Error('Update exceeds the automatic 64 MB download limit; update manually')
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Update streaming is unavailable')
    const chunks = []
    let size = 0
    try {
        while (true) {
            const {done, value} = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > limit) throw new Error('Update exceeds the automatic 64 MB download limit; update manually')
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
    if (signal.aborted) throw new Error('Update preparation stopped')
    const xpi = await patchExt(bytes, id, 'CWS')
    const zip = await new JSZip().loadAsync(xpi)
    const manifest = JSON.parse(await zip.file('manifest.json').async('text'))
    if (manifest.browser_specific_settings?.gecko?.id !== extension.id) throw new Error('Update identity does not match the installed extension')
    if (compareVersions(manifest.version, extension.version) !== 1) throw new Error('The downloaded package is not newer than the installed extension')
    if (xpi.byteLength > limit) throw new Error('Converted update exceeds the automatic 64 MB limit; update manually')
    if (signal.aborted) throw new Error('Update preparation stopped')
    return {id: extension.id, version: manifest.version, blob: new Blob([xpi], {type: 'application/x-xpinstall'}), createdAt: Date.now()}
}

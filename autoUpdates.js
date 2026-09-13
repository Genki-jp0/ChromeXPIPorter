import {normalizeUpdateInterval} from '/updatePreferences.js'
import {storeIdFor, compareVersions, queryStoreVersion, prepareStoreUpdate} from '/updateService.js'
import {getPreparedUpdate, savePreparedUpdate, deletePreparedUpdate, listPreparedUpdateIds} from '/updateStore.js'

const alarmName = 'crx-installer-auto-updates'
const stateKey = 'extensionUpdateState'
let running = null
let controller = null
let automaticRun = false
let configuring = Promise.resolve()

async function isEnabled() {
    return (await chrome.storage.local.get(['autoUpdateExtensions'])).autoUpdateExtensions !== false
}

async function publish(state) {
    await chrome.storage.local.set({[stateKey]: state})
    const count = state.updates.filter(update => update.status === 'ready').length
    await chrome.action.setBadgeText({text: count ? String(count) : ''})
    await chrome.action.setBadgeBackgroundColor({color: '#0060df'})
    await chrome.action.setTitle({title: count ? `CRX Installer — ${count} update${count === 1 ? '' : 's'} ready to install` : 'CRX Installer'})
}

async function bounded(task, milliseconds) {
    controller = new AbortController()
    const current = controller
    const timer = setTimeout(() => current.abort(), milliseconds)
    try {
        return await task(current.signal)
    } finally {
        clearTimeout(timer)
        if (controller === current) controller = null
    }
}

export function configureAutoUpdates() {
    configuring = configuring.catch(() => {}).then(applyAutoUpdateSchedule)
    return configuring
}

async function applyAutoUpdateSchedule() {
    const settings = await chrome.storage.local.get(['autoUpdateExtensions', 'autoUpdateIntervalMinutes'])
    if (settings.autoUpdateExtensions !== false) {
        const interval = normalizeUpdateInterval(settings.autoUpdateIntervalMinutes)
        const alarm = await chrome.alarms.get(alarmName)
        if (!alarm || alarm.periodInMinutes !== interval) {
            await chrome.alarms.create(alarmName, {delayInMinutes: alarm ? interval : 1, periodInMinutes: interval})
        }
    } else {
        await chrome.alarms.clear(alarmName)
        if (automaticRun) controller?.abort()
    }
}

export function runUpdateCheck(manual = false) {
    if (running) return running
    running = checkUpdates(manual).finally(() => { running = null; automaticRun = false })
    return running
}

async function checkUpdates(manual) {
    if (!manual && !await isEnabled()) return
    automaticRun = !manual
    const previous = (await chrome.storage.local.get([stateKey]))[stateKey]
    const state = {checking: true, lastChecked: previous?.lastChecked || null, error: '', updates: previous?.updates || []}
    await publish(state)
    try {
        const all = await chrome.management.getAll()
        const installed = new Map(all.filter(ext => storeIdFor(ext.id)).map(ext => [ext.id, ext]))
        const cached = new Map()
        // A completed update or uninstall makes its old staged package unnecessary.
        for (const id of await listPreparedUpdateIds()) {
            const record = await getPreparedUpdate(id)
            const extension = installed.get(id)
            if (!record || !extension || compareVersions(record.version, extension.version) !== 1) await deletePreparedUpdate(id)
            else cached.set(id, record)
        }
        state.updates = []
        for (const [id, record] of cached) {
            const ext = installed.get(id)
            state.updates.push({id, name: ext.name, installedVersion: ext.version, version: record.version, status: 'ready', error: ''})
        }
        await publish(state)
        let stagedBytes = [...cached.values()].reduce((sum, record) => sum + record.blob.size, 0)
        for (const ext of installed.values()) {
            if (!manual && !await isEnabled()) break
            let item = state.updates.find(update => update.id === ext.id)
            try {
                const latest = await bounded(signal => queryStoreVersion(ext.id, signal), 20000)
                if (compareVersions(latest, ext.version) !== 1) continue
                if (item && compareVersions(item.version, latest) >= 0) continue
                if (!item) {
                    item = {id: ext.id, name: ext.name, installedVersion: ext.version, version: latest, status: 'available', error: ''}
                    state.updates.push(item)
                }
                const existing = cached.get(ext.id)
                // Keep the previously prepared update installable while fetching a newer release.
                if (!existing) item.status = 'preparing'
                await publish(state)
                if (!manual && !await isEnabled()) break
                const record = await bounded(signal => prepareStoreUpdate(ext, signal), 120000)
                if (!manual && !await isEnabled()) break
                const current = (await chrome.management.getAll()).find(candidate => candidate.id === ext.id)
                if (!current || compareVersions(record.version, current.version) !== 1) continue
                const nextSize = stagedBytes - (existing?.blob.size || 0) + record.blob.size
                if (nextSize > 256 * 1024 * 1024) throw new Error('Prepared updates use the 256 MB cache limit; install the ready updates first')
                await savePreparedUpdate(record)
                stagedBytes = nextSize
                Object.assign(item, {version: record.version, status: 'ready', error: ''})
            } catch (error) {
                if (!manual && !await isEnabled()) break
                if (!item) {
                    item = {id: ext.id, name: ext.name, installedVersion: ext.version, version: null, status: 'error', error: ''}
                    state.updates.push(item)
                }
                if (item.status !== 'ready') item.status = 'error'
                item.error = error.name === 'AbortError' ? 'Update request timed out' : error.message
            }
            await publish(state)
        }
        state.lastChecked = Date.now()
    } catch (error) {
        state.error = error.message || 'Could not check for updates'
    } finally {
        state.checking = false
        for (const item of state.updates) {
            if (item.status === 'preparing') { item.status = 'available'; item.error = 'Preparation stopped; check again to retry' }
        }
        await publish(state)
    }
    return state
}

async function reconcileUpdates() {
    if (running) { await running; return reconcileUpdates() }
    const state = (await chrome.storage.local.get([stateKey]))[stateKey]
    if (!state) return
    const all = await chrome.management.getAll()
    const kept = []
    for (const item of state.updates) {
        const ext = all.find(ext => ext.id === item.id)
        if (!ext || (item.version && compareVersions(item.version, ext.version) !== 1)) await deletePreparedUpdate(item.id)
        else kept.push(item)
    }
    state.updates = kept
    state.checking = false
    await publish(state)
}

const report = error => console.error('Automatic extension updates:', error)
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === alarmName) runUpdateCheck().catch(report) })
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.autoUpdateExtensions || changes.autoUpdateIntervalMinutes)) configureAutoUpdates().catch(report)
})
for (const event of [chrome.management.onInstalled, chrome.management.onUninstalled]) event.addListener(() => reconcileUpdates().catch(report))
chrome.runtime.onStartup.addListener(() => {
    configureAutoUpdates().then(() => runUpdateCheck()).catch(report)
})
chrome.runtime.onInstalled.addListener(() => configureAutoUpdates().catch(report))
configureAutoUpdates().then(reconcileUpdates).catch(report)

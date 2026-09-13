import {normalizeUpdateInterval, validUpdateInterval, MAX_UPDATE_INTERVAL} from '/updatePreferences.js'
import {patchExt} from "/patchExt.js"
import {showExtensionIcon} from "/extensionIcons.js"
import {getPreparedUpdate} from "/updateStore.js"
import {compareVersions} from "/updateService.js"

const fileInput = document.getElementById('file')
const settingsCheckbox = document.getElementById('downloadWithoutInstalling')
const installedBody = document.getElementById('installed')
const refreshButton = document.getElementById('refresh')
let listGeneration = 0
let extensionRows = []
let updateState = null
let savedUpdateInterval = 360
const intervalValue = document.getElementById('update-interval-value')
const intervalUnit = document.getElementById('update-interval-unit')
const intervalSave = document.getElementById('save-update-interval')

function displayUpdateInterval(minutes) {
    savedUpdateInterval = normalizeUpdateInterval(minutes)
    const unit = savedUpdateInterval % 1440 === 0 ? 1440 : savedUpdateInterval % 60 === 0 ? 60 : 1
    intervalUnit.value = String(unit)
    intervalValue.value = String(savedUpdateInterval / unit)
    intervalValue.max = String(MAX_UPDATE_INTERVAL / unit)
}

function intervalBusy(busy) {
    for (const control of [intervalValue, intervalUnit, intervalSave]) control.disabled = busy
}
intervalUnit.addEventListener('change', () => {
    intervalValue.max = String(MAX_UPDATE_INTERVAL / Number(intervalUnit.value))
})
document.getElementById('update-interval-form').addEventListener('submit', async event => {
    event.preventDefault()
    const amount = Number(intervalValue.value)
    const unit = Number(intervalUnit.value)
    const minutes = amount * unit
    if (!Number.isInteger(amount) || ![1, 60, 1440].includes(unit) || !validUpdateInterval(minutes)) {
        status('update-interval-status', 'Enter a whole-number interval between 1 minute and 30 days.', true)
        return
    }
    intervalBusy(true)
    try {
        await chrome.storage.local.set({autoUpdateIntervalMinutes: minutes})
    } catch {
        displayUpdateInterval(savedUpdateInterval)
        intervalBusy(false)
        status('update-interval-status', 'Could not save the interval. The previous value has been restored.', true)
        return
    }
    displayUpdateInterval(minutes)
    try {
        const response = await chrome.runtime.sendMessage({type: 'UPDATES_CONFIGURE'})
        if (!response?.ok) throw new Error('Scheduler unavailable')
        const label = unit === 1440 ? 'day' : unit === 60 ? 'hour' : 'minute'
        status('update-interval-status', `Saved: every ${amount} ${label}${amount === 1 ? '' : 's'}.${autoUpdateCheckbox.checked ? '' : ' Automatic checks are currently disabled.'}`)
    } catch {
        status('update-interval-status', 'Interval saved, but the scheduler could not be confirmed. Reload the extension to retry.', true)
    } finally {
        intervalBusy(false)
    }
})
const autoUpdateCheckbox = document.getElementById("autoUpdateExtensions")
const searchInput = document.getElementById('search-addons')
const enabledList = document.getElementById('enabled-list')
const disabledList = document.getElementById('disabled-list')
const fileButtons = ['empty-install', 'settings-install'].map(id => document.getElementById(id))

function closeMenus(except = null) {
    document.querySelectorAll('.options-menu[open]').forEach(menu => {
        if (menu !== except) menu.open = false
    })
}

document.addEventListener('click', event => closeMenus(event.target.closest('.options-menu')))
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    const menu = event.target.closest('.options-menu[open]')
    closeMenus()
    menu?.querySelector('summary').focus()
})

function showView() {
    const requested = location.hash.slice(1)
    const view = ['extensions', 'settings', 'help'].includes(requested) ? requested : 'extensions'
    document.querySelectorAll('[data-page]').forEach(page => { page.hidden = page.dataset.page !== view })
    document.querySelectorAll('[data-view]').forEach(link => {
        if (link.dataset.view === view) link.setAttribute('aria-current', 'page')
        else link.removeAttribute('aria-current')
    })
    const title = {extensions: 'Manage Your Extensions', settings: 'CRX Installer Settings', help: 'Add-ons Support'}[view]
    document.getElementById('page-title').textContent = title
    document.title = `${title} — CRX Installer`
    searchInput.disabled = view !== 'extensions'
    searchInput.closest('.main-search').dataset.inactive = String(view !== 'extensions')
    closeMenus()
}
window.addEventListener('hashchange', showView)

function filterExtensions() {
    const query = searchInput.value.trim().toLocaleLowerCase()
    let enabled = 0
    let disabled = 0
    for (const item of extensionRows) {
        const haystack = `${item.ext.name} ${item.ext.description || ''} ${item.ext.id} ${item.source}`.toLocaleLowerCase()
        item.card.hidden = !haystack.includes(query)
        if (!item.card.hidden) item.ext.enabled === false ? disabled++ : enabled++
    }
    document.getElementById('enabled-section').hidden = enabled === 0
    document.getElementById('disabled-section').hidden = disabled === 0
    document.getElementById('no-results').hidden = !extensionRows.length || enabled + disabled !== 0
}
searchInput.addEventListener('input', filterExtensions)

for (const button of fileButtons) button.addEventListener('click', () => {
    if (!fileInput.disabled) fileInput.click()
})

function applyUpdateState() {
    for (const row of extensionRows) {
        const item = updateState?.updates?.find(update => update.id === row.ext.id)
        const ready = item?.status === 'ready' && compareVersions(item.version, row.ext.version) === 1
        row.preparedButton.hidden = !ready
        if (ready) {
            row.preparedButton.textContent = `Install Update ${item.version}`
            row.preparedButton.setAttribute('aria-label', `Install update ${item.version} for ${row.ext.name}`)
        }
        row.updateNote.textContent = item?.error || (item?.status === 'preparing' ? 'Preparing update…' : ready ? 'Update ready. Confirm installation in Firefox.' : '')
        row.updateNote.dataset.tone = item?.error ? 'error' : 'normal'
        row.updateNote.hidden = !row.updateNote.textContent
    }
    if (!updateState) return
    const ready = updateState.updates.filter(item => item.status === 'ready').length
    const errors = updateState.updates.filter(item => item.error).length
    const time = updateState.lastChecked ? new Date(updateState.lastChecked).toLocaleString() : 'Not checked yet'
    const message = updateState.checking ? `Checking and preparing extension updates…${ready ? ` ${ready} ready to install.` : ''}`
        : updateState.error ? `Update check failed: ${updateState.error}`
        : `${ready ? `${ready} update${ready === 1 ? '' : 's'} ready to install.` : 'No prepared updates.'} Last checked: ${time}.${errors ? ` ${errors} extension check${errors === 1 ? '' : 's'} need attention.` : ''}`
    status('auto-update-summary', message, Boolean(updateState.error))
    document.getElementById('check-updates-now').disabled = updateState.checking
}

async function loadUpdateState() {
    try {
        const result = await chrome.storage.local.get(['extensionUpdateState', 'autoUpdateExtensions', 'autoUpdateIntervalMinutes'])
        updateState = result.extensionUpdateState || null
        autoUpdateCheckbox.checked = result.autoUpdateExtensions !== false
        autoUpdateCheckbox.disabled = false
        displayUpdateInterval(result.autoUpdateIntervalMinutes)
        intervalBusy(false)
        applyUpdateState()
    } catch {
        status('auto-update-setting-status', 'Could not load update preferences. Reload to retry.', true)
    }
}

autoUpdateCheckbox.addEventListener('change', async () => {
    const value = autoUpdateCheckbox.checked
    autoUpdateCheckbox.disabled = true
    try {
        await chrome.storage.local.set({autoUpdateExtensions: value})
    } catch {
        autoUpdateCheckbox.checked = !value
        autoUpdateCheckbox.disabled = false
        status('auto-update-setting-status', 'Could not save the update preference.', true)
        return
    }
    try {
        const response = await chrome.runtime.sendMessage({type: 'UPDATES_CONFIGURE'})
        if (!response?.ok) throw new Error(response?.error || 'Background updates unavailable')
        status('auto-update-setting-status', value ? 'Automatic checks enabled.' : 'Automatic checks disabled. Prepared updates remain available.')
    } catch {
        status('auto-update-setting-status', 'Preference saved, but the scheduler could not be confirmed. Reload the extension to retry.', true)
    } finally {
        autoUpdateCheckbox.disabled = false
    }
})

async function checkUpdatesNow() {
    closeMenus()
    try {
        const response = await chrome.runtime.sendMessage({type: 'UPDATES_RUN'})
        if (!response?.ok) throw new Error('Background updates unavailable')
        status('action-status', 'Checking for updates in the background…')
    } catch {
        status('action-status', 'Could not start an update check. Reload the extension and try again.', true)
    }
}
document.getElementById('check-updates-now').addEventListener('click', checkUpdatesNow)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes.extensionUpdateState) { updateState = changes.extensionUpdateState.newValue; applyUpdateState() }
    if (changes.autoUpdateIntervalMinutes) displayUpdateInterval(changes.autoUpdateIntervalMinutes.newValue)
    if (changes.autoUpdateExtensions) autoUpdateCheckbox.checked = changes.autoUpdateExtensions.newValue !== false
})

function status(id, message, error = false) {
    const element = document.getElementById(id)
    element.textContent = message
    element.dataset.tone = error ? 'error' : 'normal'
    element.hidden = !message
}

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['downloadWithoutInstalling'])
        settingsCheckbox.checked = Boolean(result.downloadWithoutInstalling)
        settingsCheckbox.disabled = false
    } catch {
        status('setting-status', 'Could not load this preference. Reload the page to retry.', true)
    }
}

settingsCheckbox.addEventListener('change', async () => {
    const requestedValue = settingsCheckbox.checked
    settingsCheckbox.disabled = true
    try {
        await chrome.storage.local.set({downloadWithoutInstalling: requestedValue})
        status('setting-status', 'Preference saved.')
    } catch {
        settingsCheckbox.checked = !requestedValue
        status('setting-status', 'Could not save. Your previous preference is restored.', true)
    } finally {
        settingsCheckbox.disabled = false
    }
})

fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]
    if (!file) return
    fileInput.disabled = true
    fileButtons.forEach(button => { button.disabled = true })
    closeMenus()
    status('file-status', `Preparing ${file.name}…`)
    try {
        const patchedExt = await patchExt(file, null, 'Manual')
        installResult(patchedExt)
        status('file-status', `${file.name} is ready. Complete installation in your browser.`)
    } catch (error) {
        status('file-status', `Could not prepare ${file.name}. Check that it contains a valid extension manifest and try again.`, true)
        console.error('Manual installation failed:', error)
    } finally {
        fileInput.disabled = false
        fileButtons.forEach(button => { button.disabled = false })
        fileInput.value = ''
    }
})

function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

function addButton(container, className, label, ext) {
    const button = element('button', className, label)
    button.type = 'button'
    button.dataset.extId = ext.id
    button.setAttribute('aria-label', `${label} — ${ext.name}`)
    container.append(button)
    return button
}

function renderExtension(ext, index) {
    const source = ext.id.slice(ext.id.lastIndexOf('@') + 1, -'_CRXInstaller'.length) || 'Unknown'
    const card = element('article', 'addon card')
    card.dataset.enabled = String(ext.enabled !== false)
    card.setAttribute('aria-labelledby', `addon-heading-${index}`)
    const collapsed = element('div', 'addon-card-collapsed')
    const fallback = element('span', 'card-heading-icon fallback-icon extension-icon')
    fallback.setAttribute('aria-hidden', 'true')
    collapsed.append(fallback)
    const image = element('img', 'card-heading-icon')
    image.alt = ''
    image.hidden = true
    collapsed.append(image)
    showExtensionIcon(ext, image, fallback, Math.ceil(32 * (window.devicePixelRatio || 1)))
    const contents = element('div', 'card-contents')
    const nameContainer = element('div', 'addon-name-container')
    const heading = element('h3', 'addon-name')
    heading.id = `addon-heading-${index}`
    const nameButton = element('button', 'addon-name-link', ext.name)
    nameButton.type = 'button'
    nameButton.title = `${ext.name} ${ext.version}`
    nameButton.setAttribute('aria-expanded', 'false')
    nameButton.setAttribute('aria-controls', `addon-details-${index}`)
    heading.append(nameButton)
    nameContainer.append(heading)
    const menu = element('details', 'options-menu')
    const summary = element('summary', 'more-options-button')
    const moreIcon = element('span', 'nav-icon more-icon')
    moreIcon.setAttribute('aria-hidden', 'true')
    summary.append(moreIcon)
    summary.setAttribute('aria-label', `More options for ${ext.name}`)
    summary.title = `More options for ${ext.name}`
    menu.append(summary)
    const actions = element('div', 'menu-panel action-buttons')
    const preparedButton = addButton(actions, 'prepared-btn', 'Install Update', ext)
    preparedButton.hidden = true
    let updateButton
    if (source === 'CWS') {
        updateButton = addButton(actions, 'update-btn', 'Reinstall', ext)
        updateButton.dataset.source = source
    } else {
        actions.append(element('span', 'manual-note', 'Use a file to reinstall'))
    }
    addButton(actions, 'uninstall-btn', 'Remove', ext)
    actions.append(element('div', 'menu-separator'))
    const manageButton = element('button', 'manage-btn', 'Manage')
    manageButton.type = 'button'
    manageButton.setAttribute('aria-label', `Manage ${ext.name}`)
    actions.append(manageButton)
    menu.append(actions)
    nameContainer.append(menu)
    contents.append(nameContainer)
    const description = element('p', 'addon-description', ext.description || (source === 'CWS' ? 'Installed from the Chrome Web Store.' : 'Installed from a local extension file.'))
    description.title = description.textContent
    contents.append(description)
    const versionLine = element('p', 'addon-version-line')
    versionLine.append(element('span', '', `Version ${ext.version} · Latest: `))
    const latestCell = element('span', 'latest-version', source === 'CWS' ? 'Checking…' : 'Not available')
    versionLine.append(latestCell)
    contents.append(versionLine)
    const updateNote = element('p', 'addon-update-note')
    updateNote.hidden = true
    contents.append(updateNote)
    collapsed.append(contents)
    card.append(collapsed)
    const details = element('div', 'addon-details')
    details.id = `addon-details-${index}`
    details.hidden = true
    const list = element('dl')
    for (const [label, value] of [['Description', ext.description || 'No description provided.'], ['Version', ext.version], ['Source', source === 'CWS' ? 'Chrome Web Store' : source], ['Extension ID', ext.id]]) {
        const row = element('div', 'addon-detail-row')
        row.append(element('dt', '', label))
        row.append(element('dd', '', value))
        list.append(row)
    }
    details.append(list)
    card.append(details)
    function setExpanded(expanded) {
        details.hidden = !expanded
        nameButton.setAttribute('aria-expanded', String(expanded))
        closeMenus()
    }
    nameButton.addEventListener('click', () => setExpanded(details.hidden))
    manageButton.addEventListener('click', () => { setExpanded(true); nameButton.focus() })
    const targetList = ext.enabled === false ? disabledList : enabledList
    targetList.append(card)
    return {ext, source, card, latestCell, updateButton, preparedButton, updateNote}
}

async function loadExtensions() {
    const generation = ++listGeneration
    refreshButton.disabled = true
    document.getElementById('register').setAttribute('aria-busy', 'true')
    document.getElementById('empty-state').hidden = true
    status('list-status', 'Loading your extensions…')
    try {
        const all = await chrome.management.getAll()
        if (generation !== listGeneration) return
        const extensions = all.filter(ext => ext.id.endsWith('_CRXInstaller')).sort((a, b) => a.name.localeCompare(b.name))
        enabledList.replaceChildren()
        disabledList.replaceChildren()
        document.getElementById('extension-count').textContent = extensions.length
        document.getElementById('empty-state').hidden = extensions.length !== 0
        extensionRows = extensions.map(renderExtension)
        filterExtensions()
        applyUpdateState()
        status('list-status', '')
        // Render the collection before querying remote versions; an offline store must not hide it.
        const pending = extensionRows.filter(row => row.source === 'CWS')
        let next = 0
        const workers = Array.from({length: Math.min(4, pending.length)}, async () => {
            while (next < pending.length && generation === listGeneration) {
                const item = pending[next++]
                let version
                try {
                    version = await queryLatest(item.source, item.ext.id)
                } catch {
                    version = undefined
                }
                if (generation !== listGeneration) return
                item.latestCell.textContent = version || 'Unavailable'
                const needsUpdate = Boolean(version && compareVersions(version, item.ext.version) === 1)
                item.latestCell.classList.toggle('version-outdated', needsUpdate)
                item.updateButton.dataset.update = String(needsUpdate)
                item.updateButton.textContent = needsUpdate ? `Update to ${version}` : 'Reinstall'
                item.updateButton.setAttribute('aria-label', `${item.updateButton.textContent} — ${item.ext.name}`)
            }
        })
        await Promise.all(workers)
    } catch (error) {
        if (generation !== listGeneration) return
        enabledList.replaceChildren()
        disabledList.replaceChildren()
        extensionRows = []
        filterExtensions()
        document.getElementById('extension-count').textContent = '—'
        status('list-status', 'Could not load your extensions. Open the tools menu and choose Check for Updates to retry.', true)
        console.error('Could not list extensions:', error)
    } finally {
        if (generation === listGeneration) {
            refreshButton.disabled = false
            document.getElementById('register').setAttribute('aria-busy', 'false')
        }
    }
}

installedBody.addEventListener('click', async event => {
    const button = event.target.closest('button[data-ext-id]')
    if (!button || button.disabled) return
    const siblings = [...button.closest('.action-buttons').querySelectorAll('button')]
    button.closest('.options-menu')?.querySelector('summary').focus()
    closeMenus()
    siblings.forEach(item => { item.disabled = true })
    const isPrepared = button.classList.contains('prepared-btn')
    const isUpdate = isPrepared || button.classList.contains('update-btn')
    status('action-status', isUpdate ? 'Preparing extension…' : 'Opening the browser’s uninstall prompt…')
    try {
        if (isPrepared) {
            const record = await getPreparedUpdate(button.dataset.extId)
            const installed = (await chrome.management.getAll()).find(ext => ext.id === button.dataset.extId)
            if (!record?.blob || !installed || compareVersions(record.version, installed.version) !== 1) {
                status('action-status', 'This update is no longer available or is already installed. Check for updates again.')
                return
            }
            installResult(record.blob)
            status('action-status', 'Confirm the update in Firefox. It stays ready until installation succeeds.')
        } else if (isUpdate) {
            await updateExtension(button.dataset.extId, button.dataset.source)
            status('action-status', 'Extension ready. Complete installation in your browser.')
        } else {
            await chrome.runtime.sendMessage(button.dataset.extId, {type: 'XPIPorterUninstall'})
            status('action-status', 'Uninstall requested. Confirm in your browser if prompted.')
        }
    } catch (error) {
        // An uninstall handler can disconnect as its extension is removed. Re-read the list.
        if (!isUpdate) {
            const extensions = await chrome.management.getAll().catch(() => null)
            if (extensions && !extensions.some(ext => ext.id === button.dataset.extId)) {
                status('action-status', 'Extension uninstalled.')
                loadExtensions()
                return
            }
        }
        status('action-status', isUpdate ? 'Could not prepare the extension. Check your connection and try again.' : 'Uninstall was cancelled or unavailable. You can also remove the extension in your browser’s Add-ons Manager.', true)
        console.error('Extension action failed:', error)
    } finally {
        siblings.forEach(item => { item.disabled = false })
    }
})

function installResult(ab) {
    const blobLink = URL.createObjectURL(new Blob([ab], {type: 'application/x-xpinstall'}))
    location.href = blobLink

    const debugElm = document.createElement('a')
    debugElm.download = 'debug.xpi'
    debugElm.href = blobLink
    console.log('%c Debugging Information of CRX Installer', 'font-size: large')
    console.log('If you need generated xpi for debugging, store following object as global variable and run `temp0.click()`:')
    console.log(debugElm)
}

async function queryLatest(source, extId) {
    if (source !== 'CWS') return undefined
    const id = encodeURIComponent(extId.split('@')[0])
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
        const response = await fetch(`https://clients2.google.com/service/update2/crx?prodversion=140&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`, {signal: controller.signal})
        if (!response.ok) throw new Error(`Version request failed: ${response.status}`)
        const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
        return xml.querySelector('updatecheck')?.getAttribute('version') || undefined
    } finally {
        clearTimeout(timeout)
    }
}

async function updateExtension(extId, source) {
    if (source !== 'CWS') return
    const id = extId.split('@')[0]
    const response = await fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140&acceptformat=crx3&x=id%3D${encodeURIComponent(id)}%26installsource%3Dondemand%26uc`)
    if (!response.ok) throw new Error(`Extension download failed: ${response.status}`)
    const xpi = await patchExt(await response.arrayBuffer(), id, source)
    installResult(xpi)
}

refreshButton.addEventListener('click', () => {
    document.getElementById('page-tools').querySelector('summary').focus()
    closeMenus()
    loadExtensions()
    checkUpdatesNow()
})
for (const event of [chrome.management.onInstalled, chrome.management.onUninstalled, chrome.management.onEnabled, chrome.management.onDisabled]) {
    event?.addListener(ext => {
        const id = typeof ext === 'string' ? ext : ext.id
        if (id?.endsWith('_CRXInstaller')) loadExtensions()
    })
}
showView()
loadUpdateState()
loadSettings()
loadExtensions()

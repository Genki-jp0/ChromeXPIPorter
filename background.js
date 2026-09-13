import {patchExt} from  "/patchExt.js"
import {runUpdateCheck, configureAutoUpdates} from "/autoUpdates.js"

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({url: "dashboard.html"})
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'UPDATES_RUN' || request.type === 'UPDATES_CONFIGURE') {
        const dashboard = chrome.runtime.getURL('dashboard.html')
        if (sender.id !== chrome.runtime.id || sender.url?.split(/[?#]/)[0] !== dashboard) return false
        if (request.type === 'UPDATES_RUN') {
            runUpdateCheck(true).catch(error => console.error('Update check failed:', error))
            sendResponse({ok: true})
        } else {
            configureAutoUpdates().then(() => sendResponse({ok: true}), error => sendResponse({ok: false, error: error.message}))
        }
        return true
    }
    request.type == "getCWS" && getCWS(sender.tab.url).then(xpi => sendResponse(xpi))
    request.type == "isInstalledCWS" && isInstalledCWS(sender.tab.url).then(bool => sendResponse(bool))
    request.type == "uninstall" && uninstallCWS(sender.tab.url)
    request.type == "checkContainer" && checkIfMainContainer(sender.tab.id).then(bool => sendResponse(bool))
    return true
})

chrome.management.onInstalled.addListener(async ext => {
    if((typeof ext === "string" ? ext : ext.id)?.endsWith("_CRXInstaller")){
        let tabs = await chrome.tabs.query({active: true, currentWindow: true});
        let currentTab = tabs[0];
        if(currentTab?.url?.includes("chromewebstore.google.com")) {
            chrome.tabs.reload(currentTab.id);
        }
    }
})

chrome.management.onUninstalled.addListener(async ext => {
    if((typeof ext === "string" ? ext : ext.id)?.endsWith("_CRXInstaller")){
        let tabs = await chrome.tabs.query({active: true, currentWindow: true});
        let currentTab = tabs[0];
        if(currentTab?.url?.includes("chromewebstore.google.com")) {
            chrome.tabs.reload(currentTab.id);
        }
    }
})

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        chrome.tabs.create({ url: "docs/GettingStarted.html" });
    }
});


async function getCWS(url){
    let id = url.replace(/.*?\/detail(\/.*?)?\/(.*?)(\/|#|\?|$).*/, "$2")
    try {
        return await getAMOAlt(id)
    } catch {
        let crx = await fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`).then(r => r.arrayBuffer())
        return await patchExt(crx, id, "CWS")
    }
}

async function isInstalledCWS(url){
    let id = url.replace(/.*?\/detail(\/.*?)?\/(.*?)(\/|#|\?|$).*/, "$2")
    let allExtensions = await chrome.management.getAll()
    return Boolean(allExtensions.find(ext => ext.id == `${id}@CWS_CRXInstaller`))
}

function uninstallCWS(url){
    let id = url.replace(/.*?\/detail(\/.*?)?\/(.*?)(\/|#|\?|$).*/, "$2")
    chrome.runtime.sendMessage(`${id}@CWS_CRXInstaller`, {type:"XPIPorterUninstall"})
}

async function getAMOAlt(cwsId){
    let firefoxId = null
    
    // First, try to find in internalMappings.json
    try {
        let internalMaps = await fetch("/internalMappings.json").then(j => j.json())
        let internalMatch = internalMaps.results.find(item => item.extension_id == cwsId)
        if (internalMatch) {
            firefoxId = internalMatch.addon_guid
        }
    } catch (error) {
        console.warn("Failed to load internalMappings.json:", error)
    }
    
    // If not found in internal mappings, try Mozilla API
    if (!firefoxId) {
        let maps = await fetch("https://services.addons.mozilla.org/api/v5/addons/browser-mappings/?browser=chrome").then(j => j.json())
        let mozillaMatch = maps.results.find(item => item.extension_id == cwsId)
        if (!mozillaMatch) {
            throw new Error(`No Firefox alternative found for Chrome extension ID: ${cwsId}`)
        }
        firefoxId = mozillaMatch.addon_guid
    }
    
    let apiResponse = await fetch(`https://addons.mozilla.org/api/v5/addons/addon/${firefoxId}/`).then(r => r.json())
    return await fetch(apiResponse['current_version']['file']['url']).then(r => r.arrayBuffer())
}

async function checkIfMainContainer(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        
        // Check if tab has a container (cookieStoreId exists and is not default)
        if (tab.cookieStoreId && tab.cookieStoreId !== 'firefox-default') {
            return false
        }
    } catch (error) {
        console.error('Error checking container:', error);
    }
    return true
}

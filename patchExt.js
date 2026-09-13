import "/libs/jszip.min.js"
import {cacheArchiveIcon} from "/extensionIcons.js"
function loadExtension(file){
    let zip = new JSZip()
    return zip.loadAsync(file)
}

async function processServiceWorker(ext, serviceWorkerScript, serviceWorkerPath) {
    let importedScripts = []
    
    // Get the directory of the service worker file
    let serviceWorkerDir = serviceWorkerPath.includes('/') 
        ? serviceWorkerPath.substring(0, serviceWorkerPath.lastIndexOf('/') + 1)
        : ''
    
    // Regular expression to match importScripts calls
    // Matches: importScripts('script1.js', 'script2.js', ...)
    // Handles single quotes, double quotes, and backticks
    const importScriptsRegex = /importScripts\s*\(\s*((?:['"`][^'"`]*['"`]\s*,\s*)*['"`][^'"`]*['"`])\s*\)/g
    
    // First pass: extract all script names
    let match
    while ((match = importScriptsRegex.exec(serviceWorkerScript)) !== null) {
        // Extract script names from the importScripts call
        let scriptNames = match[1]
            .split(',')
            .map(name => {
                // Remove quotes and trim whitespace
                let trimmed = name.trim()
                if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
                    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
                    (trimmed.startsWith('`') && trimmed.endsWith('`'))) {
                    return trimmed.slice(1, -1)
                }
                return trimmed
            })
            .filter(name => name.length > 0)
        
        // Add each script to the imported scripts array with proper path resolution
        for (let scriptName of scriptNames) {
            // Resolve relative paths based on service worker location
            let resolvedPath = scriptName
            if (!scriptName.startsWith('/') && !scriptName.startsWith('http')) {
                // Relative path - prepend service worker directory
                resolvedPath = serviceWorkerDir + scriptName
            }
            
            if (!importedScripts.includes(resolvedPath)) {
                importedScripts.push(resolvedPath)
            }
        }
    }
    
    // Second pass: remove all importScripts calls
    const removeImportScriptsRegex = /importScripts\s*\(\s*[^)]+\s*\)/g
    let processedScript = serviceWorkerScript.replace(removeImportScriptsRegex, '')
    
    return { processedScript, importedScripts }
}

async function patchManifest(ext, extId, store, needsOffscreenPolyfill = false){
    let manifest = await ext.file('manifest.json').async('text').then(txt => JSON.parse(txt))
    let randomId = (Math.random() + 1).toString(36).substring(2)
    let newExtId = `${extId || randomId}@${store || ""}_CRXInstaller`

    if(!manifest.theme) {
        if(!manifest.background){
            manifest.background = {
                scripts: []
            }
        }
        if(manifest.background?.service_worker){
            manifest.background.service_worker = manifest.background.service_worker.replace(/^\/+/, "")
            // Check if service worker file exists
            let serviceWorkerFile = ext.file(manifest.background.service_worker)
            if (serviceWorkerFile) {
                try {
                    // Process service worker and handle importScripts
                    let serviceWorkerScript = await serviceWorkerFile.async('text')
                    let { processedScript, importedScripts } = await processServiceWorker(ext, serviceWorkerScript, manifest.background.service_worker)
                    
                    // Update the service worker file with processed content
                    ext.file(manifest.background.service_worker, processedScript)
                    
                    // Add imported scripts first, then the service worker script
                    // This ensures imported scripts are loaded before the service worker that calls them
                    manifest.background.scripts = [...importedScripts, manifest.background.service_worker]
                } catch (error) {
                    console.warn('Failed to process service worker:', manifest.background.service_worker, error)
                    // Fallback: just convert service_worker to scripts without processing
                    manifest.background.scripts = [manifest.background.service_worker]
                }
            } else {
                console.warn('Service worker file not found:', manifest.background.service_worker)
                // Fallback: just convert service_worker to scripts without processing
                manifest.background.scripts = [manifest.background.service_worker]
            }
            delete manifest.background.service_worker
        }
        
        // Add offscreen polyfill if needed (at the beginning)
        if (needsOffscreenPolyfill) {
            manifest.background.scripts.unshift("offscreenPolyfill.js")
        }
        
        manifest.background.scripts.push("uninstallHandler.js")
    }

    if(manifest.update_url) {
        delete manifest.update_url
    }

    manifest.browser_specific_settings = {
        "gecko": {
            "id": newExtId
        }
    }

    if(manifest.web_accessible_resources){
        manifest.web_accessible_resources.forEach(res => {
            if(res.extension_ids) res.extension_ids = [newExtId]
            if(res.matches) {
                res.matches = res.matches.filter(match => !match.startsWith('chrome-extension://'))
            }
        })
    }

    ext.file("manifest.json", JSON.stringify(manifest, null, "\t"))
    return ext
}

async function checkOffscreenUsage(ext) {
    // Check manifest.json for offscreen permissions
    try {
        let manifestFile = ext.file('manifest.json')
        if (manifestFile) {
            let manifest = await manifestFile.async('text').then(txt => JSON.parse(txt))
            if (manifest.permissions && manifest.permissions.includes('offscreen')) {
                return true
            }
        }
    } catch (e) {
        // Ignore manifest parsing errors
    }
    
    // Check all JavaScript files for chrome.offscreen usage
    let files = Object.keys(ext.files)
    for (let filename of files) {
        if (filename.endsWith('.js') || filename.endsWith('.mjs')) {
            try {
                let file = ext.file(filename)
                if (file) {
                    let content = await file.async('text')
                    if (content.includes('chrome.offscreen') || content.includes('offscreen')) {
                        return true
                    }
                }
            } catch (e) {
                // Ignore file reading errors
            }
        }
    }
    
    return false
}

async function injectScripts(ext, needsOffscreenPolyfill = false){
    let uninstallHandler = await fetch("/injects/uninstallHandler.js").then(res => res.arrayBuffer())
    ext.file("uninstallHandler.js", uninstallHandler)
    
    // Inject offscreen polyfill if needed
    if (needsOffscreenPolyfill) {
        let offscreenPolyfill = await fetch("/injects/offscreenPolyfill.js").then(res => res.arrayBuffer())
        ext.file("offscreenPolyfill.js", offscreenPolyfill)
    }
    
    return ext
}

export async function patchExt(file, extId, store){
    let ext = await loadExtension(file)
    
    // Check if offscreen polyfill is needed
    let needsOffscreenPolyfill = await checkOffscreenUsage(ext)
    
    ext = await injectScripts(ext, needsOffscreenPolyfill)
    ext =  await patchManifest(ext, extId, store, needsOffscreenPolyfill)
    const result = await ext.generateAsync({type: "arraybuffer"})
    await cacheArchiveIcon(ext)
    return result
}

export { processServiceWorker }

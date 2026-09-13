const databaseName = 'crx-installer-updates'
const storeName = 'packages'

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1)
        request.onupgradeneeded = () => request.result.createObjectStore(storeName, {keyPath: 'id'})
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

async function transaction(mode, operation) {
    const db = await openDatabase()
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode)
            let result
            const request = operation(tx.objectStore(storeName))
            request.onsuccess = () => { result = request.result }
            tx.oncomplete = () => resolve(result)
            tx.onerror = () => reject(tx.error)
            tx.onabort = () => reject(tx.error || new Error('Update storage was interrupted'))
        })
    } finally {
        db.close()
    }
}

export const getPreparedUpdate = id => transaction('readonly', store => store.get(id))
export const savePreparedUpdate = record => transaction('readwrite', store => store.put(record))
export const deletePreparedUpdate = id => transaction('readwrite', store => store.delete(id))
export const listPreparedUpdateIds = () => transaction('readonly', store => store.getAllKeys())

/**
 * IndexedDB utility functions for database operations
 */

export const DB_NAME = 'appDB'
export const DB_VERSION = 3

/**
 * Initialize the IndexedDB database
 * @param {Object} stores - Configuration for object stores { storeName: keyPath }
 * @returns {Promise<IDBDatabase>}
 */
export function initDB(stores = {}) {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION)

		request.onerror = () => {
			console.error('Database failed to open:', request.error)
			reject(request.error)
		}

		request.onsuccess = () => {
			const db = request.result
			resolve(db)
		}

		request.onupgradeneeded = (e) => {
			const db = e.target.result

			// Migration from v2 to v3: consolidate notes and lists into entities
			if (e.oldVersion < 3) {
				// Collect data from old stores
				let notesToMigrate = []
				let listsToMigrate = []

				// Read from old stores if they exist
				if (db.objectStoreNames.contains('notes')) {
					const notesStore = e.target.transaction.objectStore('notes')
					const notesRequest = notesStore.getAll()
					notesRequest.onsuccess = () => {
						notesToMigrate = notesRequest.result
					}
				}

				if (db.objectStoreNames.contains('lists')) {
					const listsStore = e.target.transaction.objectStore('lists')
					const listsRequest = listsStore.getAll()
					listsRequest.onsuccess = () => {
						listsToMigrate = listsRequest.result
					}
				}

				// Delete old stores
				if (db.objectStoreNames.contains('notes')) {
					db.deleteObjectStore('notes')
				}
				if (db.objectStoreNames.contains('lists')) {
					db.deleteObjectStore('lists')
				}

				// Create new entities store
				if (!db.objectStoreNames.contains('entities')) {
					db.createObjectStore('entities', { keyPath: 'id' })
				}

				// Store reference to data for migration after store creation
				db.__migrateNotes = notesToMigrate
				db.__migrateLists = listsToMigrate
			}

			// Create object stores if they don't exist
			Object.entries(stores).forEach(([storeName, keyPath]) => {
				if (!db.objectStoreNames.contains(storeName)) {
					db.createObjectStore(storeName, { keyPath })
				}
			})
		}
	})
}

/**
 * Add or update a record in a store
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @param {Object} data - Data to store
 * @returns {Promise<IDBValidKey>}
 */
export function addOrUpdate(db, storeName, data) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite')
		const store = transaction.objectStore(storeName)
		const request = store.put(data)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

/**
 * Get a single record from a store
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<Object|undefined>}
 */
export function getRecord(db, storeName, key) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readonly')
		const store = transaction.objectStore(storeName)
		const request = store.get(key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

/**
 * Get all records from a store
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @returns {Promise<Array>}
 */
export function getAllRecords(db, storeName) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readonly')
		const store = transaction.objectStore(storeName)
		const request = store.getAll()

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

/**
 * Delete a record from a store
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @param {IDBValidKey} key - Record key
 * @returns {Promise<void>}
 */
export function deleteRecord(db, storeName, key) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite')
		const store = transaction.objectStore(storeName)
		const request = store.delete(key)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve()
	})
}

/**
 * Clear all records from a store
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @returns {Promise<void>}
 */
export function clearStore(db, storeName) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readwrite')
		const store = transaction.objectStore(storeName)
		const request = store.clear()

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve()
	})
}

/**
 * Query records using an index
 * @param {IDBDatabase} db - Database instance
 * @param {string} storeName - Name of the object store
 * @param {string} indexName - Name of the index
 * @param {IDBValidKey} value - Value to query
 * @returns {Promise<Array>}
 */
export function queryByIndex(db, storeName, indexName, value) {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, 'readonly')
		const store = transaction.objectStore(storeName)
		const index = store.index(indexName)
		const request = index.getAll(value)

		request.onerror = () => reject(request.error)
		request.onsuccess = () => resolve(request.result)
	})
}

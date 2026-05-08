import { useState, useEffect, useCallback } from 'react'
import { initDB, getAllRecords, addOrUpdate, deleteRecord } from './indexeddb'

let dbInstance = null
let initPromise = null
let refCount = 0

/**
 * Custom hook for managing IndexedDB data in React
 * @param {string} storeName - Name of the object store
 * @param {Object} stores - Configuration for object stores { storeName: keyPath }
 * @returns {Object} - { data, loading, error, add, remove, refresh }
 */
export function useIndexedDB(storeName, stores = { [storeName]: 'id' }) {
	const [data, setData] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)

	// Initialize database on mount
	useEffect(() => {
		const init = async () => {
			try {
				// If initialization is in progress, wait for it
				if (initPromise) {
					dbInstance = await initPromise
				} else if (!dbInstance) {
					// Start initialization and save the promise
					initPromise = initDB(stores)
					dbInstance = await initPromise
					initPromise = null
				}

				refCount++

				// Wait a tick to ensure database is ready
				await new Promise(resolve => setTimeout(resolve, 0))

				const records = await getAllRecords(dbInstance, storeName)
				setData(records)
				setLoading(false)
			} catch (err) {
				console.error('Failed to initialize IndexedDB:', err)
				setError(err.message)
				setLoading(false)
			}
		}

		init()

		return () => {
			refCount--
			if (refCount <= 0 && dbInstance) {
				dbInstance.close()
				dbInstance = null
			}
		}
	}, [storeName, stores])

	const refresh = useCallback(async () => {
		if (!dbInstance) return

		try {
			const records = await getAllRecords(dbInstance, storeName)
			setData(records)
		} catch (err) {
			console.error('Failed to refresh data:', err)
			setError(err.message)
		}
	}, [storeName])

	const add = useCallback(async (record) => {
		if (!dbInstance) return

		try {
			await addOrUpdate(dbInstance, storeName, record)
			await refresh()
		} catch (err) {
			console.error('Failed to add record:', err)
			setError(err.message)
		}
	}, [storeName, refresh])

	const remove = useCallback(async (key) => {
		if (!dbInstance) return

		try {
			await deleteRecord(dbInstance, storeName, key)
			await refresh()
		} catch (err) {
			console.error('Failed to delete record:', err)
			setError(err.message)
		}
	}, [storeName, refresh])

	return { data, loading, error, add, remove, refresh }
}

import { getAllRecords, addOrUpdate } from '../utils/indexeddb'

const PRESET_LIST_NAMES = [
	'Mon',
	'Tue',
	'Wed',
	'Thu',
	'Fri',
	'Sat',
	'Sun',
	'Etc'
]

const DEFAULT_COLOR = 'slate'

/**
 * Initialize preset lists if they don't exist
 * @param {IDBDatabase} db - Database instance
 */
export async function initializePresetLists(db) {
	try {
		const entities = await getAllRecords(db, 'entities')
		const presetLists = entities.filter((e) => e.preset)

		// If we don't have all preset lists, create the missing ones
		if (presetLists.length < PRESET_LIST_NAMES.length) {
			const existingTitles = presetLists.map((e) => e.title)

			for (const title of PRESET_LIST_NAMES) {
				if (!existingTitles.includes(title)) {
					await addOrUpdate(db, 'entities', {
						id: `preset-${title.toLowerCase()}-${Date.now()}`,
						type: 'list',
						title,
						preset: true,
						items: [],
						color: DEFAULT_COLOR,
						lastChanged: new Date().toISOString()
					})
				}
			}
		}
	} catch (err) {
		console.error('Failed to initialize preset lists:', err)
	}
}

export { PRESET_LIST_NAMES }

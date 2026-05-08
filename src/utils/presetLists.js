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

const PRESET_DISPLAY_NAMES = {
	'Mon': 'Monday',
	'Tue': 'Tuesday',
	'Wed': 'Wednesday',
	'Thu': 'Thursday',
	'Fri': 'Friday',
	'Sat': 'Saturday',
	'Sun': 'Sunday',
	'Etc': 'Etc'
}

const DEFAULT_COLOR = 'slate'

/**
 * Get display name for a preset list
 * @param {string} shortName - Short name like 'Mon'
 * @returns {string} Full display name like 'Monday'
 */
export function getPresetDisplayName(shortName) {
	return PRESET_DISPLAY_NAMES[shortName] || shortName
}

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
					// Use consistent id based on title
					const consistentId = `preset-${title.toLowerCase()}`
					
					// Double-check that this preset doesn't already exist
					const existing = entities.find(
						(e) => e.type === 'list' && e.preset && e.title === title
					)
					
					if (!existing) {
						await addOrUpdate(db, 'entities', {
							id: consistentId,
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
		}
	} catch (err) {
		console.error('Failed to initialize preset lists:', err)
	}
}

export { PRESET_LIST_NAMES }

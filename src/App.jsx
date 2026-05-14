import { useEffect, useState, useRef } from 'react'
import './App.css'
import { initDB, getAllRecords, addOrUpdate } from './utils/indexeddb'
import { DB_STORES } from './config/db'
import { initializePresetLists, PRESET_LIST_NAMES, getPresetDisplayName } from './utils/presetLists'

const PRESET_COLORS = [
	{ name: 'red', hex: '#ef4444' },
	{ name: 'orange', hex: '#f97316' },
	{ name: 'amber', hex: '#f59e0b' },
	{ name: 'yellow', hex: '#eab308' },
	{ name: 'lime', hex: '#84cc16' },
	{ name: 'green', hex: '#22c55e' },
	{ name: 'emerald', hex: '#10b981' },
	{ name: 'teal', hex: '#14b8a6' },
	{ name: 'pink', hex: '#ec4899' },
	{ name: 'fuchsia', hex: '#d946ef' },
	{ name: 'purple', hex: '#a855f7' },
	{ name: 'violet', hex: '#8b5cf6' },
	{ name: 'indigo', hex: '#6366f1' },
	{ name: 'blue', hex: '#3b82f6' },
	{ name: 'sky', hex: '#0ea5e9' },
	{ name: 'cyan', hex: '#06b6d4' }
]

const DEFAULT_COLOR = 'oklch(55.4% 0.046 257.417)'

function App() {
	const dbRef = useRef(null)
	const colorPickerRef = useRef(null)
	const entityViewTextareaRef = useRef(null)
	const [presetLists, setPresetLists] = useState([])
	const [view, setView] = useState('main') // 'main', 'note-create', 'list-create'
	const [titleInput, setTitleInput] = useState('')
	const [bodyInput, setBodyInput] = useState('')
	const [entities, setEntities] = useState([])
	const [showColorPicker, setShowColorPicker] = useState(false)
	const [selectedEntityId, setSelectedEntityId] = useState(null)
	const [tempColor, setTempColor] = useState(null)
	const [pickerViewMode, setPickerViewMode] = useState('main') // 'main' or 'fullscreen'
	const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 })
	const [draggedEntityId, setDraggedEntityId] = useState(null)
	const [itemsOrder, setItemsOrder] = useState([]) // Local order state for dragging
	const [hoverIndex, setHoverIndex] = useState(-1) // Track which index is under the ghost
	const dragStartYRef = useRef(0)
	const ghostPositionRef = useRef({ x: 0, y: 0 })
	const [ghostTrigger, setGhostTrigger] = useState(0) // Lightweight trigger for re-renders
	const debounceTimerRef = useRef(null)
	const dragDelayTimerRef = useRef(null) // Timer for long press
	const isLongPressRef = useRef(false) // Whether we've completed the long press
	const longPressStartRef = useRef(null) // Start position for tracking movement
	const longPressEntityIdRef = useRef(null) // Entity ID for the long press
	const touchStartX = useRef(0)
	const touchEndX = useRef(0)
	const [viewingEntityId, setViewingEntityId] = useState(null) // Entity being viewed/edited
	const [editingEntity, setEditingEntity] = useState(null) // Local copy for editing
	const autoSaveTimerRef = useRef(null) // Debounce timer for autosave
	const noteCreatedRef = useRef(false) // Track if note was already created during note-create session
	const createdNoteIdRef = useRef(null) // Track the ID of the created note during note-create session
	const createNoteAutoSaveTimerRef = useRef(null) // Auto-save timer for note creation view
	const [swipedEntityId, setSwipedEntityId] = useState(null) // Which entity is being swiped
	const [deletingEntityId, setDeletingEntityId] = useState(null) // Which entity's button is closing
	const swipeStartX = useRef(0) // Track swipe start position
	const [deleteConfirmEntityId, setDeleteConfirmEntityId] = useState(null) // Entity awaiting delete confirmation

	// Get non-preset entities sorted by order
	const getMainEntities = () => {
		return entities
			.filter((e) => !e.preset)
			.sort((a, b) => (a.order || 0) - (b.order || 0))
	}

	const loadAllEntities = async (db) => {
		try {
			const allEntities = await getAllRecords(db, 'entities')
			const nonPresets = (allEntities || []).filter(e => !e.preset).sort((a, b) => (a.order || 0) - (b.order || 0))
			setEntities(allEntities || [])
			setItemsOrder(nonPresets)
		} catch (err) {
			console.error('Failed to load entities:', err)
		}
	}

	// Focus textarea and set cursor to end when opening entity view
	useEffect(() => {
		if (view === 'entity-view' && editingEntity?.type === 'note' && entityViewTextareaRef.current) {
			setTimeout(() => {
				const element = entityViewTextareaRef.current
				if (element) {
					element.focus()
					// Position cursor at end
					const length = element.value.length
					element.setSelectionRange(length, length)
				}
			}, 0)
		}
	}, [view, editingEntity])

	// Sync uncontrolled textarea when switching notes (without moving cursor)
	useEffect(() => {
		if (entityViewTextareaRef.current && editingEntity?.type === 'note') {
			entityViewTextareaRef.current.value = editingEntity.content || ''
		}
	}, [editingEntity?.id])

	// Update display layer periodically from uncontrolled textarea (instead of on every keystroke)
	useEffect(() => {
		if (view !== 'entity-view' || editingEntity?.type !== 'note') return

		const interval = setInterval(() => {
			const textarea = entityViewTextareaRef.current
			if (textarea) {
				const currentValue = textarea.value
				if (currentValue !== editingEntity.content) {
					setEditingEntity(prev => ({ ...prev, content: currentValue }))
				}
			}
		}, 100)

		return () => clearInterval(interval)
	}, [view, editingEntity?.type])

	// Close delete button on outside click (blur)
	useEffect(() => {
		if (!swipedEntityId) return

		const handleClickOutside = (e) => {
			const deleteBtn = e.target.closest('.entity-item__delete-btn')
			const wrapper = e.target.closest('.entity-item-wrapper')
			
			// Only close if clicking outside the wrapper
			if (!wrapper || (wrapper && !deleteBtn)) {
				setSwipedEntityId(null)
			}
		}

		document.addEventListener('click', handleClickOutside)
		return () => document.removeEventListener('click', handleClickOutside)
	}, [swipedEntityId])

	// Close color picker on blur (click outside)
	useEffect(() => {
		if (!showColorPicker) return

		const handleClickOutside = (e) => {
			if (colorPickerRef.current && !colorPickerRef.current.contains(e.target)) {
				setShowColorPicker(false)
				setSelectedEntityId(null)
			}
		}

		document.addEventListener('mousedown', handleClickOutside)
		return () => {
			document.removeEventListener('mousedown', handleClickOutside)
		}
	}, [showColorPicker])

	useEffect(() => {
		const init = async () => {
			try {
				// Initialize database
				const db = await initDB(DB_STORES)
				dbRef.current = db

				// Initialize preset lists
				await initializePresetLists(db)

				// Load all entities
				await loadAllEntities(db)

				// Fetch and display preset lists in correct order
				const allEntities = await getAllRecords(db, 'entities')
				const presets = PRESET_LIST_NAMES.map(
					(name) => allEntities.find((e) => e.title === name && e.preset)
				)
				setPresetLists(presets)
			} catch (err) {
				console.error('Failed to initialize app:', err)
			}
		}

		init()

		return () => {
			if (dbRef.current) {
				dbRef.current.close()
			}
		}
	}, [])

	const handleCreateNote = () => {
		setTitleInput('')
		setBodyInput('')
		setTempColor(null)
		noteCreatedRef.current = false
		createdNoteIdRef.current = null
		setView('note-create')
	}

	const handleCreateList = () => {
		setTitleInput('')
		setTempColor(null)
		setView('list-create')
	}

	const handleBack = async () => {
		// Flush any pending note autosave before leaving
		if (createNoteAutoSaveTimerRef.current && createdNoteIdRef.current && noteCreatedRef.current) {
			clearTimeout(createNoteAutoSaveTimerRef.current)
			try {
				const existingNote = entities.find(e => e.id === createdNoteIdRef.current)
				if (existingNote) {
					const finalTitle = (titleInput || '').trim() || 'Untitled'
					await addOrUpdate(dbRef.current, 'entities', {
						...existingNote,
						title: finalTitle,
						content: bodyInput || ''
					})
					await loadAllEntities(dbRef.current)
				}
			} catch (err) {
				console.error('Failed to flush note autosave:', err)
			}
		}
		setView('main')
		setTitleInput('')
		setBodyInput('')
		noteCreatedRef.current = false
		createdNoteIdRef.current = null
		setShowColorPicker(false)
	}

	const handleTouchStart = (e) => {
		touchStartX.current = e.changedTouches[0].screenX
	}

	const handleTouchEnd = (e) => {
		touchEndX.current = e.changedTouches[0].screenX
		handleSwipe()
	}

	const incrementExistingOrders = async (db) => {
		// Increment all non-preset entity orders by 1 to push them down
		const nonPresets = entities.filter(e => !e.preset)
		for (const entity of nonPresets) {
			const updated = { ...entity, order: (entity.order || 0) + 1 }
			await addOrUpdate(db, 'entities', updated)
		}
	}

	const handleAutoCreateNote = async (title, body) => {
		// Only create once per session
		if (noteCreatedRef.current || !dbRef.current) return

		try {
			noteCreatedRef.current = true
			// Increment existing orders first
			await incrementExistingOrders(dbRef.current)
			const noteId = `note-${Date.now()}`
			createdNoteIdRef.current = noteId
			const finalTitle = (title || '').trim() || 'Untitled'
			await addOrUpdate(dbRef.current, 'entities', {
				id: noteId,
				type: 'note',
				title: finalTitle,
				content: body || '',
				color: tempColor || DEFAULT_COLOR,
				order: 1,
				lastChanged: new Date().toISOString()
			})
			await loadAllEntities(dbRef.current)
		} catch (err) {
			console.error('Failed to auto-create note:', err)
		}
	}

	const handleNoteCreateAutoSave = async (newTitle, newBody) => {
		// Auto-save changes to the created note
		if (!noteCreatedRef.current || !createdNoteIdRef.current || !dbRef.current) return

		// Clear existing timer
		if (createNoteAutoSaveTimerRef.current) {
			clearTimeout(createNoteAutoSaveTimerRef.current)
		}

		// Set new timer for debounced save
		createNoteAutoSaveTimerRef.current = setTimeout(async () => {
			try {
				// Get the existing note first to preserve all fields
				const existingNote = entities.find(e => e.id === createdNoteIdRef.current)
				if (!existingNote) return

				const finalTitle = (newTitle || '').trim() || 'Untitled'
				await addOrUpdate(dbRef.current, 'entities', {
					...existingNote,
					title: finalTitle,
					content: newBody || ''
				})
				await loadAllEntities(dbRef.current)
			} catch (err) {
				console.error('Failed to auto-save note:', err)
			}
		}, 100)
	}

	const handleTitleInputChange = (e) => {
		const newValue = e.target.value
		setTitleInput(newValue)
		// Auto-create on first character
		if (newValue.length === 1 && !noteCreatedRef.current) {
			handleAutoCreateNote(newValue, bodyInput)
		} else if (noteCreatedRef.current) {
			// Auto-save subsequent changes
			handleNoteCreateAutoSave(newValue, bodyInput)
		}
	}

	const handleBodyInputChange = (e) => {
		const newValue = e.target.value
		setBodyInput(newValue)
		// Auto-create on first character
		if (newValue.length === 1 && !noteCreatedRef.current) {
			handleAutoCreateNote(titleInput, newValue)
		} else if (noteCreatedRef.current) {
			// Auto-save subsequent changes
			handleNoteCreateAutoSave(titleInput, newValue)
		}
	}

	const handleSwipe = async () => {
		const swipeThreshold = 50 // minimum pixels to consider as swipe
		const diff = touchEndX.current - touchStartX.current

		// Swipe left to right (positive difference)
		if (diff > swipeThreshold) {
			if (view === 'note-create') {
				// Just go back, note is already auto-created if there's content
				await handleBack()
			} else if (view === 'list-create') {
				// If title is empty, just go back without saving
				if (!titleInput.trim()) {
					setView('main')
					setTitleInput('')
					setShowColorPicker(false)
					return
				}

				// If title exists, save it
				handleSaveListAndReturn()
			} else if (view === 'entity-view') {
				// Close entity view on swipe back
				await handleBackFromEntityView()
			}
		}
	}

	const getEntityColor = (entityId) => {
		const entity = entities.find((e) => e.id === entityId)
		return entity?.color || DEFAULT_COLOR
	}

	const handleColorSelect = async (colorHex) => {
		if (!selectedEntityId || !dbRef.current) return

		try {
			const entity = entities.find((e) => e.id === selectedEntityId)
			if (!entity) return

			const updatedEntity = {
				...entity,
				color: colorHex
			}
			
			await addOrUpdate(dbRef.current, 'entities', updatedEntity)
			
			// If editing entity, update editing state too
			if (view === 'entity-view' && editingEntity?.id === selectedEntityId) {
				setEditingEntity({ ...editingEntity, color: colorHex })
			}
			
			await loadAllEntities(dbRef.current)
			setShowColorPicker(false)
			setSelectedEntityId(null)
		} catch (err) {
			console.error('Failed to update color:', err)
		}
	}

	const openColorPicker = (entityId, isPreset, event) => {
		// Don't open picker for preset items
		if (isPreset) return
		
		setSelectedEntityId(entityId)
		setPickerViewMode(view === 'main' ? 'main' : 'fullscreen')
		
		// Calculate position for main view
		if (view === 'main' && event) {
      
			const element = event.currentTarget.closest('.entity-item')
			const rect = element.getBoundingClientRect()
			setPickerPosition({
				top: rect.bottom,
				left: '0'
			})
		}

		setShowColorPicker(true)
	}

	const handleSaveNoteAndReturn = async () => {
		// Only save if there's meaningful content (title or body)
		if (!titleInput.trim() && !bodyInput.trim()) return
		if (!dbRef.current) return

		try {
			const maxOrder = Math.max(...entities.filter(e => !e.preset).map(e => e.order || 0), 0)
			const finalTitle = titleInput.trim() || 'Untitled'
			await addOrUpdate(dbRef.current, 'entities', {
				id: `note-${Date.now()}`,
				type: 'note',
				title: finalTitle,
				content: bodyInput,
				color: tempColor || DEFAULT_COLOR,
				order: maxOrder + 1,
				lastChanged: new Date().toISOString()
			})
			await loadAllEntities(dbRef.current)
			setView('main')
			setTitleInput('')
			setBodyInput('')
			setTempColor(null)
			setShowColorPicker(false)
		} catch (err) {
			console.error('Failed to save note:', err)
		}
	}

	const handleSaveListAndReturn = async () => {
		if (!titleInput.trim() || !dbRef.current) return

		try {
			// Increment existing orders first
			await incrementExistingOrders(dbRef.current)
			await addOrUpdate(dbRef.current, 'entities', {
				id: `list-${Date.now()}`,
				type: 'list',
				title: titleInput,
				preset: false,
				items: [],
				color: tempColor || DEFAULT_COLOR,
				order: 1,
				lastChanged: new Date().toISOString()
			})
			await loadAllEntities(dbRef.current)
			setView('main')
			setTitleInput('')
			setTempColor(null)
			setShowColorPicker(false)
		} catch (err) {
			console.error('Failed to save list:', err)
		}
	}

	// Touch handlers for mobile drag-and-drop (mobile-only)
	
	// Check if entity should show delete confirmation before deletion
	const shouldShowDeleteConfirm = (entity) => {
		const isUntitled = entity.title === 'Untitled'
		const isEmpty = !entity.content && (!entity.items || entity.items.length === 0)
		const isDefaultColor = entity.color === DEFAULT_COLOR || !entity.color
		
		// Skip confirmation only if: untitled AND empty AND (no color OR default color)
		return !(isUntitled && isEmpty && isDefaultColor)
	}

	// Delete an entity from the database
	const handleDeleteEntity = async (entityId) => {
		if (!dbRef.current) return

		try {
			// For now, we don't have a delete function, so we'll need to implement deletion
			// by removing from the entities list and re-saving all
			const updatedEntities = entities.filter(e => e.id !== entityId)
			
			// Reorder remaining entities
			const reorderedEntities = updatedEntities.map((e, idx) => ({
				...e,
				order: idx
			}))
			
			// Save all reordered entities
			for (const entity of reorderedEntities) {
				await addOrUpdate(dbRef.current, 'entities', entity)
			}
			
			await loadAllEntities(dbRef.current)
			setSwipedEntityId(null)
			setDeleteConfirmEntityId(null)
		} catch (err) {
			console.error('Failed to delete entity:', err)
		}
	}

	// Handle swipe delete action
	const handleSwipeDelete = (entityId) => {
		const entity = entities.find(e => e.id === entityId)
		if (!entity) return

		if (shouldShowDeleteConfirm(entity)) {
			// Show confirmation modal
			setDeleteConfirmEntityId(entityId)
		} else {
			// Delete immediately
			handleDeleteEntity(entityId)
		}
	}
	const handleEntityTouchStart = (e, entityId) => {
		// Reset long press state
		isLongPressRef.current = false
		longPressEntityIdRef.current = entityId
		const touch = e.touches[0]
		longPressStartRef.current = { x: touch.clientX, y: touch.clientY }
		swipeStartX.current = touch.clientX

		// Start timer for long press (300ms)
		dragDelayTimerRef.current = setTimeout(() => {
			// Don't start drag if a delete button is showing (allow swipes instead)
			if (swipedEntityId) return

			isLongPressRef.current = true
			setDraggedEntityId(entityId)
			// Initialize hover index to original position to show empty placeholder there
			const draggedIdx = itemsOrder.length > 0 ? itemsOrder.findIndex(e => e.id === entityId) : entities.findIndex(e => e.id === entityId)
			setHoverIndex(draggedIdx)
			dragStartYRef.current = touch.clientY
			ghostPositionRef.current = { x: touch.clientX, y: touch.clientY }
			setGhostTrigger(t => t + 1)
		}, 300)
	}

	const handleEntityTouchMove = (e) => {
		const touch = e.touches[0]
		const startPos = longPressStartRef.current

		// If long press not yet triggered, check for swipe
		if (!isLongPressRef.current && dragDelayTimerRef.current && startPos) {
			const deltaX = startPos.x - touch.clientX // negative = right to left swipe
			const deltaY = Math.abs(startPos.y - touch.clientY)

			// Detect right-to-left swipe (opening delete button)
			if (deltaX > 10 && deltaY < 20) {
				// It's a swipe, not a drag - cancel long press
				clearTimeout(dragDelayTimerRef.current)
				dragDelayTimerRef.current = null
				
				// If another entity has the button showing, close it first with animation
				if (swipedEntityId && swipedEntityId !== longPressEntityIdRef.current) {
					setDeletingEntityId(swipedEntityId)
					setTimeout(() => {
						setSwipedEntityId(longPressEntityIdRef.current)
						setDeletingEntityId(null)
					}, 200)
				} else {
					// Show delete button for this entity
					setSwipedEntityId(longPressEntityIdRef.current)
				}
				return
			}

			// Detect left-to-right swipe (closing delete button - unswipe)
			if (deltaX < -10 && deltaY < 20) {
				// Unswiping
				if (swipedEntityId === longPressEntityIdRef.current) {
					// Close the button with animation
					clearTimeout(dragDelayTimerRef.current)
					dragDelayTimerRef.current = null
					setDeletingEntityId(longPressEntityIdRef.current)
					setTimeout(() => {
						setSwipedEntityId(null)
						setDeletingEntityId(null)
					}, 200)
					return
				}
			}

			// Detect vertical drag attempt - cancel swipe if moving vertically
			if (deltaY > 30) {
				// Will let long press continue for drag
				return
			}
		}

		// If we haven't completed the long press, cancel it on significant movement
		if (!isLongPressRef.current && dragDelayTimerRef.current) {
			clearTimeout(dragDelayTimerRef.current)
			dragDelayTimerRef.current = null
			return
		}

		// If long press is complete, use isLongPressRef instead of draggedEntityId (which may not be set yet due to async state)
		if (!isLongPressRef.current) return
		
		// Prevent default scrolling during drag
		e.preventDefault()
		
		ghostPositionRef.current = { x: touch.clientX, y: touch.clientY }
		
		// Find element under touch point
		const targetElement = document.elementFromPoint(touch.clientX, touch.clientY)
		const itemDiv = targetElement?.closest('[data-entity-id]')
		const targetEntityId = itemDiv?.dataset?.entityId
		
		// Update hover index for empty placeholder
		if (itemDiv) {
			const hoveredIdx = itemsOrder.findIndex(e => e.id === targetEntityId)
			setHoverIndex(hoveredIdx)
		}
		
		// If we have a draggedEntityId now, process the reordering
		if (draggedEntityId && targetEntityId && targetEntityId !== draggedEntityId) {
			// Check if crossed 50% of target
			const itemRect = itemDiv.getBoundingClientRect()
			const distanceFromCenter = touch.clientY - (itemRect.top + itemRect.height / 2)
			
			if (Math.abs(distanceFromCenter) > itemRect.height / 4) {
				const draggedIdx = itemsOrder.findIndex(e => e.id === draggedEntityId)
				const targetIdx = itemsOrder.findIndex(e => e.id === targetEntityId)
				
				if (draggedIdx !== -1 && targetIdx !== -1 && draggedIdx !== targetIdx) {
					const newOrder = [...itemsOrder]
					const temp = newOrder[draggedIdx]
					newOrder[draggedIdx] = newOrder[targetIdx]
					newOrder[targetIdx] = temp
					setItemsOrder(newOrder)
				}
			}
		}
		
		setGhostTrigger(t => t + 1)
	}

	const handleEntityTouchEnd = async (e) => {
		// Clear timer if still running
		if (dragDelayTimerRef.current) {
			clearTimeout(dragDelayTimerRef.current)
			dragDelayTimerRef.current = null
		}
		isLongPressRef.current = false
		longPressEntityIdRef.current = null

		if (!draggedEntityId) {
			setDraggedEntityId(null)
			setItemsOrder([])
			return
		}

		try {
			// Use itemsOrder state which has the correct positions
			const updatedEntities = itemsOrder.map((entity, idx) => ({
				...entity,
				order: idx
			}))
			
			// Save all to DB
			for (const entity of updatedEntities) {
				await addOrUpdate(dbRef.current, 'entities', entity)
			}
			
			// Update full entities list with new orders
			const allEntities = await getAllRecords(dbRef.current, 'entities')
			setEntities(allEntities)
			setItemsOrder(updatedEntities)
			setDraggedEntityId(null)
		} catch (err) {
			console.error('Failed to save reorder:', err)
			setDraggedEntityId(null)
		}
	}

	// Open entity in fullscreen editing view
	const handleOpenEntity = (entity) => {
		setViewingEntityId(entity.id)
		setEditingEntity({ ...entity })
		setView('entity-view')
	}

	// Autosave edited entity with debounce
	const handleAutoSave = async (updatedEntity) => {
		// Clear existing timer
		if (autoSaveTimerRef.current) {
			clearTimeout(autoSaveTimerRef.current)
		}

		// Set new timer for autosave (100ms debounce)
		autoSaveTimerRef.current = setTimeout(async () => {
			try {
				await addOrUpdate(dbRef.current, 'entities', updatedEntity)
				// Update local entities list
				const allEntities = await getAllRecords(dbRef.current, 'entities')
				setEntities(allEntities)
			} catch (err) {
				console.error('Failed to autosave entity:', err)
			}
		}, 50)
	}

	// Handle entity field changes with autosave
	const handleEntityFieldChange = (field, value) => {
		const updated = { ...editingEntity, [field]: value }
		setEditingEntity(updated)
		handleAutoSave(updated)
	}

	// Close entity view and return to main
	const handleBackFromEntityView = async () => {
		// Flush any pending autosave before leaving
		if (autoSaveTimerRef.current && editingEntity) {
			clearTimeout(autoSaveTimerRef.current)
			try {
				await addOrUpdate(dbRef.current, 'entities', editingEntity)
				const allEntities = await getAllRecords(dbRef.current, 'entities')
				setEntities(allEntities)
			} catch (err) {
				console.error('Failed to flush autosave:', err)
			}
		}
		setViewingEntityId(null)
		setEditingEntity(null)
		setView('main')
		setShowColorPicker(false)
	}

	// Handle note body input - just let the periodic effect sync it
	const handleNoteBodyInput = (e) => {
		// No-op: the periodic effect handles syncing and autosave
		// This prevents state updates on every keystroke which was causing cursor issues
	}

	// Handle special keyboard events in note body
	const handleNoteBodyKeyDown = (e) => {
		const textarea = entityViewTextareaRef.current
		if (!textarea) return

		const content = textarea.value
		const selectionStart = textarea.selectionStart
		const selectionEnd = textarea.selectionEnd

		if (e.key === 'Enter') {
			const beforeCursor = content.substring(0, selectionStart)
			const lastNewline = beforeCursor.lastIndexOf('\n')
			const currentLineStart = lastNewline + 1
			const currentLine = beforeCursor.substring(currentLineStart)
			
			// Check if current line starts with "- " or is just "-"
			const trimmed = currentLine.trim()
			const isListItem = trimmed.startsWith('- ') || trimmed === '-'
			const isIndented = currentLine.startsWith('  ') && !currentLine.startsWith('- ')
			
			if (isListItem) {
				e.preventDefault()
				
				// Insert newline with "- " prefix
				const newContent = 
					content.substring(0, selectionStart) + 
					'\n- ' + 
					content.substring(selectionEnd)
				
				textarea.value = newContent
				
				// Move cursor after "- "
				textarea.selectionStart = selectionStart + 3
				textarea.selectionEnd = selectionStart + 3
				
				// Trigger autosave without immediate state update
				handleAutoSave({ ...editingEntity, content: newContent })
			} else if (isIndented) {
				e.preventDefault()
				
				// Insert newline with "  " (two spaces) prefix
				const newContent = 
					content.substring(0, selectionStart) + 
					'\n  ' + 
					content.substring(selectionEnd)
				
				textarea.value = newContent
				
				// Move cursor after "  "
				textarea.selectionStart = selectionStart + 3
				textarea.selectionEnd = selectionStart + 3
				
				// Trigger autosave without immediate state update
				handleAutoSave({ ...editingEntity, content: newContent })
			}
		} else if (e.key === 'Backspace') {
			// After backspace, check if we need to clean up lone dashes or indentation
			setTimeout(() => {
				const newContent = textarea.value
				const lines = newContent.split('\n')
				let changed = false
				
				for (let i = 0; i < lines.length; i++) {
					// Remove if line is exactly "-" (no trailing space)
					if (lines[i].trim() === '-' && !lines[i].endsWith(' ')) {
						lines[i] = ''
						changed = true
					}
					// Remove if line is exactly "  " (two spaces, nothing else)
					if (lines[i] === '  ') {
						lines[i] = ''
						changed = true
					}
				}
				
				if (changed) {
					const updatedContent = lines.join('\n')
					textarea.value = updatedContent
					// Trigger autosave without immediate state update
					handleAutoSave({ ...editingEntity, content: updatedContent })
				}
			}, 0)
		}
	}

	//test
	return (
		<div className="app">
			{view === 'main' && (
				<>
					<header className="app__header">
						<button className="app__header-btn" onClick={handleCreateNote}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M240 432L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0c8.8 0 16 7.2 16 16l0 176-88 0c-39.8 0-72 32.2-72 72l0 88zM380.1 320L288 412.1 288 344c0-13.3 10.7-24 24-24l68.1 0zM0 416c0 35.3 28.7 64 64 64l197.5 0c17 0 33.3-6.7 45.3-18.7L429.3 338.7c12-12 18.7-28.3 18.7-45.3L448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416z"/></svg>
						</button>
						<button className="app__header-btn" onClick={handleCreateList}>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
						</button>
						<button className="app__header-btn">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 550 550"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0-201.4 201.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3 448 192c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 96C35.8 96 0 131.8 0 176L0 432c0 44.2 35.8 80 80 80l256 0c44.2 0 80-35.8 80-80l0-80c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 80c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-256c0-8.8 7.2-16 16-16l80 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 96z"/></svg>
						</button>
					</header>
					<main className="app__main">
						<div className="app__content">
						{/* Notes and Lists - Draggable (Mouse & Touch) */}
						{(draggedEntityId && itemsOrder.length > 0 ? itemsOrder : getMainEntities()).map((entity, idx) => (
							<div key={`wrapper-${entity.id}`} className="entity-item-wrapper">
								<div 
									data-entity-id={entity.id}
									className={`entity-item ${draggedEntityId === entity.id ? 'entity-item--hidden' : ''}`}
									onTouchStart={(e) => handleEntityTouchStart(e, entity.id)}
									onTouchMove={(e) => handleEntityTouchMove(e)}
									onTouchEnd={(e) => handleEntityTouchEnd(e)}
									onClick={() => !draggedEntityId && !swipedEntityId && handleOpenEntity(entity)}
									>
									<div 
										className="entity-item__avatar"
										style={{ background: entity.color }}
										onClick={(e) => {
											e.stopPropagation()
											openColorPicker(entity.id, false, e)
										}}
									>
										{entity.type === 'note' ? (
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M240 432L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0c8.8 0 16 7.2 16 16l0 176-88 0c-39.8 0-72 32.2-72 72l0 88zM380.1 320L288 412.1 288 344c0-13.3 10.7-24 24-24l68.1 0zM0 416c0 35.3 28.7 64 64 64l197.5 0c17 0 33.3-6.7 45.3-18.7L429.3 338.7c12-12 18.7-28.3 18.7-45.3L448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416z"/></svg>
										) : (
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
										)}
									</div>
									<div className="entity-item__content">
										<span className="entity-item__title">{entity.title}</span>
										{entity.items && <span className="entity-item__count">{entity.items.length}</span>}
									</div>
								</div>
								{/* Delete button that slides in on swipe */}
								{swipedEntityId === entity.id && (
									<button
										className={`entity-item__delete-btn${deletingEntityId === entity.id ? ' closing' : ''}`}
										onClick={() => handleSwipeDelete(entity.id)}
										title="Delete"
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512">
											<path d="M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z"/>
										</svg>
										</button>
								)}
								{/* Show empty placeholder at hover position */}
								{draggedEntityId && hoverIndex === idx && (
									<div className="entity-item--empty" key={`empty-${idx}`} />
								)}
							</div>
						))}
						</div>

						{/* Ghost Element - Follows cursor during drag */}
						{draggedEntityId && (() => {
							const draggedEntity = entities.find(e => e.id === draggedEntityId)
							return draggedEntity ? (
								<div 
									className="entity-item--ghost"
									key="ghost"
									style={{
										position: 'fixed',
										left: 0,
										right: 0,
										top: `${ghostPositionRef.current.y}px`,
										pointerEvents: 'none',
										zIndex: 2500,
										transform: 'translateY(-50%)',
										margin: 0,
										width: '100vw',
										borderTop: 'none',
										cursor: 'grabbing',
										opacity: 0.5,
										boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
									}}
								>
									<div style={{
										display: 'flex',
										alignItems: 'center',
										gap: '0.75rem',
										padding: '0.5rem',
										maxWidth: '600px'
									}}>
										<div 
											style={{
												width: '3.5vh',
												height: '3.5vh',
												minWidth: '3.5vh',
												borderRadius: '50%',
												background: draggedEntity.color,
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												color: 'var(--color-text-primary)'
											}}
										>
											{draggedEntity.type === 'note' ? (
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" style={{ width: '60%', height: '60%', fill: 'currentColor' }}><path d="M240 432L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0c8.8 0 16 7.2 16 16l0 176-88 0c-39.8 0-72 32.2-72 72l0 88zM380.1 320L288 412.1 288 344c0-13.3 10.7-24 24-24l68.1 0zM0 416c0 35.3 28.7 64 64 64l197.5 0c17 0 33.3-6.7 45.3-18.7L429.3 338.7c12-12 18.7-28.3 18.7-45.3L448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416z"/></svg>
											) : (
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style={{ width: '60%', height: '60%', fill: 'currentColor' }}><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
											)}
										</div>
										<div style={{ color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>
											{draggedEntity.title}
										</div>
									</div>
								</div>
							) : null
						})()}

						{/* Preset Lists Grid */}
						<div className="preset-grid">
							{presetLists.map((list) => (
								<div key={list?.id} className="preset-grid__cell" onClick={() => list && handleOpenEntity(list)}>
								<div className="preset-grid__avatar" style={{ background: list?.color }}>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
								</div>
								<div className="preset-grid__content">
									<span className="preset-grid__title">{list?.title}</span>
									<span className="preset-grid__count">{list?.items?.length || 0}</span>
								</div>
								</div>
							))}
						</div>
					</main>
				</>
			)}

			{view === 'note-create' && (
			<div 
				className="fullscreen-view"
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<div className="fullscreen-view__header">
				<div 
					className="fullscreen-view__avatar"
					style={{ background: tempColor || DEFAULT_COLOR }}
					onClick={(e) => {
						setSelectedEntityId('temp-note')
						setPickerViewMode('fullscreen')
						openColorPicker('temp-note', false, e)
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M240 432L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0c8.8 0 16 7.2 16 16l0 176-88 0c-39.8 0-72 32.2-72 72l0 88zM380.1 320L288 412.1 288 344c0-13.3 10.7-24 24-24l68.1 0zM0 416c0 35.3 28.7 64 64 64l197.5 0c17 0 33.3-6.7 45.3-18.7L429.3 338.7c12-12 18.7-28.3 18.7-45.3L448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416z"/></svg>
				</div>
				<input
					type="text"
					className="fullscreen-view__input"
					placeholder="Note title"
					value={titleInput}
					onChange={handleTitleInputChange}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && titleInput.trim()) {
							e.preventDefault()
							document.querySelector('.note-create-textarea')?.focus()
						}
					}}
					autoFocus
				/>
			</div>
			<div className="fullscreen-view__content">
				<textarea
					className="note-create-textarea fullscreen-view__textarea"
					value={bodyInput}
					onChange={handleBodyInputChange}
				/>
			</div>
		</div>
	)}

		{view === 'entity-view' && editingEntity && (
			<div 
				className="fullscreen-view"
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<div className="fullscreen-view__header">
					<div 
						className="fullscreen-view__avatar"
						style={{ background: editingEntity.color }}
						onClick={(e) => {
							if (editingEntity.preset) return
							setSelectedEntityId(editingEntity.id)
							setPickerViewMode('fullscreen')
							openColorPicker(editingEntity.id, false, e)
						}}
					>
						{editingEntity.type === 'note' ? (
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M240 432L64 432c-8.8 0-16-7.2-16-16L48 96c0-8.8 7.2-16 16-16l320 0c8.8 0 16 7.2 16 16l0 176-88 0c-39.8 0-72 32.2-72 72l0 88zM380.1 320L288 412.1 288 344c0-13.3 10.7-24 24-24l68.1 0zM0 416c0 35.3 28.7 64 64 64l197.5 0c17 0 33.3-6.7 45.3-18.7L429.3 338.7c12-12 18.7-28.3 18.7-45.3L448 96c0-35.3-28.7-64-64-64L64 32C28.7 32 0 60.7 0 96L0 416z"/></svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
						)}
					</div>
					<input
						type="text"
						className="fullscreen-view__input"
						placeholder={editingEntity.type === 'note' ? 'Note title' : 'List title'}
						value={editingEntity.preset ? getPresetDisplayName(editingEntity.title) : editingEntity.title}
					onChange={(e) => handleEntityFieldChange('title', e.target.value)}
					disabled={editingEntity.preset}
				/>
				</div>
				<div className="fullscreen-view__content">
					{editingEntity.type === 'note' && (
						<>
							{/* Styled display layer */}
							<div className="fullscreen-view__textarea fullscreen-view__textarea--display">
								{(editingEntity.content || '').split('\n').map((line, idx) => {
									const trimmed = line.trim()
									const isListItem = trimmed.startsWith('- ') || trimmed === '-'
									const isIndented = line.startsWith('  ') && !line.startsWith('- ')
									const className = isListItem ? 'note-list-item' : isIndented ? 'note-indented-item' : ''
									return (
										<div key={idx} className={className}>
											{line || '\u00A0'}
										</div>
									)
								})}
							</div>
							{/* Editable input layer */}
							<textarea
								ref={entityViewTextareaRef}
								className="fullscreen-view__textarea fullscreen-view__textarea--input"
								defaultValue={editingEntity.content || ''}
								onChange={handleNoteBodyInput}
								onKeyDown={handleNoteBodyKeyDown}
								autoFocus
							/>
						</>
					)}
					{editingEntity.type === 'list' && (
						<div className="list-items-view">
							{editingEntity.items?.map((item, idx) => (
								<div key={idx} className="list-item-edit">
									<input
										type="text"
										value={item}
										onChange={(e) => {
											const newItems = [...editingEntity.items]
											newItems[idx] = e.target.value
											handleEntityFieldChange('items', newItems)
										}}
										placeholder="Item"
									/>
								</div>
							))}
							<input
								type="text"
								className="list-item-add"
								placeholder="Add item"
								onKeyDown={(e) => {
									if (e.key === 'Enter' && e.target.value.trim()) {
										const newItems = [...(editingEntity.items || []), e.target.value]
										handleEntityFieldChange('items', newItems)
										e.target.value = ''
									}
								}}
							/>
						</div>
					)}
				</div>
			</div>
		)}

		{view === 'list-create' && (
				<div 
					className="fullscreen-view"
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
				>
					<div className="fullscreen-view__header">
						<div 
							className="fullscreen-view__avatar"
							style={{ background: tempColor || DEFAULT_COLOR }}
							onClick={() => {
								setSelectedEntityId('temp-list')
								setPickerViewMode('fullscreen')
								setShowColorPicker(true)
							}}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M133.8 36.3c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 158 47 153L7 113C-2.3 103.6-2.3 88.4 7 79S31.6 69.7 41 79l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zm0 160c10.9 7.6 13.5 22.6 5.9 33.4l-56 80c-4.1 5.8-10.5 9.5-17.6 10.1S52 318 47 313L7 273c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l19.8 19.8 39.6-56.6c7.6-10.9 22.6-13.5 33.4-5.9zM224 96c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zm0 160c0-17.7 14.3-32 32-32l224 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-224 0c-17.7 0-32-14.3-32-32zM160 416c0-17.7 14.3-32 32-32l288 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-288 0c-17.7 0-32-14.3-32-32zM64 376a40 40 0 1 1 0 80 40 40 0 1 1 0-80z"/></svg>
						</div>
						<input
							type="text"
							className="fullscreen-view__input"
							placeholder="List title"
							value={titleInput}
							onChange={(e) => setTitleInput(e.target.value)}
							autoFocus
						/>
					</div>
					<div className="fullscreen-view__content"></div>
				</div>
			)}

			{/* Color Picker */}
			{showColorPicker && (
			<>
				{/* Backdrop overlay to block clicks behind picker */}
				<div
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0)',
						zIndex: 2000,
						pointerEvents: 'auto'
					}}
					onClick={() => setShowColorPicker(false)}
				/>
				<div ref={colorPickerRef} className={`color-picker color-picker--${pickerViewMode}`} style={pickerViewMode === 'main' ? pickerPosition : {}}>
					<div className="color-picker-grid">
						{PRESET_COLORS.map((color) => (
							<button
								key={color.name}
								className="color-picker-btn"
								style={{ background: color.hex }}
								onClick={() => {
									if (selectedEntityId?.startsWith('temp-')) {
										setTempColor(color.hex)
									} else {
										handleColorSelect(color.hex)
									}
									setShowColorPicker(false)
								}}
							/>
						))}
					</div>
				</div>
			</>
		)}

		{/* Delete Confirmation Modal */}
		{deleteConfirmEntityId && (
			<>
				<div
					className="modal-overlay"
					onClick={() => setDeleteConfirmEntityId(null)}
				/>
				<div className="modal">
					<div className="modal__content">
						<h2 className="modal__title">Delete?</h2>
						<p className="modal__message">This action can't be undone.</p>
						<div className="modal__buttons">
							<button
								className="modal__btn modal__btn--cancel"
								onClick={() => setDeleteConfirmEntityId(null)}
							>
								Cancel
							</button>
							<button
								className="modal__btn modal__btn--delete"
								onClick={() => {
									handleDeleteEntity(deleteConfirmEntityId)
									setDeleteConfirmEntityId(null)
								}}
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			</>
		)}
		</div>
	)
}

export default App

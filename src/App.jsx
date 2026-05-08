import { useEffect, useState, useRef } from 'react'
import './App.css'
import { initDB, getAllRecords, addOrUpdate } from './utils/indexeddb'
import { DB_STORES } from './config/db'
import { initializePresetLists, PRESET_LIST_NAMES } from './utils/presetLists'

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
	const [presetLists, setPresetLists] = useState([])
	const [view, setView] = useState('main') // 'main', 'note-create', 'list-create'
	const [titleInput, setTitleInput] = useState('')
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
	const touchStartX = useRef(0)
	const touchEndX = useRef(0)

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
		setTempColor(null)
		setView('note-create')
	}

	const handleCreateList = () => {
		setTitleInput('')
		setTempColor(null)
		setView('list-create')
	}

	const handleBack = () => {
		setView('main')
		setTitleInput('')
		setShowColorPicker(false)
	}

	const handleTouchStart = (e) => {
		touchStartX.current = e.changedTouches[0].screenX
	}

	const handleTouchEnd = (e) => {
		touchEndX.current = e.changedTouches[0].screenX
		handleSwipe()
	}

	const handleSwipe = () => {
		const swipeThreshold = 50 // minimum pixels to consider as swipe
		const diff = touchEndX.current - touchStartX.current

		// Swipe left to right (positive difference)
		if (diff > swipeThreshold) {
			// If title is empty, just go back without saving
			if (!titleInput.trim()) {
				setView('main')
				setTitleInput('')
				setShowColorPicker(false)
				return
			}

			// If title exists, save it
			if (view === 'note-create') {
				handleSaveNoteAndReturn()
			} else if (view === 'list-create') {
				handleSaveListAndReturn()
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

			await addOrUpdate(dbRef.current, 'entities', {
				...entity,
				color: colorHex
			})
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
		if (!titleInput.trim() || !dbRef.current) return

		try {
			const maxOrder = Math.max(...entities.filter(e => !e.preset).map(e => e.order || 0), 0)
			await addOrUpdate(dbRef.current, 'entities', {
				id: `note-${Date.now()}`,
				type: 'note',
				title: titleInput,
				body: '',
				color: tempColor || DEFAULT_COLOR,
				order: maxOrder + 1,
				lastChanged: new Date().toISOString()
			})
			await loadAllEntities(dbRef.current)
			setView('main')
			setTitleInput('')
			setTempColor(null)
			setShowColorPicker(false)
		} catch (err) {
			console.error('Failed to save note:', err)
		}
	}

	const handleSaveListAndReturn = async () => {
		if (!titleInput.trim() || !dbRef.current) return

		try {
			const maxOrder = Math.max(...entities.filter(e => !e.preset).map(e => e.order || 0), 0)
			await addOrUpdate(dbRef.current, 'entities', {
				id: `list-${Date.now()}`,
				type: 'list',
				title: titleInput,
				preset: false,
				items: [],
				color: tempColor || DEFAULT_COLOR,
				order: maxOrder + 1,
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

	// Drag and drop handlers (mouse)
	const handleDragStart = (e, entityId) => {
		setDraggedEntityId(entityId)
		dragStartYRef.current = e.clientY
		ghostPositionRef.current = { x: e.clientX, y: e.clientY }
		setGhostTrigger(t => t + 1)
		e.dataTransfer.effectAllowed = 'move'
	}

	const handleDragOver = (e) => {
		e.preventDefault()
		e.dataTransfer.dropEffect = 'move'
		
		if (!draggedEntityId) return
		
		ghostPositionRef.current = { x: e.clientX, y: e.clientY }
		
		// Find which item is under the cursor
		const targetElement = document.elementFromPoint(e.clientX, e.clientY)
		const itemDiv = targetElement?.closest('[data-entity-id]')
		const targetEntityId = itemDiv?.dataset?.entityId
		
		// Update hover index for empty placeholder
		if (itemDiv) {
			const hoveredIdx = itemsOrder.findIndex(e => e.id === targetEntityId)
			setHoverIndex(hoveredIdx)
		}
		
		if (!targetEntityId || targetEntityId === draggedEntityId) {
			setGhostTrigger(t => t + 1)
			return
		}
		
		// Calculate if we've crossed 50% of the target
		const itemRect = itemDiv.getBoundingClientRect()
		const itemCenter = itemRect.top + itemRect.height / 2
		const distanceFromCenter = e.clientY - itemCenter
		
		// If cursor is past 50% of the item height, swap in local state
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
		
		setGhostTrigger(t => t + 1)
	}

	const handleDrop = async (e) => {
		e.preventDefault()
		
		if (!draggedEntityId) {
			setDraggedEntityId(null)
			setItemsOrder([])
			setHoverIndex(-1)
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

	const handleDragEnd = () => {
		setDraggedEntityId(null)
		setItemsOrder([])
		setHoverIndex(-1)
	}

	// Touch handlers for mobile drag-and-drop
	const handleEntityTouchStart = (e, entityId) => {
		setDraggedEntityId(entityId)
		const touch = e.touches[0]
		dragStartYRef.current = touch.clientY
		ghostPositionRef.current = { x: touch.clientX, y: touch.clientY }
		setGhostTrigger(t => t + 1)
	}

	const handleEntityTouchMove = (e) => {
		if (!draggedEntityId) return
		
		const touch = e.touches[0]
		ghostPositionRef.current = { x: touch.clientX, y: touch.clientY }
		
		// Find element under touch point
		const targetElement = document.elementFromPoint(touch.clientX, touch.clientY)
		const itemDiv = targetElement?.closest('[data-entity-id]')
		const targetEntityId = itemDiv?.dataset?.entityId
		
		if (!targetEntityId || targetEntityId === draggedEntityId) {
			setGhostTrigger(t => t + 1)
			return
		}
		
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
		
		setGhostTrigger(t => t + 1)
	}

	const handleEntityTouchEnd = async (e) => {
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
							<div key={`wrapper-${entity.id}`}>
								<div 
									data-entity-id={entity.id}
									className={`entity-item ${draggedEntityId === entity.id ? 'entity-item--hidden' : ''}`}
									draggable
									onDragStart={(e) => handleDragStart(e, entity.id)}
									onDragOver={(e) => handleDragOver(e)}
									onDrop={(e) => handleDrop(e)}
									onDragEnd={handleDragEnd}
									onTouchStart={(e) => handleEntityTouchStart(e, entity.id)}
									onTouchMove={(e) => handleEntityTouchMove(e)}
									onTouchEnd={(e) => handleEntityTouchEnd(e)}
									>
									<div 
										className="entity-item__avatar"
										style={{ background: entity.color }}
										onClick={(e) => openColorPicker(entity.id, false, e)}
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
								<div key={list?.id} className="preset-grid__cell">
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
					value={titleInput}					onChange={(e) => setTitleInput(e.target.value)}
					autoFocus
				/>
			</div>
			<div className="fullscreen-view__content"></div>
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
			)}
		</div>
	)
}

export default App

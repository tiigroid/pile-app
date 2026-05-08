# React + Vite SPA with IndexedDB

A modern single-page application built with React and Vite, featuring IndexedDB for client-side data persistence.

## Features

- **React 19** with Vite for fast HMR and optimized builds
- **IndexedDB** integration for offline data storage
- **Custom React Hook** (`useIndexedDB`) for easy data management
- **Utility Functions** for IndexedDB operations
- **ESLint Configuration** for code quality

## Project Structure

```
src/
├── App.jsx              # Main app component
├── main.jsx             # Entry point
├── App.css              # App styles
├── index.css            # Global styles
└── utils/
    ├── indexeddb.js     # IndexedDB utility functions
    └── useIndexedDB.js  # React hook for IndexedDB
```

## Quick Start

### Development

Run the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Production Build

Create an optimized production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Using IndexedDB

### With the Custom Hook

```javascript
import { useIndexedDB } from './utils/useIndexedDB'

function MyComponent() {
	const { data, loading, error, add, remove, refresh } = useIndexedDB('items')

	const handleAdd = async () => {
		await add({ id: 1, name: 'Item 1' })
	}

	const handleRemove = async () => {
		await remove(1)
	}

	if (loading) return <div>Loading...</div>
	if (error) return <div>Error: {error}</div>

	return (
		<div>
			{data.map(item => (
				<div key={item.id}>
					{item.name}
					<button onClick={() => handleRemove()}>Delete</button>
				</div>
			))}
			<button onClick={handleAdd}>Add Item</button>
		</div>
	)
}
```

### Using Utility Functions Directly

```javascript
import { initDB, getAllRecords, addOrUpdate, deleteRecord } from './utils/indexeddb'

const db = await initDB({ items: 'id' })
const records = await getAllRecords(db, 'items')
await addOrUpdate(db, 'items', { id: 1, name: 'Item 1' })
await deleteRecord(db, 'items', 1)
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Technologies

- [React 19](https://react.dev)
- [Vite](https://vitejs.dev)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [ESLint](https://eslint.org)

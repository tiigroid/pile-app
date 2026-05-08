# React + Vite SPA with IndexedDB

## Project Setup Complete ✓

A React single-page application built with Vite and IndexedDB for client-side data persistence.

## Configuration

- **Framework**: React 19
- **Build Tool**: Vite 8.0
- **Data Storage**: IndexedDB
- **Development Server**: http://localhost:5173
- **Code Style**: Tabs, single quotes, minimal semicolons

## Project Structure

```
src/
├── App.jsx                    Main component
├── main.jsx                   Entry point
├── utils/
│   ├── indexeddb.js          IndexedDB functions
│   └── useIndexedDB.js        React hook for IndexedDB
└── assets/                    Static assets
```

## Quick Commands

- `npm run dev` - Start development server with HMR
- `npm run build` - Create production build
- `npm run preview` - Preview production build
- `npm run lint` - Run code linter

## Using IndexedDB

### React Hook Pattern (Recommended)

```javascript
import { useIndexedDB } from './utils/useIndexedDB'

function MyComponent() {
	const { data, loading, error, add, remove, refresh } = useIndexedDB('items')

	return (
		// Your component JSX
	)
}
```

### Utility Functions

Direct access via `src/utils/indexeddb.js`:
- `initDB(stores)` - Initialize database
- `addOrUpdate(db, storeName, data)` - Save record
- `getRecord(db, storeName, key)` - Get single record
- `getAllRecords(db, storeName)` - Get all records
- `deleteRecord(db, storeName, key)` - Delete record
- `queryByIndex(db, storeName, indexName, value)` - Query by index

## Database Initialization

The `useIndexedDB` hook automatically initializes the database with:
- Default object store named after the store parameter
- Key path: 'id'
- Configurable via the stores parameter

## VS Code Setup

- Tasks configured in `.vscode/tasks.json`
- Default build task: `npm run dev`
- Press `Ctrl+Shift+B` to run build task

## Development Notes

- HMR (Hot Module Replacement) enabled for instant updates
- ESLint configured for code quality
- Production build optimization included
- IndexedDB works offline by default

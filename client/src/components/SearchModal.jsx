import React, { useState, useEffect, useRef } from 'react';
import { X, Search, File, Folder, Maximize2, ChevronDown } from 'lucide-react';
import axios from 'axios';

const SearchModal = ({ isOpen, onClose, onNavigateResult }) => {
    // Search State
    const [conditions, setConditions] = useState([
        { field: 'name', operator: 'contains', value: '' }
    ]);
    const [logic, setLogic] = useState('AND');
    const [typeFilter, setTypeFilter] = useState('directory'); // 'directory', 'file', 'all'
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Sort State
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    const formatSize = (bytes) => {
        if (!bytes) return '—';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const formatType = (entry) => {
        if (entry.type === 'directory') return 'Folder';
        const parts = entry.name.split('.');
        if (parts.length > 1) {
            return parts.pop().toUpperCase();
        }
        return 'FILE';
    };

    // Window State (Draggable & Resizable)
    const [windowState, setWindowState] = useState(() => {
        const saved = localStorage.getItem('searchModalCtx');
        return saved ? JSON.parse(saved) : {
            x: window.innerWidth / 2 - 450,
            y: window.innerHeight / 2 - 350,
            w: 900,
            h: 700
        };
    });

    // Column Widths (Resizable)
    const [colWidths, setColWidths] = useState(() => {
        const saved = localStorage.getItem('searchModalCols');
        return saved ? JSON.parse(saved) : { name: 350, disk: 150, size: 100, type: 100 };
    });

    // Refs for Drag/Resize interactions
    const windowRef = useRef(null);
    const dragRef = useRef({ active: false, type: null, startX: 0, startY: 0, initial: {} });

    // Persist State
    useEffect(() => {
        localStorage.setItem('searchModalCtx', JSON.stringify(windowState));
    }, [windowState]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isOpen) return;
            if (e.key === 'Enter') {
                handleSearch();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, conditions, logic, typeFilter]); // dependencies for handleSearch closure capture

    if (!isOpen) return null;

    // --- Window Drag/Resize Handlers ---
    const startWindowDrag = (e) => {
        e.preventDefault();
        dragRef.current = {
            active: true,
            type: 'move',
            startX: e.clientX,
            startY: e.clientY,
            initial: { ...windowState }
        };
        document.addEventListener('mousemove', handleWindowMouseMove);
        document.addEventListener('mouseup', handleWindowMouseUp);
    };

    const startWindowResize = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            active: true,
            type: 'resize',
            startX: e.clientX,
            startY: e.clientY,
            initial: { ...windowState }
        };
        document.addEventListener('mousemove', handleWindowMouseMove);
        document.addEventListener('mouseup', handleWindowMouseUp);
    };

    const handleWindowMouseMove = (e) => {
        if (!dragRef.current.active) return;
        const { type, startX, startY, initial } = dragRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (type === 'move') {
            setWindowState(prev => ({ ...prev, x: initial.x + dx, y: initial.y + dy }));
        } else if (type === 'resize') {
            setWindowState(prev => ({
                ...prev,
                w: Math.max(600, initial.w + dx),
                h: Math.max(400, initial.h + dy)
            }));
        }
    };

    const handleWindowMouseUp = () => {
        dragRef.current.active = false;
        document.removeEventListener('mousemove', handleWindowMouseMove);
        document.removeEventListener('mouseup', handleWindowMouseUp);
    };

    // --- Column Resize Handlers ---
    const startColResize = (e, col) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            active: true,
            type: 'col-resize',
            col,
            startX: e.clientX,
            initialWidth: colWidths[col]
        };
        document.addEventListener('mousemove', handleColMouseMove);
        document.addEventListener('mouseup', handleColMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleColMouseMove = (e) => {
        if (!dragRef.current.active || dragRef.current.type !== 'col-resize') return;
        const { col, startX, initialWidth } = dragRef.current;
        const dx = e.clientX - startX;
        const newWidth = Math.max(50, initialWidth + dx);

        setColWidths(prev => ({ ...prev, [col]: newWidth }));
    };

    const handleColMouseUp = () => {
        dragRef.current.active = false;
        document.removeEventListener('mousemove', handleColMouseMove);
        document.removeEventListener('mouseup', handleColMouseUp);
        document.body.style.cursor = 'default';
    };


    // --- Generic Logic ---
    const addCondition = () => {
        setConditions([...conditions, { field: 'name', operator: 'contains', value: '' }]);
    };

    const removeCondition = (index) => {
        const newConds = [...conditions];
        newConds.splice(index, 1);
        setConditions(newConds);
    };

    const updateCondition = (index, key, val) => {
        const newConds = [...conditions];
        newConds[index][key] = val;
        setConditions(newConds);
    };

    const handleSearch = async () => {
        setSearching(true);
        try {
            const res = await axios.post('/api/disks/search', {
                conditions,
                logic,
                type: typeFilter
            });
            setResults(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setSearching(false);
        }
    };

    // Sorting
    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedResults = [...results].sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (sortConfig.key === 'location') {
            valA = a.Disk ? a.Disk.name : '';
            valB = b.Disk ? b.Disk.name : '';
        }

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <div className="fixed inset-0 z-50 pointer-events-none">
            {/* Modal Window */}
            <div
                ref={windowRef}
                style={{
                    left: windowState.x,
                    top: windowState.y,
                    width: windowState.w,
                    height: windowState.h,
                    position: 'absolute'
                }}
                className="bg-secondary border border-border rounded-xl flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10 pointer-events-auto"
            >
                {/* Header (Draggable) */}
                <div
                    onMouseDown={startWindowDrag}
                    className="h-16 border-b border-border flex items-center justify-between px-6 bg-tertiary/50 cursor-grab active:cursor-grabbing select-none"
                >
                    <h2 className="font-bold text-lg flex items-center gap-2.5 text-text-primary">
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                            <Search size={18} />
                        </div>
                        Advanced Search
                    </h2>
                    <div className="flex gap-2" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Filter Builder */}
                <div className="p-6 border-b border-border bg-secondary/95">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-sm font-medium text-text-secondary">Match</span>
                        <div className="relative">
                            <select
                                value={logic}
                                onChange={(e) => setLogic(e.target.value)}
                                className="appearance-none p-1.5 pl-3 pr-8 rounded-md bg-tertiary text-text-primary border border-border text-sm focus:border-accent outline-none cursor-pointer"
                            >
                                <option value="AND">ALL</option>
                                <option value="OR">ANY</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                        <span className="text-sm font-medium text-text-secondary">of the following:</span>
                    </div>

                    {/* Type Filter Toggles */}
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-sm font-medium text-text-secondary">Type:</span>
                        <div className="flex bg-tertiary rounded-lg p-1 border border-border">
                            <button
                                onClick={() => setTypeFilter('directory')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${typeFilter === 'directory' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted hover:text-white'}`}
                            >
                                Folders
                            </button>
                            <button
                                onClick={() => setTypeFilter('file')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${typeFilter === 'file' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted hover:text-white'}`}
                            >
                                Files
                            </button>
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${typeFilter === 'all' ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'text-text-muted hover:text-white'}`}
                            >
                                All
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 max-h-[150px] overflow-y-auto">
                        {conditions.map((cond, idx) => (
                            <div key={idx} className="flex items-center gap-3 animate-fade-in">
                                <div className="relative">
                                    <select
                                        value={cond.field}
                                        onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                                        className="appearance-none p-2 pl-3 pr-8 rounded-md bg-tertiary text-text-primary border border-border text-sm w-32 focus:border-accent outline-none cursor-pointer"
                                    >
                                        <option value="name">Name</option>
                                        <option value="size">Size</option>
                                        <option value="type">Type</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                                <div className="relative">
                                    <select
                                        value={cond.operator}
                                        onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                                        className="appearance-none p-2 pl-3 pr-8 rounded-md bg-tertiary text-text-primary border border-border text-sm w-36 focus:border-accent outline-none cursor-pointer"
                                    >
                                        <option value="contains">Contains</option>
                                        <option value="eq">Equals</option>
                                        <option value="gt">Greater Than</option>
                                        <option value="lt">Less Than</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                </div>
                                <input
                                    type="text"
                                    value={cond.value}
                                    onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                                    className="flex-1 p-2 rounded-md bg-black/40 text-text-primary border border-border text-sm focus:border-accent outline-none placeholder-text-muted"
                                    placeholder="Value..."
                                />
                                <button
                                    onClick={() => removeCondition(idx)}
                                    className="p-2 rounded-md hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 flex gap-3 items-center">
                        <button
                            onClick={addCondition}
                            className="text-sm text-accent hover:text-accent-hover font-medium px-2 py-1 rounded hover:bg-accent/10 transition-colors"
                        >
                            + Add Condition
                        </button>
                        <div className="flex-1"></div>
                        <button
                            onClick={handleSearch}
                            className="bg-accent hover:bg-accent-hover text-white px-6 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
                        >
                            {searching ? 'Searching...' : 'Search Files'}
                        </button>
                    </div>
                </div>

                {/* Results Table */}
                <div className="flex-1 overflow-y-auto bg-primary flex flex-col relative">
                    {/* Table Header */}
                    <div className="flex bg-secondary/95 border-b border-border/50 sticky top-0 z-10 text-xs font-semibold text-text-muted uppercase tracking-wider select-none">

                        {/* Name Column */}
                        <div
                            style={{ width: colWidths.name }}
                            className="relative px-6 py-3 cursor-pointer hover:text-text-primary transition-colors flex items-center gap-2 border-r border-border/10"
                            onClick={() => handleSort('name')}
                        >
                            Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20"
                                onMouseDown={(e) => startColResize(e, 'name')}
                            />
                        </div>

                        {/* Disk Column */}
                        <div
                            style={{ width: colWidths.disk }}
                            className="relative px-4 py-3 cursor-pointer hover:text-text-primary transition-colors flex items-center gap-2 border-r border-border/10"
                            onClick={() => handleSort('location')}
                        >
                            Disk {sortConfig.key === 'location' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20"
                                onMouseDown={(e) => startColResize(e, 'disk')}
                            />
                        </div>

                        {/* Size Column */}
                        <div
                            style={{ width: colWidths.size }}
                            className="relative px-4 py-3 cursor-pointer hover:text-text-primary transition-colors flex items-center gap-2 border-r border-border/10"
                            onClick={() => handleSort('size')}
                        >
                            Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20"
                                onMouseDown={(e) => startColResize(e, 'size')}
                            />
                        </div>

                        {/* Type/Path Column */}
                        <div
                            style={{ width: colWidths.type }}
                            className="relative px-4 py-3 cursor-pointer hover:text-text-primary transition-colors flex items-center gap-2"
                            onClick={() => handleSort('type')}
                        >
                            Type {sortConfig.key === 'type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20"
                                onMouseDown={(e) => startColResize(e, 'type')}
                            />
                        </div>
                    </div>

                    {/* Rows */}
                    <div className="flex-1 overflow-y-auto">
                        <div style={{ minWidth: colWidths.name + colWidths.disk + colWidths.size + colWidths.type }}>
                            {sortedResults.map(res => (
                                <div
                                    key={res.id}
                                    onDoubleClick={() => onNavigateResult && onNavigateResult(res)}
                                    className="flex border-b border-border/30 hover:bg-white/5 transition-colors items-center group cursor-pointer text-sm"
                                >
                                    <div style={{ width: colWidths.name }} className="px-6 py-3 flex items-center gap-3 overflow-hidden">
                                        <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${res.type === 'directory'
                                            ? 'bg-blue-500/20 text-blue-400'
                                            : 'bg-tertiary text-text-secondary'
                                            }`}>
                                            {res.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                                        </div>
                                        <div className="truncate">
                                            <div className="font-medium text-text-primary group-hover:text-white transition-colors truncate">{res.name}</div>
                                        </div>
                                    </div>

                                    <div style={{ width: colWidths.disk }} className="px-4 py-3 text-xs text-text-muted truncate">
                                        {res.Disk ? res.Disk.name : '-'}
                                    </div>

                                    <div style={{ width: colWidths.size }} className="px-4 py-3 text-xs text-text-muted truncate font-mono">
                                        {formatSize(res.size)}
                                    </div>

                                    <div style={{ width: colWidths.type }} className="px-4 py-3 text-xs text-text-muted truncate">
                                        <span className={`px-2 py-0.5 rounded-md font-medium ${res.type === 'directory'
                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                            : 'bg-white/10 text-white border border-white/10'
                                            }`}>
                                            {formatType(res)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {results.length === 0 && !searching && (
                            <div className="flex flex-col items-center justify-center py-20 text-text-muted/50">
                                <Search size={48} className="mb-4 opacity-20" />
                                <p>No results found</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Resize Handle (Bottom Right) */}
                <div
                    onMouseDown={startWindowResize}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-accent/50 rounded-tl z-20"
                />
            </div>
        </div>
    );
};

export default SearchModal;

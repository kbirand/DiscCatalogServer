import React, { useState, useEffect, useRef } from 'react';
import { Folder, File, ArrowLeft, HardDrive, Clock, Search, ChevronRight, Database } from 'lucide-react';
import axios from 'axios';

const formatSize = (bytes) => {
    if (bytes === 0 || !bytes) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatType = (entry) => {
    if (entry.type === 'directory') return 'Folder';
    const parts = entry.name.split('.');
    if (parts.length > 1) {
        return parts.pop().toUpperCase();
    }
    return 'FILE';
};

const FileBrowser = ({ selectedDisk, currentPathStack, setCurrentPathStack, highlightedItemId, onClearHighlight, allDisks }) => {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    // Selection State (Synced with Search Highlight, but allows local override)
    const [selectedId, setSelectedId] = useState(null);

    // --- Column Resizing State ---
    const [colWidths, setColWidths] = useState(() => {
        const saved = localStorage.getItem('browserColWidths');
        return saved ? JSON.parse(saved) : { name: 400, date: 200, size: 100, type: 80 };
    });

    const dragRef = useRef({ active: false, col: null, startX: 0, initialWidth: 0 });
    const rowRefs = useRef({}); // For scrolling to highlighted item

    useEffect(() => {
        localStorage.setItem('browserColWidths', JSON.stringify(colWidths));
    }, [colWidths]);

    // React to Path or Disk changes
    useEffect(() => {
        if (selectedDisk) {
            const parent = currentPathStack.length > 0 ? currentPathStack[currentPathStack.length - 1] : null;
            fetchEntries(selectedDisk.id, parent ? parent.id : null);
            setSelectedId(null); // Clear selection on path change
        } else {
            setEntries([]);
        }
    }, [selectedDisk, currentPathStack]);

    // Sync Search Highlight to Local Selection
    useEffect(() => {
        if (highlightedItemId) {
            setSelectedId(highlightedItemId);
        }
    }, [highlightedItemId]);

    // Scroll to highlighted item (Only when triggered by Search)
    useEffect(() => {
        if (highlightedItemId && rowRefs.current[highlightedItemId]) {
            rowRefs.current[highlightedItemId].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightedItemId, entries]); // Keep this listening to prop, not local state

    const fetchEntries = async (diskId, parentId) => {
        setLoading(true);
        try {
            const params = { disk_id: diskId };
            if (parentId) params.parent_id = parentId;

            const res = await axios.get('/api/disks/entries', { params });
            setEntries(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortedEntries = () => {
        const sorted = [...entries].sort((a, b) => {
            if (a.type === 'directory' && b.type !== 'directory') return -1;
            if (a.type !== 'directory' && b.type === 'directory') return 1;

            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
        return sorted;
    };

    const sortedEntries = getSortedEntries();

    const handleNavigateDown = (entry) => {
        if (entry.type !== 'directory') return;
        onClearHighlight?.(); // Notify parent if needed (optional now)
        setSelectedId(null);
        setCurrentPathStack([...currentPathStack, { id: entry.id, name: entry.name }]);
    };

    const handleNavigateUp = () => {
        if (currentPathStack.length === 0) return;
        onClearHighlight?.();
        setSelectedId(null);
        const newStack = [...currentPathStack];
        newStack.pop();
        setCurrentPathStack(newStack);
    };

    const handleBreadcrumbClick = (index) => {
        onClearHighlight?.();
        setSelectedId(null);
        const newStack = currentPathStack.slice(0, index + 1);
        setCurrentPathStack(newStack);
    };

    const handleRootClick = () => {
        onClearHighlight?.();
        setSelectedId(null);
        setCurrentPathStack([]);
    };

    // --- Resize Handlers ---
    const startResize = (e, col) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
            active: true,
            col,
            startX: e.clientX,
            initialWidth: colWidths[col]
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e) => {
        if (!dragRef.current.active) return;
        const { col, startX, initialWidth } = dragRef.current;
        const dx = e.clientX - startX;
        setColWidths(prev => ({ ...prev, [col]: Math.max(50, initialWidth + dx) }));
    };

    const handleMouseUp = () => {
        dragRef.current.active = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
    };


    if (!selectedDisk) {
        // Dashboard / Summary View
        const totalDisks = allDisks ? allDisks.length : 0;
        const totalUsage = allDisks ? allDisks.reduce((acc, d) => acc + (parseInt(d.used_space) || 0), 0) : 0;

        return (
            <div className="h-full w-full flex flex-col items-center justify-center text-text-muted bg-primary/50 relative overflow-hidden">
                <div className="w-24 h-24 rounded-2xl bg-tertiary/50 flex items-center justify-center mb-6 ring-1 ring-white/5 shadow-2xl">
                    <Database size={48} className="text-accent opacity-80" />
                </div>
                <h3 className="text-2xl font-semibold text-text-primary mb-2">Koray Birand Disc Catalog</h3>

                <div className="flex items-center gap-8 mt-6">
                    <div className="flex flex-col items-center">
                        <span className="text-4xl font-bold text-white tracking-tight">{totalDisks}</span>
                        <span className="text-xs uppercase tracking-wider text-text-secondary font-medium mt-1">Disks</span>
                    </div>
                    <div className="w-px h-12 bg-border/50"></div>
                    <div className="flex flex-col items-center">
                        <span className="text-4xl font-bold text-white tracking-tight">{formatSize(totalUsage)}</span>
                        <span className="text-xs uppercase tracking-wider text-text-secondary font-medium mt-1">Total Data</span>
                    </div>
                </div>

                <p className="text-sm mt-12 text-text-muted opacity-60">Select a drive from the sidebar to browse content.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-primary relative overflow-hidden">
            {/* Navigation Bar */}
            <div className="h-16 border-b border-border/50 flex items-center px-6 gap-4 bg-secondary/80 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleNavigateUp}
                        disabled={currentPathStack.length === 0}
                        className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors text-text-primary"
                    >
                        <ArrowLeft size={18} />
                    </button>
                </div>

                <div className="flex-1 flex items-center gap-1.5 overflow-x-auto text-sm no-scrollbar fade-mask">
                    <button
                        onClick={handleRootClick}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${currentPathStack.length === 0
                            ? 'bg-accent/10 text-accent font-medium'
                            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                            }`}
                    >
                        <HardDrive size={14} />
                        {selectedDisk.name}
                    </button>

                    {currentPathStack.map((folder, idx) => (
                        <React.Fragment key={folder.id}>
                            <ChevronRight size={14} className="text-text-muted flex-shrink-0" />
                            <button
                                onClick={() => handleBreadcrumbClick(idx)}
                                className={`px-2 py-1.5 rounded-md transition-colors whitespace-nowrap max-w-[200px] truncate ${idx === currentPathStack.length - 1
                                    ? 'bg-accent/10 text-accent font-medium'
                                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                                    }`}
                            >
                                {folder.name}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* Content Display */}
            <div className="flex-1 overflow-auto" onClick={() => setSelectedId(null)}>
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-secondary animate-pulse">
                        <div className="w-8 h-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin mb-4" />
                        Loading contents...
                    </div>
                ) : (
                    <div className="w-full relative">
                        <div style={{ minWidth: Object.values(colWidths).reduce((a, b) => a + b, 0) + 40 }}>
                            {/* Header Row (Sticky Wrapper) */}
                            <div className="sticky top-0 z-30 bg-primary pt-6 px-6">
                                <div className="flex px-4 py-2 text-xs font-semibold text-text-muted uppercase tracking-wider border-b border-border/50 mb-2 select-none bg-primary">

                                    {/* Name */}
                                    <div
                                        style={{ width: colWidths.name }}
                                        className="relative cursor-pointer hover:text-text-primary transition-colors flex items-center gap-1 border-r border-transparent hover:border-border/30 pl-2"
                                        onClick={() => handleSort('name')}
                                    >
                                        Name {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20" onMouseDown={(e) => startResize(e, 'name')} />
                                    </div>

                                    {/* Date */}
                                    <div
                                        style={{ width: colWidths.date }}
                                        className="relative cursor-pointer hover:text-text-primary transition-colors flex items-center gap-1 border-r border-transparent hover:border-border/30 pl-4"
                                        onClick={() => handleSort('file_created_at')}
                                    >
                                        Date {sortConfig.key === 'file_created_at' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20" onMouseDown={(e) => startResize(e, 'date')} />
                                    </div>

                                    {/* Size */}
                                    <div
                                        style={{ width: colWidths.size }}
                                        className="relative cursor-pointer hover:text-text-primary transition-colors flex items-center justify-end gap-1 border-r border-transparent hover:border-border/30 pr-8"
                                        onClick={() => handleSort('size')}
                                    >
                                        Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20" onMouseDown={(e) => startResize(e, 'size')} />
                                    </div>

                                    {/* Type */}
                                    <div
                                        style={{ width: colWidths.type }}
                                        className="relative text-center pl-4"
                                    >
                                        Type
                                        <div className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 z-20" onMouseDown={(e) => startResize(e, 'type')} />
                                    </div>
                                </div>
                            </div>

                            {/* File Rows */}
                            <div className="space-y-0.5 px-6 pb-6">
                                {sortedEntries.map(entry => (
                                    <div
                                        key={entry.id}
                                        ref={el => rowRefs.current[entry.id] = el}
                                        onClick={(e) => { e.stopPropagation(); setSelectedId(entry.id); }}
                                        onDoubleClick={() => handleNavigateDown(entry)}
                                        className={`group flex px-4 py-2.5 rounded-lg transition-colors cursor-pointer items-center text-sm border border-transparent ${selectedId === entry.id
                                            ? 'bg-accent/20 border-accent/20'
                                            : 'hover:bg-white/5 hover:border-white/5'
                                            }`}
                                    >
                                        <div style={{ width: colWidths.name }} className="flex items-center gap-3 truncate pr-4 pl-2">
                                            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${entry.type === 'directory'
                                                ? 'bg-blue-500/20 text-blue-400'
                                                : 'bg-tertiary text-text-secondary'
                                                }`}>
                                                {entry.type === 'directory' ? <Folder size={16} fill="currentColor" className="opacity-80" /> : <File size={16} />}
                                            </div>
                                            <span className={`truncate font-medium ${entry.type === 'directory' ? 'text-text-primary' : 'text-text-secondary/90 group-hover:text-text-primary'}`}>
                                                {entry.name}
                                            </span>
                                        </div>

                                        <div style={{ width: colWidths.date }} className="text-text-muted text-xs group-hover:text-text-secondary transition-colors pl-4 truncate">
                                            {formatDate(entry.file_created_at)}
                                        </div>

                                        <div style={{ width: colWidths.size }} className="text-right text-text-muted font-variant-numeric tabular-nums text-xs pr-8 group-hover:text-text-secondary transition-colors truncate">
                                            {formatSize(entry.size)}
                                        </div>

                                        <div style={{ width: colWidths.type }} className="text-center pl-4">
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md ${entry.type === 'directory'
                                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                : 'bg-white/10 text-white border border-white/10'
                                                }`}>
                                                {formatType(entry)}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {entries.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-text-muted opacity-60">
                                        <Folder size={48} className="mb-4 opacity-20" />
                                        <p>This folder is empty</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Status */}
            <div className="h-9 border-t border-border/50 flex items-center px-6 text-xs text-text-muted bg-secondary/80 backdrop-blur-sm z-10 font-medium">
                <div className="flex gap-4">
                    <span>{entries.length} items</span>
                    <span className="opacity-50">|</span>
                    <span>{entries.filter(e => e.type === 'directory').length} folders</span>
                    <span className="opacity-50">|</span>
                    <span>{entries.filter(e => e.type !== 'directory').length} files</span>
                </div>
            </div>
        </div>
    );
};

export default FileBrowser;

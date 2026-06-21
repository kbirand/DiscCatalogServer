import React, { useState, useEffect } from 'react';
import { HardDrive, Plus, Search, Database, Folder, MoreVertical, Edit2, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DirectoryPickerModal from './DirectoryPickerModal';
import { useAuth } from '../context/AuthContext';

// Sortable Item Component
const formatDiskSize = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const SortableDiskItem = ({ disk, selectedId, onClick, onRename, onDelete, isAdmin }) => {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: disk.id });
    const [showMenu, setShowMenu] = useState(false);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const handleMenuClick = (e, action) => {
        e.stopPropagation();
        setShowMenu(false);
        if (action === 'rename') onRename(disk);
        if (action === 'delete') onDelete(disk);
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative group">
            <button
                onClick={() => onClick(disk)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-left ${selectedId === disk.id
                    ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                    : 'text-text-secondary hover:bg-tertiary hover:text-white'
                    }`}
            >
                <HardDrive size={18} className={selectedId === disk.id ? 'text-accent' : 'text-text-muted group-hover:text-text-primary'} />
                <div className="flex-1 truncate flex items-center justify-between">
                    <div className="text-sm font-semibold leading-none mb-1">{disk.name}</div>
                    {disk.used_space && (
                        <div className="text-[10px] text-text-muted font-mono bg-black/20 px-1.5 py-0.5 rounded ml-2">
                            {formatDiskSize(disk.used_space)}
                        </div>
                    )}
                </div>

                {/* Context Menu Trigger */}
                <div
                    className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                >
                    <MoreVertical size={14} />
                </div>
            </button>

            {/* Context Menu */}
            {showMenu && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-2 top-8 z-20 w-32 bg-tertiary border border-border rounded-lg shadow-xl overflow-hidden animate-fade-in ring-1 ring-white/10">
                        <button
                            onClick={(e) => handleMenuClick(e, 'rename')}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-white/5 hover:text-white transition-colors text-left"
                        >
                            <Edit2 size={12} /> Rename
                        </button>
                        {isAdmin && (
                            <button
                                onClick={(e) => handleMenuClick(e, 'delete')}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
                            >
                                <Trash2 size={12} /> Delete
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};



const Sidebar = ({ onSelectDisk, onSearchClick, width = 280, selectedDisk, onDisksData }) => {
    const { user } = useAuth();
    const [disks, setDisks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showScanInput, setShowScanInput] = useState(false);
    const [scanPath, setScanPath] = useState('');
    const [scanName, setScanName] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [showPicker, setShowPicker] = useState(false);
    const [scanProgress, setScanProgress] = useState(null);
    const [scanJobId, setScanJobId] = useState(null);

    // Modal States
    const [renameDisk, setRenameDisk] = useState(null); // { id, name }
    const [deleteDisk, setDeleteDisk] = useState(null); // { id, name }

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchDisks = async () => {
        try {
            const res = await axios.get('/api/disks');
            setDisks(res.data);
            if (onDisksData) onDisksData(res.data); // Notify parent
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchDisks();
    }, []);

    // Sync selectedId with prop
    useEffect(() => {
        if (selectedDisk) {
            setSelectedId(selectedDisk.id);
        } else {
            setSelectedId(null);
        }
    }, [selectedDisk]);

    const handleDiskClick = (disk) => {
        setSelectedId(disk.id);
        onSelectDisk(disk);
    };

    const handleScan = async (e) => {
        e.preventDefault();
        if (!scanPath || !scanName) return;

        setLoading(true);
        setScanProgress({ filesProcessed: 0, currentPath: 'Initializing...' });

        try {
            const res = await axios.post('/api/disks/scan', {
                path: scanPath,
                name: scanName
            });
            const { jobId } = res.data;
            setScanJobId(jobId);

            // Start SSE listening
            const evtSource = new EventSource(`/api/disks/scan/progress/${jobId}`);

            evtSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.status === 'completed') {
                    evtSource.close();
                    fetchDisks();
                    setLoading(false);
                    setScanProgress(null);
                    setScanJobId(null);
                    setShowScanInput(false);
                    setScanPath('');
                    setScanName('');
                } else if (data.status === 'failed' || data.status === 'cancelled') {
                    evtSource.close();
                    setLoading(false);
                    setScanProgress(null);
                    setScanJobId(null);
                    if (data.status === 'failed') alert('Scan failed: ' + (data.error || 'Unknown error'));
                } else {
                    // Update progress (merge to keep totalItems)
                    setScanProgress(prev => ({
                        ...(prev || {}),
                        ...data
                    }));
                }
            };

            evtSource.onerror = (err) => {
                console.error("SSE Error", err);
                evtSource.close();
                setLoading(false);
                setScanJobId(null);
                fetchDisks(); // Just in case
            };

        } catch (err) {
            console.error(err);
            setLoading(false);
            setScanJobId(null);
            alert('Failed to start scan');
        }
    };

    const handleCancelScan = async () => {
        if (!scanJobId) return;
        try {
            await axios.post(`/api/disks/scan/${scanJobId}/cancel`);
        } catch (err) {
            console.error("Failed to cancel scan", err);
        }
    };

    // Disk Actions
    const confirmRename = async (e) => {
        e.preventDefault();
        if (renameDisk && renameDisk.newName && renameDisk.newName !== renameDisk.originalName) {
            try {
                await axios.put(`/api/disks/${renameDisk.id}`, { name: renameDisk.newName });
                fetchDisks();
                setRenameDisk(null);
            } catch (err) {
                alert('Failed to rename disk');
                console.error(err);
            }
        } else {
            setRenameDisk(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteDisk) return;
        try {
            await axios.delete(`/api/disks/${deleteDisk.id}`);
            if (selectedId === deleteDisk.id) {
                setSelectedId(null);
                onSelectDisk(null);
            }
            fetchDisks();
            setDeleteDisk(null);
        } catch (err) {
            alert('Failed to delete disk');
            console.error(err);
        }
    };

    // DnD Handler
    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setDisks((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                const newOrder = arrayMove(items, oldIndex, newIndex);

                try {
                    const orderIds = newOrder.map(d => d.id);
                    axios.put('/api/disks/reorder', { diskIds: orderIds });
                } catch (err) {
                    console.error('Failed to save order', err);
                }

                return newOrder;
            });
        }
    };

    const handlePathSelect = (path) => {
        setScanPath(path);
        if (!scanName) {
            const parts = path.split('/');
            const name = parts[parts.length - 1] || parts[parts.length - 2];
            if (name) setScanName(name);
        }
    };

    return (
        <>
            {/* Modal: Rename Disk */}
            {renameDisk && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-secondary border border-border rounded-xl shadow-2xl p-5 w-80">
                        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                            <Edit2 size={14} className="text-accent" /> Rename Disk
                        </h3>
                        <form onSubmit={confirmRename} className="space-y-3">
                            <input
                                type="text"
                                value={renameDisk.newName}
                                onChange={(e) => setRenameDisk({ ...renameDisk, newName: e.target.value })}
                                className="w-full p-2 rounded-lg bg-tertiary border border-border text-white text-sm focus:border-accent outline-none"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setRenameDisk(null)}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Delete Disk */}
            {deleteDisk && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-secondary border border-border rounded-xl shadow-2xl p-5 w-80">
                        <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2 text-red-400">
                            <AlertTriangle size={16} /> Delete Disk?
                        </h3>
                        <p className="text-xs text-text-muted mb-4">
                            Are you sure you want to delete <span className="text-white font-medium">"{deleteDisk.name}"</span>? This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setDeleteDisk(null)}
                                className="px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Scan Progress Modal (centered) */}
            {loading && scanProgress && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in text-left">
                    <div className="bg-secondary border border-border rounded-2xl shadow-2xl p-6 w-[480px] space-y-5 relative overflow-hidden">
                        {/* Shimmer Effect */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent animate-shimmer" />

                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent animate-pulse">
                                <Database size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Scanning Disk</h3>
                                <p className="text-sm text-text-muted">Please wait while we catalog files...</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-medium text-text-secondary uppercase tracking-wider">
                                <span>{scanProgress.status === 'counting' ? 'Counting Files...' : scanProgress.totalItems ? 'Progress' : 'Initializing...'}</span>
                                <span>
                                    {scanProgress.status === 'counting'
                                        ? `${scanProgress.filesProcessed} found`
                                        : scanProgress.totalItems
                                            ? `${Math.round((scanProgress.filesProcessed / scanProgress.totalItems) * 100)}%`
                                            : `${scanProgress.filesProcessed} items`
                                    }
                                </span>
                            </div>

                            <div className="h-2 bg-black/50 rounded-full overflow-hidden relative">
                                {scanProgress.totalItems && scanProgress.status !== 'counting' ? (
                                    <div
                                        className="h-full bg-accent transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                                        style={{ width: `${Math.min(100, (scanProgress.filesProcessed / scanProgress.totalItems) * 100)}%` }}
                                    />
                                ) : (
                                    <>
                                        <div className="absolute inset-y-0 left-0 bg-accent/80 w-1/3 animate-[shimmer_1s_infinite_linear]"
                                            style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)' }}
                                        />
                                        <div className="h-full w-full bg-accent/20" />
                                        <div className="absolute inset-y-0 left-0 h-full bg-accent transition-all duration-300 w-full origin-left animate-[progress_2s_ease-in-out_infinite]" />
                                    </>
                                )}
                            </div>

                            <div className="text-xs text-text-muted font-mono truncate border-t border-white/5 pt-2">
                                <span className="opacity-50 mr-2">Processing:</span>
                                {scanProgress.currentPath}
                            </div>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <button
                                onClick={handleCancelScan}
                                className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors text-sm font-medium hover:scale-105 active:scale-95 duration-200"
                            >
                                Cancel Scan
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div
                className="h-full bg-secondary border-r border-border flex flex-col shadow-2xl z-10 shrink-0"
                style={{ width: width }}
            >
                {/* Header */}
                <div className="h-14 flex items-center px-6 border-b border-border/50">
                    <div className="flex items-center gap-3 text-white overflow-hidden w-full">
                        <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent flex-shrink-0">
                            <Database size={18} />
                        </div>
                        <span className="text-lg font-semibold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">Koray Birand Backup</span>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2 px-3">
                        External Drives
                    </div>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={disks.map(d => d.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {disks.map(disk => (
                                <SortableDiskItem
                                    key={disk.id}
                                    disk={disk}
                                    selectedId={selectedId}
                                    onClick={handleDiskClick}
                                    onRename={(disk) => setRenameDisk({ id: disk.id, name: disk.name, newName: disk.name, originalName: disk.name })}
                                    onDelete={(disk) => setDeleteDisk(disk)}
                                    isAdmin={user?.role === 'admin'}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-border/50 space-y-3 bg-secondary/50 backdrop-blur-sm">
                    <button
                        onClick={onSearchClick}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-lg bg-tertiary hover:bg-white/5 text-text-primary transition-all duration-200 border border-border group"
                    >
                        <Search size={16} className="text-text-muted group-hover:text-white transition-colors" />
                        <span className="text-sm font-medium">Search Catalog</span>
                    </button>


                </div>
            </div>

            <DirectoryPickerModal
                isOpen={showPicker}
                onClose={() => setShowPicker(false)}
                onSelect={handlePathSelect}
            />
        </>
    );
};

export default Sidebar;

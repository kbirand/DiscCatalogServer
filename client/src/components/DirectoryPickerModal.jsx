import React, { useState, useEffect } from 'react';
import { Folder, HardDrive, ArrowLeft, X, Check, ChevronRight } from 'lucide-react';
import axios from 'axios';

const DirectoryPickerModal = ({ isOpen, onClose, onSelect }) => {
    const [drives, setDrives] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Initial load: get drives
    useEffect(() => {
        if (isOpen) {
            fetchDrives();
        } else {
            // Reset state on close
            setFiles([]);
            setCurrentPath('');
        }
    }, [isOpen]);

    const fetchDrives = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/system/drives');
            setDrives(res.data);
            setFiles([]); // Clear file list when showing drives
            setCurrentPath(''); // Root view
        } catch (err) {
            console.error(err);
            setError("Failed to load drives");
        } finally {
            setLoading(false);
        }
    };

    const fetchDirectory = async (path) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/system/list', {
                params: { path }
            });
            setFiles(res.data);
            setCurrentPath(path);
        } catch (err) {
            console.error(err);
            setError("Access denied or invalid path");
        } finally {
            setLoading(false);
        }
    };

    const handleDriveClick = (drivePath) => {
        fetchDirectory(drivePath);
    };

    const handleFolderClick = (folderPath) => {
        fetchDirectory(folderPath);
    };

    const handleUp = () => {
        if (!currentPath) return; // Already at root

        // Basic parent resolution
        // Check if we are at a drive root
        const isDriveRoot = drives.some(d => d.path === currentPath);
        if (isDriveRoot) {
            setCurrentPath(''); // Go back to drive list
            setFiles([]);
            return;
        }

        // Go up one level
        // Remove last segment
        const parts = currentPath.split('/');
        parts.pop();
        const parent = parts.join('/') || '/'; // Handle root fallback

        fetchDirectory(parent);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="w-[600px] h-[500px] bg-secondary border border-border rounded-xl flex flex-col shadow-2xl ring-1 ring-white/10 overflow-hidden">
                {/* Header */}
                <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-tertiary/50">
                    <h3 className="font-bold text-text-primary flex items-center gap-2">
                        <Folder size={18} className="text-accent" />
                        Select Folder
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Path Bar */}
                <div className="bg-secondary p-2 border-b border-border flex items-center gap-2">
                    <button
                        onClick={handleUp}
                        disabled={!currentPath}
                        className="p-1.5 rounded hover:bg-tertiary disabled:opacity-30 text-text-primary transition-colors"
                        title="Go Up"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div className="flex-1 bg-tertiary/50 rounded px-2 py-1 text-xs font-mono text-text-secondary truncate border border-border/50">
                        {currentPath || "Select a Drive"}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 bg-primary">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-secondary animate-pulse">
                            <div className="w-6 h-6 border-2 border-accent/20 border-t-accent rounded-full animate-spin mb-2" />
                            Loading...
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-400 text-sm">
                            <p className="mb-2">{error}</p>
                            <button onClick={() => currentPath ? fetchDirectory(currentPath) : fetchDrives()} className="underline opacity-70">Retry</button>
                        </div>
                    ) : !currentPath ? (
                        // Drive List
                        <div className="space-y-1">
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2 px-2 mt-2">Drives</div>
                            {drives.map((drive, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleDriveClick(drive.path)}
                                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 group text-left transition-colors"
                                >
                                    <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center text-accent">
                                        <HardDrive size={16} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-medium text-text-primary">{drive.name}</div>
                                        <div className="text-xs text-text-muted font-mono">{drive.path}</div>
                                    </div>
                                    <ChevronRight size={14} className="text-text-muted opacity-0 group-hover:opacity-100" />
                                </button>
                            ))}
                        </div>
                    ) : (
                        // File List
                        <div className="space-y-0.5">
                            {files.length === 0 && (
                                <div className="p-8 text-center text-text-muted text-sm italic">Empty folder</div>
                            )}
                            {files.map((file, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleFolderClick(file.path)}
                                    className="w-full flex items-center gap-3 p-2 rounded hover:bg-white/5 group text-left transition-colors"
                                >
                                    <Folder size={16} className="text-blue-400 fill-blue-400/20" />
                                    <span className="text-sm text-text-primary truncate">{file.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-tertiary/20 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => { onSelect(currentPath); onClose(); }}
                        disabled={!currentPath}
                        className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20 transition-all flex items-center gap-2"
                    >
                        <Check size={16} />
                        Select Current Folder
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DirectoryPickerModal;

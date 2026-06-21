import React, { useState, useRef, useCallback, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import FileBrowser from './components/FileBrowser';
import SearchModal from './components/SearchModal';
import './index.css';
import axios from 'axios';
import { useAuth } from './context/AuthContext';
import LoginScreen from './components/LoginScreen';
import UserHeader from './components/UserHeader';
import AdminPanel from './components/AdminPanel';
import PendingApproval from './components/PendingApproval';

function App() {
  const { user, loading } = useAuth();

  const [selectedDisk, setSelectedDisk] = useState(null);
  const [allDisks, setAllDisks] = useState([]); // Shared state for summary
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [currentPathStack, setCurrentPathStack] = useState([]);
  const [highlightedItem, setHighlightedItem] = useState(null);

  // Sidebar Resize Logic
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved) : 280;
  });
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      // Limits: Min 200px, Max 800px
      const newWidth = Math.max(200, Math.min(800, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('sidebarWidth', sidebarWidth);
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, sidebarWidth]);

  // Navigation Handler from Search
  const handleNavigateResult = async (result) => {
    setIsSearchOpen(false);

    try {
      // 1. Set Disk with ID and Name
      if (result.Disk) {
        setSelectedDisk({
          id: result.disk_id,
          name: result.Disk.name
        });
      }

      // 2. Fetch Lineage
      if (result.id) {
        const res = await axios.get(`/api/disks/lineage/${result.id}`);
        const path = [...res.data];
        path.pop(); // Remove self from breadcrumbs to be in parent folder
        setCurrentPathStack(path);
      } else {
        setCurrentPathStack([]);
      }

      // 3. Highlight the item
      setHighlightedItem(result.id);

    } catch (err) {
      console.error("Navigation failed", err);
      setCurrentPathStack([]);
    }
  };

  const handleDiskSelect = (disk) => {
    setSelectedDisk(disk);
    setCurrentPathStack([]); // Reset path to root of new disk
  };

  if (loading) return <div className="h-screen w-screen bg-primary flex items-center justify-center text-text-muted">Loading...</div>;
  if (!user) return <LoginScreen />;
  if (user.status === 'pending') return <PendingApproval />;

  return (
    <div className="flex h-screen w-screen bg-primary text-text-primary overflow-hidden relative">
      <UserHeader onOpenAdmin={() => setIsAdminOpen(true)} />
      <Sidebar
        width={sidebarWidth}
        selectedDisk={selectedDisk}
        onSelectDisk={handleDiskSelect}
        onSearchClick={() => setIsSearchOpen(true)}
        onDisksData={setAllDisks} // Pass callback to receive data
      />

      {/* Resizer Handle */}
      <div
        onMouseDown={() => setIsResizing(true)}
        className={`w-[2px] hover:w-1 cursor-col-resize z-50 transition-colors flex-shrink-0 relative group h-full ${isResizing ? 'bg-accent' : 'bg-transparent hover:bg-accent/50'}`}
      >
        <div className={`absolute inset-y-0 left-0 w-full ${isResizing ? 'bg-accent' : 'bg-border group-hover:bg-accent/50'}`} />
      </div>

      <div className="flex-1 min-w-0 h-full overflow-hidden relative">
        <FileBrowser
          selectedDisk={selectedDisk}
          currentPathStack={currentPathStack}
          setCurrentPathStack={setCurrentPathStack}
          highlightedItemId={highlightedItem}
          onClearHighlight={() => setHighlightedItem(null)}
          allDisks={allDisks} // Pass disks for dashboard
        />
      </div>

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigateResult={handleNavigateResult}
      />

      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />
    </div>
  );
}

export default App;

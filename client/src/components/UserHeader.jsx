import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, ShieldAlert } from 'lucide-react';

const UserHeader = ({ onOpenAdmin }) => {
    const { user, logout } = useAuth();
    const [showMenu, setShowMenu] = useState(false);

    if (!user) return null;

    return (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-4">
            {/* Admin Badge */}
            {user.role === 'admin' && (
                <button
                    onClick={onOpenAdmin}
                    className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-500/30 flex items-center gap-2 shadow-lg backdrop-blur-md hover:bg-red-900/50 hover:border-red-500/50 transition-all cursor-pointer group"
                >
                    <span className="text-xs font-bold text-red-500 tracking-wider group-hover:text-red-400">ADMIN</span>
                </button>
            )}

            <div className="h-6 w-px bg-white/10 mx-2" />

            {/* Logout Button */}
            <button
                onClick={logout}
                className="text-text-muted hover:text-white text-sm font-medium transition-colors"
            >
                Logout
            </button>

            {/* Avatar */}
            <div className="relative group">
                <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden shadow-lg ring-2 ring-transparent group-hover:ring-accent/50 transition-all cursor-pointer">
                    <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=' + user.name + '&background=random'; }}
                    />
                </div>
            </div>
        </div>
    );
};

export default UserHeader;

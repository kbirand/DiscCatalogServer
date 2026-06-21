import React, { useState, useEffect } from 'react';
import { X, Trash2, Search } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AdminPanel = ({ isOpen, onClose }) => {
    const { token } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchUsers();
        }
    }, [isOpen]);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get('/api/admin/users', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(res.data);
        } catch (err) {
            console.error("Failed to fetch users", err);
            setError(err.response?.data?.error || "Failed to load users.");
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateRole = async (userId, newRole) => {
        try {
            await axios.put(`/api/admin/users/${userId}/role`,
                { role: newRole },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        } catch (err) {
            console.error("Failed to update role", err);
        }
    };

    const handleUpdateStatus = async (userId, newStatus) => {
        try {
            await axios.put(`/api/admin/users/${userId}/status`,
                { status: newStatus },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: newStatus } : u));
        } catch (err) {
            console.error("Failed to update status", err);
        }
    };

    const handleToggleGallery = async (userId, currentVal) => {
        try {
            await axios.put(`/api/admin/users/${userId}/gallery`,
                { show_in_gallery: !currentVal },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, show_in_gallery: !currentVal } : u));
        } catch (err) {
            console.error("Failed to update gallery toggle", err);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm("Are you sure you want to delete this user? This cannot be undone.")) return;

        try {
            await axios.delete(`/api/admin/users/${userId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUsers(prev => prev.filter(u => u.id !== userId));
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete user");
        }
    };

    if (!isOpen) return null;

    const filteredUsers = users.filter(u =>
        u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-5xl bg-[#0F0F11] border border-border/40 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-white/5">
                    <h2 className="text-xl font-bold text-white tracking-tight">Admin Control Panel</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-text-muted hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="px-6 py-3 border-b border-border/40 flex items-center justify-between bg-secondary/30">
                    <span className="text-sm font-semibold text-accent">User Management</span>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-black/40 border border-border/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary focus:border-accent outline-none w-64"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 bg-primary/50">
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white/5 text-xs uppercase text-text-muted font-semibold tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">User</th>
                                    <th className="px-4 py-3">Email</th>
                                    <th className="px-4 py-3 text-center">In Gallery</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-center">Role</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20 bg-secondary/20">
                                {loading && (
                                    <tr><td colSpan="6" className="px-4 py-8 text-center text-text-muted">Loading users...</td></tr>
                                )}
                                {error && (
                                    <tr><td colSpan="6" className="px-4 py-8 text-center text-red-400">{error}</td></tr>
                                )}

                                {!loading && !error && filteredUsers.map(u => (
                                    <tr key={u.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-tertiary overflow-hidden border border-white/10">
                                                    <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                                                </div>
                                                <span className="font-medium text-text-primary">{u.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-text-secondary">{u.email}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button
                                                onClick={() => handleToggleGallery(u.id, u.show_in_gallery)}
                                                className={`w-10 h-5 rounded-full relative transition-colors ${u.show_in_gallery ? 'bg-accent' : 'bg-gray-700'}`}
                                            >
                                                <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${u.show_in_gallery ? 'translate-x-5' : ''}`} />
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleUpdateStatus(u.id, u.status === 'approved' ? 'banned' : 'approved')}
                                                    className={`px-2 py-1 rounded text-xs font-bold border transition-colors ${u.status === 'approved'
                                                        ? 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/30'
                                                        : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-green-500/20 hover:text-green-500 hover:border-green-500/30'
                                                        }`}
                                                >
                                                    {u.status.toUpperCase()}
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <select
                                                value={u.role}
                                                onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                                                className="bg-black/50 border border-border rounded px-2 py-1 text-xs text-text-primary focus:border-accent outline-none appearance-none cursor-pointer text-center font-bold uppercase tracking-wider w-24"
                                            >
                                                <option value="user">USER</option>
                                                <option value="admin">ADMIN</option>
                                            </select>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors" title="Delete User"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;

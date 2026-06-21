import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const PendingApproval = () => {
    const { logout, user } = useAuth();

    return (
        <div className="fixed inset-0 bg-primary flex flex-col items-center justify-center p-4 text-center">
            <div className="bg-secondary border border-border rounded-2xl p-8 max-w-md shadow-2xl flex flex-col items-center gap-6 animate-fade-in relative overflow-hidden">

                {/* Background Glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
                <div className="absolute -top-20 -left-20 w-40 h-40 bg-yellow-500/10 blur-[50px] rounded-full pointer-events-none" />

                <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-500 shadow-lg shadow-yellow-500/10 ring-1 ring-white/5">
                    <ShieldAlert size={32} />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Account Pending</h2>
                    <p className="text-text-secondary text-sm">
                        Welcome, <span className="text-text-primary font-medium">{user?.name}</span>.
                        <br />
                        Your account is awaiting administrator approval.
                    </p>
                </div>

                <div className="bg-primary/50 border border-border/50 rounded-lg p-4 text-xs text-text-muted leading-relaxed">
                    Please contact the system administrator to activate your access.
                    You will not be able to view catalogs until your account is approved.
                </div>

                <button
                    onClick={logout}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors border border-white/5 hover:border-white/10"
                >
                    <LogOut size={16} />
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    );
};

export default PendingApproval;

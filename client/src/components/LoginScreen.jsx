import React from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Crown, HardDrive, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
    const { googleLogin } = useAuth();

    return (
        <div className="fixed inset-0 bg-primary flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-secondary border border-border rounded-2xl shadow-2xl p-8 relative overflow-hidden text-center animate-fade-in">

                {/* Background Decor */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
                <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-accent/5 blur-[100px] pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-6">
                    <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center text-accent mb-2 shadow-lg shadow-accent/10 ring-1 ring-white/5">
                        <HardDrive size={42} strokeWidth={1.5} />
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-white tracking-tight">DiskKatalog</h1>
                        <p className="text-text-secondary text-sm">Secure Architecture Asset Management</p>
                    </div>

                    <div className="w-full h-px bg-border/50 my-2" />

                    <div className="w-full">
                        <GoogleLogin
                            onSuccess={async (credentialResponse) => {
                                await googleLogin(credentialResponse.credential);
                            }}
                            onError={() => {
                                console.log('Login Failed');
                            }}
                            theme="filled_black"
                            text="continue_with_google"
                            shape="pill"
                        />
                    </div>

                    <p className="text-xs text-text-muted mt-4">
                        By continuing, you verify that you are an authorized user of this system.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;

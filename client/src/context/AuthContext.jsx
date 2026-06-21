import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Initial check
    useEffect(() => {
        const verifySession = async () => {
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                // Attach token to default headers or this specific request
                const res = await axios.get('/api/auth/me', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setUser(res.data.user);
            } catch (err) {
                console.error("Session invalid", err);
                logout(); // Clear invalid token
            } finally {
                setLoading(false);
            }
        };

        verifySession();
    }, [token]);

    const login = async (googleCredential) => {
        try {
            const res = await axios.post('/api/auth/google', { credential: googleCredential });
            const { user, token } = res.data;

            setToken(token);
            setUser(user);
            localStorage.setItem('token', token);
            return true;
        } catch (err) {
            console.error("Login failed", err);
            return false;
        }
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
    };

    return (
        <AuthContext.Provider value={{ user, token, googleLogin: login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

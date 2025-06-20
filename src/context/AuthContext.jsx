import React, { createContext, useState, useEffect } from 'react';
import API from '../api/client';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      API.get('/api/auth/me')
        .then(r => setUser(r.data.user))
        .catch(() => localStorage.removeItem('token'));
    }
  }, []);

  async function login(email, password) {
    const { data } = await API.post('/api/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  async function register(payload) {
    const { data } = await API.post('/api/auth/register', payload);
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  async function googleLogin(idToken) {
    const { data } = await API.post('/api/auth/google', { idToken });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, register, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
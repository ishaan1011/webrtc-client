import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import MeetingPage from './pages/MeetingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<LandingPage />} />
          <Route path="/meeting/:roomId" element={<MeetingPage />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  </AuthProvider>
);
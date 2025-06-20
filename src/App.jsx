import React, { useContext } from 'react';
import { AuthContext } from './context/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import LandingPage from './pages/LandingPage.jsx'; // your meeting UI

export default function App() {
  const { user } = useContext(AuthContext);
  // if not logged in, show login/register
  if (!user) return <LoginPage />;
  // otherwise show your main app
  return <LandingPage />;
}
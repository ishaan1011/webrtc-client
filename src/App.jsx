/* in index.html */
<script src="https://accounts.google.com/gsi/client" async defer></script>

// in App.jsx
import React, { useEffect, useContext } from 'react';
import { AuthContext } from './context/AuthContext';

export function GoogleSignIn() {
  const { googleLogin } = useContext(AuthContext);

  useEffect(() => {
    /* global google */
    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: ({ credential }) => {
        googleLogin(credential);            // this calls your /api/auth/google
      },
    });
    google.accounts.id.renderButton(
      document.getElementById('google-button'),
      { theme: 'outline', size: 'large' }
    );
  }, []);

  return <div id="google-button"></div>;
}
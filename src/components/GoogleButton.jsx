import React, { useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

export function GoogleButton() {
  const { googleLogin } = useContext(AuthContext);

  useEffect(() => {
    /* global google */
    google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: ({ credential }) => googleLogin(credential),
    });
    google.accounts.id.renderButton(
      document.getElementById('googleSignIn'),
      { theme: 'outline', size: 'large' }
    );
  }, []);

  return <div id="googleSignIn"></div>;
}
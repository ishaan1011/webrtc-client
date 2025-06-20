import React, { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { GoogleSignIn } from '../components/GoogleSignIn.jsx';

export default function LoginPage() {
  const { login, register } = useContext(AuthContext);
  const [mode, setMode] = useState('login'); // or 'register'
  const [form, setForm] = useState({ email:'', username:'', fullName:'', password:'' });

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
    } catch {
      alert(`${mode} failed`);
    }
  };

  return (
    <div className="auth-container">
      <h2>{mode === 'login' ? 'Log In' : 'Register'}</h2>
      <form onSubmit={handleSubmit}>
        <input type="email" placeholder="Email"
               value={form.email}
               onChange={e=>setForm({...form,email:e.target.value})}
               required />
        {mode==='register' && <>
          <input placeholder="Username"
                 value={form.username}
                 onChange={e=>setForm({...form,username:e.target.value})}
                 required />
          <input placeholder="Full Name"
                 value={form.fullName}
                 onChange={e=>setForm({...form,fullName:e.target.value})}
                 required />
        </>}
        <input type="password" placeholder="Password"
               value={form.password}
               onChange={e=>setForm({...form,password:e.target.value})}
               required />
        <button type="submit">{mode === 'login' ? 'Log In' : 'Register'}</button>
      </form>
      <button onClick={()=>setMode(mode==='login'?'register':'login')}>
        {mode==='login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
      <hr />
      <GoogleSignIn />
    </div>
  );
}
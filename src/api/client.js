import axios from 'axios';

// will be replaced by Vite from your .env
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// automatically attach token
API.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;
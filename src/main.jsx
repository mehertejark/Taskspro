// Storage polyfill — maps window.storage to localStorage
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    if (value === null) throw new Error('Not found');
    return { key, value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
  async list(prefix = '') {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    return { keys };
  }
};
 
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

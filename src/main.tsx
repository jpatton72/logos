import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// One-time rename migration: copy the pre-rebrand persisted store key
// over to the new key name so existing users land on their own state
// after upgrading. Idempotent — guarded by checking the new key first.
try {
  const NEW_KEY = 'aletheia-app-state';
  const OLD_KEY = 'logos-app-state';
  if (localStorage.getItem(NEW_KEY) === null) {
    const legacy = localStorage.getItem(OLD_KEY);
    if (legacy !== null) {
      localStorage.setItem(NEW_KEY, legacy);
      localStorage.removeItem(OLD_KEY);
    }
  }
} catch {
  // localStorage may be disabled (private mode, etc.) — losing UI state
  // is harmless; the rest of the app continues to work.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

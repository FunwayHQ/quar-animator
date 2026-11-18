import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { installI18n } from './i18n';

// Self-hosted fonts (no external Google Fonts requests — GDPR compliant)
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/inter/400.css';

import './styles/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

// Install UI localization before render so saved language and <html lang>
// are in place; the observer then translates every node React renders.
installI18n();

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './i18n';
// Both are declared in globals.css's --font-sans / --font-mono stacks; without
// these imports the sans stack silently falls back to Segoe UI.
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

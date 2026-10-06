import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import './styles/fonts.ts';
import './styles/global.scss';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The build prerenders the landing into #root; the dev server leaves it empty.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);

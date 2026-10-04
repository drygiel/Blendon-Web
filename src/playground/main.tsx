import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.ts';
import '../styles/global.scss';
import { PlaygroundPage } from './PlaygroundPage.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <PlaygroundPage />
  </StrictMode>,
);

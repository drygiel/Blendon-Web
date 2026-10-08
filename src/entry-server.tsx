// Server entry for `pnpm prerender`: the landing's markup and structured data, rendered at build time.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App.tsx';

export { structuredData } from './landing/structured-data.ts';

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

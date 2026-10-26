import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import '@dsh-code-review/ui/styles.css';
import { App } from './App.js';

const container = document.getElementById('root');
if (container === null) throw new Error('missing #root');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

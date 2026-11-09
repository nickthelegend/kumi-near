import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { setDefaultRpc } from '@kumi/sdk';
import { App } from './App';
import './styles.css';

// Chain reads go through the Kumi server's read-only RPC proxy (falls back to public RPC).
setDefaultRpc(`${location.origin}/api/rpc`);

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

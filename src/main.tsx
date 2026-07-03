import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { ThemeProvider } from './components/layout/ThemeProvider';
import { HoldingsProvider } from './lib/storage';
import { RatesProvider } from './lib/rates-cache';
import { ToastProvider } from './components/ui/Toast';

// Seed sample data the very first time a user opens the app, so they can try
// everything immediately. Subsequent visits keep their real data.
import './lib/sample-data';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* HoldingsProvider must wrap ThemeProvider: ThemeProvider reads/writes
        the persisted theme via useHoldings(). Placing it outside would throw
        "useHoldings must be used within a HoldingsProvider" at mount. */}
    <HoldingsProvider>
      <ThemeProvider>
        <RatesProvider>
          <ToastProvider>
            <HashRouter>
              <App />
            </HashRouter>
          </ToastProvider>
        </RatesProvider>
      </ThemeProvider>
    </HoldingsProvider>
  </React.StrictMode>,
);

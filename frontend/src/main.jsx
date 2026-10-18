import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { MatchProvider } from './context/MatchContext.jsx';
import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <MatchProvider>
          <App />
        </MatchProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);

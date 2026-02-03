/**
 * React Application Entry Point
 *
 * This is the main entry file that:
 * - Imports global styles (Tailwind CSS)
 * - Creates the React root
 * - Renders the App component in StrictMode for development checks
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Get the root DOM element where React will mount
const rootElement = document.getElementById('root');

// Safety check - ensure root element exists
if (!rootElement) {
  throw new Error(
    'Root element not found. Make sure index.html contains a div with id="root".'
  );
}

// Create React root and render the application
// StrictMode enables additional development checks and warnings
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

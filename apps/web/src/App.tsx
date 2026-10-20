import { useEffect } from 'react';
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { Projects } from './pages/Projects';
import { ToastContainer } from './components/common/Toast';
import { ConsentBanner } from './components/common/ConsentBanner';
import { PromptDialogHost } from './components/common/PromptDialog';
import { DesktopOnlyGate } from './components/common/DesktopOnlyGate';
import { loadBundledFonts } from './services/bundledFonts';

export function App() {
  return (
    <DesktopOnlyGate>
      <AppRoutes />
    </DesktopOnlyGate>
  );
}

function AppRoutes() {
  const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
  // Load bundled Inter font weights on startup for text rendering
  useEffect(() => {
    loadBundledFonts().catch((err: unknown) => {
      console.warn('Failed to load bundled Inter font:', err);
    });
  }, []);

  return (
    <Router>
      <ToastContainer />
      <ConsentBanner />
      <PromptDialogHost />
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </Router>
  );
}

export default App;

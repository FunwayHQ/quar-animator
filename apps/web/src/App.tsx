import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { Projects } from './pages/Projects';
import { ToastContainer } from './components/common/Toast';
import { ConsentBanner } from './components/common/ConsentBanner';
import { getFontManager } from '@quar/core';
import interFontUrl from '@fontsource/inter/files/inter-latin-400-normal.woff?url';

export function App() {
  // Load bundled Inter font on startup for text rendering
  useEffect(() => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const fm = getFontManager();
    if (!fm.hasFont('Inter')) {
      fm.loadFontFromUrl(interFontUrl, 'Inter', 'bundled').catch((err: unknown) => {
        console.warn('Failed to load bundled Inter font:', err);
      });
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      <ConsentBanner />
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

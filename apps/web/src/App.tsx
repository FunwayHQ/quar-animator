import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { Projects } from './pages/Projects';
import { ToastContainer } from './components/common/Toast';
import { ConsentBanner } from './components/common/ConsentBanner';
import { PromptDialogHost } from './components/common/PromptDialog';
import { ExportDialogHost } from './components/common/ExportDialog';
import { getFontManager } from '@quar/core';
import interFontUrl400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interFontUrl700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

export function App() {
  // Load bundled Inter font weights on startup for text rendering
  useEffect(() => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const fm = getFontManager();
    if (!fm.hasFontWeight('Inter', 400)) {
      fm.loadFontFromUrl(interFontUrl400, 'Inter', 'bundled', 400).catch((err: unknown) => {
        console.warn('Failed to load bundled Inter 400 font:', err);
      });
    }
    if (!fm.hasFontWeight('Inter', 700)) {
      fm.loadFontFromUrl(interFontUrl700, 'Inter', 'bundled', 700).catch((err: unknown) => {
        console.warn('Failed to load bundled Inter 700 font:', err);
      });
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }, []);

  return (
    <BrowserRouter>
      <ToastContainer />
      <ConsentBanner />
      <PromptDialogHost />
      <ExportDialogHost />
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

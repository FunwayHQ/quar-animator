import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { Projects } from './pages/Projects';
import { ToastContainer } from './components/common/Toast';
import { ConsentBanner } from './components/common/ConsentBanner';

export function App() {
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

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Editor } from './pages/Editor';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/editor" replace />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

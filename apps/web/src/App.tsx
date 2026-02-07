import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Editor } from './pages/Editor';
import { Projects } from './pages/Projects';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Projects />} />
        <Route path="/editor" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

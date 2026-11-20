import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { BoardPage } from './pages/BoardPage';
import { EditorPage } from './pages/EditorPage';
import { HomePage } from './pages/HomePage';
import { ModeratorPage } from './pages/ModeratorPage';
import { StartPage } from './pages/StartPage';
import { SavedTextsProvider } from './texts';

export function App() {
  return (
    <BrowserRouter>
      <SavedTextsProvider>
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/moderator" element={<HomePage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/games/:gameId" element={<ModeratorPage />} />
          <Route path="/board/:gameId" element={<BoardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SavedTextsProvider>
    </BrowserRouter>
  );
}

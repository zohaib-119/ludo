import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { HomePage } from '../home/HomePage';
import { applyTheme, useSettings } from '../lib/settings';
import { RoomPage } from '../room/RoomPage';
import { Toaster } from '../ui/toast';
import { NotFoundPage } from './NotFoundPage';

export function App() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

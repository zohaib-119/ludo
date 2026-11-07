import { Suspense, lazy, useEffect } from 'react';
import { installAudioUnlock, sound } from '../audio/sound';
import { BrowserRouter, Route, Routes } from 'react-router';
import { HomePage } from '../home/HomePage';
import { useSettings } from '../lib/settings';
import { RoomPage } from '../room/RoomPage';
import { Toaster } from '../ui/toast';
import { NotFoundPage } from './NotFoundPage';

const HowToPlayPage = lazy(() => import('../help/HowToPlayPage').then((m) => ({ default: m.HowToPlayPage })));

installAudioUnlock();

export function App() {
  const volume = useSettings((s) => s.soundVolume);
  useEffect(() => sound.setVolume(volume), [volume]);
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/r/:code" element={<RoomPage />} />
        <Route
          path="/how-to-play"
          element={
            <Suspense fallback={null}>
              <HowToPlayPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

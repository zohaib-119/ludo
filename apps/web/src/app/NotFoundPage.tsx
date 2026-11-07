import { Link } from 'react-router';
import { t } from '../i18n/messages';
import { Logo } from '../ui/kit';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={64} />
      <h1 className="font-display text-3xl font-extrabold">404</h1>
      <p className="text-muted">{t('room.notFoundBody')}</p>
      <Link to="/" className="font-semibold text-accent underline-offset-4 hover:underline">
        {t('room.home')}
      </Link>
    </main>
  );
}

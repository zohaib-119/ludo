import { Check, Copy, Link2, QrCode, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '../i18n/messages';
import { roomLink } from '../net/config';
import { Button, Card, Sheet } from '../ui/kit';
import { toast } from '../ui/toast';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareCard({ code }: { code: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const link = roomLink(code);
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  useEffect(() => {
    if (!qrOpen || qr) return;
    // Loaded only when the QR sheet opens.
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#1d1b18', light: '#ffffff' } }))
      .then(setQr)
      .catch(() => setQr(null));
  }, [qrOpen, qr, link]);

  const doCopy = async (what: 'code' | 'link') => {
    if (await copy(what === 'code' ? code : link)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } else {
      toast(what === 'code' ? code : link);
    }
  };

  return (
    <Card className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-3! sm:justify-between sm:p-4!">
      <div className="text-center sm:text-left">
        <p className="text-[11px] font-bold tracking-[0.2em] text-muted uppercase">{t('lobby.roomCode')}</p>
        <button
          type="button"
          onClick={() => doCopy('code')}
          className="room-code -ml-1 block rounded-xl px-1 text-[2.1rem] leading-tight transition-colors hover:bg-surface-2"
          aria-label={`${t('lobby.copyCode')}: ${code}`}
          data-testid="room-code"
        >
          {code}
        </button>
      </div>
      <div className="flex flex-nowrap justify-center gap-1.5 sm:justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => doCopy('code')}
          icon={copied === 'code' ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        >
          {copied === 'code' ? t('lobby.copied') : t('lobby.copyCode')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => doCopy('link')}
          icon={copied === 'link' ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
        >
          {copied === 'link' ? t('lobby.copied') : t('lobby.copyLink')}
        </Button>
        {canShare && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Share2 className="size-4" />}
            onClick={() =>
              navigator.share({ title: t('appName'), text: t('lobby.shareText', { code }), url: link }).catch(() => {})
            }
          >
            {t('lobby.share')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => setQrOpen(true)} icon={<QrCode className="size-4" />}>
          {t('lobby.qr')}
        </Button>
      </div>
      <Sheet open={qrOpen} onClose={() => setQrOpen(false)} title={t('lobby.qrTitle')}>
        <div className="flex flex-col items-center gap-3">
          <div className="aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl bg-white p-3">
            {qr ? <img src={qr} alt={link} className="size-full" /> : null}
          </div>
          <p className="room-code text-2xl">{code}</p>
          <p className="break-all text-sm text-muted">{link}</p>
        </div>
      </Sheet>
    </Card>
  );
}

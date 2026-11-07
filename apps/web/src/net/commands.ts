import type { Command } from '@ludo/protocol';
import { t, tMaybe } from '../i18n/messages';
import { toast } from '../ui/toast';
import type { ClientResult } from './connection';
import { getConnection } from './session';

/** Send a command; show a friendly toast if it is refused. Returns whether it succeeded. */
export async function sendCommand(command: Command, opts: { quiet?: boolean } = {}): Promise<boolean> {
  const result: ClientResult = await getConnection().send(command);
  if (result.ok) return true;
  if (!opts.quiet) toast(tMaybe(`error.${result.code}`) ?? (result.message || t('error.generic')), 'danger');
  return false;
}

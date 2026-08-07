import {
  Copy,
  ExternalLink,
  FolderOpen,
  LocateFixed,
  Mail,
  TextCursorInput,
  type LucideIcon,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import type { ClipboardContentAction } from '@/types';

export function contentActionPresentation(
  action: ClipboardContentAction,
  t: TFunction
): { label: string; icon: LucideIcon } {
  switch (action.kind) {
    case 'open_url':
      return { label: t('clipboard.contentActions.openUrl'), icon: ExternalLink };
    case 'compose_email':
      return { label: t('clipboard.contentActions.composeEmail'), icon: Mail };
    case 'open_path':
      return { label: t('clipboard.contentActions.openPath'), icon: FolderOpen };
    case 'reveal_path':
      return { label: t('clipboard.contentActions.revealPath'), icon: LocateFixed };
    case 'copy_path':
      return { label: t('clipboard.contentActions.copyPath'), icon: Copy };
    case 'copy_file_name':
      return { label: t('clipboard.contentActions.copyFileName'), icon: TextCursorInput };
  }
}

export function isPrimaryContentAction(action: ClipboardContentAction): boolean {
  return ['open_url', 'compose_email', 'open_path'].includes(action.kind);
}

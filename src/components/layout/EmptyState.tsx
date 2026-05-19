import { Clipboard, Star } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
      {showFavorites ? (
        <>
          <Star className="h-10 w-10 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium">{t('emptyState.noFavorites')}</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            {t('emptyState.noFavoritesHint')}
          </p>
        </>
      ) : (
        <>
          <Clipboard className="h-10 w-10 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium">{t('emptyState.noHistory')}</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            {t('emptyState.noHistoryHint')}
          </p>
          <p className="text-[10px] text-muted-foreground/35 mt-3">
            <Trans
              i18nKey="emptyState.hotkeyHint"
              values={{ hotkey: 'Ctrl+Alt+K' }}
              components={{
                1: <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]" />,
              }}
            />
          </p>
        </>
      )}
    </div>
  );
}

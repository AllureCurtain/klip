import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start px-3 py-4 text-muted-foreground">
      {showFavorites ? (
        <>
          <p className="text-xs font-medium">{t('emptyState.noFavorites')}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            {t('emptyState.noFavoritesHint')}
          </p>
        </>
      ) : (
        <>
          <p className="text-xs font-medium">{t('emptyState.noHistory')}</p>
          <p className="mt-1 text-[11px] text-muted-foreground/60">
            {t('emptyState.noHistoryHint')}
          </p>
        </>
      )}
    </div>
  );
}

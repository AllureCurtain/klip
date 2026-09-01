import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 text-center">
      <div className="rounded-2xl bg-[var(--glass-bg)] backdrop-blur-sm border border-[var(--glass-border)] px-6 py-5 shadow-[var(--shadow-card)]">
        {showFavorites ? (
          <>
            <p className="text-sm font-medium text-foreground">{t('emptyState.noFavorites')}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('emptyState.noFavoritesHint')}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground">{t('emptyState.noHistory')}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('emptyState.noHistoryHint')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

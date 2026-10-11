import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ClipboardList, Star } from 'lucide-react';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  const { t } = useTranslation();
  const Icon = showFavorites ? Star : ClipboardList;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
      className="flex flex-col items-center justify-center h-full px-6 py-8 text-center"
    >
      <div className="rounded-2xl bg-[var(--glass-bg)] backdrop-blur-sm border border-[var(--glass-border)] px-6 py-5 shadow-[var(--shadow-card)]">
        <Icon
          className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        {showFavorites ? (
          <>
            <p className="text-[12px] font-medium text-foreground">{t('emptyState.noFavorites')}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
              {t('emptyState.noFavoritesHint')}
            </p>
          </>
        ) : (
          <>
            <p className="text-[12px] font-medium text-foreground">{t('emptyState.noHistory')}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
              {t('emptyState.noHistoryHint')}
            </p>
          </>
        )}
      </div>
    </motion.div>
  );
}

import { Clipboard, Star } from 'lucide-react';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      {showFavorites ? (
        <>
          <Star className="h-16 w-16 mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium">暂无收藏</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            点击条目的星标将其添加到收藏
          </p>
        </>
      ) : (
        <>
          <Clipboard className="h-16 w-16 mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium">暂无剪贴板历史</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            复制内容后将自动出现在这里
          </p>
          <p className="text-xs text-muted-foreground/40 mt-4">
            按 <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono">Ctrl+Alt+K</kbd> 显示/隐藏窗口
          </p>
        </>
      )}
    </div>
  );
}

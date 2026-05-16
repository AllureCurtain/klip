import { Clipboard, Star } from 'lucide-react';

interface EmptyStateProps {
  showFavorites?: boolean;
}

export function EmptyState({ showFavorites = false }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground px-6">
      {showFavorites ? (
        <>
          <Star className="h-10 w-10 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium">暂无收藏</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            点击条目的星标将其添加到收藏
          </p>
        </>
      ) : (
        <>
          <Clipboard className="h-10 w-10 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium">暂无剪贴板历史</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            复制内容后将自动出现在这里
          </p>
          <p className="text-[10px] text-muted-foreground/35 mt-3">
            按 <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Ctrl+Alt+K</kbd> 显示/隐藏窗口
          </p>
        </>
      )}
    </div>
  );
}

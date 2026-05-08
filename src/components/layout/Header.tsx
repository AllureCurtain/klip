import { useState } from 'react';
import {
  Search,
  Settings,
  FileText,
  Image,
  FolderOpen,
  Sun,
  Moon,
  Trash2,
  Star,
  Keyboard,
} from 'lucide-react';
import { Input, Button } from '@/components/ui';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useThemeStore, useClipboardStore } from '@/stores';
import { cn } from '@/lib/utils';
import { SettingsPanel } from '@/components/settings/SettingsPanel';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  contentType: string | null;
  onContentTypeChange: (type: string | null) => void;
  showFavorites: boolean;
  onShowFavoritesChange: (show: boolean) => void;
}

const CONTENT_TYPE_TABS: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
}[] = [
  { label: '全部', value: null, icon: null },
  { label: '文本', value: 'text', icon: <FileText className="h-3 w-3" /> },
  { label: '图片', value: 'image', icon: <Image className="h-3 w-3" /> },
  { label: '文件', value: 'file', icon: <FolderOpen className="h-3 w-3" /> },
];

export function Header({
  searchQuery,
  onSearchChange,
  contentType,
  onContentTypeChange,
  showFavorites,
  onShowFavoritesChange,
}: HeaderProps) {
  const { resolvedTheme, setTheme } = useThemeStore();
  const { clearItems } = useClipboardStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearItems();
      setClearDialogOpen(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <header className="flex flex-col gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="搜索剪贴板历史..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={toggleTheme}
            title="切换主题"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant={showFavorites ? 'secondary' : 'ghost'}
            size="icon"
            className="size-8"
            onClick={() => onShowFavoritesChange(!showFavorites)}
            title="仅显示收藏"
          >
            <Star
              className={cn(
                'h-4 w-4',
                showFavorites && 'fill-amber-500 text-amber-500'
              )}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setClearDialogOpen(true)}
            title="清空历史"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setSettingsOpen(true)}
            title="设置"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {CONTENT_TYPE_TABS.map((tab) => (
            <Button
              key={tab.label}
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 px-2.5 text-xs gap-1 rounded-full transition-colors',
                contentType === tab.value &&
                  'bg-accent text-accent-foreground'
              )}
              onClick={() => onContentTypeChange(tab.value)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          ))}
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
            title="显示快捷键"
          >
            <Keyboard className="h-3 w-3" />
            <span className="hidden sm:inline">Ctrl+Alt+K</span>
          </Button>
        </div>
      </header>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>清空剪贴板历史</DialogTitle>
            <DialogDescription>
              确定要清空所有剪贴板历史记录吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={isClearing}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearHistory}
              disabled={isClearing}
            >
              {isClearing ? '清空中...' : '确认清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

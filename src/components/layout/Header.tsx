import { Search, Settings, FileText, Image, FolderOpen, Sun, Moon } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  contentType: string | null;
  onContentTypeChange: (type: string | null) => void;
}

const CONTENT_TYPE_TABS: { label: string; value: string | null; icon: React.ReactNode }[] = [
  { label: '全部', value: null, icon: null },
  { label: '文本', value: 'text', icon: <FileText className="h-3 w-3" /> },
  { label: '图片', value: 'image', icon: <Image className="h-3 w-3" /> },
  { label: '文件', value: 'file', icon: <FolderOpen className="h-3 w-3" /> },
];

export function Header({ searchQuery, onSearchChange, contentType, onContentTypeChange }: HeaderProps) {
  const { resolvedTheme, setTheme } = useThemeStore();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
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
        <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme}>
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon" className="size-8">
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
              contentType === tab.value && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onContentTypeChange(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>
    </header>
  );
}

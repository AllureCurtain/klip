import { Search, Settings, FileText, Image, FolderOpen } from 'lucide-react';
import { Input, Button } from '@/components/ui';

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
  return (
    <header className="flex flex-col gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="搜索剪贴板历史..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        {CONTENT_TYPE_TABS.map((tab) => (
          <Button
            key={tab.label}
            variant={contentType === tab.value ? 'default' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs gap-1"
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

import { Search, Settings } from 'lucide-react';
import { Input, Button } from '@/components/ui';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Header({ searchQuery, onSearchChange }: HeaderProps) {
  return (
    <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
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
    </header>
  );
}

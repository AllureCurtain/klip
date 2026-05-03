import { Clipboard } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <Clipboard className="h-16 w-16 mb-4 text-gray-300" />
      <p className="text-lg font-medium">暂无剪贴板历史</p>
      <p className="text-sm text-gray-400 mt-1">
        复制内容后将自动出现在这里
      </p>
    </div>
  );
}

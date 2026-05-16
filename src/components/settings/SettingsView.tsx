import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useConfigStore } from '@/stores/configStore';
import {
  ArrowLeft,
  Settings,
  Keyboard,
  Sliders,
  Info,
  Monitor,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type SettingsTab = 'general' | 'shortcuts' | 'behavior' | 'about';

interface SettingsViewProps {
  onBack: () => void;
}

const TAB_ITEMS: { value: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { value: 'general', label: '通用', icon: <Sliders className="h-3.5 w-3.5" /> },
  { value: 'shortcuts', label: '快捷键', icon: <Keyboard className="h-3.5 w-3.5" /> },
  { value: 'behavior', label: '行为', icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: 'about', label: '关于', icon: <Info className="h-3.5 w-3.5" /> },
];

export function SettingsView({ onBack }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const {
    config,
    systemInfo,
    diagnosticsInfo,
    loading,
    error,
    hasChanges,
    fetchConfig,
    fetchSystemInfo,
    fetchDiagnosticsInfo,
    setMaxHistoryCount,
    setHotkeyToggleWindow,
    setHotkeyQuickPastePrefix,
    setAutoStart,
    setCloseToTray,
    setWindowWidth,
    setWindowHeight,
    setSearchDebounceMs,
    saveChanges,
    resetChanges,
  } = useConfigStore();

  useEffect(() => {
    fetchConfig();
    fetchSystemInfo();
    fetchDiagnosticsInfo();
  }, [fetchConfig, fetchSystemInfo, fetchDiagnosticsInfo]);

  const handleSave = async () => {
    await saveChanges();
    onBack();
  };

  const handleCancel = async () => {
    await resetChanges();
    onBack();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Title bar */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-2 pt-1.5 pb-1 border-b border-border"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={handleCancel}
          title="返回"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1.5" data-tauri-drag-region>
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">设置</span>
        </div>
      </div>

      {/* Tab row */}
      <div className="flex items-center gap-0.5 px-2 pb-1.5 border-b border-border">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.value}
            className={cn(
              'flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium transition-colors',
              activeTab === tab.value
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="max-history" className="text-xs">历史记录数量</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="max-history"
                  type="number"
                  min={10}
                  max={1000}
                  value={config.max_history_count}
                  onChange={(e) => setMaxHistoryCount(parseInt(e.target.value, 10) || 100)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">
                  最大条目数
                </span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs">窗口尺寸</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={300}
                  max={1000}
                  value={config.window_width}
                  onChange={(e) => setWindowWidth(parseInt(e.target.value, 10) || 480)}
                  className="h-7 w-16 text-xs"
                />
                <span className="text-muted-foreground text-xs">x</span>
                <Input
                  type="number"
                  min={400}
                  max={1400}
                  value={config.window_height}
                  onChange={(e) => setWindowHeight(parseInt(e.target.value, 10) || 720)}
                  className="h-7 w-16 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="debounce" className="text-xs">搜索防抖</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="debounce"
                  type="number"
                  min={50}
                  max={1000}
                  step={50}
                  value={config.search_debounce_ms}
                  onChange={(e) => setSearchDebounceMs(parseInt(e.target.value, 10) || 150)}
                  className="h-7 w-20 text-xs"
                />
                <span className="text-[10px] text-muted-foreground">毫秒</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hotkey-toggle-window" className="text-xs">切换窗口</Label>
              <Input
                id="hotkey-toggle-window"
                value={config.hotkey_toggle_window}
                onChange={(e) => setHotkeyToggleWindow(e.target.value)}
                placeholder="Ctrl+Alt+K"
                className="h-7 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                支持 Ctrl+Alt+A 到 Ctrl+Alt+Z
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="hotkey-quick-paste-prefix" className="text-xs">快速粘贴前缀</Label>
              <Input
                id="hotkey-quick-paste-prefix"
                value={config.hotkey_quick_paste_prefix}
                onChange={(e) => setHotkeyQuickPastePrefix(e.target.value)}
                placeholder="Ctrl+Alt"
                className="h-7 font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                前缀 + 数字键快速粘贴
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <Badge key={n} variant="outline" className="font-mono text-[10px] py-0">
                    {config.hotkey_quick_paste_prefix}+{n}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'behavior' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">开机自启动</Label>
                <p className="text-[10px] text-muted-foreground">
                  系统启动时自动运行
                </p>
              </div>
              <Switch
                checked={config.auto_start}
                onCheckedChange={setAutoStart}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs">关闭到托盘</Label>
                <p className="text-[10px] text-muted-foreground">
                  关闭时隐藏而非退出
                </p>
              </div>
              <Switch
                checked={config.close_to_tray}
                onCheckedChange={setCloseToTray}
              />
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
                K
              </div>
              <div>
                <h3 className="text-sm font-semibold">Klip</h3>
                <p className="text-[10px] text-muted-foreground">
                  跨平台剪贴板管理器
                </p>
              </div>
            </div>

            {systemInfo && (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">版本</span>
                  <span className="font-mono">{systemInfo.app_version}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">平台</span>
                  <span className="capitalize">{systemInfo.platform}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">系统</span>
                  <span className="font-mono text-[10px]">{systemInfo.version}</span>
                </div>
              </div>
            )}

            {diagnosticsInfo && (
              <div className="space-y-1.5 rounded-md border bg-muted/30 p-2.5 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">数据目录</span>
                  <span className="truncate font-mono" title={diagnosticsInfo.data_dir}>
                    {diagnosticsInfo.data_dir}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">数据库</span>
                  <span className="truncate font-mono" title={diagnosticsInfo.db_path}>
                    {diagnosticsInfo.db_path}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">日志目录</span>
                  <span className="truncate font-mono" title={diagnosticsInfo.log_dir}>
                    {diagnosticsInfo.log_dir}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {error && (
        <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-3 py-1.5 text-[11px] text-destructive">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-3 pb-2 pt-1 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={loading}
          className="h-7 text-xs"
        >
          取消
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={loading || !hasChanges}
          className="h-7 text-xs"
        >
          {loading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          保存
        </Button>
      </div>
    </div>
  );
}

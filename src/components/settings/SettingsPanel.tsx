import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useConfigStore } from '@/stores/configStore';
import {
  Settings,
  Keyboard,
  Sliders,
  Info,
  Monitor,
  Loader2,
} from 'lucide-react';

export type SettingsTab = 'general' | 'shortcuts' | 'behavior' | 'about';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsPanel({
  open,
  onOpenChange,
  initialTab = 'general',
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
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
    if (open) {
      setActiveTab(initialTab);
      fetchConfig();
      fetchSystemInfo();
      fetchDiagnosticsInfo();
    }
  }, [open, initialTab, fetchConfig, fetchSystemInfo, fetchDiagnosticsInfo]);

  const handleSave = async () => {
    await saveChanges();
    onOpenChange(false);
  };

  const handleCancel = async () => {
    await resetChanges();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            设置
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as SettingsTab)}
          className="w-full"
        >
          <TabsList variant="line" className="w-full justify-start border-b bg-transparent p-0">
            <TabsTrigger value="general" className="gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              通用
            </TabsTrigger>
            <TabsTrigger value="shortcuts" className="gap-1.5">
              <Keyboard className="h-3.5 w-3.5" />
              快捷键
            </TabsTrigger>
            <TabsTrigger value="behavior" className="gap-1.5">
              <Monitor className="h-3.5 w-3.5" />
              行为
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-1.5">
              <Info className="h-3.5 w-3.5" />
              关于
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 max-h-[50vh] overflow-y-auto px-1">
            <TabsContent value="general" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="max-history">历史记录数量</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="max-history"
                      type="number"
                      min={10}
                      max={1000}
                      value={config.max_history_count}
                      onChange={(e) => setMaxHistoryCount(parseInt(e.target.value, 10) || 100)}
                      className="h-8 w-24"
                    />
                    <span className="text-xs text-muted-foreground">
                      保存的最大剪贴板条目数
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>窗口尺寸</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={300}
                      max={1000}
                      value={config.window_width}
                      onChange={(e) => setWindowWidth(parseInt(e.target.value, 10) || 480)}
                      className="h-8 w-20"
                    />
                    <span className="text-muted-foreground">x</span>
                    <Input
                      type="number"
                      min={400}
                      max={1400}
                      value={config.window_height}
                      onChange={(e) => setWindowHeight(parseInt(e.target.value, 10) || 720)}
                      className="h-8 w-20"
                    />
                    <span className="text-xs text-muted-foreground">像素</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="debounce">搜索防抖时间</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="debounce"
                      type="number"
                      min={50}
                      max={1000}
                      step={50}
                      value={config.search_debounce_ms}
                      onChange={(e) => setSearchDebounceMs(parseInt(e.target.value, 10) || 150)}
                      className="h-8 w-24"
                    />
                    <span className="text-xs text-muted-foreground">毫秒</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="shortcuts" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="hotkey-toggle-window">切换窗口快捷键</Label>
                  </div>
                  <Input
                    id="hotkey-toggle-window"
                    value={config.hotkey_toggle_window}
                    onChange={(e) => setHotkeyToggleWindow(e.target.value)}
                    placeholder="Ctrl+Alt+K"
                    className="h-8 font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    当前支持 Ctrl+Alt+A 到 Ctrl+Alt+Z，保存后无需重启即可重载。
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="hotkey-quick-paste-prefix">快速粘贴前缀</Label>
                  </div>
                  <Input
                    id="hotkey-quick-paste-prefix"
                    value={config.hotkey_quick_paste_prefix}
                    onChange={(e) => setHotkeyQuickPastePrefix(e.target.value)}
                    placeholder="Ctrl+Alt"
                    className="h-8 font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    当前版本支持 Ctrl+Alt，按住前缀 + 数字键快速粘贴对应条目。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <Badge key={n} variant="outline" className="font-mono text-xs">
                        {config.hotkey_quick_paste_prefix}+{n}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="behavior" className="mt-0 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>开机自启动</Label>
                    <p className="text-xs text-muted-foreground">
                      系统启动时自动运行 Klip
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
                    <Label>关闭时最小化到托盘</Label>
                    <p className="text-xs text-muted-foreground">
                      点击关闭按钮时隐藏到系统托盘而非退出
                    </p>
                  </div>
                  <Switch
                    checked={config.close_to_tray}
                    onCheckedChange={setCloseToTray}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="about" className="mt-0 space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                    K
                  </div>
                  <div>
                    <h3 className="font-semibold">Klip</h3>
                    <p className="text-xs text-muted-foreground">
                      跨平台剪贴板管理器
                    </p>
                  </div>
                </div>
              </div>

              {systemInfo && (
                <div className="space-y-2 text-sm">
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
                    <span className="text-muted-foreground">系统版本</span>
                    <span className="font-mono text-xs">{systemInfo.version}</span>
                  </div>
                </div>
              )}

              {diagnosticsInfo && (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">数据目录</span>
                    <span className="truncate font-mono text-xs" title={diagnosticsInfo.data_dir}>
                      {diagnosticsInfo.data_dir}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">数据库</span>
                    <span className="truncate font-mono text-xs" title={diagnosticsInfo.db_path}>
                      {diagnosticsInfo.db_path}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">日志目录</span>
                    <span className="truncate font-mono text-xs" title={diagnosticsInfo.log_dir}>
                      {diagnosticsInfo.log_dir}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={loading || !hasChanges}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

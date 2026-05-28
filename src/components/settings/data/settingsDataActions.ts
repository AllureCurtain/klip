import { useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';

export const DEFAULT_TAG_COLOR = '#14b8a6';

export const JSON_FILTER = [{ name: 'JSON', extensions: ['json'] }];
export const CSV_FILTER = [{ name: 'CSV', extensions: ['csv'] }];
export const DB_FILTER = [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3'] }];

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export function useSettingsDataActions() {
  const [status, setStatus] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const run = async <T,>(
    actionId: string,
    action: () => Promise<T | null>,
    message: string
  ) => {
    setBusyAction(actionId);
    try {
      const result = await action();
      if (result && message) setStatus(message);
      return result;
    } finally {
      setBusyAction(null);
    }
  };

  return { status, setStatus, busyAction, run };
}

export async function chooseSavePath(
  setter: (value: string) => void,
  defaultPath: string,
  filters: DialogFilter[]
) {
  const selected = await save({ defaultPath, filters });
  if (selected) setter(selected);
}

export async function chooseOpenPath(
  setter: (value: string) => void,
  filters: DialogFilter[]
) {
  const selected = await open({ multiple: false, filters });
  if (typeof selected === 'string') setter(selected);
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export async function copyText(value: string): Promise<void> {
  await navigator.clipboard?.writeText(value);
}

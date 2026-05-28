import type { ReactNode } from 'react';
import { Button, Input } from '@/components/ui';
import { Label } from '@/components/ui/label';

interface PathAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabledWithoutValue?: boolean;
}

interface PathActionsProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  actions: PathAction[];
  busyAction: string | null;
}

export function PathActions({
  id,
  label,
  value,
  onChange,
  placeholder,
  actions,
  busyAction,
}: PathActionsProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-7 font-mono text-[11px]"
      />
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={action.onClick}
            disabled={
              (action.disabledWithoutValue !== false && value.trim() === '') ||
              busyAction !== null
            }
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

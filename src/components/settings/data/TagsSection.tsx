import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, Input } from '@/components/ui';
import type { Tag } from '@/types';
import { SectionCard } from '../primitives';
import { DEFAULT_TAG_COLOR } from './settingsDataActions';

interface TagsSectionProps {
  tags: Tag[];
  createTag: (name: string, color?: string | null) => Promise<Tag | null>;
  deleteTag: (id: number) => Promise<void>;
  setStatus: (status: string) => void;
}

export function TagsSection({
  tags,
  createTag,
  deleteTag,
  setStatus,
}: TagsSectionProps) {
  const { t } = useTranslation();
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(DEFAULT_TAG_COLOR);

  const handleCreateTag = async () => {
    const tag = await createTag(tagName, tagColor);
    if (tag) {
      setTagName('');
      setStatus(t('settings.data.tagCreated', { name: tag.name }));
    }
  };

  return (
    <SectionCard
      title={t('settings.data.tags')}
      description={t('settings.data.tagsDesc')}
    >
      <div className="flex gap-2">
        <Input
          value={tagName}
          onChange={(event) => setTagName(event.target.value)}
          placeholder={t('settings.data.tagName')}
          className="h-7 text-xs"
          aria-label={t('settings.data.tagName')}
        />
        <Input
          type="color"
          value={tagColor}
          onChange={(event) => setTagColor(event.target.value)}
          className="h-7 w-12 p-1"
          aria-label={t('settings.data.tagColor')}
        />
        <Button
          size="sm"
          className="h-7"
          onClick={handleCreateTag}
          disabled={tagName.trim() === ''}
          aria-label={t('settings.data.createTag')}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag.id} variant="outline" className="gap-1">
            {tag.color && (
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
            )}
            {tag.name}
            <button
              type="button"
              className="ml-1 text-[var(--muted)] transition-colors hover:text-[var(--danger)]"
              onClick={() => deleteTag(tag.id)}
              aria-label={t('settings.data.deleteTag', { name: tag.name })}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
    </SectionCard>
  );
}

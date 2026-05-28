import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardCopy, Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import type { Snippet } from '@/types';
import { copyText } from './settingsDataActions';

interface SnippetsSectionProps {
  snippets: Snippet[];
  createSnippet: (input: {
    title: string;
    content: string;
    tagId: number | null;
    isFavorited: boolean;
  }) => Promise<Snippet | null>;
  deleteSnippet: (id: number) => Promise<void>;
  setStatus: (status: string) => void;
}

export function SnippetsSection({
  snippets,
  createSnippet,
  deleteSnippet,
  setStatus,
}: SnippetsSectionProps) {
  const { t } = useTranslation();
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetContent, setSnippetContent] = useState('');

  const handleCreateSnippet = async () => {
    const snippet = await createSnippet({
      title: snippetTitle,
      content: snippetContent,
      tagId: null,
      isFavorited: false,
    });
    if (snippet) {
      setSnippetTitle('');
      setSnippetContent('');
      setStatus(t('settings.data.snippetCreated', { title: snippet.title }));
    }
  };

  return (
    <section className="space-y-2">
      <Label className="text-xs">{t('settings.data.snippets')}</Label>
      <div className="grid gap-2">
        <Label htmlFor="snippet-title" className="sr-only">
          {t('settings.data.snippetTitle')}
        </Label>
        <Input
          id="snippet-title"
          value={snippetTitle}
          onChange={(event) => setSnippetTitle(event.target.value)}
          placeholder={t('settings.data.snippetTitle')}
          className="h-7 text-xs"
        />
        <Label htmlFor="snippet-content" className="sr-only">
          {t('settings.data.snippetContent')}
        </Label>
        <Input
          id="snippet-content"
          value={snippetContent}
          onChange={(event) => setSnippetContent(event.target.value)}
          placeholder={t('settings.data.snippetContent')}
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          className="h-7 justify-self-start text-xs"
          onClick={handleCreateSnippet}
          disabled={snippetTitle.trim() === '' || snippetContent.trim() === ''}
        >
          <Plus className="h-3 w-3" />
          {t('settings.data.createSnippet')}
        </Button>
      </div>
      <div className="space-y-1">
        {snippets.map((snippet) => (
          <div
            key={snippet.id}
            className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{snippet.title}</p>
              <p className="truncate text-[10px] text-muted-foreground">
                {snippet.content}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={t('settings.data.copySnippet', { title: snippet.title })}
              onClick={() => void copyText(snippet.content)}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-destructive"
              aria-label={t('settings.data.deleteSnippet', { title: snippet.title })}
              onClick={() => void deleteSnippet(snippet.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImagePreviewProps {
  src: string;
  alt: string;
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImagePreview({
  src,
  alt,
  metadata,
  open,
  onOpenChange,
}: ImagePreviewProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clipboard-image.${metadata?.format || 'png'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // download failed — silently ignore in UI
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] max-h-[90vh] overflow-hidden p-0">
        <DialogHeader className="flex-shrink-0 px-4 pt-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-sm">{t('imagePreview.title')}</DialogTitle>
            <div className="flex items-center gap-2">
              {metadata && (
                <>
                  {metadata.width && metadata.height && (
                    <Badge variant="secondary" className="font-mono text-xs">
                      {metadata.width} x {metadata.height}
                    </Badge>
                  )}
                  {metadata.format && (
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {metadata.format}
                    </Badge>
                  )}
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={handleDownload}
                aria-label={t('imagePreview.download')}
                title={t('imagePreview.download')}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="relative flex-1 overflow-auto min-h-0 px-4 pb-4">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            className="w-full h-auto max-h-[55vh] object-contain rounded-md"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ImagePreviewTriggerProps {
  src: string;
  alt: string;
  metadata?: {
    width?: number;
    height?: number;
    format?: string;
  };
  className?: string;
  children: React.ReactNode;
}

export function ImagePreviewTrigger({
  src,
  alt,
  metadata,
  className,
  children,
}: ImagePreviewTriggerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        {children}
      </div>
      <ImagePreview
        src={src}
        alt={alt}
        metadata={metadata}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

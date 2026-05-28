import { useCallback, useEffect, useRef, useState } from 'react';
import { useClipboardStore } from '@/stores';
import type { ClipboardItem } from '@/types';

export function useClipboardItemActions({
  item,
  selectionMode,
  onSelect,
}: {
  item: ClipboardItem;
  selectionMode: boolean;
  onSelect?: () => void;
}) {
  const {
    deleteItem,
    copyItem,
    toggleFavorite,
    tags,
    assignTagToItem,
    removeTagFromItem,
    selectedIds,
    toggleSelected,
  } = useClipboardStore();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isBatchSelected = selectedIds.includes(item.id);

  const handleCopy = useCallback(() => {
    copyItem(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 800);
  }, [copyItem, item.id]);

  const handleClick = useCallback(() => {
    onSelect?.();
    if (selectionMode) {
      toggleSelected(item.id);
      return;
    }
    handleCopy();
  }, [handleCopy, item.id, onSelect, selectionMode, toggleSelected]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      clearTimeout(confirmTimerRef.current);
      deleteItem(item.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      confirmTimerRef.current = setTimeout(() => setConfirmDelete(false), 2000);
    }
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(item.id);
  };

  const handleToggleTagMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTagMenuOpen((open) => !open);
  };

  const handleTagAction = (
    e: React.MouseEvent,
    tagId: number,
    assigned: boolean
  ) => {
    e.stopPropagation();
    if (assigned) {
      removeTagFromItem(item.id, tagId);
    } else {
      assignTagToItem(item.id, tagId);
    }
  };

  const handleToggleSelected = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    toggleSelected(item.id);
  };

  useEffect(() => {
    return () => clearTimeout(confirmTimerRef.current);
  }, []);

  return {
    copied,
    confirmDelete,
    tagMenuOpen,
    tags,
    isBatchSelected,
    handleClick,
    handleDelete,
    handleToggleFavorite,
    handleToggleTagMenu,
    handleTagAction,
    handleToggleSelected,
  };
}

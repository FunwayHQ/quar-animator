import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

// ============================================================================
// Types
// ============================================================================

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface ContextMenuSeparator {
  type: 'separator';
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}

// ============================================================================
// ContextMenu Component
// ============================================================================

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const focusIndexRef = useRef(-1);

  // Position with viewport edge flipping
  const getPosition = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return { left: x, top: y };

    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;

    if (x + rect.width > window.innerWidth) {
      left = x - rect.width;
    }
    if (y + rect.height > window.innerHeight) {
      top = y - rect.height;
    }
    // Ensure we don't go off-screen left/top
    if (left < 0) left = 0;
    if (top < 0) top = 0;

    return { left, top };
  }, [x, y]);

  // Apply position after mount and auto-focus for keyboard navigation
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const { left, top } = getPosition();
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.focus();
  }, [getPosition]);

  // Get navigable (non-separator, non-disabled) item indices
  const getNavigableIndices = useCallback(() => {
    return items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !isSeparator(item) && !item.disabled)
      .map(({ i }) => i);
  }, [items]);

  // Focus management
  const focusItem = useCallback(
    (index: number) => {
      const menu = menuRef.current;
      if (!menu) return;
      const buttons = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      // Map the items array index to the button index (separators don't have buttons with menuitem role)
      let buttonIndex = 0;
      for (let i = 0; i < items.length; i++) {
        if (i === index) break;
        if (!isSeparator(items[i]!)) buttonIndex++;
      }
      buttons[buttonIndex]?.focus();
      focusIndexRef.current = index;
    },
    [items]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const navigable = getNavigableIndices();
      if (navigable.length === 0) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const currentPos = navigable.indexOf(focusIndexRef.current);
        const nextPos = currentPos < navigable.length - 1 ? currentPos + 1 : 0;
        focusItem(navigable[nextPos] ?? 0);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const currentPos = navigable.indexOf(focusIndexRef.current);
        const prevPos = currentPos > 0 ? currentPos - 1 : navigable.length - 1;
        focusItem(navigable[prevPos] ?? 0);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[focusIndexRef.current];
        if (item && !isSeparator(item) && !item.disabled) {
          item.onClick();
          onClose();
        }
        return;
      }
    },
    [items, onClose, getNavigableIndices, focusItem]
  );

  // Handle item click
  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onClick();
      onClose();
    },
    [onClose]
  );

  return createPortal(
    <>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- overlay dismisses menu on click, Escape handled by menu */}
      <div
        className={styles.overlay}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        data-testid="context-menu-overlay"
      />
      <div
        ref={menuRef}
        className={styles.menu}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ left: x, top: y }}
        data-testid="context-menu"
      >
        {items.map((entry, index) => {
          if (isSeparator(entry)) {
            return <div key={`sep-${index}`} className={styles.separator} role="separator" />;
          }

          const item = entry;
          return (
            <button
              key={item.id}
              className={`${styles.menuItem} ${item.disabled ? styles.disabled : ''} ${item.danger ? styles.danger : ''}`}
              role="menuitem"
              aria-disabled={item.disabled}
              onClick={() => handleItemClick(item)}
              tabIndex={-1}
              data-testid={`context-menu-item-${item.id}`}
            >
              {item.icon && <span className={styles.menuItemIcon}>{item.icon}</span>}
              <span className={styles.menuItemLabel}>{item.label}</span>
              {item.shortcut && <span className={styles.menuItemShortcut}>{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}

export default ContextMenu;

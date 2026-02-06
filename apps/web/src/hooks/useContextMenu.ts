import { useState, useCallback } from 'react';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export function useContextMenu(): {
  menuState: ContextMenuState;
  openMenu: (e: React.MouseEvent) => void;
  closeMenu: () => void;
} {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ isOpen: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({ isOpen: false, x: 0, y: 0 });
  }, []);

  return { menuState, openMenu, closeMenu };
}

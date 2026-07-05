/**
 * Tests for PageTabs Component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PageTabs } from './PageTabs';
import { useEditorStore, type PageData } from '../../stores/editorStore';
import { createTimeline } from '@quar/animation';

// Mock SceneGraphContext
const mockSceneGraph = {
  getNode: vi.fn(),
  getRootNodes: vi.fn(() => []),
  addNode: vi.fn(),
  removeNode: vi.fn(),
  updateNode: vi.fn(),
  moveNode: vi.fn(),
  getDescendants: vi.fn(() => []),
  traverse: vi.fn(),
  getWorldTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 })),
  toJSON: vi.fn(() => ({ nodes: [], rootNodeIds: [] })),
  fromJSON: vi.fn(),
  on: vi.fn(() => vi.fn()),
};

vi.mock('../../contexts/SceneGraphContext', () => ({
  useSceneGraph: () => mockSceneGraph,
}));

function createTestPage(id: string, name: string): PageData {
  return {
    id,
    name,
    sceneGraphJSON: { nodes: [], rootNodeIds: [] },
    timeline: createTimeline({ duration: 300, frameRate: 30 }),
    selectedNodeIds: [],
    undoStack: [],
    redoStack: [],
  };
}

describe('PageTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const page1 = createTestPage('page-1', 'Page 1');
    useEditorStore.setState({
      pages: [page1],
      activePageId: 'page-1',
    });
  });

  it('should render a single page tab', () => {
    render(<PageTabs />);
    expect(screen.getByText('Page 1')).toBeDefined();
  });

  it('should render multiple page tabs', () => {
    useEditorStore.setState({
      pages: [
        createTestPage('page-1', 'Home'),
        createTestPage('page-2', 'About'),
        createTestPage('page-3', 'Contact'),
      ],
      activePageId: 'page-1',
    });

    render(<PageTabs />);
    expect(screen.getByText('Home')).toBeDefined();
    expect(screen.getByText('About')).toBeDefined();
    expect(screen.getByText('Contact')).toBeDefined();
  });

  it('should highlight the active tab', () => {
    useEditorStore.setState({
      pages: [createTestPage('page-1', 'Page 1'), createTestPage('page-2', 'Page 2')],
      activePageId: 'page-2',
    });

    render(<PageTabs />);
    const activeTab = screen.getByTestId('page-tab-page-2');
    expect(activeTab.className).toContain('active');
  });

  it('should have an add page button', () => {
    render(<PageTabs />);
    expect(screen.getByTestId('add-page-button')).toBeDefined();
  });

  it('should call addPage when clicking add button', () => {
    render(<PageTabs />);
    const addButton = screen.getByTestId('add-page-button');
    fireEvent.click(addButton);
    // After addPage, there should be 2 pages
    expect(useEditorStore.getState().pages.length).toBe(2);
  });

  it('should hide close button when only one page', () => {
    render(<PageTabs />);
    const closeButtons = screen.queryAllByTestId(/^page-tab-close-/);
    expect(closeButtons.length).toBe(0);
  });

  it('should show close buttons when multiple pages', () => {
    useEditorStore.setState({
      pages: [createTestPage('page-1', 'Page 1'), createTestPage('page-2', 'Page 2')],
      activePageId: 'page-1',
    });

    render(<PageTabs />);
    const closeButtons = screen.queryAllByTestId(/^page-tab-close-/);
    expect(closeButtons.length).toBe(2);
  });

  it('deletes a page only after a confirming second click (F014)', () => {
    const deleteSpy = vi.fn();
    const orig = useEditorStore.getState().deletePage;
    useEditorStore.setState({
      pages: [createTestPage('page-1', 'Page 1'), createTestPage('page-2', 'Page 2')],
      activePageId: 'page-1',
      deletePage: deleteSpy,
    });
    try {
      render(<PageTabs />);
      const close = screen.getByTestId('page-tab-close-page-2');

      fireEvent.click(close);
      expect(deleteSpy).not.toHaveBeenCalled(); // first click only arms

      fireEvent.click(close);
      expect(deleteSpy).toHaveBeenCalledWith('page-2', expect.anything());
    } finally {
      useEditorStore.setState({ deletePage: orig });
    }
  });

  it('should switch page on tab click', () => {
    useEditorStore.setState({
      pages: [createTestPage('page-1', 'Page 1'), createTestPage('page-2', 'Page 2')],
      activePageId: 'page-1',
    });

    render(<PageTabs />);
    const tab2 = screen.getByTestId('page-tab-page-2');
    fireEvent.click(tab2);

    expect(useEditorStore.getState().activePageId).toBe('page-2');
  });

  it('should show rename input on double-click', () => {
    render(<PageTabs />);
    const tab = screen.getByTestId('page-tab-page-1');
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue('Page 1');
    expect(input).toBeDefined();
    expect(input.tagName).toBe('INPUT');
  });

  it('should commit rename on Enter', () => {
    render(<PageTabs />);
    const tab = screen.getByTestId('page-tab-page-1');
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue('Page 1');
    fireEvent.change(input, { target: { value: 'My Page' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useEditorStore.getState().pages[0]!.name).toBe('My Page');
  });

  it('should cancel rename on Escape', () => {
    render(<PageTabs />);
    const tab = screen.getByTestId('page-tab-page-1');
    fireEvent.doubleClick(tab);

    const input = screen.getByDisplayValue('Page 1');
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Name should not have changed
    expect(useEditorStore.getState().pages[0]!.name).toBe('Page 1');
  });

  it('should show context menu on right-click', () => {
    render(<PageTabs />);
    const tab = screen.getByTestId('page-tab-page-1');
    fireEvent.contextMenu(tab);

    expect(screen.getByText('Rename')).toBeDefined();
    expect(screen.getByText('Duplicate')).toBeDefined();
  });

  it('should not show Delete in context menu when only one page', () => {
    render(<PageTabs />);
    const tab = screen.getByTestId('page-tab-page-1');
    fireEvent.contextMenu(tab);

    expect(screen.queryByText('Delete')).toBeNull();
  });
});

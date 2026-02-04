import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Settings } from 'lucide-react';
import { Panel } from './Panel';
import { IconButton } from './IconButton';

const meta: Meta<typeof Panel> = {
  title: 'Components/Panel',
  component: Panel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Panel>;

export const Default: Story = {
  args: {
    title: 'Properties',
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>Position: X: 100, Y: 200</div>
        <div>Size: 200 x 150</div>
        <div>Rotation: 45°</div>
      </div>
    ),
  },
};

export const Collapsed: Story = {
  args: {
    title: 'Collapsed Panel',
    defaultExpanded: false,
    children: <div>This content is hidden by default</div>,
  },
};

export const NonCollapsible: Story = {
  args: {
    title: 'Always Visible',
    collapsible: false,
    children: <div>This panel cannot be collapsed</div>,
  },
};

export const WithHeaderActions: Story = {
  args: {
    title: 'Layers',
    headerActions: (
      <>
        <IconButton icon={<Plus size={14} />} size="sm" tooltip="Add layer" />
        <IconButton icon={<Settings size={14} />} size="sm" tooltip="Settings" />
      </>
    ),
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div>Layer 1</div>
        <div>Layer 2</div>
        <div>Layer 3</div>
      </div>
    ),
  },
};

export const MultiplePanels: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '300px' }}>
      <Panel title="Transform">
        <div>Position, rotation, scale controls</div>
      </Panel>
      <Panel title="Appearance" defaultExpanded={false}>
        <div>Fill, stroke, opacity controls</div>
      </Panel>
      <Panel title="Effects" defaultExpanded={false}>
        <div>Shadow, blur effects</div>
      </Panel>
    </div>
  ),
};

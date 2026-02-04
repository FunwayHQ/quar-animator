import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { PropertiesPanel } from './PropertiesPanel';

describe('PropertiesPanel', () => {
  it('renders the panel title', () => {
    render(<PropertiesPanel />);
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
  });

  it('renders Transform section with all properties', () => {
    render(<PropertiesPanel />);

    // Section title
    expect(screen.getByText('Transform')).toBeInTheDocument();

    // Property labels
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Rotation')).toBeInTheDocument();
  });

  it('renders Position inputs with X and Y', () => {
    render(<PropertiesPanel />);

    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Y')).toBeInTheDocument();

    // Check for default position values
    const positionInputs = screen.getAllByDisplayValue('0');
    expect(positionInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Size inputs with W and H', () => {
    render(<PropertiesPanel />);

    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('H')).toBeInTheDocument();

    // Check for default size values (W=100, H=100, plus opacity slider also has 100)
    const sizeInputs = screen.getAllByDisplayValue('100');
    expect(sizeInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Rotation input with degree symbol', () => {
    render(<PropertiesPanel />);

    const rotationInput = screen.getByDisplayValue('0°');
    expect(rotationInput).toBeInTheDocument();
  });

  it('renders Appearance section with Fill, Stroke, and Opacity', () => {
    render(<PropertiesPanel />);

    // Section title
    expect(screen.getByText('Appearance')).toBeInTheDocument();

    // Property labels
    expect(screen.getByText('Fill')).toBeInTheDocument();
    expect(screen.getByText('Stroke')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
  });

  it('renders color inputs with default values', () => {
    render(<PropertiesPanel />);

    expect(screen.getByDisplayValue('#3B82F6')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#1E40AF')).toBeInTheDocument();
  });

  it('renders opacity slider with 100% default', () => {
    render(<PropertiesPanel />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('100');

    expect(screen.getByDisplayValue('100%')).toBeInTheDocument();
  });

  it('renders empty state message', () => {
    render(<PropertiesPanel />);
    expect(screen.getByText('Select an object to view properties')).toBeInTheDocument();
  });
});

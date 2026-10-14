import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import type { RenderOptions, RenderResult } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Custom render with providers
function AllProviders({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>): RenderResult {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

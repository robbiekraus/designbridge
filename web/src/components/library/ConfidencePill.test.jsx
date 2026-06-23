import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfidencePill from './ConfidencePill.jsx';

describe('ConfidencePill', () => {
  it('renders nothing when value is missing', () => {
    const { container } = render(<ConfidencePill value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the confidence label', () => {
    render(<ConfidencePill value="high" />);
    expect(screen.getByText('high')).toBeInTheDocument();
  });

  it('normalizes "medium" to "med"', () => {
    render(<ConfidencePill value="medium" />);
    expect(screen.getByText('med')).toBeInTheDocument();
  });
});

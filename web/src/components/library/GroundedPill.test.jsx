import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GroundedPill from './GroundedPill.jsx';

describe('GroundedPill', () => {
  it('rendert nichts ohne Namen', () => {
    const { container } = render(<GroundedPill names={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rendert nichts bei undefined', () => {
    const { container } = render(<GroundedPill names={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ein Baustein → schlichtes shadcn/ui-Label', () => {
    render(<GroundedPill names={['Button']} />);
    const pill = screen.getByText('shadcn/ui');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute('title', 'Gegen shadcn/ui aufgelöst: Button');
  });

  it('mehrere → Anzahl im Label, alle Namen im Tooltip', () => {
    render(<GroundedPill names={['Button', 'Input']} />);
    const pill = screen.getByText('shadcn/ui · 2');
    expect(pill).toHaveAttribute('title', 'Gegen shadcn/ui aufgelöst: Button, Input');
  });
});

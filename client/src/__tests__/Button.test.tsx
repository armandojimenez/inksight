import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders as a button element by default', () => {
    render(<Button>Click me</Button>);

    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('renders as child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>,
    );

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('Link button');
    expect(link).toHaveAttribute('href', '/test');
  });

  it('applies variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>);

    const button = screen.getByRole('button');
    expect(button.className).toContain('hover:bg');
  });
});

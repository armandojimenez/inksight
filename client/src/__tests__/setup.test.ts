import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('vitest runs with jsdom environment', () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
  });
});

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom implements neither of these. They are layout/clipboard concerns with no
// bearing on the behaviour under test, so they are stubbed rather than worked
// around in the components.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    configurable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // nock patches Node's http module, so tests must not be isolated in a browser-like environment
  },
});

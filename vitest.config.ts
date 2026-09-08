import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./__tests__/setup.ts'],
    // e2e/ holds Playwright specs (run via `npx playwright test`, a different runner
    // with an incompatible test.describe API) -- excluded here so vitest doesn't try
    // to pick them up via its default *.spec.ts glob.
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // NFR (08-non-functional-requirements, prd-intern-docflow.md §8): "Test coverage
      // at least 70% on workflow, signature, and authorisation modules." Scoped to
      // exactly those modules, not the whole lib/ tree -- this was previously
      // unmeasured entirely (docs/09-project-audit.md, 2026-08-28 audit, gap #22).
      include: [
        'lib/state-machine/**',      // workflow
        'lib/data/submissions.ts',   // workflow (transitions, approve/return/reassign/cancel/reopen)
        'lib/data/signatures.ts',    // signature
        'lib/pdf/**',                // signature (compositing)
        'lib/data/auth.ts',          // authorisation
        'lib/data/users.ts',         // authorisation (role checks, self-service guards)
        'lib/data/privacy.ts',       // authorisation-adjacent (FR-25 acknowledgement gate)
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '#lib': path.resolve(__dirname, './lib'),
      // Matches tsconfig.json's actual "@lib/*" path mapping used throughout the app
      // (route handlers, page.tsx server components). Every existing test that touches
      // a route handler fully mocks each of its `@lib/...` imports, so this gap never
      // mattered until a test needed one to resolve for real.
      '@lib': path.resolve(__dirname, './lib'),
    },
  },
})

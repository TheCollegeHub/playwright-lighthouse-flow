
# @thecollege/playwright-lighthouse-flow

This utility enables integration of [Google Lighthouse](https://github.com/GoogleChrome/lighthouse) — using its **Flow Mode** — with [Playwright](https://playwright.dev/). It helps generate performance reports during your end-to-end testing flows with minimal effort.

## Features

- Use Lighthouse Flow API with Playwright's Chromium context.
- Automatically launches a persistent browser with a remote debugging port.
- Authenticated flows supported via custom login functions.
- Generates `.html` and `.json` Lighthouse reports per test.
- Output organized by test name and timestamp.

---

## Installation

```bash
npm install @thecollege/playwright-lighthouse-flow
```

> ⚠️ This library assumes your project is using ESModules (`"type": "module"` or `module: "ESNext"` in `tsconfig.json`).

---

## Usage

### 1. Extend your Playwright test

Create a custom fixture by importing `createLighthouseTest`:

```ts
// tests/lighthouse.spec.ts
import { createLighthouseTest, connectToLighthouseFlow, generateLighthouseReportUsingFlow, getLighthouseReportPaths } from '@thecollege/playwright-lighthouse-flow';

const test = createLighthouseTest({
  login: async (page) => {
    await page.goto('https://your-app.com/login');
    await page.fill('#username', 'your-user');
    await page.fill('#password', 'your-pass');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  }
});

test('Lighthouse audit using timespan mode', async ({ authenticatedPage, port }) => {
 const route = '/dashboard';
  const flow = await connectToLighthouseFlow({
    port,
    config: {
      extends: 'lighthouse:default',
      settings: {
        screenEmulation: { disabled: true },
        formFactor: 'desktop'
      }
    },
    route,
    flowName: 'Dashboard Flow'
  });

  //Act - Navigate to Dashboard (Navigation Mode)
  await flow.navigate('https://example.com/' + route, { name: 'Dashboard' });
  
  //Act - Timespan for Download Report  (Timespan Mode)
  await flow.startTimespan({ name: 'Download Report' });

  // Simulate some realistic user interactions
  await authenticatedPage.click('text=Open Reports');
  await authenticatedPage.waitForTimeout(2000);
  await authenticatedPage.click('text=Download');
  await authenticatedPage.waitForTimeout(1000);

  // End timespan recording
  await flow.endTimespan();

  //Act - Snashot for Download Page (Snapshot Mode)
  await flow.snapshot({ name: 'Download Page' });

  // Generate reports
  const paths = getLighthouseReportPaths('dashboard-timespan');
  await generateLighthouseReportUsingFlow(flow, paths);
});
```

---

---

## ✅ Assertions

### `assertLighthouseFlowResultThresholds(flowResult, thresholds)`

This utility assertion allows you to **validate Lighthouse category scores** (like performance, accessibility, best-practices, SEO, etc.) against expected thresholds, per step of your Lighthouse Flow.

It’s useful in automated tests where you want to **fail only if a category exists and doesn't meet your quality threshold** — but ignore it if not applicable (e.g., snapshot mode doesn’t produce performance score).

#### Parameters

- `flowResult`: The result returned from Lighthouse Flow after running multiple steps.
- `thresholds`: A partial record of category keys and their required minimum scores (0–100).

#### Example

```ts
import { assertLighthouseFlowResultThresholds } from '@thecollege/playwright-lighthouse-flow';

const thresholds = {
    performance: 90,
    'best-practices': 90,
    accessibility: 95,
    seo: 90
};

const flowResult = await generateLighthouseReportUsingFlow(flow, paths);

assertLighthouseFlowResultThresholds(flowResult, thresholds);
```

#### Behavior

- Uses `expect.soft` to **continue asserting all categories**, even if one fails.
- Logs ✅ or ❌ results to the console for clear visibility.
- Skips validation for missing categories (with a warning).
- Converts Lighthouse scores (0–1) to percentage format (0–100).

#### Output Example

```bash
🔍 Validating Lighthouse step: "Dashboard"
✅ [Dashboard] Performance (performance): 92 ≥ 90
✅ [Dashboard] Accessibility (accessibility): 97 ≥ 95
❌ [Dashboard] Best Practices (best-practices): 89 < 90
```
---

## Directory Structure

Lighthouse reports will be saved under:

```
lighthouse-reports/
├── lighthouse-dashboard-<timestamp>.html
└── lighthouse-dashboard-<timestamp>.json
```

---

## Configuration Tips

Ensure your `tsconfig.json` is set to output ES modules:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "declaration": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "moduleResolution": "node"
  },
  "include": ["src"]
}
```

---

## Requirements

- Node.js v18 or higher
- Chromium-based browser (Playwright’s bundled Chromium)
- `puppeteer` to connect Lighthouse to the browser
- Remote debugging enabled in `launchPersistentContext`

---

## License

MIT © 2025 [The College](https://bythecollege.com)

---

## Author

Developed by [Nathan Araujo](https://github.com/araujosnathan) to simplify performance auditing during E2E tests with Lighthouse Flow. 

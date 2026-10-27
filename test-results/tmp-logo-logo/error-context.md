# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tmp-logo.spec.ts >> logo
- Location: e2e\tmp-logo.spec.ts:2:1

# Error details

```
Error: locator.screenshot: Target crashed 
Call log:
  - waiting for locator('.topbar')

```

# Test source

```ts
  1 | import { test } from "@playwright/test";
> 2 | test("logo", async ({ page }) => { await page.goto("/"); await page.locator(".topbar").screenshot({ path: "test-results/logo.png" }); });
    |                                                                                        ^ Error: locator.screenshot: Target crashed 
  3 | 
```
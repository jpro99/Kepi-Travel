import { config as loadEnv } from 'dotenv';
import path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

loadEnv({ path: path.resolve(__dirname, '../', '.env.local') });
const EMAIL = 'kepi-e2e-test@example.com';

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await clerk.signIn({ page, emailAddress: EMAIL });
}

interface DisruptionCapture {
  b: { airlineIata?: string };
  s: number;
}

interface FlightSearchCapture {
  s: number;
  ct: string;
}

interface NetworkErrorCapture {
  u: string;
  s: number;
}

test('Bug1: OnboardingFlow hidden when user has trips', async ({ page }) => {
  await signIn(page);
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug1.png', fullPage: true });
  const visible = await page.locator('text=Plan your first trip').first().isVisible().catch(() => false);
  console.log('BUG1_ONBOARDING_VISIBLE:', visible);
  expect(visible).toBe(false);
  await expect(page.locator('button').filter({ hasText: /^Home$/ }).first()).toBeVisible({ timeout: 5000 });
});

test('Bug2: disruption check not empty airlineIata', async ({ page }) => {
  const reqs: DisruptionCapture[] = [];
  await signIn(page);
  page.on('request', async (r) => {
    if (r.url().includes('/api/disruption/check') && r.method() === 'POST') {
      try {
        reqs.push({ b: r.postDataJSON() as { airlineIata?: string }, s: 0 });
      } catch {
        // ignore malformed capture
      }
    }
  });
  page.on('response', async (r) => {
    if (r.url().includes('/api/disruption/check')) {
      const i = reqs.length - 1;
      if (i >= 0) reqs[i].s = r.status();
    }
  });
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug2.png', fullPage: true });
  console.log('BUG2_DISRUPTION_REQS:', JSON.stringify(reqs));
  for (const r of reqs) {
    expect(r.b.airlineIata).not.toBe('');
    expect(r.s).not.toBe(400);
  }
});

test('Bug3: MyTripsModal closes on Escape', async ({ page }) => {
  await signIn(page);
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const tripsBtn = page.locator('button').filter({ hasText: 'Trips' }).first();
  await expect(tripsBtn).toBeVisible({ timeout: 10000 });
  await tripsBtn.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug3-open.png', fullPage: true });
  const hdr = page.locator('text=My trips').first();
  const opened = await hdr.isVisible().catch(() => false);
  console.log('BUG3_MODAL_OPENED:', opened);
  expect(opened).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug3-closed.png', fullPage: true });
  const still = await hdr.isVisible().catch(() => false);
  console.log('BUG3_MODAL_AFTER_ESC:', still);
  expect(still).toBe(false);
});

test('Bug4: book search returns JSON for logged-in user', async ({ page }) => {
  const apiResps: FlightSearchCapture[] = [];
  await signIn(page);
  await page.goto('/book', { waitUntil: 'domcontentloaded' });
  page.on('response', async (r) => {
    if (r.url().includes('/api/flights/search')) {
      const ct = r.headers()['content-type'] || '';
      apiResps.push({ s: r.status(), ct });
    }
  });
  const inp = page.locator('input');
  await inp.nth(0).fill('Los Angeles');
  await page.waitForTimeout(500);
  const lax = page.locator('button').filter({ hasText: 'LAX' }).first();
  if (await lax.isVisible().catch(() => false)) await lax.click();
  await inp.nth(1).fill('New York');
  await page.waitForTimeout(500);
  const jfk = page.locator('button').filter({ hasText: 'JFK' }).first();
  if (await jfk.isVisible().catch(() => false)) await jfk.click();
  const d = page.locator('input[type=date]');
  await d.nth(0).fill('2026-08-15');
  await d.nth(1).fill('2026-08-22');
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug4-filled.png' });
  await page.locator('button').filter({ hasText: 'Search flights' }).click();
  await page.waitForTimeout(10000);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-bug4-results.png', fullPage: true });
  console.log('BUG4_API_RESPS:', JSON.stringify(apiResps));
  for (const r of apiResps) {
    expect(r.ct, 'must be JSON').toContain('application/json');
  }
});

test('Bug5: admin health probe 200 not 403', async ({ page }) => {
  await signIn(page);
  let hs = -1;
  let hb: { ok?: boolean } | null = null;
  page.on('response', async (r) => {
    if (r.url().includes('/api/admin/health')) {
      hs = r.status();
      try {
        hb = (await r.json()) as { ok?: boolean };
      } catch {
        // ignore malformed JSON
      }
    }
  });
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('BUG5_HEALTH:', hs, JSON.stringify(hb));
  if (hs !== -1) {
    expect(hs).toBe(200);
    expect(hb).not.toBeNull();
    expect(hb!.ok).toBe(false);
  }
});

test('Sweep: tabs without fatal errors', async ({ page }) => {
  const errs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!t.includes('Fast Refresh') && !t.includes('__clerk') && !t.includes('router.events')) errs.push(t);
    }
  });
  await signIn(page);
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  for (const tab of ['Home', 'Plan', 'Book', 'Map', 'More']) {
    const b = page.locator('button').filter({ hasText: tab }).first();
    if (await b.isVisible().catch(() => false)) {
      await b.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `app-sitter/screenshots/r2-tab-${tab.toLowerCase()}.png` });
    }
  }
  console.log('SWEEP_TAB_ERRORS:', JSON.stringify(errs));
  const fatal = errs.filter((e) => !e.includes('Failed to load') && !e.includes('ERR_BLOCKED') && !e.includes('stripe'));
  expect(fatal.length, JSON.stringify(fatal)).toBe(0);
});

test('Sweep: no repeated 4xx/5xx', async ({ page }) => {
  const ne: NetworkErrorCapture[] = [];
  page.on('response', (r) => {
    const s = r.status();
    const u = r.url();
    if (s >= 400 && !u.includes('/_next/') && !u.includes('clerk.accounts.dev') && !u.includes('__clerk') && !u.includes('/api/loyalty')) {
      ne.push({ u: u.replace(/^https?:\/\/[^/]+/, ''), s });
    }
  });
  await signIn(page);
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-network.png', fullPage: true });
  console.log('SWEEP_NETWORK_ERRORS:', JSON.stringify(ne));
  const cnt: Record<string, number> = {};
  for (const e of ne) {
    cnt[e.u] = (cnt[e.u] || 0) + 1;
  }
  const rep = Object.entries(cnt).filter(([, c]) => c > 2);
  expect(rep.length, `repeated: ${JSON.stringify(rep)}`).toBe(0);
  const h403 = ne.filter((e) => e.u.includes('/api/admin/health') && e.s === 403);
  expect(h403.length, 'admin health must not 403').toBe(0);
});

test('Sweep: mobile no overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/travel-assistant', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'app-sitter/screenshots/r2-mobile.png', fullPage: false });
  const w = await page.evaluate(() => document.body.scrollWidth);
  console.log('MOBILE_SCROLL_WIDTH:', w);
  expect(w).toBeLessThanOrEqual(395);
});

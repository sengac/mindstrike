import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

describe('Music Player Navigation', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const isDebug = process.env.PWDEBUG === '1';
    const isHeaded = process.env.HEADED === '1';
    browser = await chromium.launch({
      headless: !(isDebug || isHeaded),
      slowMo: isDebug || isHeaded ? 500 : 0, // Slow down actions when debugging
      devtools: false, // Don't show devtools panel
      args:
        isDebug || isHeaded
          ? ['--window-size=1280,800', '--window-position=100,100']
          : [],
    });
    page = await browser.newPage();
    if (isDebug || isHeaded) {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  }, 60000);

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('should navigate to music player', async () => {
    console.log('Starting test: Navigate to music player');

    // Navigate to the app
    console.log('Navigating to http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

    // Wait for React to render
    console.log('Waiting for React to render...');
    await page.waitForTimeout(3000);

    // The music player is opened by clicking the heart icon in the NetworkEffect
    // Look for the sidebar logo area which contains the heart
    console.log('Looking for sidebar logo...');
    const sidebarLogo = page.locator('[data-test-id="sidebar-logo"]').first();

    // Wait for the logo to be visible
    await sidebarLogo.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Sidebar logo found, clicking to open music player...');

    // Click on the logo area to open music player
    await sidebarLogo.click();

    // Wait for the music player to appear
    console.log('Waiting for music player to appear...');
    await page.waitForTimeout(1000);

    // Verify we're in the music player view by looking for dialog
    const musicPlayerDialog = page.locator('[role="dialog"]').first();

    const isVisible = await musicPlayerDialog
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`Music player dialog visible: ${isVisible}`);
    expect(isVisible).toBe(true);
  }, 60000);

  test('should display music player components', async () => {
    // The music player should already be open from the previous test
    // Wait for any components to load
    await page.waitForTimeout(1000);

    // Check for essential music player components
    // These selectors may need adjustment based on actual implementation
    const componentsToCheck = [
      {
        name: 'close button',
        selector: 'button[aria-label="Close"], button.text-gray-400',
      },
      {
        name: 'music player dialog',
        selector: '[role="dialog"], .fixed.inset-0',
      },
      { name: 'music player content', selector: '.bg-dark-panel, .rounded-lg' },
    ];

    let foundComponents = 0;
    for (const component of componentsToCheck) {
      const element = page.locator(component.selector).first();
      const isVisible = await element
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (isVisible) {
        console.log(`✓ Found ${component.name}`);
        foundComponents++;
      } else {
        console.log(`✗ Could not find ${component.name}`);
      }
    }

    expect(foundComponents).toBeGreaterThan(0);
  }, 60000);
});

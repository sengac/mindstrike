import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

describe('Playlist Playback', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    const isDebug = process.env.PWDEBUG === '1';
    const isHeaded = process.env.HEADED === '1';
    browser = await chromium.launch({
      headless: !(isDebug || isHeaded),
      slowMo: isDebug || isHeaded ? 500 : 0,
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

  test('should play a song from a playlist', async () => {
    console.log('Starting test: Play song from playlist');

    // Navigate to the app
    console.log('Navigating to http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

    // Wait for React to render
    console.log('Waiting for React to render...');
    await page.waitForTimeout(3000);

    // Open music player by clicking the sidebar logo
    console.log('Looking for sidebar logo...');
    const sidebarLogo = page.locator('[data-test-id="sidebar-logo"]').first();
    await sidebarLogo.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Clicking sidebar logo to open music player...');
    await sidebarLogo.click();

    // Wait for music player dialog to appear
    console.log('Waiting for music player dialog...');
    const musicPlayerDialog = page.locator('[role="dialog"]').first();
    await musicPlayerDialog.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for the track list to load
    console.log('Waiting for tracks to load...');
    await page.waitForTimeout(2000);

    // Create a new playlist
    console.log('Creating a new playlist...');
    const createPlaylistButton = page
      .locator('button[title="Create playlist"]')
      .first();
    await createPlaylistButton.click();

    // Enter playlist name
    const playlistNameInput = page
      .locator('input[placeholder="Playlist name..."]')
      .first();
    await playlistNameInput.fill('Test Playlist');

    // Click create button
    const createButton = page.locator('button:has-text("Create")').first();
    await createButton.click();

    // Wait for playlist to be created
    await page.waitForTimeout(1000);

    // Find the first track in "All Tracks" list
    console.log('Looking for first track...');
    const firstTrack = page
      .locator('.font-mono.text-gray-400')
      .filter({ hasText: '01.' })
      .first();
    const isTrackVisible = await firstTrack
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!isTrackVisible) {
      console.log('No tracks found in the library');
      expect(isTrackVisible).toBe(true);
      return;
    }

    // Get the track text for verification later
    const trackText = await firstTrack.textContent();
    console.log(`Found track: ${trackText}`);

    // Drag the first track to the new playlist
    console.log('Dragging track to playlist...');
    const testPlaylistItem = page
      .locator('div[data-playlist-drop-zone]')
      .filter({ hasText: 'Test Playlist' })
      .first();

    // Start drag from the track
    await firstTrack.hover();
    await page.mouse.down();

    // Move to playlist
    await testPlaylistItem.hover();
    await page.mouse.up();

    // Wait for the drag operation to complete
    await page.waitForTimeout(1000);

    // Click on the playlist to view it
    console.log('Clicking on Test Playlist to view it...');
    await testPlaylistItem.click();

    // Wait for playlist tracks to load
    await page.waitForTimeout(1000);

    // Find and click the play button for the playlist
    console.log('Looking for play button in playlist view...');
    const playButton = page.locator('button[title="Play"]').first();
    await playButton.click();

    // Wait for playback to start
    await page.waitForTimeout(2000);

    // Verify the track is playing by checking for the play indicator
    console.log('Checking if track is playing...');
    const playingIndicator = page
      .locator('.text-gray-400:has-text("♪")')
      .last();
    const isPlaying = await playingIndicator
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    console.log(`Track playing: ${isPlaying}`);
    expect(isPlaying).toBe(true);

    // Verify the LCD display shows track info
    const lcdDisplay = page.locator('canvas').first(); // LCD display is rendered on canvas
    const isLcdVisible = await lcdDisplay
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`LCD display visible: ${isLcdVisible}`);
    expect(isLcdVisible).toBe(true);

    // Verify pause button is now visible (indicating playback is active)
    const pauseButton = page.locator('button[title="Pause"]').first();
    const isPauseVisible = await pauseButton
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    console.log(`Pause button visible: ${isPauseVisible}`);
    expect(isPauseVisible).toBe(true);

    // Clean up: Delete the test playlist
    console.log('Cleaning up: Deleting test playlist...');
    const deleteButton = page
      .locator('button[title="Delete playlist"]')
      .first();
    await deleteButton.click();

    await page.waitForTimeout(1000);

    console.log('Test completed successfully!');
  }, 60000);
});

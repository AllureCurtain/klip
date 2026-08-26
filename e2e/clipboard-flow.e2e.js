import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Builder, By, Key, until } from 'selenium-webdriver';

const remoteUrl = process.env.SELENIUM_REMOTE_URL ?? 'http://127.0.0.1:4444';
const appPath = process.env.KLIP_E2E_APP;
const httpPort = process.env.KLIP_HTTP_PORT ?? '27717';

function requireWindowsClipboard() {
  if (process.platform !== 'win32') {
    throw new Error('The clipboard E2E flow currently requires Windows PowerShell clipboard APIs.');
  }
}

function requireLinuxClipboard() {
  if (process.platform !== 'linux') {
    throw new Error('The Linux clipboard E2E helpers require a Linux desktop session.');
  }
}

function runPowerShell(command, env = {}) {
  const result = spawnSync('powershell', ['-NoProfile', '-Sta', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `PowerShell exited with ${result.status}`);
  }

  return result.stdout;
}

/**
 * The Win32 clipboard is a single global resource guarded by `OpenClipboard`. Any process that holds
 * it — Explorer, a password manager, an IME, another test — makes the next `Set-Clipboard` /
 * `Clipboard::SetImage` fail immediately with `ExternalException` instead of blocking. That is
 * transient contention, not a product defect, so retry briefly before giving up.
 *
 * Matching is on `ExternalException` rather than the message text: the message is localized by the
 * OS display language, the exception type name is not. Non-contention failures still fail fast.
 */
function runPowerShellWithClipboardRetry(command, env = {}, attempts = 5) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return runPowerShell(command, env);
    } catch (error) {
      const contended = /ExternalException/.test(String(error && error.message));
      if (!contended || attempt >= attempts) throw error;
      // Busy-wait: this helper is sync, and the point is to let the other holder release.
      const until = Date.now() + attempt * 150;
      while (Date.now() < until) {
        /* spin */
      }
    }
  }
}

function runCommand(command, args, env = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with ${result.status}`);
  }

  return result.stdout;
}

function writeCommand(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} exited with ${result.status}`);
  }
}

function linuxClipboardTool() {
  requireLinuxClipboard();
  const wayland = process.env.XDG_SESSION_TYPE === 'wayland' || process.env.WAYLAND_DISPLAY;
  const candidates = wayland
    ? [
        ['wl-copy', 'wl-paste'],
        ['xclip', 'xclip'],
        ['xsel', 'xsel'],
      ]
    : [
        ['xclip', 'xclip'],
        ['xsel', 'xsel'],
        ['wl-copy', 'wl-paste'],
      ];

  for (const pair of candidates) {
    const writer = spawnSync('sh', ['-c', `command -v ${pair[0]} >/dev/null 2>&1`]);
    const reader = spawnSync('sh', ['-c', `command -v ${pair[1]} >/dev/null 2>&1`]);
    if (writer.status === 0 && reader.status === 0) {
      return pair;
    }
  }

  throw new Error('Linux clipboard E2E requires wl-clipboard, xclip, or xsel.');
}

function setClipboardText(text) {
  if (process.platform === 'win32') {
    requireWindowsClipboard();
    runPowerShellWithClipboardRetry('Set-Clipboard -Value $env:KLIP_E2E_CLIPBOARD_TEXT', {
      KLIP_E2E_CLIPBOARD_TEXT: text,
    });
    return;
  }

  if (process.platform === 'linux') {
    const [writer] = linuxClipboardTool();
    if (writer === 'wl-copy') {
      writeCommand('wl-copy', [], text);
    } else if (writer === 'xclip') {
      writeCommand('xclip', ['-selection', 'clipboard'], text);
    } else {
      writeCommand('xsel', ['--clipboard', '--input'], text);
    }
    return;
  }

  throw new Error(`Unsupported E2E clipboard platform: ${process.platform}`);
}

function getClipboardText() {
  if (process.platform === 'win32') {
    requireWindowsClipboard();
    return runPowerShellWithClipboardRetry('Get-Clipboard -Raw').replace(/\r?\n$/, '');
  }

  if (process.platform === 'linux') {
    const [, reader] = linuxClipboardTool();
    if (reader === 'wl-paste') return runCommand('wl-paste', ['--no-newline']);
    if (reader === 'xclip') return runCommand('xclip', ['-selection', 'clipboard', '-o']);
    return runCommand('xsel', ['--clipboard', '--output']);
  }

  throw new Error(`Unsupported E2E clipboard platform: ${process.platform}`);
}

function sendWindowsQuickPaste(index) {
  requireWindowsClipboard();
  runPowerShell(
    `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^%${index}')`,
  );
}

function setClipboardBitmap() {
  requireWindowsClipboard();
  runPowerShellWithClipboardRetry(`
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $bitmap = [System.Drawing.Bitmap]::new(3, 2, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bitmap.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, 12, 34, 56))
    $bitmap.SetPixel(1, 0, [System.Drawing.Color]::FromArgb(255, 78, 90, 123))
    $bitmap.SetPixel(2, 0, [System.Drawing.Color]::FromArgb(255, 140, 150, 160))
    $bitmap.SetPixel(0, 1, [System.Drawing.Color]::FromArgb(255, 200, 10, 20))
    $bitmap.SetPixel(1, 1, [System.Drawing.Color]::FromArgb(255, 30, 210, 40))
    $bitmap.SetPixel(2, 1, [System.Drawing.Color]::FromArgb(255, 50, 60, 220))
    [System.Windows.Forms.Clipboard]::SetImage($bitmap)
    $bitmap.Dispose()
  `);
}

function getClipboardBitmapSnapshot() {
  requireWindowsClipboard();
  const output = runPowerShellWithClipboardRetry(`
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -eq $image) { throw 'Clipboard does not contain an image' }
    $bitmap = [System.Drawing.Bitmap]::new($image)
    $pixel = $bitmap.GetPixel(1, 1)
    $result = [ordered]@{
      width = $bitmap.Width
      height = $bitmap.Height
      red = $pixel.R
      green = $pixel.G
      blue = $pixel.B
      alpha = $pixel.A
    }
    $bitmap.Dispose()
    $image.Dispose()
    $result | ConvertTo-Json -Compress
  `);
  return JSON.parse(output.trim());
}

async function getStoredImagePixel(driver, itemId, x, y) {
  const result = await driver.executeAsyncScript(`
const [itemId, x, y] = arguments;
const done = arguments[arguments.length - 1];
window.__TAURI_INTERNALS__.invoke('get_image_representation', {
  itemId,
  format: 'canonical',
}).then((bytes) => {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixel = [...context.getImageData(x, y, 1, 1).data];
    URL.revokeObjectURL(url);
    done({ width: image.naturalWidth, height: image.naturalHeight, pixel });
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    done({ error: 'Stored canonical PNG could not be decoded' });
  };
  image.src = url;
}).catch((error) => done({ error: String(error) }));
`, itemId, x, y);
  if (result.error) throw new Error(result.error);
  return result;
}

async function enableQuickPasteShortcut(driver, index) {
  const result = await driver.executeAsyncScript(`
const index = arguments[0];
const done = arguments[arguments.length - 1];
const invoke = window.__TAURI_INTERNALS__.invoke;
invoke('get_shortcut_bindings')
  .then((bindings) => invoke('set_shortcut_bindings', {
    bindings: bindings.map((binding) => binding.actionId === 'quick_paste_' + index
      ? { ...binding, enabled: true }
      : binding),
  }))
  .then(() => done({ ok: true }))
  .catch((error) => done({ error: String(error) }));
`, index);
  if (result.error) {
    throw new Error(`Failed to enable quick-paste shortcut ${index}: ${result.error}`);
  }
}

async function isKlipWindowVisible(driver) {
  const result = await driver.executeAsyncScript(`
const done = arguments[arguments.length - 1];
window.__TAURI_INTERNALS__.invoke('plugin:window|is_visible', { label: 'main' })
  .then((visible) => done({ visible }))
  .catch((error) => done({ error: String(error) }));
`);
  if (result.error) throw new Error(`Failed to query Tauri window visibility: ${result.error}`);
  return result.visible;
}

function explorerWindowMatches(folderPath, selectedPath) {
  requireWindowsClipboard();
  const script = `
$folder = [IO.Path]::GetFullPath($env:KLIP_E2E_EXPLORER_FOLDER)
$selected = $env:KLIP_E2E_EXPLORER_SELECTED
$shell = New-Object -ComObject Shell.Application
foreach ($window in @($shell.Windows())) {
  try {
    $windowFolder = [IO.Path]::GetFullPath($window.Document.Folder.Self.Path)
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals($windowFolder, $folder)) { continue }
    if ([string]::IsNullOrWhiteSpace($selected)) { exit 0 }
    foreach ($item in @($window.Document.SelectedItems())) {
      if ([StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($item.Path), [IO.Path]::GetFullPath($selected))) { exit 0 }
    }
    $focused = $window.Document.FocusedItem
    if ($null -ne $focused -and [StringComparer]::OrdinalIgnoreCase.Equals([IO.Path]::GetFullPath($focused.Path), [IO.Path]::GetFullPath($selected))) { exit 0 }
  } catch {}
}
exit 1
`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KLIP_E2E_EXPLORER_FOLDER: folderPath,
      KLIP_E2E_EXPLORER_SELECTED: selectedPath ?? '',
    },
  });
  return result.status === 0;
}

function closeExplorerWindows(folderPath) {
  requireWindowsClipboard();
  runPowerShell(
    `
$folder = [IO.Path]::GetFullPath($env:KLIP_E2E_EXPLORER_FOLDER)
$shell = New-Object -ComObject Shell.Application
foreach ($window in @($shell.Windows())) {
  try {
    $windowFolder = [IO.Path]::GetFullPath($window.Document.Folder.Self.Path)
    if ([StringComparer]::OrdinalIgnoreCase.Equals($windowFolder, $folder)) { $window.Quit() }
  } catch {}
}
`,
    { KLIP_E2E_EXPLORER_FOLDER: folderPath },
  );
}

async function waitForExplorerWindow(driver, folderPath, selectedPath, label) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (explorerWindowMatches(folderPath, selectedPath)) return;
    await driver.sleep(500);
  }
  throw new Error(`Timed out waiting for Explorer ${label}`);
}

async function findActionButtons(driver, label) {
  const ariaMatches = await driver.findElements(By.css(`button[aria-label="${label}"]`));
  const textMatches = await driver.findElements(
    By.xpath(`//button[normalize-space(.)="${label}"]`),
  );
  return [...ariaMatches, ...textMatches];
}

async function clickActionButton(driver, labels) {
  await driver.wait(
    async () => {
      for (const label of labels) {
        const matches = await findActionButtons(driver, label);
        for (const match of matches) {
          try {
            if (!(await match.isDisplayed())) continue;
            await match.click();
            return true;
          } catch {
            // Retry when an active-search refresh replaces the control before click.
          }
        }
      }
      return false;
    },
    15000,
    `Timed out clicking action: ${labels.join(' / ')}`,
  );
}

async function replaceFieldText(driver, id, value) {
  const applied = await driver.executeScript(
    `
const field = document.getElementById(arguments[0]);
if (!field) throw new Error('Missing field: ' + arguments[0]);
const prototype = field instanceof HTMLTextAreaElement
  ? HTMLTextAreaElement.prototype
  : HTMLInputElement.prototype;
const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
if (!setter) throw new Error('Missing native value setter for: ' + arguments[0]);
setter.call(field, arguments[1]);
field.dispatchEvent(new Event('input', { bubbles: true }));
field.dispatchEvent(new Event('change', { bubbles: true }));
return field.value === arguments[1];
`,
    id,
    value,
  );
  assert.equal(applied, true, `Failed to enter ${id}`);
}

async function findClipboardRowByContent(driver, fullContent) {
  const rows = await driver.findElements(By.css('[data-testid="clipboard-item"]'));
  for (const row of rows) {
    try {
      const titledElements = await row.findElements(By.css('[title]'));
      for (const element of titledElements) {
        if ((await element.getAttribute('title')) === fullContent) return row;
      }
    } catch {
      // Search refreshes may replace a row while its descendants are inspected.
    }
  }
  return null;
}

async function clickItemActionButton(driver, fullContent, labels) {
  await driver.wait(
    async () => {
      const row = await findClipboardRowByContent(driver, fullContent);
      if (!row) return false;

      for (const label of labels) {
        try {
          const matches = await row.findElements(By.css(`button[aria-label="${label}"]`));
          if (matches.length === 0) continue;
          await driver.executeScript('arguments[0].click()', matches[0]);
          return true;
        } catch {
          // Retry when active-search rendering replaces the row during lookup.
        }
      }
      return false;
    },
    15000,
    `Timed out clicking item action: ${labels.join(' / ')}`,
  );
}

async function filterForItem(driver, query, fullContent) {
  const search = await driver.wait(until.elementLocated(By.css('input[type="text"]')), 15000);
  await search.clear();
  await search.sendKeys(query);
  await driver.sleep(500);
  return driver.wait(
    () => findClipboardRowByContent(driver, fullContent),
    15000,
    `Timed out waiting for filtered item: ${fullContent}`,
  );
}

async function waitForText(driver, text, label = 'text') {
  const escaped = text.replace(/"/g, '\\"');
  return driver.wait(
    async () => {
      const matches = await driver.findElements(By.xpath(`//*[contains(text(), "${escaped}")]`));
      return matches[0] ?? false;
    },
    15000,
    `Timed out waiting for ${label}: ${text}`,
  );
}

async function showKlipWindow() {
  const response = await fetch(`http://127.0.0.1:${httpPort}/api/window/show`, {
    method: 'POST',
  });
  assert.equal(response.ok, true, `Klip window show failed with HTTP ${response.status}`);
}

async function listClipboardItems() {
  const response = await fetch(`http://127.0.0.1:${httpPort}/api/clipboard?limit=100`);
  assert.equal(response.ok, true, `Clipboard list failed with HTTP ${response.status}`);
  return response.json();
}

async function waitForClipboardItem(driver, content, label) {
  await driver.wait(
    async () => {
      const items = await listClipboardItems();
      return items.some((item) => item.content === content);
    },
    15000,
    `Timed out waiting for captured ${label}: ${content}`,
  );
}

async function waitForImageClipboardItem(driver, previousIds) {
  return driver.wait(
    async () => {
      const items = await listClipboardItems();
      return (
        items.find(
          (item) =>
            item.content_type === 'image' &&
            !previousIds.has(item.id) &&
            item.media?.width === 3 &&
            item.media?.height === 2,
        ) ?? false
      );
    },
    15000,
    'Timed out waiting for the deterministic DIB clipboard image',
  );
}

describe('clipboard capture, search, and paste flow', function () {
  let driver;
  let originalClipboardText;
  let capturedText;
  let actionFixtureRoot;
  let actionFolder;

  before(async function () {
    if (!appPath) {
      throw new Error('KLIP_E2E_APP must point to the built Tauri binary.');
    }

    try {
      originalClipboardText = getClipboardText();
    } catch {
      originalClipboardText = undefined;
    }

    driver = await new Builder()
      .usingServer(remoteUrl)
      .withCapabilities({
        browserName: 'wry',
        'tauri:options': {
          application: appPath,
        },
      })
      .build();
  });

  after(async function () {
    if (driver) {
      await driver.quit();
    }
    if (originalClipboardText !== undefined) {
      setClipboardText(originalClipboardText);
    }
    if (actionFolder && process.platform === 'win32') {
      try {
        closeExplorerWindows(actionFolder);
      } catch {
        // Best-effort cleanup must not hide the original E2E result.
      }
    }
    if (actionFixtureRoot) {
      rmSync(actionFixtureRoot, { recursive: true, force: true });
    }
  });

  it('captures copied text, filters it through search, and restores it on item click', async function () {
    const uniqueText = `klip-e2e-${Date.now()}`;
    const overwrittenText = `outside-e2e-${Date.now()}`;

    await driver.wait(until.elementLocated(By.css('input[type="text"]')), 15000);

    setClipboardText(uniqueText);
    await waitForText(driver, uniqueText, 'captured clipboard text');

    const search = await driver.findElement(By.css('input[type="text"]'));
    await search.clear();
    await search.sendKeys(uniqueText);
    await driver.sleep(500);
    await waitForText(driver, uniqueText, 'filtered clipboard text');

    setClipboardText(overwrittenText);
    assert.equal(getClipboardText(), overwrittenText);

    await showKlipWindow();
    const apiItems = await listClipboardItems();
    const apiMatch = apiItems.find((item) => item.content === uniqueText);
    assert.ok(apiMatch, 'Clipboard API should retain the original item after external overwrite');
    await driver.navigate().refresh();
    const refreshedSearch = await driver.wait(
      until.elementLocated(By.css('input[type="text"]')),
      15000,
      'Timed out waiting for the search input after showing Klip',
    );
    await refreshedSearch.clear();
    await refreshedSearch.sendKeys(uniqueText);
    await driver.sleep(500);
    const itemText = await waitForText(driver, uniqueText, 'clipboard text after refreshing Klip');
    await itemText.click();

    await driver.wait(
      () => getClipboardText() === uniqueText,
      10000,
      'Timed out waiting for clipboard to be restored by paste_from_clipboard',
    );
    capturedText = uniqueText;
  });

  it('captures a Windows bitmap and writes back the same dimensions and pixels', async function () {
    if (process.platform !== 'win32') this.skip();

    const previousIds = new Set((await listClipboardItems()).map((item) => item.id));
    setClipboardBitmap();
    const item = await waitForImageClipboardItem(driver, previousIds);

    assert.equal(item.content, '', 'Image list IPC must not contain the full image payload');
    assert.ok(
      item.media.sourceFormats.some((format) => format === 'dib' || format === 'dibv5'),
      `Expected a raw Windows bitmap source, got: ${item.media.sourceFormats.join(', ')}`,
    );
    assert.deepEqual(await getStoredImagePixel(driver, item.id, 1, 1), {
      width: 3,
      height: 2,
      pixel: [30, 210, 40, 255],
    });

    const response = await fetch(`http://127.0.0.1:${httpPort}/api/clipboard/${item.id}/copy`, {
      method: 'POST',
    });
    assert.equal(response.ok, true, `Image copy failed with HTTP ${response.status}`);
    const snapshot = getClipboardBitmapSnapshot();
    assert.deepEqual(snapshot, {
      width: 3,
      height: 2,
      red: 30,
      green: 210,
      blue: 40,
      alpha: 255,
    });
  });

  it('quick-pastes the first filtered visible item instead of the newest database item', async function () {
    if (process.platform !== 'win32') this.skip();

    assert.ok(capturedText, 'The capture flow must provide a quick-paste candidate');
    await enableQuickPasteShortcut(driver, 1);
    const sentinelText = `sentinel-${Date.now()}`;

    await showKlipWindow();
    await driver.navigate().refresh();
    const search = await driver.wait(
      until.elementLocated(By.css('input[type="text"]')),
      15000,
      'Timed out waiting for search before quick paste verification',
    );

    await search.clear();
    await search.sendKeys(capturedText);
    await driver.sleep(500);
    await waitForText(driver, capturedText, 'filtered quick-paste item');

    setClipboardText(sentinelText);
    await waitForClipboardItem(driver, sentinelText, 'newest sentinel item');
    await showKlipWindow();
    await filterForItem(driver, capturedText, capturedText);
    await driver.sleep(300);

    sendWindowsQuickPaste(1);

    await driver.wait(
      () => getClipboardText() === capturedText,
      10000,
      'Ctrl+Alt+1 did not use the first filtered visible item',
    );
  });

  it('persists clipboard annotations and finds them through active search', async function () {
    assert.ok(capturedText, 'The capture flow must provide an annotation candidate');
    const title = `E2E title ${Date.now()}`;
    const noteToken = `annotation-note-${Date.now()}`;

    await showKlipWindow();
    await driver.navigate().refresh();
    await filterForItem(driver, capturedText, capturedText);
    await clickItemActionButton(driver, capturedText, ['预览详情', 'Preview details']);
    await clickActionButton(driver, [
      '编辑标题和备注',
      'Edit title and note',
    ]);

    await driver.wait(until.elementLocated(By.id('clipboard-custom-title')), 10000);
    await replaceFieldText(driver, 'clipboard-custom-title', title);
    await replaceFieldText(driver, 'clipboard-note', noteToken);
    await clickActionButton(driver, ['保存', 'Save']);

    await driver.wait(
      async () => {
        const items = await listClipboardItems();
        return items.some(
          (item) =>
            item.content === capturedText &&
            item.custom_title === title &&
            item.note === noteToken,
        );
      },
      15000,
      'Timed out waiting for annotations to persist',
    );

    await clickActionButton(driver, ['关闭', 'Close']);
    const search = await driver.wait(until.elementLocated(By.css('input[type="text"]')), 10000);
    await search.clear();
    await search.sendKeys(noteToken);
    await driver.wait(
      until.elementLocated(By.css(`[data-testid="clipboard-custom-title"][title="${title}"]`)),
      15000,
      'Timed out waiting for the note-only search result',
    );
  });

  it('keeps copy separate and supports search keyboard paste modes', async function () {
    if (process.platform !== 'win32') this.skip();

    const keyboardText = `keyboard-flow-${Date.now()}`;
    setClipboardText(keyboardText);
    await waitForClipboardItem(driver, keyboardText, 'keyboard workflow item');

    await showKlipWindow();
    await driver.navigate().refresh();
    let search = await driver.wait(until.elementLocated(By.css('input[type="text"]')), 15000);
    await search.clear();
    await search.sendKeys(keyboardText);
    await driver.sleep(500);
    await driver.wait(
      () => findClipboardRowByContent(driver, keyboardText),
      15000,
      'Timed out waiting for the keyboard search result',
    );

    await search.sendKeys(Key.ENTER);
    await driver.wait(
      () => getClipboardText() === keyboardText,
      10000,
      'Search Enter did not paste the selected item',
    );
    await driver.wait(
      async () => !(await isKlipWindowVisible(driver)),
      10000,
      'Search Enter did not hide the Klip window',
    );

    await showKlipWindow();
    await driver.navigate().refresh();
    await filterForItem(driver, keyboardText, keyboardText);
    await clickItemActionButton(driver, keyboardText, ['复制', 'Copy']);
    await driver.wait(
      () => isKlipWindowVisible(driver),
      10000,
      'Copy unexpectedly hid the Klip window',
    );
    assert.equal(getClipboardText(), keyboardText);

    await clickItemActionButton(driver, keyboardText, ['预览详情', 'Preview details']);
    const dialog = await driver.wait(
      until.elementLocated(By.css('[data-slot="dialog-content"]')),
      10000,
    );
    assert.match(await dialog.getText(), new RegExp(keyboardText));
    await clickActionButton(driver, ['关闭', 'Close']);

    search = await driver.wait(until.elementLocated(By.css('input[type="text"]')), 10000);
    await search.sendKeys(Key.chord(Key.CONTROL, Key.ENTER));
    await driver.wait(
      () => getClipboardText() === keyboardText,
      10000,
      'Search Ctrl+Enter did not plain-paste the selected text item',
    );
    await driver.wait(
      async () => !(await isKlipWindowVisible(driver)),
      10000,
      'Search Ctrl+Enter did not hide the Klip window',
    );
  });

  it('opens and reveals validated Windows paths with spaces and non-ASCII text', async function () {
    if (process.platform !== 'win32') this.skip();

    actionFixtureRoot = mkdtempSync(join(tmpdir(), 'klip-actions-'));
    actionFolder = join(actionFixtureRoot, 'folder with spaces 资料');
    const filePath = join(actionFolder, '验收 report.txt');
    mkdirSync(actionFolder, { recursive: true });
    writeFileSync(filePath, 'klip content action acceptance', 'utf8');

    setClipboardText(actionFolder);
    await waitForClipboardItem(driver, actionFolder, 'action folder path');
    await showKlipWindow();
    await driver.navigate().refresh();
    await filterForItem(driver, 'folder with spaces', actionFolder);
    await clickItemActionButton(driver, actionFolder, ['打开', 'Open']);
    await waitForExplorerWindow(driver, actionFolder, undefined, 'to open the folder');
    closeExplorerWindows(actionFolder);

    setClipboardText(filePath);
    await waitForClipboardItem(driver, filePath, 'action file path');
    await showKlipWindow();
    await driver.navigate().refresh();
    await filterForItem(driver, '验收 report.txt', filePath);
    await clickItemActionButton(driver, filePath, ['预览详情', 'Preview details']);
    await clickActionButton(driver, [
      '在文件夹中显示',
      'Show in folder',
    ]);
    await waitForExplorerWindow(driver, actionFolder, filePath, 'to select the file');
    closeExplorerWindows(actionFolder);
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Builder, By, until } from 'selenium-webdriver';

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
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `PowerShell exited with ${result.status}`);
  }

  return result.stdout;
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
    runPowerShell('Set-Clipboard -Value $env:KLIP_E2E_CLIPBOARD_TEXT', {
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
    return runPowerShell('Get-Clipboard -Raw').replace(/\r?\n$/, '');
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

async function waitForActionButton(driver, labels) {
  return driver.wait(
    async () => {
      for (const label of labels) {
        const matches = await driver.findElements(By.css(`button[aria-label="${label}"]`));
        for (const match of matches) {
          try {
            if (await match.isDisplayed()) return match;
          } catch {
            // Async action refresh can replace the node between lookup and visibility check.
          }
        }
      }
      return false;
    },
    15000,
    `Timed out waiting for action: ${labels.join(' / ')}`,
  );
}

async function filterForItem(driver, query, fullContent) {
  const search = await driver.wait(until.elementLocated(By.css('input[type="text"]')), 15000);
  await search.clear();
  await search.sendKeys(query);
  const content = fullContent.replace(/"/g, '\\"');
  const marker = await driver.wait(
    until.elementLocated(
      By.xpath(`//*[@data-testid="clipboard-item"]//*[@title="${content}"]`),
    ),
    15000,
    `Timed out waiting for filtered item: ${fullContent}`,
  );
  return marker.findElement(By.xpath('ancestor::*[@data-testid="clipboard-item"]'));
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
    await search.sendKeys(uniqueText.slice(-6));
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
    await refreshedSearch.sendKeys(uniqueText.slice(-6));
    const itemText = await waitForText(driver, uniqueText, 'clipboard text after refreshing Klip');
    await itemText.click();

    await driver.wait(
      () => getClipboardText() === uniqueText,
      10000,
      'Timed out waiting for clipboard to be restored by paste_from_clipboard',
    );
    capturedText = uniqueText;
  });

  it('quick-pastes the first filtered visible item instead of the newest database item', async function () {
    if (process.platform !== 'win32') this.skip();

    assert.ok(capturedText, 'The capture flow must provide a quick-paste candidate');
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
    await waitForText(driver, capturedText, 'filtered quick-paste item');

    setClipboardText(sentinelText);
    await waitForClipboardItem(driver, sentinelText, 'newest sentinel item');
    await showKlipWindow();
    await driver.sleep(300);

    sendWindowsQuickPaste(1);

    await driver.wait(
      () => getClipboardText() === capturedText,
      10000,
      'Ctrl+Alt+1 did not use the first filtered visible item',
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
    let row = await filterForItem(driver, 'folder with spaces', actionFolder);
    await driver.actions().move({ origin: row }).perform();
    const openButton = await waitForActionButton(driver, ['打开', 'Open']);
    await openButton.click();
    await waitForExplorerWindow(driver, actionFolder, undefined, 'to open the folder');
    closeExplorerWindows(actionFolder);

    setClipboardText(filePath);
    await waitForClipboardItem(driver, filePath, 'action file path');
    await showKlipWindow();
    await driver.navigate().refresh();
    row = await filterForItem(driver, '验收 report.txt', filePath);
    await driver.actions().move({ origin: row }).perform();
    const previewButton = await waitForActionButton(driver, ['预览详情', 'Preview details']);
    await previewButton.click();
    const revealButton = await waitForActionButton(driver, [
      '在文件夹中显示',
      'Show in folder',
    ]);
    await revealButton.click();
    await waitForExplorerWindow(driver, actionFolder, filePath, 'to select the file');
    closeExplorerWindows(actionFolder);
  });
});

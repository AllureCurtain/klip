import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Builder, By, until } from 'selenium-webdriver';

const remoteUrl = process.env.SELENIUM_REMOTE_URL ?? 'http://127.0.0.1:4444';
const appPath = process.env.KLIP_E2E_APP;

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

async function waitForText(driver, text) {
  const escaped = text.replace(/"/g, '\\"');
  await driver.wait(
    async () => {
      const matches = await driver.findElements(By.xpath(`//*[contains(text(), "${escaped}")]`));
      return matches.length > 0;
    },
    15000,
    `Timed out waiting for text: ${text}`,
  );
}

describe('clipboard capture, search, and paste flow', function () {
  let driver;
  let originalClipboardText;

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
  });

  it('captures copied text, filters it through search, and restores it on item click', async function () {
    const uniqueText = `klip-e2e-${Date.now()}`;
    const overwrittenText = `outside-e2e-${Date.now()}`;

    await driver.wait(until.elementLocated(By.css('input[type="text"]')), 15000);

    setClipboardText(uniqueText);
    await waitForText(driver, uniqueText);

    const search = await driver.findElement(By.css('input[type="text"]'));
    await search.clear();
    await search.sendKeys(uniqueText.slice(-6));
    await waitForText(driver, uniqueText);

    setClipboardText(overwrittenText);
    assert.equal(getClipboardText(), overwrittenText);

    const itemText = await driver.findElement(By.xpath(`//*[contains(text(), "${uniqueText}")]`));
    await itemText.click();

    await driver.wait(
      () => getClipboardText() === uniqueText,
      10000,
      'Timed out waiting for clipboard to be restored by paste_from_clipboard',
    );
  });
});

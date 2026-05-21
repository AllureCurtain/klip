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

function setClipboardText(text) {
  requireWindowsClipboard();
  runPowerShell('Set-Clipboard -Value $env:KLIP_E2E_CLIPBOARD_TEXT', {
    KLIP_E2E_CLIPBOARD_TEXT: text,
  });
}

function getClipboardText() {
  requireWindowsClipboard();
  return runPowerShell('Get-Clipboard -Raw').replace(/\r?\n$/, '');
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

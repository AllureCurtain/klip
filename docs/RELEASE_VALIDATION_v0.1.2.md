# Klip v0.1.2 Release Validation

> Last updated: 2026-05-23 10:17 Asia/Shanghai
> Scope: Windows-first post-release validation

## Repository State Checked Before This Batch

- Local branch: `main`
- Local HEAD: `c7f595ed0f7351bf05797b80e010af9bcdf1e452`
- Remote HEAD: `origin/main` at `c7f595ed0f7351bf05797b80e010af9bcdf1e452`
- Open GitHub PRs: none
- Latest GitHub CI on `main`: success
- CI run: <https://github.com/AllureCurtain/klip/actions/runs/26320203494>

## Public Release

- Release: `Klip v0.1.2`
- Tag: `v0.1.2`
- Published: `2026-05-22T09:58:24Z`
- Draft: false
- Prerelease: false
- Target commitish: `34c751a9e3271c02e142d56e78845152a6606b2c`
- URL: <https://github.com/AllureCurtain/klip/releases/tag/v0.1.2>

GitHub release assets:

| Asset | Size | SHA256 |
| --- | ---: | --- |
| `Klip_0.1.2_x64-setup.exe` | 2,846,549 bytes | `6f9a48f5d904f057025765b22ab01294eb61dfe60d3d357e4703137d47e2e214` |
| `Klip_0.1.2_x64_en-US.msi` | 3,821,568 bytes | `68f46e16d9845731acf4d9b0d7eefa5eb3456b98f263ffff19fa72965afa1a06` |

## Local Installer Preflight

Command:

```powershell
pnpm release:smoke
```

Result: passed.

Local artifacts found:

| Artifact | Size | SHA256 |
| --- | ---: | --- |
| `src-tauri/target/release/bundle/msi/Klip_0.1.2_x64_en-US.msi` | 3,825,664 bytes | `03F485ACC2652305CAC33A135858632D7F76307B01E318FE171C924597AB23D2` |
| `src-tauri/target/release/bundle/nsis/Klip_0.1.2_x64-setup.exe` | 2,848,363 bytes | `15D81F2963CDBA101207AC7A0A7E5CFBBFF9C4A5FB0EAB072D37D27D3F5B5854` |

Machine state observed by the preflight script:

- Running `klip.exe` processes: 0
- Installed Klip registry entries: 0

Additional environment assessment on 2026-05-23 08:28 Asia/Shanghai:

- Windows desktop session: interactive console.
- Running `klip.exe` processes: 0.
- Installed Klip registry entries: 0.
- `smoke-installers.ps1 -PlanInstall -PlanUninstall -OutputJson` only produced
  install/uninstall plans with `executes: false`.
- No installer or uninstaller was executed.

## Installed-Build Validation Status

No NSIS or MSI installer was executed in this environment during this validation pass.
The current machine is not recorded as an installed-build test environment for
`v0.1.2`.

The manual Windows installed-build checks in `docs/RELEASE_CHECKLIST.md` are still
required, especially:

- NSIS fresh install smoke test.
- Tray-first startup behavior.
- Tray open and `Ctrl+Alt+K` open.
- `Ctrl+Alt+1` through `Ctrl+Alt+9` quick paste.
- Text, image, single-file, and multi-file clipboard capture.
- Paste into Notepad or another target app.
- Import/export, backup/restore, sensitive-content masking and skip policy.
- Autostart enable, sign out/in or reboot, disable, and OS entry cleanup.
- Uninstall and startup-entry cleanup.

## Non-Invasive Hardening Continued

Because installed-build validation was not run here, the next work item continued
the existing accessibility hardening path:

- Header selected-item tag assignment buttons now expose the localized accessible
  action name, such as `分配 Work`.
- Added a regression test for the selected-item tag assignment accessible label.
- Settings navigation now exposes `tablist`, `tab`, and `tabpanel` semantics.
- Added a regression test for Settings tab semantics.
- Dialog close actions now use the active interface language.
- Added regression tests for localized dialog close actions in the image preview
  and clear-history dialogs.
- Header favorites, content-type, and tag filters now expose `aria-pressed`
  for their current selected state.
- Added a regression test for Header filter pressed states.
- Header search now exposes an explicit accessible label.
- Added a regression test for Header search input labeling.

Verification for the localized dialog close action batch:

- `pnpm test -- --run src/components/clipboard/ImagePreview.test.tsx src/components/layout/Header.test.tsx`: passed.
- `pnpm release:smoke`: passed; no installer or uninstaller was executed.
- `pnpm verify`: passed.
- `pnpm e2e`: passed.

Verification for the Header search input labeling batch:

- `pnpm test -- --run src/components/layout/Header.test.tsx`: passed.
- `pnpm release:smoke`: passed; no installer or uninstaller was executed.
- `pnpm verify`: passed.
- `pnpm e2e`: passed.

Verification for the Header filter pressed-state batch:

- `pnpm test -- --run src/components/layout/Header.test.tsx`: passed.
- `pnpm release:smoke`: passed; no installer or uninstaller was executed.
- `pnpm verify`: passed.
- `pnpm e2e`: passed.

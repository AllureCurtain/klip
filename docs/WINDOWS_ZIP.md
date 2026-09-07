# Klip for Windows

Extract the entire ZIP to a permanent folder and run `klip.exe`.
Keep the DLL files and `resources` folder beside the executable.

Microsoft Edge WebView2 Runtime is required. Windows 11 normally includes it;
on other systems install the Evergreen x64 runtime from:
https://developer.microsoft.com/microsoft-edge/webview2/

The Visual C++ runtime and offline OCR models are included. Visual C++ DLLs
come from the Microsoft Visual Studio x64 redistributable runtime directory.
ONNX Runtime and OCR attribution is included beside those resources.

Klip starts in the notification area. Press `Ctrl+Alt+K` or open its tray menu.
Settings > Shortcuts allows changing the window shortcut and all nine quick-paste
slots. Quick-paste slots are disabled by default on new installations. Save changes
to apply them immediately.

History and settings are stored in `%APPDATA%\com.klip.app`, not inside this folder.
This ZIP avoids an installer but does not move application data onto a USB drive.
Keep the folder in place when enabling launch at startup.

The application is unsigned. Windows may show an unknown publisher or SmartScreen
prompt. SHA-256 checksums are supplied with the GitHub release.

# Bundled ONNX Runtime

Klip uses the official CPU-only ONNX Runtime 1.24.2 distribution. Windows
loads the runtime dynamically from the application resources so the build does
not depend on the MSVC ABI used by the upstream static archive.

| Asset | Bytes | SHA-256 |
|------|------:|---------|
| `onnxruntime-win-x64-1.24.2.zip` | 74,075,355 | `8e3e9c826375352e29cb2614fe44f3d7a4b0ff7b8028ad7a456af9d949a7e8b0` |
| `windows-x86_64/onnxruntime.dll` | 14,148,680 | `114947d633e6844ce3c4b51ef6678f776628571d08a5763859c61642c8dcca9c` |

Source: <https://github.com/microsoft/onnxruntime/releases/download/v1.24.2/onnxruntime-win-x64-1.24.2.zip>

ONNX Runtime is distributed under the MIT License. The upstream `LICENSE` and
`ThirdPartyNotices.txt` files are bundled beside the DLL.

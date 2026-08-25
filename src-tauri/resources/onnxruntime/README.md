# Bundled ONNX Runtime

Klip uses the official CPU-only ONNX Runtime 1.24.2 distribution. Windows and
Linux both load the runtime dynamically from the application resources so the
build does not depend on the ABI used by the upstream static archive.

| Asset | Bytes | SHA-256 |
|------|------:|---------|
| `onnxruntime-win-x64-1.24.2.zip` | 74,075,355 | `8e3e9c826375352e29cb2614fe44f3d7a4b0ff7b8028ad7a456af9d949a7e8b0` |
| `windows-x86_64/onnxruntime.dll` | 14,148,680 | `114947d633e6844ce3c4b51ef6678f776628571d08a5763859c61642c8dcca9c` |
| `linux-x86_64/libonnxruntime.so` | 22,065,056 | `ffc84d48e845cf0b562ba4ea5ca32aaafc0d4069019fef4f63095b307d0270ad` |

Source: <https://github.com/microsoft/onnxruntime/releases/download/v1.24.2/onnxruntime-win-x64-1.24.2.zip>

The Linux shared library is taken from the same upstream 1.24.2 release assets
(`onnxruntime-linux-x64-1.24.2.tgz`) and is verified by SHA-256 at load time in
`src/ocr/mod.rs`. macOS has no bundled runtime yet; OCR degrades gracefully
there without affecting other features.

ONNX Runtime is distributed under the MIT License. The upstream `LICENSE` and
`ThirdPartyNotices.txt` files are bundled beside the DLL (Windows) and inside
`linux-x86_64/` (Linux).

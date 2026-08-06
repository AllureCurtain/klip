# Bundled OCR Resources

Klip bundles the PP-OCRv5 mobile detection and recognition models so image OCR
runs locally and never needs to download a model at runtime.

| File | Bytes | SHA-256 |
|------|------:|---------|
| `pp-ocrv5_mobile_det.onnx` | 4,826,518 | `1eb7b4f7ab657ebd1c66d5f79bca7497f29768a2e3c15e52daecbba1a8e4a039` |
| `pp-ocrv5_mobile_rec.onnx` | 16,562,373 | `243a0f06d826761323e9045e9b113ab2c191c3aa50565585e628300b8eda0224` |
| `ppocrv5_dict.txt` | 74,012 | `d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b` |

Source release: <https://github.com/GreatV/oar-ocr/releases/tag/v0.3.0>

- Detection model: <https://github.com/GreatV/oar-ocr/releases/download/v0.3.0/pp-ocrv5_mobile_det.onnx>
- Recognition model: <https://github.com/GreatV/oar-ocr/releases/download/v0.3.0/pp-ocrv5_mobile_rec.onnx>
- Dictionary: <https://github.com/GreatV/oar-ocr/releases/download/v0.3.0/ppocrv5_dict.txt>

The model assets are derived from PaddleOCR and are distributed under the
Apache License 2.0. The OCR runtime used by Klip is `oar-ocr 0.6.2`, also under
Apache-2.0.

- oar-ocr license: <https://github.com/GreatV/oar-ocr/blob/v0.6.2/LICENSE>
- PaddleOCR license: <https://github.com/PaddlePaddle/PaddleOCR/blob/release/3.0/LICENSE>

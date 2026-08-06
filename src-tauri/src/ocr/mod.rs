use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::mpsc;

use base64::Engine;
use oar_ocr::oarocr::{OAROCRBuilder, OAROCR};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

use crate::database::{ContentType, Database, OcrStatus};
use crate::AppError;

pub const MODEL_CACHE_DIRECTORY_NAME: &str = "ocr-models";
pub const ITEM_UPDATED_EVENT: &str = "clipboard-item-updated";

const RESOURCE_SUBDIRECTORY: &str = "resources/ocr";
const MAX_OCR_TEXT_CHARS: usize = 100_000;

#[cfg(target_os = "windows")]
const ONNX_RUNTIME_RESOURCE_PATH: &str = "resources/onnxruntime/windows-x86_64/onnxruntime.dll";
#[cfg(target_os = "windows")]
const ONNX_RUNTIME_SHA256: &str =
    "114947d633e6844ce3c4b51ef6678f776628571d08a5763859c61642c8dcca9c";

const MODEL_SPECS: &[ModelSpec] = &[
    ModelSpec {
        name: "pp-ocrv5_mobile_det.onnx",
        sha256: "1eb7b4f7ab657ebd1c66d5f79bca7497f29768a2e3c15e52daecbba1a8e4a039",
    },
    ModelSpec {
        name: "pp-ocrv5_mobile_rec.onnx",
        sha256: "243a0f06d826761323e9045e9b113ab2c191c3aa50565585e628300b8eda0224",
    },
    ModelSpec {
        name: "ppocrv5_dict.txt",
        sha256: "d1979e9f794c464c0d2e0b70a7fe14dd978e9dc644c0e71f14158cdf8342af1b",
    },
];

#[derive(Debug, Clone, Copy)]
struct ModelSpec {
    name: &'static str,
    sha256: &'static str,
}

#[derive(Debug, thiserror::Error)]
pub enum OcrError {
    #[error("OCR resource error: {0}")]
    Resource(String),

    #[error("OCR image error: {0}")]
    Image(String),

    #[error("OCR inference error: {0}")]
    Inference(String),

    #[error("OCR worker is unavailable")]
    WorkerUnavailable,
}

pub struct OcrService {
    sender: mpsc::Sender<i64>,
}

impl OcrService {
    fn start(app_handle: tauri::AppHandle) -> Result<Self, AppError> {
        let resource_root = app_handle.path().resource_dir().map_err(|error| {
            AppError::System(format!("failed to resolve resource directory: {error}"))
        })?;
        let resource_dir = resource_root.join(RESOURCE_SUBDIRECTORY);
        let runtime_path = runtime_resource_path(&resource_root);
        let cache_dir =
            crate::database::app_data_dir(&app_handle)?.join(MODEL_CACHE_DIRECTORY_NAME);
        let pending_ids = {
            let db = app_handle.state::<Database>();
            crate::database::ocr::pending_item_ids(&db)?
        };

        let (sender, receiver) = mpsc::channel();
        let worker_app = app_handle.clone();
        std::thread::Builder::new()
            .name("klip-ocr-worker".into())
            .spawn(move || run_worker(worker_app, receiver, resource_dir, cache_dir, runtime_path))
            .map_err(|error| AppError::System(format!("failed to start OCR worker: {error}")))?;

        for item_id in pending_ids {
            sender.send(item_id).map_err(|_| {
                AppError::System("OCR worker stopped during pending-item recovery".into())
            })?;
        }
        Ok(Self { sender })
    }

    pub fn enqueue(&self, item_id: i64) -> Result<(), OcrError> {
        self.sender
            .send(item_id)
            .map_err(|_| OcrError::WorkerUnavailable)
    }
}

pub fn init(app_handle: tauri::AppHandle) -> Result<(), AppError> {
    let service = OcrService::start(app_handle.clone())?;
    app_handle.manage(service);
    Ok(())
}

fn run_worker(
    app_handle: tauri::AppHandle,
    receiver: mpsc::Receiver<i64>,
    resource_dir: PathBuf,
    cache_dir: PathBuf,
    runtime_path: Option<PathBuf>,
) {
    let mut worker = OcrWorker::new(resource_dir, cache_dir, runtime_path);
    while let Ok(item_id) = receiver.recv() {
        if let Err(error) = process_item(&app_handle, &mut worker, item_id) {
            tracing::error!("OCR job for item {item_id} could not be finalized: {error}");
        }
    }
    tracing::info!("OCR worker stopped");
}

fn process_item(
    app_handle: &tauri::AppHandle,
    worker: &mut OcrWorker,
    item_id: i64,
) -> Result<(), AppError> {
    let db = app_handle.state::<Database>();
    let Some(item) = crate::database::clipboard::get_by_id(&db, item_id)? else {
        return Ok(());
    };
    if item.content_type != ContentType::Image
        || item.ocr.as_ref().map(|ocr| ocr.status) != Some(OcrStatus::Pending)
    {
        return Ok(());
    }

    match worker.recognize_data_url(&item.content) {
        Ok(text) => {
            if crate::database::ocr::complete(&db, item_id, &text)? {
                emit_updated_item(app_handle, &db, item_id, true)?;
            }
        }
        Err(error) => {
            let message = truncate_error(&error.to_string());
            tracing::warn!("OCR failed for clipboard item {item_id}: {message}");
            if crate::database::ocr::fail(&db, item_id, &message)? {
                emit_updated_item(app_handle, &db, item_id, false)?;
            }
        }
    }
    Ok(())
}

fn emit_updated_item(
    app_handle: &tauri::AppHandle,
    db: &Database,
    item_id: i64,
    synchronize_search: bool,
) -> Result<(), AppError> {
    let Some(item) = crate::database::clipboard::get_by_id(db, item_id)? else {
        return Ok(());
    };
    if synchronize_search {
        if let Err(error) = crate::search::index_clipboard_item(db, &item) {
            tracing::warn!("Failed to add OCR text for item {item_id} to search: {error}");
        }
    }
    if let Err(error) = app_handle.emit(ITEM_UPDATED_EVENT, &item) {
        tracing::warn!("Failed to emit {ITEM_UPDATED_EVENT} for item {item_id}: {error}");
    }
    Ok(())
}

struct OcrWorker {
    resource_dir: PathBuf,
    cache_dir: PathBuf,
    runtime_path: Option<PathBuf>,
    engine: Option<OAROCR>,
}

impl OcrWorker {
    fn new(resource_dir: PathBuf, cache_dir: PathBuf, runtime_path: Option<PathBuf>) -> Self {
        Self {
            resource_dir,
            cache_dir,
            runtime_path,
            engine: None,
        }
    }

    fn recognize_data_url(&mut self, content: &str) -> Result<String, OcrError> {
        let encoded = content
            .strip_prefix("data:image/png;base64,")
            .ok_or_else(|| OcrError::Image("expected a PNG data URL".into()))?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| OcrError::Image(format!("invalid base64 image: {error}")))?;
        let image = image::load_from_memory(&bytes)
            .map_err(|error| OcrError::Image(format!("invalid encoded image: {error}")))?
            .to_rgb8();
        let results = self
            .engine()?
            .predict(vec![image])
            .map_err(|error| OcrError::Inference(error.to_string()))?;
        let text = results
            .first()
            .map(|result| result.concatenated_text("\n"))
            .unwrap_or_default();
        Ok(text.trim().chars().take(MAX_OCR_TEXT_CHARS).collect())
    }

    fn engine(&mut self) -> Result<&OAROCR, OcrError> {
        if self.engine.is_none() {
            let models = prepare_models(&self.resource_dir, &self.cache_dir)?;
            initialize_runtime(self.runtime_path.as_deref())?;
            let engine =
                OAROCRBuilder::new(&models.detection, &models.recognition, &models.dictionary)
                    .image_batch_size(1)
                    .region_batch_size(16)
                    .build()
                    .map_err(|error| {
                        OcrError::Inference(format!("model initialization failed: {error}"))
                    })?;
            self.engine = Some(engine);
            tracing::info!("OCR models initialized from {}", self.cache_dir.display());
        }
        self.engine
            .as_ref()
            .ok_or_else(|| OcrError::Inference("OCR engine was not initialized".into()))
    }
}

fn initialize_runtime(runtime_path: Option<&Path>) -> Result<(), OcrError> {
    #[cfg(target_os = "windows")]
    {
        let path = runtime_path.ok_or_else(|| {
            OcrError::Resource("bundled ONNX Runtime path was not configured".into())
        })?;
        if !path.is_file() {
            return Err(OcrError::Resource(format!(
                "bundled ONNX Runtime is missing: {}",
                path.display()
            )));
        }
        let hash = sha256_file(path)?;
        if hash != ONNX_RUNTIME_SHA256 {
            return Err(OcrError::Resource(format!(
                "bundled ONNX Runtime checksum mismatch for {}: got {hash}, expected {ONNX_RUNTIME_SHA256}",
                path.display()
            )));
        }
        ort::init_from(path)
            .map_err(|error| OcrError::Inference(format!("failed to load ONNX Runtime: {error}")))?
            .with_name("klip-ocr")
            .with_telemetry(false)
            .commit();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = runtime_path;
    Ok(())
}

fn runtime_resource_path(resource_root: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    return Some(resource_root.join(ONNX_RUNTIME_RESOURCE_PATH));
    #[cfg(not(target_os = "windows"))]
    {
        let _ = resource_root;
        None
    }
}

struct ModelPaths {
    detection: PathBuf,
    recognition: PathBuf,
    dictionary: PathBuf,
}

fn prepare_models(resource_dir: &Path, cache_dir: &Path) -> Result<ModelPaths, OcrError> {
    fs::create_dir_all(cache_dir).map_err(|error| {
        OcrError::Resource(format!(
            "failed to create model cache at {}: {error}",
            cache_dir.display()
        ))
    })?;
    for spec in MODEL_SPECS {
        ensure_model(resource_dir, cache_dir, *spec)?;
    }
    Ok(ModelPaths {
        detection: cache_dir.join(MODEL_SPECS[0].name),
        recognition: cache_dir.join(MODEL_SPECS[1].name),
        dictionary: cache_dir.join(MODEL_SPECS[2].name),
    })
}

fn ensure_model(resource_dir: &Path, cache_dir: &Path, spec: ModelSpec) -> Result<(), OcrError> {
    let destination = cache_dir.join(spec.name);
    if destination.is_file() && sha256_file(&destination)? == spec.sha256 {
        return Ok(());
    }

    let source = resource_dir.join(spec.name);
    if !source.is_file() {
        return Err(OcrError::Resource(format!(
            "bundled model is missing: {}",
            source.display()
        )));
    }
    let source_hash = sha256_file(&source)?;
    if source_hash != spec.sha256 {
        return Err(OcrError::Resource(format!(
            "bundled model checksum mismatch for {}: got {source_hash}, expected {}",
            source.display(),
            spec.sha256
        )));
    }

    let temporary = cache_dir.join(format!("{}.tmp-{}", spec.name, std::process::id()));
    fs::copy(&source, &temporary).map_err(|error| {
        OcrError::Resource(format!(
            "failed to copy {} to model cache: {error}",
            source.display()
        ))
    })?;
    let copied_hash = sha256_file(&temporary)?;
    if copied_hash != spec.sha256 {
        let _ = fs::remove_file(&temporary);
        return Err(OcrError::Resource(format!(
            "copied model checksum mismatch for {}",
            temporary.display()
        )));
    }
    if destination.exists() {
        fs::remove_file(&destination).map_err(|error| {
            OcrError::Resource(format!(
                "failed to replace invalid model {}: {error}",
                destination.display()
            ))
        })?;
    }
    fs::rename(&temporary, &destination).map_err(|error| {
        OcrError::Resource(format!(
            "failed to finalize cached model {}: {error}",
            destination.display()
        ))
    })?;
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, OcrError> {
    let mut file = fs::File::open(path).map_err(|error| {
        OcrError::Resource(format!("failed to open {}: {error}", path.display()))
    })?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| {
            OcrError::Resource(format!("failed to read {}: {error}", path.display()))
        })?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn truncate_error(error: &str) -> String {
    error.chars().take(500).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "klip-ocr-{name}-{}-{}",
            std::process::id(),
            crate::now_millis()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn model_copy_is_verified_and_repairs_invalid_cache() {
        let root = temp_dir("model-cache");
        let resources = root.join("resources");
        let cache = root.join("cache");
        fs::create_dir_all(&resources).unwrap();
        fs::create_dir_all(&cache).unwrap();
        fs::write(resources.join("fixture.bin"), b"trusted-model").unwrap();
        fs::write(cache.join("fixture.bin"), b"corrupt-model").unwrap();
        let spec = ModelSpec {
            name: "fixture.bin",
            sha256: "a838b2faead8e6ae8f27cca6629fb1c660bfdedb6763a5c4e5f268f80e557496",
        };

        ensure_model(&resources, &cache, spec).unwrap();

        assert_eq!(
            fs::read(cache.join("fixture.bin")).unwrap(),
            b"trusted-model"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_data_url_returns_an_error_without_panicking() {
        let mut worker = OcrWorker::new(PathBuf::new(), PathBuf::new(), None);
        let error = worker.recognize_data_url("not-an-image").unwrap_err();
        assert!(matches!(error, OcrError::Image(_)));
    }

    #[test]
    fn bundled_models_recognize_chinese_fixture() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let fixture = fs::read(
            manifest_dir
                .join("tests")
                .join("fixtures")
                .join("ocr")
                .join("chinese-text.png"),
        )
        .unwrap();
        let data_url = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(fixture)
        );
        let test_root = temp_dir("chinese-inference");
        let mut worker = OcrWorker::new(
            manifest_dir.join(RESOURCE_SUBDIRECTORY),
            test_root.join("cache"),
            runtime_resource_path(&manifest_dir),
        );

        let text = worker.recognize_data_url(&data_url).unwrap();
        let normalized: String = text.split_whitespace().collect();

        assert!(
            normalized.contains("剪贴板搜索测试"),
            "unexpected OCR output: {text:?}"
        );
        assert!(
            normalized.contains("KlipOCR2026"),
            "unexpected OCR output: {text:?}"
        );
        fs::remove_dir_all(test_root).unwrap();
    }
}

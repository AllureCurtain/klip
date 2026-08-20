use crate::database::{ClipboardItem, ContentType, Database, OcrStatus};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock, Weak};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tantivy::collector::TopDocs;
use tantivy::indexer::LogMergePolicy;
use tantivy::query::{AllQuery, BooleanQuery, Occur, Query, TermQuery};
use tantivy::schema::{
    BytesOptions, Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, INDEXED,
    STORED,
};
use tantivy::tokenizer::{LowerCaser, TextAnalyzer, TokenStream};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term};
use tantivy_jieba::JiebaTokenizer;

pub const INDEX_DIRECTORY_NAME: &str = "search-index";

const TOKENIZER_NAME: &str = "jieba";
const INDEX_WRITER_MEMORY_BYTES: usize = 50_000_000;
const COMMIT_BATCH_SIZE: usize = 50;
const COMMIT_INTERVAL: Duration = Duration::from_secs(5);

static SHARED_INDEXES: OnceLock<Mutex<HashMap<PathBuf, Weak<SearchIndex>>>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("search index unavailable: {0}")]
    Unavailable(String),

    #[error("search index I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("search index error: {0}")]
    Tantivy(#[from] tantivy::TantivyError),

    #[error("search query error: {0}")]
    Query(String),
}

pub struct SearchIndex {
    core: Arc<SearchCore>,
    shutdown_tx: Mutex<Option<mpsc::Sender<()>>>,
    worker: Mutex<Option<JoinHandle<()>>>,
}

struct SearchCore {
    index: Index,
    reader: IndexReader,
    id_field: Field,
    text_field: Field,
    fingerprint_field: Field,
    writer: Mutex<WriterState>,
    healthy: AtomicBool,
}

struct WriterState {
    writer: IndexWriter,
    pending_operations: usize,
    last_commit: Instant,
}

pub(crate) fn open_shared(
    index_dir: &Path,
    db: &Database,
) -> Result<Arc<SearchIndex>, SearchError> {
    let canonical_key = absolute_index_key(index_dir)?;
    let registry = SHARED_INDEXES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut indexes = registry.lock().map_err(|error| {
        SearchError::Unavailable(format!("shared index lock poisoned: {error}"))
    })?;

    if let Some(index) = indexes.get(&canonical_key).and_then(Weak::upgrade) {
        return Ok(index);
    }

    let index = Arc::new(SearchIndex::open_or_rebuild(index_dir, db)?);
    indexes.insert(canonical_key, Arc::downgrade(&index));
    Ok(index)
}

pub fn index_text(db: &Database, item_id: i64, text: &str) -> Result<(), SearchError> {
    let index = db
        .search_index()
        .ok_or_else(|| SearchError::Unavailable("database has no search index".to_string()))?;
    index.replace_text(item_id, text)
}

pub(crate) fn index_clipboard_item(db: &Database, item: &ClipboardItem) -> Result<(), SearchError> {
    index_text(db, item.id, &searchable_text(item))
}

pub(crate) fn delete_items(db: &Database, item_ids: &[i64]) -> Result<(), SearchError> {
    if item_ids.is_empty() {
        return Ok(());
    }
    let index = db
        .search_index()
        .ok_or_else(|| SearchError::Unavailable("database has no search index".to_string()))?;
    index.delete_items(item_ids)
}

pub(crate) fn clear(db: &Database) -> Result<(), SearchError> {
    let index = db
        .search_index()
        .ok_or_else(|| SearchError::Unavailable("database has no search index".to_string()))?;
    index.clear()
}

pub(crate) fn rebuild(db: &Database) -> Result<(), SearchError> {
    let index = db
        .search_index()
        .ok_or_else(|| SearchError::Unavailable("database has no search index".to_string()))?;
    index.rebuild_from_database(db)
}

pub(crate) fn search_ids(db: &Database, query: &str) -> Result<Vec<i64>, SearchError> {
    let index = db
        .search_index()
        .ok_or_else(|| SearchError::Unavailable("database has no search index".to_string()))?;
    index.search_ids(query)
}

impl SearchIndex {
    fn open_or_rebuild(index_dir: &Path, db: &Database) -> Result<Self, SearchError> {
        if index_dir.join("meta.json").is_file() {
            match Self::open_existing(index_dir, db) {
                Ok(index) => return Self::start(index),
                Err(error) => {
                    tracing::warn!(
                        "Search index health check failed at {}: {}; rebuilding from SQLite",
                        index_dir.display(),
                        error
                    );
                    preserve_corrupt_index(index_dir)?;
                }
            }
        } else if index_dir.exists() {
            preserve_corrupt_index(index_dir)?;
        }

        let core = Self::build_from_database(index_dir, db)?;
        Self::start(core)
    }

    fn open_existing(index_dir: &Path, db: &Database) -> Result<Arc<SearchCore>, SearchError> {
        let expected_schema = search_schema();
        let index = Index::open_in_dir(index_dir)?;
        if index.schema() != expected_schema {
            return Err(SearchError::Unavailable(
                "index schema does not match the current search schema".to_string(),
            ));
        }
        register_tokenizer(&index);

        let damaged_files = index.validate_checksum()?;
        if !damaged_files.is_empty() {
            return Err(SearchError::Unavailable(format!(
                "checksum validation found damaged files: {}",
                display_paths(&damaged_files)
            )));
        }

        let database_fingerprints = database_document_fingerprints(db)?;
        let index_fingerprints = index_document_fingerprints(&index)?;
        if index_fingerprints != database_fingerprints {
            return Err(SearchError::Unavailable(format!(
                "index identities or searchable content do not match SQLite ({} index documents, {} database rows)",
                index_fingerprints.len(),
                database_fingerprints.len()
            )));
        }

        Self::core_from_index(index)
    }

    fn build_from_database(
        index_dir: &Path,
        db: &Database,
    ) -> Result<Arc<SearchCore>, SearchError> {
        std::fs::create_dir_all(index_dir)?;
        let index = Index::create_in_dir(index_dir, search_schema())?;
        register_tokenizer(&index);
        let core = Self::core_from_index(index)?;
        core.rebuild_from_database(db)?;
        Ok(core)
    }

    fn core_from_index(index: Index) -> Result<Arc<SearchCore>, SearchError> {
        let schema = index.schema();
        let id_field = schema
            .get_field("item_id")
            .map_err(|error| SearchError::Unavailable(error.to_string()))?;
        let text_field = schema
            .get_field("text")
            .map_err(|error| SearchError::Unavailable(error.to_string()))?;
        let fingerprint_field = schema
            .get_field("content_fingerprint")
            .map_err(|error| SearchError::Unavailable(error.to_string()))?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()?;
        let writer = index.writer(INDEX_WRITER_MEMORY_BYTES)?;
        writer.set_merge_policy(Box::<LogMergePolicy>::default());

        Ok(Arc::new(SearchCore {
            index,
            reader,
            id_field,
            text_field,
            fingerprint_field,
            writer: Mutex::new(WriterState {
                writer,
                pending_operations: 0,
                last_commit: Instant::now(),
            }),
            healthy: AtomicBool::new(true),
        }))
    }

    fn start(core: Arc<SearchCore>) -> Result<Self, SearchError> {
        let (shutdown_tx, shutdown_rx) = mpsc::channel();
        let worker_core = Arc::clone(&core);
        let worker = std::thread::Builder::new()
            .name("klip-search-commit".to_string())
            .spawn(move || loop {
                match shutdown_rx.recv_timeout(COMMIT_INTERVAL) {
                    Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                        if let Err(error) = worker_core.commit_pending() {
                            tracing::warn!(
                                "Failed to commit search index during shutdown: {error}"
                            );
                        }
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if let Err(error) = worker_core.commit_if_due() {
                            tracing::warn!("Timed search index commit failed: {error}");
                        }
                    }
                }
            })?;

        Ok(Self {
            core,
            shutdown_tx: Mutex::new(Some(shutdown_tx)),
            worker: Mutex::new(Some(worker)),
        })
    }

    fn replace_text(&self, item_id: i64, text: &str) -> Result<(), SearchError> {
        self.core.ensure_healthy()?;
        let mut state = self.core.lock_writer()?;
        state
            .writer
            .delete_term(Term::from_field_i64(self.core.id_field, item_id));
        if let Err(error) = state.writer.add_document(doc!(
            self.core.id_field => item_id,
            self.core.text_field => text,
            self.core.fingerprint_field => content_fingerprint(text),
        )) {
            self.core.mark_unhealthy();
            return Err(error.into());
        }
        state.pending_operations += 1;
        if state.pending_operations >= COMMIT_BATCH_SIZE {
            self.core.commit_locked(&mut state)?;
        }
        Ok(())
    }

    fn delete_items(&self, item_ids: &[i64]) -> Result<(), SearchError> {
        self.core.ensure_healthy()?;
        let mut state = self.core.lock_writer()?;
        for item_id in item_ids {
            state
                .writer
                .delete_term(Term::from_field_i64(self.core.id_field, *item_id));
        }
        state.pending_operations += item_ids.len();
        if state.pending_operations >= COMMIT_BATCH_SIZE {
            self.core.commit_locked(&mut state)?;
        }
        Ok(())
    }

    fn clear(&self) -> Result<(), SearchError> {
        self.core.ensure_healthy()?;
        let mut state = self.core.lock_writer()?;
        if let Err(error) = state.writer.delete_all_documents() {
            self.core.mark_unhealthy();
            return Err(error.into());
        }
        state.pending_operations += 1;
        self.core.commit_locked(&mut state)
    }

    fn rebuild_from_database(&self, db: &Database) -> Result<(), SearchError> {
        self.core.rebuild_from_database(db)
    }

    fn search_ids(&self, query: &str) -> Result<Vec<i64>, SearchError> {
        self.core.ensure_healthy()?;
        self.core.commit_pending()?;

        let terms = self.core.tokenize_query(query)?;
        let clauses = terms
            .into_iter()
            .map(|term| {
                let query: Box<dyn Query> = Box::new(TermQuery::new(
                    Term::from_field_text(self.core.text_field, &term),
                    IndexRecordOption::WithFreqsAndPositions,
                ));
                (Occur::Must, query)
            })
            .collect::<Vec<_>>();
        let query = BooleanQuery::new(clauses);
        let searcher = self.core.reader.searcher();
        let document_count = usize::try_from(searcher.num_docs()).unwrap_or(usize::MAX);
        if document_count == 0 {
            return Ok(Vec::new());
        }

        let hits = match searcher.search(&query, &TopDocs::with_limit(document_count)) {
            Ok(hits) => hits,
            Err(error) => {
                self.core.mark_unhealthy();
                return Err(error.into());
            }
        };
        let mut ids = Vec::with_capacity(hits.len());
        for (_, address) in hits {
            let document: TantivyDocument = match searcher.doc(address) {
                Ok(document) => document,
                Err(error) => {
                    self.core.mark_unhealthy();
                    return Err(error.into());
                }
            };
            if let Some(item_id) = document
                .get_first(self.core.id_field)
                .and_then(|value| value.as_i64())
            {
                ids.push(item_id);
            }
        }
        Ok(ids)
    }
}

impl Drop for SearchIndex {
    fn drop(&mut self) {
        if let Ok(mut sender) = self.shutdown_tx.lock() {
            if let Some(sender) = sender.take() {
                let _ = sender.send(());
            }
        }
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(worker) = worker.take() {
                if worker.join().is_err() {
                    tracing::error!("Search index commit worker exited unexpectedly");
                }
            }
        }
    }
}

impl SearchCore {
    fn ensure_healthy(&self) -> Result<(), SearchError> {
        if self.healthy.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err(SearchError::Unavailable(
                "index was disabled after an earlier operation failed".to_string(),
            ))
        }
    }

    fn mark_unhealthy(&self) {
        self.healthy.store(false, Ordering::Release);
    }

    fn lock_writer(&self) -> Result<std::sync::MutexGuard<'_, WriterState>, SearchError> {
        self.writer.lock().map_err(|error| {
            self.mark_unhealthy();
            SearchError::Unavailable(format!("index writer lock poisoned: {error}"))
        })
    }

    fn commit_if_due(&self) -> Result<(), SearchError> {
        self.ensure_healthy()?;
        let mut state = self.lock_writer()?;
        if state.pending_operations > 0 && state.last_commit.elapsed() >= COMMIT_INTERVAL {
            self.commit_locked(&mut state)?;
        }
        Ok(())
    }

    fn commit_pending(&self) -> Result<(), SearchError> {
        self.ensure_healthy()?;
        let mut state = self.lock_writer()?;
        if state.pending_operations > 0 {
            self.commit_locked(&mut state)?;
        }
        Ok(())
    }

    fn commit_locked(&self, state: &mut WriterState) -> Result<(), SearchError> {
        if let Err(error) = state.writer.commit() {
            self.mark_unhealthy();
            return Err(error.into());
        }
        if let Err(error) = self.reader.reload() {
            self.mark_unhealthy();
            return Err(error.into());
        }
        state.pending_operations = 0;
        state.last_commit = Instant::now();
        Ok(())
    }

    fn rebuild_from_database(&self, db: &Database) -> Result<(), SearchError> {
        let documents = database_documents(db)?;
        let mut state = self.lock_writer()?;
        if let Err(error) = state.writer.delete_all_documents() {
            self.mark_unhealthy();
            return Err(error.into());
        }
        for (item_id, text) in documents {
            if let Err(error) = state.writer.add_document(doc!(
                self.id_field => item_id,
                self.text_field => text.as_str(),
                self.fingerprint_field => content_fingerprint(&text),
            )) {
                self.mark_unhealthy();
                return Err(error.into());
            }
        }
        state.pending_operations = 1;
        self.commit_locked(&mut state)?;
        self.healthy.store(true, Ordering::Release);
        Ok(())
    }

    fn tokenize_query(&self, query: &str) -> Result<Vec<String>, SearchError> {
        let normalized = query.trim();
        if normalized.is_empty() {
            return Err(SearchError::Query("query is empty".to_string()));
        }
        let mut analyzer =
            self.index.tokenizers().get(TOKENIZER_NAME).ok_or_else(|| {
                SearchError::Unavailable("jieba tokenizer is not registered".into())
            })?;
        let mut stream = analyzer.token_stream(normalized);
        let mut terms = Vec::new();
        let mut seen = HashSet::new();
        while stream.advance() {
            let token = stream.token().text.clone();
            if seen.insert(token.clone()) {
                terms.push(token);
            }
        }
        if terms.is_empty() {
            return Err(SearchError::Query(
                "query produced no searchable tokens".to_string(),
            ));
        }
        Ok(terms)
    }
}

fn search_schema() -> Schema {
    let mut builder = Schema::builder();
    builder.add_i64_field("item_id", INDEXED | STORED);
    let text_options = TextOptions::default().set_indexing_options(
        TextFieldIndexing::default()
            .set_tokenizer(TOKENIZER_NAME)
            .set_index_option(IndexRecordOption::WithFreqsAndPositions),
    );
    builder.add_text_field("text", text_options);
    builder.add_bytes_field("content_fingerprint", BytesOptions::default().set_stored());
    builder.build()
}

fn register_tokenizer(index: &Index) {
    let analyzer = TextAnalyzer::builder(JiebaTokenizer)
        .filter(LowerCaser)
        .build();
    index.tokenizers().register(TOKENIZER_NAME, analyzer);
}

fn searchable_text(item: &ClipboardItem) -> String {
    let ocr_text = item
        .ocr
        .as_ref()
        .filter(|ocr| ocr.status == OcrStatus::Completed)
        .map(|ocr| ocr.text.as_str());
    compose_searchable_text(
        item.content_type,
        &item.content,
        item.preview.as_deref(),
        ocr_text,
        item.custom_title.as_deref(),
        item.note.as_deref(),
    )
}

fn compose_searchable_text(
    content_type: ContentType,
    content: &str,
    preview: Option<&str>,
    ocr_text: Option<&str>,
    custom_title: Option<&str>,
    note: Option<&str>,
) -> String {
    let preview = preview.unwrap_or_default();
    let content_text = match content_type {
        ContentType::Image => {
            let ocr_text = ocr_text.unwrap_or_default().trim();
            match (preview.is_empty(), ocr_text.is_empty()) {
                (true, true) => String::new(),
                (false, true) => preview.to_string(),
                (true, false) => ocr_text.to_string(),
                (false, false) => format!("{preview}\n{ocr_text}"),
            }
        }
        ContentType::Text | ContentType::File => {
            if preview.is_empty() || content.contains(preview) {
                content.to_string()
            } else {
                format!("{preview}\n{content}")
            }
        }
    };

    [
        custom_title.unwrap_or_default(),
        note.unwrap_or_default(),
        content_text.as_str(),
    ]
    .into_iter()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn content_fingerprint(text: &str) -> Vec<u8> {
    Sha256::digest(text.as_bytes()).to_vec()
}

fn database_document_fingerprints(db: &Database) -> Result<Vec<(i64, Vec<u8>)>, SearchError> {
    Ok(database_documents(db)?
        .into_iter()
        .map(|(item_id, text)| (item_id, content_fingerprint(&text)))
        .collect())
}

fn index_document_fingerprints(index: &Index) -> Result<Vec<(i64, Vec<u8>)>, SearchError> {
    let schema = index.schema();
    let id_field = schema
        .get_field("item_id")
        .map_err(|error| SearchError::Unavailable(error.to_string()))?;
    let fingerprint_field = schema
        .get_field("content_fingerprint")
        .map_err(|error| SearchError::Unavailable(error.to_string()))?;
    let reader = index.reader()?;
    let searcher = reader.searcher();
    let document_count = usize::try_from(searcher.num_docs()).map_err(|_| {
        SearchError::Unavailable("index document count does not fit in memory".to_string())
    })?;
    if document_count == 0 {
        return Ok(Vec::new());
    }

    let hits = searcher.search(&AllQuery, &TopDocs::with_limit(document_count))?;
    let mut fingerprints = Vec::with_capacity(hits.len());
    for (_, address) in hits {
        let document: TantivyDocument = searcher.doc(address)?;
        let item_id = document
            .get_first(id_field)
            .and_then(|value| value.as_i64())
            .ok_or_else(|| {
                SearchError::Unavailable("index document is missing item_id".to_string())
            })?;
        let fingerprint = document
            .get_first(fingerprint_field)
            .and_then(|value| value.as_bytes())
            .map(ToOwned::to_owned)
            .ok_or_else(|| {
                SearchError::Unavailable(
                    "index document is missing content_fingerprint".to_string(),
                )
            })?;
        fingerprints.push((item_id, fingerprint));
    }
    fingerprints.sort_by_key(|(item_id, _)| *item_id);
    Ok(fingerprints)
}

fn database_documents(db: &Database) -> Result<Vec<(i64, String)>, SearchError> {
    let conn = db
        .get_connection()
        .map_err(|error| SearchError::Unavailable(error.to_string()))?;
    let mut statement = conn
        .prepare(
            "SELECT i.id, i.content_type,
                    CASE WHEN i.content_type = 'image' THEN '' ELSE i.content END,
                    i.preview, COALESCE(o.text, ''), i.custom_title, i.note
             FROM clipboard_items i
             LEFT JOIN clipboard_ocr o ON o.item_id = i.id AND o.status = 'completed'
             ORDER BY i.id",
        )
        .map_err(|error| SearchError::Unavailable(error.to_string()))?;
    let rows = statement
        .query_map([], |row| {
            let content_type = ContentType::from_db(&row.get::<_, String>(1)?);
            let content = row.get::<_, String>(2)?;
            let preview = row.get::<_, Option<String>>(3)?;
            let ocr_text = row.get::<_, String>(4)?;
            let custom_title = row.get::<_, Option<String>>(5)?;
            let note = row.get::<_, Option<String>>(6)?;
            let text = compose_searchable_text(
                content_type,
                &content,
                preview.as_deref(),
                Some(&ocr_text),
                custom_title.as_deref(),
                note.as_deref(),
            );
            Ok((row.get::<_, i64>(0)?, text))
        })
        .map_err(|error| SearchError::Unavailable(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| SearchError::Unavailable(error.to_string()))
}

fn absolute_index_key(index_dir: &Path) -> Result<PathBuf, SearchError> {
    if index_dir.is_absolute() {
        Ok(index_dir.to_path_buf())
    } else {
        Ok(std::env::current_dir()?.join(index_dir))
    }
}

fn preserve_corrupt_index(index_dir: &Path) -> Result<(), SearchError> {
    if !index_dir.exists() {
        return Ok(());
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let parent = index_dir.parent().unwrap_or_else(|| Path::new("."));
    let base_name = index_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(INDEX_DIRECTORY_NAME);
    let mut backup = parent.join(format!("{base_name}.corrupt-{timestamp}"));
    let mut suffix = 0u32;
    while backup.exists() {
        suffix += 1;
        backup = parent.join(format!("{base_name}.corrupt-{timestamp}-{suffix}"));
    }
    std::fs::rename(index_dir, &backup)?;
    tracing::warn!(
        "Preserved unhealthy search index at {} before rebuilding",
        backup.display()
    );
    Ok(())
}

fn display_paths(paths: &HashSet<PathBuf>) -> String {
    let mut paths = paths
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    paths.sort();
    paths.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::NewClipboardItem;
    use sha2::{Digest, Sha256};

    fn temp_database(name: &str) -> (PathBuf, Database) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "klip-search-{name}-{}-{timestamp}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).expect("create search test directory");
        let database = Database::new(&root.join("klip.db")).expect("create search test database");
        (root, database)
    }

    fn insert_text(db: &Database, content: &str) -> ClipboardItem {
        let item = NewClipboardItem {
            content_type: ContentType::Text,
            data: content.as_bytes().to_vec(),
            preview: Some(content.chars().take(100).collect()),
            hash: format!("{:x}", Sha256::digest(content.as_bytes())),
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).expect("insert searchable text")
    }

    fn insert_image(db: &Database, hash: &str) -> ClipboardItem {
        let data = include_bytes!("../../tests/fixtures/ocr/chinese-text.png").to_vec();
        let item = NewClipboardItem {
            content_type: ContentType::Image,
            size: data.len() as i64,
            data,
            preview: Some("image fixture".into()),
            hash: hash.into(),
            metadata: None,
            formats: Vec::new(),
            image_sources: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).expect("insert searchable image")
    }

    fn preserved_index_exists(root: &Path) -> bool {
        std::fs::read_dir(root)
            .expect("read search test root")
            .filter_map(Result::ok)
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("search-index.corrupt-")
            })
    }

    #[test]
    fn jieba_matches_non_contiguous_chinese_terms() {
        let (root, db) = temp_database("jieba");
        let expected = insert_text(&db, "Klip 是一款剪贴板管理工具");

        let results = crate::database::clipboard::search(&db, "剪贴板工具", None, 20)
            .expect("search Chinese terms");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, expected.id);
        drop(db);
        std::fs::remove_dir_all(root).expect("remove search test directory");
    }

    #[test]
    fn newly_indexed_and_deleted_items_are_immediately_consistent() {
        let (root, db) = temp_database("delete");
        let item = insert_text(&db, "immediate-search-visibility");

        let before = crate::database::clipboard::search(&db, "immediate", None, 20)
            .expect("search newly indexed item");
        assert_eq!(before.len(), 1);

        crate::database::clipboard::delete(&db, item.id).expect("delete clipboard item");
        let after = crate::database::clipboard::search(&db, "immediate", None, 20)
            .expect("search after deletion");
        assert!(after.is_empty());

        drop(db);
        std::fs::remove_dir_all(root).expect("remove search test directory");
    }

    #[test]
    fn multiple_database_connections_share_one_index_writer() {
        let (root, first) = temp_database("shared-writer");
        let second = Database::new(&root.join("klip.db")).expect("open second database connection");
        let first_index = first.search_index().expect("first search index");
        let second_index = second.search_index().expect("second search index");
        assert!(Arc::ptr_eq(first_index, second_index));

        let expected = insert_text(&second, "shared-index-writer-content");
        let results = crate::database::clipboard::search(&first, "shared-index", None, 20)
            .expect("search through first database connection");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, expected.id);

        drop(second);
        drop(first);
        std::fs::remove_dir_all(root).expect("remove search test directory");
    }

    #[test]
    fn unavailable_index_falls_back_to_sqlite_like() {
        let connection = rusqlite::Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch("PRAGMA foreign_keys=ON;")
            .expect("configure in-memory database");
        let db = Database::from_conn(connection);
        db.init_schema().expect("initialize schema");
        let expected = insert_text(&db, "fallback-only-result");

        let results = crate::database::clipboard::search(&db, "fallback-only", None, 20)
            .expect("search with SQLite fallback");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, expected.id);
    }

    #[test]
    fn annotations_are_searchable_incrementally_after_rebuild_and_in_sqlite_fallback() {
        let (root, db) = temp_database("annotations");
        let item = insert_text(&db, "content without annotation terms");
        crate::database::clipboard::update_annotations(
            &db,
            item.id,
            Some("Quarterly roadmap".into()),
            Some("Discuss 北极星指标 with the team".into()),
        )
        .expect("save searchable annotations");

        let title_results = crate::database::clipboard::search(&db, "roadmap", None, 20)
            .expect("search incrementally indexed title");
        assert_eq!(
            title_results.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![item.id]
        );

        rebuild(&db).expect("rebuild index with annotations");
        let note_results = crate::database::clipboard::search(&db, "北极星指标", None, 20)
            .expect("search rebuilt note");
        assert_eq!(
            note_results.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![item.id]
        );

        drop(db);
        std::fs::remove_dir_all(root).expect("remove annotation search test directory");

        let connection = rusqlite::Connection::open_in_memory().expect("open fallback database");
        connection
            .execute_batch("PRAGMA foreign_keys=ON;")
            .expect("configure fallback database");
        let fallback = Database::from_conn(connection);
        fallback.init_schema().expect("initialize fallback schema");
        let fallback_item = insert_text(&fallback, "fallback annotation content");
        crate::database::clipboard::update_annotations(
            &fallback,
            fallback_item.id,
            None,
            Some("fallback-note-marker".into()),
        )
        .expect("save fallback annotation");
        let fallback_results =
            crate::database::clipboard::search(&fallback, "note-marker", None, 20)
                .expect("search annotation with SQLite fallback");
        assert_eq!(
            fallback_results
                .iter()
                .map(|item| item.id)
                .collect::<Vec<_>>(),
            vec![fallback_item.id]
        );
    }

    #[test]
    fn completed_ocr_text_is_searchable_after_incremental_update_and_rebuild() {
        let (root, db) = temp_database("ocr-rebuild");
        let image = insert_image(&db, "ocr-search-image");
        crate::database::ocr::complete(&db, image.id, "离线发票号码 KLIP-2026").unwrap();
        let completed = crate::database::clipboard::get_by_id(&db, image.id)
            .unwrap()
            .unwrap();

        index_clipboard_item(&db, &completed).expect("index completed OCR text");
        let incremental = crate::database::clipboard::search(&db, "发票号码", None, 20)
            .expect("search incrementally indexed OCR text");
        assert_eq!(
            incremental.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![image.id]
        );

        rebuild(&db).expect("rebuild index with OCR text");
        let rebuilt = crate::database::clipboard::search(&db, "KLIP-2026", None, 20)
            .expect("search rebuilt OCR text");
        assert_eq!(
            rebuilt.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![image.id]
        );

        drop(db);
        std::fs::remove_dir_all(root).expect("remove OCR search test directory");
    }

    #[test]
    fn completed_ocr_text_is_available_in_sqlite_fallback() {
        let connection = rusqlite::Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch("PRAGMA foreign_keys=ON;")
            .expect("configure in-memory database");
        let db = Database::from_conn(connection);
        db.init_schema().expect("initialize schema");
        let image = insert_image(&db, "ocr-fallback-image");
        crate::database::ocr::complete(&db, image.id, "本地识别结果").unwrap();

        let results = crate::database::clipboard::search(&db, "识别结果", None, 20)
            .expect("search OCR text with SQLite fallback");

        assert_eq!(
            results.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![image.id]
        );

        {
            let conn = db.get_connection().unwrap();
            conn.execute(
                "UPDATE clipboard_ocr SET status = 'failed' WHERE item_id = ?1",
                [image.id],
            )
            .unwrap();
        }
        let failed = crate::database::clipboard::search(&db, "识别结果", None, 20)
            .expect("ignore failed OCR text in SQLite fallback");
        assert!(failed.is_empty());
    }

    #[test]
    fn same_count_with_different_ids_is_rebuilt_from_sqlite() {
        let (root, db) = temp_database("id-drift");
        let stale = insert_text(&db, "stale-index-identity");
        crate::database::clipboard::search(&db, "stale-index", None, 20)
            .expect("flush initial search index");
        drop(db);

        let replacement_content = "replacement-index-identity";
        let replacement_hash = format!("{:x}", Sha256::digest(replacement_content.as_bytes()));
        let connection = rusqlite::Connection::open(root.join("klip.db"))
            .expect("open database without search synchronization");
        connection
            .execute_batch("PRAGMA foreign_keys=ON;")
            .expect("enable foreign keys");
        connection
            .execute("DELETE FROM clipboard_items WHERE id = ?1", [stale.id])
            .expect("delete indexed row directly");
        connection
            .execute(
                "INSERT INTO clipboard_items
                 (content_type, content, preview, hash, size, created_at, last_used_at)
                 VALUES ('text', ?1, ?1, ?2, ?3, 2, 2)",
                rusqlite::params![
                    replacement_content,
                    replacement_hash,
                    replacement_content.len() as i64
                ],
            )
            .expect("insert replacement row directly");
        let replacement_id = connection.last_insert_rowid();
        assert_ne!(replacement_id, stale.id);
        drop(connection);

        let reopened = Database::new(&root.join("klip.db"))
            .expect("reopen database and rebuild identity drift");
        let replacement =
            crate::database::clipboard::search(&reopened, "replacement-index", None, 20)
                .expect("search replacement item");
        let stale_results = crate::database::clipboard::search(&reopened, "stale-index", None, 20)
            .expect("search removed item");

        assert_eq!(
            replacement.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![replacement_id]
        );
        assert!(stale_results.is_empty());
        assert!(preserved_index_exists(&root));

        drop(reopened);
        std::fs::remove_dir_all(root).expect("remove ID drift test directory");
    }

    #[test]
    fn same_id_with_stale_searchable_content_is_rebuilt_from_sqlite() {
        let (root, db) = temp_database("content-drift");
        let stale = insert_text(&db, "stale-index-content");
        crate::database::clipboard::search(&db, "stale-index", None, 20)
            .expect("flush initial search index");
        drop(db);

        let replacement_content = "current-database-content";
        let replacement_hash = format!("{:x}", Sha256::digest(replacement_content.as_bytes()));
        let connection = rusqlite::Connection::open(root.join("klip.db"))
            .expect("open database without search synchronization");
        connection
            .execute(
                "UPDATE clipboard_items
                 SET content = ?1, preview = ?1, hash = ?2, size = ?3
                 WHERE id = ?4",
                rusqlite::params![
                    replacement_content,
                    replacement_hash,
                    replacement_content.len() as i64,
                    stale.id
                ],
            )
            .expect("replace searchable content directly");
        drop(connection);

        let reopened = Database::new(&root.join("klip.db"))
            .expect("reopen database and rebuild content drift");
        let replacement =
            crate::database::clipboard::search(&reopened, "current-database", None, 20)
                .expect("search current database content");
        let stale_results = crate::database::clipboard::search(&reopened, "stale-index", None, 20)
            .expect("search stale index content");

        assert_eq!(
            replacement.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![stale.id]
        );
        assert!(stale_results.is_empty());
        assert!(preserved_index_exists(&root));

        drop(reopened);
        std::fs::remove_dir_all(root).expect("remove content drift test directory");
    }

    #[test]
    fn same_id_with_stale_annotations_is_rebuilt_from_sqlite() {
        let (root, db) = temp_database("annotation-drift");
        let item = insert_text(&db, "stable clipboard content");
        crate::database::clipboard::search(&db, "stable", None, 20)
            .expect("flush initial search index");
        drop(db);

        let connection = rusqlite::Connection::open(root.join("klip.db"))
            .expect("open database without search synchronization");
        connection
            .execute(
                "UPDATE clipboard_items SET custom_title = ?1, note = ?2 WHERE id = ?3",
                rusqlite::params!["Database annotation", "fingerprint-note-drift", item.id],
            )
            .expect("replace annotations directly");
        drop(connection);

        let reopened = Database::new(&root.join("klip.db"))
            .expect("reopen database and rebuild annotation drift");
        let results = crate::database::clipboard::search(&reopened, "fingerprint-note", None, 20)
            .expect("search rebuilt annotation");

        assert_eq!(
            results.iter().map(|item| item.id).collect::<Vec<_>>(),
            vec![item.id]
        );
        assert!(preserved_index_exists(&root));

        drop(reopened);
        std::fs::remove_dir_all(root).expect("remove annotation drift test directory");
    }

    #[test]
    fn corrupted_index_is_preserved_and_rebuilt_from_sqlite() {
        let (root, db) = temp_database("corrupt");
        let expected = insert_text(&db, "recoverable-index-content");
        crate::database::clipboard::search(&db, "recoverable", None, 20)
            .expect("flush initial search index");
        drop(db);

        let index_dir = root.join(INDEX_DIRECTORY_NAME);
        let store_file = std::fs::read_dir(&index_dir)
            .expect("read search index directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.extension()
                    .is_some_and(|extension| extension == "store")
            })
            .expect("find Tantivy store file");
        std::fs::OpenOptions::new()
            .write(true)
            .open(&store_file)
            .expect("open store file for corruption")
            .set_len(1)
            .expect("truncate store file");

        let reopened = Database::new(&root.join("klip.db")).expect("reopen database and rebuild");
        let results = crate::database::clipboard::search(&reopened, "recoverable", None, 20)
            .expect("search rebuilt index");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, expected.id);
        assert!(preserved_index_exists(&root));

        drop(reopened);
        std::fs::remove_dir_all(root).expect("remove search test directory");
    }

    #[test]
    #[ignore = "explicit 100k-document performance acceptance test"]
    fn searches_one_hundred_thousand_documents_in_milliseconds() {
        let (root, db) = temp_database("benchmark-100k");
        {
            let mut connection = db.get_connection().expect("lock benchmark database");
            let transaction = connection.transaction().expect("start benchmark insert");
            {
                let mut statement = transaction
                    .prepare(
                        "INSERT INTO clipboard_items
                         (content_type, content, preview, hash, size, created_at, last_used_at)
                         VALUES ('text', ?1, ?1, ?2, ?3, ?4, ?4)",
                    )
                    .expect("prepare benchmark insert");
                for item_id in 0..100_000i64 {
                    let content =
                        format!("性能测试条目 {item_id} benchmarkneedle{item_id} 剪贴板管理工具");
                    statement
                        .execute(rusqlite::params![
                            content,
                            format!("benchmark-hash-{item_id}"),
                            content.len() as i64,
                            item_id,
                        ])
                        .expect("insert benchmark row");
                }
            }
            transaction.commit().expect("commit benchmark rows");
        }
        rebuild(&db).expect("build 100k-document index");

        let _ = crate::database::clipboard::search(&db, "benchmarkneedle99999", None, 20)
            .expect("warm benchmark query");
        let started = Instant::now();
        let results = crate::database::clipboard::search(&db, "benchmarkneedle99999", None, 20)
            .expect("run benchmark query");
        let elapsed = started.elapsed();

        assert_eq!(results.len(), 1);
        assert!(
            elapsed < Duration::from_secs(1),
            "100k-document query took {elapsed:?}, expected millisecond-scale latency"
        );
        eprintln!("100k Tantivy search latency: {elapsed:?}");

        drop(results);
        drop(db);
        let validation_started = Instant::now();
        let reopened =
            Database::new(&root.join("klip.db")).expect("reopen and validate 100k-document index");
        let validation_elapsed = validation_started.elapsed();
        assert!(
            validation_elapsed < Duration::from_secs(10),
            "100k-document startup validation took {validation_elapsed:?}, expected under 10 seconds"
        );
        let reopened_results =
            crate::database::clipboard::search(&reopened, "benchmarkneedle99999", None, 20)
                .expect("search validated 100k-document index");
        assert_eq!(reopened_results.len(), 1);
        eprintln!("100k Tantivy startup validation: {validation_elapsed:?}");

        drop(reopened);
        std::fs::remove_dir_all(root).expect("remove search benchmark directory");
    }
}

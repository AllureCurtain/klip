pub mod file;
pub mod image;
pub mod text;

use crate::database::types::ContentType;

pub trait ClipboardFormatStrategy: Send + Sync {
    fn content_type(&self) -> ContentType;
    fn detect(&self) -> bool;
    fn extract(&self) -> Result<ExtractedContent, FormatError>;
}

#[derive(Debug, thiserror::Error)]
pub enum FormatError {
    #[error("clipboard access failed: {0}")]
    ClipboardAccess(String),
    #[error("format detection failed: {0}")]
    DetectionFailed(String),
    #[error("content extraction failed: {0}")]
    ExtractionFailed(String),
    #[error("encoding failed: {0}")]
    EncodingFailed(String),
    #[error("content too large: {0} bytes")]
    TooLarge(usize),
}

#[derive(Debug, Clone)]
pub struct ExtractedContent {
    pub content_type: ContentType,
    pub data: Vec<u8>,
    pub preview: String,
    pub hash: String,
    pub size: i64,
    pub metadata: Option<String>,
}

pub struct FormatStrategyRegistry {
    pub strategies: Vec<Box<dyn ClipboardFormatStrategy>>,
}

impl Default for FormatStrategyRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl FormatStrategyRegistry {
    pub fn new() -> Self {
        let strategies: Vec<Box<dyn ClipboardFormatStrategy>> = vec![
            Box::new(image::ImageStrategy),
            Box::new(file::FileStrategy),
            Box::new(text::TextStrategy),
        ];
        Self { strategies }
    }

    pub fn detect_format(&self) -> Option<(&dyn ClipboardFormatStrategy, ContentType)> {
        for strategy in &self.strategies {
            if strategy.detect() {
                return Some((strategy.as_ref(), strategy.content_type()));
            }
        }
        None
    }
}

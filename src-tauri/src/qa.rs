use crate::database::{self, ClipboardItem, ContentType, Database};
use crate::llm::{LlmConfig, LlmProvider};
use crate::AppError;
use serde::Serialize;
use std::collections::HashSet;

const FETCH_LIMIT: i64 = 200;
const MAX_CONTEXT_CHARS: usize = 4000;
const MAX_CONTEXT_CHARS_PER_ITEM: usize = 900;

#[derive(Debug, Serialize)]
pub struct QaAnswer {
    pub answer: String,
    pub provider: &'static str,
    pub model: String,
    pub context_count: usize,
    pub context: Vec<QaContextItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QaContextItem {
    pub id: i64,
    pub preview: String,
    pub score: f64,
    #[serde(skip_serializing)]
    pub content: String,
}

pub async fn answer_question(
    db: &Database,
    question: &str,
    provider: &dyn LlmProvider,
    config: &LlmConfig,
) -> Result<QaAnswer, AppError> {
    let question = question.trim();
    if question.is_empty() {
        return Err(AppError::InvalidInput(
            "question cannot be empty".to_string(),
        ));
    }

    let context = retrieve_context(db, question, config.max_context_items)?;
    let prompt = build_prompt(question, &context);
    let answer = provider.complete(&prompt).await?;

    Ok(QaAnswer {
        answer,
        provider: provider.name(),
        model: config.model.clone(),
        context_count: context.len(),
        context,
    })
}

/// Retrieve the context for `question` and build the prompt, both owned.
/// The HTTP streaming endpoint owns the provider and the prompt inside its
/// stream block (borrowed values cannot outlive the response), so the heavy
/// lifting happens here first.
pub fn prepare_stream_answer(
    db: &Database,
    question: &str,
    config: &LlmConfig,
) -> Result<(Vec<QaContextItem>, String), AppError> {
    let question = question.trim();
    if question.is_empty() {
        return Err(AppError::InvalidInput(
            "question cannot be empty".to_string(),
        ));
    }
    let context = retrieve_context(db, question, config.max_context_items)?;
    let prompt = build_prompt(question, &context);
    Ok((context, prompt))
}

/// One retrieved clipboard excerpt with its id and relevance score.
/// Serialized for the QA streaming `context` SSE event.
#[derive(Debug, Serialize)]
pub struct QaContextSnapshot {
    pub id: i64,
    pub preview: String,
    pub score: f64,
}

impl From<&QaContextItem> for QaContextSnapshot {
    fn from(item: &QaContextItem) -> Self {
        Self {
            id: item.id,
            preview: item.preview.clone(),
            score: item.score,
        }
    }
}

fn retrieve_context(
    db: &Database,
    question: &str,
    max_items: usize,
) -> Result<Vec<QaContextItem>, AppError> {
    let question_tokens = tokenize(question);
    let items = database::clipboard::get_list(db, FETCH_LIMIT, 0)?;
    let mut scored = items
        .into_iter()
        .filter(|item| item.content_type == ContentType::Text)
        .filter_map(|item| {
            let score = score_item(&question_tokens, &item);
            (score > 0.0).then(|| QaContextItem {
                id: item.id,
                preview: item
                    .preview
                    .unwrap_or_else(|| item.content.chars().take(120).collect()),
                content: item.content,
                score,
            })
        })
        .collect::<Vec<_>>();

    scored.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.id.cmp(&left.id))
    });

    let mut selected = Vec::new();
    let mut total_chars = 0usize;
    for mut item in scored.into_iter().take(max_items) {
        if item.content.chars().count() > MAX_CONTEXT_CHARS_PER_ITEM {
            item.content = item
                .content
                .chars()
                .take(MAX_CONTEXT_CHARS_PER_ITEM)
                .collect::<String>();
        }
        let item_len = item.content.len();
        if !selected.is_empty() && total_chars + item_len > MAX_CONTEXT_CHARS {
            break;
        }
        total_chars += item_len;
        selected.push(item);
    }

    Ok(selected)
}

fn tokenize(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| token.chars().count() > 1)
        .filter(|token| !STOP_WORDS.contains(token))
        .map(ToOwned::to_owned)
        .collect()
}

fn score_item(question_tokens: &[String], item: &ClipboardItem) -> f64 {
    if question_tokens.is_empty() {
        return 0.0;
    }
    let searchable = match &item.preview {
        Some(preview) => format!("{preview} {}", item.content),
        None => item.content.clone(),
    };
    let item_tokens = tokenize(&searchable).into_iter().collect::<HashSet<_>>();
    let question_set = question_tokens.iter().cloned().collect::<HashSet<_>>();
    let overlap = question_set.intersection(&item_tokens).count();
    if overlap == 0 {
        return 0.0;
    }
    overlap as f64 / question_set.len() as f64
}

fn build_prompt(question: &str, context: &[QaContextItem]) -> String {
    let mut prompt = String::from(
        "You are Klip, a local clipboard assistant. Answer using ONLY the clipboard context below. If the answer is not present, say that the clipboard history does not contain it.\n\n",
    );

    if context.is_empty() {
        prompt.push_str("Clipboard context: no relevant clipboard items were found.\n\n");
    } else {
        prompt.push_str("Clipboard context:\n");
        for (index, item) in context.iter().enumerate() {
            prompt.push_str(&format!(
                "[Clipboard item {} | id={} | relevance={:.2}]\n{}\n\n",
                index + 1,
                item.id,
                item.score,
                item.content
            ));
        }
    }

    prompt.push_str("Question:\n");
    prompt.push_str(question);
    prompt.push_str("\n\nAnswer:");
    prompt
}

const STOP_WORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "has",
    "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "our", "the", "this", "to",
    "was", "we", "what", "when", "where", "which", "who", "why", "with", "you", "your",
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::types::{ContentType, NewClipboardItem};
    use crate::llm::{FakeProvider, LlmConfig};
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};

    fn test_db() -> crate::Database {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .unwrap();
        let db = crate::Database::from_conn(conn);
        db.init_schema().unwrap();
        db
    }

    fn insert_item(db: &crate::Database, content_type: ContentType, content: &str) {
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let item = NewClipboardItem {
            content_type,
            data: content.as_bytes().to_vec(),
            preview: Some(content.chars().take(80).collect()),
            hash,
            size: content.len() as i64,
            metadata: None,
            formats: Vec::new(),
        };
        crate::database::clipboard::insert(db, &item).unwrap();
    }

    #[tokio::test]
    async fn answer_question_sends_relevant_clipboard_text_to_provider() {
        let db = test_db();
        insert_item(&db, ContentType::Text, "deploy token is klip-secret-123");
        insert_item(&db, ContentType::Text, "shopping list milk eggs");

        let provider = FakeProvider::new(LlmConfig::fake_for_tests());
        let answer = answer_question(
            &db,
            "what is the deploy token?",
            &provider,
            &LlmConfig::fake_for_tests(),
        )
        .await
        .unwrap();

        let prompt = provider.last_prompt().unwrap();
        assert!(prompt.contains("klip-secret-123"));
        assert!(prompt.contains("what is the deploy token?"));
        assert_eq!(answer.provider, "fake");
        assert_eq!(answer.context_count, 1);
        assert!(!serde_json::to_value(&answer)
            .unwrap()
            .to_string()
            .contains("prompt"));
    }

    #[tokio::test]
    async fn answer_question_excludes_image_and_file_payloads_from_context() {
        let db = test_db();
        insert_item(&db, ContentType::Image, "data:image/png;base64,AAAAsecret");
        insert_item(&db, ContentType::File, r#"["C:\\secret.txt"]"#);
        insert_item(&db, ContentType::Text, "deployment window is friday");

        let provider = FakeProvider::new(LlmConfig::fake_for_tests());
        let answer = answer_question(&db, "deployment?", &provider, &LlmConfig::fake_for_tests())
            .await
            .unwrap();

        let prompt = provider.last_prompt().unwrap();
        assert!(prompt.contains("deployment window is friday"));
        assert!(!prompt.contains("AAAAsecret"));
        assert!(!prompt.contains("secret.txt"));
        assert_eq!(answer.context_count, 1);
    }

    #[tokio::test]
    async fn answer_question_rejects_empty_question() {
        let db = test_db();
        let provider = FakeProvider::new(LlmConfig::fake_for_tests());

        let result = answer_question(&db, "   ", &provider, &LlmConfig::fake_for_tests()).await;

        assert!(result.is_err());
    }
}

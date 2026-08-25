use serde::Serialize;
use tokio::sync::broadcast;

const BROADCAST_CAPACITY: usize = 256;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "kebab-case")]
pub enum ServerEvent {
    ClipboardUpdated(serde_json::Value),
    ClipboardCleared,
    ConfigChanged {
        key: String,
        value: String,
    },
    /// An existing item changed (e.g. OCR finished) — the payload is the
    /// refreshed `ClipboardItem`.
    ClipboardItemUpdated(serde_json::Value),
}

impl ServerEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::ClipboardUpdated(_) => "clipboard-updated",
            Self::ClipboardCleared => "clipboard-cleared",
            Self::ConfigChanged { .. } => "config-changed",
            Self::ClipboardItemUpdated(_) => "clipboard-item-updated",
        }
    }
}

#[derive(Debug, Clone)]
pub struct EventBroadcaster {
    tx: broadcast::Sender<ServerEvent>,
}

impl EventBroadcaster {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self { tx }
    }

    pub fn send(&self, event: ServerEvent) {
        let _ = self.tx.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<ServerEvent> {
        self.tx.subscribe()
    }
}

impl Default for EventBroadcaster {
    fn default() -> Self {
        Self::new()
    }
}

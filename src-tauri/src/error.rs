use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Database(String),

    #[error("{0}")]
    Clipboard(String),

    #[error("{0}")]
    Hotkey(String),

    #[error("{0}")]
    InvalidInput(String),

    #[error("{0}")]
    Window(String),

    #[error("{0}")]
    System(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl AppError {
    fn code(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "not_found",
            Self::Database(_) => "database",
            Self::Clipboard(_) => "clipboard",
            Self::Hotkey(_) => "hotkey",
            Self::InvalidInput(_) => "invalid_input",
            Self::Window(_) => "window",
            Self::System(_) => "system",
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Database(e.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::System(s)
    }
}

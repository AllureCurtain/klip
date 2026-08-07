use std::sync::RwLock;

use crate::AppError;

pub const MAX_VISIBLE_CLIPBOARD_ITEMS: usize = 9;

#[derive(Debug, PartialEq, Eq)]
pub enum VisibleItemAtPosition {
    Uninitialized,
    Id(i64),
    Missing,
}

#[derive(Debug, Default)]
pub struct VisibleClipboardItems {
    items: RwLock<Option<Vec<i64>>>,
}

impl VisibleClipboardItems {
    pub fn set(&self, mut ids: Vec<i64>) -> Result<(), AppError> {
        if ids.iter().any(|id| *id <= 0) {
            return Err(AppError::InvalidInput(
                "visible clipboard item ids must be positive".to_string(),
            ));
        }
        ids.truncate(MAX_VISIBLE_CLIPBOARD_ITEMS);
        *self.write_items()? = Some(ids);
        Ok(())
    }

    pub fn snapshot(&self) -> Result<Option<Vec<i64>>, AppError> {
        Ok(self.read_items()?.clone())
    }

    pub fn resolve(&self, position: i64) -> Result<VisibleItemAtPosition, AppError> {
        let offset = position_offset(position)?;
        match self.read_items()?.as_ref() {
            None => Ok(VisibleItemAtPosition::Uninitialized),
            Some(ids) => Ok(ids
                .get(offset)
                .copied()
                .map(VisibleItemAtPosition::Id)
                .unwrap_or(VisibleItemAtPosition::Missing)),
        }
    }

    fn read_items(&self) -> Result<std::sync::RwLockReadGuard<'_, Option<Vec<i64>>>, AppError> {
        self.items.read().map_err(|_| {
            AppError::System("visible clipboard items read lock was poisoned".to_string())
        })
    }

    fn write_items(&self) -> Result<std::sync::RwLockWriteGuard<'_, Option<Vec<i64>>>, AppError> {
        self.items.write().map_err(|_| {
            AppError::System("visible clipboard items write lock was poisoned".to_string())
        })
    }
}

pub(crate) fn position_offset(position: i64) -> Result<usize, AppError> {
    if (1..=MAX_VISIBLE_CLIPBOARD_ITEMS as i64).contains(&position) {
        Ok((position - 1) as usize)
    } else {
        Err(AppError::InvalidInput(format!(
            "quick paste index {} must be between 1 and {}",
            position, MAX_VISIBLE_CLIPBOARD_ITEMS
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_uninitialized_empty_and_populated_snapshots() {
        let visible_items = VisibleClipboardItems::default();
        assert_eq!(visible_items.snapshot().unwrap(), None);
        assert_eq!(
            visible_items.resolve(1).unwrap(),
            VisibleItemAtPosition::Uninitialized
        );

        visible_items.set(Vec::new()).unwrap();
        assert_eq!(visible_items.snapshot().unwrap(), Some(Vec::new()));
        assert_eq!(
            visible_items.resolve(1).unwrap(),
            VisibleItemAtPosition::Missing
        );

        visible_items.set(vec![41, 17]).unwrap();
        assert_eq!(
            visible_items.resolve(1).unwrap(),
            VisibleItemAtPosition::Id(41)
        );
        assert_eq!(
            visible_items.resolve(2).unwrap(),
            VisibleItemAtPosition::Id(17)
        );
    }

    #[test]
    fn bounds_snapshot_and_position_to_nine_items() {
        let visible_items = VisibleClipboardItems::default();
        visible_items.set((1..=12).collect()).unwrap();

        assert_eq!(
            visible_items.snapshot().unwrap().unwrap(),
            (1..=9).collect::<Vec<_>>()
        );
        assert_eq!(
            visible_items.resolve(9).unwrap(),
            VisibleItemAtPosition::Id(9)
        );
        assert!(visible_items.resolve(0).is_err());
        assert!(visible_items.resolve(10).is_err());
    }

    #[test]
    fn rejects_invalid_database_ids() {
        let visible_items = VisibleClipboardItems::default();

        assert!(matches!(
            visible_items.set(vec![1, 0]),
            Err(AppError::InvalidInput(_))
        ));
        assert_eq!(visible_items.snapshot().unwrap(), None);
    }
}

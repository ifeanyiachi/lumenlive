//! Shared test helpers for the api crate (compiled only under `cfg(test)`).

use std::sync::Mutex;

use crate::{CommandError, CommandSink};

/// A [`CommandSink`] that records every emitted event and backend action as a
/// flat list of names, for assertions in the HTTP and OSC listener tests. Both
/// listeners only need to count/inspect dispatched command names, so they share
/// this one recorder instead of each defining an identical mock.
pub(crate) struct RecordingSink {
    commands: Mutex<Vec<String>>,
}

impl RecordingSink {
    pub(crate) fn new() -> Self {
        Self {
            commands: Mutex::new(Vec::new()),
        }
    }

    pub(crate) fn command_count(&self) -> usize {
        self.commands.lock().unwrap().len()
    }
}

impl CommandSink for RecordingSink {
    fn emit_event(&self, event: &str, _payload: &str) -> Result<(), CommandError> {
        self.commands.lock().unwrap().push(event.to_string());
        Ok(())
    }

    fn invoke_backend(&self, action: &str, _args: &str) -> Result<(), CommandError> {
        self.commands.lock().unwrap().push(action.to_string());
        Ok(())
    }
}

//! Ring buffer of recently seen `eventId`s (docs/technology.md §7.2).
//! Replays after reconnect must not produce duplicate UI events.

use std::collections::{HashSet, VecDeque};

pub struct Dedupe {
    order: VecDeque<String>,
    seen: HashSet<String>,
    capacity: usize,
}

impl Dedupe {
    pub fn new(capacity: usize) -> Self {
        Self { order: VecDeque::with_capacity(capacity), seen: HashSet::with_capacity(capacity), capacity }
    }

    /// Returns `true` the first time an id is seen.
    pub fn insert(&mut self, id: &str) -> bool {
        if self.seen.contains(id) {
            return false;
        }
        if self.order.len() == self.capacity {
            if let Some(old) = self.order.pop_front() {
                self.seen.remove(&old);
            }
        }
        self.order.push_back(id.to_owned());
        self.seen.insert(id.to_owned());
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_sighting_is_new_and_repeats_are_not() {
        let mut d = Dedupe::new(3);
        assert!(d.insert("a"));
        assert!(!d.insert("a"));
        assert!(d.insert("b"));
    }

    #[test]
    fn evicts_oldest_when_full() {
        let mut d = Dedupe::new(2);
        d.insert("a");
        d.insert("b");
        d.insert("c");
        assert!(d.insert("a"), "a was evicted and counts as new again");
        assert!(!d.insert("c"));
    }
}

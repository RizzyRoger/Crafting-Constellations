# Lessons

- **Spec docs can carry stale template sections.** The Crafting Constellations PDF mixed a "/compute" (AI for students) template with the real mental-health product. Before planning from a doc, skim for sections that contradict the rest and confirm which parts are current. (2026-10-10, corrected by user: "do the mental health one and ignore ai")
- **Firestore listeners must not open before rules can pass.** An optimistic local write (e.g. joining a group) can mount member-only listeners before the server has the membership; the rejected listen tripped an SDK assertion. Gate on `snapshot.metadata.hasPendingWrites === false`.
- **Counter triggers must `update`, never `set` with merge.** A late delete-trigger otherwise resurrects removed parents with negative counts.

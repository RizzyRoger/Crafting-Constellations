# Lessons

- **Spec docs can carry stale template sections.** The Crafting Constellations PDF mixed a "/compute" (AI for students) template with the real mental-health product. Before planning from a doc, skim for sections that contradict the rest and confirm which parts are current. (2026-10-10, corrected by user: "do the mental health one and ignore ai")
- **Firestore listeners must not open before rules can pass.** An optimistic local write (e.g. joining a group) can mount member-only listeners before the server has the membership; the rejected listen tripped an SDK assertion. Gate on `snapshot.metadata.hasPendingWrites === false`.
- **Counter triggers must `update`, never `set` with merge.** A late delete-trigger otherwise resurrects removed parents with negative counts.
- **Ask for the symptom when a bug report is vague.** "There's a problem with reaching out" was really "the recipient couldn't click Accept". I fixed a real but different bug first. Ask what the person saw (which screen, which button, what happened) before choosing a root cause. (2026-10-10, corrected by user)
- **A disabled control needs its reason next to it.** Accept was greyed out for unconfirmed emails with no explanation, so it read as broken. When a rule gates an action, show the reason and the way through, not a silent `disabled`.
- **Check whether a gating relation is symmetric.** "A friend's friend can't reach out; they connect with you first" holds for both people, so neither could ever connect. Before blocking A from acting on B, check what B sees.

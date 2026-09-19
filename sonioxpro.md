# Soniox Transcription Solutions

## P0 — Stop incorrect screen changes

1. Disable automatic Reading Mode advancement based only on word overlap.
2. Require either:
   - an explicit command such as “next verse”, “continue reading”, or “verse 8”; or
   - two consecutive high-confidence matches to the next verse text.
3. Clear the accumulated Reading Mode transcript after every finalized utterance. Do not compare unrelated sermon sentences as one passage.
4. Pause Reading Mode whenever the operator manually selects or presents a verse. Resume only when explicitly enabled.

## P1 — Fix false direct detections

1. Bind each chapter/verse to the nearest explicitly spoken book name.
2. Clear stale book/chapter context when a new full reference is spoken.
3. Deduplicate identical direct detections from the same transcript.
4. Exclude `narrative_mention` results from:
   - auto-preview,
   - auto-queue,
   - live output,
   - automatic selection changes.
5. Only auto-display one unique, finalized direct reference. Multiple references must remain panel-only until manually selected.

## P1 — Protect manual presentation

1. Add a manual-presentation lock or cooldown.
2. While active, semantic detections and Reading Mode events must not replace the manually presented verse.
3. Only an explicit operator action or confirmed direct reference should end the lock.

## P2 — Provider validation

1. Capture Soniox raw frames and verify the `<end>` marker.
2. Confirm Soniox final tokens are delta-based, not cumulative.
3. Compare Soniox and Deepgram confidence distributions.
4. Keep provider-specific endpoint handling separate; both providers should use the same safe detection and output guards.

## Required regression tests

The following phrases must not change the displayed verse unexpectedly:

- “Ecclesiastes 9:11” must not produce Isaiah 9:11.
- “Number one… 12 months” must not advance Acts 1:6.
- A list of names must not advance Acts 1:7.
- John 15:4 must not later change to Acts 1:8.
- “continued” or “continue” inside normal sermon text must not trigger navigation.

# Phase 4: Discussion Refinement

**Type:** Prompt engineering & UX research (not software development)

## Goal

Refine discussion quality through 400 sessions of usage, observation, and prompt iteration. By the end:
- Socratic tutor prompts produce consistently high-quality discussions
- Discussions feel natural, concise, and information-dense (5-10 min sessions)
- AI response style matches daily-engagement UX (not marathon sessions)
- Evaluation and point-transition flows feel smooth
- 50 diverse recall sets exist across conceptual, procedural, creative, and affirmation content
- Prompt changes are refinements, not overhauls (stability reached)

## Approach

400 sessions in 20 rounds of 20. Each round:
- **10 deep-dive** (5 motivation + 5 ATP) for depth on familiar material
- **10 diverse** (rotating through 50 sets, 4 sessions each) for breadth

After each round: review notes, identify patterns, apply 1-3 prompt changes.

### Prompt files to iterate on

| File | Focus |
|------|-------|
| `src/llm/prompts/socratic-tutor.ts` | Tone, length, questioning style |
| `src/llm/prompts/recall-evaluator.ts` | Accuracy, confidence calibration |
| `src/llm/prompts/rabbithole-detector.ts` | Sensitivity, depth classification |
| Recall set `discussionSystemPrompt` | Per-set domain guidance |

### Iteration heuristics

- **Too long?** Add length guidance, reduce follow-ups, move on after initial recall
- **Too robotic?** Reduce list-format, add conversational transitions, allow natural flow
- **Evaluation off?** Adjust thresholds, refine "demonstrated understanding", add examples
- **Affirmation-style fails?** May need separate prompt template or conditional behavior

## Success Criteria

- [ ] 200 deep-dive sessions completed (100 motivation + 100 ATP)
- [ ] 200 diverse sessions completed (50 sets x 4)
- [ ] 20 prompt iteration cycles documented
- [ ] Discussions consistently feel concise, natural, appropriately challenging
- [ ] Affirmation-style sets work (or documented as needing different approach)
- [ ] Prompts are stable

## Files

| File | Purpose |
|------|---------|
| `diverse-sets-list.md` | The 50 recall sets with points |
| `schedule/` | 20 round files (round-01.md → round-20.md) as checklists with notes |

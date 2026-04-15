# Check submodule adapter and skill compatibility

## Goal
Verify whether the recent OpenSpec and Trellis submodule updates require changes in Transpec adapters or built-in preprocess/postprocess skill assets.

## Requirements
- Compare the updated submodule content against the current Transpec OpenSpec and Trellis adapters.
- Compare the updated submodule skill and workflow expectations against Transpec preprocess-skills and postprocess-skills.
- Update Transpec code or bundled skill assets if incompatibilities are found.
- Preserve existing runtime contracts unless upstream changes require explicit adaptation.

## Acceptance Criteria
- [ ] Relevant upstream changes in OpenSpec and Trellis are identified.
- [ ] Adapter compatibility impact is evaluated for `openspec` and `trellis`.
- [ ] Skill asset compatibility impact is evaluated for preprocess and postprocess flows.
- [ ] Required code or asset updates are implemented and validated.

## Technical Notes
- Focus area is `packages/cli/src/core/framework/` and `packages/cli/src/core/skill/`.
- This task may involve cross-layer runtime contract checks between built-in assets, generated project-local assets, and CLI orchestration.

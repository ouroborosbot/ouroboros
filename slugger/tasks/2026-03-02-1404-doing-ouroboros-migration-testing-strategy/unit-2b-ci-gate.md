# Unit 2b CI Gate

## Workflow Added
- Path: `.github/workflows/coverage.yml`
- Job: `coverage`
- Trigger: `pull_request` and `push` to `main`
- Gate command: `npm run test:coverage`

## Local Validation
- `npm test`: pass
- `npm run build`: pass

## Expected CI Behavior
- PRs run coverage gate automatically and fail if coverage thresholds are not met.
- Pushes to `main` run the same gate for branch protection parity.

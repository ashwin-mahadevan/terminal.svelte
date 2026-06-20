## Mise

This project uses `mise` for managing the environment and running tasks.

## Code Quality

After every change, before committing:

1. Run `pnpm eslint --fix .`
2. Run `pnpm prettier --write .`
3. Run `mise tests` to ensure correct behavior.
4. Run `mise checks` to ensure correct style.

Only commit once all pass. ESLint must run before Prettier — ESLint reorders imports, and Prettier must run on top of those changes or `mise checks` will fail on formatting.

Commit atomically: one commit per logical unit of change, not batched at the end.
# terminal.svelte

An open-source (MIT) Svelte 5 streaming terminal emulator library, maintained by
Ashwin Mahadevan and published to npm as `terminal.svelte`.

**This repo is public.** Everything committed here, including commit messages,
issues and PRs, is visible to anyone. Never bring in code or details from the
private XTerm.app repo, even though it uses this library.

## Tooling

`mise` pins node and pnpm and runs every task (`mise tasks` lists them).

## Code Quality

After every change, before committing:

1. Run `pnpm eslint --fix .`
2. Run `pnpm prettier --write .`
3. Run `mise tests` to ensure correct behavior.
4. Run `mise checks` to ensure correct style.

Only commit once all pass. ESLint must run before Prettier — ESLint reorders imports, and Prettier must run on top of those changes or `mise checks` will fail on formatting.

Commit frequently as you work.

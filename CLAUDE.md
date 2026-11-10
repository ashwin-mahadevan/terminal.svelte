# terminal.svelte

An open-source (MIT) Svelte 5 streaming terminal emulator library, maintained by
Ashwin Mahadevan and published to npm as `terminal.svelte`.

**This repo is public.** Everything committed here, including commit messages,
issues and PRs, is visible to anyone. Never bring in code or details from the
private XTerm.app repo, even though it uses this library.

## Tooling

`mise` pins node and pnpm and runs every task (`mise tasks` lists them).

## Releases

To release, bump `version` in `package.json` in your PR. On every push to
`master`, `.github/workflows/publish.yml` checks whether that version is on npm
yet. If it isn't, it runs the full `checks.yml` suite and, only if everything
passes, publishes to npm (trusted publishing) and creates a `v<version>` GitHub
release. Prerelease versions go to the `next` dist-tag. PRs run `checks.yml`
too.

## Code Quality

After every change, before committing:

1. Run `pnpm eslint --fix .`
2. Run `pnpm prettier --write .`
3. Run `mise tests` to ensure correct behavior.
4. Run `mise checks` to ensure correct style.

Only commit once all pass. ESLint must run before Prettier — ESLint reorders imports, and Prettier must run on top of those changes or `mise checks` will fail on formatting.

Commit frequently as you work.

# terminal.svelte

An open-source (MIT) Svelte 5 streaming terminal emulator library, maintained by
Ashwin Mahadevan and published to npm as `terminal.svelte`.

**This repo is public.** Everything committed here, including commit messages,
issues and PRs, is visible to anyone. Never bring in code or details from the
private XTerm.app repo, even though it uses this library.

## Tooling

`mise` pins node and pnpm and runs every task (`mise tasks` lists them).

## Releases

Merging into `master` is the only way to publish. To release, a change bumps
`version` in `package.json`. A merge that doesn't bump the version publishes
nothing.

Nothing runs `./release.sh` by itself: whoever merges runs it from the merged
commit, right after the merge. It publishes a version that isn't out yet to npm
and creates its `v<version>` GitHub release, by starting
`.github/workflows/publish.yml`. Prerelease versions go to the `next` dist-tag.

Nobody else runs `./release.sh`, and nobody runs `npm publish` or
`gh release create`, or starts the publish workflow, by hand.

## Code Quality

After every change, before committing:

1. Run `pnpm eslint --fix .`
2. Run `pnpm prettier --write .`
3. Run `mise tests` to ensure correct behavior.
4. Run `mise checks` to ensure correct style.

Only commit once all pass. ESLint must run before Prettier — ESLint reorders imports, and Prettier must run on top of those changes or `mise checks` will fail on formatting.

Commit frequently as you work.

`./checks.sh` runs every check and test, one at a time. Run it before a change
is merged: it must pass. No GitHub workflow checks a change.

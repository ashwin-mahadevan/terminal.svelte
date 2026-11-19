# terminal.svelte

An open-source (MIT) Svelte 5 streaming terminal emulator library, maintained by
Ashwin Mahadevan and published to npm as `terminal.svelte`.

**This repo is public.** Everything committed here, including commit messages,
issues and PRs, is visible to anyone. Never bring in code or details from the
private XTerm.app repo, even though it uses this library.

## Tooling

`mise` pins node and pnpm and runs every task (`mise tasks` lists them).

## Releases

Merging a PR into `master` is the only way to publish. To release, bump
`version` in `package.json` in your PR. A merge that doesn't bump the version
publishes nothing.

PRs are reviewed, checked and merged by the maintainer's merge queue. After a
merge it runs `./release.sh`, which publishes a version that isn't out yet to
npm and creates its `v<version>` GitHub release, by starting
`.github/workflows/publish.yml`. Prerelease versions go to the `next` dist-tag.

Never run `npm publish`, `./release.sh` or `gh release create` yourself, and
never start the publish workflow.

## Code Quality

After every change, before committing:

1. Run `pnpm eslint --fix .`
2. Run `pnpm prettier --write .`
3. Run `mise tests` to ensure correct behavior.
4. Run `mise checks` to ensure correct style.

Only commit once all pass. ESLint must run before Prettier — ESLint reorders imports, and Prettier must run on top of those changes or `mise checks` will fail on formatting.

Commit frequently as you work.

Before opening a PR, run `./checks.sh`. It runs every check and test, one at a
time, and must pass. No workflow checks a PR.

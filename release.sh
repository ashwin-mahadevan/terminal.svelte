#!/usr/bin/env bash
# Releases the version in package.json, if it isn't out yet. Nothing runs this
# by itself: whoever merges a change into master runs it from the merged
# commit, right after the merge. Nobody else runs it.
#
# A version is out when it is on npm and GitHub has its `v<version>` tag, which
# is made together with its GitHub release. If it is out, this starts nothing.
# Otherwise it starts .github/workflows/publish.yml for the commit it is run
# from, waits for that run, and prints what was released. The workflow does
# only what is missing, so running this again finishes a release that failed
# partway: a version that is on npm but has no tag yet.
#
# This never publishes by itself. npm trusts only that workflow to publish, so
# no npm token is needed here: only `gh`, signed in to an account that may
# start workflows in this repo, and the tools in mise.toml.

set -euo pipefail
cd "$(dirname "$0")"

die() {
	echo "release.sh: $*" >&2
	exit 1
}

name="$(node -p "require('./package.json').name")"
version="$(node -p "require('./package.json').version")"
id="$name@$version"
tag="v$version"
sha="$(git rev-parse HEAD)"
repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"

# Whether npm has this version. A lookup that fails for any other reason than
# "no such version" stops the script, so that it is never read as "not out".
on_npm() {
	local out
	if out="$(npm view "$id" version --json 2>/dev/null)"; then
		[[ "$out" == "\"$version\"" ]]
		return
	fi
	[[ "$out" == *'"E404"'* ]] || die "couldn't ask npm about $id: $out"
	return 1
}

# Whether GitHub has this version's tag, with the same care.
tagged() {
	local out
	if out="$(gh api "repos/$repo/git/ref/tags/$tag" --jq .ref 2>&1)"; then
		return 0
	fi
	[[ "$out" == *'HTTP 404'* ]] || die "couldn't ask GitHub about the tag $tag: $out"
	return 1
}

if on_npm; then
	if tagged; then
		echo "$id is on npm and tagged $tag: nothing to release."
		exit 0
	fi
	echo "$id is on npm but has no $tag tag: finishing its release."
else
	echo "$id is not on npm: releasing it."
fi

# The newest publish run so far. The run started below is a later one.
before="$(gh run list --repo "$repo" --workflow publish.yml --limit 1 \
	--json databaseId --jq '.[0].databaseId // 0')"

# The workflow file that runs is master's. It publishes the commit it's given.
gh workflow run publish.yml --repo "$repo" --ref master -f "sha=$sha"

# The workflow names its run after the commit, which is how to find it.
run=
for ((try = 0; try < 30; try++)); do
	sleep 2
	run="$(gh run list --repo "$repo" --workflow publish.yml --event workflow_dispatch --limit 10 \
		--json databaseId,displayTitle \
		--jq "[.[] | select(.databaseId > $before and .displayTitle == \"Publish $sha\")][0].databaseId // empty")"
	if [[ -n "$run" ]]; then break; fi
done
[[ -n "$run" ]] || die "started publish.yml for $sha, but found no run of it. Look at the repo's Actions page before running this again."

url="https://github.com/$repo/actions/runs/$run"
echo "Waiting for $url"
if ! gh run watch "$run" --repo "$repo" --exit-status --interval 10 >/dev/null; then
	gh run view "$run" --repo "$repo" --log-failed 2>/dev/null | tail -n 40 >&2 || true
	die "the publish run for $id failed: $url"
fi

tagged || die "the publish run passed, but GitHub has no $tag tag: $url"
echo "Released $id"

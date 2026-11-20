#!/usr/bin/env bash
# Runs every check this repo has: the build, the format, lint and type checks,
# the unit tests, and the DOM and browser tests in each browser. Run it before
# a change is merged into master: it must pass. No GitHub workflow checks a
# change.
#
# It needs the tools in mise.toml (`mise install`). The mise tasks install the
# dependencies and the browsers themselves.
#
# The checks run one at a time, because they clean shared folders and the
# browser tests use fixed ports. A check that fails doesn't stop the rest. The
# output ends with one line for each check, and the exit status is non-zero if
# any of them failed.

set -u
cd "$(dirname "$0")"

tasks=(build check:format check:lint check:types test:unit)
for browser in chromium firefox webkit; do
	tasks+=("test:dom:$browser" "test:browser:$browser")
done

results=()
failed=0
for task in "${tasks[@]}"; do
	printf '\n==> mise run %s\n' "$task"
	if mise run "$task"; then
		results+=("passed  mise run $task")
	else
		results+=("FAILED  mise run $task")
		failed=1
	fi
done

printf '\n'
printf '%s\n' "${results[@]}"
exit "$failed"

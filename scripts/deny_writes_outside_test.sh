#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
TOOL_NAME="$(echo "$INPUT" | jq -r '.toolName')"
TOOL_ARGS_RAW="$(echo "$INPUT" | jq -r '.toolArgs')"

# toolArgs is a JSON string; decode it
TOOL_ARGS="$(echo "$TOOL_ARGS_RAW" | jq -r '.')"

# Block edits/creates outside test/
if [[ "$TOOL_NAME" == "edit" || "$TOOL_NAME" == "create" ]]; then
  PATH_ARG="$(echo "$TOOL_ARGS" | jq -r '.path // empty')"
  if [[ -n "$PATH_ARG" && ! "$PATH_ARG" =~ ^test/ ]]; then
    echo '{"permissionDecision":"deny","permissionDecisionReason":"Policy: only /test is writable"}'
    exit 0
  fi
fi

# allow by default
echo '{"permissionDecision":"allow"}'

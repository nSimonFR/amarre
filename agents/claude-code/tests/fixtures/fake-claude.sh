#!/usr/bin/env bash
# Stand-in for the real `claude -p --input-format stream-json --output-format
# stream-json` binary. Used by agents/claude-code/adapter.test.ts so the
# wrapped-child translator can be exercised end-to-end without hitting
# Anthropic. Behaviour is keyed off the FIRST stdin line:
#
#   {"type":"user", ... "text":"PING" ...}    ⇒ standard turn:
#       system{init} → assistant{text:"PONG"} → result{success}
#
#   {"type":"user", ... "text":"TOOL" ...}    ⇒ tool-use turn:
#       system{init} → assistant{tool_use Bash} → user{tool_result} →
#       assistant{text:"done"} → result{success}
#
#   {"type":"user", ... "text":"WAIT" ...}    ⇒ never emit a result
#       system{init}, then idle (lets tests exercise abort path).
#       Receiving control_request{interrupt} causes us to emit result{error}.
#
# Subsequent stdin lines after the first turn's `result` are echoed as a
# second turn (system+assistant+result) with the input text prefixed by "echo:".
# The script always reads stdin line-by-line and exits on EOF.
set -u

emit() { printf '%s\n' "$1"; }

handle_first() {
  local line="$1"
  case "$line" in
    *'"PING"'*)
      emit '{"type":"system","subtype":"init","session_id":"fake-001"}'
      emit '{"type":"assistant","message":{"role":"assistant","model":"fake","content":[{"type":"text","text":"PONG"}]}}'
      emit '{"type":"result","subtype":"success","is_error":false,"result":"PONG","session_id":"fake-001"}'
      ;;
    *'"TOOL"'*)
      emit '{"type":"system","subtype":"init","session_id":"fake-002"}'
      emit '{"type":"assistant","message":{"role":"assistant","model":"fake","content":[{"type":"tool_use","id":"tu_1","name":"Bash","input":{"command":"echo hi"}}]}}'
      emit '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tu_1","content":"hi","is_error":false}]}}'
      emit '{"type":"assistant","message":{"role":"assistant","model":"fake","content":[{"type":"text","text":"done"}]}}'
      emit '{"type":"result","subtype":"success","is_error":false,"result":"done","session_id":"fake-002"}'
      ;;
    *'"WAIT"'*)
      emit '{"type":"system","subtype":"init","session_id":"fake-003"}'
      ;;
    *)
      emit '{"type":"system","subtype":"init","session_id":"fake-fallback"}'
      emit '{"type":"assistant","message":{"role":"assistant","model":"fake","content":[{"type":"text","text":"ack"}]}}'
      emit '{"type":"result","subtype":"success","is_error":false,"result":"ack","session_id":"fake-fallback"}'
      ;;
  esac
}

handle_followup() {
  local line="$1"
  case "$line" in
    *'"control_request"'*'"interrupt"'*)
      emit '{"type":"result","subtype":"error","is_error":true,"result":"interrupted","session_id":"fake-003"}'
      ;;
    *)
      # Generic follow-up echo turn
      local text
      text=$(printf '%s' "$line" | sed -E 's/.*"text":"([^"]*)".*/\1/')
      emit '{"type":"system","subtype":"init","session_id":"fake-001"}'
      emit "{\"type\":\"assistant\",\"message\":{\"role\":\"assistant\",\"model\":\"fake\",\"content\":[{\"type\":\"text\",\"text\":\"echo:${text}\"}]}}"
      emit '{"type":"result","subtype":"success","is_error":false,"result":"echo","session_id":"fake-001"}'
      ;;
  esac
}

first=1
while IFS= read -r line; do
  if [ "$first" -eq 1 ]; then
    first=0
    handle_first "$line"
  else
    handle_followup "$line"
  fi
done

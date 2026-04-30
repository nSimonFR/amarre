#!/usr/bin/env bash
# Generic stand-in agent for amarre server tests. Echoes each stdin JSONL
# line back on stdout, with special control codes for testing edge cases:
#   {"_emit":"chunk"}              -> emits two events in a single stdout write
#   {"_emit":"split"}              -> emits one event split across two writes (partial line)
#   {"_emit":"die"}                -> exit 7 immediately (tests server-restart-on-crash)
#   {"_emit":"ui_req","reqId":"X"} -> emits an extension_ui_request with id X
#                                     (used by push-notification tests)
# Otherwise wraps the input as {"type":"response","success":true,"echo":<line>}.
set -u
while IFS= read -r line; do
  case "$line" in
    *'"_emit":"chunk"'*)
      printf '%s\n%s\n' '{"type":"event","n":1}' '{"type":"event","n":2}'
      ;;
    *'"_emit":"split"'*)
      printf '%s' '{"type":"split","part":"o'
      sleep 0.05
      printf '%s\n' 'ne"}'
      ;;
    *'"_emit":"die"'*)
      exit 7
      ;;
    *'"_emit":"ui_req"'*)
      rest="${line#*\"reqId\":\"}"
      rid="${rest%%\"*}"
      printf '{"type":"extension_ui_request","id":"%s","method":"confirm","title":"Run bash?","message":"ls /tmp"}\n' "$rid"
      ;;
    *)
      printf '{"type":"response","success":true,"echo":%s}\n' "$line"
      ;;
  esac
done

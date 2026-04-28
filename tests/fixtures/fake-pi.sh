#!/usr/bin/env bash
# Stand-in for `pi --mode rpc` in bridge tests. Echoes each stdin line back
# as a fake response on stdout. Triggers special outputs based on the line:
#   {"_emit":"chunk"}      -> emits two events as one stdout chunk
#   {"_emit":"split"}      -> emits one event in two writes (partial line)
#   {"_emit":"die"}        -> exit 7 immediately
# Otherwise echoes a generic response object.
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
    *)
      printf '{"type":"response","success":true,"echo":%s}\n' "$line"
      ;;
  esac
done

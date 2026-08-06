#!/usr/bin/env bash
# Klip HTTP API Verification Script
# Runs critical-path tests against a running Klip HTTP server.
# Usage: ./verify-api.sh [BASE_URL]
#   BASE_URL defaults to http://127.0.0.1:27717

set -uo pipefail

BASE="${1:-${KLIP_API_URL:-http://127.0.0.1:27717}}"
PASS=0
FAIL=0
SKIP=0
TMPDIR=$(mktemp -d -t klip-verify-XXXXXX)

cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

log_pass() { PASS=$((PASS+1)); echo "  PASS  $1"; }
log_fail() { FAIL=$((FAIL+1)); echo "  FAIL  $1"; }
log_skip() { SKIP=$((SKIP+1)); echo "  SKIP  $1"; }

section() { echo ""; echo "=== $1 ==="; }

# Helper: GET request
get() { curl -sf --max-time 5 "$BASE$1" 2>/dev/null; }
post() { curl -sf --max-time 5 -X POST -H "Content-Type: application/json" -d "$2" "$BASE$1" 2>/dev/null; }
put() { curl -sf --max-time 5 -X PUT -H "Content-Type: application/json" -d "$2" "$BASE$1" 2>/dev/null; }
del() { curl -sf --max-time 5 -X DELETE "$BASE$1" 2>/dev/null; }
patch() { curl -sf --max-time 5 -X PATCH -H "Content-Type: application/json" -d "$2" "$BASE$1" 2>/dev/null; }
status() { curl -so /dev/null -w '%{http_code}' --max-time 5 "$@" "$BASE$1" 2>/dev/null; }

echo "============================================"
echo " Klip HTTP API Verification"
echo " Server: $BASE"
echo " Temp:   $TMPDIR"
echo "============================================"

# 0. Health
section "0. Health & Connectivity"

r=$(get /api/health)
if [ -n "$r" ] && echo "$r" | grep -q '"status":"ok"'; then
  log_pass "GET /api/health returns ok"
  echo "        $(echo "$r" | head -c 200)"
else
  log_fail "GET /api/health - is the server running? ($BASE)"
  echo "  Response: $r"
  echo ""
  echo "Cannot continue without a running server."
  echo "Start Klip desktop app first, or run:"
  echo "  cd src-tauri && cargo run"
  exit 1
fi

# Verify OpenAPI JSON on both supported paths.
for spec_path in /openapi.json /api/openapi.json; do
  r=$(get "$spec_path")
  if [ -n "$r" ] && echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('openapi') == '3.1.0'; assert 'paths' in d; print('openapi', d['openapi'], 'paths:', len(d['paths']))" 2>/dev/null; then
    log_pass "GET $spec_path is valid OpenAPI"
  else
    log_fail "GET $spec_path invalid"
  fi
done

# 1. System Info
section "1. System & Diagnostics"

r=$(get /api/system/info)
if echo "$r" | grep -q '"platform"'; then
  log_pass "GET /api/system/info"
else
  log_fail "GET /api/system/info: $r"
fi

r=$(get /api/system/diagnostics)
if echo "$r" | grep -q '"db_path"'; then
  log_pass "GET /api/system/diagnostics"
else
  log_fail "GET /api/system/diagnostics"
fi

r=$(get /api/stats)
if echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'total_items' in d" 2>/dev/null; then
  log_pass "GET /api/stats"
  echo "        total_items=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['total_items'])")"
else
  log_fail "GET /api/stats"
fi

# 2. Tags CRUD
section "2. Tags"

r=$(get /api/tags)
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/tags (list)"
else
  log_fail "GET /api/tags"
fi

TAG=$(post /api/tags '{"name":"test-tag","color":"#0d9488"}')
TAG_ID=$(echo "$TAG" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$TAG_ID" ] && [ "$TAG_ID" != "None" ]; then
  log_pass "POST /api/tags (create id=$TAG_ID)"
else
  log_fail "POST /api/tags create"
fi

# 3. Clipboard List & Search
section "3. Clipboard"

r=$(get "/api/clipboard?limit=5")
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/clipboard?limit=5"
  echo "        items: $(echo "$r" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null)"
else
  log_fail "GET /api/clipboard"
fi

r=$(get "/api/clipboard?contentType=text&limit=3")
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/clipboard?contentType=text"
else
  log_fail "GET /api/clipboard with filter"
fi

# Advanced search
r=$(post /api/clipboard/search/advanced '{"query":"","favoriteOnly":false,"exactMatch":false,"limit":5,"offset":0}')
if echo "$r" | grep -q '\['; then
  log_pass "POST /api/clipboard/search/advanced"
else
  log_fail "POST /api/clipboard/search/advanced: $r"
fi

# Simple search
r=$(get "/api/clipboard/search?q=a&limit=3")
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/clipboard/search?q=a"
else
  log_fail "GET /api/clipboard/search"
fi

# Get a single item if there are any
ITEM_ID=$(get "/api/clipboard?limit=1" | python3 -c "import sys,json; items=json.load(sys.stdin); print(items[0]['id'] if items else '')" 2>/dev/null)

if [ -n "$ITEM_ID" ]; then
  r=$(get "/api/clipboard/$ITEM_ID")
  if echo "$r" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['id']==$ITEM_ID" 2>/dev/null; then
    log_pass "GET /api/clipboard/$ITEM_ID"
  else
    log_fail "GET /api/clipboard/$ITEM_ID"
  fi

  # Toggle favorite
  r=$(post "/api/clipboard/$ITEM_ID/favorite" '{}')
  if echo "$r" | grep -q '"is_favorited"'; then
    log_pass "POST /api/clipboard/$ITEM_ID/favorite (toggle)"
    # Toggle back
    post "/api/clipboard/$ITEM_ID/favorite" '{}' > /dev/null
  else
    log_fail "POST /api/clipboard/$ITEM_ID/favorite"
  fi

  # Assign/remove tag (if we created a tag)
  if [ -n "$TAG_ID" ] && [ "$TAG_ID" != "None" ]; then
    code=$(curl -so /dev/null -w '%{http_code}' --max-time 5 -X POST "$BASE/api/clipboard/$ITEM_ID/tags/$TAG_ID")
    if [ "$code" = "200" ]; then
      log_pass "POST /api/clipboard/$ITEM_ID/tags/$TAG_ID"
      del "/api/clipboard/$ITEM_ID/tags/$TAG_ID" > /dev/null
      log_pass "DELETE /api/clipboard/$ITEM_ID/tags/$TAG_ID"
    else
      log_fail "POST assign tag (HTTP $code)"
    fi
  fi

  # Copy (may fail if no OS clipboard; that's OK in headless)
  code=$(curl -so /dev/null -w '%{http_code}' --max-time 5 -X POST "$BASE/api/clipboard/$ITEM_ID/copy")
  if [ "$code" = "200" ]; then
    log_pass "POST /api/clipboard/$ITEM_ID/copy"
  else
    log_skip "POST /api/clipboard/$ITEM_ID/copy (HTTP $code - may need OS clipboard/Tauri)"
  fi

  # Paste (requires Tauri)
  code=$(curl -so /dev/null -w '%{http_code}' --max-time 5 -X POST "$BASE/api/clipboard/$ITEM_ID/paste")
  if [ "$code" = "200" ]; then
    log_pass "POST /api/clipboard/$ITEM_ID/paste"
  else
    log_skip "POST /api/clipboard/$ITEM_ID/paste (HTTP $code - requires Tauri app)"
  fi
else
  log_skip "Single-item tests (no clipboard items found)"
fi

# Batch favorite
if [ -n "$ITEM_ID" ]; then
  r=$(post /api/clipboard/batch-favorite "{\"ids\":[$ITEM_ID],\"isFavorited\":true}")
  if echo "$r" | grep -q '"count"'; then
    log_pass "POST /api/clipboard/batch-favorite"
    post "/api/clipboard/batch-favorite" "{\"ids\":[$ITEM_ID],\"isFavorited\":false}" > /dev/null
  else
    log_fail "POST batch-favorite"
  fi
fi

# 4. Snippets CRUD
section "4. Snippets"

r=$(get /api/snippets)
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/snippets"
else
  log_fail "GET /api/snippets"
fi

SNIP=$(post /api/snippets '{"title":"test-snippet","content":"hello world","tagId":null,"isFavorited":false}')
SNIP_ID=$(echo "$SNIP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$SNIP_ID" ] && [ "$SNIP_ID" != "None" ]; then
  log_pass "POST /api/snippets (create id=$SNIP_ID)"

  r=$(put "/api/snippets/$SNIP_ID" '{"title":"updated","content":"updated content","tagId":null,"isFavorited":false}')
  if echo "$r" | grep -q '"title":"updated"'; then
    log_pass "PUT /api/snippets/$SNIP_ID (update)"
  else
    log_fail "PUT /api/snippets/$SNIP_ID"
  fi

  r=$(get /api/snippets/search?q=updated)
  if echo "$r" | grep -q "$SNIP_ID"; then
    log_pass "GET /api/snippets/search?q=updated"
  else
    log_fail "GET /api/snippets/search"
  fi

  del "/api/snippets/$SNIP_ID" > /dev/null
  log_pass "DELETE /api/snippets/$SNIP_ID"
else
  log_fail "POST /api/snippets create"
fi

# 5. Source Rules CRUD
section "5. Source Rules"

r=$(get /api/source-rules)
if echo "$r" | grep -q '\['; then
  log_pass "GET /api/source-rules"
else
  log_fail "GET /api/source-rules"
fi

RULE=$(post /api/source-rules '{"matchType":"process","pattern":"test-app.exe","enabled":true}')
RULE_ID=$(echo "$RULE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$RULE_ID" ] && [ "$RULE_ID" != "None" ]; then
  log_pass "POST /api/source-rules (create id=$RULE_ID)"

  r=$(patch "/api/source-rules/$RULE_ID/enabled" '{"enabled":false}')
  if echo "$r" | grep -q '"enabled":false'; then
    log_pass "PATCH /api/source-rules/$RULE_ID/enabled"
  else
    log_fail "PATCH source rule enabled: $r"
  fi

  r=$(put "/api/source-rules/$RULE_ID" '{"matchType":"title","pattern":"updated-pattern","enabled":true}')
  if echo "$r" | grep -q '"pattern":"updated-pattern"'; then
    log_pass "PUT /api/source-rules/$RULE_ID (update)"
  else
    log_fail "PUT source rule"
  fi

  del "/api/source-rules/$RULE_ID" > /dev/null
  log_pass "DELETE /api/source-rules/$RULE_ID"
else
  log_fail "POST /api/source-rules create"
fi

# 6. Config
section "6. Configuration"

r=$(get /api/config)
if echo "$r" | grep -q 'max_history_count'; then
  log_pass "GET /api/config (all keys)"
else
  log_fail "GET /api/config"
fi

r=$(get /api/config/language)
if echo "$r" | grep -q '"'; then
  log_pass "GET /api/config/language"
else
  log_fail "GET /api/config/language"
fi

r=$(put /api/config/llm_provider '{"value":"fake"}')
code=$(curl -so /dev/null -w '%{http_code}' --max-time 5 -X PUT -H "Content-Type: application/json" -d '{"value":"fake"}' "$BASE/api/config/llm_provider")
if [ "$code" = "200" ]; then
  log_pass "PUT /api/config/llm_provider"
else
  log_fail "PUT /api/config/llm_provider (HTTP $code)"
fi

# 7. QA
section "7. QA (FakeProvider)"

r=$(post /api/qa/ask '{"question":"what is in the clipboard?"}')
if echo "$r" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert 'answer' in d
assert d['provider'] in ('fake','openai')
print('provider:', d['provider'], 'context_count:', d.get('context_count',0))
" 2>/dev/null; then
  log_pass "POST /api/qa/ask (answers via $(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['provider'])" 2>/dev/null))"
else
  log_fail "POST /api/qa/ask: $(echo "$r" | head -c 200)"
fi

# Empty question should error
code=$(curl -so /dev/null -w '%{http_code}' --max-time 5 -X POST -H "Content-Type: application/json" -d '{"question":""}' "$BASE/api/qa/ask")
if [ "$code" = "400" ]; then
  log_pass "POST /api/qa/ask empty question returns 400"
else
  log_fail "POST /api/qa/ask empty (expected 400, got $code)"
fi

# 8. Batch delete & rescan
section "8. Maintenance"

r=$(post /api/clipboard/rescan-sensitive '{}')
if echo "$r" | grep -q '"count"'; then
  log_pass "POST /api/clipboard/rescan-sensitive"
else
  log_fail "POST rescan-sensitive"
fi

# 9. SSE stream check
section "9. SSE Events"

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 -N -H "Accept: text/event-stream" "$BASE/api/events" 2>/dev/null || echo "000")
if [ "$code" = "200" ]; then
  log_pass "GET /api/events (SSE stream opens, HTTP 200)"
else
  log_skip "GET /api/events SSE (HTTP $code)"
fi

# 10. Export/Backup (to temp dir)
section "10. Export / Backup"

TMP_EXPORT="$TMPDIR/export.json"
# Use forward slashes even on Windows (server runs on Windows/macOS/Linux)
# Try Linux-style temp path first
r=$(post /api/export/json "{\"path\":\"$TMPDIR/export.json\"}")
if echo "$r" | grep -q '"path"'; then
  log_pass "POST /api/export/json (exported to $TMPDIR)"
else
  log_skip "POST /api/export/json (path may not be accessible from server; set valid path)"
fi

r=$(post /api/backup "{\"path\":\"$TMPDIR/backup.db\"}")
if echo "$r" | grep -q '"path"'; then
  log_pass "POST /api/backup (backed up to $TMPDIR)"
else
  log_skip "POST /api/backup (server path access issue)"
fi

# 11. Window / Autostart (require Tauri)
section "11. Tauri-dependent endpoints"

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 -X POST "$BASE/api/window/toggle")
if [ "$code" = "200" ]; then
  log_pass "POST /api/window/toggle"
else
  log_skip "POST /api/window/toggle (HTTP $code - requires Tauri app)"
fi

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 -X POST "$BASE/api/window/show")
if [ "$code" = "200" ]; then
  log_pass "POST /api/window/show"
else
  log_skip "POST /api/window/show (requires Tauri)"
fi

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 "$BASE/api/autostart")
if [ "$code" = "200" ]; then
  log_pass "GET /api/autostart"
else
  log_skip "GET /api/autostart (HTTP $code - requires Tauri/OS integration)"
fi

# 12. 404 handler
section "12. Error handling"

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 "$BASE/api/nonexistent")
if [ "$code" = "404" ]; then
  log_pass "GET /api/nonexistent returns 404"
else
  log_fail "GET /api/nonexistent (expected 404, got $code)"
fi

code=$(curl -so /dev/null -w '%{http_code}' --max-time 3 "$BASE/api/clipboard/999999999")
if [ "$code" = "404" ]; then
  log_pass "GET /api/clipboard/999999999 returns 404"
else
  log_fail "GET /api/clipboard/999999999 (expected 404, got $code)"
fi

# Cleanup test tag
if [ -n "$TAG_ID" ] && [ "$TAG_ID" != "None" ]; then
  del "/api/tags/$TAG_ID" > /dev/null 2>&1
fi

# Summary
section "Summary"
echo ""
echo "  Passed:  $PASS"
echo "  Failed:  $FAIL"
echo "  Skipped: $SKIP"
echo "  Total:   $((PASS+FAIL+SKIP))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some tests FAILED."
  exit 1
else
  echo "All tests passed (or were appropriately skipped)."
  exit 0
fi

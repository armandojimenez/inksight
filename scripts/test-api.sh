#!/usr/bin/env bash
# ============================================================================
# Inksight API Test Script
#
# Automated curl-based test of all API endpoints. Tests the full lifecycle:
#   upload -> chat -> stream -> history -> gallery -> serve file -> delete -> health
#
# Usage:
#   ./scripts/test-api.sh              # Test against localhost:3000
#   ./scripts/test-api.sh http://host  # Test against custom base URL
#
# Prerequisites:
#   - Server running (docker-compose up -d db && npm run start:dev)
#   - curl and jq installed
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [BASE_URL]"
  echo ""
  echo "Run automated API tests against an Inksight server."
  echo ""
  echo "Arguments:"
  echo "  BASE_URL   Server URL (default: http://localhost:3000)"
  echo ""
  echo "Prerequisites:"
  echo "  - Server running (docker-compose up -d db && npm run start:dev)"
  echo "  - curl and jq installed"
  exit 0
fi

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------

check_dep() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: '$1' is required but not installed."
    case "$1" in
      jq)
        echo "  Install: brew install jq  (macOS)  |  apt-get install jq  (Debian/Ubuntu)"
        ;;
      curl)
        echo "  Install: brew install curl (macOS)  |  apt-get install curl (Debian/Ubuntu)"
        ;;
    esac
    exit 1
  fi
}

check_dep curl
check_dep jq

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
TOTAL=0
TMPDIR_TEST=$(mktemp -d)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

cleanup() {
  rm -rf "$TMPDIR_TEST"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}PASS${NC} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}FAIL${NC} $1"
  if [ -n "${2:-}" ]; then
    echo -e "       ${RED}$2${NC}"
  fi
}

section() {
  echo ""
  echo -e "${BOLD}${CYAN}--- $1 ---${NC}"
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label (HTTP $actual)"
  else
    fail "$label — expected $expected, got $actual"
  fi
}

assert_json_field() {
  local json="$1"
  local field="$2"
  local label="$3"
  local value
  value=$(echo "$json" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$value" != "null" ] && [ "$value" != "PARSE_ERROR" ] && [ -n "$value" ]; then
    pass "$label ($field = $value)"
  else
    fail "$label — field $field missing or null"
  fi
}

assert_json_equals() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local label="$4"
  local value
  value=$(echo "$json" | jq -r "$field" 2>/dev/null || echo "PARSE_ERROR")
  if [ "$value" = "$expected" ]; then
    pass "$label"
  else
    fail "$label — expected '$expected', got '$value'"
  fi
}

assert_header() {
  local headers="$1"
  local header_name="$2"
  local label="$3"
  if echo "$headers" | grep -qi "^$header_name:"; then
    local value
    value=$(echo "$headers" | grep -i "^$header_name:" | head -1 | cut -d: -f2- | xargs)
    pass "$label ($header_name: $value)"
  else
    fail "$label — header $header_name not found"
  fi
}

# Create a minimal valid 1x1 red PNG for testing
create_test_png() {
  local out="$1"
  printf '\x89\x50\x4e\x47\x0d\x0a\x1a\x0a' > "$out"
  printf '\x00\x00\x00\x0d\x49\x48\x44\x52' >> "$out"
  printf '\x00\x00\x00\x01\x00\x00\x00\x01' >> "$out"
  printf '\x08\x02\x00\x00\x00\x90\x77\x53' >> "$out"
  printf '\xde\x00\x00\x00\x0c\x49\x44\x41' >> "$out"
  printf '\x54\x08\xd7\x63\xf8\xcf\xc0\x00' >> "$out"
  printf '\x00\x00\x02\x00\x01\xe2\x21\xbc' >> "$out"
  printf '\x33\x00\x00\x00\x00\x49\x45\x4e' >> "$out"
  printf '\x44\xae\x42\x60\x82' >> "$out"
}

# ============================================================================
echo -e "${BOLD}Inksight API Test Suite${NC}"
echo -e "Base URL: ${CYAN}$BASE_URL${NC}"
echo ""

# Pre-flight: verify server is reachable
if ! curl -sf --max-time 5 "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo -e "${RED}Error: Server not reachable at $BASE_URL${NC}"
  echo ""
  echo "Start the server first:"
  echo "  docker-compose up -d db && npm run start:dev"
  echo ""
  echo "Then re-run this script:"
  echo "  ./scripts/test-api.sh $BASE_URL"
  exit 1
fi

# ---------------------------------------------------------------------------
section "1. Health Check"
# ---------------------------------------------------------------------------

HEALTH_HEADERS=$(mktemp "$TMPDIR_TEST/headers.XXXXXX")
HEALTH_BODY=$(curl -s -w '\n%{http_code}' -D "$HEALTH_HEADERS" "$BASE_URL/api/health")
HEALTH_STATUS=$(echo "$HEALTH_BODY" | tail -1)
HEALTH_JSON=$(echo "$HEALTH_BODY" | sed '$d')

assert_status "200" "$HEALTH_STATUS" "Health endpoint returns 200"
assert_json_equals "$HEALTH_JSON" '.status' 'healthy' "Status is healthy"
assert_json_equals "$HEALTH_JSON" '.checks.database' 'connected' "Database is connected"
assert_json_field "$HEALTH_JSON" '.checks.uptime' "Uptime is present"
assert_json_field "$HEALTH_JSON" '.timestamp' "Timestamp is present"
assert_header "$(cat "$HEALTH_HEADERS")" "X-Request-Id" "X-Request-Id header present"

# ---------------------------------------------------------------------------
section "2. Upload Image"
# ---------------------------------------------------------------------------

TEST_PNG="$TMPDIR_TEST/test-image.png"
create_test_png "$TEST_PNG"

UPLOAD_HEADERS=$(mktemp "$TMPDIR_TEST/headers.XXXXXX")
UPLOAD_BODY=$(curl -s -w '\n%{http_code}' -D "$UPLOAD_HEADERS" \
  -X POST "$BASE_URL/api/upload" \
  -F "image=@$TEST_PNG;type=image/png")
UPLOAD_STATUS=$(echo "$UPLOAD_BODY" | tail -1)
UPLOAD_JSON=$(echo "$UPLOAD_BODY" | sed '$d')

assert_status "201" "$UPLOAD_STATUS" "Upload returns 201 Created"
assert_json_field "$UPLOAD_JSON" '.id' "Response has id"
assert_json_field "$UPLOAD_JSON" '.filename' "Response has filename"
assert_json_equals "$UPLOAD_JSON" '.mimeType' 'image/png' "MIME type is image/png"
assert_json_field "$UPLOAD_JSON" '.size' "Response has size"
assert_header "$(cat "$UPLOAD_HEADERS")" "X-Request-Id" "X-Request-Id header present"

IMAGE_ID=$(echo "$UPLOAD_JSON" | jq -r '.id')
echo -e "  ${YELLOW}Captured imageId: $IMAGE_ID${NC}"

# ---------------------------------------------------------------------------
section "3. Upload Validation — Missing File"
# ---------------------------------------------------------------------------

ERR_BODY=$(curl -s -w '\n%{http_code}' -X POST "$BASE_URL/api/upload")
ERR_STATUS=$(echo "$ERR_BODY" | tail -1)
ERR_JSON=$(echo "$ERR_BODY" | sed '$d')

assert_status "400" "$ERR_STATUS" "Missing file returns 400"
assert_json_equals "$ERR_JSON" '.code' 'MISSING_FILE' "Error code is MISSING_FILE"
assert_json_field "$ERR_JSON" '.requestId' "Error has requestId"
assert_json_field "$ERR_JSON" '.timestamp' "Error has timestamp"
assert_json_field "$ERR_JSON" '.path' "Error has path"

# ---------------------------------------------------------------------------
section "3b. Upload Validation — Invalid File Type"
# ---------------------------------------------------------------------------

echo "not an image" > "$TMPDIR_TEST/test.txt"
ERR_TYPE_BODY=$(curl -s -w '\n%{http_code}' \
  -X POST "$BASE_URL/api/upload" \
  -F "image=@$TMPDIR_TEST/test.txt;type=text/plain")
ERR_TYPE_STATUS=$(echo "$ERR_TYPE_BODY" | tail -1)
ERR_TYPE_JSON=$(echo "$ERR_TYPE_BODY" | sed '$d')

assert_status "415" "$ERR_TYPE_STATUS" "Invalid file type returns 415"
assert_json_equals "$ERR_TYPE_JSON" '.code' 'INVALID_FILE_TYPE' "Error code is INVALID_FILE_TYPE"

# ---------------------------------------------------------------------------
section "4. Chat (Non-Streaming)"
# ---------------------------------------------------------------------------

CHAT_HEADERS=$(mktemp "$TMPDIR_TEST/headers.XXXXXX")
CHAT_BODY=$(curl -s -w '\n%{http_code}' -D "$CHAT_HEADERS" \
  -X POST "$BASE_URL/api/chat/$IMAGE_ID" \
  -H "Content-Type: application/json" \
  -d '{"message": "What objects can you identify in this image?"}')
CHAT_STATUS=$(echo "$CHAT_BODY" | tail -1)
CHAT_JSON=$(echo "$CHAT_BODY" | sed '$d')

assert_status "200" "$CHAT_STATUS" "Chat returns 200 OK"
assert_json_equals "$CHAT_JSON" '.object' 'chat.completion' "Object is chat.completion"
assert_json_field "$CHAT_JSON" '.id' "Response has completion id"
assert_json_field "$CHAT_JSON" '.model' "Response has model"
assert_json_equals "$CHAT_JSON" '.choices[0].message.role' 'assistant' "Choice role is assistant"
assert_json_field "$CHAT_JSON" '.choices[0].message.content' "Choice has content"
assert_json_equals "$CHAT_JSON" '.choices[0].finish_reason' 'stop' "Finish reason is stop"
assert_json_field "$CHAT_JSON" '.usage.prompt_tokens' "Usage has prompt_tokens"
assert_json_field "$CHAT_JSON" '.usage.completion_tokens' "Usage has completion_tokens"
assert_json_field "$CHAT_JSON" '.usage.total_tokens' "Usage has total_tokens"
assert_header "$(cat "$CHAT_HEADERS")" "X-Request-Id" "X-Request-Id header present"

# ---------------------------------------------------------------------------
section "5. Chat — Image Not Found"
# ---------------------------------------------------------------------------

FAKE_UUID="00000000-0000-4000-8000-000000000000"
ERR404_BODY=$(curl -s -w '\n%{http_code}' \
  -X POST "$BASE_URL/api/chat/$FAKE_UUID" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}')
ERR404_STATUS=$(echo "$ERR404_BODY" | tail -1)
ERR404_JSON=$(echo "$ERR404_BODY" | sed '$d')

assert_status "404" "$ERR404_STATUS" "Chat with fake UUID returns 404"
assert_json_equals "$ERR404_JSON" '.code' 'IMAGE_NOT_FOUND' "Error code is IMAGE_NOT_FOUND"

# ---------------------------------------------------------------------------
section "6. Chat — Invalid UUID"
# ---------------------------------------------------------------------------

ERR_UUID_BODY=$(curl -s -w '\n%{http_code}' \
  -X POST "$BASE_URL/api/chat/not-a-uuid" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}')
ERR_UUID_STATUS=$(echo "$ERR_UUID_BODY" | tail -1)
ERR_UUID_JSON=$(echo "$ERR_UUID_BODY" | sed '$d')

assert_status "400" "$ERR_UUID_STATUS" "Invalid UUID returns 400"
assert_json_equals "$ERR_UUID_JSON" '.code' 'INVALID_UUID' "Error code is INVALID_UUID"

# ---------------------------------------------------------------------------
section "7. Chat — Empty Message"
# ---------------------------------------------------------------------------

ERR_MSG_BODY=$(curl -s -w '\n%{http_code}' \
  -X POST "$BASE_URL/api/chat/$IMAGE_ID" \
  -H "Content-Type: application/json" \
  -d '{"message": "   "}')
ERR_MSG_STATUS=$(echo "$ERR_MSG_BODY" | tail -1)
ERR_MSG_JSON=$(echo "$ERR_MSG_BODY" | sed '$d')

assert_status "400" "$ERR_MSG_STATUS" "Whitespace-only message returns 400"
assert_json_equals "$ERR_MSG_JSON" '.code' 'INVALID_MESSAGE' "Error code is INVALID_MESSAGE"

# ---------------------------------------------------------------------------
section "8. Chat Streaming (SSE)"
# ---------------------------------------------------------------------------

STREAM_HEADERS=$(mktemp "$TMPDIR_TEST/headers.XXXXXX")
STREAM_BODY=$(curl -s -w '\n%{http_code}' -D "$STREAM_HEADERS" \
  -X POST "$BASE_URL/api/chat-stream/$IMAGE_ID" \
  -H "Content-Type: application/json" \
  -d '{"message": "Describe the colors and lighting."}')
STREAM_STATUS=$(echo "$STREAM_BODY" | tail -1)
STREAM_TEXT=$(echo "$STREAM_BODY" | sed '$d')

assert_status "200" "$STREAM_STATUS" "Stream returns 200 OK"
assert_header "$(cat "$STREAM_HEADERS")" "Content-Type" "Content-Type header present"

# Check for SSE format
if echo "$STREAM_TEXT" | grep -q '^data: '; then
  pass "Response contains SSE data lines"
else
  fail "Response missing SSE data lines"
fi

if echo "$STREAM_TEXT" | grep -q 'data: \[DONE\]'; then
  pass "Response contains [DONE] sentinel"
else
  fail "Response missing [DONE] sentinel"
fi

# Validate first non-DONE data line is valid JSON
FIRST_CHUNK=$(echo "$STREAM_TEXT" | grep '^data: {' | head -1 | sed 's/^data: //')
if [ -n "$FIRST_CHUNK" ]; then
  CHUNK_OBJECT=$(echo "$FIRST_CHUNK" | jq -r '.object' 2>/dev/null || echo "PARSE_ERROR")
  if [ "$CHUNK_OBJECT" = "chat.completion.chunk" ]; then
    pass "First chunk is valid chat.completion.chunk"
  else
    fail "First chunk has wrong object type: $CHUNK_OBJECT"
  fi
else
  fail "No JSON data chunks found in stream"
fi

assert_header "$(cat "$STREAM_HEADERS")" "X-Accel-Buffering" "X-Accel-Buffering header present"

# ---------------------------------------------------------------------------
section "9. Conversation History"
# ---------------------------------------------------------------------------

HISTORY_BODY=$(curl -s -w '\n%{http_code}' \
  "$BASE_URL/api/chat/$IMAGE_ID/history?page=1&limit=20")
HISTORY_STATUS=$(echo "$HISTORY_BODY" | tail -1)
HISTORY_JSON=$(echo "$HISTORY_BODY" | sed '$d')

assert_status "200" "$HISTORY_STATUS" "History returns 200 OK"
assert_json_equals "$HISTORY_JSON" '.imageId' "$IMAGE_ID" "imageId matches uploaded image"
assert_json_field "$HISTORY_JSON" '.messages' "Has messages array"
assert_json_field "$HISTORY_JSON" '.totalMessages' "Has totalMessages"
assert_json_field "$HISTORY_JSON" '.page' "Has page"
assert_json_field "$HISTORY_JSON" '.pageSize' "Has pageSize"
assert_json_field "$HISTORY_JSON" '.totalPages' "Has totalPages"

MSG_COUNT=$(echo "$HISTORY_JSON" | jq '.totalMessages')
if [ "$MSG_COUNT" -gt 0 ]; then
  pass "History has $MSG_COUNT messages from chat/stream requests"
else
  fail "History should have messages but has $MSG_COUNT"
fi

# Validate message structure
FIRST_MSG_ROLE=$(echo "$HISTORY_JSON" | jq -r '.messages[0].role' 2>/dev/null)
if [ "$FIRST_MSG_ROLE" = "user" ] || [ "$FIRST_MSG_ROLE" = "assistant" ]; then
  pass "First message has valid role ($FIRST_MSG_ROLE)"
else
  fail "First message has invalid role: $FIRST_MSG_ROLE"
fi

assert_json_field "$HISTORY_JSON" '.messages[0].id' "Message has id"
assert_json_field "$HISTORY_JSON" '.messages[0].content' "Message has content"
assert_json_field "$HISTORY_JSON" '.messages[0].timestamp' "Message has timestamp"

# ---------------------------------------------------------------------------
section "10. Image Gallery"
# ---------------------------------------------------------------------------

GALLERY_BODY=$(curl -s -w '\n%{http_code}' \
  "$BASE_URL/api/images?page=1&limit=20")
GALLERY_STATUS=$(echo "$GALLERY_BODY" | tail -1)
GALLERY_JSON=$(echo "$GALLERY_BODY" | sed '$d')

assert_status "200" "$GALLERY_STATUS" "Gallery returns 200 OK"
assert_json_field "$GALLERY_JSON" '.images' "Has images array"
assert_json_field "$GALLERY_JSON" '.total' "Has total"
assert_json_field "$GALLERY_JSON" '.page' "Has page"
assert_json_field "$GALLERY_JSON" '.pageSize' "Has pageSize"
assert_json_field "$GALLERY_JSON" '.totalPages' "Has totalPages"

# Check our image is in the gallery
FOUND=$(echo "$GALLERY_JSON" | jq --arg id "$IMAGE_ID" '[.images[] | select(.id == $id)] | length')
if [ "$FOUND" = "1" ]; then
  pass "Uploaded image found in gallery"
else
  fail "Uploaded image not found in gallery"
fi

# Validate gallery item structure
GALLERY_ITEM=$(echo "$GALLERY_JSON" | jq --arg id "$IMAGE_ID" '.images[] | select(.id == $id)')
assert_json_field "$GALLERY_ITEM" '.originalFilename' "Gallery item has originalFilename"
assert_json_field "$GALLERY_ITEM" '.mimeType' "Gallery item has mimeType"
assert_json_field "$GALLERY_ITEM" '.size' "Gallery item has size"
assert_json_field "$GALLERY_ITEM" '.messageCount' "Gallery item has messageCount"
assert_json_field "$GALLERY_ITEM" '.createdAt' "Gallery item has createdAt"

# ---------------------------------------------------------------------------
section "11. Serve Image File"
# ---------------------------------------------------------------------------

FILE_HEADERS=$(mktemp "$TMPDIR_TEST/headers.XXXXXX")
FILE_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -D "$FILE_HEADERS" \
  "$BASE_URL/api/images/$IMAGE_ID/file")

assert_status "200" "$FILE_STATUS" "Serve file returns 200 OK"
assert_header "$(cat "$FILE_HEADERS")" "Content-Type" "Content-Type header present"
assert_header "$(cat "$FILE_HEADERS")" "Content-Disposition" "Content-Disposition header present"
assert_header "$(cat "$FILE_HEADERS")" "Cache-Control" "Cache-Control header present"

# Verify Content-Type is an image type
FILE_CT=$(grep -i "^Content-Type:" "$FILE_HEADERS" | head -1 | cut -d: -f2- | xargs)
if echo "$FILE_CT" | grep -qE "^image/(png|jpeg|gif)"; then
  pass "Content-Type is a valid image type ($FILE_CT)"
else
  fail "Content-Type is not an image type: $FILE_CT"
fi

# ---------------------------------------------------------------------------
section "12. Delete Image"
# ---------------------------------------------------------------------------

DELETE_BODY=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE_URL/api/images/$IMAGE_ID")
DELETE_STATUS=$(echo "$DELETE_BODY" | tail -1)

assert_status "204" "$DELETE_STATUS" "Delete returns 204 No Content"

# Verify deletion — chat should return 404
VERIFY_BODY=$(curl -s -w '\n%{http_code}' \
  -X POST "$BASE_URL/api/chat/$IMAGE_ID" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}')
VERIFY_STATUS=$(echo "$VERIFY_BODY" | tail -1)
assert_status "404" "$VERIFY_STATUS" "Chat after delete returns 404"

# Verify deletion — history should return 404
VERIFY_HIST_BODY=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/chat/$IMAGE_ID/history")
VERIFY_HIST_STATUS=$(echo "$VERIFY_HIST_BODY" | tail -1)
assert_status "404" "$VERIFY_HIST_STATUS" "History after delete returns 404"

# Verify deletion — serve file should return 404
VERIFY_FILE_BODY=$(curl -s -w '\n%{http_code}' "$BASE_URL/api/images/$IMAGE_ID/file")
VERIFY_FILE_STATUS=$(echo "$VERIFY_FILE_BODY" | tail -1)
assert_status "404" "$VERIFY_FILE_STATUS" "Serve file after delete returns 404"

# Verify deletion — second delete should return 404
DELETE2_BODY=$(curl -s -w '\n%{http_code}' -X DELETE "$BASE_URL/api/images/$IMAGE_ID")
DELETE2_STATUS=$(echo "$DELETE2_BODY" | tail -1)
assert_status "404" "$DELETE2_STATUS" "Second delete returns 404 (idempotent)"

# ============================================================================
# Summary
# ============================================================================

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}Test Results${NC}"
echo -e "${BOLD}============================================${NC}"
echo -e "  Total:  $TOTAL"
echo -e "  ${GREEN}Passed: $PASS${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL${NC}"
  echo ""
  echo -e "${RED}SOME TESTS FAILED${NC}"
  exit 1
else
  echo -e "  ${RED}Failed: 0${NC}"
  echo ""
  echo -e "${GREEN}ALL TESTS PASSED${NC}"
fi

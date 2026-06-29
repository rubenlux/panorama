#!/bin/bash

# Test MCP authentication endpoints
# Run: bash scripts/test_mcp_auth.sh

# Load .env file to get fresh token
set -a
source .env
set +a

BACKEND_URL="http://localhost:5000"
MCP_TOKEN="$MCP_SERVICE_TOKEN"

echo "=== MCP Auth Test ==="
echo "Backend: $BACKEND_URL"
echo "Token: ${MCP_TOKEN:0:20}..."
echo ""

# Test 1: GET /articles/dashboard (should work with MCP token)
echo "1. Testing GET /articles/dashboard with MCP token..."
curl -v -X GET "$BACKEND_URL/articles/dashboard" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  2>&1 | grep -E "< HTTP|error|ok"
echo ""

# Test 2: POST /articles (should create draft with MCP token)
echo "2. Testing POST /articles with MCP token..."
curl -v -X POST "$BACKEND_URL/articles" \
  -H "Authorization: Bearer $MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Article from MCP Auth",
    "body": "Testing MCP authentication with proper content length to meet validation requirements.",
    "excerpt": "Test excerpt for the article",
    "created_by": "550e8400-e29b-41d4-a716-446655440000",
    "created_via": "cli",
    "workflow": "editorial_ai"
  }' \
  2>&1 | grep -E "< HTTP|error|id|article|slug"
echo ""

# Test 3: GET with invalid token (should fail)
echo "3. Testing GET /articles/dashboard with INVALID token..."
curl -v -X GET "$BACKEND_URL/articles/dashboard" \
  -H "Authorization: Bearer invalid_token_123" \
  -H "Content-Type: application/json" \
  2>&1 | grep -E "< HTTP|error"
echo ""

echo "=== Test Complete ==="
echo "Check backend logs for auth debug messages"

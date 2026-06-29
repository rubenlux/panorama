# Test MCP authentication endpoints
# Run: .\scripts\test_mcp_auth.ps1

$BackendUrl = "http://localhost:5000"
$MCP_Token = $env:MCP_SERVICE_TOKEN -or "mcp_sv_test_local_development_only_change_in_production"

Write-Host "=== MCP Auth Test ===" -ForegroundColor Cyan
Write-Host "Backend: $BackendUrl"
Write-Host "Token: $($MCP_Token.Substring(0, 20))..."
Write-Host ""

$Headers = @{
    "Authorization" = "Bearer $MCP_Token"
    "Content-Type" = "application/json"
}

# Test 1: GET /articles/dashboard
Write-Host "1. Testing GET /articles/dashboard with MCP token..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/articles/dashboard" `
        -Headers $Headers `
        -Method Get
    Write-Host "✓ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "✗ Error: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host $_.Exception.Response | ConvertFrom-Json | Out-String
}
Write-Host ""

# Test 2: POST /articles
Write-Host "2. Testing POST /articles with MCP token..." -ForegroundColor Yellow
$Body = @{
    title = "Test Article from MCP Auth"
    body = "Testing MCP authentication"
    excerpt = "Test"
    created_by = "test-user-id"
    created_via = "powershell_test"
    workflow = "editorial_ai"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/articles" `
        -Headers $Headers `
        -Method Post `
        -Body $Body
    Write-Host "✓ Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host $response.Content
} catch {
    Write-Host "✗ Error: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    try {
        $responseBody = $_.Exception.Response.GetResponseStream()
        $reader = [System.IO.StreamReader]::new($responseBody)
        Write-Host $reader.ReadToEnd()
    } catch {
        Write-Host $_.Exception.Message
    }
}
Write-Host ""

# Test 3: GET with invalid token
Write-Host "3. Testing GET /articles/dashboard with INVALID token..." -ForegroundColor Yellow
$InvalidHeaders = @{
    "Authorization" = "Bearer invalid_token_123"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-WebRequest -Uri "$BackendUrl/articles/dashboard" `
        -Headers $InvalidHeaders `
        -Method Get
    Write-Host "✗ Should have failed but succeeded: $($response.StatusCode)" -ForegroundColor Red
} catch {
    Write-Host "✓ Correctly rejected with: $($_.Exception.Response.StatusCode)" -ForegroundColor Green
}
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host "Check backend logs for auth debug messages"

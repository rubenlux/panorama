import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub, role, email }
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/**
 * Authenticate MCP service account using MCP_SERVICE_TOKEN env var
 * Sets req.user = { sub: 'mcp-service', role: 'mcp' }
 * For use in MCP-specific endpoints only
 */
export function requireMcpAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const expectedToken = process.env.MCP_SERVICE_TOKEN;
  if (!expectedToken) {
    console.error("[MCP Auth] MCP_SERVICE_TOKEN not configured in .env");
    return res.status(503).json({ error: "MCP service not configured" });
  }

  if (token !== expectedToken) {
    return res.status(401).json({ error: "Invalid MCP token" });
  }

  // Set synthetic user for MCP requests
  req.user = {
    sub: process.env.MCP_SERVICE_USER_ID || "mcp-service",
    role: "mcp",
    email: "mcp@panorama.local"
  };

  return next();
}

/**
 * Accept EITHER user JWT (from browser/UI) OR MCP service token
 * Allows endpoints to work with both CLI/MCP and web UI
 */
export function requireAuthOrMcp(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  // VERBOSE DEBUG: Log method and path
  const isWrite = ["POST", "PATCH", "DELETE"].includes(req.method);
  console.log(`\n[Auth] ${isWrite ? "⚠️  WRITE" : "✓ READ "} ${req.method.padEnd(6)} ${req.path}`);
  console.log(`[Auth] Header: ${header ? header.substring(0, 40) + "..." : "MISSING"}`);

  if (type !== "Bearer" || !token) {
    console.error(`[Auth] ✗ FAIL - No Bearer token (type: ${type}, token: ${token ? "present" : "missing"})`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Try MCP token first
  const mcpToken = process.env.MCP_SERVICE_TOKEN;

  if (mcpToken) {
    if (token === mcpToken) {
      console.log("[Auth] ✓ PASS - MCP token validated");
      req.user = {
        sub: process.env.MCP_SERVICE_USER_ID || "mcp-service",
        role: "mcp",
        email: "mcp@panorama.local"
      };
      return next();
    } else {
      console.warn("[Auth] MCP token mismatch. Received: " + token.substring(0, 25) + "... Expected: " + mcpToken.substring(0, 25) + "...");
    }
  } else {
    console.warn("[Auth] MCP_SERVICE_TOKEN not configured in backend .env");
  }

  // Fall back to JWT verification
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    console.log("[Auth] ✓ PASS - JWT token validated for user: " + payload.sub);
    req.user = payload;
    return next();
  } catch (e) {
    console.error("[Auth] ✗ FAIL - JWT verification failed: " + e.message);
    return res.status(401).json({ error: "Invalid token" });
  }
}


/**
 * Authorize based on user role
 * MCP service account (role='mcp') is always authorized for protected operations
 * @param {...string} allowed - Role names to allow (e.g., 'admin', 'editor')
 */
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user?.role) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // MCP service account always has access to protected operations
    if (req.user.role === "mcp") {
      return next();
    }

    // Otherwise check against allowed roles
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

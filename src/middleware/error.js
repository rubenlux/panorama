import { ZodError } from "zod";

export function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(err, req, res, next) {
  // Zod validation errors -> 400
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation error",
      details: err.flatten(),
    });
  }

  // Postgres unique violation -> 409 (opcional, pero útil)
  if (err?.code === "23505") {
    return res.status(409).json({ error: "Conflict" });
  }

  console.error(err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}


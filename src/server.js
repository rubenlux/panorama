import "dotenv/config";
import { createApp } from "./app.js";
import { pool } from "./routes/db.js";

const app = createApp();
const port = process.env.PORT || 5000;

app.get("/health", async (req, res) => {
  const r = await pool.query("SELECT 1 as ok");
  res.json({ ok: true, db: r.rows[0].ok });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

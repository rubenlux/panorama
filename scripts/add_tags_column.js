
import { query } from "../src/routes/db.js";

async function addTagsColumn() {
    try {
        console.log("Adding 'tags' column to campaigns...");
        await query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';`);

        // Add index explicitly
        await query(`CREATE INDEX IF NOT EXISTS idx_campaigns_tags ON campaigns USING GIN(tags);`);

        console.log("✅ Column 'tags' added successfully.");
    } catch (e) {
        console.log("⚠️ Error or column already exists:", e.message);
    }
}

addTagsColumn();

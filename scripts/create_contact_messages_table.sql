-- Create contact_messages table for storing contact form submissions
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'new',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for queries by status and date
CREATE INDEX IF NOT EXISTS idx_contact_messages_status_created
  ON contact_messages(status, created_at DESC);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_contact_messages_email
  ON contact_messages(email);

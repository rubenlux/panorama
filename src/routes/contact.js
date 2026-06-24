import express from 'express';
import { query } from './db.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Configure email (adjust según tu configuración)
const transporter = process.env.SMTP_HOST ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
}) : null;

// POST /contact - Submit contact form
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validar datos
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (message.length < 10) {
      return res.status(400).json({ error: 'Message must be at least 10 characters' });
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    // Guardar en BD
    await query(`
      INSERT INTO contact_messages (name, email, subject, message, status, created_at)
      VALUES ($1, $2, $3, $4, 'new', NOW())
    `, [name, email, subject, message]);

    // Enviar email si está configurado
    if (transporter) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@panorama.ar',
          to: process.env.CONTACT_EMAIL || 'info@panorama.ar',
          subject: `[Panorama] ${subject} — de ${name}`,
          html: `
            <h2>Nuevo mensaje de contacto</h2>
            <p><strong>De:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Asunto:</strong> ${subject}</p>
            <p><strong>Mensaje:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
          `,
          replyTo: email,
        });
      } catch (emailErr) {
        console.warn('Email send failed (non-fatal):', emailErr.message);
        // No fallar la request si el email falla
      }
    }

    res.json({ ok: true, message: 'Mensaje enviado correctamente' });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /contact/messages (admin only)
router.get('/messages', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, name, email, subject, message, status, created_at
      FROM contact_messages
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

export default router;

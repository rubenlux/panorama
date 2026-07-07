import React, { useState } from 'react';
import { apiJson } from '../api';
import { Pixel } from '../utils/pixel';

export default function Newsletter() {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) return;

        setStatus('loading');
        try {
            await apiJson('/marketing/subscribe', {
                method: 'POST',
                body: { email }
            });
            setStatus('success');
            // SPEC 014: email_hash used to send btoa(email) — reversible Base64,
            // not a hash, so the email leaked in cleartext into pixel_events.
            // The real signup already posts the email to /marketing/subscribe;
            // this analytics event only needs to know a signup happened.
            Pixel.track('engagement', { type: 'newsletter_signup' });
            setEmail('');
        } catch (err) {
            setStatus('error');
            console.error(err);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.content}>
                <div style={styles.icon}>
                    {/* Placeholder for the megaphone illustration */}
                    <img src="https://cdn-icons-png.flaticon.com/512/3022/3022217.png" alt="Boletín" style={{ width: 80, height: 80, opacity: 0.8 }} />
                </div>
                <div style={styles.textStack}>
                    <h3 style={styles.title}>Suscribite a nuestro newsletter</h3>
                    <p style={styles.subtitle}>
                        Recibí las últimas noticias cada mañana en tu correo.
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} style={styles.form}>
                <div style={styles.inputWrapper}>
                    <input
                        type="email"
                        placeholder="Ingresá tu email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={status === 'loading' || status === 'success'}
                        style={styles.input}
                        required
                    />
                    {status === 'loading' && <div style={styles.spinner}></div>}
                </div>
                <button
                    type="submit"
                    disabled={status === 'loading' || status === 'success'}
                    style={{ ...styles.button, ...(status === 'success' ? styles.btnSuccess : {}) }}
                >
                    {status === 'success' ? '¡Suscrito! ✅' : status === 'loading' ? '...' : 'Suscribirse'}
                </button>
            </form>
            {status === 'error' && <div style={styles.error}>Algo salió mal. Intenta de nuevo.</div>}
        </div>
    );
}

const styles = {
    container: {
        background: '#f8f9fa', // Light gray/white background
        color: '#333',
        padding: '30px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 20,
        marginBottom: '2rem',
        border: '1px solid #eee'
    },
    content: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 15
    },
    icon: {
        fontSize: 50,
        marginBottom: 10,
        display: 'block'
    },
    textStack: {
        maxWidth: '100%'
    },
    title: {
        fontSize: 20,
        fontWeight: 700,
        marginBottom: 8,
        color: '#222'
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        lineHeight: 1.4
    },
    form: {
        display: 'flex',
        flexDirection: 'column', // Vertical stack
        gap: 10,
        width: '100%'
    },
    inputWrapper: {
        position: 'relative',
        width: '100%'
    },
    input: {
        width: '100%',
        padding: '12px 15px',
        border: '1px solid #ddd',
        background: 'white',
        color: '#333',
        fontSize: 14,
        fontWeight: 400,
        outline: 'none',
        transition: 'all 0.2s',
    },
    button: {
        padding: '12px 20px',
        background: '#aaa', // Gray button as in reference
        color: 'white',
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        fontSize: 16,
        transition: 'background 0.2s',
        width: '100%',
        textTransform: 'uppercase'
    },
    btnSuccess: {
        background: '#22c55e',
        cursor: 'default'
    },
    error: {
        color: '#ef4444',
        fontSize: 14,
        marginTop: -10
    },
    spinner: {
        position: 'absolute',
        right: 15,
        top: 15,
        width: 15,
        height: 15,
        border: '2px solid rgba(0,0,0,0.3)',
        borderTopColor: '#333',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    }
};

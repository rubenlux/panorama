
import fetch from 'node-fetch';

async function register() {
    try {
        const res = await fetch('http://localhost:5000/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'agent@test.com', password: 'password123' })
        });
        const data = await res.json();
        console.log(data);
    } catch (e) {
        console.error(e);
    }
}

register();

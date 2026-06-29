import React, { useEffect } from 'react';

export default function Brand() {
  useEffect(() => {
    // Abre el Brand Kit desde la carpeta pública del CMS (sin puertos hardcodeados)
    const brandKitUrl = '/brand-kit.html';

    console.log('Abriendo Brand Kit desde:', brandKitUrl);

    // Abre el Brand Kit en una nueva pestaña
    const newWindow = window.open(brandKitUrl, 'brandkit', 'width=1400,height=900');

    if (!newWindow) {
      alert('No se pudo abrir el Brand Kit. Verifica que los pop-ups estén permitidos.');
    }

    // Regresa al dashboard
    window.location.href = '/dashboard';
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      color: '#999',
      gap: '20px'
    }}>
      <p>Abriendo Brand Kit en una nueva pestaña...</p>
      <p style={{ fontSize: '0.85rem', color: '#666' }}>Si no se abre automáticamente, verifica que los pop-ups estén permitidos.</p>
    </div>
  );
}

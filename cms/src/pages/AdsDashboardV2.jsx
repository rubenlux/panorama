
import React, { useState, useEffect } from 'react';
import { apiJson } from '../api';
import { Link } from 'react-router-dom';
import { Save, Plus, X, Monitor, Layout, Tag, Image as ImageIcon, Edit2, Trash2 } from 'lucide-react';

export default function AdsDashboardV2() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreator, setShowCreator] = useState(false);
    const [advertisers, setAdvertisers] = useState([]);
    const [editingId, setEditingId] = useState(null); // ID de campaña en edición

    // Form State
    const [formData, setFormData] = useState({
        advertiser_id: '',
        name: '',
        banner_url: 'https://via.placeholder.com/910x87.png?text=Tu+Banner+Aqui',
        target_url: 'https://',
        position: 'header_top',
        tags: '',
        status: 'active'
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [camps, advs] = await Promise.all([
                apiJson('/ads/manage/campaigns', { auth: true }),
                apiJson('/ads/manage/advertisers', { auth: true })
            ]);
            setCampaigns(camps);
            setAdvertisers(advs);
            if (advs.length > 0) setFormData(prev => ({ ...prev, advertiser_id: advs[0].id }));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const tagsArray = formData.tags.split(',').map(t => t.trim()).filter(Boolean);

            if (editingId) {
                // Actualizar campaña existente
                await apiJson(`/ads/manage/campaigns/${editingId}`, {
                    auth: true,
                    method: 'PUT',
                    body: {
                        ...formData,
                        tags: tagsArray
                    }
                });
                alert("¡Campaña Actualizada con Éxito!");
            } else {
                // Crear nueva campaña
                await apiJson('/ads/manage/campaigns', {
                    auth: true,
                    method: 'POST',
                    body: {
                        ...formData,
                        tags: tagsArray
                    }
                });
                alert("¡Campaña Creada con Éxito!");
            }

            setShowCreator(false);
            setEditingId(null);
            loadData();

            // Reset form
            setFormData({
                advertiser_id: advertisers[0]?.id || '',
                name: '',
                banner_url: 'https://via.placeholder.com/910x87.png?text=Tu+Banner+Aqui',
                target_url: 'https://',
                position: 'header_top',
                tags: '',
                status: 'active'
            });
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    const handleEdit = (campaign) => {
        setEditingId(campaign.id);
        setFormData({
            advertiser_id: campaign.advertiser_id,
            name: campaign.name,
            banner_url: campaign.banner_url,
            target_url: campaign.target_url,
            position: campaign.position,
            tags: campaign.tags ? campaign.tags.join(', ') : '',
            status: campaign.status
        });
        setShowCreator(true);
    };

    const handleDelete = async (id, name) => {
        if (!confirm(`¿Estás seguro de eliminar la campaña "${name}"?`)) return;

        try {
            await apiJson(`/ads/manage/campaigns/${id}`, {
                auth: true,
                method: 'DELETE'
            });
            alert("¡Campaña Eliminada!");
            loadData();
        } catch (err) {
            alert("Error al eliminar: " + err.message);
        }
    };

    const handleCancel = () => {
        setShowCreator(false);
        setEditingId(null);
        setFormData({
            advertiser_id: advertisers[0]?.id || '',
            name: '',
            banner_url: 'https://via.placeholder.com/910x87.png?text=Tu+Banner+Aqui',
            target_url: 'https://',
            position: 'header_top',
            tags: '',
            status: 'active'
        });
    };

    const recommendedSize = () => {
        switch (formData.position) {
            case 'header_top': return '910x87 (Premium)';
            case 'home_top': return '728x90';
            case 'home_sponsors': return '910x87 (Carousel Ad)';
            case 'home_latest_sidebar': return '300x250 o 300x600';
            case 'article_top_banner': return '728x90 o 970x250';
            case 'article_hero': return '728x90 o GIF Animado';
            case 'article_sidebar_top': return '300x250';
            case 'article_sidebar': return '300x250 o 300x600';
            case 'article_sticky': return '157x601 (Vertical)';
            case 'article_sidebar_bottom_1': return '300x250';
            case 'article_sidebar_bottom_2': return '300x250';
            case 'article_bottom': return '728x90 o 300x250 (Móvil)';
            default: return 'Variable';
        }
    };

    return (
        <div style={{ padding: 30, background: '#f8fafc', minHeight: '100vh' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>📢 Gestor de Campañas</h1>
                    <p style={{ color: '#64748b' }}>Crea experiencias publicitarias a medida.</p>
                </div>
                {!showCreator && (
                    <button
                        onClick={() => setShowCreator(true)}
                        style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#2563eb', color: 'white', padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                        <Plus size={18} /> Nueva Campaña
                    </button>
                )}
            </div>

            {/* CREATOR MODE */}
            {showCreator && (
                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, background: 'white', padding: 30, borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: 40 }}>

                    {/* LEFT COLUMN: INPUTS */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
                                {editingId ? '✏️ Editar Campaña' : '🛠️ Nueva Campaña'}
                            </h2>
                            <button onClick={handleCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                        </div>

                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                            <div className="form-group">
                                <label style={label}>Nombre de Campaña</label>
                                <input
                                    style={input}
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej. Promo Verano 2026"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label style={label}>Anunciante</label>
                                <select
                                    style={input}
                                    value={formData.advertiser_id}
                                    onChange={e => setFormData({ ...formData, advertiser_id: e.target.value })}
                                >
                                    {advertisers.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label style={label}>Posición Estratégica</label>
                                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    {[
                                        { id: 'header_top', name: '👑 Header Top (Premium)', desc: 'Arriba de todo. Máxima visibilidad.' },
                                        { id: 'article_top_banner', name: '🎯 Article Top Banner', desc: 'Banner superior del artículo.' },
                                        { id: 'article_hero', name: '⭐ Article Hero', desc: 'Sobre la foto de portada.' },
                                        { id: 'home_top', name: '🏠 Home Top', desc: 'Bajo el menú principal.' },
                                        { id: 'home_sponsors', name: '🎁 Home Sponsors', desc: 'Carrusel de patrocinadores.' },
                                        { id: 'home_latest_sidebar', name: '🏁 Section Footer', desc: 'Debajo de la última sección.' },
                                        { id: 'footer_top_horizontal', name: '⬇️ Footer Top (Wide)', desc: 'Banner ancho sobre el pie de página.' },
                                        { id: 'article_sidebar_top', name: '📌 Sidebar Top', desc: 'Parte superior del sidebar.' },
                                        { id: 'article_sidebar', name: '📰 Sidebar', desc: 'Barra lateral derecha.' },
                                        { id: 'article_sticky', name: '📍 Sticky Ad', desc: 'Publicidad pegajosa (157x601).' },
                                        { id: 'article_sidebar_bottom_1', name: '📦 Sidebar Bottom 1', desc: 'Primer espacio inferior.' },
                                        { id: 'article_sidebar_bottom_2', name: '📦 Sidebar Bottom 2', desc: 'Segundo espacio inferior.' },
                                        { id: 'article_bottom', name: '⏬ Footer', desc: 'Al final del contenido.' }
                                    ].map(pos => (
                                        <div
                                            key={pos.id}
                                            onClick={() => setFormData({ ...formData, position: pos.id })}
                                            style={{
                                                border: formData.position === pos.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                                background: formData.position === pos.id ? '#eff6ff' : 'white',
                                                padding: 10, borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ fontWeight: 600, fontSize: 13, color: formData.position === pos.id ? '#1e40af' : '#334155' }}>{pos.name}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{pos.desc}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label style={label}>
                                    <ImageIcon size={14} style={{ display: 'inline', marginRight: 5 }} />
                                    Banner URL
                                </label>
                                <input
                                    style={input}
                                    value={formData.banner_url}
                                    onChange={e => setFormData({ ...formData, banner_url: e.target.value })}
                                    placeholder="https://..."
                                    required
                                />
                                <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 5, fontWeight: 500 }}>
                                    ⚠️ Tamaño Recomendado: {recommendedSize()}
                                </div>
                            </div>

                            <div className="form-group">
                                <label style={label}>Link de Destino</label>
                                <input
                                    style={input}
                                    value={formData.target_url}
                                    onChange={e => setFormData({ ...formData, target_url: e.target.value })}
                                    placeholder="https://..."
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label style={label}>
                                    <Tag size={14} style={{ display: 'inline', marginRight: 5 }} />
                                    Tags de Interés (Pixel Targeting)
                                </label>
                                <input
                                    style={input}
                                    value={formData.tags}
                                    onChange={e => setFormData({ ...formData, tags: e.target.value })}
                                    placeholder="Ej. politica, deportes, economia (separados por coma)"
                                />
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
                                    Si dejas esto vacío, el anuncio se mostrará a todos los usuarios.
                                </div>
                            </div>

                            <button type="submit" style={saveBtn}>
                                <Save size={18} /> {editingId ? 'Actualizar Campaña' : 'Publicar Campaña'}
                            </button>
                        </form>
                    </div>

                    {/* RIGHT COLUMN: PREVIEW */}
                    <div style={{ background: '#f1f5f9', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15, color: '#64748b', fontSize: 12, fontWeight: 600 }}>
                            <Monitor size={16} /> VISTA PREVIA EN VIVO
                        </div>

                        {/* MOCK BROWSER */}
                        <div style={{ background: 'white', flex: 1, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {/* Browser Bar */}
                            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 12px', display: 'flex', gap: 6 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }}></div>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }}></div>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }}></div>
                                <div style={{ flex: 1, marginLeft: 10, background: 'white', height: 20, borderRadius: 4, border: '1px solid #cbd5e1' }}></div>
                            </div>

                            {/* Website Mockup */}
                            <div style={{ padding: 20, flex: 1, overflowY: 'auto', position: 'relative' }}>

                                {/* Header Top Position */}
                                {formData.position === 'header_top' && (
                                    <div className="animate-pulse" style={{ marginBottom: 15, textAlign: 'center', border: '2px dashed #2563eb', padding: 5, background: '#eff6ff' }}>
                                        <img src={formData.banner_url} style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }} />
                                    </div>
                                )}

                                {/* Site Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '2px solid #0f172a', paddingBottom: 10 }}>
                                    <div style={{ fontWeight: 900, fontSize: 20, color: '#0f172a' }}>24hNEWS</div>
                                    <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#64748b' }}>
                                        <span>POLÍTICA</span>
                                        <span>ECONOMÍA</span>
                                        <span>DEPORTES</span>
                                    </div>
                                </div>

                                {/* Home Top Position */}
                                {formData.position === 'home_top' && (
                                    <div className="animate-pulse" style={{ marginBottom: 20, textAlign: 'center', border: '2px dashed #2563eb', padding: 5, background: '#eff6ff' }}>
                                        <img src={formData.banner_url} style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }} />
                                    </div>
                                )}

                                {/* Main Content Area */}
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                                    {/* Left Column (Article) */}
                                    <div>
                                        {/* Article Hero Position */}
                                        {formData.position === 'article_hero' && (
                                            <div className="animate-pulse" style={{ marginBottom: 10, textAlign: 'center', border: '2px dashed #2563eb', padding: 5, background: '#eff6ff' }}>
                                                <img src={formData.banner_url} style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }} />
                                            </div>
                                        )}

                                        <div style={{ height: 150, background: '#e2e8f0', borderRadius: 8, marginBottom: 10 }}></div>
                                        <div style={{ height: 20, width: '80%', background: '#cbd5e1', marginBottom: 8, borderRadius: 4 }}></div>
                                        <div style={{ height: 10, width: '100%', background: '#f1f5f9', marginBottom: 4, borderRadius: 2 }}></div>
                                        <div style={{ height: 10, width: '100%', background: '#f1f5f9', marginBottom: 4, borderRadius: 2 }}></div>
                                        <div style={{ height: 10, width: '90%', background: '#f1f5f9', marginBottom: 20, borderRadius: 2 }}></div>

                                        {/* Article Bottom Position */}
                                        {formData.position === 'article_bottom' && (
                                            <div className="animate-pulse" style={{ marginTop: 20, textAlign: 'center', border: '2px dashed #2563eb', padding: 5, background: '#eff6ff' }}>
                                                <img src={formData.banner_url} style={{ maxWidth: '100%', maxHeight: 90, objectFit: 'contain' }} />
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Sidebar */}
                                    <div>
                                        {/* Sidebar Position */}
                                        {formData.position === 'article_sidebar' ? (
                                            <div className="animate-pulse" style={{ height: 250, border: '2px dashed #2563eb', padding: 5, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={formData.banner_url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                            </div>
                                        ) : (
                                            <div style={{ height: 250, background: '#f1f5f9', borderRadius: 8 }}></div>
                                        )}
                                        <div style={{ height: 100, background: '#f1f5f9', borderRadius: 8, marginTop: 15 }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', opacity: showCreator ? 0.6 : 1, transition: 'opacity 0.3s' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f1f5f9' }}>
                        <tr>
                            <th style={th}>Estado</th>
                            <th style={th}>Posición</th>
                            <th style={th}>Banner</th>
                            <th style={th}>Campaña / Tags</th>
                            <th style={th}>Rendimiento</th>
                            <th style={th}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={td}>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                        background: c.status === 'active' ? '#dcfce7' : '#f1f5f9',
                                        color: c.status === 'active' ? '#16a34a' : '#64748b'
                                    }}>
                                        {c.status.toUpperCase()}
                                    </span>
                                </td>
                                <td style={td}>{c.position}</td>
                                <td style={td}>
                                    <img src={c.banner_url} alt="" style={{ height: 40, borderRadius: 4, border: '1px solid #eee' }} />
                                </td>
                                <td style={td}>
                                    <div style={{ fontWeight: 600, color: '#0f172a' }}>
                                        <Link to={`/ads/campaign/${c.id}`} style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px dashed #94a3b8' }}>
                                            {c.name}
                                        </Link>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>
                                        {c.tags && c.tags.length > 0 ? (
                                            <span>🎯 Targets: {c.tags.join(', ')}</span>
                                        ) : (
                                            <span>🌐 General (Run-of-Network)</span>
                                        )}
                                    </div>
                                </td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 15 }}>
                                        <div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>Impresiones</div>
                                            <div style={{ fontWeight: 700 }}>-</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => handleEdit(c)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '8px 12px',
                                                background: '#eff6ff',
                                                color: '#2563eb',
                                                border: '1px solid #bfdbfe',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseOver={(e) => e.target.style.background = '#dbeafe'}
                                            onMouseOut={(e) => e.target.style.background = '#eff6ff'}
                                        >
                                            <Edit2 size={14} /> Editar
                                        </button>
                                        <button
                                            onClick={() => handleDelete(c.id, c.name)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '8px 12px',
                                                background: '#fef2f2',
                                                color: '#dc2626',
                                                border: '1px solid #fecaca',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseOver={(e) => e.target.style.background = '#fee2e2'}
                                            onMouseOut={(e) => e.target.style.background = '#fef2f2'}
                                        >
                                            <Trash2 size={14} /> Eliminar
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Styles
const label = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#334155' };
const input = { width: '100%', padding: '10px 15px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 };
const saveBtn = { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 10 };
const th = { textAlign: 'left', padding: '15px 20px', fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 };
const td = { padding: '15px 20px', fontSize: 14 };

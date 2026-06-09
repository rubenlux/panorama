import React, { useState, useEffect } from "react";
import { apiJson, uploadFile } from "../api";
import { useDropzone } from "react-dropzone";

function ImageUploader({ label, value, onChange }) {
    const onDrop = async (acceptedFiles) => {
        try {
            const file = acceptedFiles[0];
            const formData = new FormData();
            formData.append("file", file);
            const res = await uploadFile(formData);
            // Assuming uploadFile returns { url: ... } or check your specific implementation
            // Usually current structure returns path or url
            onChange(res.url || res.data?.url || res.path);
        } catch (e) {
            console.error("Upload failed", e);
            alert("Error al subir imagen");
        }
    };

    const { getRootProps, getInputProps } = useDropzone({ onDrop, accept: { 'image/*': [] }, multiple: false });

    return (
        <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{label}</label>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                {value && <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 5, background: 'white' }}>
                    <img src={value} style={{ height: 60, objectFit: 'contain' }} alt="Preview" />
                </div>}
                <div {...getRootProps()} style={{
                    flex: 1,
                    border: '2px dashed #cbd5e1',
                    borderRadius: 8,
                    padding: 20,
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: '#f8fafc',
                    fontSize: 13,
                    color: '#64748b'
                }}>
                    <input {...getInputProps()} />
                    <p style={{ margin: 0 }}>Arrastra una imagen o haz clic para cambiar</p>
                </div>
            </div>
        </div>
    );
}

export default function Settings() {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('general');

    useEffect(() => {
        apiJson("/settings")
            .then(res => setSettings(res.settings))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const handleChange = (key, val) => {
        setSettings(prev => ({ ...prev, [key]: val }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await apiJson("/settings/batch", {
                method: "POST",
                auth: true,
                body: { settings }
            });
            alert("Configuración guardada correctamente");
        } catch (e) {
            console.error(e);
            alert("Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Cargando...</div>;

    const tabs = [
        { id: 'general', label: 'General' },
        { id: 'appearance', label: 'Apariencia' },
        { id: 'homepage', label: 'Portada' },
        { id: 'footer', label: 'Pie de Página' },
        { id: 'social', label: 'Redes Sociales' }
    ];

    return (
        <div style={{ maxWidth: 800 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1e293b" }}>Configuración del Sitio</h1>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ background: "#2563EB", color: "white", padding: "10px 20px", border: "none", borderRadius: 8, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
                >
                    {saving ? "Guardando..." : "Guardar Cambios"}
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 20, borderBottom: '1px solid #e2e8f0' }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: '10px 20px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === t.id ? '2px solid #2563EB' : '2px solid transparent',
                            color: activeTab === t.id ? '#2563EB' : '#64748b',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <div style={{ background: "white", padding: 30, borderRadius: 16, border: '1px solid #e2e8f0' }}>

                {activeTab === 'general' && (
                    <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Título del Sitio (SEO)</label>
                            <input
                                style={styles.input}
                                value={settings.site_title || ''}
                                onChange={e => handleChange('site_title', e.target.value)}
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Email de Contacto</label>
                            <input
                                style={styles.input}
                                value={settings.contact_email || ''}
                                onChange={e => handleChange('contact_email', e.target.value)}
                            />
                        </div>
                        <div style={{ ...styles.formGroup, gridColumn: '1 / -1' }}>
                            <label style={styles.label}>Descripción del Sitio (Meta)</label>
                            <textarea
                                style={{ ...styles.input, height: 80 }}
                                value={settings.site_description || ''}
                                onChange={e => handleChange('site_description', e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'homepage' && (
                    <>
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
                            <div>
                                <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>📰 Breaking News</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Título</label>
                                    <input style={styles.input} value={settings.breaking_news_title || ''} onChange={e => handleChange('breaking_news_title', e.target.value)} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Color de Fondo</label>
                                    <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.breaking_news_bg_color || '#1f2937'} onChange={e => handleChange('breaking_news_bg_color', e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>🎬 Media of the Day</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Título</label>
                                    <input style={styles.input} value={settings.media_day_title || ''} onChange={e => handleChange('media_day_title', e.target.value)} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Color de Fondo</label>
                                    <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.media_day_bg_color || '#1f2937'} onChange={e => handleChange('media_day_bg_color', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
                            <div>
                                <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>🎁 Sponsors / Publicidad</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Título Sección</label>
                                    <input style={styles.input} value={settings.sponsors_title || ''} onChange={e => handleChange('sponsors_title', e.target.value)} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Color de Fondo</label>
                                    <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.sponsors_bg_color || '#ffffff'} onChange={e => handleChange('sponsors_bg_color', e.target.value)} />
                                </div>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Color de Línea</label>
                                    <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.sponsors_line_color || '#e2e8f0'} onChange={e => handleChange('sponsors_line_color', e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>📱 Reels (Los tenés que ver)</h3>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Título</label>
                                    <input style={styles.input} value={settings.reels_section_title || ''} onChange={e => handleChange('reels_section_title', e.target.value)} />
                                </div>
                            </div>
                        </div>

                        <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>🏁 Nueva Sección: Últimos Artículos</h3>
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Título Izquierdo</label>
                                <input style={styles.input} value={settings.latest_articles_title || ''} onChange={e => handleChange('latest_articles_title', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Título Sidebar (Temas)</label>
                                <input style={styles.input} value={settings.all_topics_title || ''} onChange={e => handleChange('all_topics_title', e.target.value)} />
                            </div>
                        </div>

                        <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>Sección Entretenimiento</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Títulos de pestañas (separados por coma)</label>
                            <input
                                style={styles.input}
                                value={settings.section_entertainment_tabs || ''}
                                onChange={e => handleChange('section_entertainment_tabs', e.target.value)}
                                placeholder="Ej: Celebridades, Cine, Música"
                            />
                        </div>
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 30 }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color Texto Etiqueta</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_entertainment_label_text_color || '#ffffff'} onChange={e => handleChange('section_entertainment_label_text_color', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color Fondo Etiqueta</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_entertainment_label_bg_color || '#2563eb'} onChange={e => handleChange('section_entertainment_label_bg_color', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color de Línea</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_entertainment_line_color || '#2563eb'} onChange={e => handleChange('section_entertainment_line_color', e.target.value)} />
                            </div>
                        </div>

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b', marginTop: 30 }}>Grilla de Categorías</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Categorías a mostrar (separadas por coma)</label>
                            <input
                                style={styles.input}
                                value={settings.section_grid_categories || ''}
                                onChange={e => handleChange('section_grid_categories', e.target.value)}
                                placeholder="Ej: Viajes, Moda, Gastronomía"
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color Texto Etiqueta</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_grid_label_text_color || '#ffffff'} onChange={e => handleChange('section_grid_label_text_color', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color Fondo Etiqueta</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_grid_label_bg_color || '#2563eb'} onChange={e => handleChange('section_grid_label_bg_color', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Color de Línea</label>
                                <input type="color" style={{ width: '100%', height: 40, border: 'none', borderRadius: 8 }} value={settings.section_grid_line_color || '#2563eb'} onChange={e => handleChange('section_grid_line_color', e.target.value)} />
                            </div>
                        </div>
                    </>
                )}

                {activeTab === 'appearance' && (
                    <>
                        <ImageUploader
                            label="Logo Principal (Header)"
                            value={settings.site_logo}
                            onChange={(url) => handleChange('site_logo', url)}
                        />
                        <ImageUploader
                            label="Logo Footer (Versión oscura/clara)"
                            value={settings.footer_logo}
                            onChange={(url) => handleChange('footer_logo', url)}
                        />
                        <ImageUploader
                            label="Favicon (Icono pestaña)"
                            value={settings.site_favicon}
                            onChange={(url) => handleChange('site_favicon', url)}
                        />
                    </>
                )}

                {activeTab === 'footer' && (
                    <>
                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>Columna 2 (Más Leídos / Popular)</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Título Columna</label>
                                <input style={styles.input} value={settings.footer_col2_title || ''} onChange={e => handleChange('footer_col2_title', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Slug de Categoría (Filtro)</label>
                                <input style={styles.input} value={settings.footer_col2_category || ''} onChange={e => handleChange('footer_col2_category', e.target.value)} />
                            </div>
                        </div>

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b', marginTop: 30 }}>Columna 3 (Temas / Discutidos)</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Título Columna</label>
                                <input style={styles.input} value={settings.footer_col3_title || ''} onChange={e => handleChange('footer_col3_title', e.target.value)} />
                            </div>
                            <div style={styles.formGroup}>
                                <label style={styles.label}>Slug de Categoría (Filtro)</label>
                                <input style={styles.input} value={settings.footer_col3_category || ''} onChange={e => handleChange('footer_col3_category', e.target.value)} />
                            </div>
                        </div>

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b', marginTop: 30 }}>Columna 4 (Tags / Etiquetas)</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Título Columna</label>
                            <input style={styles.input} value={settings.footer_tags_title || ''} onChange={e => handleChange('footer_tags_title', e.target.value)} />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Tags a mostrar (separados por coma)</label>
                            <input
                                style={styles.input}
                                value={settings.footer_selected_tags || ''}
                                onChange={e => handleChange('footer_selected_tags', e.target.value)}
                                placeholder="Ej: tecnologia, deporte, cine"
                            />
                            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>* Recuerda marcarlos como 'Es Etiqueta' en el panel de Categorías.</p>
                        </div>

                        <hr style={{ margin: '30px 0', border: 'none', borderTop: '1px solid #e2e8f0' }} />

                        <h3 style={{ fontSize: 16, marginBottom: 15, color: '#1e293b' }}>Barra Inferior (Copyright)</h3>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Texto de Copyright</label>
                            <input style={styles.input} value={settings.footer_copyright_text || ''} onChange={e => handleChange('footer_copyright_text', e.target.value)} />
                        </div>
                    </>
                )}

                {activeTab === 'social' && (
                    <>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Twitter URL</label>
                            <input
                                style={styles.input}
                                value={settings.social_twitter || ''}
                                onChange={e => handleChange('social_twitter', e.target.value)}
                                placeholder="https://twitter.com/..."
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Facebook URL</label>
                            <input
                                style={styles.input}
                                value={settings.social_facebook || ''}
                                onChange={e => handleChange('social_facebook', e.target.value)}
                                placeholder="https://facebook.com/..."
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>Instagram URL</label>
                            <input
                                style={styles.input}
                                value={settings.social_instagram || ''}
                                onChange={e => handleChange('social_instagram', e.target.value)}
                                placeholder="https://instagram.com/..."
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>TikTok URL</label>
                            <input
                                style={styles.input}
                                value={settings.social_tiktok || ''}
                                onChange={e => handleChange('social_tiktok', e.target.value)}
                                placeholder="https://tiktok.com/..."
                            />
                        </div>
                        <div style={styles.formGroup}>
                            <label style={styles.label}>YouTube URL</label>
                            <input
                                style={styles.input}
                                value={settings.social_youtube || ''}
                                onChange={e => handleChange('social_youtube', e.target.value)}
                                placeholder="https://youtube.com/..."
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

const styles = {
    formGroup: { marginBottom: 24 },
    label: { display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 14 }
};

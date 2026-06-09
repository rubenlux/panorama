import React, { useState } from "react";
import { apiJson } from "../api";
import { X, RefreshCw, CheckCircle, AlertTriangle, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";

export default function AiAnalysisPanel({ article, onClose, onRewrite }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [activeTab, setActiveTab] = useState("seo");
    const [error, setError] = useState(null);
    const [collapsed, setCollapsed] = useState(false);

    const handleAnalyze = async () => {
        setLoading(true);
        setError(null);
        try {
            // Gather data from parent
            // Note: article prop should contain title, body, etc. 
            const payload = {
                article: {
                    title: article.title,
                    volanta: article.volanta,
                    slug: article.slug,
                    excerpt: article.excerpt,
                    categorySlugs: article.categorySlugs,
                    image_url: article.image_url,
                    epigraph: article.epigraph,
                    keywords: article.keywords,
                    // Ensure body is sending the HTML content
                    body: article.editor?.getHTML() || article.body
                },
                primary_keyword: article.keywords // Assuming keyword field is used as primary
            };

            const data = await apiJson("/ai/analyze", {
                method: "POST",
                body: payload,
                auth: true
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            setError("Error al analizar. Verifica que el backend esté corriendo y la KEY sea válida.");
        } finally {
            setLoading(false);
        }
    };

    const handleRewrite = async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = {
                article: {
                    title: article.title,
                    volanta: article.volanta,
                    excerpt: article.excerpt,
                    // Use getHTML if possible to get current content
                    body: article.editor?.getHTML() || article.body
                }
            };

            const data = await apiJson("/ai/rewrite", {
                method: "POST",
                body: payload,
                auth: true
            });

            if (onRewrite) {
                onRewrite(data);
            } else {
                alert("Redacción mejorada recibida (Falta handler).");
                console.log("Rewritten data:", data);
            }
            // Close panel to let user see changes
            onClose();

        } catch (err) {
            console.error(err);
            setError("Error al reescribir. Verifica el backend.");
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score) => {
        if (score >= 80) return "#22c55e"; // Green
        if (score >= 50) return "#eab308"; // Yellow
        return "#ef4444"; // Red
    };

    if (collapsed) {
        return (
            <div style={{
                position: 'fixed', right: 0, top: 80, zIndex: 1000,
                background: 'white', border: '1px solid #e2e8f0',
                borderRight: 'none', borderRadius: '8px 0 0 8px',
                padding: 8, boxShadow: '-2px 0 10px rgba(0,0,0,0.05)',
                cursor: 'pointer'
            }} onClick={() => setCollapsed(false)} title="Expandir Panel IA">
                <ChevronLeft size={20} color="#6366f1" />
            </div>
        );
    }

    if (!result && !loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h3>Asistente IA 🤖</h3>
                    <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => setCollapsed(true)} style={styles.closeBtn} title="Minimizar"><ChevronRight size={20} /></button>
                        <button onClick={onClose} style={styles.closeBtn}><X size={20} /></button>
                    </div>
                </div>
                <div style={styles.emptyState}>
                    <p style={{ marginBottom: 20, color: '#666' }}>Analiza tu noticia con <b>Claude 3.5 Sonnet</b> para obtener feedback de SEO, legibilidad y estructura.</p>
                    {error && <div style={styles.error}>{error}</div>}
                    <button onClick={handleAnalyze} style={styles.analyzeBtn}>
                        ✨ Iniciar Análisis
                    </button>
                    <div style={{ margin: "10px 0", fontSize: 12, color: "#888" }}>- O -</div>
                    <button onClick={handleRewrite} style={{ ...styles.analyzeBtn, background: "#10b981" }}>
                        🪄 Corrección Automática
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <h3>Analizando...</h3>
                </div>
                <div style={{ ...styles.emptyState, justifyContent: 'center' }}>
                    <div className="spinner" style={styles.spinner}></div>
                    <p style={{ marginTop: 20 }}>Leyendo artículo...</p>
                </div>
                <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h3 style={{ margin: 0 }}>Reporte IA</h3>
                    <span style={{
                        background: getScoreColor(result.overall_score),
                        color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 'bold'
                    }}>
                        {result.overall_score}/100
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => setCollapsed(true)} style={styles.closeBtn} title="Minimizar"><ChevronRight size={20} /></button>
                    <button onClick={handleAnalyze} style={styles.iconBtn} title="Re-analizar"><RefreshCw size={18} /></button>
                    <button onClick={onClose} style={styles.closeBtn} title="Cerrar"><X size={20} /></button>
                </div>
            </div>

            <div style={styles.tabs}>
                {['seo', 'readability', 'structure', 'keywords'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            ...styles.tab,
                            borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                            color: activeTab === tab ? '#2563eb' : '#64748b'
                        }}
                    >
                        {tab === 'seo' && 'SEO'}
                        {tab === 'readability' && 'Legibilidad'}
                        {tab === 'structure' && 'Estructura'}
                        {tab === 'keywords' && 'Keywords'}
                    </button>
                ))}
            </div>

            <div style={styles.content}>
                {activeTab === 'seo' && (
                    <SectionReport
                        title="Auditoría SEO"
                        score={result.seo_audit.score}
                        issues={result.seo_audit.critical_issues}
                        warnings={result.seo_audit.warnings}
                        recommendations={result.seo_audit.recommendations}
                    />
                )}
                {activeTab === 'readability' && (
                    <SectionReport
                        title="Legibilidad"
                        score={result.readability_analysis.score}
                        issues={result.readability_analysis.long_sentences} // Mapping issues loosely
                        warnings={result.readability_analysis.passive_voice_warnings}
                        recommendations={result.readability_analysis.recommendations}
                    />
                )}
                {activeTab === 'structure' && (
                    <SectionReport
                        title="Estructura"
                        score={result.content_structure.scannability_score}
                        issues={result.content_structure.heading_issues}
                        warnings={result.content_structure.missing_subheadings}
                        recommendations={result.content_structure.recommendations}
                    />
                )}
                {activeTab === 'keywords' && (
                    <div>
                        <p><b>Keyword Principal:</b> {result.keyword_analysis.primary_keyword_status}</p>
                        <div style={{ marginTop: 10 }}>
                            <strong>Sugerencias Long Tail:</strong>
                            <ul style={{ paddingLeft: 20 }}>
                                {result.keyword_analysis.long_tail_suggestions.map((k, i) => <li key={i}>{k}</li>)}
                            </ul>
                        </div>
                        <SectionReport
                            title=""
                            score={null}
                            issues={result.keyword_analysis.over_optimization_warnings}
                            warnings={result.keyword_analysis.missing_keywords}
                            recommendations={[]}
                        />
                    </div>
                )}
            </div>

            <div style={{ padding: 15, borderTop: '1px solid #eee', background: '#f8fafc' }}>
                <h4 style={{ marginTop: 0, fontSize: 14 }}>Acciones Prioritarias:</h4>
                <ul style={{ fontSize: 13, paddingLeft: 20, color: '#475569' }}>
                    {result.final_summary.top_3_actions.map((act, i) => (
                        <li key={i}>{act}</li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function SectionReport({ title, score, issues = [], warnings = [], recommendations = [] }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {title && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 14 }}>{title}</strong>
                    {score !== null && <span style={{ fontSize: 12, fontWeight: 'bold' }}>{score}/100</span>}
                </div>
            )}

            {issues.length > 0 && (
                <div style={{ background: '#fef2f2', padding: 10, borderRadius: 6, border: '1px solid #fee2e2' }}>
                    <div style={{ color: '#991b1b', fontSize: 12, fontWeight: 'bold', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertCircle size={14} /> Crítico
                    </div>
                    {issues.map((msg, i) => <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 4 }}>• {msg}</div>)}
                </div>
            )}

            {warnings.length > 0 && (
                <div style={{ background: '#fffbeb', padding: 10, borderRadius: 6, border: '1px solid #fef3c7' }}>
                    <div style={{ color: '#92400e', fontSize: 12, fontWeight: 'bold', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <AlertTriangle size={14} /> Advertencias
                    </div>
                    {warnings.map((msg, i) => <div key={i} style={{ fontSize: 12, color: '#92400e', marginBottom: 4 }}>• {msg}</div>)}
                </div>
            )}

            {recommendations.length > 0 && (
                <div style={{ background: '#f0fdf4', padding: 10, borderRadius: 6, border: '1px solid #dcfce7' }}>
                    <div style={{ color: '#166534', fontSize: 12, fontWeight: 'bold', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <CheckCircle size={14} /> Recomendaciones
                    </div>
                    {recommendations.map((msg, i) => <div key={i} style={{ fontSize: 12, color: '#166534', marginBottom: 4 }}>• {msg}</div>)}
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        width: 350,
        height: '100%',
        background: 'white',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 15px rgba(0,0,0,0.05)',
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 1000
    },
    header: {
        padding: 15,
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#f8fafc'
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#64748b'
    },
    iconBtn: {
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#64748b'
    },
    emptyState: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 30,
        textAlign: 'center'
    },
    analyzeBtn: {
        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: 8,
        fontWeight: 'bold',
        cursor: 'pointer',
        fontSize: 14,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    },
    spinner: {
        width: 30,
        height: 30,
        border: '3px solid #f3f3f3',
        borderTop: '3px solid #6366f1',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
    },
    tabs: {
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        background: 'white'
    },
    tab: {
        flex: 1,
        background: 'none',
        border: 'none',
        padding: '12px 0',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer'
    },
    content: {
        flex: 1,
        overflowY: 'auto',
        padding: 15
    },
    error: {
        color: 'red',
        fontSize: 12,
        marginBottom: 10,
        padding: 10,
        background: '#fee2e2',
        borderRadius: 4
    }
};

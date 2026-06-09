import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiJson, apiUpload } from "../api.js";
import { Sparkles, RefreshCw, FileText, Shuffle, Mic, Send, Save, Trash2, AlertCircle, Upload, Loader } from "lucide-react";

export default function EditorialStudio() {
    const navigate = useNavigate();
    const [mode, setMode] = useState("create"); // create | reformulate | structure | audio
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Create mode states
    const [topic, setTopic] = useState("");
    const [articleType, setArticleType] = useState("breaking");
    const [country, setCountry] = useState("Argentina");
    const [targetAudience, setTargetAudience] = useState("General");
    const [additionalContext, setAdditionalContext] = useState("");

    // Reformulate mode states
    const [originalTitle, setOriginalTitle] = useState("");
    const [originalVolanta, setOriginalVolanta] = useState("");
    const [originalExcerpt, setOriginalExcerpt] = useState("");
    const [originalBody, setOriginalBody] = useState("");
    const [objective, setObjective] = useState("seo");
    const [instructions, setInstructions] = useState("");
    const [newData, setNewData] = useState("");

    // Structure mode states
    const [rawData, setRawData] = useState("");
    const [category, setCategory] = useState("General");
    const [expectedType, setExpectedType] = useState("breaking");

    // Audio mode states
    const [transcript, setTranscript] = useState("");
    const [audioType, setAudioType] = useState("field-report");
    const [speakers, setSpeakers] = useState("");
    const [location, setLocation] = useState("");
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [transcribing, setTranscribing] = useState(false);

    const handleCreateDraft = async () => {
        if (!topic.trim()) {
            setError("Por favor ingresa un tema");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await apiJson("/editorial-studio/create-draft", {
                method: "POST",
                body: { topic, articleType, country, targetAudience, additionalContext },
                auth: true
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            setError("Error al crear borrador. Verifica que el backend esté corriendo.");
        } finally {
            setLoading(false);
        }
    };

    const handleReformulate = async () => {
        if (!originalTitle.trim() || !originalBody.trim()) {
            setError("Por favor ingresa al menos título y cuerpo del artículo original");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await apiJson("/editorial-studio/reformulate", {
                method: "POST",
                body: {
                    original: {
                        title: originalTitle,
                        volanta: originalVolanta,
                        excerpt: originalExcerpt,
                        body: originalBody
                    },
                    objective,
                    instructions,
                    newData
                },
                auth: true
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            setError("Error al reformular artículo.");
        } finally {
            setLoading(false);
        }
    };

    const handleStructureData = async () => {
        if (!rawData.trim()) {
            setError("Por favor ingresa datos para estructurar");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await apiJson("/editorial-studio/structure-data", {
                method: "POST",
                body: {
                    rawData,
                    context: { category, expectedType, country }
                },
                auth: true
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            setError("Error al estructurar datos.");
        } finally {
            setLoading(false);
        }
    };

    const handleFromAudio = async () => {
        if (!transcript.trim()) {
            setError("Por favor ingresa la transcripción del audio");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const data = await apiJson("/editorial-studio/from-audio", {
                method: "POST",
                body: {
                    transcript,
                    context: {
                        audioType,
                        speakers: speakers ? speakers.split(",").map(s => s.trim()) : [],
                        category,
                        location,
                        date
                    }
                },
                auth: true
            });
            setResult(data);
        } catch (err) {
            console.error(err);
            setError("Error al crear artículo desde audio.");
        } finally {
            setLoading(false);
        }
    };

    const handleAudioTranscription = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setTranscribing(true);
        setError(null);
        try {
            const data = await apiUpload("/editorial-studio/transcribe", file, { fieldName: "audio" });
            if (data.transcript) {
                setTranscript(data.transcript);
            }
        } catch (err) {
            console.error(err);
            setError("Error al transcribir audio. " + err.message);
        } finally {
            setTranscribing(false);
        }
    };

    const handleSendToEditor = () => {
        // Navigate to PostEditor with pre-filled data
        const article = mode === "reformulate" ? result.reformulated : (result.article || result);

        navigate("/posts/new", {
            state: {
                prefilled: {
                    title: article.title,
                    volanta: article.volanta || "",
                    excerpt: article.excerpt || "",
                    body: article.body
                }
            }
        });
    };

    const handleDiscard = () => {
        setResult(null);
        setError(null);
        // Reset form fields based on mode
        if (mode === "create") {
            setTopic("");
            setAdditionalContext("");
        } else if (mode === "reformulate") {
            setOriginalTitle("");
            setOriginalVolanta("");
            setOriginalExcerpt("");
            setOriginalBody("");
            setInstructions("");
            setNewData("");
        } else if (mode === "structure") {
            setRawData("");
        } else if (mode === "audio") {
            setTranscript("");
            setSpeakers("");
            setLocation("");
        }
    };

    const getConfidenceBadge = (confidence) => {
        const colors = {
            high: { bg: "#dcfce7", color: "#166534", label: "Alta confianza" },
            medium: { bg: "#fef3c7", color: "#92400e", label: "Requiere verificación" },
            low: { bg: "#fee2e2", color: "#991b1b", label: "Información incompleta" }
        };
        const conf = colors[confidence] || colors.medium;
        return (
            <span style={{
                background: conf.bg,
                color: conf.color,
                padding: "4px 12px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: "bold"
            }}>
                {conf.label}
            </span>
        );
    };

    const wordCount = (text) => {
        if (!text) return 0;
        return text.replace(/<[^>]*>/g, "").split(/\s+/).filter(Boolean).length;
    };

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>
                        <Sparkles size={28} style={{ marginRight: 10, color: "#6366f1" }} />
                        Editorial AI Studio
                    </h1>
                    <p style={styles.subtitle}>Asistente de Producción Editorial</p>
                </div>
            </div>

            {/* Mode Selector */}
            <div className="responsive-grid" style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                marginBottom: 30,
                borderBottom: "2px solid #e2e8f0",
                paddingBottom: 20
            }}>
                <button
                    onClick={() => { setMode("create"); setResult(null); setError(null); }}
                    style={{
                        ...styles.modeBtn,
                        ...(mode === "create" ? styles.modeBtnActive : {})
                    }}
                >
                    <FileText size={18} />
                    <span>Crear Borrador</span>
                </button>
                <button
                    onClick={() => { setMode("reformulate"); setResult(null); setError(null); }}
                    style={{
                        ...styles.modeBtn,
                        ...(mode === "reformulate" ? styles.modeBtnActive : {})
                    }}
                >
                    <RefreshCw size={18} />
                    <span>Reformular</span>
                </button>
                <button
                    onClick={() => { setMode("structure"); setResult(null); setError(null); }}
                    style={{
                        ...styles.modeBtn,
                        ...(mode === "structure" ? styles.modeBtnActive : {})
                    }}
                >
                    <Shuffle size={18} />
                    <span>Ordenar Información</span>
                </button>
                <button
                    onClick={() => { setMode("audio"); setResult(null); setError(null); }}
                    style={{
                        ...styles.modeBtn,
                        ...(mode === "audio" ? styles.modeBtnActive : {})
                    }}
                >
                    <Mic size={18} />
                    <span>Desde Audio</span>
                </button>
            </div>

            {/* Main Content Area */}
            <div style={styles.content}>
                {!result && !loading && (
                    <div style={styles.formArea}>
                        {/* CREATE MODE */}
                        {mode === "create" && (
                            <div style={styles.form}>
                                <h3 style={styles.formTitle}>✍ Crear Borrador desde Tema</h3>

                                <label style={styles.label}>Tema / Hecho Noticioso *</label>
                                <textarea
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="Ej: Nuevo aumento de tarifas de luz en Argentina"
                                    style={{ ...styles.textarea, height: 100 }}
                                />

                                <div style={styles.row}>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Tipo de Nota</label>
                                        <select value={articleType} onChange={(e) => setArticleType(e.target.value)} style={styles.select}>
                                            <option value="breaking">🔴 Última hora</option>
                                            <option value="explainer">📊 Explicativa</option>
                                            <option value="analysis">🔍 Análisis</option>
                                            <option value="evergreen">📚 Evergreen</option>
                                        </select>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>País/Región</label>
                                        <input
                                            type="text"
                                            value={country}
                                            onChange={(e) => setCountry(e.target.value)}
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                <label style={styles.label}>Público Objetivo</label>
                                <select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} style={styles.select}>
                                    <option value="General">General</option>
                                    <option value="Especializado">Especializado</option>
                                    <option value="Joven">Joven</option>
                                </select>

                                <label style={styles.label}>Contexto Adicional (opcional)</label>
                                <textarea
                                    value={additionalContext}
                                    onChange={(e) => setAdditionalContext(e.target.value)}
                                    placeholder="Información adicional que ayude a contextualizar..."
                                    style={{ ...styles.textarea, height: 80 }}
                                />

                                {error && <div style={styles.error}>{error}</div>}

                                <button onClick={handleCreateDraft} style={styles.primaryBtn}>
                                    <Sparkles size={18} />
                                    Crear Borrador Asistido
                                </button>
                            </div>
                        )}

                        {/* REFORMULATE MODE */}
                        {mode === "reformulate" && (
                            <div style={styles.form}>
                                <h3 style={styles.formTitle}>🔄 Reformular Artículo Existente</h3>

                                <label style={styles.label}>Título Original *</label>
                                <input
                                    type="text"
                                    value={originalTitle}
                                    onChange={(e) => setOriginalTitle(e.target.value)}
                                    placeholder="Título del artículo original"
                                    style={styles.input}
                                />

                                <div style={styles.row}>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Volanta</label>
                                        <input
                                            type="text"
                                            value={originalVolanta}
                                            onChange={(e) => setOriginalVolanta(e.target.value)}
                                            placeholder="Volanta (opcional)"
                                            style={styles.input}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Copete/Excerpt</label>
                                        <input
                                            type="text"
                                            value={originalExcerpt}
                                            onChange={(e) => setOriginalExcerpt(e.target.value)}
                                            placeholder="Copete (opcional)"
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                <label style={styles.label}>Cuerpo del Artículo *</label>
                                <textarea
                                    value={originalBody}
                                    onChange={(e) => setOriginalBody(e.target.value)}
                                    placeholder="Pega aquí el cuerpo del artículo original..."
                                    style={{ ...styles.textarea, height: 150 }}
                                />

                                <label style={styles.label}>Objetivo de Reformulación</label>
                                <select value={objective} onChange={(e) => setObjective(e.target.value)} style={styles.select}>
                                    <option value="seo">🎯 Mejorar SEO</option>
                                    <option value="shorten">✂️ Acortar</option>
                                    <option value="discover">📱 Adaptar para Google Discover</option>
                                    <option value="tone-change">🎨 Cambiar tono</option>
                                    <option value="update">🔄 Actualizar con nuevos datos</option>
                                </select>

                                <label style={styles.label}>Instrucciones Específicas (opcional)</label>
                                <textarea
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    placeholder="Instrucciones adicionales para la reformulación..."
                                    style={{ ...styles.textarea, height: 60 }}
                                />

                                {objective === "update" && (
                                    <>
                                        <label style={styles.label}>Nuevos Datos a Incorporar</label>
                                        <textarea
                                            value={newData}
                                            onChange={(e) => setNewData(e.target.value)}
                                            placeholder="Nuevos datos o información a agregar..."
                                            style={{ ...styles.textarea, height: 80 }}
                                        />
                                    </>
                                )}

                                {error && <div style={styles.error}>{error}</div>}

                                <button onClick={handleReformulate} style={styles.primaryBtn}>
                                    <RefreshCw size={18} />
                                    Reformular Contenido
                                </button>
                            </div>
                        )}

                        {/* STRUCTURE MODE */}
                        {mode === "structure" && (
                            <div style={styles.form}>
                                <h3 style={styles.formTitle}>🧩 Ordenar Información Desordenada</h3>

                                <label style={styles.label}>Datos Desordenados *</label>
                                <textarea
                                    value={rawData}
                                    onChange={(e) => setRawData(e.target.value)}
                                    placeholder={`Pega aquí datos desordenados:
- Copia de WhatsApp
- Bullet points
- Cable de agencia
- Notas internas
- Mezcla de todo`}
                                    style={{ ...styles.textarea, height: 200 }}
                                />

                                <div style={styles.row}>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Categoría</label>
                                        <input
                                            type="text"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            placeholder="Ej: Política"
                                            style={styles.input}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Tipo Esperado</label>
                                        <select value={expectedType} onChange={(e) => setExpectedType(e.target.value)} style={styles.select}>
                                            <option value="breaking">Última hora</option>
                                            <option value="analysis">Análisis</option>
                                            <option value="report">Reporte</option>
                                        </select>
                                    </div>
                                </div>

                                {error && <div style={styles.error}>{error}</div>}

                                <button onClick={handleStructureData} style={styles.primaryBtn}>
                                    <Shuffle size={18} />
                                    Estructurar Contenido
                                </button>
                            </div>
                        )}

                        {/* AUDIO MODE */}
                        {mode === "audio" && (
                            <div style={styles.form}>
                                <h3 style={styles.formTitle}>🎙 Crear Noticia desde Audio</h3>

                                <div style={{ ...styles.note, marginBottom: 20 }}>
                                    <Sparkles size={16} color="#6366f1" />
                                    <span style={{ fontWeight: 600 }}>¡Nuevo! Transcripción Automática con Whisper</span>
                                </div>

                                <div style={{
                                    border: "2px dashed #e2e8f0",
                                    borderRadius: 12,
                                    padding: 30,
                                    textAlign: "center",
                                    marginBottom: 20,
                                    background: transcribing ? "#f8fafc" : "transparent",
                                    cursor: transcribing ? "default" : "pointer"
                                }} onClick={() => !transcribing && document.getElementById('audio-upload').click()}>
                                    <input
                                        id="audio-upload"
                                        type="file"
                                        accept="audio/*"
                                        style={{ display: "none" }}
                                        onChange={handleAudioTranscription}
                                        disabled={transcribing}
                                    />
                                    {transcribing ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <div style={{ ...styles.spinner, width: 30, height: 30 }}></div>
                                            <span style={{ fontWeight: 600, color: "#6366f1" }}>Transcribiendo con Whisper...</span>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                                            <Upload size={32} color="#94a3b8" />
                                            <span style={{ fontWeight: 600, color: "#475569" }}>Sube un archivo de audio (MP3, WAV, M4A)</span>
                                            <span style={{ fontSize: 12, color: "#94a3b8" }}>O pega la transcripción manualmente abajo</span>
                                        </div>
                                    )}
                                </div>

                                <label style={styles.label}>Transcripción del Audio *</label>
                                <textarea
                                    value={transcript}
                                    onChange={(e) => setTranscript(e.target.value)}
                                    placeholder="Pega aquí la transcripción del audio..."
                                    style={{ ...styles.textarea, height: 200 }}
                                />

                                <label style={styles.label}>Tipo de Audio</label>
                                <select value={audioType} onChange={(e) => setAudioType(e.target.value)} style={styles.select}>
                                    <option value="interview">🎤 Entrevista</option>
                                    <option value="statement">📢 Declaración</option>
                                    <option value="conference">🎓 Conferencia</option>
                                    <option value="testimony">👥 Testimonio</option>
                                    <option value="field-report">📍 Reporte desde el lugar</option>
                                </select>

                                <div style={styles.row}>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Speakers (separados por coma)</label>
                                        <input
                                            type="text"
                                            value={speakers}
                                            onChange={(e) => setSpeakers(e.target.value)}
                                            placeholder="Ej: Juan Pérez, María González"
                                            style={styles.input}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Ubicación</label>
                                        <input
                                            type="text"
                                            value={location}
                                            onChange={(e) => setLocation(e.target.value)}
                                            placeholder="Ej: Buenos Aires"
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                <div style={styles.row}>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Categoría</label>
                                        <input
                                            type="text"
                                            value={category}
                                            onChange={(e) => setCategory(e.target.value)}
                                            placeholder="Ej: Política"
                                            style={styles.input}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={styles.label}>Fecha</label>
                                        <input
                                            type="date"
                                            value={date}
                                            onChange={(e) => setDate(e.target.value)}
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                {error && <div style={styles.error}>{error}</div>}

                                <button onClick={handleFromAudio} style={styles.primaryBtn}>
                                    <Mic size={18} />
                                    Crear Noticia desde Audio
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div style={styles.loadingState}>
                        <div style={styles.spinner}></div>
                        <p style={{ marginTop: 20, color: "#64748b" }}>Procesando con Claude 4.5 Sonnet...</p>
                        <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
                    </div>
                )}

                {/* Result Preview */}
                {result && !loading && (
                    <div style={styles.resultArea}>
                        <div style={styles.resultHeader}>
                            <h3 style={{ margin: 0 }}>Preview del Borrador</h3>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                {result.confidence && getConfidenceBadge(result.confidence)}
                                <button onClick={() => setResult(null)} style={styles.iconBtn}>
                                    <RefreshCw size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Article Preview */}
                        <div style={styles.preview}>
                            {mode === "reformulate" && result.reformulated ? (
                                <>
                                    <div style={styles.previewSection}>
                                        <strong>Volanta:</strong> {result.reformulated.volanta}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Título:</strong> {result.reformulated.title}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Copete:</strong> {result.reformulated.excerpt}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Cuerpo:</strong>
                                        <div dangerouslySetInnerHTML={{ __html: result.reformulated.body }} />
                                    </div>

                                    {/* ChangeLog */}
                                    {result.changeLog && (
                                        <div style={styles.changelog}>
                                            <h4>Registro de Cambios</h4>
                                            {result.changeLog.modified && result.changeLog.modified.length > 0 && (
                                                <div style={styles.changeSection}>
                                                    <strong>✏️ Modificado:</strong>
                                                    <ul>
                                                        {result.changeLog.modified.map((item, i) => <li key={i}>{item}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {result.changeLog.removed && result.changeLog.removed.length > 0 && (
                                                <div style={styles.changeSection}>
                                                    <strong>❌ Eliminado:</strong>
                                                    <ul>
                                                        {result.changeLog.removed.map((item, i) => <li key={i}>{item}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {result.changeLog.improved && result.changeLog.improved.length > 0 && (
                                                <div style={styles.changeSection}>
                                                    <strong>✅ Mejorado:</strong>
                                                    <ul>
                                                        {result.changeLog.improved.map((item, i) => <li key={i}>{item}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : result.article ? (
                                <>
                                    <div style={styles.previewSection}>
                                        <strong>Volanta:</strong> {result.article.volanta}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Título:</strong> {result.article.title}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Copete:</strong> {result.article.excerpt}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Cuerpo:</strong>
                                        <div dangerouslySetInnerHTML={{ __html: result.article.body }} />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={styles.previewSection}>
                                        <strong>Volanta:</strong> {result.volanta}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Título:</strong> {result.title}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Copete:</strong> {result.excerpt}
                                    </div>
                                    <div style={styles.previewSection}>
                                        <strong>Cuerpo:</strong>
                                        <div dangerouslySetInnerHTML={{ __html: result.body }} />
                                    </div>
                                </>
                            )}

                            {/* Verification Notes */}
                            {result.verificationNotes && result.verificationNotes.length > 0 && (
                                <div style={styles.verificationNotes}>
                                    <h4>⚠️ Notas de Verificación</h4>
                                    <ul>
                                        {result.verificationNotes.map((note, i) => (
                                            <li key={i} style={{ color: "#92400e" }}>{note}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Warnings (for structure mode) */}
                            {result.warnings && result.warnings.length > 0 && (
                                <div style={styles.verificationNotes}>
                                    <h4>⚠️ Advertencias</h4>
                                    <ul>
                                        {result.warnings.map((warning, i) => (
                                            <li key={i} style={{ color: "#92400e" }}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Audio Analysis */}
                            {result.analysis && (
                                <div style={styles.audioAnalysis}>
                                    <h4>Análisis del Audio</h4>
                                    <p><strong>Tipo:</strong> {result.analysis.type}</p>
                                    {result.analysis.speakers && <p><strong>Speakers:</strong> {result.analysis.speakers.join(", ")}</p>}
                                    {result.analysis.mainTopics && <p><strong>Temas:</strong> {result.analysis.mainTopics.join(", ")}</p>}
                                </div>
                            )}

                            {/* Stats */}
                            <div style={styles.stats}>
                                <div style={styles.stat}>
                                    <span style={styles.statLabel}>Palabras:</span>
                                    <span style={styles.statValue}>
                                        {wordCount((mode === "reformulate" ? result.reformulated?.body : result.article?.body || result.body))}
                                    </span>
                                </div>
                                <div style={styles.stat}>
                                    <span style={styles.statLabel}>Caracteres (título):</span>
                                    <span style={styles.statValue}>
                                        {(mode === "reformulate" ? result.reformulated?.title : result.article?.title || result.title)?.length || 0}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Disclaimer */}
                        <div style={styles.disclaimer}>
                            <AlertCircle size={16} />
                            <span>Este contenido requiere revisión editorial antes de publicarse</span>
                        </div>

                        {/* Action Buttons */}
                        <div style={styles.actions}>
                            <button onClick={handleSendToEditor} style={styles.sendBtn}>
                                <Send size={18} />
                                Enviar al Editor
                            </button>
                            <button onClick={handleDiscard} style={styles.discardBtn}>
                                <Trash2 size={18} />
                                Descartar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        maxWidth: 1200,
        margin: "0 auto",
        padding: "16px"
    },
    header: {
        marginBottom: 30
    },
    title: {
        fontSize: 32,
        fontWeight: "bold",
        margin: 0,
        display: "flex",
        alignItems: "center",
        color: "#1e293b"
    },
    subtitle: {
        fontSize: 16,
        color: "#64748b",
        margin: "8px 0 0 0"
    },
    modeSelector: {
        display: "flex",
        gap: 10,
        marginBottom: 30,
        borderBottom: "2px solid #e2e8f0",
        paddingBottom: 10,
        flexWrap: "wrap"
    },
    modeBtn: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "12px 20px",
        background: "white",
        border: "2px solid #e2e8f0",
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 600,
        color: "#64748b",
        transition: "all 0.2s"
    },
    modeBtnActive: {
        background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
        color: "white",
        borderColor: "#6366f1"
    },
    content: {
        minHeight: 400
    },
    formArea: {
        background: "white",
        borderRadius: 12,
        padding: 30,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
    },
    form: {
        maxWidth: 800,
        margin: "0 auto"
    },
    formTitle: {
        fontSize: 20,
        fontWeight: "bold",
        marginBottom: 20,
        color: "#1e293b"
    },
    label: {
        display: "block",
        fontSize: 13,
        fontWeight: 600,
        color: "#475569",
        marginBottom: 6,
        marginTop: 16
    },
    input: {
        width: "100%",
        padding: "10px 14px",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit"
    },
    textarea: {
        width: "100%",
        padding: "10px 14px",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit",
        resize: "vertical"
    },
    select: {
        width: "100%",
        padding: "10px 14px",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        fontSize: 14,
        fontFamily: "inherit",
        background: "white"
    },
    row: {
        display: "flex",
        gap: 16,
        marginTop: 16
    },
    note: {
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: "#1e40af",
        marginBottom: 20
    },
    error: {
        background: "#fee2e2",
        border: "1px solid #fecaca",
        borderRadius: 6,
        padding: 12,
        color: "#991b1b",
        fontSize: 13,
        marginTop: 16
    },
    primaryBtn: {
        marginTop: 24,
        padding: "12px 24px",
        background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
        color: "white",
        border: "none",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: "bold",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
    },
    loadingState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 300
    },
    spinner: {
        width: 40,
        height: 40,
        border: "4px solid #f3f4f6",
        borderTop: "4px solid #6366f1",
        borderRadius: "50%",
        animation: "spin 1s linear infinite"
    },
    resultArea: {
        background: "white",
        borderRadius: 12,
        padding: 30,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
    },
    resultHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20,
        paddingBottom: 15,
        borderBottom: "2px solid #e2e8f0"
    },
    iconBtn: {
        background: "none",
        border: "1px solid #e2e8f0",
        borderRadius: 6,
        padding: 8,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        color: "#64748b"
    },
    preview: {
        background: "#f8fafc",
        borderRadius: 8,
        padding: 20,
        marginBottom: 20
    },
    previewSection: {
        marginBottom: 16,
        fontSize: 14,
        lineHeight: 1.6
    },
    verificationNotes: {
        background: "#fffbeb",
        border: "1px solid #fef3c7",
        borderRadius: 6,
        padding: 16,
        marginTop: 20,
        fontSize: 13
    },
    audioAnalysis: {
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        borderRadius: 6,
        padding: 16,
        marginTop: 20,
        fontSize: 13
    },
    changelog: {
        background: "#f0fdf4",
        border: "1px solid #bbf7d0",
        borderRadius: 6,
        padding: 16,
        marginTop: 20,
        fontSize: 13
    },
    changeSection: {
        marginBottom: 12
    },
    stats: {
        display: "flex",
        gap: 30,
        marginTop: 20,
        paddingTop: 16,
        borderTop: "1px solid #e2e8f0"
    },
    stat: {
        display: "flex",
        flexDirection: "column",
        gap: 4
    },
    statLabel: {
        fontSize: 12,
        color: "#64748b",
        fontWeight: 600
    },
    statValue: {
        fontSize: 18,
        fontWeight: "bold",
        color: "#1e293b"
    },
    disclaimer: {
        background: "#fef3c7",
        border: "1px solid #fde047",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        color: "#92400e",
        fontWeight: 600,
        marginBottom: 20
    },
    actions: {
        display: "flex",
        gap: 12
    },
    sendBtn: {
        flex: 1,
        padding: "14px 24px",
        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        color: "white",
        border: "none",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: "bold",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8
    },
    discardBtn: {
        padding: "14px 24px",
        background: "white",
        color: "#64748b",
        border: "2px solid #e2e8f0",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: "bold",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8
    }
};

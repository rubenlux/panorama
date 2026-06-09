import React, { useState, useEffect } from 'react';
import { apiJson } from '../api';
import { Pixel } from '../utils/pixel';
import './CommentsSection.css';

const CommentsSection = ({ articleSlug, articleId }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [authorName, setAuthorName] = useState('');
    const [body, setBody] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        fetchComments();
    }, [articleSlug]);

    const fetchComments = () => {
        apiJson(`/articles/${articleSlug}/comments`)
            .then(data => {
                setComments(data.items || []);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMsg('');

        try {
            await apiJson(`/articles/${articleSlug}/comments`, {
                method: 'POST',
                body: { authorName, body }
            });

            // Track Pixel Event (Point 5: Engagement)
            if (articleId) {
                Pixel.track("comment_submit", { article_id: articleId });
            }

            setSuccessMsg("Comentario enviado para moderación. ¡Gracias!");
            setBody('');
            setAuthorName('');
        } catch (err) {
            setErrorMsg("Error al enviar comentario. Intenta nuevamente.");
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="comments-section">
            <h3 className="comments-title">Comentarios ({comments.length})</h3>

            {/* List */}
            <div className="comments-list">
                {loading && <p>Cargando...</p>}
                {!loading && comments.length === 0 && <p className="no-comments">Sé el primero en comentar.</p>}
                {comments.map(c => (
                    <div key={c.id} className="comment-item">
                        <div className="comment-header">
                            <span className="comment-author">{c.author_name || 'Anónimo'}</span>
                            <span className="comment-date">{new Date(c.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="comment-body">{c.body}</p>
                    </div>
                ))}
            </div>

            {/* Form */}
            <div className="comment-form-wrapper">
                <h4>Deja tu opinión</h4>
                {successMsg && <div className="success-msg">{successMsg}</div>}
                {errorMsg && <div className="error-msg">{errorMsg}</div>}

                <form onSubmit={handleSubmit} className="comment-form">
                    <input
                        type="text"
                        placeholder="Tu Nombre"
                        value={authorName}
                        onChange={e => setAuthorName(e.target.value)}
                        required
                        className="comment-input"
                    />
                    <textarea
                        placeholder="Escribe tu comentario..."
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        required
                        className="comment-textarea"
                    />
                    <button type="submit" disabled={submitting} className="comment-submit-btn">
                        {submitting ? "Enviando..." : "Publicar Comentairo"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default CommentsSection;

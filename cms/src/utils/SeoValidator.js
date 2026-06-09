/**
 * SEO Validation Engine
 * Rules based on standard Editorial SEO practices.
 */

export class SeoValidator {
    constructor(article, htmlBody) {
        this.article = article; // { title, volanta, epigraph, seo: { meta_title, meta_description, keywords... } }
        this.html = htmlBody || "";
        this.errors = [];
        this.warnings = [];
        this.score = 100;
    }

    run() {
        this.checkTitle();
        this.checkMeta();
        this.checkContent();
        this.checkLinks();
        this.checkImages();
        return {
            score: Math.max(0, this.score),
            errors: this.errors,
            warnings: this.warnings,
            isReady: this.errors.length === 0
        };
    }

    addError(msg, penalty = 10) {
        this.errors.push(msg);
        this.score -= penalty;
    }

    addWarning(msg, penalty = 5) {
        this.warnings.push(msg);
        this.score -= penalty;
    }

    checkTitle() {
        const t = this.article.title || "";
        const m = this.article.seo || {};

        if (t.length < 5) this.addError("Título muy corto (< 5 caracteres)");

        // H1 check: Allow longer titles for news (up to 100 is common)
        if (t.length > 100) this.addWarning("Título H1 muy extenso (> 100). Revisa visualización.");

        // Google Snippet Check:
        // Only warn about cutting if Meta Title is missing AND Title is long
        // OR if Meta Title exists and is long (handled in checkMeta)
        if (!m.meta_title && t.length > 65) {
            this.addWarning("Falta Meta Title personalizado y el Título es largo (> 65). Google lo cortará en resultados.");
        }

        // Check keyword in title
        const km = this.article.seo?.keywords?.split(",")[0]?.trim();
        if (km && !t.toLowerCase().includes(km.toLowerCase())) {
            this.addWarning(`La keyword principal "${km}" no está en el Título`);
        }
    }

    checkMeta() {
        const m = this.article.seo || {};

        if (!m.meta_title) this.addError("Falta Meta Title");
        else if (m.meta_title.length > 65) this.addWarning("Meta Title muy largo (> 65)");

        if (!m.meta_description) this.addError("Falta Meta Description");
        else if (m.meta_description.length < 120 || m.meta_description.length > 160) {
            this.addWarning("Meta Description debe tener entre 120-160 caracteres");
        }

        if (!m.keywords) this.addError("Faltan Keywords");
    }

    checkContent() {
        // Remove tags to count words
        const text = this.html.replace(/<[^>]*>/g, " ");
        const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;

        if (wordCount < 300) this.addError(`Contenido muy corto (${wordCount} palabras). Mínimo 300.`);
        else if (wordCount < 600) this.addWarning(`Contenido breve (${wordCount} palabras). Ideal > 600.`);

        // Check H2 density
        const h2Count = (this.html.match(/<h2/g) || []).length;
        if (wordCount > 300 && h2Count === 0) this.addWarning("Faltan subtítulos (H2) para romper el texto");
    }

    checkLinks() {
        const linkCount = (this.html.match(/<a\s/g) || []).length;
        if (linkCount < 1) this.addWarning("Faltan enlaces (internos o externos)");
        // Hard to distinguish internal/external with regex only, but count is a start
    }

    checkImages() {
        const imgTags = this.html.match(/<img\s+[^>]*>/g) || [];
        let missingAlt = 0;
        imgTags.forEach(tag => {
            if (!tag.includes('alt="') || tag.includes('alt=""')) missingAlt++;
        });

        if (missingAlt > 0) this.addWarning(`${missingAlt} imágenes en el cuerpo no tienen texto ALT`);

        if (!this.article.image_url) this.addError("Falta Imagen Destacada");
        else if (!this.article.epigraph) this.addWarning("Falta Epígrafe en la Imagen Destacada");
    }
}

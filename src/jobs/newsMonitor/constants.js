/**
 * Constants used across all newsMonitor modules
 * Organized by domain
 */

// ── Trending & Clustering Windows ──────────────────────────────────────────────
export const TRENDING_WINDOW_MIN = 30;
export const CLUSTER_WINDOW_HOURS = 6;
export const AUTO_RESEARCH_MENTIONS = 5;
export const AUTO_RESEARCH_SOURCES = 3;
export const AUTO_RESEARCH_COOLDOWN = 120;

// ── Trend Cluster Thresholds ───────────────────────────────────────────────────
export const CLUSTER_SUMMARY_MIN_ARTICLES = 3;
export const CLUSTER_SUMMARY_MIN_SOURCES = 2;

// ── Story Intelligence ────────────────────────────────────────────────────────
export const STORY_WINDOW_HOURS = 24;
export const STORY_MATCH_THRESHOLD = 0.20;
export const STORY_SUMMARY_MIN_ARTICLES = 3;
export const STORY_SUMMARY_MIN_SOURCES = 2;
export const ENRICHMENT_GATE_COVERAGE = 0.70;
export const RELEVANCE_FILTER_THRESHOLD = 0.30;

// ── Story Clustering Gates ────────────────────────────────────────────────────
export const STORY_ENTITY_GATE_MIN_STORY = 3;
export const STORY_ENTITY_GATE_MIN_ARTICLE = 1;

// ── Story Stopwords ───────────────────────────────────────────────────────────
export const STORY_STOPWORDS = new Set([
  'como','hoy','ayer','para','sobre','ante','bajo','desde','hacia','hasta','tras','entre',
  'dice','dijo','señaló','afirmó','confirmó','anunció','aseguró','reveló','explicó',
  'nuevo','nueva','nuevos','nuevas','primer','primera','primero','últimas','último',
  'gran','grande','grandes','solo','sólo','también','además','muy','bien','mal',
  'todo','toda','todos','todas','esto','eso','este','esta','estos','estas',
  'lunes','martes','miercoles','jueves','viernes','sabado','domingo',
  'enero','febrero','marzo','abril','mayo','junio','julio','agosto',
  'septiembre','octubre','noviembre','diciembre',
  'semana','semanas','mes','meses','años','hora','horas','minuto','minutos',
  'cual','cuales','quien','quienes','como','cuando','donde','cuanto',
  'caso','casos','forma','formas','tipo','tipos','parte','partes','lugar',
  'hace','hizo','debe','puede','tiene','tuvo','sera','seria',
  'the','also','from','this','that','with','have','will','been','were',
  'what','when','where','which','they','their','about','after','before',
  'pesos','dolares','porcentaje','inflacion','economia',
  'copa','mundial','torneo','campeonato','fixture','grupo','fase',
  'final','semifinal','cuartos','octavos','16avos','32avos',
]);

// ── Recurring Content Patterns ────────────────────────────────────────────────
export const RECURRING_CONTENT_PATTERNS = [
  /hor[oó]scopo\s+\w+\s+de\s+hoy/i,
  /quiniela.*resultado.*sorteo/i,
  /resultado.*quiniela/i,
  /quiniela.*(nocturna|vespertina|primera|matutina)/i,
  /loter[ií]a.*resultado/i,
  /resultado.*loter[ií]a/i,
  /n[uú]mero.*ganador/i,
  /sorteo.*loto/i,
];

// ── Content Acquisition ───────────────────────────────────────────────────────
export const CONTENT_FETCH_LIMIT = 20;

// ── Event Intelligence ────────────────────────────────────────────────────────
export const EVENT_WINDOW_HOURS = 24;
export const EVENT_ENTITY_THRESHOLD = 0.35;
export const EVENT_ENTITY_GATE_MIN_STORY = 2;
export const EVENT_SUMMARY_MIN_ARTICLES = 4;
export const EVENT_SUMMARY_MIN_SOURCES = 2;

// ── Opportunity Scoring ───────────────────────────────────────────────────────
export const OPPORTUNITY_WINDOW_HOURS = 24;
export const OPPORTUNITY_THRESHOLD_SCORE = 30;

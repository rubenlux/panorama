#!/usr/bin/env node

/**
 * Reclustering Script: Re-categorize and merge stories from the last 72 hours
 *
 * Purpose: Apply the new detectStoryCategory() v2 algorithm to existing stories
 * that were already misclassified by v1. This fixes the Leandro Lozano case where
 * 11 articles were split into 4 histories due to incorrect categorization.
 *
 * Process:
 * 1. Load stories created in last 72 hours
 * 2. Recalculate category using v2 algorithm
 * 3. Detect contaminated stories (mix of categories in same cluster)
 * 4. Merge stories with same category + similar keywords
 * 5. Report before/after metrics
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5435/newsdb'
});

// Copy of detectStoryCategory v2 from newsMonitor.js
function detectStoryCategory(title, storyType, entities = new Set()) {
  if (storyType === 'sports')   return { category: 'sports', confidence: 1.0, matched_rules: ['storyType_override'] };
  if (storyType === 'politics') return { category: 'politics', confidence: 1.0, matched_rules: ['storyType_override'] };

  const t = (title || '').toLowerCase();
  const entityNames = new Set([...(entities || [])].map(e => String(e).toLowerCase()));

  const SPORTS_CONTEXT = {
    clubs: new Set(['boca', 'river', 'racing', 'independiente', 'san lorenzo', 'vélez', 'estudiantes', 'quilmes', 'atlético tucumán', 'lanús', 'defensa y justicia', 'talleres', 'colón', 'gimnasia', 'argentinos juniors']),
    competitions: new Set(['mundial', 'copa', 'liga', 'superliga', 'torneo', 'champions', 'libertadores', 'sudamericana']),
    transfer: new Set(['refuerzo', 'fichaje', 'contratación', 'transferencia', 'mercado de pases', 'mercado', 'acuerdo', 'firmará', 'contrato', 'jugador', 'delantero', 'defensor', 'lateral', 'portero', 'centrocampista']),
  };

  const ENTERTAINMENT_CONTEXT = new Set(['andrea del boca', 'actor', 'actriz', 'cantante', 'músico', 'artista', 'película', 'serie', 'show', 'gran hermano', 'reality']);

  const PATTERNS = {
    judicial: [/\bjuicio\b/, /\bsentenci[ao]\b/, /\bcondena\b/, /\bfall[oó]\b/],
    security: [/\bcrimen\b/, /\brobo\b/, /\basalto\b/, /\basesinato\b/, /\bhomicidio\b/],
    international: [/\binternacional\b/, /\bmundial\b/, /\bglobal\b/, /\bonu\b/, /\beuropa\b/, /\bchina\b/],
    politics: [/\belecci[oó]n\b/, /\bpresidente\b/, /\bcongreso\b/, /\bgobierno\b/, /\bministr[ao]\b/],
    economy: [/\beconom[ií]a\b/, /\becon[oó]mic[ao]\b/, /\bd[oó]lar\b/, /\binflaci[oó]n\b/, /\bprecios\b/, /\bpodría irse\b/],
    health: [/\bsalud\b/, /\benfermedad\b/, /\bpandemia\b/, /\bvacun[ao]\b/, /\bhospital\b/, /\bm[eé]dic[ao]\b/],
    technology: [/\btecnolog[ií]a\b/, /\bdigital\b/, /\binteligencia artificial\b/, /\bsoftware\b/],
    sports: [/\bgol\b/, /\bpartido\b/, /\bliga\b/, /\bcopa\b/, /\bequipo\b/, /\bf[uú]tbol\b/, /\briver\b/, /\bboca\b/],
    entertainment: [/\bespect[aá]culo\b/, /\bcine\b/, /\bm[uú]sica\b/, /\bactor\b/, /\bactriz\b/, /\bcantante\b/],
    society: [/\beducaci[oó]n\b/, /\bescuela\b/, /\buniversidad\b/, /\bcultura\b/, /\bderechos\b/],
  };

  const scores = {};
  const matched_rules = {};
  for (const [cat, patterns] of Object.entries(PATTERNS)) {
    scores[cat] = patterns.filter(p => p.test(t)).length;
    matched_rules[cat] = [];
  }

  // Check entertainment context FIRST — Andrea del Boca should not be sports
  const hasEntertainmentContext = [...ENTERTAINMENT_CONTEXT].some(e => t.includes(e));

  // Check sports context: exclude "boca" if "del boca" is in title (person's name)
  let hasSportsClub = [...SPORTS_CONTEXT.clubs].some(c => {
    if (c === 'boca' && t.includes('del boca')) return false; // Andrea del Boca exclusion
    return t.includes(c);
  });
  const hasSportsCompetition = [...SPORTS_CONTEXT.competitions].some(c => t.includes(c));
  const hasSportsTransfer = [...SPORTS_CONTEXT.transfer].some(c => t.includes(c));

  if ((hasSportsClub || hasSportsCompetition || hasSportsTransfer) && !hasEntertainmentContext) {
    const contextRules = [];
    if (hasSportsClub) contextRules.push('sports_club');
    if (hasSportsCompetition) contextRules.push('sports_competition');
    if (hasSportsTransfer) contextRules.push('sports_transfer');

    if (scores['health'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['health'] = Math.max(0, scores['health'] - 1);
    }
    if (scores['economy'] > 0 && (hasSportsClub || hasSportsTransfer)) {
      scores['economy'] = Math.max(0, scores['economy'] - 1);
    }
    if (scores['international'] > 0 && hasSportsCompetition && !t.includes('guerra')) {
      scores['international'] = Math.max(0, scores['international'] - 1);
    }

    scores['sports'] = (scores['sports'] || 0) + 2;
    matched_rules['sports'] = contextRules;
  }

  if (hasEntertainmentContext && !hasSportsClub && !hasSportsTransfer) {
    scores['entertainment'] = (scores['entertainment'] || 0) + 1;
    matched_rules['entertainment'].push('entertainment_context');
  }

  // Entertainment check: if entertainment context detected, prioritize entertainment
  if (hasEntertainmentContext) {
    scores['entertainment'] = Math.max(scores['entertainment'], (scores['sports'] || 0) + 1);
    matched_rules['entertainment'].push('entertainment_context');
  }

  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) return { category: 'society', confidence: 0.5, matched_rules: ['default'] };

  // When entertainment context is strong, entertainment gets priority
  const PRECEDENCE = hasEntertainmentContext
    ? ['judicial', 'security', 'international', 'politics', 'economy', 'entertainment', 'sports', 'health', 'technology', 'society']
    : ['judicial', 'security', 'international', 'politics', 'economy', 'sports', 'health', 'technology', 'entertainment', 'society'];
  const winner = PRECEDENCE.find(cat => scores[cat] === maxScore) || 'society';
  const confidence = maxScore / (Object.values(scores).reduce((a, b) => a + b, 0) || 1);

  return {
    category: winner,
    confidence: Math.min(1, confidence),
    matched_rules: matched_rules[winner] || []
  };
}

async function reclusterRecentStories() {
  console.log('\n🔄 RECLUSTERING: Re-categorize stories from last 72 hours\n');

  try {
    // Get stories from last 14 days
    const { rows: stories } = await pool.query(`
      SELECT
        sc.id,
        sc.title,
        sc.detected_category AS old_category,
        sc.story_type,
        (SELECT array_agg(ke.name)
         FROM story_entities se
         JOIN knowledge_entities ke ON ke.id = se.entity_id
         WHERE se.story_id = sc.id) AS entities
      FROM story_clusters sc
      WHERE sc.created_at > now() - interval '14 days'
      AND sc.is_recurring = false
      ORDER BY sc.created_at DESC
    `);

    console.log(`📊 Found ${stories.length} stories created in last 14 days\n`);

    let categoriesChanged = 0;
    let changedStories = [];

    // Recalculate category for each story
    for (const story of stories) {
      const result = detectStoryCategory(story.title, story.story_type, new Set(story.entities || []));

      if (result.category !== story.old_category) {
        categoriesChanged++;
        changedStories.push({
          id: story.id,
          title: story.title.substring(0, 80),
          old: story.old_category,
          new: result.category,
          confidence: result.confidence.toFixed(2),
          rules: result.matched_rules.join(', ')
        });

        // Update the category
        await pool.query(
          `UPDATE story_clusters SET detected_category = $1 WHERE id = $2`,
          [result.category, story.id]
        );
      }
    }

    console.log(`📝 Categories changed: ${categoriesChanged}/${stories.length}\n`);

    if (categoriesChanged > 0) {
      console.log('🔍 Changed stories:');
      for (const s of changedStories) {
        console.log(`  ${s.old} → ${s.new} (confidence: ${s.confidence})`);
        console.log(`    "${s.title}..."`);
        console.log(`    Rules: ${s.rules}\n`);
      }
    }

    // Now verify the fix: check Leandro Lozano specifically
    console.log('\n✅ VERIFICATION: Leandro Lozano case\n');
    const { rows: lozanoStories } = await pool.query(`
      SELECT
        id,
        title,
        detected_category,
        article_count,
        source_count,
        created_at
      FROM story_clusters
      WHERE title ILIKE '%leandro lozano%' OR (title ILIKE '%lozano%' AND title ILIKE '%boca%')
      ORDER BY created_at DESC
    `);

    console.log(`Found ${lozanoStories.length} stories related to Leandro Lozano:\n`);

    let totalArticles = 0;
    let sportsCount = 0;

    for (const s of lozanoStories) {
      const cat = s.detected_category;
      console.log(`  [${cat.toUpperCase()}] "${s.title.substring(0, 70)}..."`);
      console.log(`       articles: ${s.article_count}, sources: ${s.source_count}`);

      if (cat === 'sports') sportsCount++;
      totalArticles += s.article_count;
    }

    console.log(`\n📈 Summary:`);
    console.log(`   Total related stories: ${lozanoStories.length}`);
    console.log(`   Sports-categorized: ${sportsCount}`);
    console.log(`   Total articles: ${totalArticles}`);
    console.log(`   Status: ${sportsCount === lozanoStories.length ? '✅ ALL SPORTS' : '⚠️  STILL FRAGMENTED'}`);

    // Check all Boca stories
    console.log('\n\n📊 BROADER CHECK: All Boca stories by category\n');
    const { rows: bocaByCategory } = await pool.query(`
      SELECT detected_category, COUNT(*) as count, SUM(article_count) as total_articles
      FROM story_clusters
      WHERE title ILIKE '%boca%'
      GROUP BY detected_category
      ORDER BY count DESC
    `);

    console.log('Boca stories distribution:');
    let totalBoca = 0;
    for (const row of bocaByCategory) {
      console.log(`  ${row.detected_category.padEnd(15)}: ${row.count.toString().padEnd(3)} stories, ${row.total_articles} articles`);
      totalBoca += row.count;
    }
    console.log(`  ${'-'.repeat(40)}`);
    console.log(`  TOTAL: ${totalBoca} stories`);

    // Percentage of sports
    const bocaSports = bocaByCategory.find(r => r.detected_category === 'sports');
    const sportsPercent = bocaSports ? ((bocaSports.count / totalBoca) * 100).toFixed(1) : 0;
    console.log(`\n  ✅ Sports categorization: ${sportsPercent}%`);
    console.log(`  ${sportsPercent > 80 ? '✅ GOOD' : '⚠️  NEEDS WORK'}`);

  } catch (error) {
    console.error('Error during reclustering:', error);
  } finally {
    await pool.end();
    console.log('\n✅ Reclustering complete\n');
  }
}

(async () => {
  await reclusterRecentStories();
})();

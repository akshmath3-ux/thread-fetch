// fetch.js
// Usage (broad interest):  node fetch.js "gaming"
// Usage (specific topic):  node fetch.js "UX designer day in the life"

import 'dotenv/config';
// --- NEW ---
const API_KEYS = (process.env.YOUTUBE_API_KEYS || process.env.YOUTUBE_API_KEY || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

let currentKeyIndex = 0;

function getApiKey() {
    return API_KEYS[currentKeyIndex];
}

function rotateApiKey() {
    if (API_KEYS.length <= 1) return;
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    console.log(`[Quota Limit] Rotated to API key index: ${currentKeyIndex}`);
}

async function fetchWithKeyRotation(urlBuilder) {
    let attempts = 0;
    const maxAttempts = API_KEYS.length || 1;

    console.log(`Loaded ${API_KEYS.length} key(s) from environment.`);

    while (attempts < maxAttempts) {
        const key = getApiKey();
        if (!key) break;
        const targetUrl = urlBuilder(key);

        try {
            const response = await fetch(targetUrl);
            const data = await response.json();

            if (response.status === 403 || (data.error && data.error.code === 403)) {
                console.warn(`Key index ${currentKeyIndex} hit quota limit or error:`, data.error?.message);
                rotateApiKey();
                attempts++;
                continue;
            }

            if (data.error) {
                console.warn(`API Error with key index ${currentKeyIndex}:`, data.error.message);
                rotateApiKey();
                attempts++;
                continue;
            }

            return data;
        } catch (err) {
            console.error(`Fetch error with key index ${currentKeyIndex}:`, err);
            rotateApiKey();
            attempts++;
        }
    }

    throw new Error("All YouTube API keys have exhausted their daily quotas or are invalid.");
}

const input = process.argv.slice(2).join(' ');

if (API_KEYS.length === 0) {
    console.error('Missing YOUTUBE_API_KEYS in .env file.');
    process.exit(1);
}

if (!input) {
    console.error('Usage: node fetch.js "some topic or interest"');
    process.exit(1);
}

// ---------- interest map ----------
// Broad interests -> 2-3 specific search queries, chosen using what Day 4 found
// actually surfaces good results (phrasing like "day in the life," "actually do,"
// "worth it in [year]").

const INTEREST_MAP = {
    gaming: [
        'game designer day in the life',
        'esports manager career',
        'game QA tester actually do',
    ],
    design: [
        'UX designer day in the life',
        'graphic designer actually do',
        'freelance designer worth it 2026',
    ],
    business: [
        'startup founder day in the life',
        'financial analyst career',
        'is marketing manager worth it 2026',
    ],
    science: [
        'mechanical engineer day in the life',
        'lab researcher actually do',
        'biomedical engineer career',
    ],
    writing: [
        'screenwriter day in the life',
        'journalist actually do',
        'copywriter career worth it',
    ],
    people: [
        'psychology counselor career',
        'HR manager day in the life',
        'sales rep actually do',
    ],
    building: [
        'electrician apprentice day in the life',
        'architect actually do',
        'construction manager career',
    ],
    numbers: [
        'data analyst career',
        'actuary day in the life',
        'accountant actually do',
    ],
};

// ---------- cold-start category ----------
// For students with NO direction yet — not an interest, a "help me find one"
// entry point. Different content genre (Topic 7 findings): reflective/TED-style
// talks, not "day in the life" job content. Triggered by typing "start" instead
// of an interest name.

const COLD_START_QUERIES = [
    'how to find your career path TED talk',
    'finding your passion TEDx',
    'life after high school finding your path',
];

// ---------- helpers ----------

function formatDuration(iso) {
    const seconds = durationToSeconds(iso);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h) parts.push(h);
    parts.push(h ? String(m).padStart(2, '0') : m);
    parts.push(String(s).padStart(2, '0'));
    return parts.join(':');
}

function durationToSeconds(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = parseInt(match[1] || 0, 10);
    const m = parseInt(match[2] || 0, 10);
    const s = parseInt(match[3] || 0, 10);
    return h * 3600 + m * 60 + s;
}

// Phrases we found repeatedly on genuinely good videos across Day 4 testing,
// plus a few added after finding the phrase list was UX/tech-biased (graphic
// design and freelance design results used different, equally valid phrasing).
const GOOD_TITLE_PHRASES = [
    'day in the life',
    'what i do day to day',
    'actually do',
    'how i got into',
    'a day as a',
    'worth it',
    'if i had to start over',
    'realistic day',
    'what does a',
    'how i make', // e.g. "How I Make $10K/Month as a..."
    'i spent', // e.g. "I Spent 30 Days Freelancing on..."
    "here's how",
];

function scoreVideo(video, channelCounts) {
    let score = 0;
    const durationSec = durationToSeconds(video.contentDetails.duration);
    const views = Number(video.statistics.viewCount || 0);
    const title = video.snippet.title.toLowerCase();
    const channel = video.snippet.channelTitle;

    if (durationSec < 90) {
        score -= 60;
    } else if (durationSec < 150) {
        score -= 25;
    }

    if (durationSec >= 240 && durationSec <= 900) {
        score += 25;
    } else if (durationSec > 900 && durationSec <= 1500) {
        score += 10;
    }

    let phraseMatches = 0;
    for (const phrase of GOOD_TITLE_PHRASES) {
        if (title.includes(phrase)) phraseMatches++;
    }
    // Reduced from 15/match (max 30) to 8/match (max 16) after finding the phrase
    // list was biased toward UX/tech-style titles — it should nudge the score,
    // not dominate it, since we now know it doesn't generalize evenly across niches.
    score += Math.min(phraseMatches, 2) * 8;

    if (views > 0) {
        score += Math.log10(views) * 4;
    }

    const appearances = channelCounts[channel] || 0;
    if (appearances > 1) {
        score += 8;
    }

    return Math.round(score * 10) / 10;
}

// ---------- one search + details call for a single query ----------
// (this is exactly what the Day 3-5 script did, now wrapped as a reusable function)

// --- NEW ---
async function fetchTopicResults(query) {
    try {
        const searchData = await fetchWithKeyRotation((key) =>
            `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${key}`
        );

        if (!searchData || !searchData.items || searchData.items.length === 0) {
            return [];
        }

        const videoIds = searchData.items.map(item => item.id.videoId).filter(Boolean).join(',');
        if (!videoIds) return [];

        const detailsData = await fetchWithKeyRotation((key) =>
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${key}`
        );

        return detailsData?.items || [];
    } catch (err) {
        console.error(`Error in fetchTopicResults for "${query}":`, err.message);
        return [];
    }
}

// ---------- main ----------

async function main() {
    const interestKey = input.toLowerCase().trim();
    const isColdStart = interestKey === 'start' || interestKey === 'no idea' || interestKey === 'cold start';
    const isInterest = Object.prototype.hasOwnProperty.call(INTEREST_MAP, interestKey);

    let queries;
    let label;
    if (isColdStart) {
        queries = COLD_START_QUERIES;
        label = `\nCold start (no direction yet) → running ${queries.length} searches: ${queries.join(' | ')}\n`;
    } else if (isInterest) {
        queries = INTEREST_MAP[interestKey];
        label = `\nBroad interest: "${input}" → running ${queries.length} searches: ${queries.join(' | ')}\n`;
    } else {
        queries = [input];
        label = `\nSpecific topic: "${input}"\n`;
    }

    console.log(label);

    // Run all queries (sequentially, to keep quota usage easy to reason about)
    let allVideos = [];
    for (const query of queries) {
        const results = await fetchTopicResults(query);
        // Tag each video with which sub-query surfaced it — needed so we can
        // guarantee representation per query later, not just per channel.
        const tagged = results.map(v => ({ ...v, __sourceQuery: query }));
        allVideos = allVideos.concat(tagged);
    }

    if (allVideos.length === 0) {
        console.log('No results found.');
        return;
    }

    // Dedupe — the same video can show up across multiple related queries
    const seen = new Set();
    const uniqueVideos = [];
    for (const v of allVideos) {
        if (!seen.has(v.id)) {
            seen.add(v.id);
            uniqueVideos.push(v);
        }
    }

    // Count channel appearances across the COMBINED result set (not per-query)
    const channelCounts = {};
    for (const v of uniqueVideos) {
        const ch = v.snippet.channelTitle;
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }

    const scored = uniqueVideos.map(v => ({
        title: v.snippet.title.slice(0, 55),
        channel: v.snippet.channelTitle,
        views: Number(v.statistics.viewCount || 0).toLocaleString(),
        duration: formatDuration(v.contentDetails.duration),
        score: scoreVideo(v, channelCounts),
        sourceQuery: v.__sourceQuery,
    }));

    scored.sort((a, b) => b.score - a.score);

    // Two-part selection:
    // 1) Channel cap (same as before) — no more than 2 spots per channel, so one
    //    prolific channel can't fill the whole top 5 just by uploading a lot.
    // 2) Query representation (NEW) — when a broad interest search runs multiple
    //    sub-queries (e.g. "design" -> UX / graphic design / freelance), the
    //    single highest-scoring sub-query was winning ALL the spots, since raw
    //    scores aren't directly comparable across pools of different size/
    //    popularity. This guarantees each sub-query gets at least one shot at a
    //    spot before we just fill the rest by pure score.
    const MAX_PER_CHANNEL = 2;
    const channelPickCounts = {};
    const topPicks = [];
    const usedIds = new Set();

    function tryAdd(video) {
        const count = channelPickCounts[video.channel] || 0;
        if (count >= MAX_PER_CHANNEL) return false;
        if (usedIds.has(video.title + video.channel)) return false;
        topPicks.push(video);
        channelPickCounts[video.channel] = count + 1;
        usedIds.add(video.title + video.channel);
        return true;
    }

    if (queries.length > 1) {
        // Pass 1: guarantee the single best video from EACH sub-query gets a shot,
        // in the order the queries were defined, before falling back to pure score.
        for (const query of queries) {
            const bestForQuery = scored.find(v => v.sourceQuery === query && !usedIds.has(v.title + v.channel));
            if (bestForQuery) tryAdd(bestForQuery);
            if (topPicks.length === 5) break;
        }
    }

    // Pass 2: fill any remaining slots by pure score, same as before.
    if (topPicks.length < 5) {
        for (const video of scored) {
            if (topPicks.length === 5) break;
            tryAdd(video);
        }
    }

    console.log(`(${uniqueVideos.length} unique videos found across ${queries.length} search${queries.length > 1 ? 'es' : ''}, deduped from ${allVideos.length} raw results)\n`);
    console.log('Top picks (max 2 per channel, at least 1 per sub-query when possible):\n');
    console.table(topPicks);
}

main();
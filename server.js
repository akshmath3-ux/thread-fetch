import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.YOUTUBE_API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files explicitly from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route to serve index.html for the root URL
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.json());

const INTEREST_MAP = {
    gaming: ['game designer day in the life', 'esports manager career', 'game QA tester actually do'],
    design: ['UX designer day in the life', 'graphic designer actually do', 'freelance designer worth it 2026'],
    business: ['startup founder day in the life', 'financial analyst career', 'is marketing manager worth it 2026'],
    science: ['mechanical engineer day in the life', 'lab researcher actually do', 'biomedical engineer career'],
    writing: ['screenwriter day in the life', 'journalist actually do', 'copywriter career worth it'],
    people: ['psychology counselor career', 'HR manager day in the life', 'sales rep actually do'],
    building: ['electrician apprentice day in the life', 'architect actually do', 'construction manager career'],
    numbers: ['data analyst career', 'actuary day in the life', 'accountant actually do'],
};

const COLD_START_QUERIES = [
    'how to find your career path TED talk',
    'finding your passion TEDx',
    'life after high school finding your path',
];

function durationToSeconds(iso) {
    const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
    const h = parseInt(match[1] || 0, 10);
    const m = parseInt(match[2] || 0, 10);
    const s = parseInt(match[3] || 0, 10);
    return h * 3600 + m * 60 + s;
}

function formatDuration(iso) {
    const seconds = durationToSeconds(iso);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

const GOOD_TITLE_PHRASES = [
    'day in the life', 'what i do day to day', 'actually do', 'how i got into',
    'a day as a', 'worth it', 'if i had to start over', 'realistic day', 'what does a'
];

function scoreVideo(video, channelCounts) {
    let score = 0;
    const durationSec = durationToSeconds(video.contentDetails.duration);
    const views = Number(video.statistics.viewCount || 0);
    const title = video.snippet.title.toLowerCase();
    const channel = video.snippet.channelTitle;

    if (durationSec < 90) score -= 60;
    else if (durationSec < 150) score -= 25;

    if (durationSec >= 240 && durationSec <= 900) score += 25;
    else if (durationSec > 900 && durationSec <= 1500) score += 10;

    let phraseMatches = 0;
    for (const phrase of GOOD_TITLE_PHRASES) {
        if (title.includes(phrase)) phraseMatches++;
    }
    score += Math.min(phraseMatches, 2) * 8;

    if (views > 0) score += Math.log10(views) * 4;

    if ((channelCounts[channel] || 0) > 1) score += 8;

    return Math.round(score * 10) / 10;
}

async function fetchTopicResults(query) {
    // safeSearch=strict filters out vulgar/inappropriate content
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=15&safeSearch=strict&key=${API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error || !searchData.items) return [];

    const videoIds = searchData.items.map(item => item.id.videoId).filter(Boolean).join(',');
    if (!videoIds) return [];

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    return detailsData.items || [];
}

app.get('/api/search', async (req, res) => {
    const input = (req.query.q || '').trim();
    if (!input) return res.status(400).json({ error: 'Query parameter required' });

    const interestKey = input.toLowerCase();
    const isColdStart = ['start', 'no idea', 'cold start'].includes(interestKey);
    const isInterest = Object.prototype.hasOwnProperty.call(INTEREST_MAP, interestKey);

    let queries = isColdStart ? COLD_START_QUERIES : isInterest ? INTEREST_MAP[interestKey] : [input];

    let allVideos = [];
    for (const query of queries) {
        const results = await fetchTopicResults(query);
        allVideos = allVideos.concat(results.map(v => ({ ...v, __sourceQuery: query })));
    }

    const seen = new Set();
    const uniqueVideos = [];
    for (const v of allVideos) {
        if (v.id?.videoId || v.id) {
            const id = typeof v.id === 'string' ? v.id : v.id.videoId;
            if (!seen.has(id)) {
                seen.add(id);
                uniqueVideos.push({ ...v, id });
            }
        }
    }

    const channelCounts = {};
    for (const v of uniqueVideos) {
        const ch = v.snippet.channelTitle;
        channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    }

    const scored = uniqueVideos.map(v => ({
        id: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails.high?.url || v.snippet.thumbnails.medium?.url,
        views: Number(v.statistics.viewCount || 0).toLocaleString(),
        duration: formatDuration(v.contentDetails.duration),
        score: scoreVideo(v, channelCounts),
        sourceQuery: v.__sourceQuery,
    })).sort((a, b) => b.score - a.score);

    const topPicks = scored.slice(0, 5);
    res.json({ query: input, results: topPicks });
});

app.listen(PORT, () => {
    console.log(`Distraction-Free Learning App running on http://localhost:${PORT}`);
});


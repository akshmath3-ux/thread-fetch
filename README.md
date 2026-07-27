🎯 FocusHub

A distraction-free study companion that keeps you locked into what you're actually learning.

Ever start a "quick tutorial" on YouTube and somehow end up 40 minutes deep in something completely unrelated? FocusHub fixes that. Search for what you want to learn, watch it embedded right in the app — no YouTube homepage, no autoplay rabbit hole, no suggested videos pulling you away — and take notes alongside it while a built-in focus timer keeps you on track.

Live app: thread-fetch.onrender.com

Features
🔍 Smart search — curated, filtered educational video results, not raw YouTube search
🎬 Embedded player — videos play directly in the app, no redirect to YouTube
⏱️ Focus timer — adjustable Pomodoro-style timer with short/long breaks built in
📝 Live study notes — take notes alongside the video you're watching, auto-saved
💾 Saved videos & history — pick up where you left off
🗂️ Notes archive — every note you've taken, organized by video, in one place
Tech stack
Backend: Node.js, Express
Frontend: Plain HTML/CSS/JavaScript (no framework)
Data: YouTube Data API v3, with layered filtering (category blocking + keyword relevance checks) to keep results genuinely educational
Storage: Browser localStorage for saved videos, watch history, and notes
Deployment: Render

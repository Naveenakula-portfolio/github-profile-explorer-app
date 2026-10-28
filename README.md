# GitHub Profile Explorer

A polished, recruiter-friendly React app that lets you look up any public GitHub profile and explore:

- profile overview and social metadata
- aggregated repo metrics and language distribution
- searchable repository browser with README previews
- recent public activity feed
- contribution heatmap, repo star chart, and dashboard UX
- dark/light theme and local search history
- optional GitHub token support for better rate limits

## Stack

- React + TypeScript + Vite
- Tailwind CSS
- Recharts for analytics
- react-markdown for README rendering
- Radix Dialog for the repo detail drawer

## Features included

- Search by username or load via `/?user=torvalds`
- Public profile card: avatar, bio, company, location, blog, followers, following, repos, join date
- Repository browser with search, language filter, and sorting
- Aggregated stats for stars, forks, watchers, and open issues
- Recent activity feed from the public events API
- Contribution heatmap and repository star chart
- Recent-search history and quick profiles
- Loading skeletons, empty states, and clear API/user errors
- Responsive, polished dark/light design

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL, usually:

```bash
http://localhost:5173
```

## Notes

This app uses GitHub’s public REST API directly from the browser. For anonymous usage, GitHub may throttle requests; adding a PAT in the UI raises the available rate limit.

## Screenshot-ready status

This repository is structured to present as a strong portfolio project for recruiters and hiring teams.

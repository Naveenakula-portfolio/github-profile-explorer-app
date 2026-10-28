# GitHub Profile Explorer

A polished React + TypeScript dashboard for exploring any public GitHub profile, repository analytics, and recent activity. Built as a recruiter-friendly portfolio project to showcase frontend UI, data visualization, API integration, and product thinking.

## What this project does

- Search any public GitHub username
- View profile details such as avatar, bio, company, location, followers, following, repos, and join date
- Aggregate repository statistics for stars, forks, watchers, and open issues
- Browse and filter all public repositories with sort and language filters
- Open a repository detail drawer with README rendering
- View public activity feed from GitHub events
- Explore contribution heatmap and star analytics
- Switch between light and dark themes
- Keep recent search history in local storage
- Handle loading, empty, and error states gracefully
- Support optional GitHub token usage for higher API rate limits

## Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS
- Recharts
- Radix UI Dialog
- React Markdown + GFM

## Project status

This project is structured as a clean, presentation-ready portfolio app for recruiters and hiring managers.

## Local development

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Start the app:

```bash
npm run dev
```

4. Open the local URL in the browser, typically:

```bash
http://localhost:5173
```

## Production build

```bash
npm run build
```

## Notes

- The app uses the public GitHub REST API directly from the browser.
- Anonymous access has rate limits; a personal access token can be entered in the UI to improve availability.
- This repository keeps environment variables and tokens out of source control.

## Project structure

```text
.
├── src/
│   ├── App.tsx
│   ├── index.css
│   ├── lib/
│   │   └── github.ts
│   ├── main.tsx
│   └── types.ts
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── README.md
└── .gitignore
```

## Recommended next steps

- Add deployment with Vercel or Netlify
- Add screenshot previews for the portfolio page
- Add a performance badge or project metrics section
- Add a live demo link for recruiter access

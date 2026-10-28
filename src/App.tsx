import * as Dialog from '@radix-ui/react-dialog';
import { Activity, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, Code2, ExternalLink, Eye, Flame, Forklift, GitBranch, GitCommitHorizontal, GitFork, Globe, Heart, LoaderCircle, Moon, Search, Sparkles, Star, SunMedium, TrendingUp, Users, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchRepoReadme,
  fetchUserEvents,
  fetchUserProfile,
  fetchUserRepos,
  formatCompactNumber,
  formatDate,
  formatRelativeTime,
  GitHubApiError,
  toLocaleDate,
} from './lib/github';
import type { GitHubEvent, GitHubRepo, GitHubUser, LanguageAggregate } from './types';

const DEFAULT_USER = 'torvalds';
const SUGGESTED_USERS = ['torvalds', 'microsoft', 'vercel', 'facebook', 'gaearon', 'sindresorhus', 'github'];

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('profile-theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [token, setToken] = useState<string>(() => localStorage.getItem('github-token') || '');
  const [query, setQuery] = useState(DEFAULT_USER);
  const [profile, setProfile] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [events, setEvents] = useState<GitHubEvent[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [readme, setReadme] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<'stars' | 'updated' | 'name'>('stars');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [repoSearch, setRepoSearch] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('recent-github-searches');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('profile-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('github-token', token);
  }, [token]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const user = params.get('user');
    if (user) {
      setQuery(user);
      void loadProfile(user);
      return;
    }

    void loadProfile(DEFAULT_USER);
  }, []);

  const languageOptions = useMemo(() => {
    return Array.from(new Set(repos.map((repo) => repo.language).filter(Boolean) as string[])).sort();
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const normalized = repoSearch.trim().toLowerCase();

    const result = repos.filter((repo) => {
      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter;
      const text = [repo.name, repo.description, repo.language, ...(repo.topics || [])].join(' ').toLowerCase();
      const matchesText = !normalized || text.includes(normalized);
      return matchesLanguage && matchesText;
    });

    return result.sort((a, b) => {
      if (sort === 'updated') return new Date(b.pushed_at).getTime() - new Date(a.pushed_at).getTime();
      if (sort === 'name') return a.name.localeCompare(b.name);
      return b.stargazers_count - a.stargazers_count;
    });
  }, [repos, repoSearch, sort, languageFilter]);

  const totalStars = useMemo(() => repos.reduce((sum, repo) => sum + repo.stargazers_count, 0), [repos]);
  const totalForks = useMemo(() => repos.reduce((sum, repo) => sum + repo.forks_count, 0), [repos]);
  const totalWatchers = useMemo(() => repos.reduce((sum, repo) => sum + repo.watchers_count, 0), [repos]);
  const totalIssues = useMemo(() => repos.reduce((sum, repo) => sum + repo.open_issues_count, 0), [repos]);

  const languageData = useMemo<LanguageAggregate[]>(() => {
    const counts = new Map<string, number>();

    repos.forEach((repo) => {
      if (!repo.language) return;
      counts.set(repo.language, (counts.get(repo.language) || 0) + 1);
    });

    const palette = ['#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6', '#fb7185', '#f59e0b', '#22c55e'];
    return Array.from(counts.entries())
      .map(([name, value], index) => ({ name, value, color: palette[index % palette.length] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [repos]);

  const repoChartData = useMemo(() => {
    return [...repos]
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6)
      .map((repo) => ({ name: repo.name, stars: repo.stargazers_count }));
  }, [repos]);

  const contributionData = useMemo(() => {
    const counts = new Map<string, number>();

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 364);

    for (let i = 0; i <= 364; i += 1) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      counts.set(date.toISOString().slice(0, 10), 0);
    }

    events.forEach((event) => {
      const iso = new Date(event.created_at).toISOString().slice(0, 10);
      if (counts.has(iso)) {
        counts.set(iso, (counts.get(iso) || 0) + 1);
      }
    });

    return Array.from(counts.entries()).map(([date, count]) => ({ date, count }));
  }, [events]);

  const recentEventItems = useMemo(() => events.slice(0, 6), [events]);

  const updateQueryParam = (user: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('user', user);
    window.history.replaceState({}, '', url.toString());
  };

  const loadProfile = async (targetUser: string) => {
    const username = targetUser.trim();
    if (!username) {
      setError('Please enter a GitHub username.');
      return;
    }

    setSearching(true);
    setLoading(true);
    setError(null);

    try {
      const [userData, userRepos, userEvents] = await Promise.all([
        fetchUserProfile(username, token),
        fetchUserRepos(username, token),
        fetchUserEvents(username, token),
      ]);

      setProfile(userData);
      setRepos(userRepos);
      setEvents(userEvents);
      setLanguageFilter('all');
      setRepoSearch('');
      setQuery(username);
      updateQueryParam(username);
      setRecentSearches((prev) => {
        const next = [username, ...prev.filter((value) => value.toLowerCase() !== username.toLowerCase())].slice(0, 6);
        localStorage.setItem('recent-github-searches', JSON.stringify(next));
        return next;
      });
      setSelectedRepo(null);
      setReadme('');
    } catch (err) {
      const message = err instanceof GitHubApiError ? err.message : 'Unable to load profile data.';
      const statusTitle = err instanceof GitHubApiError ? err.status : undefined;
      setError(
        statusTitle === 404
          ? `User “${username}” was not found on GitHub.`
          : message.includes('rate limit')
            ? 'GitHub API rate limit reached. Try again later or add a personal access token.'
            : message,
      );
      setProfile(null);
      setRepos([]);
      setEvents([]);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const handleOpenRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    try {
      const markdown = await fetchRepoReadme(repo.owner.login, repo.name, token);
      setReadme(markdown);
    } catch (err) {
      setReadme('No README available for this repository.');
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void loadProfile(query);
  };

  const profileStats = [
    { label: 'Stars', value: formatCompactNumber(totalStars), icon: <Star className="h-4 w-4" /> },
    { label: 'Forks', value: formatCompactNumber(totalForks), icon: <GitFork className="h-4 w-4" /> },
    { label: 'Watchers', value: formatCompactNumber(totalWatchers), icon: <Eye className="h-4 w-4" /> },
    { label: 'Open issues', value: formatCompactNumber(totalIssues), icon: <Activity className="h-4 w-4" /> },
  ];

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="panel rounded-3xl p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 p-2 text-white shadow-soft">
                <GitCommitHorizontal className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-blue-500">GitHub Explorer</p>
                <h1 className="text-xl font-bold sm:text-2xl">Public profile intelligence</h1>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <span className="text-xs uppercase tracking-wide text-slate-500">Token</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  placeholder="optional GitHub token"
                  className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>

              <button
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                aria-label="Toggle dark mode"
              >
                {theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search any GitHub username"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                aria-label="Search GitHub user"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              Load profile
            </button>
          </form>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {SUGGESTED_USERS.map((user) => (
              <button
                key={user}
                type="button"
                onClick={() => {
                  setQuery(user);
                  void loadProfile(user);
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                {user}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <div className="panel rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="panel h-28 animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="panel h-[340px] animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
              <div className="panel h-[340px] animate-pulse rounded-3xl bg-slate-200/70 dark:bg-slate-800/70" />
            </div>
          </div>
        ) : profile ? (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {profileStats.map((stat) => (
                <div key={stat.label} className="stat-card rounded-3xl p-4">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                    <span className="text-sm">{stat.label}</span>
                    <span className="rounded-lg bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      {stat.icon}
                    </span>
                  </div>
                  <div className="mt-5 text-2xl font-bold tracking-tight">{stat.value}</div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                  <img
                    src={profile.avatar_url}
                    alt={profile.login}
                    className="h-20 w-20 rounded-full border-2 border-white object-cover shadow-soft dark:border-slate-800"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold">{profile.name || profile.login}</h2>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {profile.login}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{profile.bio || 'No bio available yet.'}</p>
                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-300">
                      {profile.company ? <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4" />{profile.company}</span> : null}
                      {profile.location ? <span className="inline-flex items-center gap-1.5"><Globe className="h-4 w-4" />{profile.location}</span> : null}
                      {profile.blog ? <a href={profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 hover:underline dark:text-blue-400"><ExternalLink className="h-4 w-4" />{profile.blog}</a> : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="panel-strong rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Users className="h-4 w-4" />Followers</div>
                    <div className="mt-2 text-xl font-bold">{formatCompactNumber(profile.followers)}</div>
                  </div>
                  <div className="panel-strong rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Heart className="h-4 w-4" />Following</div>
                    <div className="mt-2 text-xl font-bold">{formatCompactNumber(profile.following)}</div>
                  </div>
                  <div className="panel-strong rounded-2xl p-3">
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><BookOpen className="h-4 w-4" />Repos</div>
                    <div className="mt-2 text-xl font-bold">{formatCompactNumber(profile.public_repos)}</div>
                  </div>
                </div>
              </div>

              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  <CalendarDays className="h-4 w-4" /> Member since
                </div>
                <div className="mt-5 text-3xl font-bold">{formatDate(profile.created_at)}</div>
                <div className="mt-6 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  {profile.twitter_username ? <div className="flex items-center gap-2"><span className="font-medium text-slate-500 dark:text-slate-400">Twitter:</span> @{profile.twitter_username}</div> : null}
                  <div className="flex items-center gap-2"><span className="font-medium text-slate-500 dark:text-slate-400">Profile:</span> <a href={profile.html_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{profile.html_url}</a></div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Repository browser</p>
                    <h3 className="mt-1 text-xl font-bold">Browse public repos</h3>
                  </div>
                  <div className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    {filteredRepos.length} repos
                  </div>
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px]">
                  <input
                    value={repoSearch}
                    onChange={(event) => setRepoSearch(event.target.value)}
                    placeholder="Filter repos by keyword"
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  />
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as 'stars' | 'updated' | 'name')}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="stars">Sort: stars</option>
                    <option value="updated">Sort: updated</option>
                    <option value="name">Sort: name</option>
                  </select>
                  <select
                    value={languageFilter}
                    onChange={(event) => setLanguageFilter(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="all">All languages</option>
                    {languageOptions.map((language) => (
                      <option key={language} value={language}>{language}</option>
                    ))}
                  </select>
                </div>

                <div className="scrollbar-soft max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {filteredRepos.length ? (
                    filteredRepos.map((repo) => (
                      <button
                        key={repo.id}
                        type="button"
                        onClick={() => void handleOpenRepo(repo)}
                        className="repo-card w-full rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition duration-200 dark:border-slate-700 dark:bg-slate-900/80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Code2 className="h-4 w-4 text-slate-500" />
                              <span className="truncate text-base font-semibold text-slate-900 dark:text-slate-50">{repo.name}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">
                              {repo.description || 'No description provided.'}
                            </p>
                          </div>
                          <ChevronDown className="h-4 w-4 rotate-[-90deg] text-slate-400" />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {(repo.topics || []).slice(0, 3).map((topic) => (
                            <span key={topic} className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                              {topic}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{formatCompactNumber(repo.stargazers_count)}</span>
                          <span className="inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{formatCompactNumber(repo.forks_count)}</span>
                          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{toLocaleDate(repo.pushed_at)}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                      No repositories match the current filter.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="panel rounded-3xl p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Visual analytics</p>
                      <h3 className="mt-1 text-xl font-bold">Language breakdown</h3>
                    </div>
                  </div>
                  {languageData.length ? (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie dataKey="value" data={languageData} innerRadius={52} outerRadius={80} paddingAngle={3}>
                            {languageData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => [`${value} repos`, 'Projects']} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-slate-500">No language data.</div>
                  )}
                  <div className="mt-3 space-y-2">
                    {languageData.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                          <span>{entry.name}</span>
                        </div>
                        <span className="font-medium">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel rounded-3xl p-5 sm:p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Top repos</p>
                      <h3 className="mt-1 text-xl font-bold">By stars</h3>
                    </div>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={repoChartData}>
                        <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis tickLine={false} axisLine={false} fontSize={11} />
                        <Tooltip formatter={(value: number) => [value, 'stars']} />
                        <Bar dataKey="stars" radius={[8, 8, 0, 0]} fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Activity feed</p>
                    <h3 className="mt-1 text-xl font-bold">Recent public events</h3>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {events.length} events
                  </div>
                </div>
                <div className="space-y-3">
                  {recentEventItems.length ? (
                    recentEventItems.map((event) => {
                      const payload = event.payload || {};
                      const info =
                        event.type === 'PushEvent'
                          ? payload.commits?.[0]?.message || 'New push'
                          : event.type === 'CreateEvent'
                            ? `Created ${payload.ref_type || 'resource'} ${payload.ref || ''}`
                            : event.type === 'IssuesEvent'
                              ? `${payload.action || 'updated'} issue` 
                              : event.type === 'PullRequestEvent'
                                ? `${payload.action || 'updated'} pull request`
                                : event.type === 'WatchEvent'
                                  ? 'Starred repository'
                                  : event.type === 'ReleaseEvent'
                                    ? `Released ${payload.release?.tag_name || 'new version'}`
                                    : 'GitHub activity';

                      return (
                        <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                                {event.type === 'PushEvent' ? <GitCommitHorizontal className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{event.repo.name}</div>
                                <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{info}</div>
                              </div>
                            </div>
                            <span className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{formatRelativeTime(event.created_at)}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                      No recent public activity found.
                    </div>
                  )}
                </div>
              </div>

              <div className="panel rounded-3xl p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Contributions</p>
                    <h3 className="mt-1 text-xl font-bold">Daily activity heatmap</h3>
                  </div>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="heatmap-grid" aria-label="Contribution heatmap">
                    {contributionData.map((item, index) => {
                      const count = item.count;
                      let level = 0;
                      if (count >= 4) level = 4;
                      else if (count >= 3) level = 3;
                      else if (count >= 2) level = 2;
                      else if (count >= 1) level = 1;

                      return (
                        <div
                          key={`${item.date}-${index}`}
                          data-level={level}
                          className="heatmap-cell"
                          title={`${item.date}: ${count} events`}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Less</span>
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3, 4].map((level) => (
                      <span key={level} className="heatmap-cell" data-level={level} />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </div>
            </section>

            <section className="panel rounded-3xl p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">Quick try</p>
                  <h3 className="mt-1 text-xl font-bold">Recent searches</h3>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {recentSearches.length ? (
                  recentSearches.map((recent) => (
                    <button
                      key={recent}
                      type="button"
                      onClick={() => {
                        setQuery(recent);
                        void loadProfile(recent);
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      {recent}
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">No recent searches yet.</div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <Dialog.Root open={Boolean(selectedRepo)} onOpenChange={(open) => !open && setSelectedRepo(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-y-4 right-4 z-50 w-[min(96vw,780px)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950">
            {selectedRepo ? (
              <>
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Repository detail</p>
                    <Dialog.Title className="mt-1 text-xl font-bold">{selectedRepo.name}</Dialog.Title>
                  </div>
                  <Dialog.Close asChild>
                    <button className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700 dark:border-slate-700 dark:text-slate-300" aria-label="Close repository detail">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>

                <div className="overflow-y-auto p-5">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" />{formatCompactNumber(selectedRepo.stargazers_count)}</span>
                    <span className="inline-flex items-center gap-1"><GitFork className="h-3.5 w-3.5" />{formatCompactNumber(selectedRepo.forks_count)}</span>
                    <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{formatCompactNumber(selectedRepo.watchers_count)}</span>
                    <span className="inline-flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" />{toLocaleDate(selectedRepo.pushed_at)}</span>
                  </div>

                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                    {selectedRepo.description || 'No repository description available.'}
                  </p>

                  {selectedRepo.topics?.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedRepo.topics.map((topic) => (
                        <span key={topic} className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
                          {topic}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                    {readme ? (
                      <article className="readme-content prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
                      </article>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
                        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading README…
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default App;

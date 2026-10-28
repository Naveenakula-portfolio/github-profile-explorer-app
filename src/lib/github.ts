import type { GitHubEvent, GitHubRepo, GitHubUser } from '../types';

const GITHUB_API = 'https://api.github.com';

export class GitHubApiError extends Error {
  status?: number;
  rateLimited?: boolean;

  constructor(message: string, status?: number, rateLimited = false) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.rateLimited = rateLimited;
  }
}

const withHeaders = (token?: string, extraHeaders: Record<string, string> = {}) => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...extraHeaders,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function fetchJson<T>(url: string, token?: string, extraHeaders: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: withHeaders(token, extraHeaders),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const isRateLimit = response.status === 403 || /rate limit/i.test(errorText);
    throw new GitHubApiError(
      isRateLimit ? 'GitHub API rate limit exceeded. Add a token or try again later.' : `Request failed with status ${response.status}`,
      response.status,
      isRateLimit,
    );
  }

  return (await response.json()) as T;
}

export async function fetchUserProfile(username: string, token?: string): Promise<GitHubUser> {
  const encoded = encodeURIComponent(username.trim());
  return fetchJson<GitHubUser>(`${GITHUB_API}/users/${encoded}`, token);
}

export async function fetchUserRepos(username: string, token?: string): Promise<GitHubRepo[]> {
  const all: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const repos = await fetchJson<GitHubRepo[]>(
      `${GITHUB_API}/users/${encodeURIComponent(username.trim())}/repos?per_page=100&page=${page}`,
      token,
    );

    if (!repos.length) break;
    all.push(...repos);

    if (repos.length < 100) break;
    page += 1;
  }

  return all;
}

export async function fetchUserEvents(username: string, token?: string): Promise<GitHubEvent[]> {
  return fetchJson<GitHubEvent[]>(`${GITHUB_API}/users/${encodeURIComponent(username.trim())}/events/public?per_page=30`, token);
}

export async function fetchRepoReadme(owner: string, repo: string, token?: string): Promise<string> {
  const response = await fetch(`${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`, {
    headers: withHeaders(token, {
      Accept: 'application/vnd.github.v3.raw',
    }),
  });

  if (!response.ok) {
    throw new GitHubApiError('README not available for this repository.', response.status, response.status === 403);
  }

  return response.text();
}

export function formatRelativeTime(date: string): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatCompactNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toString();
}

export function toLocaleDate(date: string): string {
  return new Date(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

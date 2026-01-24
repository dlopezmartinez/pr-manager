import { z } from 'zod';

const GITHUB_API_BASE = 'https://api.github.com';

const releaseAssetSchema = z.object({
  id: z.number(),
  name: z.string(),
  size: z.number(),
  browser_download_url: z.string(),
  content_type: z.string(),
});

const releaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  prerelease: z.boolean(),
  draft: z.boolean(),
  published_at: z.string().nullable(),
  assets: z.array(releaseAssetSchema),
});

export type GitHubRelease = z.infer<typeof releaseSchema>;
export type GitHubAsset = z.infer<typeof releaseAssetSchema>;

function getGitHubConfig() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER || 'dlopezmartinez';
  const repo = process.env.GITHUB_REPO_NAME || 'PR-Manager';

  if (!token) {
    throw new Error('GITHUB_TOKEN not configured');
  }

  return { token, owner, repo };
}

function getAuthHeaders(): Record<string, string> {
  const { token } = getGitHubConfig();
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function getLatestRelease(includePrerelease = false): Promise<GitHubRelease | null> {
  const { owner, repo } = getGitHubConfig();

  try {
    if (includePrerelease) {
      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases`,
        { headers: getAuthHeaders() }
      );

      if (!response.ok) {
        console.error(`[GitHubRelease] Failed to fetch releases: ${response.status}`);
        return null;
      }

      const data = await response.json();
      const releases = z.array(releaseSchema).parse(data);
      const validRelease = releases.find((r) => !r.draft);
      return validRelease || null;
    }

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/latest`,
      { headers: getAuthHeaders() }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      console.error(`[GitHubRelease] Failed to fetch latest release: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return releaseSchema.parse(data);
  } catch (error) {
    console.error('[GitHubRelease] Error fetching release:', error);
    return null;
  }
}

export async function getAssetDownloadStream(assetId: number): Promise<Response | null> {
  const { owner, repo, token } = getGitHubConfig();

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases/assets/${assetId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/octet-stream',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        redirect: 'follow',
      }
    );

    if (!response.ok) {
      console.error(`[GitHubRelease] Failed to download asset: ${response.status}`);
      return null;
    }

    return response;
  } catch (error) {
    console.error('[GitHubRelease] Error downloading asset:', error);
    return null;
  }
}

export function compareVersions(current: string, latest: string): number {
  const normalize = (v: string) => {
    const match = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.(\d+))?/i);
    if (!match) return { major: 0, minor: 0, patch: 0, prerelease: null, prereleaseNum: 0 };

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4]?.toLowerCase() || null,
      prereleaseNum: match[5] ? parseInt(match[5], 10) : 0,
    };
  };

  const c = normalize(current);
  const l = normalize(latest);

  if (c.major !== l.major) return l.major - c.major;
  if (c.minor !== l.minor) return l.minor - c.minor;
  if (c.patch !== l.patch) return l.patch - c.patch;

  if (c.prerelease && !l.prerelease) return 1;
  if (!c.prerelease && l.prerelease) return -1;

  if (c.prerelease && l.prerelease) {
    const prereleaseOrder: Record<string, number> = { alpha: 0, beta: 1, rc: 2 };
    const cOrder = prereleaseOrder[c.prerelease] ?? 99;
    const lOrder = prereleaseOrder[l.prerelease] ?? 99;

    if (cOrder !== lOrder) return lOrder - cOrder;
    return l.prereleaseNum - c.prereleaseNum;
  }

  return 0;
}

export type Platform = 'darwin' | 'win32' | 'linux';

export interface PlatformAssets {
  zip?: GitHubAsset;
  dmg?: GitHubAsset;
  exe?: GitHubAsset;
  nupkg?: GitHubAsset;
  releases?: GitHubAsset;
  deb?: GitHubAsset;
  rpm?: GitHubAsset;
}

export function getAssetsForPlatform(release: GitHubRelease, platform: Platform): PlatformAssets {
  const assets: PlatformAssets = {};

  for (const asset of release.assets) {
    const name = asset.name.toLowerCase();

    switch (platform) {
      case 'darwin':
        if (name.endsWith('.zip') && name.includes('darwin')) {
          assets.zip = asset;
        } else if (name.endsWith('.dmg')) {
          assets.dmg = asset;
        }
        break;

      case 'win32':
        if (name.endsWith('.exe') && name.includes('setup')) {
          assets.exe = asset;
        } else if (name.endsWith('.nupkg')) {
          assets.nupkg = asset;
        } else if (name === 'releases') {
          assets.releases = asset;
        }
        break;

      case 'linux':
        if (name.endsWith('.deb')) {
          assets.deb = asset;
        } else if (name.endsWith('.rpm')) {
          assets.rpm = asset;
        }
        break;
    }
  }

  return assets;
}

export function extractVersionFromTag(tagName: string): string {
  return tagName.replace(/^v/, '');
}

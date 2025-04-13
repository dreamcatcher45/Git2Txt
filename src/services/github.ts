export interface GitHubFile {
  path: string;
  type: "file" | "dir";
  content: string;
  sha: string;
  size: number;
}

// File extensions to ignore
const IGNORED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.ico', '.pdf',
  '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib'
]);

// Max file size to process (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

function extractRepoInfo(repoUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== 'github.com') {
      return null;
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }
    return {
      owner: pathParts[0],
      repo: pathParts[1]
    };
  } catch (error) {
    console.error("Error parsing repo URL:", error);
    return null;
  }
}

function shouldProcessFile(path: string, size: number): boolean {
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) return false;
  if (size > MAX_FILE_SIZE) return false;
  return true;
}

async function fetchWithRateLimit(url: string): Promise<Response> {
  const response = await fetch(url);
  
  if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
    throw new Error('GitHub API rate limit exceeded. Please try again later.');
  }
  
  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.statusText}`);
  }
  
  return response;
}

async function getTreeRecursive(owner: string, repo: string, sha: string): Promise<GitHubFile[]> {
  const response = await fetchWithRateLimit(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
  );
  
  const data = await response.json();
  const files: GitHubFile[] = [];

  for (const item of data.tree) {
    if (item.type === 'blob' && shouldProcessFile(item.path, item.size)) {
      const contentResponse = await fetchWithRateLimit(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`
      );
      const contentData = await contentResponse.json();
      
      let content = '';
      try {
        content = atob(contentData.content);
      } catch (error) {
        console.error(`Error decoding content for ${item.path}:`, error);
        continue;
      }

      files.push({
        path: item.path,
        type: 'file',
        content,
        sha: item.sha,
        size: item.size
      });
    }
  }

  return files;
}

export async function getRepoFiles(repoUrl: string): Promise<GitHubFile[]> {
  const repoInfo = extractRepoInfo(repoUrl);
  
  if (!repoInfo) {
    throw new Error("Invalid repository URL provided.");
  }
  
  const { owner, repo } = repoInfo;

  try {
    // Get the default branch
    const repoResponse = await fetchWithRateLimit(
      `https://api.github.com/repos/${owner}/${repo}`
    );
    const repoData = await repoResponse.json();
    const defaultBranch = repoData.default_branch;

    // Get the latest commit SHA
    const branchResponse = await fetchWithRateLimit(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`
    );
    const branchData = await branchResponse.json();
    const commitSha = branchData.object.sha;

    // Get all files
    return await getTreeRecursive(owner, repo, commitSha);
  } catch (error: any) {
    console.error("Error fetching repository files:", error);
    throw new Error(error.message || "An unexpected error occurred while fetching repository files.");
  }
}

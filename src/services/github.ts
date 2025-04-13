'use server';

import { promises as fs } from 'fs';
import path from 'path';
import { simpleGit } from 'simple-git';
import os from 'os';

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

// Cache for cloned repositories
const repoCache = new Map<string, { timestamp: number, files: GitHubFile[] }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function extractRepoPath(repoUrl: string): string | null {
  try {
    const url = new URL(repoUrl);
    if (url.hostname !== 'github.com') {
      return null;
    }
    const pathParts = url.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return null;
    }
    return `${pathParts[0]}/${pathParts[1]}`;
  } catch (error) {
    console.error("Error parsing repo URL:", error);
    return null;
  }
}

async function shouldProcessFile(filepath: string, stats: { size: number }): Promise<boolean> {
  const ext = path.extname(filepath).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) return false;
  if (stats.size > MAX_FILE_SIZE) return false;
  return true;
}

async function readFileFromRepo(filepath: string): Promise<string> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Error reading file ${filepath}:`, error);
    return '';
  }
}

async function listFiles(dir: string, prefix: string = ''): Promise<GitHubFile[]> {
  const files: GitHubFile[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        if (entry.name !== '.git') {
          const subFiles = await listFiles(entryPath, relativePath);
          files.push(...subFiles);
        }
      } else {
        const stats = await fs.stat(entryPath);
        if (await shouldProcessFile(relativePath, stats)) {
          const content = await readFileFromRepo(entryPath);
          files.push({
            path: relativePath,
            type: 'file',
            content,
            sha: '', // Git SHA not needed for local files
            size: stats.size
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error listing files in ${dir}:`, error);
  }
  return files;
}

export async function getRepoFiles(repoUrl: string): Promise<GitHubFile[]> {
  const repoPath = extractRepoPath(repoUrl);
  if (!repoPath) {
    throw new Error("Invalid repository URL provided.");
  }

  // Check cache
  const cached = repoCache.get(repoUrl);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.files;
  }

  // Create a unique temporary directory
  const tempDir = path.join(os.tmpdir(), `repo_${repoPath.replace('/', '_')}_${Date.now()}`);
  
  try {
    // Ensure temp directory exists and is empty
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(tempDir, { recursive: true });

    // Clone repository with depth 1 to get only latest version
    const git = simpleGit();
    await git.clone(`https://github.com/${repoPath}.git`, tempDir, ['--depth', '1']);

    const files = await listFiles(tempDir);

    // Cache the results
    repoCache.set(repoUrl, {
      timestamp: Date.now(),
      files
    });

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    return files;
  } catch (error: any) {
    // Ensure cleanup on error
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    console.error("Error cloning repository:", error);
    throw new Error(`Failed to clone repository: ${error.message}`);
  }
}

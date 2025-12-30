import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  default_branch: string;
  language: string;
  private: boolean;
  updated_at: string;
}

interface GitHubCommit {
  commit: {
    committer: {
      date: string;
    };
  };
}

interface RepositoryResponse {
  id: string;
  name: string;
  fullName: string;
  description: string;
  url: string;
  defaultBranch: string;
  language: string;
  private: boolean;
  updatedAt: string;
  lastCommitDate: string;
}

@Injectable()
export class GithubService {
  constructor(private configService: ConfigService) { }

  async getRepositories(accessToken: string): Promise<RepositoryResponse[]> {
    if (!accessToken) {
      throw new Error('GitHub access token is missing');
    }

    const allRepos: GitHubRepo[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        const response = await axios.get<GitHubRepo[]>(
          'https://api.github.com/user/repos',
          {
            headers: {
              Authorization: `token ${accessToken}`,
              Accept: 'application/vnd.github.v3+json',
            },
            params: {
              per_page: perPage,
              page: page,
              sort: 'updated',
              affiliation: 'owner,collaborator,organization_member',
            },
          },
        );

        allRepos.push(...response.data);

        // Check for next page in Link header
        const linkHeader = response.headers['link'];
        if (!linkHeader || !linkHeader.includes('rel="next"')) {
          break;
        }
        page++;
      }

      const reposWithCommits = await Promise.allSettled(
        allRepos.map(async (repo: GitHubRepo) => {
          let lastCommitDate = repo.updated_at;
          try {
            const commitResponse = await axios.get<GitHubCommit[]>(
              `https://api.github.com/repos/${repo.full_name}/commits`,
              {
                headers: {
                  Authorization: `token ${accessToken}`,
                  Accept: 'application/vnd.github.v3+json',
                },
                params: {
                  per_page: 1,
                  sha: repo.default_branch,
                },
              },
            );
            if (commitResponse.data.length > 0 && commitResponse.data[0]) {
              const firstCommit = commitResponse.data[0];
              if (firstCommit.commit?.committer?.date) {
                lastCommitDate = firstCommit.commit.committer.date;
              }
            }
          } catch {
            // Ignore commit fetch errors
          }

          return {
            id: repo.id.toString(),
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || '',
            url: repo.html_url,
            defaultBranch: repo.default_branch,
            language: repo.language || '',
            private: repo.private,
            updatedAt: repo.updated_at,
            lastCommitDate,
          };
        }),
      );

      const repos = reposWithCommits
        .filter(
          (result): result is PromiseFulfilledResult<RepositoryResponse> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);

      return repos.sort(
        (a, b) =>
          new Date(b.lastCommitDate).getTime() -
          new Date(a.lastCommitDate).getTime(),
      );
    } catch (error) {
      console.error('Error in getRepositories:', error);
      if (axios.isAxiosError(error)) {
        console.error(
          'GitHub API Error:',
          error.response?.status,
          error.response?.data,
        );
      }
      throw error;
    }
  }

  async getRepository(
    accessToken: string,
    fullName: string,
  ): Promise<RepositoryResponse> {
    const response = await axios.get<GitHubRepo>(
      `https://api.github.com/repos/${fullName}`,
      {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );

    const repo = response.data;
    return {
      id: repo.id.toString(),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || '',
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      language: repo.language || '',
      private: repo.private,
      updatedAt: repo.updated_at,
      lastCommitDate: repo.updated_at,
    };
  }
}

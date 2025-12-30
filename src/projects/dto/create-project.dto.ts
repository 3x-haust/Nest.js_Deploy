export class CreateProjectDto {
  repositoryFullName: string;
  repositoryUrl: string;
  defaultBranch: string;
  description?: string;
  language: string;
  name: string;
  framework?: string;
  installCommand?: string;
  outputDir?: string;
  envVariables?: Record<string, string>;
  domain?: string;
  dbType?: 'none' | 'postgresql';
  useRedis?: boolean;
  useElasticsearch?: boolean;
}


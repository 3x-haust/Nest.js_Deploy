import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deployment, DeploymentStatus } from './deployment.entity';
import { Project } from '../projects/project.entity';
import { Client } from 'ssh2';
import { ConfigService } from '@nestjs/config';
import { generateDockerfile } from './docker-templates';
import { DeploymentsGateway } from './deployments.gateway';
import {
  generateDeploymentYaml,
  generateServiceYaml,
  generateIngressYaml,
  generateConfigMapYaml,
  generatePostgresYaml,
  generateRedisYaml,
  generateElasticsearchYaml,
} from './k8s-templates';

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectRepository(Deployment)
    private deploymentsRepository: Repository<Deployment>,
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    private configService: ConfigService,
    private deploymentsGateway: DeploymentsGateway,
  ) { }

  async create(
    projectId: number,
    branch: string,
    commit: string,
    commitMessage: string,
  ): Promise<Deployment> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    const deployment = this.deploymentsRepository.create({
      projectId,
      branch,
      commit,
      commitMessage,
      status: DeploymentStatus.QUEUED,
    });

    const savedDeployment = await this.deploymentsRepository.save(deployment);

    this.deploy(projectId).catch((err) =>
      console.error('Deployment trigger failed', err),
    );

    return savedDeployment;
  }

  async deploy(projectId: number): Promise<Deployment> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }

    let deployment: Deployment;

    deployment = this.deploymentsRepository.create({
      projectId,
      branch: project.defaultBranch,
      commit: 'HEAD',
      commitMessage: 'Manual/Auto deployment',
      status: DeploymentStatus.BUILDING,
    });
    deployment = await this.deploymentsRepository.save(deployment);

    const appName = project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const framework = project.framework || 'unknown';
    const imageName = `localhost:5000/${appName}-${framework}:latest`;
    const domain = project.domain || 'example.com';

    const infraEnv: Record<string, string> = {};
    if (project.dbType === 'postgresql') {
      const dbName = appName.replace(/-/g, '_');
      infraEnv['DATABASE_URL'] = `postgresql://user:password@${appName}-postgres:5432/${dbName}`;
      infraEnv['DB_HOST'] = `${appName}-postgres`;
      infraEnv['DB_PORT'] = '5432';
      infraEnv['DB_USER'] = 'user';
      infraEnv['DB_PASSWORD'] = 'password';
      infraEnv['DB_NAME'] = dbName;
    }
    if (project.useRedis) {
      infraEnv['REDIS_HOST'] = `${appName}-redis`;
      infraEnv['REDIS_PORT'] = '6379';
    }
    if (project.useElasticsearch) {
      infraEnv['ELASTICSEARCH_URL'] = `http://${appName}-elasticsearch:9200`;
    }

    const mergedEnv = { ...infraEnv, ...(project.envVariables || {}) };

    const hasEnvVars = Object.keys(mergedEnv).length > 0;
    const configMapYaml = hasEnvVars
      ? generateConfigMapYaml(appName, mergedEnv)
      : null;

    const containerPort = framework === 'springboot' ? 8080 : 3000;

    const deploymentYaml = generateDeploymentYaml(
      appName,
      imageName,
      containerPort,
      hasEnvVars,
    );
    const serviceYaml = generateServiceYaml(appName, 80, containerPort, project.port);
    const ingressYaml = generateIngressYaml(appName, domain, appName);

    const postgresYaml = project.dbType === 'postgresql' ? generatePostgresYaml(appName) : null;
    const redisYaml = project.useRedis ? generateRedisYaml(appName) : null;
    const esYaml = project.useElasticsearch ? generateElasticsearchYaml(appName) : null;

    this.runSshDeployment(
      project,
      appName,
      imageName,
      deploymentYaml,
      serviceYaml,
      ingressYaml,
      configMapYaml,
      postgresYaml,
      redisYaml,
      esYaml,
      deployment.id,
    ).catch((err) => console.error('SSH deployment failed', err));

    return deployment;
  }

  private async runSshDeployment(
    project: Project,
    appName: string,
    imageName: string,
    deploymentYaml: string,
    serviceYaml: string,
    ingressYaml: string,
    configMapYaml: string | null,
    postgresYaml: string | null,
    redisYaml: string | null,
    esYaml: string | null,
    deploymentId: number,
  ) {
    const sshHost = this.configService.get<string>('SSH_HOST');
    const sshPort = this.configService.get<number>('SSH_PORT') || 22;
    const sshUser = this.configService.get<string>('SSH_USER') || 'ubuntu';
    const sshKey = this.configService.get<string>('SSH_KEY');

    if (!sshHost || !sshKey) {
      console.error('Missing SSH configuration');
      await this.updateStatus(
        deploymentId,
        DeploymentStatus.ERROR,
        undefined,
        undefined,
        'Missing SSH configuration',
      );
      return;
    }

    const conn = new Client();

    await this.updateStatus(deploymentId, DeploymentStatus.BUILDING);

    console.log('Deploying project:', project);

    const projectPath = `${project.name}_${project.framework || 'unknown'}`;
    const dockerfileContent = generateDockerfile(
      project.framework,
      project.installCommand,
    );
    const safeDockerfileContent = dockerfileContent.replace(/"/g, '\\"');

    const commands = [
      'set -e',
      `if [ -d "${projectPath}" ]; then`,
      `  echo "Directory ${projectPath} exists. Pulling latest changes..."`,
      `  cd "${projectPath}"`,
      `  git pull origin ${project.defaultBranch}`,
      `else`,
      `  echo "Directory ${projectPath} not found. Cloning repository..."`,
      `  git clone -b ${project.defaultBranch} ${project.repositoryUrl} "${projectPath}"`,
      `  cd "${projectPath}"`,
      `fi`,
      `PROJECT_ROOT=$(pwd)`,

      `# 1. Check if Dockerfile exists in root`,
      `if [ -f Dockerfile ]; then`,
      `  echo "User-provided Dockerfile found in root. Using it..."`,
      `  docker build -t ${imageName} .`,
      `else`,
      `  # 2. Not in root, check if we need to go into a subdir for package.json`,
      `  if [ ! -f package.json ]; then`,
      `    SUBDIR=$(find . -maxdepth 2 -name package.json -not -path '*/.*' | head -n 1 | xargs dirname)`,
      `    if [ -n "$SUBDIR" ] && [ "$SUBDIR" != "." ]; then`,
      `      echo "Found package.json in subdirectory: $SUBDIR"`,
      `      cd "$SUBDIR"`,
      `    fi`,
      `  fi`,

      `  # 3. Check if Dockerfile exists in subdir (after cd)`,
      `  if [ -f Dockerfile ]; then`,
      `    echo "User-provided Dockerfile found in subdirectory. Using it..."`,
      `  else`,
      `    echo "No user-provided Dockerfile found. Generating one for ${project.framework}..."`,
      `    echo "${safeDockerfileContent}" > Dockerfile`,
      `  fi`,

      `  docker build -t ${imageName} .`,
      `fi`,

      `docker push ${imageName}`,
      `cd "$PROJECT_ROOT"`,
      ...(configMapYaml
        ? [`echo "${configMapYaml.replace(/"/g, '\\"')}" > configmap.yaml`]
        : []),
      ...(postgresYaml
        ? [`echo "${postgresYaml.replace(/"/g, '\\"')}" > postgres.yaml`]
        : []),
      ...(redisYaml
        ? [`echo "${redisYaml.replace(/"/g, '\\"')}" > redis.yaml`]
        : []),
      ...(esYaml
        ? [`echo "${esYaml.replace(/"/g, '\\"')}" > es.yaml`]
        : []),
      `echo "${deploymentYaml}" > deployment.yaml`,
      `echo "${serviceYaml}" > service.yaml`,
      `echo "${ingressYaml}" > ingress.yaml`,
      ...(postgresYaml ? ['kubectl apply -f postgres.yaml'] : []),
      ...(redisYaml ? ['kubectl apply -f redis.yaml'] : []),
      ...(esYaml ? ['kubectl apply -f es.yaml'] : []),
      ...(configMapYaml ? ['kubectl apply -f configmap.yaml'] : []),
      'kubectl apply -f deployment.yaml',
      'kubectl apply -f service.yaml',
      'kubectl apply -f ingress.yaml',
    ];

    const commandBlock = commands.join('\n');

    conn
      .on('ready', () => {
        console.log('Client :: ready');
        conn.exec(commandBlock, async (err, stream) => {
          if (err) {
            console.error('SSH Exec Error:', err);
            await this.updateStatus(deploymentId, DeploymentStatus.ERROR);
            conn.end();
            return;
          }

          let output = '';
          stream
            .on('close', async (code: any, signal: any) => {
              console.log(
                'Stream :: close :: code: ' + code + ', signal: ' + signal,
              );
              conn.end();
              if (code === 0) {
                await this.updateStatus(
                  deploymentId,
                  DeploymentStatus.READY,
                  `https://${project.domain}`,
                  undefined,
                  output,
                );
                this.deploymentsGateway.sendStatusUpdate(
                  deploymentId,
                  DeploymentStatus.READY,
                );
              } else {
                await this.updateStatus(
                  deploymentId,
                  DeploymentStatus.ERROR,
                  undefined,
                  undefined,
                  output,
                );
                this.deploymentsGateway.sendStatusUpdate(
                  deploymentId,
                  DeploymentStatus.ERROR,
                );
              }
            })
            .on('data', async (data: any) => {
              const logChunk = data.toString();
              console.log('STDOUT: ' + logChunk);
              output += logChunk;
              this.deploymentsGateway.sendLog(deploymentId, logChunk);
              // Save logs to database in real-time
              await this.deploymentsRepository.update(deploymentId, {
                buildLogs: output,
              });
            })
            .stderr.on('data', async (data: any) => {
              const logChunk = data.toString();
              console.log('STDERR: ' + logChunk);
              output += logChunk;
              this.deploymentsGateway.sendLog(deploymentId, logChunk);
              // Save logs to database in real-time
              await this.deploymentsRepository.update(deploymentId, {
                buildLogs: output,
              });
            });
        });
      })
      .on('error', async (err) => {
        console.error('SSH Connection Error:', err);
        await this.updateStatus(
          deploymentId,
          DeploymentStatus.ERROR,
          undefined,
          undefined,
          err.message,
        );
      })
      .connect({
        host: sshHost,
        port: sshPort,
        username: sshUser,
        privateKey: sshKey,
      });
  }

  async findAll(projectId: number): Promise<Deployment[]> {
    return this.deploymentsRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, projectId: number): Promise<Deployment> {
    const deployment = await this.deploymentsRepository.findOne({
      where: { id, projectId },
    });
    if (!deployment) {
      throw new NotFoundException(`Deployment with id ${id} not found`);
    }
    return deployment;
  }

  async updateStatus(
    id: number,
    status: DeploymentStatus,
    url?: string,
    duration?: number,
    buildLogs?: string,
  ): Promise<Deployment> {
    const deployment = await this.deploymentsRepository.findOne({
      where: { id },
    });
    if (!deployment) {
      throw new NotFoundException(`Deployment with id ${id} not found`);
    }

    deployment.status = status;
    if (url) deployment.url = url;
    if (duration !== undefined) deployment.duration = duration;
    if (buildLogs) deployment.buildLogs = buildLogs;

    return this.deploymentsRepository.save(deployment);
  }
}

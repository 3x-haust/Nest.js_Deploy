export const generateConfigMapYaml = (
  appName: string,
  envVariables: Record<string, string>,
) => {
  const envData = Object.entries(envVariables)
    .map(([key, value]) => {
      if (value.includes('\n')) {
        const indentedValue = value
          .split('\n')
          .map((line) => `    ${line}`)
          .join('\n');
        return `  ${key}: |-\n${indentedValue}`;
      }
      return `  ${key}: "${value.replace(/"/g, '\\"')}"`;
    })
    .join('\n');

  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${appName}-config
data:
${envData || '  # No environment variables'}
`;
};

export const generateDeploymentYaml = (
  appName: string,
  imageName: string,
  containerPort: number = 3000,
  hasConfigMap: boolean = false,
) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
      annotations:
        kubectl.kubernetes.io/restartedAt: "${new Date().toISOString()}"
    spec:
      containers:
        - name: ${appName}
          image: ${imageName.replace('localhost', '192.168.0.2')}
          ports:
            - containerPort: ${containerPort}
          imagePullPolicy: Always${hasConfigMap
    ? `
          envFrom:
            - configMapRef:
                name: ${appName}-config`
    : ''
  }
`;

export const generateServiceYaml = (
  appName: string,
  servicePort: number = 80,
  targetPort: number = 3000,
  nodePort?: number,
) => {
  const type = nodePort ? 'NodePort' : 'ClusterIP';
  const nodePortYaml = nodePort ? `\n      nodePort: ${nodePort}` : '';
  return `apiVersion: v1
kind: Service
metadata:
  name: ${appName}
spec:
  type: ${type}
  selector:
    app: ${appName}
  ports:
    - protocol: TCP
      port: ${servicePort}
      targetPort: ${targetPort}${nodePortYaml}
`;
};

export const generateIngressYaml = (
  appName: string,
  domain: string,
  serviceName: string,
) => `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${appName}-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-production
    apiVersion: networking.k8s.io/v1
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ${domain}
      secretName: ${appName}-tls
  rules:
    - host: ${domain}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${serviceName}
                port:
                  number: 80
`;

export const generatePostgresYaml = (appName: string) => `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${appName}-postgres-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}-postgres
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}-postgres
  template:
    metadata:
      labels:
        app: ${appName}-postgres
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          env:
            - name: POSTGRES_DB
              value: ${appName.replace(/-/g, '_')}
            - name: POSTGRES_USER
              value: user
            - name: POSTGRES_PASSWORD
              value: password
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          ports:
            - containerPort: 5432
          volumeMounts:
            - name: postgres-storage
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: postgres-storage
          persistentVolumeClaim:
            claimName: ${appName}-postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}-postgres
spec:
  selector:
    app: ${appName}-postgres
  ports:
    - protocol: TCP
      port: 5432
      targetPort: 5432
`;

export const generateRedisYaml = (appName: string) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}-redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}-redis
  template:
    metadata:
      labels:
        app: ${appName}-redis
    spec:
      containers:
        - name: redis
          image: redis:alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}-redis
spec:
  selector:
    app: ${appName}-redis
  ports:
    - protocol: TCP
      port: 6379
      targetPort: 6379
`;

export const generateElasticsearchYaml = (
  appName: string,
) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}-elasticsearch
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}-elasticsearch
  template:
    metadata:
      labels:
        app: ${appName}-elasticsearch
    spec:
      containers:
        - name: elasticsearch
          image: docker.elastic.co/elasticsearch/elasticsearch:7.17.10
          env:
            - name: discovery.type
              value: single-node
            - name: ES_JAVA_OPTS
              value: "-Xms512m -Xmx512m"
          ports:
            - containerPort: 9200
---
apiVersion: v1
kind: Service
metadata:
  name: ${appName}-elasticsearch
spec:
  selector:
    app: ${appName}-elasticsearch
  ports:
    - protocol: TCP
      port: 9200
      targetPort: 9200
`;

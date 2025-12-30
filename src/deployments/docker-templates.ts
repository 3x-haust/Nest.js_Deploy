export const generateDockerfile = (
  framework: string,
  installCommand: string,
  envKeys: string[] = [],
): string => {
  const isYarn = installCommand ? installCommand.includes('yarn') : true;
  const install = installCommand || 'yarn install';
  const build = isYarn ? 'yarn build' : 'npm run build';
  const lockFile = isYarn ? 'COPY yarn.lock ./' : '';

  const buildArgs = envKeys
    .filter((key) => key.startsWith('VITE_') || key.startsWith('REACT_APP_'))
    .map((key) => `ARG ${key}\nENV ${key}=$${key}`)
    .join('\n');

  switch (framework) {
    case 'react':
    case 'nextjs':
    case 'nestjs':
    case 'nodejs':
    case 'other':
      return `
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
${lockFile}

RUN ${install}

COPY . .

${buildArgs}

RUN ${build}

EXPOSE 3000

${
  framework === 'nestjs'
    ? 'CMD ["node", "dist/main.js"]'
    : framework === 'nodejs'
      ? 'CMD ["npm", "start"]'
      : framework === 'react'
        ? 'RUN yarn global add serve\nCMD ["serve", "-s", "dist", "-l", "3000"]'
        : 'CMD ["yarn", "start"]'
}
`;

    case 'springboot':
      return `
FROM maven:3.9-eclipse-temurin-17-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
`;

    default:
      return `
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN ${install}
COPY . .
RUN ${build}
EXPOSE 3000
CMD ["npm", "start"]
`;
  }
};

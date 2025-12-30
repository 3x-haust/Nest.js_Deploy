export const generateDockerfile = (
  framework: string,
  installCommand: string,
): string => {
  const install = installCommand || 'yarn install';
  const build = 'yarn build';

  switch (framework) {
    case 'react':
      return `
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY yarn.lock ./

RUN ${install}

COPY . .

RUN ${build}
EXPOSE 3000

RUN yarn global add serve
 
 CMD serve -s dist -l 3000
`;

    case 'nextjs':
      return `
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY yarn.lock ./

RUN ${install}

COPY . .

RUN ${build}
EXPOSE 3000

CMD ["yarn", "start"]
`;

    case 'nestjs':
      return `
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN ${install}
COPY . .
RUN ${build}
EXPOSE 3000
CMD ["node", "dist/main.js"]
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

    case 'nodejs':
      return `
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN ${install}
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
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

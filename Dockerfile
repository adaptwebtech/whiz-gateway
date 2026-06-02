# ---------- Build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git bash ca-certificates

COPY package*.json ./
RUN npm ci --registry=https://registry.npmjs.org/

COPY prisma ./prisma
COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY eslint.config.mjs ./
COPY .prettierrc ./

RUN npx prisma generate
RUN npm run build
RUN npm run lint
RUN npm run test
RUN npm prune --production

# ---------- Production stage ----------
FROM node:22-alpine AS production

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "dist/main"]

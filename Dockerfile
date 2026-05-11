FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" pnpm prisma generate
RUN pnpm build


# ───────────────────────────────────────
FROM node:22-alpine AS runner

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
RUN pnpm prisma generate --schema=./prisma/schema.prisma

EXPOSE 3320

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3320/v1/aideep/api/docs > /dev/null || exit 1

CMD ["sh", "-c", "pnpm prisma db push && node dist/src/main"]

# Next.js 애플리케이션을 위한 멀티 스테이지 빌드 Dockerfile

# Stage 1: 의존성 설치 및 빌드
FROM node:20-alpine AS builder

WORKDIR /app

# package.json과 package-lock.json 복사
COPY package.json package-lock.json* ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# Next.js 빌드
RUN npm run build

# Stage 2: 프로덕션 런타임
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 시스템 사용자 생성 (보안을 위해 root가 아닌 사용자로 실행)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 필요한 파일만 복사
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 소유권 변경
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]


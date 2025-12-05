# Docker 빠른 시작 가이드

## 1. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성하세요:

```bash
UPSTAGE_API_KEY=your_upstage_api_key_here
UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization
UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions
```

## 2. Docker 이미지 빌드

```bash
docker build -t hw-generator:latest .
```

## 3. 컨테이너 실행

### 방법 1: Docker Compose 사용 (권장)

```bash
docker-compose up -d
```

### 방법 2: Docker 명령어 직접 사용

```bash
docker run -d \
  --name hw-generator \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  hw-generator:latest
```

## 4. 접속 확인

브라우저에서 `http://localhost:3000` 또는 `http://your-vm-ip:3000`으로 접근하세요.

## 5. 로그 확인

```bash
# Docker Compose 사용 시
docker-compose logs -f

# Docker 직접 사용 시
docker logs -f hw-generator
```

## 6. 컨테이너 중지 및 제거

```bash
# Docker Compose 사용 시
docker-compose down

# Docker 직접 사용 시
docker stop hw-generator
docker rm hw-generator
```

## 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요
- 프로덕션 환경에서는 환경 변수를 안전하게 관리하세요 (Docker secrets, Kubernetes secrets 등)


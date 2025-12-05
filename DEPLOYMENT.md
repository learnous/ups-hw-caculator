# 하드웨어 요구사항 계산기 배포 가이드

## Docker를 사용한 배포

### 사전 요구사항
- Docker 및 Docker Compose 설치
- Upstage API 키

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 환경 변수를 설정하세요:

```bash
UPSTAGE_API_KEY=your_upstage_api_key_here
UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization
UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions
```

### 2. Docker 이미지 빌드 및 실행

#### 방법 1: Docker Compose 사용 (권장)

```bash
# 이미지 빌드 및 컨테이너 시작
docker-compose up -d --build

# 로그 확인
docker-compose logs -f

# 컨테이너 중지
docker-compose down
```

#### 방법 2: Docker 명령어 직접 사용

```bash
# 이미지 빌드
docker build -t hw-generator:latest .

# 컨테이너 실행
docker run -d \
  --name hw-generator \
  -p 3000:3000 \
  -e UPSTAGE_API_KEY=your_upstage_api_key_here \
  -e UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization \
  -e UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions \
  --restart unless-stopped \
  hw-generator:latest
```

### 3. 애플리케이션 접근

브라우저에서 `http://localhost:3000` 또는 `http://your-vm-ip:3000`으로 접근하세요.

### 4. 헬스 체크

```bash
# 컨테이너 상태 확인
docker ps

# 로그 확인
docker logs hw-generator

# 헬스 체크
curl http://localhost:3000
```

## 프로덕션 배포 시 고려사항

### 보안
- 환경 변수는 절대 코드에 하드코딩하지 마세요
- `.env` 파일은 `.gitignore`에 포함되어 있습니다
- 프로덕션에서는 Docker secrets나 Kubernetes secrets 사용을 권장합니다

### 성능
- 필요시 리소스 제한 설정:
  ```yaml
  # docker-compose.yml에 추가
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '1'
        memory: 1G
  ```

### 로깅
- 로그는 Docker의 기본 로깅 드라이버를 사용하거나 외부 로깅 시스템에 연결할 수 있습니다

### 모니터링
- 헬스 체크 엔드포인트: `http://localhost:3000`
- 필요시 Prometheus, Grafana 등과 통합 가능

## 트러블슈팅

### 포트가 이미 사용 중인 경우
```bash
# 다른 포트 사용 (예: 3001)
docker run -d -p 3001:3000 --name hw-generator hw-generator:latest
```

### 빌드 실패 시
```bash
# 캐시 없이 재빌드
docker-compose build --no-cache
```

### 컨테이너 로그 확인
```bash
docker logs -f hw-generator
```


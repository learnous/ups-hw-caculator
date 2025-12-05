# AI 기반 하드웨어 계산기 (AI-Powered Hardware Calculator)

Next.js 14 기반의 지능형 하드웨어 요구사항 계산 애플리케이션입니다. 자연어 쿼리를 통해 OCR, DP, LLM 워크로드를 위한 최적의 GPU, CPU, 메모리 구성을 추천합니다.

## 주요 기능

- 🤖 **자연어 기반 쿼리**: 대화형 인터페이스로 워크로드 설명
- 💰 **비용 최적화**: 예산 제약 하 최적 구성 추천
- 📊 **동적 성능 예측**: UIE를 통한 실제 벤치마크 데이터 기반 예측
- 🔧 **자동 튜닝**: 성능 최적화 권장사항 제공
- 📸 **UIE 통합**: 부하테스트 결과 이미지에서 성능 데이터 자동 추출

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: shadcn/ui
- **Form Management**: react-hook-form + zod
- **Charts**: Recharts
- **Linting**: ESLint + Prettier

## 프로젝트 구조

```
/app
  /input          # 입력 폼 페이지
  /result         # 결과 대시보드 페이지
  /api
    /calculate    # 계산 API 라우트
/lib
  /calculators
    hardwareCalculator.ts  # 하드웨어 계산 로직
  /constants
    gpuDB.ts      # GPU 성능 데이터베이스
    ocrProfiles.ts # OCR 프로필 상수
    dpProfiles.ts  # DP 프로필 상수
  /types
    index.ts      # TypeScript 타입 정의
```

## 시작하기

### 설치

```bash
npm install
```

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# Upstage API (Document Parse + Solar Pro 2 LLM)
UPSTAGE_API_KEY=up_fWQ1Pg9MedkWvqorFuh3QJCOR4OXk
UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization
UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions
```

**Upstage API 키:**
- 현재 설정된 API 키: `up_fWQ1Pg9MedkWvqorFuh3QJCOR4OXk`
- API 키는 `.env.local` 파일에 저장되어 있으며, Git에 커밋되지 않습니다.

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 빌드

```bash
npm run build
npm start
```

## 주요 기능

### 1. 자연어 쿼리 인터페이스 (`/`)

- **대화형 입력**: 자연어로 워크로드 설명
- **자동 정보 수집**: 필요한 정보가 없으면 질문으로 수집
- **실시간 응답**: 대화형으로 정보를 채워나감

예시:
- "분당 1000건 처리, 진료비 영수증 300건, 세부내역서 300건"
- "H100 GPU로 LLM 50명 동시 사용자 지원"
- "예산 10만 달러 이내 최적 구성 추천"

### 2. AI 쿼리 처리 API (`/api/ai/query`)

- 자연어에서 정보 추출
- 대화 상태 관리
- 비용 최적화 및 성능 튜닝 권장사항 생성

### 3. 상세 입력 페이지 (`/input`)

- **OCR 워크로드 설정**: 여러 종류의 OCR 문서 워크로드 추가
- **DP 워크로드**: 문서 처리 워크로드 설정
- **LLM 동시성**: 동시 사용자 수, 프롬프트 크기, 스트리밍 옵션
- **클러스터 설정**: 배포 모드 및 MIG 프로필 선택
- **시스템 설정**: 운영 시간, HA 레벨, GPU 선호도, CPU 성능 등급

### 4. 결과 페이지 (`/result`)

- **요약 카드**: 권장 GPU, VRAM, CPU, 메모리 요구사항
- **비용 최적화 제안**: 대안 구성 및 비용 절감 전략
- **성능 튜닝 권장사항**: 동적 성능 예측 기반 최적화 제안
- **GPU 사용량 분석**: OCR, 정보추출, 문서분류기, DP, LLM별 분석
- **GPU 모델 비교**: L40S, H100, H200 비교 차트

## 계산 로직

### OCR 워크로드
- MIG 모드: MIG 프로필 기반 인스턴스 계산
- 전체 GPU 모드: GPU당 메모리 기반 계산
- pLLM 활성화 시: 컨테이너당 40GB VRAM, 인스턴스당 40문서/분

### DP 워크로드
- 1g MIG 인스턴스당 약 15문서/분 처리량 가정

### LLM 워크로드
- 동시 사용자 수와 프롬프트 크기에 따른 VRAM 계산
- 스트리밍 옵션에 따른 메모리 압력 감소 고려

## AI 기능

### UIE (Universal Information Extractor) 통합

- 부하테스트 결과 이미지를 `public/benchmark-results/` 폴더에 저장
- 파일 명명 규칙: `{gpu-model}-{workload-type}.png`
  - 예: `h100-ocr.png`, `l40s-dp.png`
- UIE API를 통해 이미지에서 성능 데이터 자동 추출
- 동적 성능 예측에 활용

### 비용 최적화 엔진

- GPU 모델 비교 및 대안 제안
- MIG 활용 권장
- 운영 시간 및 HA 레벨 최적화 제안
- 예산 제약 하 최적 구성 찾기

### 동적 성능 예측

- 실제 벤치마크 데이터 기반 예측
- 최적 컨테이너 수 자동 계산
- 처리량 및 지연시간 예측
- GPU별 성능 튜닝 권장사항

## GPU 데이터베이스

현재 지원하는 GPU 모델:
- **L40S**: 48GB VRAM, FP32 91.6 TFLOPS, $6,500
- **A100**: 80GB VRAM, FP32 19.5 TFLOPS, $15,000
- **H100**: 80GB VRAM, FP32 67 TFLOPS, $30,000
- **H200**: 141GB VRAM, FP32 67 TFLOPS, $40,000
- **B100**: FP32 60 TFLOPS
- **B200**: FP32 75 TFLOPS

## 프로젝트 구조

```
/app
  /                    # 자연어 쿼리 인터페이스 (메인)
  /input               # 상세 입력 폼 페이지
  /result              # 결과 대시보드 페이지
  /api
    /ai/query          # AI 쿼리 처리 API
    /calculate         # 계산 API 라우트
/lib
  /ai
    naturalLanguageProcessor.ts  # 자연어 처리
    costOptimizer.ts             # 비용 최적화 엔진
    performancePredictor.ts      # 성능 예측 및 튜닝
  /calculators
    hardwareCalculator.ts        # 하드웨어 계산 로직
  /services
    uieService.ts                # UIE API 통합
  /constants
    gpuDB.ts                     # GPU 성능 데이터베이스
    documentTypes.ts             # 문서 타입 및 성능 데이터
    dpBenchmarkData.ts           # DP 벤치마크 데이터
/public
  /benchmark-results             # 부하테스트 결과 이미지 저장소
```

## 라이선스

MIT


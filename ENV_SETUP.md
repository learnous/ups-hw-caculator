# 환경 변수 설정 가이드

## 필수 환경 변수

### Upstage Document Parse API 설정

Upstage Document Parse API를 사용하여 부하테스트 결과 이미지를 텍스트로 변환합니다.

**API 키 발급:**
1. [Upstage Console](https://console.upstage.ai)에 가입 및 로그인
2. API Keys 메뉴에서 API 키 발급
3. 발급받은 API 키를 환경 변수에 설정

```env
# Upstage Document Parse API
UPSTAGE_API_KEY=your_upstage_api_key_here
UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization
```

**API 엔드포인트:**
- 기본 URL: `https://api.upstage.ai/v1/document-digitization`
- 인증: Bearer 토큰 (API 키)
- 요청 형식: multipart/form-data

**요청 파라미터:**
- `document`: 파일 (이미지 또는 PDF)
- `ocr`: "force" (OCR 강제 실행) 또는 "auto"
- `coordinates`: true/false (각 요소의 위치 정보 반환 여부)
- `output_format`: "html", "markdown", "text" (출력 형식)

**참고 문서:**
- [Upstage Document Parsing 문서](https://console.upstage.ai/docs/capabilities/digitize/document-parsing)

### Upstage Solar Pro 2 LLM API 설정

Upstage Solar Pro 2 LLM API를 사용하여 부하테스트 결과를 파싱하고 기술적 설명을 생성합니다.

```env
# Upstage Solar Pro 2 LLM API
UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions
```

**API 스펙:**
- OpenAI 인터페이스와 동일한 형식
- 엔드포인트: `https://api.upstage.ai/v1/chat/completions`
- 인증: Bearer 토큰 (UPSTAGE_API_KEY 사용)
- 요청 형식: JSON

**참고 문서:**
- [Upstage Solar Pro 2 Reasoning 문서](https://console.upstage.ai/docs/capabilities/generate/reasoning)

**요청 예시:**
```json
{
  "model": "solar-pro",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

## 환경 변수 파일 생성

프로젝트 루트에 `.env.local` 파일을 생성하세요:

```bash
cp .env.example .env.local
```

그리고 실제 값으로 수정하세요.

## 사용 방법

### 1. 부하테스트 이미지 업로드

`/input` 페이지에서 부하테스트 결과 이미지를 업로드하면:
1. Upstage Document Parse API로 이미지를 텍스트로 변환
2. Solar Pro 2 LLM으로 텍스트에서 구조화된 데이터 추출

### 2. 부하테스트 텍스트 직접 입력

이미 텍스트로 변환된 부하테스트 결과를 직접 입력할 수도 있습니다.

### 3. 계산 및 기술적 설명 생성

계산 버튼을 클릭하면:
1. 부하테스트 데이터를 파싱하여 성능 프로필에 반영
2. 하드웨어 요구사항 계산
3. Solar Pro 2 LLM으로 기술적 설명 자동 생성

## API 호출 예시

### Document Parse API 호출

```typescript
import { parseDocument } from "@/lib/services/documentParseService";

const result = await parseDocument({
  image: file, // File 객체
  ocr: "force",
  coordinates: false,
  outputFormat: "text",
});

console.log(result.text); // 추출된 텍스트
```

### Solar Pro 2 LLM API 호출

```typescript
import { callSolarLLM } from "@/lib/services/solarLLMService";

const response = await callSolarLLM({
  messages: [
    { role: "system", content: "당신은 전문가입니다." },
    { role: "user", content: "질문 내용" },
  ],
  temperature: 0.7,
  max_tokens: 2000,
});

console.log(response.content); // LLM 응답
```

/**
 * Upstage Solar Pro 2 LLM API 서비스
 */


export interface LLMRequest {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Upstage Solar Pro 2 LLM API 호출
 */
export async function callSolarLLM(request: LLMRequest): Promise<LLMResponse> {
  const apiKey = process.env.UPSTAGE_API_KEY;
  const apiUrl = process.env.UPSTAGE_LLM_API_URL || "https://api.upstage.ai/v1/chat/completions";

  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY 환경 변수가 설정되지 않았습니다.");
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model || "solar-pro2",
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.max_tokens ?? 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Solar LLM API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // OpenAI 형식 응답 파싱
    const content = data.choices?.[0]?.message?.content || "";
    const usage = data.usage || {};

    return {
      content,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
      },
    };
  } catch (error) {
    console.error("Solar LLM API 호출 오류:", error);
    throw error;
  }
}

/**
 * 부하테스트 결과를 파싱하여 구조화된 데이터 추출
 */
export async function parseBenchmarkResults(
  benchmarkText: string
): Promise<
  Array<{
    gpuModel: string;
    workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
    documentType?: string | null; // OCR인 경우 문서 타입 (예: "진료비 영수증", "진료비 세부내역서" 등)
    nonMigRps?: number | null; // GPU별 nonMigRps (여러 컨테이너 데이터 분석 결과)
    migRps?: number | null; // GPU별 migRps (컨테이너 1개일 때의 값)
  }>
> {
  const systemPrompt = `당신은 부하테스트 결과를 분석하는 전문가입니다. 
다음 텍스트에서 **모든 워크로드 타입**에 대한 GPU 모델, 워크로드 타입, 문서 타입(OCR 또는 InformationExtraction인 경우), Pod 수별 RPS와 Latency 정보를 추출하여 **반드시 유효한 JSON 형식만** 반환하세요.

**워크로드 타입 구분 (매우 중요):**

워크로드 타입은 반드시 다음 5가지 중 하나여야 합니다:
1. **"OCR"** - OCR 워크로드
2. **"DP"** - DP 워크로드  
3. **"DocumentClassifier"** (또는 "분류기", "문서분류기") - 문서 분류기 워크로드
4. **"InformationExtraction"** (또는 "정보추출") - 정보추출 워크로드
5. **"LLM"** - LLM 워크로드

**"테스트 이름" 컬럼 분석 규칙:**

**1. 명시적 워크로드 타입이 있는 경우:**
- "OCR"로 시작하거나 "OCR"만 있는 경우:
  * workloadType: "OCR"
  * documentType: null (반드시 null이어야 함. OCR 워크로드는 문서 타입을 가지지 않습니다)
  
- "DP"로 시작하거나 "DP"만 있는 경우:
  * workloadType: "DP"
  * documentType: null
  
- "분류기" 또는 "문서분류기"인 경우:
  * workloadType: "DocumentClassifier"
  * documentType: null
  
- "LLM"으로 시작하거나 "LLM"만 있는 경우:
  * workloadType: "LLM"
  * documentType: null

**2. 문서 타입 이름만 있는 경우 - "model name" 컬럼을 반드시 확인:**

**OCR 워크로드 관련 model name 키워드:**
- "ocr"만 해당합니다.
- **중요**: OCR 워크로드는 진짜 OCR만 수행하는 워크로드입니다. 정보추출을 포함하는 워크로드가 아닙니다.
- **OCR 워크로드는 documentType을 가질 수 없습니다. documentType은 반드시 null이어야 합니다.**
- "ocr" 키워드가 있고, 문서 타입 이름이 있는 경우: workloadType: "InformationExtraction", documentType: 해당 문서 타입 이름
- "ocr" 키워드가 있고, 문서 타입 이름이 없는 경우: workloadType: "OCR", documentType: null

**InformationExtraction (정보추출) 워크로드 관련 model name 키워드:**
- "br" (조직 검사 결과지), "pir", "rtr", "dtc", "ir", "iia", "sia", "mbr", "med", "phr", "pr", "or", "ds" 등
- 이 키워드가 있으면: workloadType: "InformationExtraction", documentType: 해당 문서 타입 이름

**InformationExtraction 워크로드로 분류해야 하는 문서 타입:**
다음 문서 타입들은 "model name" 컬럼과 관계없이 **반드시 InformationExtraction 워크로드**로 분류하세요:
- "진료비 영수증", "진료비 세부내역서", "진료비 납입확인서"
- "처방전", "수술 기록지", "진단 소견서", "진단서"
- "펫보험영수증", "렌터카청구서", "치과치료 확인서"
- "보험금청구서", "개인정보동의서", "개인(신용)정보처리"
- "신규양식", "약제비 영수증"
- "조직 검사 결과지"

**주의사항:**
- 위에 나열된 문서 타입들은 모두 InformationExtraction 워크로드입니다.
- "model name" 컬럼이 "ocr"가 아니고, 위 문서 타입 목록에 포함되어 있으면 반드시 InformationExtraction으로 분류하세요.
- "model name" 컬럼이 "mbr", "med", "phr", "pr", "or", "ds" 등인 경우, 이들은 정보추출 워크로드이므로 InformationExtraction으로 분류하세요.
- "model name" 컬럼 정보가 없거나 불명확한 경우, 위 문서 타입 목록에 포함되어 있으면 InformationExtraction으로 분류하세요.

**절대 하지 말아야 할 것:**
- 문서 타입 이름을 workloadType으로 사용하지 마세요 (예: "펫보험영수증"을 workloadType으로 사용하면 안 됨)
- 위에 나열된 문서 타입들을 OCR로 잘못 분류하지 마세요. 모두 InformationExtraction입니다.

중요 사항:
1. 응답은 오직 JSON 배열만 포함해야 하며, 설명이나 다른 텍스트는 포함하지 마세요.
2. workloadType은 반드시 다음 5가지 중 하나여야 합니다: "OCR", "DP", "DocumentClassifier" (또는 "분류기"), "InformationExtraction" (또는 "정보추출"), "LLM"
3. **OCR 워크로드의 documentType은 반드시 null이어야 합니다. OCR 워크로드는 문서 타입을 가지지 않습니다.**
4. InformationExtraction 워크로드인 경우, "테스트 이름" 컬럼에서 문서 타입을 추출하여 documentType 필드에 포함하세요.
5. **매우 중요 - migRps와 nonMigRps 구분 규칙 (절대 규칙):**
   - **GPU 타입에 따라 구분:**
     * **MIG 프로필이 있는 GPU (H100, H200, B100, B200)**: nonMigRps와 migRps를 모두 설정하세요.
     * **MIG 프로필이 없는 GPU (L40S, A100, A6000, RTX3090 등)**: nonMigRps만 설정하세요.
   
   - **nonMigRps (모든 GPU용)**:
     * **매우 중요**: nonMigRps는 **여러 컨테이너를 띄워서** 도출해야 하는 값입니다.
     * **절대 금지 사항 (매우 중요!):**
       * 컨테이너 1개일 때의 값은 절대 nonMigRps로 사용하지 마세요!
       * 컨테이너 1개일 때의 값은 migRps입니다.
       * 예시: 컨테이너 1개일 때 RPS가 1.96이면, 이것은 migRps=1.96이지 nonMigRps가 아닙니다!
     * **필수 조건**: nonMigRps를 계산하려면 최소 2개 이상의 서로 다른 컨테이너 수 데이터가 있어야 합니다.
     * **컨테이너 1개 데이터만 있는 경우:**
       * nonMigRps를 null로 설정하세요.
       * MIG GPU인 경우 migRps만 설정하세요.
     * **여러 컨테이너 데이터가 있는 경우:**
       * 컨테이너 1개 데이터는 무시하고, 컨테이너 2개 이상의 데이터만 사용하여 기울기 분석을 수행하세요.
       * 예시: 컨테이너 1개, 10개 데이터가 있으면 → 컨테이너 1개는 무시하고, 컨테이너 10개 데이터를 사용하거나 다른 컨테이너 데이터를 찾으세요.
     * **기울기 분석 방법 (2개 이상의 컨테이너 데이터가 있을 때만):**
       * 컨테이너 수가 증가하면서 분당 처리량이 증가하는 패턴을 분석하세요.
       * 각 구간의 기울기를 계산하세요: (다음 분당 처리량 - 이전 분당 처리량) / (다음 컨테이너 수 - 이전 컨테이너 수)
       * 기울기가 이전 구간보다 크게 감소하는 지점(기울기가 꺾이는 지점)을 찾으세요.
       * 예시: 컨테이너 1→2: 기울기 0.05, 컨테이너 2→4: 기울기 0.04, 컨테이너 4→6: 기울기 0.02
         → 컨테이너 4→6에서 기울기가 크게 감소했으므로, 컨테이너 4개가 최적 지점입니다.
     * **nonMigRps 계산:**
       * 최적 지점(기울기가 꺾이는 지점)에서의 **총 분당 처리량**을 RPS로 변환한 후, 그 지점의 컨테이너 수로 나눈 값 (컨테이너당 RPS)
       * 계산 순서: 1) 총 분당 처리량 → 2) 총 RPS로 변환 (분당 처리량 / 60) → 3) 컨테이너 수로 나누기 (총 RPS / 컨테이너 수)
       * 예시: 컨테이너 4개가 최적 지점이고 분당 처리량이 100이면, 총 RPS = 100 / 60 = 1.6667, nonMigRps = 1.6667 / 4 = 0.41666 RPS (컨테이너당 RPS)
       * 예시: 컨테이너 10개가 최적 지점이고 분당 처리량이 285.6이면, 총 RPS = 285.6 / 60 = 4.76, nonMigRps = 4.76 / 10 = 0.476 RPS (컨테이너당 RPS)
   - **migRps (MIG GPU용 - H100, H200, B100, B200)**: 
     * **매우 중요**: migRps는 **컨테이너 1개만 띄웠을 때** 도출하는 값입니다.
     * **컨테이너 1개인 동일 문서 데이터가 여러 개인 경우 (VU가 다르거나 여러 행이 있는 경우):**
       * 컨테이너 수가 1개인 모든 행을 찾으세요.
       * 각 행의 RPS 값을 확인하세요 (RPS 컬럼이 있으면 그 값을 사용하고, 없으면 분당 처리량을 60으로 나눈 값을 사용).
       * **모든 컨테이너 1개 행의 RPS 값들 중 가장 큰 값을 migRps로 사용하세요.**
       * 예시: 컨테이너 1개일 때 RPS가 0.6, 1.96, 1.96, 1.92, 1.96이 있으면 → migRps = 1.96 (최대값)
       * 예시: 컨테이너 1개일 때 RPS가 0.46, 1.87, 1.87이 있으면 → migRps = 1.87 (최대값)
       * **절대 컨테이너 1개일 때의 첫 번째 값이나 작은 값을 사용하지 마세요. 반드시 최대값을 찾아서 사용하세요.**
     * **MIG GPU인 경우, migRPS는 컨테이너 1개일 때의 RPS 값 중 최대값을 사용하세요.**
     * **MIG GPU인 경우: nonMigRps와 migRps를 모두 설정해야 합니다.**
6. **매우 중요 - 처리량 값 우선순위 및 변환 규칙:**
   - **처리량 값이 여러 개 있는 경우 우선순위:**
     1. **분당 처리량 우선**: "분당페이지", "분당 처리량", "분당 X페이지", "X pages/min", "X docs/min" 같은 분당 처리량이 있으면 이것을 우선 사용하세요.
     2. **초당 처리량**: 분당 페이지, 분당 처리량이 없을 때만 "RPS: 0.43", "0.43 req/sec" 같은 초당 처리량을 사용하세요.
   - **RPS 변환 규칙:**
     * 분당 처리량을 RPS로 변환: **RPS = 분당 처리량 / 60**
     * 예시: "분당 25.8페이지" → RPS = 25.8 / 60 = 0.43 RPS
     * 예시: "30 docs/min" → RPS = 30 / 60 = 0.5 RPS
   - **절대 분당 처리량을 그대로 RPS로 사용하지 마세요!** 분당 처리량을 RPS로 변환하지 않으면 잘못된 값이 됩니다.
7. **매우 중요 - 모든 필드 채우기:**
   - 부하테스트 결과에서 GPU 모델, 워크로드 타입, 문서 타입을 반드시 추출하세요.
   - 값을 계산할 수 없는 경우에만 null로 설정하세요. 가능한 한 모든 값을 채우도록 노력하세요.
8. **응답 형식:**
   - 각 GPU/워크로드 조합마다 하나의 객체를 반환하세요.

응답 형식 (정확히 이 형식을 따르세요 - 배열로 반환):
**중요**: results 배열은 포함하지 마세요. GPU별로 nonMigRps와 migRps만 추출하세요.

[
  {
    "gpuModel": "H100",
    "workloadType": "OCR",
    "documentType": null,
    "nonMigRps": 0.22,
    "migRps": 0.58
  },
  {
    "gpuModel": "L40S",
    "workloadType": "OCR",
    "documentType": null,
    "nonMigRps": 0.91,
    "migRps": null
  },
  {
    "gpuModel": "B200",
    "workloadType": "OCR",
    "documentType": null,
    "nonMigRps": 0.476,
    "migRps": 1.96
  },
  {
    "gpuModel": "H100",
    "workloadType": "DP",
    "documentType": null,
    "nonMigRps": 0.0665,
    "migRps": 0.28
  },
  {
    "gpuModel": "A6000",
    "workloadType": "DP",
    "documentType": null,
    "nonMigRps": 0.0665,
    "migRps": null
  },
  {
    "gpuModel": "H100",
    "workloadType": "InformationExtraction",
    "documentType": "진료비 영수증",
    "nonMigRps": 0.12,
    "migRps": 0.35
  }
]`;

  const userPrompt = `다음 부하테스트 결과를 분석해주세요:\n\n${benchmarkText}`;

  try {
    const response = await callSolarLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "solar-pro2",
      temperature: 0.1,
      max_tokens: 4000,
    });

    console.log("\n=== LLM 분석 시작 ===");
    console.log("원본 응답 길이:", response.content.length);
    console.log("토큰 사용량:", response.usage);

    // JSON 파싱
    let jsonText = response.content.trim();
    
    // 코드 블록 제거
    if (jsonText.includes("```")) {
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
    }

    // JSON 배열 파싱
    const results = JSON.parse(jsonText);
    
    if (!Array.isArray(results)) {
      throw new Error("LLM 응답이 배열 형식이 아닙니다.");
    }

    console.log("파싱된 결과 개수:", results.length);

    // 6. 각 결과 검증 및 정규화
    const validatedResults: Array<{
      gpuModel: string;
      workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
      documentType?: string | null;
        nonMigRps?: number | null;
        migRps?: number | null;
    }> = [];
    
    for (const item of results) {
      // 필수 필드 검증
      if (typeof item.gpuModel !== "string" || typeof item.workloadType !== "string") {
        continue;
      }
      
      // 워크로드 타입 매핑 (한국어 -> 영어)
      const workloadTypeMap: Record<string, "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction"> = {
        "OCR": "OCR",
        "DP": "DP",
        "분류기": "DocumentClassifier",
        "문서분류기": "DocumentClassifier",
        "조직 검사 결과지": "InformationExtraction",
        "처방전": "OCR",
        "수술 기록지": "OCR",
        "진단 소견서": "OCR",
        "진료비 세부내역서": "OCR",
        "진료비 영수증": "OCR",
        "약제비 영수증": "OCR",
      };
      
      // InformationExtraction 워크로드로 분류해야 하는 문서 타입 목록
      const informationExtractionDocumentTypes = [
        "진료비 영수증", "진료비 세부내역서", "진료비 납입확인서",
        "처방전", "수술 기록지", "진단 소견서", "진단서",
        "펫보험영수증", "렌터카청구서", "치과치료 확인서",
        "보험금청구서", "개인정보동의서", "개인(신용)정보처리",
        "신규양식", "약제비 영수증", "조직 검사 결과지"
      ];
      
      // LLM이 문서 타입을 workloadType으로 잘못 반환한 경우 처리
      let mappedWorkloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
      let documentType: string | null = null;
      
      if (workloadTypeMap[item.workloadType]) {
        // 정상적인 워크로드 타입
        mappedWorkloadType = workloadTypeMap[item.workloadType];
      } else if (item.workloadType === "InformationExtraction" || item.workloadType === "정보추출") {
        // 명시적으로 InformationExtraction인 경우
        mappedWorkloadType = "InformationExtraction";
        documentType = item.documentType || item.workloadType;
      } else if (informationExtractionDocumentTypes.includes(item.workloadType)) {
        // LLM이 문서 타입을 workloadType으로 잘못 반환한 경우
        // 위 목록에 포함된 문서 타입은 모두 InformationExtraction으로 분류
        console.warn(`⚠️ LLM이 문서 타입 "${item.workloadType}"을 workloadType으로 반환했습니다. InformationExtraction으로 수정합니다.`);
        mappedWorkloadType = "InformationExtraction";
        documentType = item.workloadType;
      } else {
        // 알 수 없는 경우, 원본 값 사용 (하지만 경고)
        console.warn(`⚠️ 알 수 없는 workloadType: "${item.workloadType}". 원본 값을 사용합니다.`);
        mappedWorkloadType = item.workloadType as any;
      }
      
      // OCR 워크로드에 documentType이 있는 경우, InformationExtraction으로 변경
      if (mappedWorkloadType === "OCR" && (item.documentType || documentType)) {
        const docType = item.documentType || documentType;
        console.warn(`⚠️ OCR 워크로드에 documentType("${docType}")이 있습니다. InformationExtraction으로 변경합니다.`);
        mappedWorkloadType = "InformationExtraction";
        documentType = docType;
      }
      
      // OCR 워크로드는 documentType이 반드시 null이어야 함
      if (mappedWorkloadType === "OCR") {
        documentType = null;
      }
      
      // InformationExtraction 워크로드의 documentType 추출
      if (mappedWorkloadType === "InformationExtraction") {
        // item.documentType이 있으면 사용, 없으면 위에서 설정한 documentType 사용
        if (item.documentType) {
          documentType = item.documentType;
        } else if (!documentType && item.workloadType) {
          // 원본 워크로드 타입이 문서 타입인 경우 (예: "진료비 영수증")
          // 또는 InformationExtraction 문서 타입 목록에 포함된 경우
          if (informationExtractionDocumentTypes.includes(item.workloadType)) {
            documentType = item.workloadType;
          }
        }
      }
      
      // GPU별 nonMigRps와 migRps 파싱
      const nonMigRps = item.nonMigRps !== undefined 
        ? (item.nonMigRps === null ? null : Number(item.nonMigRps)) 
        : undefined;
      const migRps = item.migRps !== undefined 
        ? (item.migRps === null ? null : Number(item.migRps)) 
        : undefined;
      
      const validatedItem = {
        gpuModel: item.gpuModel || "",
        workloadType: mappedWorkloadType,
        documentType: documentType || null,
            ...(nonMigRps !== undefined && { nonMigRps: nonMigRps }),
            ...(migRps !== undefined && { migRps: migRps }),
      };
      
      // 핵심 정보만 한 줄로 출력
      console.log(`[${validatedItem.gpuModel} ${validatedItem.workloadType}${validatedItem.documentType ? ` - ${validatedItem.documentType}` : ''}] nonMigRps:${validatedItem.nonMigRps ?? 'N/A'}, migRps:${validatedItem.migRps ?? 'N/A'}`);
      
      validatedResults.push(validatedItem);
    }
    
    return validatedResults;
  } catch (error: any) {
    console.error("부하테스트 결과 파싱 오류:", error);
    
    // 파싱 실패 시 빈 배열 반환
    console.warn("JSON 파싱 실패, 빈 배열 반환");
    return [];
  }
}

/**
 * 기술적 설명 생성
 */
export async function generateTechnicalExplanation(
  calculationResult: any,
  benchmarkData?: any
): Promise<string> {
  const { GPU_DB } = await import("@/lib/constants/gpuDB");
  
  const systemPrompt = `당신은 하드웨어 성능 분석 전문가입니다. GPU 선택에 따른 성능 차이와 리소스 요구사항을 분석하여 설명해야 합니다.

**중요한 워크로드 관계 이해:**
- 정보추출(Information Extraction)은 문서분류 + OCR + 정보추출의 통합 워크로드입니다.
- 정보추출 1건을 처리하려면 반드시 문서분류 → OCR → 정보추출의 전체 파이프라인을 거쳐야 합니다.
- 따라서 정보추출 요구 처리량은 이미 문서분류와 OCR을 포함한 통합 처리량입니다.
- OCR과 정보추출을 별도로 언급하지 말고, 정보추출 워크로드가 문서분류+OCR+정보추출을 포함한다는 점을 명확히 설명하세요.

중점적으로 다룰 내용:

1. **각 GPU 선택 시 문서별 분당 처리량 분석**
   - 부하테스트 데이터가 있는 GPU의 경우, 실제 측정된 성능 데이터를 사용합니다.
   - 부하테스트 데이터가 없는 GPU의 경우, FP32 TFLOPS 비율을 사용하여 계산합니다.
     * 계산 공식: GPU A의 처리량 = 기준 GPU의 처리량 × (GPU A의 FP32 TFLOPS / 기준 GPU의 FP32 TFLOPS)
   - 각 문서 타입(진료비 영수증, 진료비 세부내역서, 약제비 영수증 등)별로 GPU 모델별 분당 처리량을 비교 분석합니다.
   - RPS(초당 요청 수)와 분당 처리량(docs/min)을 모두 표시합니다.
   - **정보추출 워크로드는 문서분류+OCR+정보추출을 포함한 통합 처리량임을 명시하세요.**

2. **각 GPU 선택 시 총 필요 VRAM 분석**
   - GPU 선택에 따라 컨테이너당 스루풋이 달라지므로, 같은 문서 부하를 처리하기 위해 필요한 컨테이너 수도 변경됩니다.
   - **VRAM 계산 공식 (매우 중요):**
     * 컨테이너당 분당 스루풋 = GPU별 문서 처리량 (FP32 비율로 계산)
     * 필요 컨테이너 수 = 요구 분당 처리량 / 컨테이너당 분당 스루풋
     * **총 필요 VRAM = 컨테이너당 VRAM × 필요 컨테이너 수**
     * **절대 GPU 전체 VRAM × 컨테이너 수로 계산하지 마세요!**
   - 각 GPU 모델별로 필요한 총 VRAM을 비교 분석합니다.
   - GPU의 VRAM 용량에 따라 필요한 GPU 개수도 함께 분석합니다.
   - **문서별 VRAM 요구사항 표를 작성할 때:**
     * 각 GPU 모델별로: 필요 컨테이너 수 × 컨테이너당 VRAM = 총 필요 VRAM
     * 예시: "진료비 영수증, L40S: 10개 × 6GB = 60GB" (올바른 계산)
     * 잘못된 예시: "진료비 영수증, B200: 19개 × 192GB = 3,648GB" (잘못된 계산 - GPU 전체 VRAM을 사용하면 안 됨)

3. **GPU별 비교 분석**
   - L40S, H100, H200, B100, B200 등 주요 GPU 모델별로 비교합니다.
   - 각 GPU의 FP32 TFLOPS 값을 명시하고, 이를 기반으로 한 성능 계산 근거를 설명합니다.
   - 성능 대비 비용 효율성도 간단히 언급합니다.

한국어로 작성하고, 전문적이면서도 이해하기 쉽게 설명해주세요. 표를 사용하여 GPU별 비교를 명확하게 보여주세요.`;

  const userPrompt = `다음 하드웨어 계산 결과와 부하테스트 데이터를 바탕으로 GPU별 성능 분석을 작성해주세요:

## 계산 결과 요약
- 권장 GPU: ${calculationResult.gpuRecommendation?.model || "N/A"} ${calculationResult.gpuRecommendation?.count || 0}개
- 필요 VRAM: ${calculationResult.totalVramRequired || 0}GB
- 필요 CPU: ${calculationResult.cpuRecommendation?.cores || 0}코어
- 필요 메모리: ${calculationResult.memoryRecommendation?.sizeGB || 0}GB

## 워크로드별 상세 정보
${calculationResult.breakdown?.informationExtraction?.details ? 
  `### 정보추출 (문서 타입별) - 주의: 정보추출은 문서분류+OCR+정보추출의 통합 워크로드입니다
${calculationResult.breakdown.informationExtraction.details.map((detail: any) => 
  `- ${detail.documentType || "N/A"}: 요구 처리량 ${detail.requiredThroughput}건/분 (문서분류+OCR+정보추출 통합), 컨테이너당 스루풋 ${detail.throughputPerContainer}건/분, 컨테이너당 VRAM ${detail.vramPerContainer}GB, 필요 컨테이너 ${detail.containersNeeded}개, 총 VRAM ${detail.totalVram}GB`
).join('\n')}` : ''}

${calculationResult.breakdown?.ocr?.details ? 
  `### OCR (정보추출과 별개의 독립 워크로드)
${calculationResult.breakdown.ocr.details.map((detail: any) => 
  `- 요구 처리량 ${detail.requiredThroughput}건/분, 컨테이너당 스루풋 ${detail.throughputPerContainer}건/분, 컨테이너당 VRAM ${detail.vramPerContainer}GB, 필요 컨테이너 ${detail.containersNeeded}개, 총 VRAM ${detail.totalVram}GB`
).join('\n')}` : ''}

${calculationResult.breakdown?.dp?.details ? 
  `### DP
${calculationResult.breakdown.dp.details.map((detail: any) => 
  `- 요구 처리량 ${detail.requiredThroughput}건/분, 컨테이너당 스루풋 ${detail.throughputPerContainer}건/분, 필요 컨테이너 ${detail.containersNeeded}개, 총 VRAM ${detail.totalVram}GB`
).join('\n')}` : ''}

## GPU 스펙 정보 (전체 GPU VRAM 용량)
- L40S: FP32 ${GPU_DB.L40S?.fp32 || 0} TFLOPS, 전체 GPU VRAM ${GPU_DB.L40S?.memory || 0}GB
- H100: FP32 ${GPU_DB.H100?.fp32 || 0} TFLOPS, 전체 GPU VRAM ${GPU_DB.H100?.memory || 0}GB
- H200: FP32 ${GPU_DB.H200?.fp32 || 0} TFLOPS, 전체 GPU VRAM ${GPU_DB.H200?.memory || 0}GB
- B100: FP32 ${GPU_DB.B100?.fp32 || 0} TFLOPS, 전체 GPU VRAM ${GPU_DB.B100?.memory || 0}GB
- B200: FP32 ${GPU_DB.B200?.fp32 || 0} TFLOPS, 전체 GPU VRAM ${GPU_DB.B200?.memory || 0}GB

**중요: 위의 VRAM 값은 전체 GPU의 VRAM 용량입니다. 컨테이너당 VRAM은 워크로드별로 다르며, 아래 워크로드별 상세 정보에서 확인할 수 있습니다.**

${benchmarkData && Array.isArray(benchmarkData) && benchmarkData.length > 0 ? `\n## 부하테스트 데이터\n${JSON.stringify(benchmarkData, null, 2)}` : ''}

## 작성 요구사항
다음 내용을 중점적으로 작성해주세요:

1. **각 GPU 선택 시 문서별 분당 처리량 분석**
   - 부하테스트 데이터가 있는 GPU의 경우 실제 측정값을 사용
   - 부하테스트 데이터가 없는 GPU의 경우 FP32 TFLOPS 비율로 계산
   - 각 문서 타입별로 GPU 모델별 분당 처리량을 표로 정리
   - RPS와 분당 처리량(docs/min)을 모두 표시
   - **중요: 정보추출 워크로드는 문서분류+OCR+정보추출의 통합 파이프라인임을 명확히 설명하세요. 정보추출과 OCR을 별도로 언급하지 말고, 정보추출이 이미 전체 파이프라인을 포함한다는 점을 강조하세요.**
   - **문서 타입별 GPU 처리량 비교 표를 작성할 때, 컨테이너당 VRAM은 워크로드별 상세 정보의 vramPerContainer 값을 사용하세요. GPU의 전체 VRAM 용량(예: B200의 192GB)을 컨테이너당 VRAM으로 표시하지 마세요.**

2. **각 GPU 선택 시 총 필요 VRAM 분석**
   - GPU 선택에 따라 컨테이너당 스루풋이 달라지므로, 같은 문서 부하를 처리하기 위해 필요한 컨테이너 수도 변경됨을 설명
   - 각 GPU 모델별로 필요한 총 VRAM을 계산하고 비교
   - GPU의 VRAM 용량에 따라 필요한 GPU 개수도 함께 분석
   - 계산 과정을 명확히 설명 (컨테이너당 스루풋 → 필요 컨테이너 수 → 총 필요 VRAM)
   - **정보추출 워크로드의 VRAM 요구사항은 문서분류+OCR+정보추출 전체 파이프라인을 포함한 값임을 명시하세요.**

3. **GPU별 비교 분석**
   - L40S, H100, H200, B100, B200 등 주요 GPU 모델별로 비교 표 작성
   - 각 GPU의 FP32 TFLOPS 값을 명시하고, 이를 기반으로 한 성능 계산 근거 설명
   - 성능 대비 비용 효율성 간단히 언급

**주의사항:**
- 정보추출과 OCR을 별도의 독립적인 워크로드로 설명하지 마세요.
- 정보추출 1건은 반드시 문서분류 → OCR → 정보추출의 전체 파이프라인을 거친다는 점을 명확히 하세요.
- 정보추출 요구 처리량은 이미 문서분류와 OCR을 포함한 통합 처리량입니다.
- **컨테이너당 VRAM과 GPU의 전체 VRAM 용량을 혼동하지 마세요.**
  - 컨테이너당 VRAM: 워크로드별 상세 정보의 vramPerContainer 값 (예: 정보추출 6GB, OCR 8.5GB)
  - GPU 전체 VRAM: GPU 스펙 정보의 VRAM 값 (예: B200의 192GB는 전체 GPU 용량)
  - 문서 타입별 GPU 처리량 비교 표에서는 반드시 컨테이너당 VRAM 값을 사용하세요.
- **VRAM 계산 시 절대 실수하지 마세요:**
  - 올바른 계산: 총 필요 VRAM = 컨테이너 수 × 컨테이너당 VRAM
  - 잘못된 계산: 총 필요 VRAM = 컨테이너 수 × GPU 전체 VRAM (절대 하지 마세요!)
  - 예시: "진료비 영수증, B200: 19개 컨테이너 × 6GB(컨테이너당 VRAM) = 114GB" (올바름)
  - 잘못된 예시: "진료비 영수증, B200: 19개 × 192GB = 3,648GB" (절대 안 됨!)
  - GPU 전체 VRAM(192GB)은 GPU 개수를 계산할 때만 사용: 필요한 GPU 개수 = 총 필요 VRAM / (GPU 전체 VRAM × 0.8)

표를 사용하여 GPU별 비교를 명확하게 보여주세요.`;

  const response = await callSolarLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    model: "solar-pro2",
    temperature: 0.7,
    max_tokens: 4000,
  });

  return response.content;
}

/**
 * 여러 부하테스트 데이터 중 가장 신뢰할 만한 데이터를 선택합니다.
 * LLM이 데이터의 품질, 완전성, 일관성을 평가하여 선택합니다.
 */
export async function selectBestBenchmarkData(
  duplicates: Array<{
    gpuModel: string;
    workloadType: string;
    documentType?: string | null;
    results: Array<{
      containers: number;
      rps?: number;
      nonMigRps?: number | null;
      migRps?: number | null;
      latency: number | null;
    }>;
  }>
): Promise<{
  gpuModel: string;
  workloadType: string;
  documentType?: string | null;
  results: Array<{
    containers: number;
    rps?: number;
    nonMigRps?: number | null;
    migRps?: number | null;
    latency: number | null;
  }>;
}> {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  const systemPrompt = `당신은 부하테스트 데이터 품질 평가 전문가입니다.
여러 부하테스트 결과 중 가장 신뢰할 만하고 완전한 데이터를 선택해야 합니다.

평가 기준:
1. **데이터 완전성**: 더 많은 컨테이너 수에 대한 데이터를 가진 것이 우선
2. **데이터 일관성**: RPS 값이 논리적으로 증가하는 패턴을 보이는 것이 우선
3. **nonMigRps와 migRps 구분**: 두 값이 모두 명확하게 구분되어 있는 것이 우선
4. **데이터 범위**: 다양한 컨테이너 수(1, 2, 3, 5, 7 등)에 대한 데이터를 가진 것이 우선

응답 형식:
- 반드시 JSON 형식으로만 응답하세요
- 선택한 데이터의 인덱스(0부터 시작)를 반환하세요
- 예: {"selectedIndex": 0}

중요: 설명 없이 JSON만 반환하세요.`;

  const userPrompt = `다음 ${duplicates.length}개의 부하테스트 데이터 중 가장 신뢰할 만한 데이터를 선택해주세요:

${duplicates.map((data, index) => `
## 데이터 ${index + 1}
- GPU: ${data.gpuModel}
- 워크로드: ${data.workloadType}
- 문서 타입: ${data.documentType || "N/A"}
- 결과 개수: ${data.results.length}
- 컨테이너 수: ${data.results.map(r => r.containers).join(", ")}
- nonMigRps: ${data.results.filter(r => r.nonMigRps !== undefined && r.nonMigRps !== null).length}개
- migRps: ${data.results.filter(r => r.migRps !== undefined && r.migRps !== null).length}개
- 상세 결과:
${JSON.stringify(data.results, null, 2)}
`).join("\n")}

가장 신뢰할 만한 데이터의 인덱스를 선택해주세요 (0부터 시작).`;

  try {
    const response = await callSolarLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "solar-pro2",
      temperature: 0.1,
      max_tokens: 100,
    });

    // JSON 파싱
    let jsonText = response.content.trim();
    
    // 코드 블록 제거
    if (jsonText.includes("```")) {
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }
    }

    const parsed = JSON.parse(jsonText);
    const selectedIndex = parsed.selectedIndex ?? 0;

    if (selectedIndex >= 0 && selectedIndex < duplicates.length) {
      console.log(`LLM이 데이터 ${selectedIndex + 1}번을 선택했습니다.`);
      return duplicates[selectedIndex];
    } else {
      console.warn(`선택된 인덱스(${selectedIndex})가 유효하지 않습니다. 첫 번째 데이터 사용.`);
      return duplicates[0];
    }
  } catch (error) {
    console.error("LLM 데이터 선택 오류:", error);
    console.log("오류 발생 시 데이터 품질 기준으로 선택");
    // 오류 발생 시 데이터 품질 기준으로 선택
    // 더 많은 결과를 가진 데이터 선택
    return duplicates.reduce((best, current) => {
      const bestScore = (best.results?.length || 0) + 
        (best.results?.filter(r => r.nonMigRps !== undefined && r.nonMigRps !== null).length || 0) +
        (best.results?.filter(r => r.migRps !== undefined && r.migRps !== null).length || 0);
      const currentScore = (current.results?.length || 0) +
        (current.results?.filter(r => r.nonMigRps !== undefined && r.nonMigRps !== null).length || 0) +
        (current.results?.filter(r => r.migRps !== undefined && r.migRps !== null).length || 0);
      return currentScore > bestScore ? current : best;
    }, duplicates[0]);
  }
}

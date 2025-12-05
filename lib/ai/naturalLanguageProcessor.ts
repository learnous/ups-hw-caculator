/**
 * 자연어 처리 및 대화형 질문-응답 시스템
 */

import { CalculationInput } from "@/lib/types";

export interface ConversationState {
  messages: ConversationMessage[];
  extractedInfo: Partial<CalculationInput>;
  missingFields: string[];
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

/**
 * 사용자 입력에서 정보 추출
 */
export function extractInformationFromQuery(
  userQuery: string,
  currentState: ConversationState
): {
  extracted: Partial<CalculationInput>;
  missing: string[];
  followUpQuestion?: string;
} {
  const extracted: Partial<CalculationInput> = { ...currentState.extractedInfo };
  const missing: string[] = [];

  // 간단한 패턴 매칭 (실제로는 LLM API 사용 권장)
  const lowerQuery = userQuery.toLowerCase();

  // 전체 요청량 추출
  const throughputMatch = userQuery.match(/(\d+)\s*(?:건|개|장|문서)/);
  if (throughputMatch && !extracted.totalRequestThroughput) {
    extracted.totalRequestThroughput = parseInt(throughputMatch[1]);
  }

  // GPU 모델 추출
  const gpuModels = ["L40S", "H100", "H200", "B100", "B200", "A100"];
  for (const model of gpuModels) {
    if (lowerQuery.includes(model.toLowerCase())) {
      if (!extracted.system) {
        extracted.system = {} as any;
      }
      (extracted.system as any).gpuPreference = model;
      break;
    }
  }

  // 배포 모드 추출
  if (lowerQuery.includes("mig") || lowerQuery.includes("kubernetes")) {
    if (!extracted.cluster) {
      extracted.cluster = {} as any;
    }
    (extracted.cluster as any).deploymentMode = "Kubernetes (MIG-enabled)";
  } else if (lowerQuery.includes("standalone") || lowerQuery.includes("단독")) {
    if (!extracted.cluster) {
      extracted.cluster = {} as any;
    }
    (extracted.cluster as any).deploymentMode = "Standalone GPU Server";
  }

  // 필수 필드 확인
  if (!extracted.totalRequestThroughput) {
    missing.push("전체 요청량");
  }
  if (!extracted.ocr || !Array.isArray(extracted.ocr) || extracted.ocr.length === 0) {
    missing.push("OCR 워크로드 정보");
  }
  if (!extracted.dp) {
    missing.push("DP 워크로드 정보");
  }
  if (!extracted.llm) {
    missing.push("LLM 워크로드 정보");
  }

  // 다음 질문 생성
  let followUpQuestion: string | undefined;
  if (missing.length > 0) {
    followUpQuestion = generateFollowUpQuestion(missing[0]);
  }

  return {
    extracted,
    missing,
    followUpQuestion,
  };
}

/**
 * 다음 질문 생성
 */
function generateFollowUpQuestion(missingField: string): string {
  const questions: Record<string, string> = {
    "전체 요청량": "분당 처리해야 하는 전체 문서 수는 얼마인가요? (예: 분당 1000건)",
    "OCR 워크로드 정보":
      "어떤 종류의 문서를 처리하나요? (예: 진료비 영수증, 진단서 등)",
    "DP 워크로드 정보":
      "DP(문서 처리) 워크로드의 분당 처리량은 얼마인가요?",
    "LLM 워크로드 정보":
      "LLM 동시 사용자 수와 프롬프트 크기를 알려주세요.",
  };

  return questions[missingField] || `${missingField}에 대한 정보를 알려주세요.`;
}

/**
 * 대화 상태 업데이트
 */
export function updateConversationState(
  state: ConversationState,
  userMessage: string
): ConversationState {
  const { extracted, missing, followUpQuestion } = extractInformationFromQuery(
    userMessage,
    state
  );

  const newMessages: ConversationMessage[] = [
    ...state.messages,
    {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    },
  ];

  if (followUpQuestion) {
    newMessages.push({
      role: "assistant",
      content: followUpQuestion,
      timestamp: new Date(),
    });
  } else if (missing.length === 0) {
    // 모든 정보가 수집됨
    newMessages.push({
      role: "assistant",
      content:
        "모든 정보를 수집했습니다. 하드웨어 구성을 계산하겠습니다.",
      timestamp: new Date(),
    });
  }

  return {
    messages: newMessages,
    extractedInfo: { ...state.extractedInfo, ...extracted },
    missingFields: missing,
  };
}

/**
 * 자연어 쿼리를 CalculationInput으로 변환
 */
export function convertToCalculationInput(
  extracted: Partial<CalculationInput>
): CalculationInput | null {
  // 필수 필드 확인
  if (
    !extracted.totalRequestThroughput ||
    !extracted.ocr ||
    extracted.ocr.length === 0 ||
    !extracted.dp ||
    !extracted.llm ||
    !extracted.cluster ||
    !extracted.system
  ) {
    return null;
  }

  // 기본값 채우기
  return {
    totalRequestThroughput: extracted.totalRequestThroughput,
    ocr: extracted.ocr,
    dp: extracted.dp,
    llm: extracted.llm,
    cluster: extracted.cluster,
    system: {
      targetDailyHours: extracted.system.targetDailyHours || 24,
      redundancyLevel: extracted.system.redundancyLevel || "None",
      gpuPreference: extracted.system.gpuPreference || "Auto-select",
      cpuPerformanceTier: extracted.system.cpuPerformanceTier || "Medium",
    },
  };
}


/**
 * UIE (Universal Information Extractor) 서비스
 * 
 * 문서 이미지를 제공하고 질문을 하면 그 결과를 해석해서 응답하는 솔루션
 */

export interface UIEQueryRequest {
  imagePath: string; // 부하테스트 결과 문서 이미지 경로
  question: string; // 사용자 질문
}

export interface UIEQueryResponse {
  answer: string; // UIE가 추출한 답변
  confidence?: number; // 신뢰도 (0-1)
  extractedData?: Record<string, any>; // 구조화된 데이터 (선택적)
}

/**
 * UIE API 호출
 * 
 * @param request UIE 쿼리 요청
 * @returns UIE 응답
 */
export async function queryUIE(
  request: UIEQueryRequest
): Promise<UIEQueryResponse> {
  const uieApiUrl = process.env.NEXT_PUBLIC_UIE_API_URL || process.env.UIE_API_URL;
  
  if (!uieApiUrl) {
    throw new Error("UIE_API_URL 환경 변수가 설정되지 않았습니다.");
  }

  try {
    // 이미지를 base64로 인코딩하거나 URL로 전달
    // 실제 구현은 UIE API 스펙에 따라 달라질 수 있음
    const response = await fetch(`${uieApiUrl}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_path: request.imagePath,
        question: request.question,
      }),
    });

    if (!response.ok) {
      throw new Error(`UIE API 호출 실패: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      answer: data.answer || data.response || "",
      confidence: data.confidence,
      extractedData: data.extracted_data || data.data,
    };
  } catch (error) {
    console.error("UIE API 호출 오류:", error);
    throw error;
  }
}

/**
 * 부하테스트 결과에서 특정 GPU 모델의 성능 데이터 추출
 */
export async function extractBenchmarkData(
  gpuModel: string,
  workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction"
): Promise<UIEQueryResponse> {
  // 부하테스트 이미지 경로 (public 폴더 기준)
  const imagePath = `/benchmark-results/${gpuModel.toLowerCase()}-${workloadType.toLowerCase()}.png`;
  
  const question = `${gpuModel} GPU에서 ${workloadType} 워크로드의 부하테스트 결과를 알려주세요. 컨테이너 수별 처리량(throughput), 지연시간(latency), 최적 컨테이너 수를 포함해주세요.`;

  return queryUIE({
    imagePath,
    question,
  });
}

/**
 * 여러 GPU 모델의 성능 비교 데이터 추출
 */
export async function extractComparisonData(
  gpuModels: string[],
  workloadType: string
): Promise<UIEQueryResponse> {
  // 여러 이미지를 병렬로 처리하거나, 통합 이미지 사용
  const imagePaths = gpuModels.map(
    (model) => `/benchmark-results/${model.toLowerCase()}-${workloadType.toLowerCase()}.png`
  );

  const question = `${gpuModels.join(", ")} GPU 모델들의 ${workloadType} 워크로드 성능을 비교해주세요. 각 모델의 최적 처리량과 비용 효율성을 포함해주세요.`;

  // 첫 번째 이미지 사용 (실제로는 여러 이미지 병합 또는 순차 처리 필요)
  return queryUIE({
    imagePath: imagePaths[0],
    question,
  });
}


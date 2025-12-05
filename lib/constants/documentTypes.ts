/**
 * 지원하는 문서 타입 목록
 */
export const DOCUMENT_TYPES = [
  "진료비 영수증",
  "진료비 세부내역서",
  "진료비 납입확인서",
  "처방전",
  "진단서",
  "펫보험영수증",
  "렌터카청구서",
  "약제비영수증",
  "치과치료 확인서",
  "보험금청구서",
  "개인정보동의서",
  "개인(신용)정보처리",
  "수술기록지",
  "조직검사결과지",
  "신규양식",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * 기준 GPU에서 측정한 문서 타입별 성능 데이터
 * 
 * 각 문서 타입에 대해 하나의 기준 GPU에서 측정한 성능 데이터만 입력합니다.
 * 다른 GPU 모델의 성능은 FP32 TFLOPS 비율로 자동 계산됩니다.
 * 
 * 예시:
 * - 진료비 영수증이 L40S에서 80장/분, 3초로 측정되었다면
 * - L40S FP32: 45 TFLOPS
 * - H100 FP32: 99 TFLOPS
 * - H100 예상 스루풋: 80 * (99/45) = 176장/분
 */
export interface DocumentPerformance {
  baseGPU: GPUModel; // 기준 GPU 모델
  throughput: number; // 기준 GPU에서의 분당 처리량 (docs/min)
  latency: number; // 기준 GPU에서의 평균 지연시간 (초)
}

export type GPUModel = "L40S" | "H100" | "H200" | "B100" | "B200";

/**
 * 문서 타입별 기준 GPU 성능 데이터베이스
 * 
 * ============================================================
 * 여기에 각 문서 타입에 대한 기준 GPU 성능 데이터를 입력하세요!
 * ============================================================
 * 
 * 각 문서 타입에 대해 하나의 기준 GPU에서 측정한 성능 데이터만 입력합니다.
 * 다른 GPU 모델의 성능은 FP32 TFLOPS 비율로 자동 계산됩니다.
 * 
 * 입력 형식 예시:
 * "진료비 영수증": {
 *   baseGPU: "L40S",
 *   throughput: 80,  // L40S에서 분당 80장 처리
 *   latency: 3.0,    // 평균 지연시간 3초
 * },
 * 
 * 설명:
 * - baseGPU: 성능 데이터를 측정한 기준 GPU 모델
 * - throughput: 기준 GPU에서 분당 처리 가능한 문서 수 (docs/min)
 * - latency: 기준 GPU에서의 평균 지연시간 (초)
 * 
 * 다른 GPU의 성능은 자동으로 계산됩니다:
 * - 다른 GPU의 스루풋 = 기준 스루풋 * (다른 GPU FP32 / 기준 GPU FP32)
 * - 레이턴시는 FP32 비율의 역수로 계산 (더 빠른 GPU = 더 낮은 레이턴시)
 */
export const DOCUMENT_PERFORMANCE: Record<
  DocumentType,
  DocumentPerformance | null
> = {
  "진료비 영수증": null,
  // 예시: 아래 주석을 해제하고 실제 값으로 변경하세요
  // "진료비 영수증": {
  //   baseGPU: "L40S",
  //   throughput: 80,  // L40S에서 분당 80장 처리
  //   latency: 3.0,    // 평균 지연시간 3초
  // },
  "진료비 세부내역서": null,
  "진료비 납입확인서": null,
  "처방전": null,
  "진단서": null,
  "펫보험영수증": null,
  "렌터카청구서": null,
  "약제비영수증": null,
  "치과치료 확인서": null,
  "보험금청구서": null,
  "개인정보동의서": null,
  "개인(신용)정보처리": null,
  "수술기록지": null,
  "조직검사결과지": null,
  "신규양식": null,
};


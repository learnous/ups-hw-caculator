/**
 * 문서분류기 프로필
 * 
 * 문서분류기는 전체 요청량에 대해 동작합니다.
 * H100 기준으로 측정된 성능 데이터를 사용하며, 다른 GPU는 FP32 TFLOPS 비율로 계산됩니다.
 */
export interface DocumentClassifierProfile {
  baseGPU: string; // 기준 GPU 모델
  baseThroughputPerContainer: number; // 기준 GPU에서 컨테이너당 분당 처리량 (docs/min)
  vramPerContainer: number; // 컨테이너당 필요한 VRAM (GB)
  cpuImpactPerContainer: number; // 컨테이너당 필요한 vCPU cores
  memoryImpactPerContainer: number; // 컨테이너당 필요한 RAM (GB)
  // SSD 디스크 용량 계산: installationSize * 2 + modelWeightSize * 컨테이너수
  installationSize: number; // 설치파일 크기 (GB) - 설치파일 + 컨테이너 레이어는 재사용됨
  modelWeightSize: number; // 모델웨이트 크기 (GB) - 컨테이너당 필요
}

export const DOCUMENT_CLASSIFIER_PROFILES: DocumentClassifierProfile = {
  baseGPU: "H100",
  baseThroughputPerContainer: 200, // H100 기준 분당 200건 per container
  vramPerContainer: 4, // 컨테이너당 4GB VRAM
  cpuImpactPerContainer: 4, // 4 vCPU cores per container
  memoryImpactPerContainer: 16, // 16 GB RAM per container
  installationSize: 20, // 설치파일 20GB (설치파일 + 컨테이너 레이어는 재사용됨)
  modelWeightSize: 5, // 모델웨이트 5GB (컨테이너당)
};


/**
 * OCR 프로필
 * 
 * OCR은 전체 요청량에 대해 동작합니다.
 * 정보추출과는 별도로 계산됩니다.
 */
export interface OCRProfile {
  throughputPerContainer: number; // 컨테이너당 분당 처리량 (docs/min)
  vramPerContainer: number; // 컨테이너당 필요한 VRAM (GB)
  cpuImpactPerContainer: number; // 컨테이너당 필요한 vCPU cores
  memoryImpactPerContainer: number; // 컨테이너당 필요한 RAM (GB)
  pLLMVramPerInstance: number; // GB VRAM needed per pLLM instance
  pLLMThroughputPerInstance: number; // docs per minute per pLLM instance
  // SSD 디스크 용량 계산: installationSize * 2 + modelWeightSize * 컨테이너수
  installationSize: number; // 설치파일 크기 (GB) - 설치파일 + 컨테이너 레이어는 재사용됨
  modelWeightSize: number; // 모델웨이트 크기 (GB) - 컨테이너당 필요
}

export const OCR_PROFILES: OCRProfile = {
  throughputPerContainer: 80, // TODO: 실제 벤치마크 데이터로 업데이트 필요
  vramPerContainer: 8.5, // OCR 컨테이너 8.5GB
  cpuImpactPerContainer: 4, // 4 vCPU cores per OCR container
  memoryImpactPerContainer: 16, // 16 GB RAM per OCR container
  pLLMVramPerInstance: 40, // pLLM requires ~40GB VRAM per container
  pLLMThroughputPerInstance: 40, // pLLM processes ~40 docs/min per instance
  installationSize: 20, // 설치파일 20GB (설치파일 + 컨테이너 레이어는 재사용됨)
  modelWeightSize: 10, // 모델웨이트 10GB (컨테이너당)
};


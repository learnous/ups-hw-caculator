/**
 * 정보추출 프로필
 * 
 * 정보추출은 각 문서 타입별로 다른 처리량을 가질 수 있습니다.
 * 문서 타입별 성능 데이터는 documentTypes.ts의 DOCUMENT_PERFORMANCE에서 관리됩니다.
 */
export interface InformationExtractionProfile {
  vramPerContainer: number; // 컨테이너당 필요한 VRAM (GB)
  cpuImpactPerContainer: number; // 컨테이너당 필요한 vCPU cores
  memoryImpactPerContainer: number; // 컨테이너당 필요한 RAM (GB)
  // SSD 디스크 용량 계산: installationSize * 2 + modelWeightSize * 컨테이너수
  installationSize: number; // 설치파일 크기 (GB) - 설치파일 + 컨테이너 레이어는 재사용됨
  modelWeightSize: number; // 모델웨이트 크기 (GB) - 컨테이너당 필요
}

export const INFORMATION_EXTRACTION_PROFILES: InformationExtractionProfile = {
  vramPerContainer: 6, // 정보추출 ISVC 컨테이너 6GB
  cpuImpactPerContainer: 2,
  memoryImpactPerContainer: 4,
  installationSize: 15, // 설치파일 15GB (설치파일 + 컨테이너 레이어는 재사용됨)
  modelWeightSize: 10, // 모델웨이트 10GB (컨테이너당)
};


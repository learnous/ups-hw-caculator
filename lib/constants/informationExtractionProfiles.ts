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
}

export const INFORMATION_EXTRACTION_PROFILES: InformationExtractionProfile = {
  vramPerContainer: 6, // 정보추출 ISVC 컨테이너 6GB
  cpuImpactPerContainer: 2,
  memoryImpactPerContainer: 4,
};


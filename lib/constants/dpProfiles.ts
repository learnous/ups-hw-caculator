export interface DPProfile {
  throughputPerContainer: number; // 컨테이너당 분당 처리량 (docs/min)
  containersPerGPU: number; // GPU당 최적 컨테이너 수
  cpuImpactPerContainer: number; // 컨테이너당 필요한 vCPU cores
  memoryImpactPerContainer: number; // 컨테이너당 필요한 RAM (GB)
  vramPerContainer: number; // 컨테이너당 필요한 VRAM (GB)
}

/**
 * DP 워크로드 프로필
 * 
 * 벤치마크 데이터를 기반으로 계산된 값:
 * - H100 Full GPU 기준: 컨테이너당 13.35 docs/min, GPU당 12 컨테이너
 * - 컨테이너당 12GB VRAM 필요 (사용자 제공 값)
 * - 컨테이너당 8 vCPU 사용 (벤치마크 데이터 기준)
 */
export const DP_PROFILES: Record<string, DPProfile> = {
  // 기본 프로필 (H100 Full GPU 기준)
  default: {
    throughputPerContainer: 13.35, // H100 기준
    containersPerGPU: 12,
    cpuImpactPerContainer: 6, // 6 vCPU cores per DP container
    memoryImpactPerContainer: 32, // 32 GB RAM per DP container
    vramPerContainer: 12, // DP 컨테이너당 12GB VRAM 필요
  },
  // MIG 프로필 (H100 MIG 기준)
  mig: {
    throughputPerContainer: 17.1, // H100 MIG 기준 (119.7 / 7)
    containersPerGPU: 7,
    cpuImpactPerContainer: 6, // 6 vCPU cores per DP container
    memoryImpactPerContainer: 32, // 32 GB RAM per DP container
    vramPerContainer: 12, // DP 컨테이너당 12GB VRAM 필요
  },
};


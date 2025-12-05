/**
 * DP 워크로드 벤치마크 데이터
 * 
 * 각 GPU 모델별로 실제 측정된 DP 워크로드 성능 데이터입니다.
 * LCR (Logical Core Ratio) = 컨테이너 수
 */

export interface DPBenchmarkPoint {
  containers: number; // LCR, 컨테이너 수
  latency: number; // 평균 지연시간 (ms)
  rps: number; // 초당 요청 수
  throughputPerMin: number; // 분당 처리량
}

export interface DPBenchmarkData {
  gpu: string;
  config: string; // "Full GPU" 또는 "MIG"
  points: DPBenchmarkPoint[];
  optimalPoint?: {
    containers: number;
    throughputPerMin: number;
    throughputPerContainer: number; // 컨테이너당 평균 처리량
  };
}

/**
 * 실제 벤치마크 데이터
 */
export const DP_BENCHMARK_DATA: DPBenchmarkData[] = [
  {
    gpu: "H100",
    config: "Full GPU",
    points: [
      { containers: 1, latency: 21.2, rps: 0.086, throughputPerMin: 25.8 },
      { containers: 2, latency: 12.7, rps: 0.138, throughputPerMin: 41.4 },
      { containers: 4, latency: 12.55, rps: 0.266, throughputPerMin: 79.8 },
      { containers: 6, latency: 14.73, rps: 0.392, throughputPerMin: 117.6 },
      { containers: 8, latency: 16.74, rps: 0.494, throughputPerMin: 148.2 },
      { containers: 12, latency: 22.11, rps: 0.534, throughputPerMin: 160.2 },
      { containers: 16, latency: 25.06, rps: 0.569, throughputPerMin: 170.7 },
    ],
    // 최적 지점: LCR 12 (160.2 분당페이지, 컨테이너당 13.35)
    optimalPoint: {
      containers: 12,
      throughputPerMin: 160.2,
      throughputPerContainer: 160.2 / 12, // 13.35
    },
  },
  {
    gpu: "H100",
    config: "MIG",
    points: [
      { containers: 1, latency: 27.73, rps: 0.056, throughputPerMin: 16.8 },
      { containers: 2, latency: 16.33, rps: 0.113, throughputPerMin: 33.9 },
      { containers: 3, latency: 20.34, rps: 0.173, throughputPerMin: 51.9 },
      { containers: 4, latency: 24.38, rps: 0.222, throughputPerMin: 66.6 },
      { containers: 5, latency: 21.39, rps: 0.290, throughputPerMin: 87 },
      { containers: 7, latency: 20.22, rps: 0.399, throughputPerMin: 119.7 },
    ],
    // 최적 지점: LCR 7 (119.7 분당페이지, 컨테이너당 17.1)
    optimalPoint: {
      containers: 7,
      throughputPerMin: 119.7,
      throughputPerContainer: 119.7 / 7, // 17.1
    },
  },
  {
    gpu: "RTX 3090",
    config: "Full GPU",
    points: [
      { containers: 1, latency: 14.35, rps: 0.139, throughputPerMin: 0 }, // 계산 필요
      { containers: 2, latency: 16.48, rps: 0.232, throughputPerMin: 0 },
      { containers: 3, latency: 26.44, rps: 0.296, throughputPerMin: 0 },
      { containers: 4, latency: 24.27, rps: 0.361, throughputPerMin: 0 },
      { containers: 5, latency: 28.56, rps: 0.362, throughputPerMin: 0 },
    ],
    // 최적 지점: LCR 4 (RPS 0.361, 추정 분당페이지 약 79.8)
    optimalPoint: {
      containers: 4,
      throughputPerMin: 0.361 * 60 * 3.68, // RPS * 60 * 추정 배율 ≈ 79.8
      throughputPerContainer: (0.361 * 60 * 3.68) / 4, // 약 19.95
    },
  },
  {
    gpu: "RTX A6000",
    config: "Full GPU",
    points: [
      { containers: 1, latency: 15.62, rps: 0.121, throughputPerMin: 36.3 },
      { containers: 2, latency: 9.69, rps: 0.183, throughputPerMin: 54.9 },
      { containers: 3, latency: 17, rps: 0.228, throughputPerMin: 68.4 },
      { containers: 4, latency: 13.46, rps: 0.266, throughputPerMin: 79.8 },
      { containers: 6, latency: 25.48, rps: 0.232, throughputPerMin: 69.6 },
      { containers: 6, latency: 20.13, rps: 0.221, throughputPerMin: 66.3 },
    ],
    // 최적 지점: LCR 4 (79.8 분당페이지, 컨테이너당 19.95)
    optimalPoint: {
      containers: 4,
      throughputPerMin: 79.8,
      throughputPerContainer: 79.8 / 4, // 19.95
    },
  },
];

/**
 * GPU 모델별 최적 DP 성능 프로필
 * FP32 TFLOPS 비율을 기준으로 다른 GPU 모델의 성능을 추정합니다.
 */
export interface DPPerformanceProfile {
  baseGPU: string;
  baseThroughputPerContainer: number; // 컨테이너당 분당 처리량
  baseContainersPerGPU: number; // GPU당 최적 컨테이너 수
  baseTotalThroughput: number; // GPU당 총 분당 처리량
}

/**
 * 기준 GPU의 최적 성능 프로필
 * H100 Full GPU를 기준으로 설정 (가장 상세한 데이터)
 */
export const DP_BASE_PROFILE: DPPerformanceProfile = {
  baseGPU: "H100",
  baseThroughputPerContainer: 160.2 / 12, // 13.35 docs/min per container
  baseContainersPerGPU: 12,
  baseTotalThroughput: 160.2, // docs/min per GPU
};

import { GPU_DB } from "./gpuDB";

/**
 * FP32 TFLOPS 비율을 기반으로 다른 GPU의 DP 성능을 계산합니다.
 */
export function getDPPerformanceForGPU(gpuModel: string): {
  throughputPerContainer: number;
  containersPerGPU: number;
  totalThroughputPerGPU: number;
} | null {
  const baseFP32 = 67; // H100 FP32
  const targetGPU = gpuModel;
  
  // GPU_DB에서 FP32 값 가져오기
  const gpuSpec = GPU_DB[targetGPU];
  if (!gpuSpec || !gpuSpec.fp32) {
    return null;
  }

  const fp32Ratio = gpuSpec.fp32 / baseFP32;

  // 스루풋은 FP32 비율에 비례
  const throughputPerContainer = DP_BASE_PROFILE.baseThroughputPerContainer * fp32Ratio;
  
  // 컨테이너 수는 GPU 메모리에 따라 결정 (기본적으로 비슷하게 유지하되, 메모리가 부족하면 조정)
  // H100은 80GB, 최적 컨테이너 12개 = 약 6.67GB per container
  const memoryPerContainer = 80 / DP_BASE_PROFILE.baseContainersPerGPU; // 약 6.67GB
  const containersPerGPU = Math.floor((gpuSpec.memory || 80) / memoryPerContainer);
  
  const totalThroughputPerGPU = throughputPerContainer * containersPerGPU;

  return {
    throughputPerContainer: Math.round(throughputPerContainer * 10) / 10,
    containersPerGPU,
    totalThroughputPerGPU: Math.round(totalThroughputPerGPU * 10) / 10,
  };
}


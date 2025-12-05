/**
 * GPU 성능 예측 유틸리티
 * 기준 GPU의 부하테스트 결과를 기반으로 다른 GPU들의 예상 성능을 계산
 */

import { GPU_DB } from "@/lib/constants/gpuDB";

export interface BenchmarkResult {
  containers: number;
  rps: number;
  latency: number | null;
}

export interface ProjectedBenchmarkData {
  gpuModel: string;
  workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
  documentType?: string | null;
  results: BenchmarkResult[];
  optimalPoint?: {
    containers: number;
    throughput: number;
    latency: number;
  };
}

/**
 * 기준 GPU의 부하테스트 결과를 기반으로 다른 GPU들의 예상 성능을 계산
 */
export function projectBenchmarkToOtherGPUs(
  baseData: {
    gpuModel: string;
    workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
    documentType?: string | null;
    results: BenchmarkResult[];
  }
): ProjectedBenchmarkData[] {
  const baseGPUModel = baseData.gpuModel.toUpperCase();
  const baseGPUSpec = GPU_DB[baseGPUModel];
  
  // 기준 GPU 스펙이 없으면 원본만 반환
  if (!baseGPUSpec || !baseGPUSpec.fp32) {
    console.warn(`기준 GPU 스펙을 찾을 수 없습니다: ${baseGPUModel}`);
    return [{
      gpuModel: baseData.gpuModel,
      workloadType: baseData.workloadType,
      documentType: baseData.documentType,
      results: baseData.results,
    }];
  }
  
  const baseFP32 = baseGPUSpec.fp32;
  
  // 모든 GPU 모델에 대한 예상치 계산
  const targetGPUs = ["L40S", "H100", "H200", "B100", "B200", "A100"];
  const projectedData: ProjectedBenchmarkData[] = [];
  
  // 기준 GPU 데이터 추가
  projectedData.push({
    gpuModel: baseGPUModel,
    workloadType: baseData.workloadType,
    documentType: baseData.documentType,
    results: baseData.results,
  });
  
  // 다른 GPU들에 대한 예상치 계산
  for (const targetGPU of targetGPUs) {
    // 기준 GPU와 동일하면 스킵
    if (targetGPU.toUpperCase() === baseGPUModel) {
      continue;
    }
    
    const targetGPUSpec = GPU_DB[targetGPU];
    if (!targetGPUSpec || !targetGPUSpec.fp32) {
      continue; // GPU 스펙이 없으면 스킵
    }
    
    const fp32Ratio = targetGPUSpec.fp32 / baseFP32;
    
    // 각 컨테이너 수별로 예상 RPS와 Latency 계산
    const projectedResults: BenchmarkResult[] = baseData.results.map((result) => ({
      containers: result.containers,
      rps: Math.round(result.rps * fp32Ratio * 100) / 100, // 소수점 둘째 자리까지
      latency: result.latency !== null 
        ? Math.round((result.latency / fp32Ratio) * 100) / 100 // 레이턴시는 역비례
        : null,
    }));
    
    // 최적 지점 계산 (처리량이 최대인 지점)
    const optimalResult = projectedResults.reduce((best, current) => {
      const currentThroughput = current.rps * 60; // RPS를 분당 처리량으로 변환
      const bestThroughput = best.rps * 60;
      return currentThroughput > bestThroughput ? current : best;
    }, projectedResults[0]);
    
    projectedData.push({
      gpuModel: targetGPU,
      workloadType: baseData.workloadType,
      documentType: baseData.documentType,
      results: projectedResults,
      optimalPoint: {
        containers: optimalResult.containers,
        throughput: optimalResult.rps * 60, // 분당 처리량
        latency: optimalResult.latency || 0,
      },
    });
  }
  
  return projectedData;
}


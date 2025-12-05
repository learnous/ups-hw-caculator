/**
 * 부하테스트 데이터를 L40S 기준으로 변환하는 유틸리티
 */

import { ParsedBenchmarkData } from "@/lib/services/benchmarkDataProcessor";
import { GPU_DB } from "@/lib/constants/gpuDB";

const L40S_FP32 = GPU_DB.L40S?.fp32 || 91.6;

/**
 * 부하테스트 데이터를 L40S 기준으로 변환
 * 부하테스트 데이터의 GPU를 L40S로 변환하고, 그 값을 기준으로 사용
 */
export function convertBenchmarkToL40SBaseline(
  benchmarkData: ParsedBenchmarkData[]
): ParsedBenchmarkData[] {
  return benchmarkData.map((data) => {
    const sourceGPU = data.gpuModel.toUpperCase();
    const sourceGPUSpec = GPU_DB[sourceGPU];
    
    // GPU 스펙이 없거나 FP32 값이 없으면 원본 반환
    if (!sourceGPUSpec || !sourceGPUSpec.fp32) {
      console.warn(`GPU 스펙을 찾을 수 없습니다: ${sourceGPU}`);
      return data;
    }
    
    // L40S로 변환하는 비율 계산
    const fp32Ratio = L40S_FP32 / sourceGPUSpec.fp32;
    
    // nonMigRps와 migRps를 L40S 기준으로 변환
    const convertedNonMigRps = data.nonMigRps !== null && data.nonMigRps !== undefined
      ? data.nonMigRps * fp32Ratio
      : data.nonMigRps;
    
    const convertedMigRps = data.migRps !== null && data.migRps !== undefined
      ? data.migRps * fp32Ratio
      : data.migRps;
    
    return {
      ...data,
      gpuModel: "L40S", // GPU 모델을 L40S로 변경
      ...(convertedNonMigRps !== undefined && { nonMigRps: convertedNonMigRps }),
      ...(convertedMigRps !== undefined && { migRps: convertedMigRps }),
    };
  });
}

/**
 * L40S 기준 데이터를 특정 GPU의 성능으로 변환
 */
export function convertL40SBaselineToGPU(
  l40sData: ParsedBenchmarkData,
  targetGPU: string
): ParsedBenchmarkData {
  const targetGPUSpec = GPU_DB[targetGPU.toUpperCase()];
  
  if (!targetGPUSpec || !targetGPUSpec.fp32) {
    console.warn(`GPU 스펙을 찾을 수 없습니다: ${targetGPU}`);
    return l40sData;
  }
  
  // L40S에서 타겟 GPU로 변환하는 비율
  const fp32Ratio = targetGPUSpec.fp32 / L40S_FP32;
  
  // nonMigRps와 migRps를 타겟 GPU 기준으로 변환
  const convertedNonMigRps = l40sData.nonMigRps !== null && l40sData.nonMigRps !== undefined
    ? l40sData.nonMigRps * fp32Ratio
    : l40sData.nonMigRps;
  
  const convertedMigRps = l40sData.migRps !== null && l40sData.migRps !== undefined
    ? l40sData.migRps * fp32Ratio
    : l40sData.migRps;
  
  return {
    ...l40sData,
    gpuModel: targetGPU.toUpperCase(),
    ...(convertedNonMigRps !== undefined && { nonMigRps: convertedNonMigRps }),
    ...(convertedMigRps !== undefined && { migRps: convertedMigRps }),
  };
}


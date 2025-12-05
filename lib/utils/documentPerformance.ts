import { DocumentType, GPUModel } from "@/lib/constants/documentTypes";
import { GPU_DB } from "@/lib/constants/gpuDB";
import { DOCUMENT_PERFORMANCE } from "@/lib/constants/documentTypes";

/**
 * 특정 GPU 모델에서의 문서 타입 성능을 계산합니다.
 * 기준 GPU의 성능 데이터를 기반으로 FP32 TFLOPS 비율로 계산합니다.
 * 
 * @param documentType 문서 타입
 * @param targetGPU 계산할 대상 GPU 모델
 * @returns 성능 데이터 (throughput, latency) 또는 null (기준 데이터가 없는 경우)
 */
export function getDocumentPerformanceForGPU(
  documentType: DocumentType,
  targetGPU: GPUModel
): { throughput: number; latency: number } | null {
  const basePerformance = DOCUMENT_PERFORMANCE[documentType];
  
  // 기준 성능 데이터가 없으면 null 반환
  if (!basePerformance) {
    return null;
  }

  const baseGPU = GPU_DB[basePerformance.baseGPU];
  const targetGPUSpec = GPU_DB[targetGPU];

  // GPU 스펙이 없으면 null 반환
  if (!baseGPU || !targetGPUSpec) {
    return null;
  }

  // FP32 TFLOPS 비율 계산
  const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;

  // 스루풋은 비율에 비례하여 증가
  const throughput = basePerformance.throughput * fp32Ratio;

  // 레이턴시는 비율의 역수 (더 빠른 GPU = 더 낮은 레이턴시)
  const latency = basePerformance.latency / fp32Ratio;

  return {
    throughput: Math.round(throughput * 10) / 10, // 소수점 첫째 자리까지 반올림
    latency: Math.round(latency * 100) / 100, // 소수점 둘째 자리까지 반올림
  };
}

/**
 * 모든 GPU 모델에 대한 문서 타입 성능을 반환합니다.
 * 
 * @param documentType 문서 타입
 * @returns GPU 모델별 성능 데이터 맵
 */
export function getAllGPUPerformanceForDocument(
  documentType: DocumentType
): Partial<Record<GPUModel, { throughput: number; latency: number }>> {
  const gpuModels: GPUModel[] = ["L40S", "H100", "H200", "B100", "B200"];
  const result: Partial<Record<GPUModel, { throughput: number; latency: number }>> = {};

  for (const gpu of gpuModels) {
    const performance = getDocumentPerformanceForGPU(documentType, gpu);
    if (performance) {
      result[gpu] = performance;
    }
  }

  return result;
}


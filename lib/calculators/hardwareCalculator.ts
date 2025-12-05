import { CalculationInput, CalculationResult, GPUComparison, GPUBreakdown, WorkloadDetail, CalculationBreakdown } from "@/lib/types";
import { GPU_DB } from "@/lib/constants/gpuDB";
import { OCR_PROFILES } from "@/lib/constants/ocrProfiles";
import { DP_PROFILES } from "@/lib/constants/dpProfiles";
import { DOCUMENT_CLASSIFIER_PROFILES } from "@/lib/constants/documentClassifierProfiles";
import { INFORMATION_EXTRACTION_PROFILES } from "@/lib/constants/informationExtractionProfiles";
import { getDocumentPerformanceForGPU } from "@/lib/utils/documentPerformance";
import { GPUModel } from "@/lib/constants/documentTypes";
import { getDPPerformanceForGPU } from "@/lib/constants/dpBenchmarkData";
import { ParsedBenchmarkData } from "@/lib/services/benchmarkDataProcessor";
import { convertBenchmarkToL40SBaseline, convertL40SBaselineToGPU } from "@/lib/utils/benchmarkConverter";
import { matchDocumentType } from "@/lib/utils/stringMatcher";

/**
 * OCR GPU 요구사항 계산
 * OCR은 전체 요청량에 대해 동작합니다.
 */
function estimateOCRGpu(
  input: CalculationInput,
  benchmarkData?: ParsedBenchmarkData[]
): GPUBreakdown {
  const { cluster, system, totalRequestThroughput } = input;
  
  // 전체 요청량이 없으면 0 반환
  if (!totalRequestThroughput || totalRequestThroughput === 0) {
    return { gpuCount: 0, vram: 0, cost: 0, details: [] };
  }

  // 선택된 GPU 모델 결정
  const selectedGPU = system.gpuPreference !== "Auto-select" 
    ? system.gpuPreference 
    : "L40S";

  // 부하테스트 데이터를 L40S 기준으로 변환
  let l40sBenchmarkData: ParsedBenchmarkData[] = [];
  if (benchmarkData && benchmarkData.length > 0) {
    l40sBenchmarkData = convertBenchmarkToL40SBaseline(benchmarkData);
  }

  // L40S 기준 OCR 성능 찾기 (문서 타입 구분 없이 전체 OCR)
  let l40sThroughputPerContainer = 0;
  if (l40sBenchmarkData.length > 0) {
    const ocrBenchmark = l40sBenchmarkData.find(
      (data) => data.workloadType === "OCR" && data.nonMigRps !== null && data.nonMigRps !== undefined
    );
    if (ocrBenchmark?.nonMigRps !== null && ocrBenchmark?.nonMigRps !== undefined) {
      // nonMigRps는 RPS 값이므로 분당 처리량으로 변환
      l40sThroughputPerContainer = ocrBenchmark.nonMigRps * 60;
    }
  }

  // 선택된 GPU로 변환
  // 컨테이너 수 계산을 위한 스루풋 (MIG 가능 여부에 따라 다름)
  let throughputPerContainerForCalculation = 0;
  
  // MIG 가능한 GPU인 경우 MIG 스루풋 계산 (파드 1개 * 0.65)
  if (isMIGCapableGPU(selectedGPU)) {
    const migThroughput = getMIGThroughputPerContainer(
      selectedGPU,
      "OCR",
      null, // OCR은 문서 타입 구분 없음
      benchmarkData
    );
    if (migThroughput > 0) {
      throughputPerContainerForCalculation = migThroughput;
    } else if (l40sThroughputPerContainer > 0) {
      // MIG 데이터가 없으면 L40S 기준으로 변환 후 0.65 적용
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec?.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
        throughputPerContainerForCalculation = l40sThroughputPerContainer * fp32Ratio * 0.65; // MIG는 0.65 적용
      } else {
        throughputPerContainerForCalculation = l40sThroughputPerContainer * 0.65;
      }
    }
  } else {
    // MIG 불가능한 GPU: non-MIG 스루풋 사용 (최적화된 값 / 컨테이너 수)
    const nonMigThroughput = getNonMIGThroughputPerContainer(
      selectedGPU,
      "OCR",
      null,
      benchmarkData
    );
    if (nonMigThroughput > 0) {
      throughputPerContainerForCalculation = nonMigThroughput;
    } else if (l40sThroughputPerContainer > 0) {
      // non-MIG 데이터가 없으면 L40S 기준으로 변환
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec?.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
        throughputPerContainerForCalculation = l40sThroughputPerContainer * fp32Ratio;
      } else {
        throughputPerContainerForCalculation = l40sThroughputPerContainer;
      }
    } else {
      // 부하테스트 데이터가 없으면 기본값 사용하지 않음
      if (process.env.NODE_ENV === 'development') {
        console.warn("OCR 부하테스트 데이터를 찾을 수 없습니다.");
      }
      throughputPerContainerForCalculation = 0;
    }
  }

  // 컨테이너 수 계산 (MIG 가능 여부에 따라 다른 스루풋 사용)
  const containersNeeded = throughputPerContainerForCalculation > 0
    ? Math.ceil(totalRequestThroughput / throughputPerContainerForCalculation)
    : 0;
  
  // 총 필요 VRAM은 non-MIG 기준으로 계산
  // non-MIG 스루풋 계산 (최적화된 값 / 컨테이너 수)
  let nonMigThroughputPerContainer = 0;
  if (l40sBenchmarkData.length > 0) {
    const ocrBenchmark = l40sBenchmarkData.find(
      (data) => data.workloadType === "OCR" && data.nonMigRps !== null && data.nonMigRps !== undefined
    );
    if (ocrBenchmark?.nonMigRps !== null && ocrBenchmark?.nonMigRps !== undefined) {
      // nonMigRps는 RPS 값이므로 분당 처리량으로 변환
      const l40sNonMigRps = ocrBenchmark.nonMigRps;
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec?.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
        const targetNonMigRps = l40sNonMigRps * fp32Ratio;
        nonMigThroughputPerContainer = targetNonMigRps * 60; // RPS를 분당 처리량으로 변환
      } else {
        nonMigThroughputPerContainer = l40sNonMigRps * 60;
      }
    }
  }
  
  // non-MIG 스루풋이 없으면 계산용 스루풋 사용 (폴백)
  if (nonMigThroughputPerContainer === 0) {
    nonMigThroughputPerContainer = throughputPerContainerForCalculation;
  }
  
  // VRAM 계산을 위한 컨테이너 수 (non-MIG 기준)
  const containersForVram = nonMigThroughputPerContainer > 0
    ? Math.ceil(totalRequestThroughput / nonMigThroughputPerContainer)
    : containersNeeded;

  // pLLM 인스턴스 계산 (OCR 워크로드에서 pLLM이 필요한 경우)
  let totalPLLMInstances = 0;
  for (const workload of input.ocr) {
    if (workload.requiresPLLM) {
      const pllmInstancesNeeded = Math.ceil(
        workload.requiredThroughput / OCR_PROFILES.pLLMThroughputPerInstance
      );
      totalPLLMInstances += pllmInstancesNeeded;
    }
  }

  const details: WorkloadDetail[] = [{
    requiredThroughput: totalRequestThroughput,
    throughputPerContainer: throughputPerContainerForCalculation,
    containersNeeded,
    vramPerContainer: OCR_PROFILES.vramPerContainer,
    // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
    totalVram: containersNeeded * OCR_PROFILES.vramPerContainer,
  }];

  // pLLM이 필요한 경우 details에 추가
  if (totalPLLMInstances > 0) {
    details.push({
      requiredThroughput: totalRequestThroughput, // pLLM은 OCR 전체 처리량에 대해 동작
      throughputPerContainer: OCR_PROFILES.pLLMThroughputPerInstance,
      containersNeeded: totalPLLMInstances,
      vramPerContainer: OCR_PROFILES.pLLMVramPerInstance,
      totalVram: totalPLLMInstances * OCR_PROFILES.pLLMVramPerInstance,
    });
  }

  let totalVramNeeded = 0;
  let gpuCount = 0;

  if (cluster.deploymentMode === "Kubernetes (MIG-enabled)" && cluster.migProfile) {
    // MIG mode
    const migMemory = getMIGMemory(cluster.migProfile);
    const containersPerGPU = Math.floor(migMemory / OCR_PROFILES.vramPerContainer);
    const gpusForOCR = Math.ceil(containersNeeded / containersPerGPU);
    const gpusForPLLM = totalPLLMInstances;
    
    gpuCount = gpusForOCR + gpusForPLLM;
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    const ocrVram = containersNeeded * OCR_PROFILES.vramPerContainer;
    const pllmVram = totalPLLMInstances * OCR_PROFILES.pLLMVramPerInstance;
    totalVramNeeded = ocrVram + pllmVram;
  } else if (isMIGCapableGPU(selectedGPU)) {
    // MIG 가능한 GPU이지만 MIG 모드가 아닌 경우: 컨테이너 수 기반으로 계산 (GPU당 최대 7개)
    const MAX_CONTAINERS_PER_GPU = 7;
    const gpusForOCR = Math.ceil(containersNeeded / MAX_CONTAINERS_PER_GPU);
    const gpusForPLLM = totalPLLMInstances;
    
    gpuCount = gpusForOCR + gpusForPLLM;
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    const ocrVram = containersNeeded * OCR_PROFILES.vramPerContainer;
    const pllmVram = totalPLLMInstances * OCR_PROFILES.pLLMVramPerInstance;
    totalVramNeeded = ocrVram + pllmVram;
  } else {
    // Full GPU mode (MIG 불가능한 GPU)
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    const ocrVram = containersNeeded * OCR_PROFILES.vramPerContainer;
    const pllmVram = totalPLLMInstances * OCR_PROFILES.pLLMVramPerInstance;
    totalVramNeeded = ocrVram + pllmVram;
    
    const gpuSpec = GPU_DB[selectedGPU];
    const gpuMemory = gpuSpec?.memory || 48;
    // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
    gpuCount = Math.ceil(totalVramNeeded / (gpuMemory * 0.8));
  }

  const gpuSpec = GPU_DB[selectedGPU];
  const cost = gpuCount * (gpuSpec?.price || GPU_DB.L40S.price);

  return {
    gpuCount,
    vram: totalVramNeeded,
    cost,
    details,
  };
}

/**
 * 정보추출 GPU 요구사항 계산
 * 정보추출은 각 문서 타입별로 다른 처리량을 가집니다.
 */
function estimateInformationExtractionGpu(
  input: CalculationInput,
  benchmarkData?: ParsedBenchmarkData[]
): GPUBreakdown {
  const { ocr, cluster, system } = input;
  
  if (!ocr || ocr.length === 0) {
    return { gpuCount: 0, vram: 0, cost: 0, details: [] };
  }

  const selectedGPU = system.gpuPreference !== "Auto-select" 
    ? system.gpuPreference 
    : "L40S";

  let totalContainersNeeded = 0;
  const details: WorkloadDetail[] = [];

  // 부하테스트 데이터를 L40S 기준으로 변환
  let l40sBenchmarkData: ParsedBenchmarkData[] = [];
  if (benchmarkData && benchmarkData.length > 0) {
    l40sBenchmarkData = convertBenchmarkToL40SBaseline(benchmarkData);
  }

  // 각 문서 타입별로 정보추출 컨테이너 수 계산
  for (const workload of ocr) {
    // 부하테스트 데이터에서 해당 문서 타입의 OCR 성능을 찾아서 정보추출 성능으로 사용
    // 정보추출은 OCR보다 약간 느리므로 OCR 성능의 0.8배를 사용
    let throughputPerContainer = 0;
    
    if (l40sBenchmarkData.length > 0) {
      // L40S 기준 데이터에서 InformationExtraction 워크로드이고 문서 타입이 일치하는 데이터 찾기
      // 먼저 InformationExtraction 워크로드 데이터를 찾고, 없으면 OCR 워크로드 데이터를 fallback으로 사용
      let matchingBenchmark = l40sBenchmarkData.find(
        (data) =>
          data.workloadType === "InformationExtraction" &&
          matchDocumentType(data.documentType, workload.documentType) &&
          data.nonMigRps !== null && data.nonMigRps !== undefined
      );
      
      // InformationExtraction 데이터가 없으면 OCR 데이터를 fallback으로 사용
      if (!matchingBenchmark) {
        matchingBenchmark = l40sBenchmarkData.find(
          (data) =>
            data.workloadType === "OCR" &&
            matchDocumentType(data.documentType, workload.documentType) &&
            data.nonMigRps !== null && data.nonMigRps !== undefined
        );
      }
      
      if (matchingBenchmark?.nonMigRps !== null && matchingBenchmark?.nonMigRps !== undefined) {
        // L40S 기준 non-MIG 스루풋 계산 (VRAM 계산용)
        // nonMigRps는 RPS 값이므로 분당 처리량으로 변환
        const l40sNonMigThroughputPerContainer = matchingBenchmark.nonMigRps * 60;
        
        // 버퍼를 위해 0.8배 적용
        const infoExtractionFactor = 0.8;
        
        // 컨테이너 수 계산용 스루풋 (MIG 가능 여부에 따라 다름)
        let throughputPerContainerForCalculation = 0;
        
        // MIG 가능한 GPU인 경우 MIG 스루풋 계산 (파드 1개 * 0.65)
        if (isMIGCapableGPU(selectedGPU)) {
          const migThroughput = getMIGThroughputPerContainer(
            selectedGPU,
            "InformationExtraction",
            workload.documentType,
            benchmarkData
          );
          if (migThroughput > 0) {
            // 버퍼를 위해 0.8배 적용
            throughputPerContainerForCalculation = migThroughput * infoExtractionFactor;
          } else {
            // MIG 데이터가 없으면 L40S 기준으로 변환 후 0.65 * infoExtractionFactor 적용
            const targetGPUSpec = GPU_DB[selectedGPU];
            if (targetGPUSpec?.fp32) {
              const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
              throughputPerContainerForCalculation = l40sNonMigThroughputPerContainer * fp32Ratio * 0.65 * infoExtractionFactor;
            } else {
              throughputPerContainerForCalculation = l40sNonMigThroughputPerContainer * 0.65 * infoExtractionFactor;
            }
          }
        } else {
          // MIG 불가능한 GPU: non-MIG 스루풋 사용
          const nonMigThroughput = getNonMIGThroughputPerContainer(
            selectedGPU,
            "InformationExtraction",
            workload.documentType,
            benchmarkData
          );
          if (nonMigThroughput > 0) {
            // 버퍼를 위해 0.8배 적용
            throughputPerContainerForCalculation = nonMigThroughput * infoExtractionFactor;
          } else {
            // non-MIG 데이터가 없으면 L40S 기준으로 변환
            const targetGPUSpec = GPU_DB[selectedGPU];
            if (targetGPUSpec?.fp32) {
              const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
              throughputPerContainerForCalculation = l40sNonMigThroughputPerContainer * fp32Ratio * infoExtractionFactor;
            } else {
              throughputPerContainerForCalculation = l40sNonMigThroughputPerContainer * infoExtractionFactor;
            }
          }
        }
        
        // VRAM 계산용 non-MIG 스루풋
        let nonMigThroughputPerContainer = 0;
        const targetGPUSpec = GPU_DB[selectedGPU];
        if (targetGPUSpec?.fp32) {
          const fp32Ratio = targetGPUSpec.fp32 / GPU_DB.L40S.fp32;
          nonMigThroughputPerContainer = l40sNonMigThroughputPerContainer * fp32Ratio * infoExtractionFactor;
        } else {
          nonMigThroughputPerContainer = l40sNonMigThroughputPerContainer * infoExtractionFactor;
        }
        
        // 컨테이너 수 계산
        const containersNeeded = throughputPerContainerForCalculation > 0
          ? Math.ceil(workload.requiredThroughput / throughputPerContainerForCalculation)
          : 0;
        
        totalContainersNeeded += containersNeeded;

        const vramPerContainer = INFORMATION_EXTRACTION_PROFILES.vramPerContainer;
        // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
        const totalVram = containersNeeded * vramPerContainer;

        details.push({
          documentType: workload.documentType,
          requiredThroughput: workload.requiredThroughput,
          throughputPerContainer: Math.round(throughputPerContainerForCalculation * 10) / 10,
          containersNeeded,
          vramPerContainer,
          totalVram,
        });
        
        continue; // 다음 문서 타입으로
      }
    }
    
    // 부하테스트 데이터가 없거나 매칭되지 않으면 해당 문서 타입 스킵
    if (process.env.NODE_ENV === 'development') {
      console.warn(`부하테스트 데이터를 찾을 수 없습니다: ${workload.documentType} - 해당 문서 타입은 계산에서 제외됩니다.`);
    }
  }

  let totalVramNeeded = 0;
  let gpuCount = 0;

  if (cluster.deploymentMode === "Kubernetes (MIG-enabled)" && cluster.migProfile) {
    const migMemory = getMIGMemory(cluster.migProfile);
    const containersPerGPU = Math.floor(migMemory / INFORMATION_EXTRACTION_PROFILES.vramPerContainer);
    gpuCount = Math.ceil(totalContainersNeeded / containersPerGPU);
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = details.reduce((sum, detail) => sum + detail.totalVram, 0);
  } else if (isMIGCapableGPU(selectedGPU)) {
    // MIG 가능한 GPU이지만 MIG 모드가 아닌 경우: 컨테이너 수 기반으로 계산 (GPU당 최대 7개)
    const MAX_CONTAINERS_PER_GPU = 7;
    gpuCount = Math.ceil(totalContainersNeeded / MAX_CONTAINERS_PER_GPU);
    // 총 필요 VRAM은 non-MIG 기준으로 계산 (details에서 합산)
    totalVramNeeded = details.reduce((sum, detail) => sum + detail.totalVram, 0);
  } else {
    // Full GPU mode (MIG 불가능한 GPU)
    // 총 필요 VRAM은 non-MIG 기준으로 계산 (details에서 합산)
    totalVramNeeded = details.reduce((sum, detail) => sum + detail.totalVram, 0);
    const gpuSpec = GPU_DB[selectedGPU];
    const gpuMemory = gpuSpec?.memory || 48;
    // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
    gpuCount = Math.ceil(totalVramNeeded / (gpuMemory * 0.8));
  }

  const gpuSpec = GPU_DB[selectedGPU];
  const cost = gpuCount * (gpuSpec?.price || GPU_DB.L40S.price);

  return {
    gpuCount,
    vram: totalVramNeeded,
    cost,
    details,
  };
}

/**
 * 문서분류기 GPU 요구사항 계산
 * 문서분류기는 전체 요청량에 대해 동작합니다.
 * H100 기준 성능을 사용하며, 다른 GPU는 FP32 TFLOPS 비율로 계산됩니다.
 */
function estimateDocumentClassifierGpu(input: CalculationInput, benchmarkData?: ParsedBenchmarkData[]): GPUBreakdown {
  const { cluster, system, totalRequestThroughput } = input;
  
  if (!totalRequestThroughput || totalRequestThroughput === 0) {
    return { gpuCount: 0, vram: 0, cost: 0, details: [] };
  }

  const selectedGPU = system.gpuPreference !== "Auto-select" 
    ? system.gpuPreference 
    : "H100"; // 문서분류기는 H100을 기본값으로 사용

  // GPU별 처리량 계산
  let throughputPerContainer = 0;
  
  // MIG 가능한 GPU인 경우 MIG 스루풋 계산
  if (isMIGCapableGPU(selectedGPU)) {
    const migThroughput = getMIGThroughputPerContainer(
      selectedGPU,
      "DocumentClassifier",
      null,
      benchmarkData
    );
    if (migThroughput > 0) {
      throughputPerContainer = migThroughput;
    } else {
      // MIG 데이터가 없으면 FP32 비율 기반으로 계산 후 0.65 적용
      const baseGPU = GPU_DB[DOCUMENT_CLASSIFIER_PROFILES.baseGPU];
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec && baseGPU && targetGPUSpec.fp32 && baseGPU.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;
        throughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * fp32Ratio * 0.65;
      } else {
        throughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * 0.65;
      }
    }
  } else {
    // MIG 불가능한 GPU는 기존 로직 사용
    const baseGPU = GPU_DB[DOCUMENT_CLASSIFIER_PROFILES.baseGPU];
    const targetGPUSpec = GPU_DB[selectedGPU];
    
    throughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer;
    
    if (targetGPUSpec && baseGPU && targetGPUSpec.fp32 && baseGPU.fp32) {
      // FP32 비율로 처리량 계산
      const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;
      throughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * fp32Ratio;
    }
  }

  // GPU별 처리량 계산
  // 컨테이너 수 계산용 스루풋 (MIG 가능 여부에 따라 다름)
  let throughputPerContainerForCalculation = 0;
  
  // MIG 가능한 GPU인 경우 MIG 스루풋 계산
  if (isMIGCapableGPU(selectedGPU)) {
    const migThroughput = getMIGThroughputPerContainer(
      selectedGPU,
      "DocumentClassifier",
      null,
      benchmarkData
    );
    if (migThroughput > 0) {
      throughputPerContainerForCalculation = migThroughput;
    } else {
      // MIG 데이터가 없으면 FP32 비율 기반으로 계산 (0.65 적용 안 함)
      const baseGPU = GPU_DB[DOCUMENT_CLASSIFIER_PROFILES.baseGPU];
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec && baseGPU && targetGPUSpec.fp32 && baseGPU.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;
        throughputPerContainerForCalculation = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * fp32Ratio;
      } else {
        throughputPerContainerForCalculation = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer;
      }
    }
  } else {
    // MIG 불가능한 GPU: non-MIG 스루풋 사용
    const nonMigThroughput = getNonMIGThroughputPerContainer(
      selectedGPU,
      "DocumentClassifier",
      null,
      benchmarkData
    );
    if (nonMigThroughput > 0) {
      throughputPerContainerForCalculation = nonMigThroughput;
    } else {
      // non-MIG 데이터가 없으면 FP32 비율 기반으로 계산
      const baseGPU = GPU_DB[DOCUMENT_CLASSIFIER_PROFILES.baseGPU];
      const targetGPUSpec = GPU_DB[selectedGPU];
      if (targetGPUSpec && baseGPU && targetGPUSpec.fp32 && baseGPU.fp32) {
        const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;
        throughputPerContainerForCalculation = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * fp32Ratio;
      } else {
        throughputPerContainerForCalculation = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer;
      }
    }
  }

  // 컨테이너 수 계산
  const containersNeeded = throughputPerContainerForCalculation > 0
    ? Math.ceil(totalRequestThroughput / throughputPerContainerForCalculation)
    : 0;
  
  // 총 필요 VRAM은 non-MIG 기준으로 계산
  // non-MIG 스루풋 계산
  let nonMigThroughputPerContainer = 0;
  const baseGPU = GPU_DB[DOCUMENT_CLASSIFIER_PROFILES.baseGPU];
  const targetGPUSpec = GPU_DB[selectedGPU];
  if (targetGPUSpec && baseGPU && targetGPUSpec.fp32 && baseGPU.fp32) {
    const fp32Ratio = targetGPUSpec.fp32 / baseGPU.fp32;
    nonMigThroughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer * fp32Ratio;
  } else {
    nonMigThroughputPerContainer = DOCUMENT_CLASSIFIER_PROFILES.baseThroughputPerContainer;
  }
  
  const details: WorkloadDetail[] = [{
    requiredThroughput: totalRequestThroughput,
    throughputPerContainer: Math.round(throughputPerContainerForCalculation * 10) / 10,
    containersNeeded,
    vramPerContainer: DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer,
    // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
    totalVram: containersNeeded * DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer,
  }];

  let totalVramNeeded = 0;
  let gpuCount = 0;

  if (cluster.deploymentMode === "Kubernetes (MIG-enabled)" && cluster.migProfile) {
    const migMemory = getMIGMemory(cluster.migProfile);
    const containersPerGPU = Math.floor(migMemory / DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer);
    gpuCount = Math.ceil(containersNeeded / containersPerGPU);
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = containersNeeded * DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer;
  } else if (isMIGCapableGPU(selectedGPU)) {
    // MIG 가능한 GPU이지만 MIG 모드가 아닌 경우: 컨테이너 수 기반으로 계산 (GPU당 최대 7개)
    const MAX_CONTAINERS_PER_GPU = 7;
    gpuCount = Math.ceil(containersNeeded / MAX_CONTAINERS_PER_GPU);
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = containersNeeded * DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer;
  } else {
    // Full GPU mode (MIG 불가능한 GPU)
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = containersNeeded * DOCUMENT_CLASSIFIER_PROFILES.vramPerContainer;
    const gpuSpec = GPU_DB[selectedGPU];
    const gpuMemory = gpuSpec?.memory || 80; // 기본값 H100
    // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
    gpuCount = Math.ceil(totalVramNeeded / (gpuMemory * 0.8));
  }

  const gpuSpec = GPU_DB[selectedGPU];
  const cost = gpuCount * (gpuSpec?.price || GPU_DB.H100.price);

  return {
    gpuCount,
    vram: totalVramNeeded,
    cost,
    details,
  };
}

function estimateDPGpu(input: CalculationInput, benchmarkData?: ParsedBenchmarkData[]): GPUBreakdown {
  const { dp, cluster, system } = input;
  
  // 선택된 GPU 모델 결정 (또는 기본값)
  const selectedGPU = system.gpuPreference !== "Auto-select" 
    ? system.gpuPreference 
    : "H100"; // DP는 H100을 기본값으로 사용 (가장 상세한 벤치마크 데이터)

  console.log(`[estimateDPGpu] 시작 - selectedGPU: ${selectedGPU}, deploymentMode: ${cluster.deploymentMode}, migProfile: ${cluster.migProfile || 'N/A'}`);
  console.log(`[estimateDPGpu] isMIGCapableGPU(${selectedGPU}): ${isMIGCapableGPU(selectedGPU)}`);

  let gpuCount = 0;
  let totalVramNeeded = 0;
  let throughputPerContainer = 0;
  let containersNeeded = 0;
  const defaultProfile = DP_PROFILES.default;

  if (cluster.deploymentMode === "Kubernetes (MIG-enabled)" && cluster.migProfile) {
    // MIG mode: 벤치마크 데이터 기반 계산
    const migProfile = DP_PROFILES.mig;
    
    // 필요한 컨테이너 수 계산
    throughputPerContainer = migProfile.throughputPerContainer;
    containersNeeded = Math.ceil(
      dp.requiredThroughput / throughputPerContainer
    );
    
    // GPU당 컨테이너 수
    const containersPerGPU = migProfile.containersPerGPU;
    
    // 필요한 GPU 수
    gpuCount = Math.ceil(containersNeeded / containersPerGPU);
    
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = containersNeeded * defaultProfile.vramPerContainer;
  } else if (isMIGCapableGPU(selectedGPU)) {
    // MIG 가능한 GPU이지만 MIG 모드가 아닌 경우
    // MIG 스루풋 계산
    console.log(`[estimateDPGpu ${selectedGPU}] MIG 가능 GPU - getMIGThroughputPerContainer 호출`);
    const migThroughput = getMIGThroughputPerContainer(
      selectedGPU,
      "DP",
      null,
      benchmarkData
    );
    
    console.log(`[estimateDPGpu ${selectedGPU}] getMIGThroughputPerContainer 결과: ${migThroughput} docs/min`);
    
    if (migThroughput > 0) {
      throughputPerContainer = migThroughput;
      console.log(`[estimateDPGpu ${selectedGPU}] MIG 스루풋 사용: ${throughputPerContainer} docs/min`);
    } else {
      // MIG 데이터가 없으면 기본 프로필 사용 후 0.65 적용
      const dpPerformance = getDPPerformanceForGPU(selectedGPU);
      if (dpPerformance) {
        throughputPerContainer = dpPerformance.throughputPerContainer * 0.65;
      } else {
        throughputPerContainer = defaultProfile.throughputPerContainer * 0.65;
      }
    }
    
    containersNeeded = Math.ceil(
      dp.requiredThroughput / throughputPerContainer
    );
    
    // GPU당 최대 7개 컨테이너 제약
    const MAX_CONTAINERS_PER_GPU = 7;
    gpuCount = Math.ceil(containersNeeded / MAX_CONTAINERS_PER_GPU);
    
    // 총 필요 VRAM은 실제 사용되는 VRAM (컨테이너 수 * 컨테이너당 VRAM)으로 계산
    totalVramNeeded = containersNeeded * defaultProfile.vramPerContainer;
  } else {
    // Full GPU mode (MIG 불가능한 GPU): 벤치마크 데이터 기반 계산
    // non-MIG 스루풋 사용
    console.log(`[estimateDPGpu ${selectedGPU}] MIG 불가능 GPU - getNonMIGThroughputPerContainer 호출`);
    const nonMigThroughput = getNonMIGThroughputPerContainer(
      selectedGPU,
      "DP",
      null,
      benchmarkData
    );
    
    console.log(`[estimateDPGpu ${selectedGPU}] getNonMIGThroughputPerContainer 결과: ${nonMigThroughput} docs/min`);
    
    if (nonMigThroughput > 0) {
      throughputPerContainer = nonMigThroughput;
      console.log(`[${selectedGPU} DP] 벤치마크 데이터 사용: ${throughputPerContainer} docs/min`);
    } else {
      // non-MIG 데이터가 없으면 기본 프로필 사용
      const dpPerformance = getDPPerformanceForGPU(selectedGPU);
      if (dpPerformance) {
        throughputPerContainer = dpPerformance.throughputPerContainer;
        console.log(`[${selectedGPU} DP] fallback 프로필 사용: ${throughputPerContainer} docs/min (FP32 비율 기반)`);
      } else {
        throughputPerContainer = defaultProfile.throughputPerContainer;
        console.log(`[${selectedGPU} DP] 기본 프로필 사용: ${throughputPerContainer} docs/min`);
      }
    }
    
    containersNeeded = Math.ceil(
      dp.requiredThroughput / throughputPerContainer
    );
    
    // 총 필요 VRAM은 non-MIG 기준으로 계산
    totalVramNeeded = containersNeeded * defaultProfile.vramPerContainer;
    
    // GPU 개수 계산
    const dpPerformance = getDPPerformanceForGPU(selectedGPU);
    if (dpPerformance) {
      gpuCount = Math.ceil(containersNeeded / dpPerformance.containersPerGPU);
    } else {
      gpuCount = Math.ceil(containersNeeded / defaultProfile.containersPerGPU);
    }
  }

  const finalThroughputPerContainer = Math.round(throughputPerContainer * 10) / 10;
  console.log(`[estimateDPGpu ${selectedGPU}] 최종 계산 결과:`);
  console.log(`  throughputPerContainer: ${throughputPerContainer} → ${finalThroughputPerContainer} docs/min`);
  console.log(`  containersNeeded: ${containersNeeded}`);
  console.log(`  gpuCount: ${gpuCount}`);
  console.log(`  totalVramNeeded: ${totalVramNeeded} GB`);

  const details: WorkloadDetail[] = [{
    requiredThroughput: dp.requiredThroughput,
    throughputPerContainer: finalThroughputPerContainer,
    containersNeeded,
    vramPerContainer: defaultProfile.vramPerContainer,
    totalVram: containersNeeded * defaultProfile.vramPerContainer,
  }];

  // 비용 계산
  const gpuSpec = GPU_DB[selectedGPU];
  const cost = gpuCount * (gpuSpec?.price || GPU_DB.H100.price);

  return {
    gpuCount,
    vram: totalVramNeeded,
    cost,
    details,
  };
}

function estimateLLMGpu(input: CalculationInput): GPUBreakdown {
  const { llm, system } = input;
  
  // Context size multipliers
  const contextMultipliers: Record<string, number> = {
    Small: 1,
    Medium: 2,
    Large: 4,
  };

  const multiplier = contextMultipliers[llm.promptSize] || 1;
  const baseVramPerUser = 8; // Base 8GB per user
  const vramPerUser = baseVramPerUser * multiplier;
  
  // Streaming reduces memory pressure slightly
  const streamingFactor = llm.enableStreaming ? 0.8 : 1.0;
  
  const totalVramNeeded = Math.ceil(
    llm.simultaneousUsers * vramPerUser * streamingFactor
  );
  
  // GPU 선택 (LLM은 기본적으로 H100 사용하지만, 선택된 GPU 사용)
  const selectedGPU = system.gpuPreference !== "Auto-select" 
    ? system.gpuPreference 
    : "H100";
  
  const gpuSpec = GPU_DB[selectedGPU];
  const gpuMemory = gpuSpec?.memory || 80;
  
  let gpuCount = 0;
  
  if (isMIGCapableGPU(selectedGPU)) {
    // MIG 가능한 GPU인 경우: 컨테이너 수 기반으로 계산 (GPU당 최대 7개)
    // LLM은 사용자 수 = 컨테이너 수
    const MAX_CONTAINERS_PER_GPU = 7;
    gpuCount = Math.ceil(llm.simultaneousUsers / MAX_CONTAINERS_PER_GPU);
  } else {
    // MIG 불가능한 GPU: VRAM 기반 계산
    // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
    gpuCount = Math.ceil(totalVramNeeded / (gpuMemory * 0.8));
  }
  
  const cost = gpuCount * (gpuSpec?.price || GPU_DB.H100.price);

  const details: WorkloadDetail[] = [{
    requiredThroughput: llm.simultaneousUsers, // 동시 사용자 수
    throughputPerContainer: 1, // LLM은 사용자당 VRAM으로 계산
    containersNeeded: llm.simultaneousUsers, // 사용자 수 = 필요한 인스턴스 수
    vramPerContainer: Math.round(vramPerUser * streamingFactor * 10) / 10,
    totalVram: totalVramNeeded,
  }];

  return {
    gpuCount,
    vram: totalVramNeeded,
    cost,
    details,
  };
}

function estimateCpu(input: CalculationInput, benchmarkData?: ParsedBenchmarkData[]): number {
  const ocrBreakdown = estimateOCRGpu(input, benchmarkData);
  const infoExtractionBreakdown = estimateInformationExtractionGpu(input, benchmarkData);
  const docClassifierBreakdown = estimateDocumentClassifierGpu(input, benchmarkData);
  const dpBreakdown = estimateDPGpu(input, benchmarkData);
  const llmBreakdown = estimateLLMGpu(input);

  // 컨테이너 수 기반 CPU 계산
  // OCR: 컨테이너당 4코어
  const ocrContainers = ocrBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const ocrCpu = ocrContainers * OCR_PROFILES.cpuImpactPerContainer;

  // 정보추출: 컨테이너당 2코어 (기존 값 유지)
  const infoExtractionContainers = infoExtractionBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const infoExtractionCpu = infoExtractionContainers * INFORMATION_EXTRACTION_PROFILES.cpuImpactPerContainer;

  // 문서분류기: 컨테이너당 4코어
  const docClassifierContainers = docClassifierBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const docClassifierCpu = docClassifierContainers * DOCUMENT_CLASSIFIER_PROFILES.cpuImpactPerContainer;

  // DP: 컨테이너당 6코어
  const dpContainers = dpBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const dpCpu = dpContainers * DP_PROFILES.default.cpuImpactPerContainer;

  // LLM: 컨테이너당 16코어 (사용자 수 = 컨테이너 수)
  const llmContainers = llmBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const llmCpu = llmContainers * 16; // LLM 컨테이너당 16코어

  // Base CPU for system overhead
  const baseCpu = 8;

  return ocrCpu + infoExtractionCpu + docClassifierCpu + dpCpu + llmCpu + baseCpu;
}

function estimateMemory(input: CalculationInput, benchmarkData?: ParsedBenchmarkData[]): number {
  const ocrBreakdown = estimateOCRGpu(input, benchmarkData);
  const infoExtractionBreakdown = estimateInformationExtractionGpu(input, benchmarkData);
  const docClassifierBreakdown = estimateDocumentClassifierGpu(input, benchmarkData);
  const dpBreakdown = estimateDPGpu(input, benchmarkData);
  const llmBreakdown = estimateLLMGpu(input);

  // 컨테이너 수 기반 메모리 계산
  // OCR: 컨테이너당 16GB RAM
  const ocrContainers = ocrBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const ocrMemory = ocrContainers * OCR_PROFILES.memoryImpactPerContainer;

  // 정보추출: 컨테이너당 4GB RAM (기존 값 유지)
  const infoExtractionContainers = infoExtractionBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const infoExtractionMemory = infoExtractionContainers * INFORMATION_EXTRACTION_PROFILES.memoryImpactPerContainer;

  // 문서분류기: 컨테이너당 16GB RAM
  const docClassifierContainers = docClassifierBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const docClassifierMemory = docClassifierContainers * DOCUMENT_CLASSIFIER_PROFILES.memoryImpactPerContainer;

  // DP: 컨테이너당 32GB RAM
  const dpContainers = dpBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const dpMemory = dpContainers * DP_PROFILES.default.memoryImpactPerContainer;

  // LLM: 컨테이너당 64GB RAM (사용자 수 = 컨테이너 수)
  const llmContainers = llmBreakdown.details?.reduce((sum, detail) => sum + detail.containersNeeded, 0) || 0;
  const llmMemory = llmContainers * 64; // LLM 컨테이너당 64GB RAM

  // Base memory for system
  const baseMemory = 64;

  return ocrMemory + infoExtractionMemory + docClassifierMemory + dpMemory + llmMemory + baseMemory;
}

function getMIGMemory(profile: string): number {
  // Default to H100 MIG profiles
  return GPU_DB.H100.migProfiles[profile] || 10;
}

/**
 * GPU가 MIG를 지원하는지 확인합니다.
 * H100, H200, B100, B200은 MIG를 지원합니다.
 */
function isMIGCapableGPU(gpuModel: string): boolean {
  const migCapableGPUs = ["H100", "H200", "B100", "B200"];
  return migCapableGPUs.includes(gpuModel);
}

/**
 * MIG가 가능한 GPU에서의 스루풋을 계산합니다.
 * 파드 1개(컨테이너 1개)에서의 부하테스트 결과 * 0.65
 */
function getMIGThroughputPerContainer(
  gpuModel: string,
  workloadType: "OCR" | "InformationExtraction" | "DocumentClassifier" | "DP" | "LLM",
  documentType: string | null,
  benchmarkData?: ParsedBenchmarkData[]
): number {
  if (!benchmarkData || benchmarkData.length === 0) {
    return 0;
  }

  // 모든 MIG GPU의 migRps를 찾아서 FP32 비율로 정규화하여 가장 큰 값 사용
  // **중요**: 직접 매칭 데이터가 있더라도, 다른 GPU의 더 큰 migRps를 고려해야 함
  // **중요**: MIG GPU만 포함해야 함 (H100, H200, B100, B200)
  const allMatchingData = benchmarkData.filter((data) => {
    // MIG GPU인지 확인
    const isMIGGPU = isMIGCapableGPU(data.gpuModel);
    if (!isMIGGPU) {
      return false; // non-MIG GPU는 제외
    }
    
    const workloadMatch = data.workloadType === workloadType;
    
    let docMatch = true;
    // OCR 워크로드의 경우
    if (workloadType === "OCR") {
      if (documentType) {
        // documentType이 있으면 정확히 매칭
        docMatch = matchDocumentType(data.documentType || "", documentType);
      }
      // documentType이 null이면 모든 OCR 데이터 포함
    } 
    // InformationExtraction 워크로드의 경우
    else if (workloadType === "InformationExtraction") {
      if (documentType) {
        // documentType이 있으면 정확히 매칭
        docMatch = matchDocumentType(data.documentType || "", documentType);
      }
      // documentType이 null이면 모든 InformationExtraction 데이터 포함
    }
    // DP 워크로드의 경우 documentType이 항상 null이어야 함
    else if (workloadType === "DP") {
      docMatch = !data.documentType || data.documentType === null;
    }
    
    return workloadMatch && docMatch;
  });
  
  // 각 GPU의 1컨테이너 migRps를 찾아서 L40S 기준으로 정규화
  // **중요**: MIG GPU는 migRps와 nonMigRps를 모두 가질 수 있음
  const normalizedMigRps: Array<{ gpuModel: string; migRps: number | null; nonMigRps: number | null; normalizedRps: number }> = [];
  
  for (const data of allMatchingData) {
    // MIG GPU인지 다시 확인 (안전장치)
    if (!isMIGCapableGPU(data.gpuModel)) {
      continue; // non-MIG GPU는 건너뛰기
    }
    
    // GPU별 migRps와 nonMigRps는 상위 레벨에서 읽기
    let migRps: number | null = null;
    let nonMigRps: number | null = null;
    
    // migRps 필드가 명시적으로 있는 경우만 사용
    if (data.migRps !== undefined && data.migRps !== null) {
      migRps = data.migRps;
    }
    
    // nonMigRps도 확인 (MIG GPU는 nonMigRps와 migRps를 모두 가질 수 있음)
    if (data.nonMigRps !== undefined && data.nonMigRps !== null) {
      nonMigRps = data.nonMigRps;
    }
    
    // migRps가 있어야 정규화 진행 (MIG 스루풋 계산에는 migRps 사용)
    if (migRps !== null && migRps > 0) {
      // 해당 GPU의 FP32 TFLOPS로 L40S 기준으로 정규화
      const gpuSpec = GPU_DB[data.gpuModel.toUpperCase()];
      const l40sSpec = GPU_DB.L40S;
      
      if (gpuSpec?.fp32 && l40sSpec?.fp32) {
        const fp32Ratio = l40sSpec.fp32 / gpuSpec.fp32; // L40S 기준으로 정규화
        const normalizedRps = migRps * fp32Ratio;
        normalizedMigRps.push({
          gpuModel: data.gpuModel,
          migRps: migRps,
          nonMigRps: nonMigRps,
          normalizedRps: normalizedRps
        });
      }
    }
  }
  
  // 정규화된 RPS 중 가장 큰 값 사용
  if (normalizedMigRps.length > 0) {
    const bestMatch = normalizedMigRps.reduce((best, current) => 
      current.normalizedRps > best.normalizedRps ? current : best
    );
    
    // 선택된 GPU의 migRps를 대상 GPU로 변환
    if (bestMatch.migRps === null) {
      return 0;
    }
    
    const targetGPUSpec = GPU_DB[gpuModel.toUpperCase()];
    const bestGPUSpec = GPU_DB[bestMatch.gpuModel.toUpperCase()];
    
    if (targetGPUSpec?.fp32 && bestGPUSpec?.fp32) {
      const fp32Ratio = targetGPUSpec.fp32 / bestGPUSpec.fp32;
      const targetMigRps = bestMatch.migRps * fp32Ratio;
      
      // 컨테이너 1개일 때의 분당 처리량 * 0.65
      const throughputPerContainer = targetMigRps * 60 * 0.65;
      
      // 공통 로그: GPU별 LLM 정보 및 계산 과정
      console.log(`[${gpuModel} ${workloadType}] LLM 데이터: migRps=${bestMatch.migRps} (${bestMatch.gpuModel}), nonMigRps=${bestMatch.nonMigRps ?? 'N/A'}`);
      console.log(`[${gpuModel} ${workloadType}] 스루풋 계산: ${bestMatch.migRps} RPS (${bestMatch.gpuModel}) → FP32 비율 ${fp32Ratio.toFixed(4)} → ${targetMigRps.toFixed(4)} RPS → ${throughputPerContainer.toFixed(2)} docs/min (MIG 0.65 적용)`);
      
      return throughputPerContainer;
    }
  }
  
  // 정규화된 데이터가 없으면 0 반환
  return 0;
}

/**
 * non-MIG GPU에서의 스루풋을 계산합니다.
 * 여러 컨테이너일 때 최적화된 분당 처리량 / 컨테이너 수 (그대로 사용)
 */
function getNonMIGThroughputPerContainer(
  gpuModel: string,
  workloadType: "OCR" | "InformationExtraction" | "DocumentClassifier" | "DP" | "LLM",
  documentType: string | null,
  benchmarkData?: ParsedBenchmarkData[]
): number {
  if (!benchmarkData || benchmarkData.length === 0) {
    return 0;
  }

  // 해당 GPU와 워크로드 타입, 문서 타입에 맞는 부하테스트 데이터 찾기
  // **중요**: non-MIG GPU만 찾아야 함 (A6000, RTX3090, L40S 등)
  const matchingData = benchmarkData.find((data) => {
    const gpuMatch = data.gpuModel.toUpperCase() === gpuModel.toUpperCase();
    const workloadMatch = data.workloadType === workloadType;
    const docMatch = workloadType === "OCR" || workloadType === "InformationExtraction"
      ? (documentType ? matchDocumentType(data.documentType || "", documentType) : true)
      : true;
    
    // non-MIG GPU인지 확인 (MIG GPU는 제외)
    const isMIGGPU = isMIGCapableGPU(data.gpuModel);
    if (isMIGGPU) {
      return false; // MIG GPU는 non-MIG 스루풋 계산에서 제외
    }
    
    return gpuMatch && workloadMatch && docMatch && data.nonMigRps !== null && data.nonMigRps !== undefined;
  });

  if (!matchingData || matchingData.nonMigRps === null || matchingData.nonMigRps === undefined) {
    // 모든 GPU에 대해 MIG-GPU들의 nonMigRps를 FP32 비율로 변환해서 그 중 가장 큰 값을 사용
    
    // 모든 MIG-GPU의 데이터 찾기
    const migGPUDatas = benchmarkData.filter((data) => {
      const workloadMatch = data.workloadType === workloadType;
      const docMatch = workloadType === "OCR" || workloadType === "InformationExtraction"
        ? (documentType ? matchDocumentType(data.documentType || "", documentType) : true)
        : true;
      
      // MIG-GPU인지 확인
      const isMIGGPU = isMIGCapableGPU(data.gpuModel);
      
      return isMIGGPU && workloadMatch && docMatch && data.nonMigRps !== null && data.nonMigRps !== undefined;
    });
    
    if (migGPUDatas.length > 0) {
      const targetGPUSpec = GPU_DB[gpuModel.toUpperCase()];
      
      if (!targetGPUSpec?.fp32) {
        return 0;
      }
      
      const convertedThroughputs: Array<{ gpuModel: string; nonMigRps: number; throughput: number }> = [];
      
      for (const migData of migGPUDatas) {
        const migGPUSpec = GPU_DB[migData.gpuModel.toUpperCase()];
        
        if (!migGPUSpec?.fp32) {
          continue;
        }
        
        // nonMigRps는 상위 레벨에서 읽기 (MIG-GPU는 nonMigRps와 migRps를 모두 가질 수 있음)
        const nonMigRps = migData.nonMigRps ?? null;
        
        if (nonMigRps === null || nonMigRps === undefined) {
          continue;
        }
        
        // FP32 비율 계산 (타겟 GPU 기준으로 변환)
        const fp32Ratio = targetGPUSpec.fp32 / migGPUSpec.fp32;
        
        // nonMigRps는 이미 LLM이 컨테이너 수로 나눈 컨테이너당 RPS 값이므로 그대로 사용
        // FP32 비율을 곱해서 타겟 GPU 기준으로 변환
        const convertedRps = nonMigRps * fp32Ratio;
        const convertedThroughputPerContainer = convertedRps * 60; // 분당 처리량으로 변환
        
        convertedThroughputs.push({
          gpuModel: migData.gpuModel,
          nonMigRps: nonMigRps,
          throughput: convertedThroughputPerContainer
        });
      }
      
      if (convertedThroughputs.length > 0) {
        // 가장 큰 값 선택
        const maxThroughput = Math.max(...convertedThroughputs.map(t => t.throughput));
        const selected = convertedThroughputs.find(t => t.throughput === maxThroughput)!;
        
        // 공통 로그: GPU별 LLM 정보 및 계산 과정
        console.log(`[${gpuModel} ${workloadType}] LLM 데이터: nonMigRps=${selected.nonMigRps} (${selected.gpuModel})`);
        console.log(`[${gpuModel} ${workloadType}] 스루풋 계산: ${selected.nonMigRps} RPS/컨테이너 (${selected.gpuModel}) → FP32 비율 ${(targetGPUSpec.fp32 / GPU_DB[selected.gpuModel.toUpperCase()].fp32).toFixed(4)} → ${(selected.nonMigRps * (targetGPUSpec.fp32 / GPU_DB[selected.gpuModel.toUpperCase()].fp32)).toFixed(4)} RPS → ${maxThroughput.toFixed(2)} docs/min`);
        
        return maxThroughput;
      }
    }
    
    return 0;
  }

  // nonMigRps와 migRps는 상위 레벨에서 읽기
  const nonMigRps = matchingData.nonMigRps ?? null;
  const migRps = matchingData.migRps ?? null;

  // nonMigRps는 이미 LLM이 컨테이너 수로 나눈 컨테이너당 RPS 값이므로 그대로 사용
  if (nonMigRps === null || nonMigRps === undefined) {
    return 0;
  }
  
  const throughputPerContainer = nonMigRps * 60; // 컨테이너당 RPS를 분당 처리량으로 변환
  
  // 공통 로그: GPU별 LLM 정보 및 계산 과정
  console.log(`[${gpuModel} ${workloadType}] LLM 데이터: nonMigRps=${nonMigRps}, migRps=${migRps ?? 'N/A'}`);
  console.log(`[${gpuModel} ${workloadType}] 스루풋 계산: ${nonMigRps} RPS/컨테이너 * 60 = ${throughputPerContainer.toFixed(2)} docs/min`);
  
  return throughputPerContainer;
}

function calculateComparison(
  totalVram: number,
  model: string,
  breakdown?: CalculationBreakdown,
  input?: CalculationInput,
  benchmarkData?: ParsedBenchmarkData[]
): GPUComparison {
  const gpu = GPU_DB[model];
  if (!gpu) {
    return { model, count: 0, totalVram: 0, totalCost: 0 };
  }

  let count = 0;
  let calculatedTotalVram = 0;

  if (model === "L40S") {
    // L40S: non-MIG 분당 스루풋으로 VRAM 기준으로 계산
    // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
    console.log(`[calculateComparison L40S] 시작 - totalVram: ${totalVram} GB`);
    
    // L40S의 실제 DP 스루풋 계산 (비교 화면에서 사용)
    if (breakdown && breakdown.dp && breakdown.dp.details && breakdown.dp.details.length > 0 && benchmarkData) {
      const l40sDPThroughput = getNonMIGThroughputPerContainer(
        "L40S",
        "DP",
        null,
        benchmarkData
      );
      console.log(`[calculateComparison L40S] L40S DP 스루풋 계산: ${l40sDPThroughput} docs/min`);
      
      // breakdown의 details를 L40S 기준으로 업데이트
      for (const detail of breakdown.dp.details) {
        if (l40sDPThroughput > 0) {
          const originalThroughput = detail.throughputPerContainer;
          detail.throughputPerContainer = Math.round(l40sDPThroughput * 10) / 10;
          console.log(`[calculateComparison L40S] DP detail 업데이트: ${originalThroughput} → ${detail.throughputPerContainer} docs/min`);
        }
      }
    }
    
    count = Math.ceil(totalVram / (gpu.memory * 0.8));
    calculatedTotalVram = count * gpu.memory;
    console.log(`[calculateComparison L40S] 최종 결과: count=${count}, calculatedTotalVram=${calculatedTotalVram} GB`);
  } else if (isMIGCapableGPU(model)) {
    // MIG-GPU (H100, H200, B100, B200): MIG 분당 스루풋으로 총 필요 컨테이너 수를 구하고, 7로 나눠서 필요 GPU 수를 구함
    if (breakdown && input) {
      let totalContainersNeeded = 0;

      // 각 워크로드별로 MIG 스루풋 기반 컨테이너 수 계산
      // OCR
      if (breakdown.ocr.details && breakdown.ocr.details.length > 0) {
        for (const detail of breakdown.ocr.details) {
          // MIG 스루풋 계산
          const migThroughput = getMIGThroughputPerContainer(
            model,
            "OCR",
            null,
            benchmarkData
          );
          if (migThroughput > 0) {
            const containersNeeded = Math.ceil(detail.requiredThroughput / migThroughput);
            totalContainersNeeded += containersNeeded;
          } else {
            // MIG 데이터가 없으면 기존 컨테이너 수 사용 (폴백)
            totalContainersNeeded += detail.containersNeeded;
          }
        }
      }

      // Information Extraction
      if (breakdown.informationExtraction.details && breakdown.informationExtraction.details.length > 0) {
        for (const detail of breakdown.informationExtraction.details) {
          const migThroughput = getMIGThroughputPerContainer(
            model,
            "InformationExtraction",
            detail.documentType || null,
            benchmarkData
          );
          if (migThroughput > 0) {
            // 버퍼를 위해 0.8배 적용
            const containersNeeded = Math.ceil(detail.requiredThroughput / (migThroughput * 0.8));
            totalContainersNeeded += containersNeeded;
          } else {
            totalContainersNeeded += detail.containersNeeded;
          }
        }
      }

      // Document Classifier
      if (breakdown.documentClassifier.details && breakdown.documentClassifier.details.length > 0) {
        for (const detail of breakdown.documentClassifier.details) {
          const migThroughput = getMIGThroughputPerContainer(
            model,
            "DocumentClassifier",
            null,
            benchmarkData
          );
          if (migThroughput > 0) {
            const containersNeeded = Math.ceil(detail.requiredThroughput / migThroughput);
            totalContainersNeeded += containersNeeded;
          } else {
            totalContainersNeeded += detail.containersNeeded;
          }
        }
      }

      // DP
      if (breakdown.dp.details && breakdown.dp.details.length > 0) {
        for (const detail of breakdown.dp.details) {
          const migThroughput = getMIGThroughputPerContainer(
            model,
            "DP",
            null,
            benchmarkData
          );
          if (migThroughput > 0) {
            const containersNeeded = Math.ceil(detail.requiredThroughput / migThroughput);
            totalContainersNeeded += containersNeeded;
          } else {
            totalContainersNeeded += detail.containersNeeded;
          }
        }
      }

      // LLM
      if (breakdown.llm.details && breakdown.llm.details.length > 0) {
        for (const detail of breakdown.llm.details) {
          // LLM은 사용자 수 = 컨테이너 수
          totalContainersNeeded += detail.containersNeeded;
        }
      }

      // GPU당 최대 7개 컨테이너 제약
      const MAX_CONTAINERS_PER_GPU = 7;
      count = Math.ceil(totalContainersNeeded / MAX_CONTAINERS_PER_GPU);
      
      // 총 VRAM은 GPU 개수 * GPU 메모리로 계산
      calculatedTotalVram = count * gpu.memory;
    } else {
      // breakdown이 없으면 기존 방식 사용 (폴백)
      count = Math.ceil(totalVram / (gpu.memory * 0.8));
      calculatedTotalVram = count * gpu.memory;
    }
  } else {
    // 기타 GPU: VRAM 기준으로 계산
    count = Math.ceil(totalVram / (gpu.memory * 0.8));
    calculatedTotalVram = count * gpu.memory;
  }

  return {
    model,
    count,
    totalVram: calculatedTotalVram,
    totalCost: count * gpu.price,
  };
}

/**
 * 워크로드별 최대 컨테이너당 VRAM을 확인하여 GPU 모델을 결정합니다.
 * 기본은 L40S이고, 컨테이너당 VRAM이 45GB 이상 필요한 워크로드가 있으면 H200을 사용합니다.
 */
function selectBestGPU(
  totalVram: number,
  preference: string,
  breakdown: CalculationBreakdown
): { model: string; count: number; vramNeeded: number } {
  // 사용자가 GPU를 명시적으로 선택한 경우
  if (preference !== "Auto-select") {
    const gpu = GPU_DB[preference];
    if (gpu) {
      let count = 0;
      
      // MIG 가능한 GPU인 경우 컨테이너 수 기반으로 계산
      if (isMIGCapableGPU(preference)) {
        // 모든 워크로드의 총 컨테이너 수 계산
        let totalContainers = 0;
        
        // OCR
        if (breakdown.ocr.details) {
          totalContainers += breakdown.ocr.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
        }
        
        // Information Extraction
        if (breakdown.informationExtraction.details) {
          totalContainers += breakdown.informationExtraction.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
        }
        
        // Document Classifier
        if (breakdown.documentClassifier.details) {
          totalContainers += breakdown.documentClassifier.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
        }
        
        // DP
        if (breakdown.dp.details) {
          totalContainers += breakdown.dp.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
        }
        
        // LLM
        if (breakdown.llm.details) {
          totalContainers += breakdown.llm.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
        }
        
        // GPU당 최대 7개 컨테이너 제약
        const MAX_CONTAINERS_PER_GPU = 7;
        count = Math.ceil(totalContainers / MAX_CONTAINERS_PER_GPU);
      } else {
        // MIG 불가능한 GPU: VRAM 기반 계산
        // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
        count = Math.ceil(totalVram / (gpu.memory * 0.8));
      }
      
      return {
        model: preference,
        count,
        vramNeeded: totalVram,
      };
    }
  }

  // 기본값: L40S
  let selectedModel = "L40S";
  
  // 모든 워크로드의 컨테이너당 VRAM을 확인
  const allVramPerContainer: number[] = [];
  
  // OCR
  if (breakdown.ocr.details) {
    breakdown.ocr.details.forEach(detail => {
      allVramPerContainer.push(detail.vramPerContainer);
    });
  }
  
  // Information Extraction
  if (breakdown.informationExtraction.details) {
    breakdown.informationExtraction.details.forEach(detail => {
      allVramPerContainer.push(detail.vramPerContainer);
    });
  }
  
  // Document Classifier
  if (breakdown.documentClassifier.details) {
    breakdown.documentClassifier.details.forEach(detail => {
      allVramPerContainer.push(detail.vramPerContainer);
    });
  }
  
  // DP
  if (breakdown.dp.details) {
    breakdown.dp.details.forEach(detail => {
      allVramPerContainer.push(detail.vramPerContainer);
    });
  }
  
  // LLM
  if (breakdown.llm.details) {
    breakdown.llm.details.forEach(detail => {
      allVramPerContainer.push(detail.vramPerContainer);
    });
  }
  
  // 컨테이너당 VRAM이 45GB 이상인 워크로드가 있으면 H200 사용
  const maxVramPerContainer = Math.max(...allVramPerContainer, 0);
  if (maxVramPerContainer >= 45) {
    selectedModel = "H200";
  }

  const gpu = GPU_DB[selectedModel];
  // GPU VRAM의 20%는 여유로 남겨두므로 0.8을 곱한 값으로 나눔
  const count = Math.ceil(totalVram / (gpu.memory * 0.8));

  return {
    model: selectedModel,
    count,
    vramNeeded: totalVram,
  };
}

export function calculateHardware(
  input: CalculationInput,
  benchmarkData?: ParsedBenchmarkData[]
): CalculationResult {
  const ocrBreakdown = estimateOCRGpu(input, benchmarkData);
  const infoExtractionBreakdown = estimateInformationExtractionGpu(input, benchmarkData);
  const docClassifierBreakdown = estimateDocumentClassifierGpu(input, benchmarkData);
  const dpBreakdown = estimateDPGpu(input, benchmarkData);
  const llmBreakdown = estimateLLMGpu(input);

  const totalVramRequired =
    ocrBreakdown.vram +
    infoExtractionBreakdown.vram +
    docClassifierBreakdown.vram +
    dpBreakdown.vram +
    llmBreakdown.vram;

  const breakdown: CalculationBreakdown = {
    ocr: ocrBreakdown,
    informationExtraction: infoExtractionBreakdown,
    documentClassifier: docClassifierBreakdown,
    dp: dpBreakdown,
    llm: llmBreakdown,
  };

  const gpuRecommendation = selectBestGPU(
    totalVramRequired,
    input.system.gpuPreference,
    breakdown
  );

  const cpuCores = estimateCpu(input, benchmarkData);
  const memoryGB = estimateMemory(input, benchmarkData);

  // Calculate comparisons for different GPU models
  const comparison = {
    L40S: calculateComparison(totalVramRequired, "L40S", breakdown, input, benchmarkData),
    H100: calculateComparison(totalVramRequired, "H100", breakdown, input, benchmarkData),
    H200: calculateComparison(totalVramRequired, "H200", breakdown, input, benchmarkData),
    B100: calculateComparison(totalVramRequired, "B100", breakdown, input, benchmarkData),
    B200: calculateComparison(totalVramRequired, "B200", breakdown, input, benchmarkData),
  };

  // Calculate server configuration
  const serverConfiguration = calculateServerConfiguration(
    gpuRecommendation.count,
    gpuRecommendation.model,
    cpuCores,
    memoryGB
  );

  return {
    gpuRecommendation,
    cpuRecommendation: {
      cores: cpuCores,
    },
    memoryRecommendation: {
      sizeGB: memoryGB,
    },
    serverConfiguration,
    breakdown,
    comparison,
    totalVramRequired,
    deploymentMode: input.cluster.deploymentMode,
    input, // 재계산을 위해 저장
    benchmarkData, // 재계산을 위해 저장
  };
}

/**
 * RAM 값을 표준값으로 올림합니다.
 * 표준값: 64, 128, 256, 512, 1024, 2048, 4096 GB 등
 */
function roundUpToStandardRAM(gb: number): number {
  const standardValues = [64, 128, 256, 512, 1024, 2048, 4096, 8192];
  
  for (const standard of standardValues) {
    if (gb <= standard) {
      return standard;
    }
  }
  
  // 표준값보다 크면 다음 2의 거듭제곱으로 올림
  return Math.pow(2, Math.ceil(Math.log2(gb)));
}

/**
 * CPU 코어 수를 표준값으로 올림합니다.
 * 표준값: 8, 16, 24, 32, 48, 64, 96, 128, 192, 256 코어 등
 */
function roundUpToStandardCPU(cores: number): number {
  const standardValues = [8, 16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];
  
  for (const standard of standardValues) {
    if (cores <= standard) {
      return standard;
    }
  }
  
  // 표준값보다 크면 8의 배수로 올림
  return Math.ceil(cores / 8) * 8;
}

/**
 * 서버 구성을 계산합니다.
 * GPU 수를 기반으로 서버 대수를 결정하고, 각 서버의 스펙을 계산합니다.
 * RAM은 필요 RAM의 2배 이상으로 설정하고, 표준값으로 올림합니다.
 * CPU 코어도 표준값으로 올림합니다.
 */
export function calculateServerConfiguration(
  totalGpuCount: number,
  gpuModel: string,
  totalCpuCores: number,
  requiredRamGB: number
): import("@/lib/types").ServerConfiguration {
  // 서버 대수 결정: GPU 4개당 1대 (최소 1대)
  // 예: GPU 1-4개 → 1대, 5-8개 → 2대, 9-12개 → 3대
  const totalServers = Math.max(1, Math.ceil(totalGpuCount / 4));
  
  // 각 서버당 GPU 수 계산
  const gpusPerServer = Math.ceil(totalGpuCount / totalServers);
  
  // 각 서버당 CPU 코어 계산 (균등 분배 후 표준값으로 올림)
  const cpuCoresPerServerRaw = Math.ceil(totalCpuCores / totalServers);
  const cpuCoresPerServer = roundUpToStandardCPU(cpuCoresPerServerRaw);
  
  // 각 서버당 RAM 계산: (필요 RAM * 2) / 서버 수를 계산한 후 표준값으로 올림
  const ramPerServerRaw = (requiredRamGB * 2) / totalServers;
  const ramPerServer = roundUpToStandardRAM(ramPerServerRaw);
  
  // 서버 구성 배열 생성
  const servers = Array.from({ length: totalServers }, (_, index) => ({
    serverNumber: index + 1,
    gpuModel,
    gpuCount: index === totalServers - 1 
      ? totalGpuCount - (gpusPerServer * (totalServers - 1)) // 마지막 서버는 나머지 GPU
      : gpusPerServer,
    cpuCores: cpuCoresPerServer,
    ramGB: ramPerServer,
  }));

  return {
    totalServers,
    servers,
  };
}

/**
 * 클라이언트 측에서 기준 GPU 변경 시 breakdown과 GPU 수를 재계산합니다.
 * 새로운 기준 GPU의 스루풋을 기반으로 breakdown을 재계산합니다.
 */
export function recalculateGpuCountForBaseGPU(
  breakdown: CalculationBreakdown,
  totalVramRequired: number,
  newBaseGPU: string,
  benchmarkData?: ParsedBenchmarkData[]
): { 
  count: number; 
  totalVram: number; 
  totalCost: number;
  recalculatedBreakdown?: CalculationBreakdown;
} {
  const gpu = GPU_DB[newBaseGPU];
  if (!gpu) {
    return { count: 0, totalVram: 0, totalCost: 0 };
  }

  let count = 0;
  let totalVram = 0;
  let recalculatedBreakdown: CalculationBreakdown | undefined = undefined;

  if (newBaseGPU === "L40S") {
    // L40S: VRAM 기준으로 계산
    count = Math.ceil(totalVramRequired / (gpu.memory * 0.8));
    totalVram = count * gpu.memory;
  } else if (isMIGCapableGPU(newBaseGPU)) {
    // MIG-GPU: 새로운 기준 GPU의 스루풋을 기반으로 breakdown 재계산
    let totalContainersNeeded = 0;
    
    // breakdown 재계산
    recalculatedBreakdown = {
      ocr: {
        ...breakdown.ocr,
        details: breakdown.ocr.details?.map(detail => {
          const migThroughput = getMIGThroughputPerContainer(
            newBaseGPU,
            "OCR",
            null,
            benchmarkData
          );
          const newThroughputPerContainer = migThroughput > 0 ? migThroughput : detail.throughputPerContainer;
          const newContainersNeeded = newThroughputPerContainer > 0 
            ? Math.ceil(detail.requiredThroughput / newThroughputPerContainer)
            : detail.containersNeeded;
          totalContainersNeeded += newContainersNeeded;
          
          // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
          const newTotalVram = newContainersNeeded * detail.vramPerContainer;
          
          return {
            ...detail,
            throughputPerContainer: newThroughputPerContainer,
            containersNeeded: newContainersNeeded,
            totalVram: newTotalVram,
          };
        }) || [],
      },
      informationExtraction: {
        ...breakdown.informationExtraction,
        details: breakdown.informationExtraction.details?.map(detail => {
          const migThroughput = getMIGThroughputPerContainer(
            newBaseGPU,
            "InformationExtraction",
            detail.documentType || null,
            benchmarkData
          );
          const newThroughputPerContainer = migThroughput > 0 ? migThroughput * 0.8 : detail.throughputPerContainer;
          const newContainersNeeded = newThroughputPerContainer > 0
            ? Math.ceil(detail.requiredThroughput / newThroughputPerContainer)
            : detail.containersNeeded;
          totalContainersNeeded += newContainersNeeded;
          
          // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
          const newTotalVram = newContainersNeeded * detail.vramPerContainer;
          
          return {
            ...detail,
            throughputPerContainer: newThroughputPerContainer,
            containersNeeded: newContainersNeeded,
            totalVram: newTotalVram,
          };
        }) || [],
      },
      documentClassifier: {
        ...breakdown.documentClassifier,
        details: breakdown.documentClassifier.details?.map(detail => {
          const migThroughput = getMIGThroughputPerContainer(
            newBaseGPU,
            "DocumentClassifier",
            null,
            benchmarkData
          );
          const newThroughputPerContainer = migThroughput > 0 ? migThroughput : detail.throughputPerContainer;
          const newContainersNeeded = newThroughputPerContainer > 0
            ? Math.ceil(detail.requiredThroughput / newThroughputPerContainer)
            : detail.containersNeeded;
          totalContainersNeeded += newContainersNeeded;
          
          // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
          const newTotalVram = newContainersNeeded * detail.vramPerContainer;
          
          return {
            ...detail,
            throughputPerContainer: newThroughputPerContainer,
            containersNeeded: newContainersNeeded,
            totalVram: newTotalVram,
          };
        }) || [],
      },
      dp: {
        ...breakdown.dp,
        details: breakdown.dp.details?.map(detail => {
          const migThroughput = getMIGThroughputPerContainer(
            newBaseGPU,
            "DP",
            null,
            benchmarkData
          );
          const newThroughputPerContainer = migThroughput > 0 ? migThroughput : detail.throughputPerContainer;
          const newContainersNeeded = newThroughputPerContainer > 0
            ? Math.ceil(detail.requiredThroughput / newThroughputPerContainer)
            : detail.containersNeeded;
          totalContainersNeeded += newContainersNeeded;
          
          // 총 VRAM은 필요 컨테이너 수 * 컨테이너당 VRAM으로 계산
          const newTotalVram = newContainersNeeded * detail.vramPerContainer;
          
          return {
            ...detail,
            throughputPerContainer: newThroughputPerContainer,
            containersNeeded: newContainersNeeded,
            totalVram: newTotalVram,
          };
        }) || [],
      },
      llm: {
        ...breakdown.llm,
        details: breakdown.llm.details?.map(detail => {
          // LLM은 MIG 스루풋 계산이 없으므로 기존 값 사용
          totalContainersNeeded += detail.containersNeeded;
          return detail;
        }) || [],
      },
    };
    
    // GPU당 최대 7개 컨테이너 제약
    const MAX_CONTAINERS_PER_GPU = 7;
    count = Math.ceil(totalContainersNeeded / MAX_CONTAINERS_PER_GPU);
    
    // 총 VRAM은 recalculatedBreakdown의 모든 detail의 totalVram 합계로 계산
    if (recalculatedBreakdown) {
      totalVram = 0;
      if (recalculatedBreakdown.ocr.details) {
        totalVram += recalculatedBreakdown.ocr.details.reduce((sum, detail) => sum + detail.totalVram, 0);
      }
      if (recalculatedBreakdown.informationExtraction.details) {
        totalVram += recalculatedBreakdown.informationExtraction.details.reduce((sum, detail) => sum + detail.totalVram, 0);
      }
      if (recalculatedBreakdown.documentClassifier.details) {
        totalVram += recalculatedBreakdown.documentClassifier.details.reduce((sum, detail) => sum + detail.totalVram, 0);
      }
      if (recalculatedBreakdown.dp.details) {
        totalVram += recalculatedBreakdown.dp.details.reduce((sum, detail) => sum + detail.totalVram, 0);
      }
      if (recalculatedBreakdown.llm.details) {
        totalVram += recalculatedBreakdown.llm.details.reduce((sum, detail) => sum + detail.totalVram, 0);
      }
    } else {
      // recalculatedBreakdown이 없으면 원래 totalVramRequired 사용
      totalVram = totalVramRequired;
    }
  } else {
    // 기타 GPU: VRAM 기준으로 계산
    count = Math.ceil(totalVramRequired / (gpu.memory * 0.8));
    totalVram = count * gpu.memory;
  }

  return {
    count,
    totalVram,
    totalCost: count * gpu.price,
    recalculatedBreakdown,
  };
}

/**
 * 기준 GPU 변경 시 전체 결과를 재계산합니다.
 * breakdown을 새로운 기준 GPU의 스루풋을 기반으로 재계산합니다.
 */
export function recalculateForBaseGPU(
  baseResult: CalculationResult,
  newBaseGPU: string,
  input: CalculationInput,
  benchmarkData?: ParsedBenchmarkData[]
): CalculationResult {
  const { totalVramRequired, cpuRecommendation, memoryRecommendation, deploymentMode } = baseResult;
  
  // 새로운 기준 GPU로 breakdown 재계산
  const newInput = { ...input, system: { ...input.system, gpuPreference: newBaseGPU as any } };
  const newBreakdown: CalculationBreakdown = {
    ocr: estimateOCRGpu(newInput, benchmarkData),
    informationExtraction: estimateInformationExtractionGpu(newInput, benchmarkData),
    documentClassifier: estimateDocumentClassifierGpu(newInput, benchmarkData),
    dp: estimateDPGpu(newInput, benchmarkData),
    llm: estimateLLMGpu(newInput),
  };
  
  // 새로운 breakdown의 총 VRAM 계산
  const newTotalVramRequired =
    newBreakdown.ocr.vram +
    newBreakdown.informationExtraction.vram +
    newBreakdown.documentClassifier.vram +
    newBreakdown.dp.vram +
    newBreakdown.llm.vram;
  
  // 새로운 기준 GPU에 따라 GPU 수 계산
  let newGpuCount = 0;
  
  if (newBaseGPU === "L40S") {
    // L40S: VRAM 기준으로 계산
    const gpu = GPU_DB[newBaseGPU];
    newGpuCount = Math.ceil(newTotalVramRequired / (gpu.memory * 0.8));
  } else if (isMIGCapableGPU(newBaseGPU)) {
    // MIG-GPU: 컨테이너 수 기준으로 계산
    let totalContainersNeeded = 0;
    
    // 재계산된 breakdown에서 컨테이너 수 합산
    if (newBreakdown.ocr.details) {
      totalContainersNeeded += newBreakdown.ocr.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
    }
    if (newBreakdown.informationExtraction.details) {
      totalContainersNeeded += newBreakdown.informationExtraction.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
    }
    if (newBreakdown.documentClassifier.details) {
      totalContainersNeeded += newBreakdown.documentClassifier.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
    }
    if (newBreakdown.dp.details) {
      totalContainersNeeded += newBreakdown.dp.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
    }
    if (newBreakdown.llm.details) {
      totalContainersNeeded += newBreakdown.llm.details.reduce((sum, detail) => sum + detail.containersNeeded, 0);
    }
    
    // GPU당 최대 7개 컨테이너 제약
    const MAX_CONTAINERS_PER_GPU = 7;
    newGpuCount = Math.ceil(totalContainersNeeded / MAX_CONTAINERS_PER_GPU);
  } else {
    // 기타 GPU: VRAM 기준으로 계산
    const gpu = GPU_DB[newBaseGPU];
    if (gpu) {
      newGpuCount = Math.ceil(newTotalVramRequired / (gpu.memory * 0.8));
    }
  }
  
  // 서버 구성 재계산
  const newServerConfiguration = calculateServerConfiguration(
    newGpuCount,
    newBaseGPU,
    cpuRecommendation.cores,
    memoryRecommendation.sizeGB
  );
  
  // Comparison은 항상 L40S 기준 breakdown으로 계산 (기준 GPU 변경과 무관)
  // GPU 모델 비교 그래프는 기준 GPU 변경에 따라 변하지 않아야 하므로,
  // 원본 breakdown과 원본 totalVramRequired를 사용합니다
  const originalBreakdown = baseResult.breakdown;
  const originalTotalVramRequired = baseResult.totalVramRequired;
  const newComparison = {
    L40S: calculateComparison(originalTotalVramRequired, "L40S", originalBreakdown, input, benchmarkData),
    H100: calculateComparison(originalTotalVramRequired, "H100", originalBreakdown, input, benchmarkData),
    H200: calculateComparison(originalTotalVramRequired, "H200", originalBreakdown, input, benchmarkData),
    B100: calculateComparison(originalTotalVramRequired, "B100", originalBreakdown, input, benchmarkData),
    B200: calculateComparison(originalTotalVramRequired, "B200", originalBreakdown, input, benchmarkData),
  };
  
  return {
    gpuRecommendation: {
      model: newBaseGPU,
      count: newGpuCount,
      vramNeeded: newTotalVramRequired,
    },
    cpuRecommendation,
    memoryRecommendation,
    serverConfiguration: newServerConfiguration,
    breakdown: newBreakdown, // 재계산된 breakdown 사용
    comparison: newComparison,
    totalVramRequired: newTotalVramRequired, // 새로운 breakdown의 VRAM 합계 사용
    deploymentMode,
    input: baseResult.input, // 재계산을 위해 보존
    benchmarkData: baseResult.benchmarkData, // 재계산을 위해 보존
    technicalExplanation: baseResult.technicalExplanation, // 기술적 설명 보존
  };
}


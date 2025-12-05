/**
 * 부하테스트 결과 데이터 처리 및 성능 데이터베이스 업데이트
 */

import { parseBenchmarkResults } from "./solarLLMService";
import { DOCUMENT_PERFORMANCE } from "@/lib/constants/documentTypes";
import { DP_PROFILES } from "@/lib/constants/dpProfiles";
import { DOCUMENT_CLASSIFIER_PROFILES } from "@/lib/constants/documentClassifierProfiles";
import { OCR_PROFILES } from "@/lib/constants/ocrProfiles";

export interface ParsedBenchmarkData {
  gpuModel: string;
  workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction";
  documentType?: string | null; // OCR인 경우 문서 타입
  nonMigRps?: number | null; // GPU별 nonMigRps (여러 컨테이너 데이터 분석 결과, 컨테이너당 RPS)
  migRps?: number | null; // GPU별 migRps (컨테이너 1개일 때의 값)
}

/**
 * 부하테스트 결과를 파싱하여 성능 데이터베이스에 반영
 */
/**
 * 중복 데이터를 감지하고 모든 컨테이너 수의 데이터를 합치는 함수
 * 여러 부하테스트 파일에서 같은 GPU/워크로드 조합의 데이터가 있을 때,
 * 모든 컨테이너 수의 데이터를 합쳐서 완전한 데이터셋을 만듭니다.
 */
async function resolveDuplicateBenchmarkData(
  duplicates: ParsedBenchmarkData[]
): Promise<ParsedBenchmarkData> {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  console.log(`\n=== 중복 데이터 감지: ${duplicates.length}개 발견 ===`);
  console.log(`GPU: ${duplicates[0].gpuModel}, 워크로드: ${duplicates[0].workloadType}, 문서 타입: ${duplicates[0].documentType || "N/A"}`);

  // GPU별 nonMigRps와 migRps 병합 (상위 레벨)
  let mergedNonMigRps: number | null | undefined = undefined;
  let mergedMigRps: number | null | undefined = undefined;
  
  for (const data of duplicates) {
    // nonMigRps 병합: null이 아닌 값 우선
    if (data.nonMigRps !== undefined && data.nonMigRps !== null) {
      if (mergedNonMigRps === undefined || mergedNonMigRps === null) {
        mergedNonMigRps = data.nonMigRps;
      }
    } else if (mergedNonMigRps === undefined && data.nonMigRps !== undefined) {
      mergedNonMigRps = data.nonMigRps;
        }
    
        
    // migRps 병합: null이 아닌 값 우선
    if (data.migRps !== undefined && data.migRps !== null) {
      if (mergedMigRps === undefined || mergedMigRps === null) {
        mergedMigRps = data.migRps;
      }
    } else if (mergedMigRps === undefined && data.migRps !== undefined) {
      mergedMigRps = data.migRps;
    }
  }
  
  console.log(`  GPU별 nonMigRps: ${mergedNonMigRps ?? 'N/A'}, migRps: ${mergedMigRps ?? 'N/A'}`);
  
  // 첫 번째 데이터의 메타데이터 사용
  return {
    gpuModel: duplicates[0].gpuModel,
    workloadType: duplicates[0].workloadType,
    documentType: duplicates[0].documentType,
    ...(mergedNonMigRps !== undefined && { nonMigRps: mergedNonMigRps }),
    ...(mergedMigRps !== undefined && { migRps: mergedMigRps }),
  };
}

export async function processBenchmarkData(
  benchmarkTexts: string[]
): Promise<ParsedBenchmarkData[]> {
  const parsedData: ParsedBenchmarkData[] = [];
  const dataMap = new Map<string, ParsedBenchmarkData[]>(); // 키: "gpuModel|workloadType|documentType"

  for (const text of benchmarkTexts) {
    if (!text.trim()) continue;

    try {
      const parsedArray = await parseBenchmarkResults(text);
      
      // parseBenchmarkResults는 이제 배열을 반환
      for (const parsed of parsedArray) {
        // 중복 체크를 위한 키 생성
        const key = `${parsed.gpuModel.toUpperCase()}|${parsed.workloadType}|${parsed.documentType || "null"}`;
        
        // 임시로 처리된 데이터 저장 (나중에 중복 해결)
        const tempProcessed: ParsedBenchmarkData = {
          gpuModel: parsed.gpuModel,
          workloadType: parsed.workloadType as ParsedBenchmarkData["workloadType"],
          documentType: parsed.documentType || null,
          ...(parsed.nonMigRps !== undefined && { nonMigRps: parsed.nonMigRps }),
          ...(parsed.migRps !== undefined && { migRps: parsed.migRps }),
        };
        
        if (!dataMap.has(key)) {
          dataMap.set(key, []);
        }
        const existingData = dataMap.get(key)!;
        existingData.push(tempProcessed);
        console.log(`데이터 추가: 키=${key}, nonMigRps=${tempProcessed.nonMigRps ?? 'N/A'}, migRps=${tempProcessed.migRps ?? 'N/A'}, 총 중복 개수=${existingData.length}`);
      }
    } catch (error) {
      console.error("부하테스트 데이터 파싱 오류:", error);
    }
  }

  // 각 키별로 데이터 처리 및 중복 해결
  const entriesArray = Array.from(dataMap.entries());
  for (const [key, duplicates] of entriesArray) {
    const [gpuModel, workloadType, documentType] = key.split("|");
    
    console.log(`\n=== 부하테스트 데이터 처리 ===`);
    console.log(`GPU: ${gpuModel}, 워크로드: ${workloadType}, 문서 타입: ${documentType === "null" ? "N/A" : documentType}`);
    console.log(`중복 데이터 개수: ${duplicates.length}`);
    
    // 각 중복 데이터의 nonMigRps와 migRps 출력
    duplicates.forEach((dup, idx) => {
      console.log(`  중복 ${idx + 1}: nonMigRps=${dup.nonMigRps ?? 'N/A'}, migRps=${dup.migRps ?? 'N/A'}`);
    });
    
    // 중복이 있으면 병합, 없으면 그대로 처리
    const selectedData = duplicates.length > 1 
      ? await resolveDuplicateBenchmarkData(duplicates)
      : duplicates[0];
    
    // GPU별 nonMigRps와 migRps 확인 (상위 레벨)
    console.log(`  GPU별 nonMigRps: ${selectedData.nonMigRps ?? 'N/A'}, migRps: ${selectedData.migRps ?? 'N/A'}`);
        
    // MIG GPU용: migRps 확인
    if (selectedData.migRps !== null && selectedData.migRps !== undefined) {
            console.log(`MIG GPU용 (컨테이너 1개):`, {
        migRps: selectedData.migRps,
        throughput: selectedData.migRps * 60,
        migThroughput: selectedData.migRps * 60 * 0.65 // MIG는 0.65 적용
            });
        }

    // 처리된 데이터 생성
        const processedData: ParsedBenchmarkData = {
          gpuModel: selectedData.gpuModel,
          workloadType: selectedData.workloadType as ParsedBenchmarkData["workloadType"],
          documentType: selectedData.documentType || null,
      ...(selectedData.nonMigRps !== undefined && { nonMigRps: selectedData.nonMigRps }),
      ...(selectedData.migRps !== undefined && { migRps: selectedData.migRps }),
    };
        
        console.log(`처리된 데이터:`, JSON.stringify(processedData, null, 2));
        console.log("=== 부하테스트 데이터 처리 완료 ===\n");
        
        parsedData.push(processedData);
  }

  return parsedData;
}

/**
 * 파싱된 부하테스트 데이터를 성능 프로필에 반영
 */
export function applyBenchmarkDataToProfiles(
  benchmarkData: ParsedBenchmarkData[]
): void {
  for (const data of benchmarkData) {
    if (data.workloadType === "DP") {
      // DP 프로필 업데이트
      const gpuModel = data.gpuModel.toUpperCase();
      const nonMigRps = data.nonMigRps ?? 0;
      const throughputPerContainer = nonMigRps * 60; // RPS를 분당 처리량으로 변환
      
      // 실제로는 런타임에 업데이트할 수 없으므로, 계산 시 사용
      // 여기서는 로그만 출력
      console.log(`DP 성능 업데이트: ${gpuModel} - nonMigRps: ${nonMigRps}, 컨테이너당 ${throughputPerContainer.toFixed(2)} docs/min`);
    } else if (data.workloadType === "DocumentClassifier") {
      // 문서분류기 프로필 업데이트
      const nonMigRps = data.nonMigRps ?? 0;
      const throughputPerContainer = nonMigRps * 60;
      console.log(`문서분류기 성능 업데이트: ${data.gpuModel} - nonMigRps: ${nonMigRps}, 컨테이너당 ${throughputPerContainer.toFixed(2)} docs/min`);
    }
    // OCR과 정보추출은 문서 타입별로 관리되므로 별도 처리 필요
  }
}

/**
 * 부하테스트 데이터를 기반으로 성능 프로필 계산
 */
export function getPerformanceFromBenchmark(
  gpuModel: string,
  workloadType: string,
  benchmarkData: ParsedBenchmarkData[]
): {
  throughputPerContainer: number;
  nonMigRps: number | null;
  migRps: number | null;
} | null {
  const matchingData = benchmarkData.find(
    (data) =>
      data.gpuModel.toUpperCase() === gpuModel.toUpperCase() &&
      data.workloadType === workloadType
  );

  if (!matchingData) {
    return null;
  }

  const nonMigRps = matchingData.nonMigRps ?? null;
  const migRps = matchingData.migRps ?? null;
  const throughputPerContainer = nonMigRps ? nonMigRps * 60 : 0; // RPS를 분당 처리량으로 변환

  return {
    throughputPerContainer,
    nonMigRps,
    migRps,
  };
}


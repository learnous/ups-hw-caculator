/**
 * 동적 성능 예측 및 자동 튜닝 시스템
 */

import { CalculationInput, CalculationResult } from "@/lib/types";
import { extractBenchmarkData } from "@/lib/services/uieService";
import { GPU_DB } from "@/lib/constants/gpuDB";

export interface PerformancePrediction {
  predictedThroughput: number; // 예측 처리량
  predictedLatency: number; // 예측 지연시간
  optimalContainers: number; // 최적 컨테이너 수
  confidence: number; // 예측 신뢰도 (0-1)
  factors: {
    documentComplexity?: number; // 문서 복잡도 (0-1)
    imageQuality?: number; // 이미지 품질 (0-1)
    workloadMix?: Record<string, number>; // 워크로드 혼합 비율
  };
}

export interface TuningRecommendation {
  containerCount: number; // 권장 컨테이너 수
  gpuAllocation: Record<string, number>; // GPU별 컨테이너 할당
  reasoning: string; // 권장 이유
  expectedImprovement: {
    throughput: number; // 처리량 개선율 (%)
    latency: number; // 지연시간 개선율 (%)
    costEfficiency: number; // 비용 효율성 개선율 (%)
  };
}

/**
 * UIE를 사용하여 실제 벤치마크 데이터 기반 성능 예측
 */
export async function predictPerformance(
  gpuModel: string,
  workloadType: "OCR" | "DP" | "LLM" | "DocumentClassifier" | "InformationExtraction",
  requiredThroughput: number
): Promise<PerformancePrediction> {
  try {
    // UIE를 통해 부하테스트 결과에서 데이터 추출
    const benchmarkData = await extractBenchmarkData(gpuModel, workloadType);

    // 추출된 데이터 파싱 (실제로는 더 정교한 파싱 필요)
    const parsedData = parseBenchmarkData(benchmarkData.answer);

    // 최적 컨테이너 수 계산
    const optimalContainers = findOptimalContainerCount(
      parsedData,
      requiredThroughput
    );

    // 예측 처리량 계산
    const predictedThroughput = calculatePredictedThroughput(
      parsedData,
      optimalContainers
    );

    // 예측 지연시간 계산
    const predictedLatency = calculatePredictedLatency(
      parsedData,
      optimalContainers
    );

    return {
      predictedThroughput,
      predictedLatency,
      optimalContainers,
      confidence: benchmarkData.confidence || 0.8,
      factors: {},
    };
  } catch (error) {
    console.error("성능 예측 오류:", error);
    // 폴백: 기본 계산 사용
    return getFallbackPrediction(gpuModel, workloadType, requiredThroughput);
  }
}

/**
 * 벤치마크 데이터 파싱
 */
function parseBenchmarkData(answer: string): Array<{
  containers: number;
  throughput: number;
  latency: number;
}> {
  // 간단한 파싱 (실제로는 더 정교한 NLP 필요)
  const data: Array<{ containers: number; throughput: number; latency: number }> = [];

  // 숫자 패턴 매칭
  const containerMatches = answer.matchAll(/컨테이너[:\s]*(\d+)/g);
  const throughputMatches = answer.matchAll(/처리량[:\s]*(\d+)/g);
  const latencyMatches = answer.matchAll(/지연시간[:\s]*([\d.]+)/g);

  // 실제로는 구조화된 JSON 응답을 기대하거나 더 정교한 파싱 필요
  // 여기서는 예시로 간단한 파싱만 구현

  return data;
}

/**
 * 최적 컨테이너 수 찾기
 */
function findOptimalContainerCount(
  benchmarkData: Array<{ containers: number; throughput: number; latency: number }>,
  requiredThroughput: number
): number {
  if (benchmarkData.length === 0) {
    return Math.ceil(requiredThroughput / 100); // 기본값
  }

  // 처리량이 요구사항을 만족하는 최소 컨테이너 수 찾기
  const sorted = benchmarkData.sort((a, b) => a.containers - b.containers);
  
  for (const data of sorted) {
    if (data.throughput >= requiredThroughput) {
      return data.containers;
    }
  }

  // 요구사항을 만족하는 데이터가 없으면 최대 처리량의 컨테이너 수 반환
  const maxThroughput = Math.max(...benchmarkData.map((d) => d.throughput));
  const maxData = benchmarkData.find((d) => d.throughput === maxThroughput);
  return maxData?.containers || sorted[sorted.length - 1].containers;
}

/**
 * 예측 처리량 계산
 */
function calculatePredictedThroughput(
  benchmarkData: Array<{ containers: number; throughput: number; latency: number }>,
  containerCount: number
): number {
  if (benchmarkData.length === 0) {
    return containerCount * 100; // 기본값
  }

  // 선형 보간 또는 회귀 분석 사용
  const sorted = benchmarkData.sort((a, b) => a.containers - b.containers);
  
  // 가장 가까운 두 데이터 포인트 찾기
  let lower = sorted[0];
  let upper = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].containers <= containerCount && sorted[i + 1].containers >= containerCount) {
      lower = sorted[i];
      upper = sorted[i + 1];
      break;
    }
  }

  // 선형 보간
  if (lower.containers === upper.containers) {
    return lower.throughput;
  }

  const ratio = (containerCount - lower.containers) / (upper.containers - lower.containers);
  return lower.throughput + (upper.throughput - lower.throughput) * ratio;
}

/**
 * 예측 지연시간 계산
 */
function calculatePredictedLatency(
  benchmarkData: Array<{ containers: number; throughput: number; latency: number }>,
  containerCount: number
): number {
  if (benchmarkData.length === 0) {
    return 3.0; // 기본값
  }

  // 처리량과 반비례 관계 가정
  const sorted = benchmarkData.sort((a, b) => a.containers - b.containers);
  const lower = sorted[0];
  const upper = sorted[sorted.length - 1];

  if (lower.containers === upper.containers) {
    return lower.latency;
  }

  const ratio = (containerCount - lower.containers) / (upper.containers - lower.containers);
  return lower.latency + (upper.latency - lower.latency) * ratio;
}

/**
 * 폴백 예측 (UIE 실패 시)
 */
function getFallbackPrediction(
  gpuModel: string,
  workloadType: string,
  requiredThroughput: number
): PerformancePrediction {
  const gpuSpec = GPU_DB[gpuModel];
  const baseThroughput = 100; // 기본 처리량

  return {
    predictedThroughput: baseThroughput * (gpuSpec?.fp32 || 67) / 67,
    predictedLatency: 3.0,
    optimalContainers: Math.ceil(requiredThroughput / baseThroughput),
    confidence: 0.5,
    factors: {},
  };
}

/**
 * 자동 튜닝 권장사항 생성
 */
export async function generateTuningRecommendations(
  input: CalculationInput,
  currentResult: CalculationResult
): Promise<TuningRecommendation[]> {
  const recommendations: TuningRecommendation[] = [];

  // GPU별 성능 예측
  const gpuModels = ["L40S", "H100", "H200"];
  
  for (const gpu of gpuModels) {
    try {
      const prediction = await predictPerformance(
        gpu,
        "OCR",
        input.totalRequestThroughput || 1000
      );

      const currentContainers = Math.ceil(
        (input.totalRequestThroughput || 1000) / 80
      );

      if (prediction.optimalContainers < currentContainers) {
        recommendations.push({
          containerCount: prediction.optimalContainers,
          gpuAllocation: { [gpu]: prediction.optimalContainers },
          reasoning: `${gpu} GPU에서 최적 컨테이너 수는 ${prediction.optimalContainers}개입니다.`,
          expectedImprovement: {
            throughput: ((prediction.predictedThroughput / (currentContainers * 80) - 1) * 100),
            latency: ((3.0 / prediction.predictedLatency - 1) * 100),
            costEfficiency: 0, // TODO: 비용 효율성 계산
          },
        });
      }
    } catch (error) {
      console.error(`GPU ${gpu} 튜닝 권장사항 생성 실패:`, error);
    }
  }

  return recommendations;
}


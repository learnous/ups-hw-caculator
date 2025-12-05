/**
 * 비용 최적화 엔진
 */

import { CalculationInput, CalculationResult } from "@/lib/types";
import { GPU_DB } from "@/lib/constants/gpuDB";
import { calculateHardware } from "@/lib/calculators/hardwareCalculator";

export interface CostOptimizationResult {
  recommended: CalculationResult;
  alternatives: Array<{
    config: Partial<CalculationInput>;
    result: CalculationResult;
    costSavings: number;
    tradeoffs: string[];
  }>;
  optimizationStrategies: string[];
}

/**
 * 비용 최적화 제안 생성
 */
export function optimizeCost(
  input: CalculationInput,
  constraints?: {
    maxBudget?: number;
    minThroughput?: number;
    maxLatency?: number;
  }
): CostOptimizationResult {
  const baseResult = calculateHardware(input);
  const alternatives: CostOptimizationResult["alternatives"] = [];
  const strategies: string[] = [];

  // 전략 1: GPU 모델 변경
  const gpuAlternatives = ["L40S", "H100", "H200", "B100", "B200"];
  for (const gpu of gpuAlternatives) {
    if (gpu === input.system.gpuPreference) continue;

    const altInput: CalculationInput = {
      ...input,
      system: {
        ...input.system,
        gpuPreference: gpu as any,
      },
    };

    const altResult = calculateHardware(altInput);
    const costSavings = baseResult.breakdown.ocr.cost - altResult.breakdown.ocr.cost;

    if (costSavings > 0) {
      alternatives.push({
        config: { system: altInput.system },
        result: altResult,
        costSavings,
        tradeoffs: [
          `GPU 모델을 ${gpu}로 변경하여 비용 절감`,
          `처리량: ${altResult.totalVramRequired}GB VRAM 필요`,
        ],
      });
    }
  }

  // 전략 2: MIG 사용 (Kubernetes인 경우)
  if (input.cluster.deploymentMode !== "Kubernetes (MIG-enabled)") {
    const migInput: CalculationInput = {
      ...input,
      cluster: {
        deploymentMode: "Kubernetes (MIG-enabled)",
        migProfile: "1g",
      },
    };

    const migResult = calculateHardware(migInput);
    const costSavings = baseResult.breakdown.ocr.cost - migResult.breakdown.ocr.cost;

    if (costSavings > 0) {
      alternatives.push({
        config: { cluster: migInput.cluster },
        result: migResult,
        costSavings,
        tradeoffs: [
          "MIG를 사용하여 리소스 효율성 향상",
          "관리 복잡도 증가",
        ],
      });
      strategies.push("MIG를 활용하면 GPU 리소스를 더 효율적으로 사용할 수 있습니다.");
    }
  }

  // 전략 3: 운영 시간 조정
  if (input.system.targetDailyHours === 24) {
    strategies.push(
      "운영 시간을 12시간으로 줄이면 GPU 인스턴스를 절반으로 줄일 수 있습니다."
    );
  }

  // 전략 4: HA 레벨 조정
  if (input.system.redundancyLevel === "N+1") {
    strategies.push(
      "HA 레벨을 Active-Standby로 낮추면 추가 GPU 비용을 절감할 수 있습니다."
    );
  }

  // 예산 제약 확인
  if (constraints?.maxBudget) {
    const totalCost =
      baseResult.breakdown.ocr.cost +
      baseResult.breakdown.informationExtraction.cost +
      baseResult.breakdown.documentClassifier.cost +
      baseResult.breakdown.dp.cost +
      baseResult.breakdown.llm.cost;

    if (totalCost > constraints.maxBudget) {
      strategies.push(
        `현재 구성의 예상 비용($${totalCost.toLocaleString()})이 예산($${constraints.maxBudget.toLocaleString()})을 초과합니다. 더 저렴한 GPU 모델을 고려하거나 워크로드를 조정하세요.`
      );
    }
  }

  // 비용 효율성 순으로 정렬
  alternatives.sort((a, b) => b.costSavings - a.costSavings);

  return {
    recommended: baseResult,
    alternatives: alternatives.slice(0, 3), // 상위 3개만 반환
    optimizationStrategies: strategies,
  };
}

/**
 * 비용 절감 제안 생성
 */
export function generateCostSavingsSuggestions(
  input: CalculationInput,
  currentCost: number
): string[] {
  const suggestions: string[] = [];

  // GPU 선호도가 Auto-select가 아닌 경우
  if (input.system.gpuPreference !== "Auto-select") {
    suggestions.push(
      "GPU 선호도를 'Auto-select'로 변경하면 더 비용 효율적인 구성을 찾을 수 있습니다."
    );
  }

  // 24시간 운영인 경우
  if (input.system.targetDailyHours === 24) {
    suggestions.push(
      "운영 시간을 줄이면 GPU 인스턴스 수를 줄여 비용을 절감할 수 있습니다."
    );
  }

  // MIG를 사용하지 않는 경우
  if (input.cluster.deploymentMode !== "Kubernetes (MIG-enabled)") {
    suggestions.push(
      "Kubernetes MIG 모드를 사용하면 GPU 리소스를 더 효율적으로 활용할 수 있습니다."
    );
  }

  return suggestions;
}


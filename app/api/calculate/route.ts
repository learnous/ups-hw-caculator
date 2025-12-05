import { NextRequest, NextResponse } from "next/server";
import { calculateHardware } from "@/lib/calculators/hardwareCalculator";
import { CalculationInput } from "@/lib/types";
import { generateTechnicalExplanation } from "@/lib/services/solarLLMService";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const calculationInput: CalculationInput = body.input || body;
    const benchmarkData = body.benchmarkData || null; // 이미 분석된 부하테스트 데이터
    
    // Validate input - OCR, DP, LLM 중 적어도 하나는 있어야 함
    const hasOCR = calculationInput.ocr && Array.isArray(calculationInput.ocr) && calculationInput.ocr.length > 0;
    const hasDP = calculationInput.dp && calculationInput.dp.requiredThroughput > 0;
    const hasLLM = calculationInput.llm && calculationInput.llm.simultaneousUsers > 0;
    
    if (!hasOCR && !hasDP && !hasLLM) {
      return NextResponse.json(
        { error: "At least one workload (OCR, DP, or LLM) is required" },
        { status: 400 }
      );
    }

    if (!calculationInput.cluster || !calculationInput.system) {
      return NextResponse.json(
        { error: "Missing required fields: cluster and system configuration are required" },
        { status: 400 }
      );
    }

    // 이미 분석된 benchmarkData만 사용 (onSubmit에서는 분석하지 않음)
    // 분석은 "부하테스트 결과 분석" 버튼 클릭 또는 "개발자가 제공한 문서 사용" 체크 시에만 수행
    const finalBenchmarkData = benchmarkData;
    if (finalBenchmarkData) {
      console.log(`이미 분석된 부하테스트 데이터 사용: ${finalBenchmarkData.length}개`);
    } else {
      console.log("부하테스트 데이터 없음 - 벤치마크 데이터 없이 계산 진행");
    }

    const result = calculateHardware(calculationInput, finalBenchmarkData || undefined);

    // LLM으로 기술적 설명 생성
    let technicalExplanation: string | null = null;
    try {
      technicalExplanation = await generateTechnicalExplanation(result, finalBenchmarkData);
    } catch (error) {
      console.error("기술적 설명 생성 오류:", error);
      // LLM 실패해도 기본 결과는 반환
    }

    return NextResponse.json({
      ...result,
      technicalExplanation,
      input: calculationInput, // 재계산을 위해 저장
      benchmarkData: finalBenchmarkData || null, // 재계산을 위해 저장
    });
  } catch (error) {
    console.error("Calculation error:", error);
    return NextResponse.json(
      { error: "Failed to calculate hardware requirements" },
      { status: 500 }
    );
  }
}

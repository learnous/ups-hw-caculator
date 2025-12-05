import { NextRequest, NextResponse } from "next/server";
import {
  updateConversationState,
  convertToCalculationInput,
  ConversationState,
} from "@/lib/ai/naturalLanguageProcessor";
import { calculateHardware } from "@/lib/calculators/hardwareCalculator";
import { optimizeCost } from "@/lib/ai/costOptimizer";
import { generateTuningRecommendations } from "@/lib/ai/performancePredictor";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, conversationState } = body;

    if (!message) {
      return NextResponse.json(
        { error: "메시지가 필요합니다." },
        { status: 400 }
      );
    }

    // 대화 상태 업데이트
    const currentState: ConversationState = conversationState || {
      messages: [],
      extractedInfo: {},
      missingFields: [],
    };

    const updatedState = updateConversationState(currentState, message);

    // 모든 정보가 수집되었는지 확인
    const calculationInput = convertToCalculationInput(updatedState.extractedInfo);

    if (calculationInput) {
      // 하드웨어 계산
      const result = calculateHardware(calculationInput);

      // 비용 최적화
      const costOptimization = optimizeCost(calculationInput);

      // 성능 튜닝 권장사항
      const tuningRecommendations = await generateTuningRecommendations(
        calculationInput,
        result
      );

      return NextResponse.json({
        type: "complete",
        conversationState: updatedState,
        calculationResult: result,
        costOptimization,
        tuningRecommendations,
      });
    } else {
      // 추가 정보 필요
      return NextResponse.json({
        type: "question",
        conversationState: updatedState,
        followUpQuestion: updatedState.messages[updatedState.messages.length - 1]?.content,
      });
    }
  } catch (error) {
    console.error("AI 쿼리 처리 오류:", error);
    return NextResponse.json(
      { error: "쿼리 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


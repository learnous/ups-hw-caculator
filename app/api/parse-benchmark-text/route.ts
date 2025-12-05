import { NextRequest, NextResponse } from "next/server";
import { parseBenchmarkResults } from "@/lib/services/solarLLMService";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { texts } = body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json(
        { error: "텍스트가 제공되지 않았습니다." },
        { status: 400 }
      );
    }

    // 각 텍스트를 LLM으로 파싱하여 구조화된 데이터 추출
    const structuredData = [];
    for (const text of texts) {
      if (text.trim()) {
        try {
          const parsed = await parseBenchmarkResults(text);
          structuredData.push(parsed);
        } catch (error) {
          console.error("부하테스트 결과 파싱 오류:", error);
          // 파싱 실패해도 계속 진행
        }
      }
    }

    return NextResponse.json({
      structuredData,
    });
  } catch (error) {
    console.error("부하테스트 텍스트 파싱 오류:", error);
    return NextResponse.json(
      { error: "부하테스트 결과 파싱 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


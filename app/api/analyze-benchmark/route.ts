import { NextRequest, NextResponse } from "next/server";
import { processBenchmarkData } from "@/lib/services/benchmarkDataProcessor";

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

    // processBenchmarkData를 호출하여 파싱 및 병합 처리
    const structuredData = await processBenchmarkData(texts);
    console.log(`병합된 부하테스트 데이터: ${structuredData?.length || 0}개`);

    return NextResponse.json({
      structuredData,
    });
  } catch (error) {
    console.error("부하테스트 분석 오류:", error);
    return NextResponse.json(
      { error: "부하테스트 결과 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


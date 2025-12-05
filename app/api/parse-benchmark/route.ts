import { NextRequest, NextResponse } from "next/server";
import { parseMultipleDocuments } from "@/lib/services/documentParseService";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "파일이 제공되지 않았습니다." },
        { status: 400 }
      );
    }

    // Document Parse API로 이미지를 텍스트로 변환만 수행
    // 모델: document-parse-nightly, OCR 강제 실행, 텍스트 형식으로 출력
    const parsedResults = await parseMultipleDocuments(files, {
      model: "document-parse-nightly",
      ocr: "force",
      coordinates: false,
      outputFormat: "text",
    });
    
    // 텍스트 추출 및 검증
    const parsedTexts = parsedResults
      .map((result) => {
        // result.text가 문자열인지 확인
        if (typeof result.text === "string") {
          return result.text;
        }
        // result.text가 없으면 다른 필드 확인
        if (result.markdown && typeof result.markdown === "string") {
          return result.markdown;
        }
        if (result.html && typeof result.html === "string") {
          return result.html;
        }
        return "";
      })
      .filter((text) => text && typeof text === "string");

    // 텍스트만 반환 (LLM 호출은 별도 API에서 수행)
    return NextResponse.json({
      parsedTexts,
    });
  } catch (error) {
    console.error("부하테스트 파싱 오류:", error);
    return NextResponse.json(
      { error: "부하테스트 결과 파싱 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}


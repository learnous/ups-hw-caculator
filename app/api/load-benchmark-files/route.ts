import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { parseDocument } from "@/lib/services/documentParseService";

/**
 * public/benchmark-results 폴더의 파일 목록과 내용을 읽어오는 API
 * 텍스트 파일은 내용을 읽고, 이미지 파일은 Document Parse API로 변환하여 텍스트로 반환
 */
export async function GET(request: NextRequest) {
  try {
    const benchmarkDir = join(process.cwd(), "public", "benchmark-results");
    
    // 파일 목록 읽기
    const files = await readdir(benchmarkDir);
    
    // 텍스트 파일 내용과 이미지 파일 파싱 결과
    const parsedTexts: string[] = [];
    
    for (const file of files) {
      // README.md는 제외
      if (file === "README.md") continue;
      
      const filePath = join(benchmarkDir, file);
      
      try {
        // 텍스트 파일인 경우 내용 읽기
        if (file.endsWith(".txt")) {
          const content = await readFile(filePath, "utf-8");
          if (content && content.trim()) {
            parsedTexts.push(content);
          }
        } else if (
          file.endsWith(".png") ||
          file.endsWith(".jpg") ||
          file.endsWith(".jpeg") ||
          file.endsWith(".gif") ||
          file.endsWith(".webp")
        ) {
          // 이미지 파일은 Document Parse API로 변환
          // base64로 변환하여 parseDocument 사용
          const imageBuffer = await readFile(filePath);
          const base64Image = imageBuffer.toString("base64");
          
          try {
            const parseResult = await parseDocument({
              image: base64Image,
              model: "document-parse-nightly",
              ocr: "force",
              coordinates: false,
              outputFormat: "text",
            });
            
            if (typeof parseResult.text === "string" && parseResult.text.trim()) {
              parsedTexts.push(parseResult.text);
            } else if (typeof parseResult.markdown === "string" && parseResult.markdown.trim()) {
              parsedTexts.push(parseResult.markdown);
            } else if (typeof parseResult.html === "string" && parseResult.html.trim()) {
              parsedTexts.push(parseResult.html);
            }
          } catch (parseError) {
            console.error(`이미지 파싱 실패: ${file}`, parseError);
            // 파싱 실패해도 계속 진행
          }
        }
      } catch (error) {
        console.error(`파일 처리 실패: ${file}`, error);
        // 파일 처리 실패해도 계속 진행
      }
    }
    
    return NextResponse.json({
      parsedTexts,
      fileCount: files.filter((f) => f !== "README.md").length,
    });
  } catch (error) {
    console.error("부하테스트 파일 로드 오류:", error);
    return NextResponse.json(
      { error: "부하테스트 파일을 로드할 수 없습니다.", parsedTexts: [] },
      { status: 500 }
    );
  }
}


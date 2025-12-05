/**
 * Upstage Document Parse API 서비스
 * 
 * 사진을 텍스트로 변환하는 API
 * 참고: https://console.upstage.ai/docs/capabilities/digitize/document-parsing
 */

export interface DocumentParseRequest {
  image: File | string; // File 객체 또는 base64 인코딩된 이미지
  model?: string; // 모델 이름 (기본값: document-parse-nightly)
  ocr?: "force" | "auto"; // OCR 강제 실행 여부
  coordinates?: boolean; // 각 요소의 위치 정보 반환 여부
  outputFormat?: "html" | "markdown" | "text"; // 출력 형식
}

export interface DocumentParseResponse {
  text: string; // 추출된 텍스트
  html?: string; // HTML 형식 (output_format이 html인 경우)
  markdown?: string; // Markdown 형식 (output_format이 markdown인 경우)
  confidence?: number; // 신뢰도 (0-1)
  metadata?: {
    pages?: number;
    language?: string;
    coordinates?: any; // 위치 정보 (coordinates가 true인 경우)
    [key: string]: any;
  };
}

/**
 * File을 base64로 변환
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result as string;
      // data:image/png;base64, 부분 제거
      const base64Data = base64.split(",")[1];
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
  });
}

/**
 * Upstage Document Parse API 호출
 * 
 * @param request 문서 파싱 요청
 * @returns 파싱된 텍스트
 */
export async function parseDocument(
  request: DocumentParseRequest
): Promise<DocumentParseResponse> {
  const apiKey = process.env.UPSTAGE_API_KEY;
  const apiUrl = process.env.UPSTAGE_API_URL || "https://api.upstage.ai/v1/document-digitization";
  
  if (!apiKey) {
    throw new Error("UPSTAGE_API_KEY 환경 변수가 설정되지 않았습니다.");
  }

  try {
    const formData = new FormData();
    
    // 파일 처리
    if (request.image instanceof File) {
      formData.append("document", request.image);
    } else {
      // base64 문자열인 경우 Blob으로 변환
      // base64 데이터를 Blob으로 변환
      const byteCharacters = atob(request.image);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/png" });
      formData.append("document", blob, "image.png");
    }

    // 모델 파라미터 추가 (필수)
    const model = request.model || "document-parse-nightly";
    formData.append("model", model);

    // 옵션 파라미터 추가
    if (request.ocr) {
      formData.append("ocr", request.ocr);
    } else {
      formData.append("ocr", "force"); // 기본값: OCR 강제 실행
    }

    if (request.coordinates !== undefined) {
      formData.append("coordinates", request.coordinates.toString());
    } else {
      formData.append("coordinates", "false"); // 기본값: 위치 정보 미반환
    }

    if (request.outputFormat) {
      formData.append("output_format", request.outputFormat);
    } else {
      formData.append("output_format", "text"); // 기본값: 텍스트 형식
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Document Parse API 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    // Upstage API 응답 형식에 맞게 파싱
    // 응답 구조는 실제 API 문서에 따라 달라질 수 있음
    // data가 문자열인 경우 (직접 텍스트 반환)
    if (typeof data === "string") {
      return {
        text: data,
        confidence: 1,
      };
    }
    
    // Upstage API 실제 응답 구조: { api, content: { html, markdown, text }, elements, model, usage }
    const content = data.content || {};
    const html = content.html || data.html || "";
    const markdown = content.markdown || data.markdown || "";
    const text = content.text || data.text || "";
    
    // HTML에서 텍스트 추출 (HTML 태그 제거)
    let extractedText = text;
    if (!extractedText && html) {
      // 간단한 HTML 태그 제거 (서버 사이드에서는 정규식 사용)
      extractedText = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/h[1-6]>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\n\s*\n/g, "\n")
        .trim();
    }
    
    // elements 배열에서 텍스트 추출 (더 정확한 텍스트 추출)
    if (data.elements && Array.isArray(data.elements) && data.elements.length > 0) {
      const elementTexts = data.elements
        .map((element: any) => {
          const elemContent = element.content || {};
          const elemHtml = elemContent.html || "";
          if (elemHtml) {
            // HTML 태그 제거
            return elemHtml
              .replace(/<br\s*\/?>/gi, " ")
              .replace(/<[^>]+>/g, "")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .trim();
          }
          return elemContent.text || "";
        })
        .filter((t: string) => t && t.trim())
        .join("\n");
      
      if (elementTexts) {
        extractedText = elementTexts;
      }
    }
    
    return {
      text: extractedText || "",
      html: typeof html === "string" ? html : undefined,
      markdown: typeof markdown === "string" ? markdown : undefined,
      confidence: typeof data.confidence === "number" ? data.confidence : undefined,
      metadata: {
        pages: data.usage?.pages || data.pages,
        language: data.language,
        coordinates: data.elements?.map((e: any) => e.coordinates) || [],
        model: data.model,
        elements: data.elements?.length || 0,
      },
    };
  } catch (error) {
    console.error("Document Parse API 호출 오류:", error);
    throw error;
  }
}

/**
 * 여러 이미지를 순차적으로 파싱
 */
export async function parseMultipleDocuments(
  images: File[],
  options?: {
    model?: string;
    ocr?: "force" | "auto";
    coordinates?: boolean;
    outputFormat?: "html" | "markdown" | "text";
  }
): Promise<DocumentParseResponse[]> {
  const results: DocumentParseResponse[] = [];

  for (const image of images) {
    try {
      const result = await parseDocument({
        image,
        model: options?.model || "document-parse-nightly",
        ocr: options?.ocr,
        coordinates: options?.coordinates,
        outputFormat: options?.outputFormat,
      });
      results.push(result);
    } catch (error) {
      console.error(`이미지 파싱 실패:`, error);
      results.push({
        text: "",
        confidence: 0,
      });
    }
  }

  return results;
}

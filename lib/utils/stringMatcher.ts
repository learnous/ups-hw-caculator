/**
 * 문자열 매칭 유틸리티
 * 문서 타입 매칭 시 띄어쓰기 제거 및 유사도 비교
 */

/**
 * 문서 타입 동의어/별칭 매핑
 * 같은 문서를 의미하는 다양한 표현을 정규화
 */
const DOCUMENT_TYPE_SYNONYMS: Record<string, string> = {
  "진단소견서": "진단서",
  "소견서": "진단서",
  "진단 소견서": "진단서",
};

/**
 * 문서 타입을 정규화 (동의어 처리)
 */
export function normalizeDocumentType(docType: string): string {
  const normalized = removeSpaces(docType);
  
  // 동의어 매핑 확인
  for (const [synonym, canonical] of Object.entries(DOCUMENT_TYPE_SYNONYMS)) {
    if (normalized === removeSpaces(synonym)) {
      return canonical;
    }
  }
  
  return docType;
}

/**
 * 문자열에서 띄어쓰기 제거
 */
export function removeSpaces(str: string): string {
  return str.replace(/\s+/g, "");
}

/**
 * 두 문자열의 유사도를 계산 (Levenshtein 거리 기반)
 * @returns 0~1 사이의 값 (1이 완전히 일치)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = removeSpaces(str1.toLowerCase());
  const s2 = removeSpaces(str2.toLowerCase());
  
  // 완전히 일치하는 경우
  if (s1 === s2) return 1.0;
  
  // Levenshtein 거리 계산
  const len1 = s1.length;
  const len2 = s2.length;
  
  if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
  if (len2 === 0) return 0.0;
  
  const matrix: number[][] = [];
  
  // 초기화
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // 거리 계산
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // 삭제
        matrix[i][j - 1] + 1,      // 삽입
        matrix[i - 1][j - 1] + cost // 교체
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  
  // 유사도 = 1 - (거리 / 최대 길이)
  return 1 - (distance / maxLen);
}

/**
 * 문서 타입 매칭 (유사도 95% 이상 또는 띄어쓰기 제거 후 일치)
 * 동의어도 같은 문서로 처리
 */
export function matchDocumentType(
  benchmarkType: string | null | undefined,
  targetType: string
): boolean {
  if (!benchmarkType) return false;
  
  // 동의어 정규화
  const normalizedBenchmark = normalizeDocumentType(benchmarkType);
  const normalizedTarget = normalizeDocumentType(targetType);
  
  // 띄어쓰기 제거 후 비교
  const benchmarkNoSpaces = removeSpaces(normalizedBenchmark);
  const targetNoSpaces = removeSpaces(normalizedTarget);
  
  if (benchmarkNoSpaces === targetNoSpaces) {
    return true;
  }
  
  // 유사도 95% 이상이면 매칭
  const similarity = calculateSimilarity(normalizedBenchmark, normalizedTarget);
  return similarity >= 0.95;
}

/**
 * 가장 유사한 문서 타입 찾기
 */
export function findBestMatch(
  benchmarkType: string | null | undefined,
  targetTypes: string[]
): string | null {
  if (!benchmarkType || targetTypes.length === 0) return null;
  
  let bestMatch: string | null = null;
  let bestSimilarity = 0;
  
  for (const targetType of targetTypes) {
    const similarity = calculateSimilarity(benchmarkType, targetType);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestMatch = targetType;
    }
  }
  
  // 95% 이상 유사도가 있으면 반환
  return bestSimilarity >= 0.95 ? bestMatch : null;
}


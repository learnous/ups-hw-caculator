import { DocumentType } from "@/lib/constants/documentTypes";

export interface OCRWorkload {
  documentType: DocumentType;
  requiredThroughput: number; // docs per minute
  maxLatency: number; // seconds
  requiresPLLM: boolean;
}

export interface DPWorkload {
  requiredThroughput: number; // docs per minute
  maxLatency: number; // seconds
}

export type PromptSize = "Small" | "Medium" | "Large";

export interface LLMWorkload {
  simultaneousUsers: number;
  promptSize: PromptSize;
  enableStreaming: boolean;
}

export type DeploymentMode =
  | "Standalone GPU Server"
  | "Kubernetes (MIG-enabled)"
  | "Kubernetes (Full GPU)";

export interface ClusterConfig {
  deploymentMode: DeploymentMode;
  migProfile?: string; // "1g", "2g", "3g", "7g", etc.
}

export type RedundancyLevel = "None" | "Active-Standby" | "N+1";
export type GPUPreference =
  | "Auto-select"
  | "L40S"
  | "A100"
  | "H100"
  | "H200"
  | "B100"
  | "B200";
export type CPUPerformanceTier = "Low" | "Medium" | "High";

export interface SystemConfig {
  targetDailyHours: number;
  redundancyLevel: RedundancyLevel;
  gpuPreference: GPUPreference;
  cpuPerformanceTier: CPUPerformanceTier;
}

export interface CalculationInput {
  ocr: OCRWorkload[];
  dp: DPWorkload;
  llm: LLMWorkload;
  cluster: ClusterConfig;
  system: SystemConfig;
  totalRequestThroughput?: number; // 전체 요청량 (OCR, 문서분류기 계산용)
}

export interface WorkloadDetail {
  documentType?: string; // 문서 타입 (OCR, 정보추출인 경우)
  requiredThroughput: number; // 요구 분당 처리량
  throughputPerContainer: number; // 컨테이너 1대당 분당 스루풋
  containersNeeded: number; // 필요 컨테이너 수
  vramPerContainer: number; // 컨테이너당 VRAM (GB)
  totalVram: number; // 총 필요 VRAM (GB)
}

export interface GPUBreakdown {
  gpuCount: number;
  vram: number; // GB
  cost: number; // USD
  details?: WorkloadDetail[]; // 계산 상세 정보
}

export interface CalculationBreakdown {
  ocr: GPUBreakdown;
  informationExtraction: GPUBreakdown; // 정보추출
  documentClassifier: GPUBreakdown; // 문서분류기
  dp: GPUBreakdown;
  llm: GPUBreakdown;
}

export interface GPUComparison {
  model: string;
  count: number;
  totalVram: number;
  totalCost: number;
}

export interface ServerConfiguration {
  totalServers: number;
  servers: Array<{
    serverNumber: number;
    gpuModel: string;
    gpuCount: number;
    cpuCores: number;
    ramGB: number;
  }>;
}

export interface CalculationResult {
  gpuRecommendation: {
    model: string;
    count: number;
    vramNeeded: number;
  };
  cpuRecommendation: {
    cores: number;
  };
  memoryRecommendation: {
    sizeGB: number;
  };
  serverConfiguration: ServerConfiguration;
  breakdown: CalculationBreakdown;
  comparison: {
    L40S: GPUComparison;
    H100: GPUComparison;
    H200: GPUComparison;
    B100: GPUComparison;
    B200: GPUComparison;
  };
  totalVramRequired: number;
  deploymentMode: DeploymentMode;
  input?: CalculationInput; // 재계산을 위해 저장
  benchmarkData?: any[]; // 재계산을 위해 저장 (ParsedBenchmarkData[])
  technicalExplanation?: string; // LLM으로 생성된 기술적 설명
}


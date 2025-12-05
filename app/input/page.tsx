"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Trash2, Upload, X, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { DOCUMENT_TYPES } from "@/lib/constants/documentTypes";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  totalRequestThroughput: z.number().min(0, "전체 요청량은 0 이상이어야 합니다").optional(),
  ocr: z.array(
    z.object({
      documentType: z.enum(
        DOCUMENT_TYPES as unknown as [string, ...string[]],
        {
          errorMap: () => ({ message: "문서 타입을 선택하세요" }),
        }
      ),
      requiredThroughput: z.number().min(1, "처리량은 1 이상이어야 합니다"),
      maxLatency: z.number().min(0.1, "지연시간은 0.1초 이상이어야 합니다"),
      requiresPLLM: z.boolean(),
    })
  ).min(0), // OCR은 선택사항
  dp: z.object({
    requiredThroughput: z.number().min(0, "처리량은 0 이상이어야 합니다"), // 0도 허용 (선택사항)
    maxLatency: z.number().min(0.1, "지연시간은 0.1초 이상이어야 합니다").optional(),
  }).optional(),
  llm: z.object({
    simultaneousUsers: z.number().int().min(0, "동시 사용자는 0명 이상이어야 합니다"), // 0도 허용 (선택사항)
    promptSize: z.enum(["Small", "Medium", "Large"]),
    enableStreaming: z.boolean(),
  }).optional(),
  cluster: z.object({
    deploymentMode: z.enum([
      "Standalone GPU Server",
      "Kubernetes (MIG-enabled)",
      "Kubernetes (Full GPU)",
    ]),
    migProfile: z.string().optional(),
  }),
  system: z.object({
    targetDailyHours: z.number().min(1).max(24).default(24),
    redundancyLevel: z.enum(["None", "Active-Standby", "N+1"]),
    gpuPreference: z.enum([
      "Auto-select",
      "L40S",
      "A100",
      "H100",
      "H200",
      "B100",
      "B200",
    ]),
    cpuPerformanceTier: z.enum(["Low", "Medium", "High"]),
  }),
});

type FormValues = z.infer<typeof formSchema>;

export default function InputPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [benchmarkFiles, setBenchmarkFiles] = useState<File[]>([]);
  const [benchmarkTexts, setBenchmarkTexts] = useState<string[]>([]);
  const [benchmarkAnalysisResults, setBenchmarkAnalysisResults] = useState<any[]>([]);
  const [isParsingBenchmark, setIsParsingBenchmark] = useState(false);
  const [isAnalyzingBenchmark, setIsAnalyzingBenchmark] = useState(false);
  const [showAnalysisResults, setShowAnalysisResults] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [usePredefinedBenchmark, setUsePredefinedBenchmark] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      totalRequestThroughput: 0,
      ocr: [],
      dp: {
        requiredThroughput: 0,
        maxLatency: 3,
      },
      llm: {
        simultaneousUsers: 0,
        promptSize: "Medium",
        enableStreaming: false,
      },
      cluster: {
        deploymentMode: "Standalone GPU Server",
        migProfile: undefined,
      },
      system: {
        targetDailyHours: 24,
        redundancyLevel: "None",
        gpuPreference: "Auto-select",
        cpuPerformanceTier: "Medium",
      },
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ocr",
  });

  const deploymentMode = form.watch("cluster.deploymentMode");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setBenchmarkFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setBenchmarkFiles((prev) => prev.filter((_, i) => i !== index));
    setBenchmarkTexts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTextInput = (index: number, text: string) => {
    const newTexts = [...benchmarkTexts];
    newTexts[index] = text;
    setBenchmarkTexts(newTexts);
  };

  const parseBenchmarkFiles = async () => {
    if (benchmarkFiles.length === 0) return;

    setIsParsingBenchmark(true);
    try {
      const formData = new FormData();
      benchmarkFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/parse-benchmark", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("부하테스트 결과 파싱 실패");
      }

      const data = await response.json();
      const parsedTexts = data.parsedTexts || [];
      
      // 기존 텍스트와 병합 (중복 제거)
      setBenchmarkTexts((prev) => {
        const merged = [...prev];
        parsedTexts.forEach((text: string) => {
          if (text && !merged.includes(text)) {
            merged.push(text);
          }
        });
        return merged;
      });
      
      // 분석 결과 초기화
      setBenchmarkAnalysisResults([]);
      setShowAnalysisResults(false);
    } catch (error) {
      console.error("부하테스트 파싱 오류:", error);
      alert("부하테스트 결과 파싱 중 오류가 발생했습니다.");
    } finally {
      setIsParsingBenchmark(false);
    }
  };

  const analyzeBenchmarkTexts = async () => {
    const textsToAnalyze = benchmarkTexts.filter((t) => t && t.trim());
    if (textsToAnalyze.length === 0) {
      alert("분석할 텍스트가 없습니다.");
      return;
    }

    setIsAnalyzingBenchmark(true);
    try {
      const response = await fetch("/api/analyze-benchmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts: textsToAnalyze,
        }),
      });

      if (!response.ok) {
        throw new Error("부하테스트 결과 분석 실패");
      }

      const data = await response.json();
      setBenchmarkAnalysisResults(data.structuredData || []);
      setShowAnalysisResults(true);
    } catch (error) {
      console.error("부하테스트 분석 오류:", error);
      alert("부하테스트 결과 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzingBenchmark(false);
    }
  };

  async function onSubmit(data: FormValues) {
    // OCR, DP, LLM 중 적어도 하나는 있어야 함
    const hasOCR = data.ocr && data.ocr.length > 0;
    const hasDP = data.dp && data.dp.requiredThroughput > 0;
    const hasLLM = data.llm && data.llm.simultaneousUsers > 0;
    
    if (!hasOCR && !hasDP && !hasLLM) {
      alert("OCR, DP, LLM 중 적어도 하나는 입력해야 합니다.");
      return;
    }
    
    // 부하테스트 분석이 진행 중이면 계산하지 않음
    if (isAnalyzingBenchmark) {
      alert("부하테스트 결과 분석이 진행 중입니다. 완료될 때까지 기다려주세요.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      // 분석된 결과가 있으면 그것만 사용하고, 없을 때만 텍스트 전달
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: data,
          // 이미 분석된 benchmarkData만 전달 (onSubmit에서는 분석하지 않음)
          benchmarkData: benchmarkAnalysisResults.length > 0 ? benchmarkAnalysisResults : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Calculation failed");
      }

      const result = await response.json();
      
      // Store result in sessionStorage and redirect
      sessionStorage.setItem("calculationResult", JSON.stringify(result));
      router.push("/result");
    } catch (error) {
      console.error("Submission error:", error);
      alert("계산 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            하드웨어 요구사항 계산
          </h1>
          <p className="text-muted-foreground text-lg">
            OCR, DP, LLM 워크로드를 위한 하드웨어 구성을 입력하세요.
          </p>
        </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* SECTION 0: Total Request Throughput */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-4">
              <CardTitle className="text-xl">전체 요청량</CardTitle>
              <CardDescription className="text-base">
                OCR과 문서분류기 계산에 사용되는 전체 요청량을 입력하세요.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="totalRequestThroughput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>전체 요청량 (문서/분)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      모든 문서 타입의 합계 요청량입니다. OCR과 문서분류기는 이 값으로 계산됩니다.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* SECTION 0.5: 부하테스트 결과 업로드 */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-blue-500/5 to-blue-500/10 pb-4">
              <CardTitle className="text-xl">부하테스트 결과 업로드</CardTitle>
              <CardDescription className="text-base">
                부하테스트 결과 이미지 또는 텍스트를 업로드하여 성능 데이터를 자동으로 추출합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 개발자 제공 문서 사용 체크박스 */}
              <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/30">
                <Checkbox
                  id="usePredefinedBenchmark"
                  checked={usePredefinedBenchmark}
                  onCheckedChange={async (checked) => {
                    setUsePredefinedBenchmark(checked === true);
                    if (checked) {
                      // 체크박스 체크 시 업로드된 파일 및 텍스트 초기화
                      setBenchmarkFiles([]);
                      setBenchmarkTexts([]);
                      setBenchmarkAnalysisResults([]);
                      setShowAnalysisResults(false);
                      
                      // public/benchmark-results 폴더의 파일 로드 및 분석
                      try {
                        const response = await fetch("/api/load-benchmark-files");
                        if (!response.ok) {
                          throw new Error("부하테스트 파일 로드 실패");
                        }
                        
                        setIsAnalyzingBenchmark(true);
                        const data = await response.json();
                        const textsToAnalyze = data.parsedTexts || [];
                        
                        // 텍스트가 있으면 분석 실행
                        if (textsToAnalyze.length > 0) {
                          setBenchmarkTexts(textsToAnalyze);
                          
                          // 부하테스트 결과 분석 실행
                          const analyzeResponse = await fetch("/api/analyze-benchmark", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              texts: textsToAnalyze,
                            }),
                          });
                          
                          if (analyzeResponse.ok) {
                            const analyzeData = await analyzeResponse.json();
                            setBenchmarkAnalysisResults(analyzeData.structuredData || []);
                            setShowAnalysisResults(true);
                          } else {
                            const errorData = await analyzeResponse.json();
                            console.error("부하테스트 분석 실패:", errorData);
                            alert("부하테스트 결과 분석 중 오류가 발생했습니다.");
                          }
                        } else {
                          alert(`부하테스트 결과 파일을 찾을 수 없습니다. public/benchmark-results/ 폴더에 파일을 저장해주세요. (로드된 파일 수: ${data.fileCount || 0})`);
                        }
                      } catch (error) {
                        console.error("부하테스트 파일 로드 오류:", error);
                        alert("부하테스트 파일을 로드하는 중 오류가 발생했습니다.");
                      } finally {
                        setIsAnalyzingBenchmark(false);
                      }
                    } else {
                      // 체크박스 해제 시 초기화
                      setBenchmarkTexts([]);
                      setBenchmarkAnalysisResults([]);
                      setShowAnalysisResults(false);
                    }
                  }}
                />
                <Label
                  htmlFor="usePredefinedBenchmark"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  개발자가 제공한 문서 사용
                </Label>
              </div>

              {usePredefinedBenchmark ? (
                <div className="p-4 border-2 border-dashed border-primary/50 rounded-lg bg-primary/5">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="text-primary font-semibold text-base">📁 파일 위치 안내</div>
                    </div>
                    <div className="text-sm space-y-2">
                      <p className="font-medium">부하테스트 결과 파일을 다음 위치에 저장하세요:</p>
                      <div className="bg-background p-3 rounded border font-mono text-xs break-all">
                        <code>public/benchmark-results/</code>
                      </div>
                      <div className="space-y-1 mt-3">
                        <p className="font-medium">📸 이미지 파일:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                          <li>PNG, JPG, JPEG 형식 지원</li>
                          <li>파일명은 자유롭게 지정 가능 (LLM이 내용을 분석하여 자동 인식)</li>
                        </ul>
                        <p className="font-medium mt-3">📄 텍스트 파일:</p>
                        <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
                          <li>TXT 형식 지원</li>
                          <li>파일명은 자유롭게 지정 가능 (LLM이 내용을 분석하여 자동 인식)</li>
                        </ul>
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                        <p className="text-xs text-blue-900 dark:text-blue-100">
                          <strong>💡 참고:</strong> 파일을 저장한 후 애플리케이션을 재시작하면 자동으로 로드됩니다.
                          파일명에 특별한 규칙이 없어도 됩니다. LLM이 파일 내용을 분석하여 GPU 모델, 워크로드 타입, 성능 데이터 등을 자동으로 추출합니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* 파일 업로드 */}
              <div>
                <Label>부하테스트 결과 이미지 업로드</Label>
                <div className="mt-2">
                  <Input
                    type="file"
                    accept="image/*,.txt"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isParsingBenchmark}
                  />
                  {benchmarkFiles.length > 0 && (
                    <Button
                      type="button"
                      onClick={parseBenchmarkFiles}
                      disabled={isParsingBenchmark}
                      className="mt-2"
                      size="sm"
                    >
                      {isParsingBenchmark ? "파싱 중..." : "이미지에서 텍스트 추출"}
                    </Button>
                  )}
                </div>
                {benchmarkFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {benchmarkFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <span className="text-sm">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 텍스트 입력 */}
              <div>
                <Label>부하테스트 결과 텍스트 직접 입력</Label>
                <div className="mt-2 space-y-2">
                  {benchmarkTexts.map((text, index) => (
                    <div key={index}>
                      <Textarea
                        placeholder="부하테스트 결과를 붙여넣으세요. 예: H100 GPU, 컨테이너 1개, RPS 0.086, Latency 21.2ms..."
                        value={text}
                        onChange={(e) => handleTextInput(index, e.target.value)}
                        rows={4}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBenchmarkTexts((prev) => prev.filter((_, i) => i !== index));
                          setBenchmarkAnalysisResults((prev) => prev.filter((_, i) => i !== index));
                        }}
                        className="mt-1"
                      >
                        제거
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBenchmarkTexts([...benchmarkTexts, ""])}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    텍스트 입력 추가
                  </Button>
                </div>
              </div>

              {/* LLM 분석 버튼 */}
              {benchmarkTexts.some((t) => t && t.trim()) && (
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={analyzeBenchmarkTexts}
                    disabled={isAnalyzingBenchmark}
                    className="w-full"
                  >
                    {isAnalyzingBenchmark ? "분석 중..." : "LLM으로 부하테스트 결과 분석"}
                  </Button>
                </div>
              )}

              {/* 분석 결과 표시 */}
              {showAnalysisResults && benchmarkAnalysisResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">분석 결과 (GPU별 예상치 포함)</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAnalysisResults(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* 워크로드 타입과 문서 타입별로 그룹화 */}
                  {(() => {
                    // 그룹화: workloadType + documentType 조합으로 그룹화
                    const grouped = benchmarkAnalysisResults.reduce((acc: any, result: any) => {
                      const key = `${result.workloadType || "Unknown"}_${result.documentType || "null"}`;
                      if (!acc[key]) {
                        acc[key] = {
                          workloadType: result.workloadType,
                          documentType: result.documentType,
                          gpus: [],
                        };
                      }
                      acc[key].gpus.push(result);
                      return acc;
                    }, {});

                    return Object.values(grouped).map((group: any, groupIdx: number) => {
                      const groupKey = `${group.workloadType || "Unknown"}_${group.documentType || "null"}_${groupIdx}`;
                      const isExpanded = expandedGroups.has(groupKey);
                      return (
                        <Card key={groupIdx} className="p-4">
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => {
                                setExpandedGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(groupKey)) {
                                    next.delete(groupKey);
                                  } else {
                                    next.add(groupKey);
                                  }
                                  return next;
                                });
                              }}
                              className="flex items-center gap-2 w-full text-left hover:bg-muted/50 -m-2 p-2 rounded-md transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                              <h4 className="font-semibold text-base flex-1">
                                {group.workloadType || "미확인"}
                                {group.documentType && (
                                  <span className="text-muted-foreground font-normal ml-2">
                                    - {group.documentType}
                                  </span>
                                )}
                                <span className="text-muted-foreground font-normal ml-2 text-sm">
                                  ({group.gpus.length}개 GPU)
                                </span>
                              </h4>
                            </button>
                            {isExpanded && (
                              <div className="space-y-2 pl-6">
                                {group.gpus.map((gpuResult: any, gpuIdx: number) => (
                                  <div key={gpuIdx} className="border-l-2 border-primary pl-3 py-2 bg-muted/30 rounded-r-md">
                                    <div className="font-medium text-sm">
                                      GPU: {gpuResult.gpuModel || "미확인"}
                                      {gpuResult.optimalPoint && (
                                        <span className="text-muted-foreground font-normal ml-2 text-xs">
                                          (최적: 컨테이너 {gpuResult.optimalPoint.containers}개, 
                                          {gpuResult.optimalPoint.throughput.toFixed(1)} docs/min)
                                        </span>
                                      )}
                                    </div>
                                    {gpuResult.results && gpuResult.results.length > 0 ? (
                                      <div className="text-xs text-muted-foreground mt-1 pl-2 space-y-0.5">
                                        {gpuResult.results.map((r: any, idx: number) => (
                                          <div key={idx}>
                                            컨테이너 {r.containers}개: RPS {r.rps.toFixed(2)}
                                            {r.latency !== null && r.latency !== undefined ? `, Latency ${r.latency.toFixed(2)}ms` : ""}
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    });
                  })()}
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>

          {/* SECTION 1: OCR Workload Config */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-green-500/5 to-green-500/10 pb-4">
              <CardTitle className="text-xl">OCR 워크로드 설정</CardTitle>
              <CardDescription className="text-base">
                여러 종류의 OCR 문서 워크로드를 추가할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <Card key={field.id} className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`ocr.${index}.documentType`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>문서 타입</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="문서 타입 선택" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`ocr.${index}.requiredThroughput`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>필요 처리량 (문서/분)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`ocr.${index}.maxLatency`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>최대 지연시간 (초) <span className="text-muted-foreground text-xs">(현재 지원하지 않음)</span></FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              {...field}
                              disabled
                              className="bg-muted cursor-not-allowed"
                              onChange={(e) =>
                                field.onChange(parseFloat(e.target.value) || 0)
                              }
                            />
                          </FormControl>
                          <FormDescription className="text-muted-foreground">
                            현재 버전에서는 지원하지 않는 기능입니다.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`ocr.${index}.requiresPLLM`}
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              disabled
                              className="cursor-not-allowed"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>후처리 LLM (pLLM) 필요 <span className="text-muted-foreground text-xs">(현재 지원하지 않음)</span></FormLabel>
                            <FormDescription className="text-muted-foreground">
                              현재 버전에서는 지원하지 않는 기능입니다.
                            </FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="mt-4"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      제거
                    </Button>
                  )}
                </Card>
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    documentType: DOCUMENT_TYPES[0],
                    requiredThroughput: 100,
                    maxLatency: 5,
                    requiresPLLM: false,
                  })
                }
              >
                <Plus className="h-4 w-4 mr-2" />
                OCR 타입 추가
              </Button>
            </CardContent>
          </Card>

          {/* SECTION 2: DP Workload */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-r from-purple-500/5 to-purple-500/10 pb-4">
              <CardTitle className="text-xl">DP 워크로드</CardTitle>
              <CardDescription className="text-base">
                문서 처리(DP) 워크로드 설정을 입력하세요.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dp.requiredThroughput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>필요 DP 처리량 (문서/분)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dp.maxLatency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>최대 허용 DP 지연시간 (초) <span className="text-muted-foreground text-xs">(현재 지원하지 않음)</span></FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        {...field}
                        disabled
                        className="bg-muted cursor-not-allowed"
                        onChange={(e) =>
                          field.onChange(parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormDescription className="text-muted-foreground">
                      현재 버전에서는 지원하지 않는 기능입니다.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* SECTION 3: LLM Concurrency */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow opacity-60">
            <CardHeader className="bg-gradient-to-r from-orange-500/5 to-orange-500/10 pb-4">
              <CardTitle className="text-xl">LLM 동시성 <span className="text-muted-foreground text-sm font-normal">(현재 지원하지 않음)</span></CardTitle>
              <CardDescription className="text-base">
                현재 버전에서는 지원하지 않는 기능입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pointer-events-none">
              <FormField
                control={form.control}
                name="llm.simultaneousUsers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>동시 LLM 사용자 수</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        disabled
                        className="bg-muted cursor-not-allowed"
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="llm.promptSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>프롬프트 크기 / 일반 컨텍스트 길이</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger className="bg-muted cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Small">Small</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Large">Large</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="llm.enableStreaming"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled
                        className="cursor-not-allowed"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>스트리밍 응답 활성화</FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* SECTION 4: Cluster / Deployment Options */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow opacity-60">
            <CardHeader className="bg-gradient-to-r from-cyan-500/5 to-cyan-500/10 pb-4">
              <CardTitle className="text-xl">클러스터 / 배포 옵션 <span className="text-muted-foreground text-sm font-normal">(현재 지원하지 않음)</span></CardTitle>
              <CardDescription className="text-base">
                현재 버전에서는 지원하지 않는 기능입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pointer-events-none">
              <FormField
                control={form.control}
                name="cluster.deploymentMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>배포 모드</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== "Kubernetes (MIG-enabled)") {
                          form.setValue("cluster.migProfile", undefined);
                        }
                      }}
                      defaultValue={field.value}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger className="bg-muted cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Standalone GPU Server">
                          Standalone GPU Server
                        </SelectItem>
                        <SelectItem value="Kubernetes (MIG-enabled)">
                          Kubernetes (MIG-enabled)
                        </SelectItem>
                        <SelectItem value="Kubernetes (Full GPU)">
                          Kubernetes (Full GPU)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {deploymentMode === "Kubernetes (MIG-enabled)" && (
                <FormField
                  control={form.control}
                  name="cluster.migProfile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>GPU 타입별 MIG 프로필</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled
                      >
                        <FormControl>
                          <SelectTrigger className="bg-muted cursor-not-allowed">
                            <SelectValue placeholder="MIG 프로필 선택" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1g">1g</SelectItem>
                          <SelectItem value="2g">2g</SelectItem>
                          <SelectItem value="3g">3g</SelectItem>
                          <SelectItem value="7g">7g</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* SECTION 5: Other Required Settings */}
          <Card className="border-2 shadow-lg hover:shadow-xl transition-shadow opacity-60">
            <CardHeader className="bg-gradient-to-r from-pink-500/5 to-pink-500/10 pb-4">
              <CardTitle className="text-xl">기타 필수 설정 <span className="text-muted-foreground text-sm font-normal">(현재 지원하지 않음)</span></CardTitle>
              <CardDescription className="text-base">
                현재 버전에서는 지원하지 않는 기능입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pointer-events-none">
              <FormField
                control={form.control}
                name="system.targetDailyHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>목표 일일 운영 시간 (시간)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        max="24"
                        {...field}
                        disabled
                        className="bg-muted cursor-not-allowed"
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 24)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="system.redundancyLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>중복 / HA 레벨</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger className="bg-muted cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Active-Standby">Active-Standby</SelectItem>
                        <SelectItem value="N+1">N+1</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="system.gpuPreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GPU 선호도</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger className="bg-muted cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Auto-select">Auto-select</SelectItem>
                        <SelectItem value="L40S">L40S</SelectItem>
                        <SelectItem value="A100">A100</SelectItem>
                        <SelectItem value="H100">H100</SelectItem>
                        <SelectItem value="H200">H200</SelectItem>
                        <SelectItem value="B100">B100</SelectItem>
                        <SelectItem value="B200">B200</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="system.cpuPerformanceTier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPU 성능 등급</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled
                    >
                      <FormControl>
                        <SelectTrigger className="bg-muted cursor-not-allowed">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4 pt-6">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => router.push("/")}
              className="min-w-[120px]"
            >
              취소
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || isAnalyzingBenchmark}
              size="lg"
              className="min-w-[120px] bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg hover:shadow-xl transition-all"
            >
              {isSubmitting ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  계산 중...
                </>
              ) : isAnalyzingBenchmark ? (
                <>
                  <span className="animate-spin mr-2">🔍</span>
                  분석 중...
                </>
              ) : (
                <>
                  <span className="mr-2">🚀</span>
                  계산하기
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
      </div>
    </div>
  );
}


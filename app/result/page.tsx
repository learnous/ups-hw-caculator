"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalculationResult } from "@/lib/types";
import { recalculateForBaseGPU } from "@/lib/calculators/hardwareCalculator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ResultPage() {
  const router = useRouter();
  const [baseResult, setBaseResult] = useState<CalculationResult & { technicalExplanation?: string } | null>(null);
  const [costOptimization, setCostOptimization] = useState<any>(null);
  const [tuningRecommendations, setTuningRecommendations] = useState<any[]>([]);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [baseGPU, setBaseGPU] = useState<string>("L40S");

  useEffect(() => {
    const storedResult = sessionStorage.getItem("calculationResult");
    const storedCostOptimization = sessionStorage.getItem("costOptimization");
    const storedTuningRecommendations = sessionStorage.getItem("tuningRecommendations");

    if (storedResult) {
      try {
        const parsedResult = JSON.parse(storedResult);
        setBaseResult(parsedResult);
        // 초기 기준 GPU는 권장 GPU로 설정
        if (parsedResult.gpuRecommendation) {
          setBaseGPU(parsedResult.gpuRecommendation.model);
        }
        if (storedCostOptimization) {
          setCostOptimization(JSON.parse(storedCostOptimization));
        }
        if (storedTuningRecommendations) {
          setTuningRecommendations(JSON.parse(storedTuningRecommendations));
        }
      } catch (error) {
        console.error("Failed to parse result:", error);
        router.push("/");
      }
    } else {
      router.push("/");
    }
  }, [router]);

  // 기준 GPU 변경 시 결과 재계산
  const result = useMemo(() => {
    if (!baseResult) return null;

    // 기준 GPU가 권장 GPU와 같으면 원본 결과 사용
    if (baseGPU === baseResult.gpuRecommendation.model) {
      return baseResult;
    }

    // 기준 GPU 변경 시 재계산
    // input과 benchmarkData가 없으면 원본 결과 사용 (폴백)
    if (!baseResult.input) {
      console.warn("input이 없어 재계산을 수행할 수 없습니다. 원본 결과를 사용합니다.");
      return baseResult;
    }

    const recalculatedResult = recalculateForBaseGPU(
      baseResult,
      baseGPU,
      baseResult.input,
      baseResult.benchmarkData
    );

    return recalculatedResult;
  }, [baseResult, baseGPU]);

  if (!result) {
    return (
      <div className="container mx-auto px-6 py-8">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  const gpuCountData = [
    {
      name: "L40S",
      count: result.comparison.L40S.count,
    },
    {
      name: "H100",
      count: result.comparison.H100.count,
    },
    {
      name: "H200",
      count: result.comparison.H200.count,
    },
    {
      name: "B100",
      count: result.comparison.B100.count,
    },
    {
      name: "B200",
      count: result.comparison.B200.count,
    },
  ];

  const costData = [
    {
      name: "L40S",
      cost: result.comparison.L40S.totalCost,
    },
    {
      name: "H100",
      cost: result.comparison.H100.totalCost,
    },
    {
      name: "H200",
      cost: result.comparison.H200.totalCost,
    },
    {
      name: "B100",
      cost: result.comparison.B100.totalCost,
    },
    {
      name: "B200",
      cost: result.comparison.B200.totalCost,
    },
  ];

  const handleDownloadPDF = () => {
    // PDF 다운로드 기능은 나중에 구현 가능
    alert("PDF 다운로드 기능은 곧 추가될 예정입니다.");
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">하드웨어 계산 결과</h1>
        <p className="text-muted-foreground">
          요구사항에 따른 권장 하드웨어 구성을 확인하세요.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">기준 GPU</CardTitle>
            <CardDescription>GPU 모델 및 개수</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Select value={baseGPU} onValueChange={setBaseGPU}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L40S">L40S</SelectItem>
                  <SelectItem value="H100">H100</SelectItem>
                  <SelectItem value="H200">H200</SelectItem>
                  <SelectItem value="B100">B100</SelectItem>
                  <SelectItem value="B200">B200</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-3xl font-bold">
              {result.gpuRecommendation.model}
            </div>
            <div className="text-muted-foreground mt-2">
              {result.gpuRecommendation.count}개
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">필요 VRAM</CardTitle>
            <CardDescription>총 VRAM 요구사항</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {result.totalVramRequired.toLocaleString()}
            </div>
            <div className="text-muted-foreground mt-2">GB</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">필요 CPU 코어</CardTitle>
            <CardDescription>총 CPU 코어 수</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {result.cpuRecommendation.cores}
            </div>
            <div className="text-muted-foreground mt-2">코어</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">필요 메모리</CardTitle>
            <CardDescription>시스템 메모리 요구사항</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {result.memoryRecommendation.sizeGB}
            </div>
            <div className="text-muted-foreground mt-2">GB</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">배포 모드</CardTitle>
            <CardDescription>권장 배포 방식</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {result.deploymentMode}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">총 예상 비용</CardTitle>
            <CardDescription>권장 GPU 기준</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${(() => {
                const model = result.gpuRecommendation.model;
                const comparison = result.comparison[model as keyof typeof result.comparison];
                return comparison?.totalCost.toLocaleString() || "0";
              })()}
            </div>
            <div className="text-muted-foreground mt-2">USD</div>
          </CardContent>
        </Card>
      </div>

      {/* Server Configuration */}
      {result.serverConfiguration && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>서버 구성</CardTitle>
            <CardDescription>
              총 {result.serverConfiguration.totalServers}대의 서버로 구성됩니다. 각 서버의 스펙은 아래와 같습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.serverConfiguration.servers.map((server) => (
                <Card key={server.serverNumber} className="border-2">
                  <CardHeader>
                    <CardTitle className="text-lg">서버 {server.serverNumber}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="text-sm text-muted-foreground">GPU</div>
                      <div className="text-xl font-semibold">
                        {server.gpuModel} × {server.gpuCount}개
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">CPU 코어</div>
                      <div className="text-xl font-semibold">{server.cpuCores}코어</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">RAM</div>
                      <div className="text-xl font-semibold">{server.ramGB}GB</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="text-sm space-y-1">
                <div className="font-semibold">📊 총 요구사항:</div>
                <div>• GPU: {result.gpuRecommendation.model} × {result.gpuRecommendation.count}개</div>
                <div>• CPU: {result.cpuRecommendation.cores}코어</div>
                <div>• RAM: {result.memoryRecommendation.sizeGB}GB (필요량: {result.memoryRecommendation.sizeGB}GB, 실제 구성: {result.serverConfiguration.servers[0]?.ramGB || 0}GB × {result.serverConfiguration.totalServers}대 = {result.serverConfiguration.servers.reduce((sum, s) => sum + s.ramGB, 0)}GB)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* GPU Breakdown Tabs */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>GPU 사용량 분석</CardTitle>
          <CardDescription>
            워크로드별 GPU 소비량을 확인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ocr" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="ocr">OCR</TabsTrigger>
              <TabsTrigger value="infoExtraction">정보추출</TabsTrigger>
              <TabsTrigger value="docClassifier">문서분류기</TabsTrigger>
              <TabsTrigger value="dp">DP</TabsTrigger>
              <TabsTrigger value="llm">LLM</TabsTrigger>
            </TabsList>

            <TabsContent value="ocr" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GPU 개수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.ocr.gpuCount}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.ocr.vram} GB
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">예상 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${result.breakdown.ocr.cost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {result.breakdown.ocr.details && result.breakdown.ocr.details.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM 계산 상세</CardTitle>
                    <CardDescription>컨테이너당 스루풋 및 필요 컨테이너 수</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">요구 처리량<br/>(분당)</th>
                            <th className="text-left p-2">컨테이너당<br/>스루풋</th>
                            <th className="text-left p-2">필요<br/>컨테이너 수</th>
                            <th className="text-left p-2">컨테이너당<br/>VRAM (GB)</th>
                            <th className="text-left p-2">총 VRAM (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.breakdown.ocr.details.map((detail, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2">{detail.requiredThroughput}</td>
                              <td className="p-2">{detail.throughputPerContainer}</td>
                              <td className="p-2">{detail.containersNeeded}</td>
                              <td className="p-2">{detail.vramPerContainer}</td>
                              <td className="p-2 font-semibold">{detail.totalVram}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="infoExtraction" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GPU 개수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.informationExtraction.gpuCount}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.informationExtraction.vram} GB
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">예상 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${result.breakdown.informationExtraction.cost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {result.breakdown.informationExtraction.details && result.breakdown.informationExtraction.details.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM 계산 상세 (문서 타입별)</CardTitle>
                    <CardDescription>각 문서 타입별 컨테이너당 스루풋 및 필요 컨테이너 수</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">문서 타입</th>
                            <th className="text-left p-2">요구 처리량<br/>(분당)</th>
                            <th className="text-left p-2">컨테이너당<br/>스루풋</th>
                            <th className="text-left p-2">필요<br/>컨테이너 수</th>
                            <th className="text-left p-2">컨테이너당<br/>VRAM (GB)</th>
                            <th className="text-left p-2">총 VRAM (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.breakdown.informationExtraction.details.map((detail, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2 font-medium">{detail.documentType || "-"}</td>
                              <td className="p-2">{detail.requiredThroughput}</td>
                              <td className="p-2">{detail.throughputPerContainer}</td>
                              <td className="p-2">{detail.containersNeeded}</td>
                              <td className="p-2">{detail.vramPerContainer}</td>
                              <td className="p-2 font-semibold">{detail.totalVram}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="docClassifier" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GPU 개수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.documentClassifier.gpuCount}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.documentClassifier.vram} GB
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">예상 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${result.breakdown.documentClassifier.cost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {result.breakdown.documentClassifier.details && result.breakdown.documentClassifier.details.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM 계산 상세</CardTitle>
                    <CardDescription>컨테이너당 스루풋 및 필요 컨테이너 수</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">요구 처리량<br/>(분당)</th>
                            <th className="text-left p-2">컨테이너당<br/>스루풋</th>
                            <th className="text-left p-2">필요<br/>컨테이너 수</th>
                            <th className="text-left p-2">컨테이너당<br/>VRAM (GB)</th>
                            <th className="text-left p-2">총 VRAM (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.breakdown.documentClassifier.details.map((detail, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2">{detail.requiredThroughput}</td>
                              <td className="p-2">{detail.throughputPerContainer}</td>
                              <td className="p-2">{detail.containersNeeded}</td>
                              <td className="p-2">{detail.vramPerContainer}</td>
                              <td className="p-2 font-semibold">{detail.totalVram}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="dp" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GPU 개수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.dp.gpuCount}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.dp.vram} GB
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">예상 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${result.breakdown.dp.cost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {result.breakdown.dp.details && result.breakdown.dp.details.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM 계산 상세</CardTitle>
                    <CardDescription>컨테이너당 스루풋 및 필요 컨테이너 수</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">요구 처리량<br/>(분당)</th>
                            <th className="text-left p-2">컨테이너당<br/>스루풋</th>
                            <th className="text-left p-2">필요<br/>컨테이너 수</th>
                            <th className="text-left p-2">컨테이너당<br/>VRAM (GB)</th>
                            <th className="text-left p-2">총 VRAM (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.breakdown.dp.details.map((detail, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2">{detail.requiredThroughput}</td>
                              <td className="p-2">{detail.throughputPerContainer}</td>
                              <td className="p-2">{detail.containersNeeded}</td>
                              <td className="p-2">{detail.vramPerContainer}</td>
                              <td className="p-2 font-semibold">{detail.totalVram}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="llm" className="mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">GPU 개수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.llm.gpuCount}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {result.breakdown.llm.vram} GB
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">예상 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ${result.breakdown.llm.cost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              {result.breakdown.llm.details && result.breakdown.llm.details.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">VRAM 계산 상세</CardTitle>
                    <CardDescription>동시 사용자당 VRAM 및 총 필요 VRAM</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">동시 사용자 수</th>
                            <th className="text-left p-2">사용자당<br/>VRAM (GB)</th>
                            <th className="text-left p-2">필요<br/>인스턴스 수</th>
                            <th className="text-left p-2">총 VRAM (GB)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.breakdown.llm.details.map((detail, idx) => (
                            <tr key={idx} className="border-b">
                              <td className="p-2">{detail.requiredThroughput}</td>
                              <td className="p-2">{detail.vramPerContainer}</td>
                              <td className="p-2">{detail.containersNeeded}</td>
                              <td className="p-2 font-semibold">{detail.totalVram}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* GPU Comparison Charts */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>GPU 모델 비교</CardTitle>
          <CardDescription>
            다양한 GPU 모델의 필요 개수와 비용을 비교하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* GPU 개수 비교 그래프 */}
          <div>
            <h3 className="text-lg font-semibold mb-4">필요 GPU 개수 비교</h3>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gpuCountData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis label={{ value: 'GPU 개수', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" name="GPU 개수" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 총 비용 비교 그래프 */}
          <div>
            <h3 className="text-lg font-semibold mb-4">총 비용 비교 (USD)</h3>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis label={{ value: '비용 (USD)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                  <Bar dataKey="cost" fill="#10b981" name="총 비용 (USD)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { key: "L40S", label: "L40S" },
              { key: "H100", label: "H100" },
              { key: "H200", label: "H200" },
              { key: "B100", label: "B100" },
              { key: "B200", label: "B200" },
            ].map((gpu) => {
              const comparison = result.comparison[gpu.key as keyof typeof result.comparison];
              return (
                <Card key={gpu.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{gpu.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <span className="text-muted-foreground">개수: </span>
                      <span className="font-semibold">
                        {comparison.count}개
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">총 VRAM: </span>
                      <span className="font-semibold">
                        {comparison.totalVram} GB
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">총 비용: </span>
                      <span className="font-semibold">
                        ${comparison.totalCost.toLocaleString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Cost Optimization */}
      {costOptimization && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>비용 최적화 제안</CardTitle>
            <CardDescription>
              더 비용 효율적인 구성을 찾아보세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {costOptimization.optimizationStrategies && costOptimization.optimizationStrategies.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">최적화 전략</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {costOptimization.optimizationStrategies.map((strategy: string, index: number) => (
                    <li key={index}>{strategy}</li>
                  ))}
                </ul>
              </div>
            )}

            {costOptimization.alternatives && costOptimization.alternatives.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">대안 구성</h4>
                <div className="space-y-3">
                  {costOptimization.alternatives.map((alt: any, index: number) => (
                    <Card key={index} className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">비용 절감: ${alt.costSavings.toLocaleString()}</p>
                          <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
                            {alt.tradeoffs.map((tradeoff: string, i: number) => (
                              <li key={i}>{tradeoff}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tuning Recommendations */}
      {tuningRecommendations && tuningRecommendations.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>성능 튜닝 권장사항</CardTitle>
            <CardDescription>
              동적 성능 예측 기반 최적화 제안입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tuningRecommendations.map((rec: any, index: number) => (
              <Card key={index} className="p-4">
                <h4 className="font-semibold mb-2">{rec.reasoning}</h4>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">처리량 개선</p>
                    <p className="text-lg font-semibold text-green-600">
                      +{rec.expectedImprovement.throughput.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">지연시간 개선</p>
                    <p className="text-lg font-semibold text-green-600">
                      +{rec.expectedImprovement.latency.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">권장 컨테이너 수</p>
                    <p className="text-lg font-semibold">{rec.containerCount}개</p>
                  </div>
                </div>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Technical Explanation */}
      <Card>
        <CardHeader>
          <Button
            variant="ghost"
            className="w-full justify-between p-0 h-auto"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          >
            <CardTitle>기술적 설명</CardTitle>
            {showTechnicalDetails ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CardHeader>
        {showTechnicalDetails && (
          <CardContent className="space-y-4">
            {result?.technicalExplanation ? (
              <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-foreground prose-strong:font-semibold prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted prose-pre:text-foreground">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-foreground" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mt-5 mb-3 text-foreground" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground" {...props} />,
                    h4: ({ node, ...props }) => <h4 className="text-base font-semibold mt-3 mb-2 text-foreground" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-4 text-muted-foreground leading-relaxed" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-4 space-y-2 text-muted-foreground" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-4 space-y-2 text-muted-foreground" {...props} />,
                    li: ({ node, ...props }) => <li className="ml-4 text-muted-foreground" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                    em: ({ node, ...props }) => <em className="italic text-muted-foreground" {...props} />,
                    code: ({ node, inline, ...props }: any) => 
                      inline ? (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground" {...props} />
                      ) : (
                        <code className="block bg-muted p-4 rounded-lg text-sm font-mono text-foreground overflow-x-auto" {...props} />
                      ),
                    pre: ({ node, ...props }) => <pre className="bg-muted p-4 rounded-lg overflow-x-auto mb-4" {...props} />,
                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary pl-4 italic my-4 text-muted-foreground" {...props} />,
                    hr: ({ node, ...props }) => <hr className="my-6 border-border" {...props} />,
                    table: ({ node, ...props }) => (
                      <div className="overflow-x-auto my-6">
                        <table className="w-full border-collapse border border-border rounded-lg" {...props} />
                      </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-muted" {...props} />,
                    tbody: ({ node, ...props }) => <tbody {...props} />,
                    tr: ({ node, ...props }) => <tr className="border-b border-border hover:bg-muted/50 transition-colors" {...props} />,
                    th: ({ node, ...props }) => (
                      <th className="border border-border px-4 py-3 text-left font-semibold text-foreground bg-muted" {...props} />
                    ),
                    td: ({ node, ...props }) => (
                      <td className="border border-border px-4 py-3 text-muted-foreground" {...props} />
                    ),
                  }}
                >
                  {result.technicalExplanation}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">계산 방법론</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>
                      OCR 워크로드는 MIG 프로필 또는 전체 GPU 모드를 기반으로 계산됩니다.
                    </li>
                    <li>
                      pLLM이 활성화된 경우, 컨테이너당 약 40GB VRAM이 필요하며 인스턴스당 약 40문서/분을 처리합니다.
                    </li>
                    <li>
                      DP 워크로드는 벤치마크 데이터를 기반으로 계산됩니다.
                    </li>
                    <li>
                      LLM 워크로드는 동시 사용자 수와 프롬프트 크기에 따라 VRAM 요구사항이 결정됩니다.
                    </li>
                    <li>
                      CPU 코어는 GPU 인스턴스당 약 4개의 vCPU를 기준으로 계산됩니다.
                    </li>
                    <li>
                      시스템 메모리는 GPU당 32GB(LLM의 경우 64GB)를 기준으로 계산됩니다.
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">권장사항</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>
                      실제 운영 환경에서는 여유를 두고 20-30% 추가 용량을 고려하세요.
                    </li>
                    <li>
                      HA 레벨이 Active-Standby 또는 N+1인 경우, 추가 GPU가 필요할 수 있습니다.
                    </li>
                    <li>
                      MIG 모드는 리소스 효율성을 높이지만, 전체 GPU 모드보다 관리가 복잡할 수 있습니다.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-4 mt-8">
        <Button variant="outline" onClick={() => router.push("/input")}>
          다시 계산하기
        </Button>
        <Button onClick={handleDownloadPDF}>
          <Download className="h-4 w-4 mr-2" />
          PDF로 다운로드
        </Button>
      </div>
    </div>
  );
}


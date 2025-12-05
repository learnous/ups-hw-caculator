import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">하드웨어 계산기</CardTitle>
          <CardDescription>
            OCR, DP, LLM 워크로드를 위한 하드웨어 요구사항을 계산합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/input">
            <Button className="w-full" size="lg">
              계산 시작하기
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

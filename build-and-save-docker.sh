#!/bin/bash

# Docker 이미지 빌드 및 저장 스크립트 (AMD64 Linux용)

set -e

IMAGE_NAME="hw-generator"
IMAGE_TAG="latest"
OUTPUT_FILE="hw-generator-docker-image.tar"
PLATFORM="linux/amd64"

echo "🚀 Docker 이미지 빌드 시작 (플랫폼: ${PLATFORM})..."
docker build --platform ${PLATFORM} -t ${IMAGE_NAME}:${IMAGE_TAG} .

echo "✅ 이미지 빌드 완료"

echo "💾 Docker 이미지를 tar 파일로 저장 중..."
docker save ${IMAGE_NAME}:${IMAGE_TAG} -o ${OUTPUT_FILE}

echo "✅ 이미지 저장 완료: ${OUTPUT_FILE}"
echo ""
echo "📦 VM에 배포하는 방법:"
echo "1. ${OUTPUT_FILE} 파일을 VM으로 전송"
echo "2. VM에서 다음 명령어 실행:"
echo "   docker load -i ${OUTPUT_FILE}"
echo "3. 컨테이너 실행:"
echo "   docker run -d \\"
echo "     --name hw-generator \\"
echo "     -p 3000:3000 \\"
echo "     -e UPSTAGE_API_KEY=your_api_key \\"
echo "     -e UPSTAGE_API_URL=https://api.upstage.ai/v1/document-digitization \\"
echo "     -e UPSTAGE_LLM_API_URL=https://api.upstage.ai/v1/chat/completions \\"
echo "     --restart unless-stopped \\"
echo "     ${IMAGE_NAME}:${IMAGE_TAG}"


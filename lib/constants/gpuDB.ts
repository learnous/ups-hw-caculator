export interface GPUSpec {
  fp16: number; // TFLOPS
  fp32: number; // TFLOPS
  memory: number; // GB
  price: number; // USD
  migProfiles: Record<string, number>; // profile name -> memory GB
}

export const GPU_DB: Record<string, GPUSpec> = {
  L40S: {
    fp16: 91,
    fp32: 91.6, // 사용자 제공 값
    memory: 48,
    price: 8500,
    migProfiles: { "1g": 10, "2g": 20, "4g": 40 },
  },
  A100: {
    fp16: 156,
    fp32: 19.5, // 사용자 제공 값
    memory: 80,
    price: 15000,
    migProfiles: { "1g": 10, "2g": 20, "3g": 40, "7g": 80 },
  },
  H100: {
    fp16: 198,
    fp32: 67, // 사용자 제공 값
    memory: 80,
    price: 25000,
    migProfiles: { "1g": 15, "2g": 30, "3g": 60, "7g": 200 },
  },
  H200: {
    fp16: 260,
    fp32: 67, // 사용자 제공 값
    memory: 141,
    price: 31000,
    migProfiles: { "1g": 18, "2g": 36, "3g": 72, "7g": 250 },
  },
  B100: {
    fp16: 0, // TODO: 실제 값으로 업데이트 필요
    fp32: 60, // 사용자 제공 값
    memory: 192, // 192GB HBM3e
    price: 25000, // 웹 검색 결과 기반 추정 가격 ($30,000-$35,000 범위 중간값)
    migProfiles: { "1g": 23, "2g": 45, "3g": 90, "7g": 180 }, // 추정 MIG 프로필
  },
  B200: {
    fp16: 0, // TODO: 실제 값으로 업데이트 필요
    fp32: 75, // 사용자 제공 값
    memory: 192, // 192GB HBM3e
    price: 32000, // 웹 검색 결과 기반 추정 가격 ($30,000-$35,000 범위 중간값)
    migProfiles: { "1g": 23, "2g": 45, "3g": 90, "7g": 180 }, // 추정 MIG 프로필
  },
  // 추가 GPU 모델 (참고용)
  RTX3090: {
    fp16: 0, // TODO: 실제 값으로 업데이트 필요
    fp32: 35.6, // 사용자 제공 값
    memory: 24,
    price: 0, // TODO: 실제 값으로 업데이트 필요
    migProfiles: {},
  },
  A6000: {
    fp16: 0, // TODO: 실제 값으로 업데이트 필요
    fp32: 38.7, // 사용자 제공 값
    memory: 48,
    price: 0, // TODO: 실제 값으로 업데이트 필요
    migProfiles: {},
  },
};


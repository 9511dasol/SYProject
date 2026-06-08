import type { NavGroup } from '@/types/navigation';

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'analytics',
    groupLabel: '분석 · 리포트',
    items: [
      {
        id: 'dashboard',
        label: 'SA 광고 대시보드',
        icon: 'bx-bar-chart-alt-2',
        href: '/',
        description: '매체 데이터 분석 및 DB 저장',
      },
      {
        id: 'report-email',
        label: '코멘트 & 리포트 메일',
        icon: 'bx-mail-send',
        href: '/report-email',
        description: '분석 기반 코멘트 작성 및 메일 발송',
      },
      {
        id: 'file-compare',
        label: '키워드 성과 비교',
        icon: 'bx-transfer-alt',
        href: '/keyword-compare',
        description: '이번/이전 기간 키워드 전환 성과를 자동 비교·분석',
      },
    ],
  },
  {
    id: 'creative',
    groupLabel: '크리에이티브',
    items: [
      {
        id: 'image-filter',
        label: '이미지 정제',
        icon: 'bx-filter-alt',
        href: '/image-filter',
        badge: 'NEW',
        description: 'GPT-4o가 조건을 분석해 맞는 이미지만 리사이징',
      },
      {
        id: 'image-resize',
        label: '이미지 리사이저',
        icon: 'bx-crop',
        href: '/image-resize',
        description: 'JPEG · PNG · WebP 원하는 사이즈로 변환',
      },
      {
        id: 'heading-suggest',
        label: '헤딩 문구 추천',
        icon: 'bx-bulb',
        href: '/heading-suggest',
        badge: 'NEW',
        description: 'Claude가 이미지를 분석해 매체별 헤딩 문구 10개를 제안',
      },
    ],
  },
] as const;

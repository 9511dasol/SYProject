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
        href: '/dashboard',
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
        description: 'Gemini가 프롬프트대로 이미지를 편집',
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
        description: 'Gemini가 이미지를 분석해 매체별 헤딩 문구 10개를 제안',
      },
      {
        id: 'heading-history',
        label: '헤딩 문구 기록',
        icon: 'bx-history',
        href: '/heading-history',
        description: '생성한 문구를 모아 보고 검색 · 복사 · 삭제',
      },
    ],
  },
  {
    id: 'admin',
    groupLabel: '관리자',
    adminOnly: true,
    items: [
      {
        id: 'admin-settings',
        label: '기능 플래그 관리',
        icon: 'bx-toggle-left',
        href: '/admin/settings',
        description: '서비스 기능을 켜고 끌 수 있는 관리자 설정',
      },
      {
        id: 'admin-users',
        label: '사용자 관리',
        icon: 'bx-group',
        href: '/admin/users',
        description: '계정 목록 조회, 권한 · 활성 상태 관리, 운영 계정 생성',
      },
      {
        id: 'admin-ai-usage-logs',
        label: 'AI 도구 사용 이력',
        icon: 'bx-history',
        href: '/admin/ai-usage-logs',
        description: '이미지 정제 · 리사이저 AI 업스케일 · 헤딩 문구 추천 사용 이력',
      },
      {
        id: 'admin-report-logs',
        label: '리포트 발송 로그',
        icon: 'bx-mail-send',
        href: '/admin/report-logs',
        badge: 'NEW',
        description: '리포트 메일 발송 결과 확인 및 실패 건 재발송',
      },
      {
        id: 'admin-periods',
        label: '업로드 데이터 관리',
        icon: 'bx-data',
        href: '/admin/periods',
        badge: 'NEW',
        description: '연월별 저장 데이터 현황 조회·삭제, 매체별 예산 입력',
      },
    ],
  },
] as const;

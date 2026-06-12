import { create } from 'zustand';
import type { FeatureFlags } from '@/types/featureFlags';

interface FeatureFlagState {
  flags: FeatureFlags;
  /** 백엔드로부터 플래그를 한 번이라도 불러왔는지 여부 */
  loaded: boolean;
  setFlags: (flags: FeatureFlags) => void;
  /** 플래그를 아직 불러오지 못했거나 키가 없으면 기본적으로 활성 상태로 간주한다. */
  isEnabled: (key: string) => boolean;
}

export const useFeatureFlagStore = create<FeatureFlagState>((set, get) => ({
  flags: {},
  loaded: false,
  setFlags: (flags) => set({ flags, loaded: true }),
  isEnabled: (key) => get().flags[key] ?? true,
}));

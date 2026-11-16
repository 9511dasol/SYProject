'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { ImageDimensions } from '@/types/imageResize';

/** 가로·세로 입력과 비율 유지 토글을 가진 폼이면 무엇이든 쓸 수 있다. */
export interface AspectRatioForm {
  targetWidth: string;
  targetHeight: string;
  keepAspectRatio: boolean;
}

/**
 * 비율 유지가 켜져 있으면 한쪽을 입력할 때 반대쪽을 따라 계산한다.
 *
 * 이 계산이 이미지 리사이즈 화면과 이미지 정제 화면에 같은 모양으로 복제돼 있었다.
 * 한쪽만 고치면 두 화면이 조용히 다른 크기를 내놓게 되므로 한곳에 둔다.
 */
export function useAspectRatioInputs<T extends AspectRatioForm>(
  dimensions: ImageDimensions | null,
  setForm: Dispatch<SetStateAction<T>>,
) {
  const onWidthChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        if (!prev.keepAspectRatio || !dimensions) return { ...prev, targetWidth: value };
        const width = Number(value);
        if (width > 0) {
          const ratio = dimensions.height / dimensions.width;
          return { ...prev, targetWidth: value, targetHeight: String(Math.round(width * ratio)) };
        }
        return { ...prev, targetWidth: value };
      });
    },
    [dimensions, setForm],
  );

  const onHeightChange = useCallback(
    (value: string) => {
      setForm((prev) => {
        if (!prev.keepAspectRatio || !dimensions) return { ...prev, targetHeight: value };
        const height = Number(value);
        if (height > 0) {
          const ratio = dimensions.width / dimensions.height;
          return { ...prev, targetHeight: value, targetWidth: String(Math.round(height * ratio)) };
        }
        return { ...prev, targetHeight: value };
      });
    },
    [dimensions, setForm],
  );

  return { onWidthChange, onHeightChange };
}

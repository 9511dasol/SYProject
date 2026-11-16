'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageDimensions } from '@/types/imageResize';

/**
 * 이미지 한 장을 고르고 미리보기를 관리한다.
 *
 * "objectURL 만들기 → 이전 것 해제 → new Image() 로 원본 치수 재기 → 언마운트 때 해제"
 * 흐름이 이미지 리사이즈 화면과 이미지 정제 화면에 글자 단위로 같게 복제돼 있었다.
 * revokeObjectURL 을 한 군데라도 빠뜨리면 그대로 메모리 누수라 한곳에서만 관리한다.
 *
 * onMeasured 는 치수를 잰 뒤 호출된다 — 두 화면 모두 그 값으로 입력칸의 기본
 * 가로·세로를 채우기 때문에, 치수가 async 로 도착한다는 사실을 호출부가 알 필요가
 * 없도록 콜백으로 넘긴다.
 */
export function useImageUpload(onMeasured?: (dimensions: ImageDimensions, file: File) => void) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);

  // 해제해야 할 URL 을 ref 로도 들고 있는다 — 언마운트 정리에서 최신 값을 봐야 하는데
  // state 를 의존성에 넣으면 파일이 바뀔 때마다 정리 함수가 다시 묶인다.
  const urlRef = useRef<string | null>(null);

  // 호출부는 인라인 화살표 함수를 넘기므로 매 렌더 새 참조가 된다. 의존성에 직접
  // 넣으면 select 가 매번 바뀌어 드롭존까지 다시 렌더된다 — 최신 값만 ref 로 들고 간다.
  const measuredRef = useRef(onMeasured);
  useEffect(() => {
    measuredRef.current = onMeasured;
  });

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const select = useCallback(
    (next: File) => {
      revoke();
      const url = URL.createObjectURL(next);
      urlRef.current = url;

      setPreviewUrl(url);
      setFile(next);
      setDimensions(null);

      const probe = new window.Image();
      probe.onload = () => {
        const measured = { width: probe.naturalWidth, height: probe.naturalHeight };
        setDimensions(measured);
        measuredRef.current?.(measured, next);
      };
      probe.src = url;
    },
    [revoke],
  );

  const clear = useCallback(() => {
    revoke();
    setFile(null);
    setPreviewUrl(null);
    setDimensions(null);
  }, [revoke]);

  useEffect(() => revoke, [revoke]);

  return { file, previewUrl, dimensions, select, clear };
}

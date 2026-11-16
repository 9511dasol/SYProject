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

  // 선택할 때마다 올라가는 번호. 두 가지에 쓴다.
  //  1) 늦게 도착한 이전 이미지의 onload 를 버린다(큰 그림 → 작은 그림으로 빠르게
  //     바꾸면 먼저 시작한 디코드가 나중에 끝나 새 파일의 치수를 덮어쓴다).
  //  2) 호출부가 자식 컴포넌트 key 로 써서 "같은 파일을 다시 고르기" 를 구분한다
  //     (이름·크기·수정시각이 같으면 문자열 키로는 구분되지 않는다).
  const [selectionId, setSelectionId] = useState(0);
  const generationRef = useRef(0);

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

      const generation = generationRef.current + 1;
      generationRef.current = generation;

      setPreviewUrl(url);
      setFile(next);
      setDimensions(null);
      setSelectionId(generation);

      const probe = new window.Image();
      probe.onload = () => {
        // 그 사이 다른 파일을 골랐으면 이 결과는 버린다
        if (generationRef.current !== generation) return;
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
    generationRef.current += 1; // 진행 중이던 치수 측정 결과를 무효화
    setFile(null);
    setPreviewUrl(null);
    setDimensions(null);
    setSelectionId(0);
  }, [revoke]);

  useEffect(() => revoke, [revoke]);

  return { file, previewUrl, dimensions, selectionId, select, clear };
}

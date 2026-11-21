'use client';

import { useCallback, useMemo, useState, type DragEvent } from 'react';

/**
 * 끌어다 놓기로 파일을 받는다.
 *
 * `preventDefault` + 드래그 상태 토글 + `dataTransfer.files` 꺼내기가 화면 네 곳
 * (이미지 업로드, 마케팅 CSV 업로드, 키워드 비교, 대시보드 카드)에 각자 구현돼
 * 있었다. 특히 drop 에서 `preventDefault` 를 빠뜨리면 브라우저가 그 파일로 페이지를
 * 이동시켜 작업하던 화면이 통째로 날아가는데, 네 곳이 각자 기억해야 할 일이었다.
 *
 * 반환한 handlers 를 드롭 영역에 그대로 펼쳐 넣으면 된다.
 */
export function useFileDrop(onFiles: (files: File[]) => void, disabled = false) {
  const [isDragging, setIsDragging] = useState(false);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault(); // 이게 없으면 drop 이벤트 자체가 오지 않는다
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    // dragleave 는 자식 요소로 들어갈 때도 발화한다 — 영역을 실제로 벗어날
    // 때만 꺼야 페이지 전체를 드롭 영역으로 쓰는 화면에서 오버레이가 깜빡이지
    // 않는다. relatedTarget 이 null 이면(창 밖으로 나감) 끈다.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      // 빠뜨리면 브라우저가 그 파일을 열어 현재 화면을 떠난다
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [disabled, onFiles],
  );

  const handlers = useMemo(
    () => ({ onDragOver, onDragLeave, onDrop }),
    [onDragOver, onDragLeave, onDrop],
  );

  return { isDragging, handlers };
}

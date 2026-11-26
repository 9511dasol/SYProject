'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageDimensions, ImageVersion, VersionKind } from '@/types/imageFilter';

/** 새 버전 한 장을 추가할 때 넘기는 정보 */
export interface AddVersionSpec {
  file: File;
  kind: VersionKind;
  /** 이 버전을 만들어 낸 버전 */
  parentId: string | null;
  /** 레일에 쓸 이름 — 생략하면 편집 결과는 v1, v2… 로 자동 매긴다 */
  label?: string;
  provider?: string;
  /** 다운로드 파일명 — 생략하면 file.name */
  filename?: string;
  note?: string;
}

/**
 * 작업 중인 이미지의 버전 계보를 관리한다.
 *
 * 한 화면에서 원본 → 편집 결과 → 그 결과를 또 편집 … 으로 이어지는데, 이전 구현은
 * "현재 첨부 파일" 하나만 들고 있었다. 그래서 지난 결과를 다시 보려면 채팅 기록을
 * 거슬러 올라가야 했고, 지금 보는 이미지가 어느 결과에서 갈라졌는지는 알 수 없었다.
 *
 * objectURL 해제를 여기 한곳으로 모은 이유 — 버전은 늘어나기만 하고(지난 결과도
 * 계속 볼 수 있어야 하므로) 교체 시점에 바로 해제할 수 없어서, 세션을 비울 때와
 * 언마운트 때 한 번에 정리해야 한다. 호출부에 맡기면 한 군데라도 빠뜨리는 순간
 * 수 MB 짜리 Blob 이 그대로 남는다.
 *
 * URL 생성·번호 매김은 모두 setState 업데이터 **밖**에서 한다 — 업데이터 안에
 * 두면 StrictMode 가 두 번 호출해 objectURL 이 한 장당 두 개씩 생기고 그중 하나는
 * 아무도 해제하지 않는다.
 */
export function useImageVersions(
  /**
   * 활성 버전의 치수 측정이 끝나면 호출된다.
   *
   * 치수는 비동기로 도착하는데, 호출부는 그 값으로 출력 크기 입력칸을 채운다.
   * effect 로 state 를 따라가게 만들면 렌더가 한 번 더 돌고 "effect 안에서
   * setState" 가 되므로, 측정이라는 외부 이벤트를 콜백으로 알려 준다
   * (useImageUpload 가 쓰는 방식과 같다).
   */
  onActiveMeasured?: (dimensions: ImageDimensions) => void,
) {
  const [versions, setVersions] = useState<ImageVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 호출부는 인라인 화살표 함수를 넘기므로 매 렌더 새 참조가 된다 — 최신 값만 들고 간다
  const measuredRef = useRef(onActiveMeasured);
  useEffect(() => {
    measuredRef.current = onActiveMeasured;
  });

  // measure 의 onload 는 "그때 활성이었는지"를 알아야 한다 — state 는 클로저에
  // 갇히므로 ref 로 함께 들고 간다.
  const activeIdRef = useRef<string | null>(null);
  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const seqRef = useRef(0);
  // 편집 결과에 v1, v2… 를 매기기 위한 카운터. versions 를 세지 않는 이유는
  // 번호 매김이 업데이터 밖에서 일어나야 하기 때문이다(위 주석 참고).
  const editedCountRef = useRef(0);
  // 해제해야 할 URL 전체. state 를 보면 정리 함수가 버전마다 다시 묶이므로 ref 로 든다.
  const urlsRef = useRef<string[]>([]);
  // 늦게 도착한 치수 측정 결과를 버리기 위한 세션 번호 — 세션을 비운 뒤 도착한
  // onload 가 이미 사라진 버전을 되살리면 안 된다.
  const sessionRef = useRef(0);

  const revokeAll = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    // 재할당하면 언마운트 정리가 들고 있는 배열 참조와 끊어져 이후 URL 이 샌다
    urlsRef.current.length = 0;
  }, []);

  /** 치수를 비동기로 재서 해당 버전에만 채운다 */
  const measure = useCallback((id: string, url: string) => {
    const session = sessionRef.current;
    const probe = new window.Image();
    probe.onload = () => {
      if (sessionRef.current !== session) return;
      const dimensions = { width: probe.naturalWidth, height: probe.naturalHeight };
      setVersions((prev) => prev.map((v) => (v.id === id ? { ...v, dimensions } : v)));
      // 배경 시안 4종처럼 여러 장이 동시에 측정될 때, 지금 보고 있는 것만 알린다
      if (activeIdRef.current === id) measuredRef.current?.(dimensions);
    };
    probe.src = url;
  }, []);

  /** 버전 객체를 만든다 — objectURL 생성과 번호 매김이라는 부수효과를 갖는다 */
  const build = useCallback((spec: AddVersionSpec): ImageVersion => {
    seqRef.current += 1;
    const url = URL.createObjectURL(spec.file);
    urlsRef.current.push(url);

    if (spec.kind === 'edited') editedCountRef.current += 1;

    const label =
      spec.label ??
      (spec.kind === 'original'
        ? '원본'
        : spec.kind === 'edited'
          ? `v${editedCountRef.current}`
          : '시안');

    return {
      id: `ver-${seqRef.current}`,
      kind: spec.kind,
      parentId: spec.parentId,
      file: spec.file,
      url,
      dimensions: null,
      label,
      provider: spec.provider,
      filename: spec.filename ?? spec.file.name,
      note: spec.note,
    };
  }, []);

  /** 새 세션 시작 — 기존 버전을 모두 버리고 이 파일을 원본으로 둔다 */
  const start = useCallback(
    (file: File) => {
      revokeAll();
      sessionRef.current += 1;
      editedCountRef.current = 0;
      const original = build({ file, kind: 'original', parentId: null });
      setVersions([original]);
      setActive(original.id);
      measure(original.id, original.url);
      return original;
    },
    [build, measure, revokeAll, setActive],
  );

  /** 버전 한 장 추가 후 활성화 */
  const add = useCallback(
    (spec: AddVersionSpec) => {
      const created = build(spec);
      setVersions((prev) => [...prev, created]);
      setActive(created.id);
      measure(created.id, created.url);
      return created;
    },
    [build, measure, setActive],
  );

  /** 여러 장을 한꺼번에 추가하고 첫 장을 활성화 (배경 시안 N종) */
  const addMany = useCallback(
    (specs: AddVersionSpec[]) => {
      if (!specs.length) return [];
      const created = specs.map(build);
      setVersions((prev) => [...prev, ...created]);
      setActive(created[0].id);
      created.forEach((v) => measure(v.id, v.url));
      return created;
    },
    [build, measure, setActive],
  );

  const select = useCallback((id: string) => setActive(id), [setActive]);

  const reset = useCallback(() => {
    revokeAll();
    sessionRef.current += 1;
    editedCountRef.current = 0;
    setVersions([]);
    setActive(null);
  }, [revokeAll, setActive]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const active = useMemo(
    () => versions.find((v) => v.id === activeId) ?? null,
    [versions, activeId],
  );

  return { versions, activeId, active, start, add, addMany, select, reset };
}

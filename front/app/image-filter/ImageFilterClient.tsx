'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import CanvasStage from '@/components/image-filter/CanvasStage';
import EmptyCanvas from '@/components/image-filter/EmptyCanvas';
import FilterToolbar from '@/components/image-filter/FilterToolbar';
import HistoryRail from '@/components/image-filter/HistoryRail';
import ImageLightbox from '@/components/image-filter/ImageLightbox';
import InstructionEditorModal from '@/components/image-filter/InstructionEditorModal';
import type { InstructionPatch } from '@/components/image-filter/InstructionEditorModal';
import InstructionPanel from '@/components/image-filter/InstructionPanel';
import type { PanelSection } from '@/components/image-filter/InstructionPanel';
import SessionThread from '@/components/image-filter/SessionThread';
import ThreadView from '@/components/image-filter/ThreadView';
import { useToast } from '@/components/providers/ToastProvider';
import { useAspectRatioInputs } from '@/hooks/useAspectRatioInputs';
import { useFileDrop } from '@/hooks/useFileDrop';
import { useImageVersions } from '@/hooks/useImageVersions';
import { isUserCancel } from '@/lib/api/authFetch';
import { triggerDownload } from '@/lib/api/download';
import { validateImageFile } from '@/lib/imageFile';
import {
  analyzeElements,
  deleteEditRecord,
  editAndResize,
  fetchBackgroundStyles,
  fetchEditHistory,
  fetchEditResultImage,
  suggestBackgrounds,
} from '@/lib/imageFilterClient';
import {
  composeEditPrompt,
  describeInstructions,
  stripResizeSuffix,
  type ResolvedInstruction,
} from '@/lib/imageFilterPrompt';
import type { HistoryEntry, HistoryGroup } from '@/lib/imageFilterHistory';
import {
  clearSession,
  peekSession,
  saveSession,
  subscribeSession,
  type StoredDraft,
  type StoredInstruction,
} from '@/lib/imageFilterStorage';
import { peekSidebarCollapsed, subscribeSidebarCollapsed } from '@/lib/sidebarStore';
import {
  DEFAULT_EDIT_VARIANTS,
  makeInstruction,
  MAX_INSTRUCTION_LENGTH,
} from '@/types/imageFilter';
import type {
  BackgroundStyle,
  EditPromptRecord,
  FilterFormState,
  FilterProcessingState,
  ImageDimensions,
  ImageElement,
  Instruction,
} from '@/types/imageFilter';

const INITIAL_FORM: FilterFormState = {
  targetWidth: '',
  targetHeight: '',
  keepAspectRatio: true,
  outputFormat: 'jpeg',
  useAiUpscale: false,
  variantCount: DEFAULT_EDIT_VARIANTS,
};

/** 지시가 없는 버전이 돌려줄 고정 배열 — 매 렌더 새 [] 를 만들지 않기 위한 것 */
const NO_INSTRUCTIONS: Instruction[] = [];

/** 전송할 지시 한 건 — 어느 지시에서 나왔는지 알아야 성공·실패 후처리를 할 수 있다 */
type SendPart = ResolvedInstruction & { id: string };

/** 지금 편집 중인 지시 — 되돌리기의 기준점(snapshot)과 소속 버전을 함께 들고 있다 */
interface EditingState {
  versionId: string;
  snapshot: Instruction;
  isNew: boolean;
}

/**
 * AI 이미지 정제 화면.
 *
 * 구조는 DM 을 닮은 3열이다 — 대화 목록(지난 작업) · 대화 열(스레드 + 보낼 지시) ·
 * 캔버스. 높이는 뷰포트에 고정된다. 캔버스를 남긴 이유: 요소 지정과 큰 화면 확인은
 * 말풍선 안에서 할 수 없다 (docs/이미지정제-DM형-UI-할일.md, 안 A).
 * 예전에는 하단에 입력 독이 붙은 세로 채팅형이었는데 세 가지가 겹쳐 답답했다 —
 * 공통 헤더 위에 페이지 헤더가 또 있었고, `min-h-screen` 이 뷰포트 높이를 한 번
 * 더 요구해 입력창을 보려면 스크롤부터 해야 했고, 요소 선택·출력 설정·배경 시안이
 * 전부 입력 독 안의 320px 스크롤 박스를 돌려 쓰고 있었다.
 *
 * 상태를 **버전별로** 보관하는 게 이 화면의 뼈대다. 요소 id 는 이미지마다 새로
 * 매겨지므로 분석 결과와 지시를 한 통에 담으면 버전을 오갈 때마다 서로 엉킨다.
 * 버전 id 로 칸을 나눠 두면 레일로 오가도 각자의 분석 결과와 지시가 그대로 돌아온다.
 */
export default function ImageFilterClient() {
  const { toast } = useToast();

  const [form, setForm] = useState<FilterFormState>(INITIAL_FORM);
  const [processing, setProcessing] = useState<FilterProcessingState>('idle');
  const [analyzing, setAnalyzing] = useState(false);
  const [bgLoading, setBgLoading] = useState(false);
  const [backgroundStyles, setBackgroundStyles] = useState<BackgroundStyle[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  // 버전별 보관 — 키는 버전 id
  const [elementsByVersion, setElementsByVersion] = useState<Record<string, ImageElement[]>>({});
  const [instructionsByVersion, setInstructionsByVersion] = useState<
    Record<string, Instruction[]>
  >({});

  const [openSection, setOpenSection] = useState<PanelSection | null>('elements');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  /**
   * 이미지를 올리기 전에 정해 둔 지시 — 첨부 직후 그대로 등록한다.
   * 예시를 고른 경우와 저장소에서 복구한 경우가 모두 여기로 들어온다.
   */
  const [seed, setSeed] = useState<StoredInstruction[]>([]);
  // 첨부 핸들러가 읽는 건 이 ref 다. state 만 쓰면 "시드 비우기 → 곧바로 첨부"가
  // 한 틱 안에 일어날 때(보관 시안으로 이어가기) 아직 갱신 전 시드를 캡처한
  // 핸들러가 돌아, 이미 적용된 지시가 그 결과물에 또 걸린다 — 검증에서 실제로 잡았다.
  const seedRef = useRef<StoredInstruction[]>(seed);
  useEffect(() => {
    seedRef.current = seed;
  }, [seed]);

  /* ── 저장소 복구 ────────────────────────────────────────────── */
  // localStorage 는 서버에 없다. effect 로 읽어 setState 하면 렌더가 한 번 더
  // 돌고, 렌더 중에 읽으면 서버(null)와 클라이언트가 달라 hydration 이 깨진다.
  // useSyncExternalStore 는 서버 스냅샷을 따로 받아 두 문제를 모두 피한다.
  const storedSession = useSyncExternalStore(subscribeSession, peekSession, () => null);
  /** 앱 사이드바 접힘 — 지난 작업 레일이 서는 최소 폭이 이 값에 따라 달라진다 */
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    peekSidebarCollapsed,
    () => false,
  );
  const [restoreHandled, setRestoreHandled] = useState(false);
  const restorable = restoreHandled ? null : storedSession;

  // 진행 중인 AI 요청의 취소 핸들 — 이미지 생성은 수십 초라 끊을 수단이 필요하다
  const abortRef = useRef<AbortController | null>(null);
  const insSeqRef = useRef(0);

  /* ── 버전 계보 ──────────────────────────────────────────────── */
  // 치수는 비동기로 도착한다. 측정이 끝나면 출력 크기를 그 이미지 크기로 맞추는데,
  // 이걸 effect 로 state 를 따라가게 만들면 렌더가 한 번 더 도는 데다 사용자가
  // 입력 중인 값을 덮을 위험도 있다 — "측정 완료"라는 사건에만 반응하게 둔다.
  const { versions, active, start, addMany, addVariants, select, reset } = useImageVersions(
    useCallback((dimensions: ImageDimensions) => {
      setForm((prev) => ({
        ...prev,
        targetWidth: String(dimensions.width),
        targetHeight: String(dimensions.height),
      }));
    }, []),
  );

  const sending = processing !== 'idle';
  const aiBusy = sending || analyzing || bgLoading;

  const activeId = active?.id ?? null;
  const elements = activeId ? (elementsByVersion[activeId] ?? null) : null;
  // 빈 배열을 인라인으로 쓰면 지시가 없는 버전에서 매 렌더 새 참조가 나와,
  // 이 값을 보는 memo 와 memo 컴포넌트가 전부 헛돈다 — 상수를 돌려준다.
  const instructions = useMemo(
    () => (activeId ? (instructionsByVersion[activeId] ?? NO_INSTRUCTIONS) : NO_INSTRUCTIONS),
    [activeId, instructionsByVersion],
  );

  /* ── 버전별 지시 갱신 도우미 ─────────────────────────────────── */
  // 토스트의 실행취소처럼 나중에 실행되는 콜백도 있어서, 버전 id 를 인자로 받아
  // "그때 보고 있던 버전"에 정확히 쓰도록 한다 (activeId 를 캡처하면 그 사이
  // 레일로 다른 버전을 고른 경우 엉뚱한 칸에 들어간다).
  const updateInstructions = useCallback(
    (versionId: string, updater: (prev: Instruction[]) => Instruction[]) => {
      setInstructionsByVersion((prev) => ({
        ...prev,
        [versionId]: updater(prev[versionId] ?? []),
      }));
    },
    [],
  );

  /* ── 배경 스타일 목록 ───────────────────────────────────────── */
  // 서버가 단일 출처 — 실패해도 화면은 그대로 쓸 수 있어야 해서 조용히 넘기고,
  // 목록이 비면 배경 시안 섹션만 안내 문구를 띄운다.
  useEffect(() => {
    let alive = true;
    fetchBackgroundStyles()
      .then((styles) => alive && setBackgroundStyles(styles))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* ── 지난 기록 ──────────────────────────────────────────────── */
  // 대화 목록(레일)이 늘 화면에 서 있으므로 들고 있는 목록이 없으면 바로 불러온다.
  // 전송에 성공하면 목록이 낡으므로 비우고, 그러면 이 effect 가 다시 불러온다.
  const [history, setHistory] = useState<EditPromptRecord[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /** 레일에서 열어 둔 지난 작업 스레드 — 첨부 전에만 쓰는 열람 화면이다 */
  const [threadGroup, setThreadGroup] = useState<HistoryGroup | null>(null);
  /** 지금 작업이 이어받은 지난 대화 — 스레드에서 이미지를 올려 시작했을 때만 남는다.
   *  작업 화면의 대화 위쪽에 읽기 전용으로 이어 붙여, 첨부하는 순간 대화가 끊기지 않게 한다 */
  const [pastThread, setPastThread] = useState<HistoryGroup | null>(null);
  /** 이미지 보관 일수 — 서버 설정이 단일 출처라 응답에서 받아 화면 고지에 쓴다 */
  const [retentionDays, setRetentionDays] = useState(14);

  useEffect(() => {
    if (history !== null) return;
    const controller = new AbortController();
    fetchEditHistory(20, controller.signal)
      .then((data) => {
        setHistory(data.items);
        if (data.retention_days > 0) setRetentionDays(data.retention_days);
      })
      .catch((err) => {
        if (isUserCancel(err)) return;
        setHistoryError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.');
        setHistory([]);
      });
    return () => controller.abort();
  }, [history]);

  /**
   * 지난 작업 묶음을 "그때 그 작업"으로 불러온다 (레일 클릭).
   *
   * 기록은 최신순으로 쌓여 있지만 대화로 불러올 때는 시간순이 맞다 — 그때
   * 보낸 순서대로 다시 서야 "이어서 한다"가 성립한다.
   *
   * 첨부 전이면 **대화 스레드를 연다** — 말풍선으로 기록을 읽고, 그 안에서
   * 이미지를 올리면 이어진다. 시드는 여는 순간 미리 걸어 둔다: 첨부 핸들러가
   * 시드 상태를 읽으므로, 올리는 그 틱에 걸면 한 박자 늦어 비어 있다.
   *
   * 작업 중이면 열람 대신 현재 이미지의 지시 목록에 바로 등록한다 — 지금
   * 작업을 덮는 화면 전환보다 이어 붙이는 쪽이 의도에 가깝다.
   */
  const handleLoadGroup = useCallback(
    (group: HistoryGroup) => {
      const prompts = [...group.items]
        .reverse()
        .map(({ text }) => text.slice(0, MAX_INSTRUCTION_LENGTH));

      if (!activeId) {
        setSeed(prompts.map((text) => ({ text })));
        setThreadGroup(group);
        return;
      }

      const created = prompts.map((text) => {
        insSeqRef.current += 1;
        return makeInstruction(insSeqRef.current, null, text);
      });
      const createdIds = new Set(created.map((ins) => ins.id));
      const versionId = activeId;
      updateInstructions(versionId, (prev) => [...prev, ...created]);
      toast('success', `지난 작업 ${created.length}건을 지시로 불러왔어요`, {
        label: '실행취소',
        onClick: () =>
          updateInstructions(versionId, (prev) => prev.filter((ins) => !createdIds.has(ins.id))),
      });
    },
    [activeId, toast, updateInstructions],
  );

  /** 스레드 닫기 — 걸어 둔 시드도 함께 거둔다 (닫고 새로 첨부했는데 옛 지시가
   *  따라붙으면 놀란다) */
  const handleCloseThread = useCallback(() => {
    setThreadGroup(null);
    setSeed([]);
  }, []);

  // 비동기 이어가기(이미지 내려받은 뒤 첨부)가 "그 시점의 최신" 첨부 핸들러를
  // 쓰도록 ref 로 넘긴다 — await 사이에 seed 를 비웠는데 낡은 클로저가 옛 seed 를
  // 읽으면, 이미 적용된 지시가 그 결과물에 또 걸린다. ref 동기화는 handleAttach
  // 선언 뒤의 effect 가 맡는다 (선언 전 참조는 컴파일러 최적화를 깬다).
  const attachRef = useRef<(file: File) => boolean>(() => false);

  /**
   * 보관된 시안 하나로 이어서 작업한다 (스레드의 썸네일 클릭).
   *
   * 시드를 걸지 않는 것이 핵심이다 — 그 시안에는 이 대화의 지시가 **이미 적용돼
   * 있다.** 같은 지시를 또 걸면 "배경을 하얗게"가 두 번 적용된 결과를 만들게 된다.
   */
  const handleContinueFrom = useCallback(
    async (entry: HistoryEntry, index: number) => {
      try {
        const file = await fetchEditResultImage(
          entry.recordId,
          index,
          threadGroup?.filename ?? 'edited.jpg',
        );
        // ref 를 직접 비워야 바로 다음 줄의 첨부가 빈 시드를 본다 — setSeed 만으로는
        // 이 틱의 핸들러가 여전히 옛 시드를 읽는다 (이중 적용 사고의 지점).
        seedRef.current = [];
        setSeed([]);
        attachRef.current(file);
      } catch (err) {
        const message = err instanceof Error ? err.message : '시안을 불러오지 못했습니다.';
        toast('error', message);
      }
    },
    [threadGroup, toast],
  );

  /** 기록 한 건 삭제 — 스레드와 목록 양쪽에서 바로 사라져야 한다 */
  const handleDeleteRecord = useCallback(
    async (entry: HistoryEntry) => {
      try {
        await deleteEditRecord(entry.recordId);
      } catch (err) {
        const message = err instanceof Error ? err.message : '삭제에 실패했습니다.';
        toast('error', message);
        return;
      }
      setHistory((prev) => (prev ? prev.filter((r) => r.id !== entry.recordId) : prev));
      setThreadGroup((prev) => {
        if (!prev) return prev;
        const items = prev.items.filter((item) => item.recordId !== entry.recordId);
        return items.length ? { ...prev, items } : null;
      });
      toast('success', '기록을 삭제했어요 — 보관된 시안도 함께 지웠습니다');
    },
    [toast],
  );

  /* ── 버전 전환 ──────────────────────────────────────────────── */
  // 레일로 다른 버전을 고르면 출력 크기도 그 이미지 기준으로 되돌린다.
  // (새로 만들어진 버전은 측정 콜백이 맡으므로 여기선 이미 측정된 것만 다룬다)
  const handleSelectVersion = useCallback(
    (versionId: string) => {
      select(versionId);
      const picked = versions.find((v) => v.id === versionId);
      if (picked?.dimensions) {
        setForm((prev) => ({
          ...prev,
          targetWidth: String(picked.dimensions!.width),
          targetHeight: String(picked.dimensions!.height),
        }));
      }
    },
    [select, versions],
  );

  const { onWidthChange, onHeightChange } = useAspectRatioInputs(
    active?.dimensions ?? null,
    setForm,
  );

  /* ── 이미지 첨부 (버튼·드래그·붙여넣기 공통 진입점) ─────────── */
  const handleAttach = useCallback(
    (file: File): boolean => {
      const problem = validateImageFile(file);
      if (problem) {
        setLastError(problem);
        toast('error', problem);
        return false;
      }

      // 이미지가 바뀌면 요소 id 가 새로 매겨지므로 요소를 지정한 지시는 쓸 수 없다.
      // 반면 "이미지 전체" 지시는 그대로 유효하니 새 원본으로 옮겨 준다 —
      // 같은 지시를 다른 이미지에 적용해 보는 건 흔한 작업이다.
      const carried: Instruction[] = (activeId ? (instructionsByVersion[activeId] ?? []) : [])
        .filter((ins) => ins.targetElementId === null && ins.text.trim())
        .map((ins) => ({ ...ins, status: 'draft' }));

      abortRef.current?.abort();
      const original = start(file);

      setElementsByVersion({});

      // 미리 정해 둔 지시(예시 선택 · 저장소 복구)를 첫 지시로 등록한다.
      // 복구된 지시 중 원래 특정 요소를 가리키던 건 needsTarget 을 달아 전송에서
      // 빼 둔다 — 대상 없이 보내면 "로고를 지워줘"가 이미지 전체 지시가 된다.
      seedRef.current.forEach((item) => {
        insSeqRef.current += 1;
        const created = makeInstruction(insSeqRef.current, null, item.text);
        carried.push(
          item.targetHint
            ? { ...created, needsTarget: true, enabled: false, targetHint: item.targetHint }
            : created,
        );
      });
      if (seedRef.current.length) {
        seedRef.current = [];
        setSeed([]);
      }

      setInstructionsByVersion(carried.length ? { [original.id]: carried } : {});
      setForm((prev) => ({ ...prev, targetWidth: '', targetHeight: '' }));
      setLastError(null);
      setEditing(null);
      // 스레드 안에서 올렸든 어디서 올렸든, 첨부되면 열람은 끝나고 작업이 시작된다.
      // 스레드에서 시작한 작업이면 그 대화를 작업 화면으로 넘겨 이어서 보여 준다.
      // 작업 중에 이미지를 바꾼 경우(activeId 있음)는 다른 대화라 넘기지 않는다.
      setPastThread(activeId ? null : threadGroup);
      setThreadGroup(null);
      setOpenSection('elements');
      return true;
    },
    [activeId, instructionsByVersion, start, threadGroup, toast],
  );

  // 매 렌더 최신 첨부 핸들러를 ref 에 반영 — handleContinueFrom 의 비동기 흐름이 쓴다
  useEffect(() => {
    attachRef.current = handleAttach;
  }, [handleAttach]);

  /* ── 새 작업 ────────────────────────────────────────────────── */
  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    reset();
    setElementsByVersion({});
    setInstructionsByVersion({});
    setForm(INITIAL_FORM);
    setLastError(null);
    setEditing(null);
    setZoomOpen(false);
    setSeed([]);
    setPastThread(null);
    setOpenSection('elements');
    // 사용자가 직접 비운 것이므로 저장해 둔 초안도 같이 버린다 —
    // 안 그러면 방금 치운 지시가 복구 배너로 다시 올라온다
    clearSession();
    setRestoreHandled(true);
  }, [reset]);

  /* ── 복구 ───────────────────────────────────────────────────── */
  const handleRestore = useCallback(() => {
    if (!storedSession) return;
    setSeed(storedSession.instructions);
    setForm((prev) => ({
      ...prev,
      outputFormat: storedSession.outputFormat,
      keepAspectRatio: storedSession.keepAspectRatio,
    }));
    setRestoreHandled(true);
    toast('info', `지시 ${storedSession.instructions.length}건을 불러왔어요. 이미지를 첨부해 주세요.`);
  }, [storedSession, toast]);

  const handleDiscardRestore = useCallback(() => {
    clearSession();
    setRestoreHandled(true);
  }, []);

  /* ── 요소 분석 ──────────────────────────────────────────────── */
  const handleAnalyze = useCallback(async () => {
    if (!active || aiBusy) return;
    const versionId = active.id;
    const target = active.file;

    setAnalyzing(true);
    setOpenSection('elements');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const found = await analyzeElements(target, controller.signal);
      // 결과를 그 버전의 칸에만 넣는다 — 늦게 도착해도 다른 이미지에 박스가 붙지 않는다
      setElementsByVersion((prev) => ({ ...prev, [versionId]: found }));

      // 다시 분석하면 요소 id 가 새로 매겨진다. 예전에는 요소별 초안을 그냥 버렸는데,
      // 애써 쓴 글을 날리는 대신 대상만 비워 두고 다시 고르게 한다.
      const foundIds = new Set(found.map((el) => el.id));
      updateInstructions(versionId, (prev) =>
        prev.map((ins) =>
          ins.targetElementId !== null && !foundIds.has(ins.targetElementId)
            ? { ...ins, targetElementId: null }
            : ins,
        ),
      );

      if (!found.length) {
        toast('info', '선택할 수 있는 요소를 찾지 못했어요. 이미지 전체 지시로 편집해 보세요.');
      }
    } catch (err) {
      if (!isUserCancel(err)) {
        const message = err instanceof Error ? err.message : '요소 분석에 실패했습니다.';
        setLastError(message);
        toast('error', message);
      }
    } finally {
      abortRef.current = null;
      setAnalyzing(false);
    }
  }, [active, aiBusy, toast, updateInstructions]);

  /* ── 편집 요청 전송 ─────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    if (!active || aiBusy) return;
    const versionId = active.id;
    const list = instructionsByVersion[versionId] ?? [];
    const versionElements = elementsByVersion[versionId] ?? null;

    // 체크를 켠 지시만 보낸다. 예전에는 써 둔 지시가 전부 함께 전송돼, 써 두고
    // 잊은 지시가 결과물과 AI 호출 비용을 조용히 바꿔 놓았다.
    const parts: SendPart[] = list
      .filter((ins) => ins.enabled && ins.text.trim())
      .map((ins) => ({
        id: ins.id,
        element:
          ins.targetElementId === null
            ? null
            : (versionElements?.find((el) => el.id === ins.targetElementId) ?? null),
        text: ins.text.trim(),
        targeted: ins.targetElementId !== null,
      }))
      // 재분석으로 대상이 사라진 지시는 좌표를 붙일 수 없어 보내지 않는다
      .filter((part) => !part.targeted || part.element)
      .map(({ id, element, text }) => ({ id, element, text }));

    if (!parts.length) return;

    const width = parseInt(form.targetWidth, 10) || 0;
    const height = parseInt(form.targetHeight, 10) || 0;
    const note = describeInstructions(parts);
    const sentIds = new Set(parts.map((part) => part.id));

    setLastError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { provider, failed, variants } = await editAndResize(
        active.file,
        composeEditPrompt(parts),
        width,
        height,
        form.outputFormat,
        form.variantCount,
        () => setProcessing('compressing'),
        () => setProcessing('editing'),
        controller.signal,
      );

      // base64 를 상태에 두면 렌더마다 수 MB 문자열을 재조립한다 — File 로 바꿔 보관
      // (배경 시안과 같은 처리). 서버가 덧붙이는 _resized_WxH 를 걷어내지 않으면
      // 이 결과를 이어서 편집할 때마다 이름이 길어진다.
      const specs = await Promise.all(
        variants.map(async (variant) => {
          const blob = await (
            await fetch(`data:${variant.mime};base64,${variant.image_base64}`)
          ).blob();
          return {
            file: new File([blob], stripResizeSuffix(variant.filename), {
              type: variant.mime || 'image/png',
            }),
            parentId: versionId,
            provider,
            filename: variant.filename,
            note,
          };
        }),
      );
      // 시안 N장을 한 단계로 묶어 올리고 첫 장을 활성화한다. 사용자가 레일에서
      // 다른 장을 고르면 다음 편집은 그 장에서 이어진다 — 고른 1장만 승격되는 셈이다.
      addVariants(specs);

      // 보낸 지시는 원래 버전의 목록에서 빠진다 — 기록은 새 버전의 note 로 남는다
      updateInstructions(versionId, (prev) => prev.filter((ins) => !sentIds.has(ins.id)));
      // 방금 보낸 지시가 서버 기록에 더해졌다 — 들고 있던 목록은 낡았으므로 비운다.
      // 여기서 직접 다시 부르지 않고 비우기만 하는 이유: 불러오기 조건을 한 군데
      // (아래 effect)에 두기 위해서다. 기록 섹션이 열려 있으면 effect 가 곧바로
      // 다시 불러오고, 닫혀 있으면 다음에 열 때 불러온다 — 기록을 보지 않는
      // 사람에게 요청이 나가지 않는다.
      setHistory(null);
      // 일부만 성공한 경우를 숨기지 않는다 — 4장을 요청했는데 3장만 오면
      // 사용자는 이유를 알 수 없고, 빠진 장수만큼 다시 눌러 볼 근거도 없다.
      toast(
        failed > 0 ? 'info' : 'success',
        failed > 0
          ? `시안 ${specs.length}장을 만들었어요 — ${failed}장은 실패했습니다`
          : `시안 ${specs.length}장을 만들었어요 — 지시 ${parts.length}건 적용`,
      );
    } catch (err) {
      // 사용자가 직접 끊은 건 실패가 아니다. 그 외에는 지시를 목록에 그대로 남겨
      // 두고 실패 표시만 붙인다 — 예전처럼 비웠다 되살리는 복구 과정이 필요 없다.
      if (!isUserCancel(err)) {
        const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
        setLastError(message);
        toast('error', message);
        updateInstructions(versionId, (prev) =>
          prev.map((ins) => (sentIds.has(ins.id) ? { ...ins, status: 'failed' } : ins)),
        );
      }
    } finally {
      abortRef.current = null;
      setProcessing('idle');
    }
  }, [
    active,
    aiBusy,
    addVariants,
    elementsByVersion,
    form.outputFormat,
    form.targetHeight,
    form.targetWidth,
    form.variantCount,
    instructionsByVersion,
    toast,
    updateInstructions,
  ]);

  /* ── 배경 시안 생성 ─────────────────────────────────────────── */
  const handleBackgrounds = useCallback(
    async (styles: string[], customs: string[]) => {
      if (!active || aiBusy || !(styles.length + customs.length)) return;
      const versionId = active.id;
      const baseName = active.file.name.replace(/\.[^.]+$/, '');

      setBgLoading(true);
      setLastError(null);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const variants = await suggestBackgrounds(
          active.file,
          styles,
          customs,
          controller.signal,
        );
        // base64 를 상태에 두면 렌더마다 수 MB 문자열을 재조립한다 — File 로 바꿔 보관
        const files = await Promise.all(
          variants.map(async (variant) => {
            const blob = await (
              await fetch(`data:${variant.mime};base64,${variant.image_base64}`)
            ).blob();
            const filename = `${baseName}_bg_${variant.style}.png`;
            return {
              file: new File([blob], filename, { type: variant.mime || 'image/png' }),
              kind: 'background' as const,
              parentId: versionId,
              label: variant.label,
              filename,
              note: `배경을 "${variant.label}" 스타일로`,
            };
          }),
        );
        addMany(files);
        toast('success', `배경 시안 ${files.length}종을 만들었어요`);
      } catch (err) {
        if (!isUserCancel(err)) {
          const message = err instanceof Error ? err.message : '배경 시안 생성에 실패했습니다.';
          setLastError(message);
          toast('error', message);
        }
      } finally {
        abortRef.current = null;
        setBgLoading(false);
      }
    },
    [active, addMany, aiBusy, toast],
  );

  const handleCancel = useCallback(() => abortRef.current?.abort(), []);

  /* ── 지시 편집 ──────────────────────────────────────────────── */

  /**
   * 되돌리기 · 실행취소 공통 복원.
   *
   * 세 가지 경우를 한 함수로 덮는다 — 고친 걸 되돌리기(교체), 지운 걸 되살리기
   * (재삽입), 새로 만든 걸 없애기(제거).
   */
  const restoreInstruction = useCallback(
    (versionId: string, snapshot: Instruction, wasNew: boolean) => {
      updateInstructions(versionId, (prev) => {
        if (wasNew) return prev.filter((ins) => ins.id !== snapshot.id);
        return prev.some((ins) => ins.id === snapshot.id)
          ? prev.map((ins) => (ins.id === snapshot.id ? snapshot : ins))
          : [...prev, snapshot];
      });
    },
    [updateInstructions],
  );

  const openEditor = useCallback(
    (instructionId: string) => {
      if (!activeId) return;
      const found = (instructionsByVersion[activeId] ?? []).find(
        (ins) => ins.id === instructionId,
      );
      if (found) setEditing({ versionId: activeId, snapshot: found, isNew: false });
    },
    [activeId, instructionsByVersion],
  );

  /**
   * 대상을 정해 새 지시를 만든다 (이미지 위 요소 클릭 · 요소 칩 · 지시 추가).
   *
   * 요소를 눌렀을 때 그 요소에 이미 지시가 있으면 새로 만들지 않고 그걸 연다 —
   * 같은 대상 카드가 두 장 생기면 어느 쪽이 반영될지 알 수 없다. "이미지 전체"는
   * 여러 건을 따로 적는 게 자연스러우므로 그대로 새로 만든다.
   */
  const openNewEditor = useCallback(
    (targetElementId: number | null) => {
      if (!activeId) return;
      const list = instructionsByVersion[activeId] ?? [];

      if (targetElementId !== null) {
        const existing = list.find((ins) => ins.targetElementId === targetElementId);
        if (existing) {
          setEditing({ versionId: activeId, snapshot: existing, isNew: false });
          return;
        }
      }

      insSeqRef.current += 1;
      const created = makeInstruction(insSeqRef.current, targetElementId);
      updateInstructions(activeId, (prev) => [...prev, created]);
      setEditing({ versionId: activeId, snapshot: created, isNew: true });
    },
    [activeId, instructionsByVersion, updateInstructions],
  );

  /**
   * 패널 입력칸에서 지시를 바로 추가한다 — 모달을 거치지 않는다.
   *
   * 모달은 긴 글을 쓰거나 대상 요소를 지정할 때만 쓴다. 한 줄 지시가 대부분인데
   * 그때마다 모달이 열리면 캔버스가 덮이고 타이핑 전에 클릭이 한 번 더 든다.
   * 대상은 항상 "이미지 전체"다 — 요소 지정은 캔버스나 요소 칩에서 들어온다.
   */
  const handleQuickAddInstruction = useCallback(
    (text: string) => {
      if (!activeId) return;
      const trimmed = text.trim().slice(0, MAX_INSTRUCTION_LENGTH);
      if (!trimmed) return;

      insSeqRef.current += 1;
      const created = makeInstruction(insSeqRef.current, null, trimmed);
      updateInstructions(activeId, (prev) => [...prev, created]);
      toast('success', '지시를 추가했어요', {
        label: '실행취소',
        onClick: () => restoreInstruction(activeId, created, true),
      });
    },
    [activeId, restoreInstruction, toast, updateInstructions],
  );

  /**
   * 모달이 닫힐 때(밖 클릭 · Esc · X · 저장) 호출된다 — 닫는 모든 경로가 저장이다.
   *
   * 내용이 비면 삭제로 처리한다. 그러지 않으면 실수로 열었다 닫을 때마다 "내용 없음"
   * 카드가 목록에 쌓인다. 어느 쪽이든 실행취소를 붙여 되돌릴 수 있게 한다.
   */
  const handleSaveInstruction = useCallback(
    (patch: InstructionPatch) => {
      if (!editing) return;
      const { versionId, snapshot, isNew } = editing;
      const trimmed = patch.text.trim();
      const changed =
        trimmed !== snapshot.text.trim() || patch.targetElementId !== snapshot.targetElementId;

      setEditing(null);

      if (!trimmed) {
        updateInstructions(versionId, (prev) => prev.filter((ins) => ins.id !== snapshot.id));
        if (snapshot.text.trim()) {
          toast('info', '내용이 비어 지시를 지웠어요', {
            label: '실행취소',
            onClick: () => restoreInstruction(versionId, snapshot, false),
          });
        }
        return;
      }

      updateInstructions(versionId, (prev) =>
        prev.map((ins) =>
          ins.id === snapshot.id
            ? {
                ...ins,
                text: patch.text,
                targetElementId: patch.targetElementId,
                enabled: true,
                status: 'draft',
                // 대상을 직접 확인했으므로("이미지 전체"를 고른 것도 선택이다)
                // 복구 지시에 달려 있던 "대상 다시 고르기" 표시를 뗀다
                needsTarget: false,
                targetHint: undefined,
              }
            : ins,
        ),
      );

      if (changed) {
        toast('success', isNew ? '지시를 추가했어요' : '지시를 저장했어요', {
          label: '실행취소',
          onClick: () => restoreInstruction(versionId, snapshot, isNew),
        });
      }
    },
    [editing, restoreInstruction, toast, updateInstructions],
  );

  const handleRevertInstruction = useCallback(() => {
    if (!editing) return;
    const { versionId, snapshot, isNew } = editing;
    setEditing(null);
    restoreInstruction(versionId, snapshot, isNew);
  }, [editing, restoreInstruction]);

  const handleDeleteEditing = useCallback(() => {
    if (!editing) return;
    const { versionId, snapshot } = editing;
    setEditing(null);
    updateInstructions(versionId, (prev) => prev.filter((ins) => ins.id !== snapshot.id));
    toast('info', '지시를 지웠어요', {
      label: '실행취소',
      onClick: () => restoreInstruction(versionId, snapshot, false),
    });
  }, [editing, restoreInstruction, toast, updateInstructions]);

  const handleDeleteInstruction = useCallback(
    (instructionId: string) => {
      if (!activeId) return;
      const snapshot = (instructionsByVersion[activeId] ?? []).find(
        (ins) => ins.id === instructionId,
      );
      if (!snapshot) return;
      updateInstructions(activeId, (prev) => prev.filter((ins) => ins.id !== instructionId));
      toast('info', '지시를 지웠어요', {
        label: '실행취소',
        onClick: () => restoreInstruction(activeId, snapshot, false),
      });
    },
    [activeId, instructionsByVersion, restoreInstruction, toast, updateInstructions],
  );

  const handleToggleInstruction = useCallback(
    (instructionId: string) => {
      if (!activeId) return;
      updateInstructions(activeId, (prev) =>
        prev.map((ins) => (ins.id === instructionId ? { ...ins, enabled: !ins.enabled } : ins)),
      );
    },
    [activeId, updateInstructions],
  );

  /* ── 지시를 써 둔 요소 ──────────────────────────────────────── */
  // 매 렌더 새 Set 을 만들면 지시를 타이핑할 때마다 ElementOverlay(memo)가 깨진다 —
  // 집합의 "내용"은 지시가 생기거나 비워질 때만 바뀌므로 내용 키로 참조를 안정시킨다.
  const instructedKey = instructions
    .filter((ins) => ins.text.trim() && ins.targetElementId !== null)
    .map((ins) => ins.targetElementId)
    .sort((a, b) => (a ?? 0) - (b ?? 0))
    .join(',');
  const instructedIds = useMemo(
    () => new Set(instructedKey ? instructedKey.split(',').map(Number) : []),
    [instructedKey],
  );

  /* ── 페이지 전체 드래그&드롭 ────────────────────────────────── */
  const onFiles = useCallback((files: File[]) => handleAttach(files[0]), [handleAttach]);
  const { isDragging, handlers } = useFileDrop(onFiles, aiBusy);

  /* ── 클립보드 붙여넣기 ─────────────────────────────────────── */
  // 예전에는 프롬프트 textarea 의 onPaste 였다. 그 칸이 모달로 옮겨 갔으니 문서
  // 수준에서 받되, 입력칸 안에서의 붙여넣기와 모달이 열린 동안은 건드리지 않는다.
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (aiBusy || editing || zoomOpen) return;
      const node = event.target as HTMLElement | null;
      if (node?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith('image/'),
      );
      const pasted = item?.getAsFile();
      if (pasted) {
        event.preventDefault();
        handleAttach(pasted);
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [aiBusy, editing, handleAttach, zoomOpen]);

  /* ── 지시 자동 저장 ────────────────────────────────────────── */
  // 새로고침·뒤로가기로 사라지던 지시를 브라우저에 남긴다. 이미지는 저장하지 않으므로
  // (서버에도 저장하지 않는다는 약속과 같은 이유) 복구하면 이미지만 다시 첨부하면 된다.
  //
  // 저장할 내용을 렌더 중에 만들어 문자열로 굳힌다. 그러면 effect 의 의존성이
  // "저장할 내용" 딱 하나가 되어, 저장 대상 필드가 늘어나도 의존성을 따로 챙길 필요가
  // 없다. 예전에는 일부 필드만 추려 만든 키를 의존성으로 쓰고 exhaustive-deps 를
  // 꺼 뒀는데, 그 방식은 키에 빠진 필드가 바뀌면 저장이 조용히 건너뛴다 —
  // 실제로 targetHint 가 그 구멍에 걸려 있었다.
  const pendingSave = useMemo(() => {
    if (!active) return null;
    const draft: StoredDraft = {
      imageName: active.file.name,
      outputFormat: form.outputFormat,
      keepAspectRatio: form.keepAspectRatio,
      instructions: instructions
        .filter((ins) => ins.text.trim())
        .map((ins) => {
          // 요소 id 는 복구 때 못 쓴다 — 사람이 읽는 이름만 남겨 다시 고르게 한다
          const label =
            ins.targetElementId === null
              ? undefined
              : elements?.find((el) => el.id === ins.targetElementId)?.label;
          const targetHint = label ?? ins.targetHint;
          return targetHint ? { text: ins.text, targetHint } : { text: ins.text };
        }),
    };
    return JSON.stringify(draft);
  }, [active, elements, form.keepAspectRatio, form.outputFormat, instructions]);

  useEffect(() => {
    if (!pendingSave) return;
    // 문자열이 변경 감지와 저장할 값을 겸한다 — 되돌려 쓰는 비용은 디바운스 1회분이다
    const timer = setTimeout(() => saveSession(JSON.parse(pendingSave) as StoredDraft), 500);
    return () => clearTimeout(timer);
  }, [pendingSave]);

  /* ── 언마운트 정리 ──────────────────────────────────────────── */
  // 정리 시점의 최신 컨트롤러를 봐야 한다 — 마운트 때 값을 담아 두면(그때는 null)
  // 떠나는 순간 돌고 있던 요청을 못 끊는다. objectURL 해제는 useImageVersions 가 맡는다.
  useEffect(() => () => abortRef.current?.abort(), []);

  /* ── 진행 상태 문구 ─────────────────────────────────────────── */
  const statusText = analyzing
    ? '이미지 속 요소를 분석하는 중...'
    : bgLoading
      ? '배경 시안을 만드는 중 — 수십 초 걸릴 수 있어요'
      : processing === 'compressing'
        ? '이미지를 압축하는 중...'
        : processing === 'editing'
          ? 'Gemini가 이미지를 편집하는 중 — 보통 5~10초 걸려요'
          : null;

  const original = versions[0] ?? null;

  /* ── 렌더 ───────────────────────────────────────────────────── */
  return (
    <div
      {...handlers}
      className="flex flex-col lg:h-[calc(100dvh-var(--header-h))] lg:overflow-hidden bg-bg"
    >
      {/* 드래그 중 오버레이 */}
      {isDragging && (
        <div className="fixed inset-0 z-[var(--z-modal)] bg-indigo-500/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-indigo-400 bg-surface px-8 py-6 shadow-overlay">
            <i className="bx bx-image-add text-3xl text-indigo-500" />
            <p className="font-semibold text-fg">여기에 놓으면 이미지가 첨부됩니다</p>
          </div>
        </div>
      )}

      {/* 왼쪽은 대화 목록(지난 작업)이다. 폭이 모자라면 레일이 스스로 숨는다 —
          그때는 첨부 전 화면 가운데 블록이 같은 기록을 보여 준다. */}
      <div className="flex-1 min-h-0 flex">
        <HistoryRail
          history={history}
          historyError={historyError}
          onLoadGroup={handleLoadGroup}
          selectedFilename={threadGroup?.filename ?? pastThread?.filename ?? null}
          sidebarCollapsed={sidebarCollapsed}
          disabled={aiBusy}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      {active && original ? (
        <>
          <FilterToolbar
            original={original}
            form={form}
            onOpenSettings={() => setOpenSection('settings')}
            onReplace={handleAttach}
            onReset={handleReset}
            locked={aiBusy}
          />

          <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
            <div className="flex min-h-[55vh] lg:min-h-0 flex-1 min-w-0">
              <CanvasStage
                versions={versions}
                active={active}
                onSelectVersion={handleSelectVersion}
                elements={elements}
                instructedIds={instructedIds}
                editingElementId={editing?.snapshot.targetElementId ?? null}
                onPickElement={openNewEditor}
                locked={sending}
                statusText={statusText}
                onZoom={() => setZoomOpen(true)}
                onDownload={() => triggerDownload(active.file, active.filename)}
              />
            </div>

            <InstructionPanel
              thread={
                <SessionThread
                  versions={versions}
                  activeId={active.id}
                  onSelectVersion={handleSelectVersion}
                  past={pastThread}
                  retentionDays={retentionDays}
                  pendingText={sending || bgLoading ? statusText : null}
                  disabled={sending}
                />
              }
              instructions={instructions}
              elements={elements}
              onAddInstruction={() => openNewEditor(null)}
              onQuickAddInstruction={handleQuickAddInstruction}
              onEditInstruction={openEditor}
              onDeleteInstruction={handleDeleteInstruction}
              onToggleInstruction={handleToggleInstruction}
              openSection={openSection}
              onOpenSection={setOpenSection}
              history={history}
              historyError={historyError}
              analyzing={analyzing}
              onAnalyze={handleAnalyze}
              onPickElement={openNewEditor}
              backgroundStyles={backgroundStyles}
              bgLoading={bgLoading}
              onSuggestBackgrounds={handleBackgrounds}
              form={form}
              originalDimensions={active.dimensions}
              onWidthChange={onWidthChange}
              onHeightChange={onHeightChange}
              onToggleAspectRatio={() =>
                setForm((prev) => ({ ...prev, keepAspectRatio: !prev.keepAspectRatio }))
              }
              onFormatChange={(outputFormat) => setForm((prev) => ({ ...prev, outputFormat }))}
              onVariantCountChange={(variantCount) =>
                setForm((prev) => ({ ...prev, variantCount }))
              }
              retentionDays={retentionDays}
              sending={sending}
              onSend={handleSend}
              onCancel={handleCancel}
              aiBusy={aiBusy}
              lastError={lastError}
              onDismissError={() => setLastError(null)}
            />
          </div>
        </>
      ) : (
        threadGroup ? (
        <ThreadView
          group={threadGroup}
          retentionDays={retentionDays}
          onAttach={handleAttach}
          onContinueFrom={handleContinueFrom}
          onDeleteRecord={handleDeleteRecord}
          onClose={handleCloseThread}
          disabled={aiBusy}
        />
      ) : (
        <EmptyCanvas
          onAttach={handleAttach}
          seed={seed}
          onSeed={setSeed}
          restorable={restorable}
          onRestore={handleRestore}
          onDiscardRestore={handleDiscardRestore}
          history={history}
          historyError={historyError}
          sidebarCollapsed={sidebarCollapsed}
          error={lastError}
        />
      ))}
        </div>
      </div>

      {editing && active && (
        <InstructionEditorModal
          key={editing.snapshot.id}
          instruction={editing.snapshot}
          isNew={editing.isNew}
          elements={elements}
          previewUrl={active.url}
          onSave={handleSaveInstruction}
          onRevert={handleRevertInstruction}
          onDelete={handleDeleteEditing}
        />
      )}

      {zoomOpen && active && (
        <ImageLightbox
          version={active}
          onClose={() => setZoomOpen(false)}
          onDownload={() => triggerDownload(active.file, active.filename)}
        />
      )}
    </div>
  );
}


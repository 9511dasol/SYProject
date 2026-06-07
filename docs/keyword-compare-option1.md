# Keyword Compare — Option 1 구현 메모

## 개요

현재 구현된 Option 2는 "이미 이번/이전 비교 컬럼이 포함된 Excel 파일"을 업로드해 파싱하는 방식이다.  
Option 1은 **원본 파일 2개**(기간 A, 기간 B)를 업로드하면 시스템이 자동으로 VLOOKUP 역할을 수행해 비교 결과를 생성한다.

---

## Option 1 파일 형식 확인 필요 사항

원본 파일(광고 플랫폼에서 직접 내려받는 SA 성과 리포트) 구조를 파악해야 한다.  
예시 파일 확인 후 아래 항목을 채울 것:

- [ ] 컬럼 구성 (헤더 행 위치, 주요 컬럼명)
- [ ] 키 컬럼 (캠페인유형 / 기기 / 키워드 / 전환유형에 해당하는 컬럼)
- [ ] 수치 컬럼 (전환수, 전환금액)
- [ ] 날짜·기간 정보 위치

---

## 백엔드 구현 계획

### 서비스: `keyword_compare_service.py` 확장

```python
def compare_two_files(self, content_a: bytes, content_b: bytes) -> list[dict]:
    """
    두 원본 Excel 파일을 읽어 키별 병합 후 diff 계산.
    
    복합 키: (campaign_type, device, keyword, conv_type)
    - A에만 있음 → status='gone' (이전 기간에만 존재)
    - B에만 있음 → status='new'  (이번 기간에만 존재)
    - 둘 다 있음  → diff 계산 후 up/down/same
    """
```

### 라우터: `keyword_compare_router.py` 추가 엔드포인트

```python
@router.post("/compare-two")
async def compare_two_files(
    file_a: UploadFile = File(...),  # 이전 기간
    file_b: UploadFile = File(...),  # 이번 기간
) -> dict:
    ...
```

---

## 프론트엔드 구현 계획

### UploadZone 변경

Option 2의 단일 파일 업로드 대신, 기간 A/B 두 영역을 나란히 표시한다.

```
┌──────────────────┐  ┌──────────────────┐
│  이전 기간       │  │  이번 기간       │
│  (파일 A)        │  │  (파일 B)        │
│  .xlsx 드래그    │  │  .xlsx 드래그    │
└──────────────────┘  └──────────────────┘
            [비교 분석 시작 →]
```

### 선택적 기간 레이블

각 파일 옆에 날짜 입력(optional)을 두어 "2026년 5월 3주차" 같은 레이블을 붙일 수 있도록 한다.

---

## 공유 로직 (Option 2와 재사용 가능)

- `CompareRow`, `SheetSummary`, `CompareSheet` 타입 → 동일 사용
- `FileCompareClient.tsx`의 `ResultView`, `SummaryCards`, `FilterBar`, `CompareTable` → 그대로 재사용
- 업로드 UI만 분기 처리 (단일 파일 vs 2파일)

---

## 구현 시 주의사항

1. **컬럼명 정규화**: 원본 파일마다 헤더 표기가 다를 수 있으므로 유사도 매칭(fuzzy match) 또는 alias 매핑 테이블 활용
2. **집계 단위**: 키워드 단위로 집계할지, 날짜별로 유지할지 결정 필요 (현재 Option 2는 전환유형까지 포함한 세부 단위)
3. **대용량 파일**: 주/월 단위 원본은 수천 행이 될 수 있으므로 pandas 집계 후 반환
4. **시트 선택**: 원본 파일에 여러 시트가 있다면 어느 시트를 사용할지 UX 처리 필요

---

## 참고 파일

- 현재 구현: `back/app/services/keyword_compare_service.py`
- 현재 라우터: `back/app/routers/keyword_compare_router.py`
- 프론트 클라이언트: `front/app/file-compare/FileCompareClient.tsx`
- 예시 비교 파일: `back/example/키워드 비교 이번주저번주.xlsx`

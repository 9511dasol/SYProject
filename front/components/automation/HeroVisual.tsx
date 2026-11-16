/**
 * 히어로 일러스트 — 흩어진 보고서 더미가 한 장의 리포트로 수렴하는 그림.
 *
 * 광고 소재 이미지를 그대로 올리지 않는 이유: 그 이미지는 헤드라인과 CTA 버튼이
 * 이미 그려진 완성된 광고다. 랜딩에 얹으면 광고 안에 광고가 들어간 꼴이 되고
 * 헤드라인이 화면에 두 번 나온다. 색과 은유만 가져와 다시 그렸다.
 *
 * 색을 토큰이 아니라 직접 박은 것도 같은 이유다 — page.tsx 주석 참고.
 */

/** 왼쪽 더미를 이루는 종이 세 장. 맨 위(index 2)만 내용을 그린다. */
const SHEETS = [
  { x: 18, y: 118, rotate: -8, detailed: false },
  { x: 40, y: 104, rotate: -3, detailed: false },
  { x: 62, y: 92, rotate: 2, detailed: true },
] as const;

/** 더미 위에 붙은 메모 — 매번 손으로 하던 단계들. */
const NOTES = [
  { label: '수집', fill: '#fde68a', x: 16, y: 262, rotate: -6 },
  { label: '취합', fill: '#fecaca', x: 86, y: 276, rotate: 3 },
  { label: '정리', fill: '#bfdbfe', x: 156, y: 266, rotate: -2 },
] as const;

const BAR_HEIGHTS = [44, 62, 54, 78, 70, 96, 112] as const;

export default function HeroVisual() {
  return (
    <svg
      viewBox="0 0 640 400"
      role="img"
      aria-label="여러 매체에서 받은 보고서 더미가 한 장의 광고 성과 리포트로 정리되는 그림"
      className="h-auto w-full"
    >
      {/* 왼쪽 — 매체별로 따로 내려받은 보고서 더미 */}
      {SHEETS.map((sheet) => (
        <g
          key={sheet.rotate}
          transform={`rotate(${sheet.rotate} ${sheet.x + 85} ${sheet.y + 105})`}
        >
          <rect
            x={sheet.x}
            y={sheet.y}
            width="170"
            height="210"
            rx="8"
            fill="#ffffff"
            stroke="#d9d4c6"
            strokeWidth="1.5"
          />
          {sheet.detailed ? (
            <>
              <rect
                x={sheet.x + 18}
                y={sheet.y + 22}
                width="76"
                height="9"
                rx="4.5"
                fill="#0b1f3a"
                opacity="0.75"
              />
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <g key={row}>
                  <rect
                    x={sheet.x + 18}
                    y={sheet.y + 48 + row * 24}
                    width="60"
                    height="7"
                    rx="3.5"
                    fill="#9aa7bb"
                    opacity="0.6"
                  />
                  <rect
                    x={sheet.x + 92}
                    y={sheet.y + 48 + row * 24}
                    width="42"
                    height="7"
                    rx="3.5"
                    fill="#9aa7bb"
                    opacity="0.35"
                  />
                </g>
              ))}
            </>
          ) : null}
        </g>
      ))}

      {NOTES.map((note) => (
        <g key={note.label} transform={`rotate(${note.rotate} ${note.x + 28} ${note.y + 28})`}>
          <rect x={note.x} y={note.y} width="58" height="52" rx="4" fill={note.fill} />
          <text
            x={note.x + 29}
            y={note.y + 32}
            textAnchor="middle"
            fontSize="15"
            fontWeight="700"
            fill="#0b1f3a"
            opacity="0.8"
          >
            {note.label}
          </text>
        </g>
      ))}

      {/* 가운데 — 자동화 화살표 */}
      <path
        d="M258 196 C 288 164, 318 164, 346 190"
        fill="none"
        stroke="#2563eb"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M336 174 L350 192 L328 196 Z" fill="#2563eb" />

      {/* 오른쪽 — 완성된 한 장의 리포트 */}
      <g>
        <rect
          x="362"
          y="66"
          width="262"
          height="268"
          rx="14"
          fill="#ffffff"
          stroke="#dfe6f1"
          strokeWidth="1.5"
        />
        <text x="386" y="100" fontSize="15" fontWeight="700" fill="#0b1f3a">
          광고 성과 리포트
        </text>
        <circle cx="596" cy="94" r="13" fill="#16a34a" />
        <path
          d="M590 94 L594 98.5 L602.5 89.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {BAR_HEIGHTS.map((height, index) => (
          <rect
            key={height}
            x={386 + index * 31}
            y={236 - height}
            width="18"
            height={height}
            rx="4"
            fill={index % 2 === 0 ? '#2563eb' : '#93c5fd'}
          />
        ))}
        <polyline
          points="395,186 426,168 457,176 488,152 519,160 550,134 581,118"
          fill="none"
          stroke="#0b1f3a"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />

        {/* 지표 카드 3개 — 구체적 수치는 넣지 않는다. 검증할 수 없는 성과 주장이 된다. */}
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <rect
              x={386 + index * 78}
              y="256"
              width="66"
              height="54"
              rx="8"
              fill="#f5f8ff"
              stroke="#e2eafc"
            />
            <rect
              x={396 + index * 78}
              y="268"
              width="24"
              height="7"
              rx="3.5"
              fill="#2563eb"
              opacity="0.55"
            />
            <rect
              x={396 + index * 78}
              y="285"
              width="44"
              height="9"
              rx="4.5"
              fill="#0b1f3a"
              opacity="0.35"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

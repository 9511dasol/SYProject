/**
 * 백엔드 OpenAPI → front/types/api.generated.ts
 *
 * 왜 생성물을 커밋하는가
 * ─────────────────────
 * 프런트를 빌드하려고 파이썬 백엔드를 켜야 한다면, 배포도 CI 도 두 스택에 묶인다.
 * 생성 결과를 저장소에 두면 빌드는 프런트만으로 끝나고, 대신 "백엔드를 고치고
 * 타입을 다시 만들지 않은 상태"를 `npm run types:check` 가 잡아낸다.
 *
 * 사용:
 *   node scripts/generate-api-types.mjs          # 생성
 *   node scripts/generate-api-types.mjs --check  # 변경 여부만 확인 (쓰지 않음)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

const FRONT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACK_DIR = resolve(FRONT_DIR, '..', 'back');
const OUT_FILE = join(FRONT_DIR, 'types', 'api.generated.ts');

const HEADER = `/**
 * 이 파일은 자동 생성됩니다. 직접 고치지 마세요.
 *
 * 생성:  npm run types:generate   (백엔드 OpenAPI 기준)
 * 확인:  npm run types:check      (백엔드와 어긋났는지)
 *
 * 손으로 쓴 타입 대신 이 파일을 참조하면, 백엔드 응답이 바뀌었을 때
 * 런타임이 아니라 타입 검사에서 먼저 드러납니다.
 */

`;

/** 백엔드를 실행할 파이썬.
 *  우선순위: PYTHON 환경변수 → back/.venv → PATH 의 python.
 *  경로를 박아 두면 CI 나 다른 개발 환경(가상환경 이름이 다른 경우)에서 바로 깨진다 —
 *  `PYTHON=/usr/bin/python3 npm run types:generate` 식으로 덮어쓸 수 있게 한다. */
function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = join(BACK_DIR, '.venv', 'Scripts', 'python.exe');
  if (existsSync(venv)) return venv;
  const posixVenv = join(BACK_DIR, '.venv', 'bin', 'python');
  if (existsSync(posixVenv)) return posixVenv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function exportSpec() {
  const dir = mkdtempSync(join(tmpdir(), 'openapi-'));
  const specPath = join(dir, 'openapi.json');
  try {
    execFileSync(pythonBin(), [join(BACK_DIR, 'scripts', 'export_openapi.py'), specPath], {
      cwd: BACK_DIR,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    return { spec: JSON.parse(readFileSync(specPath, 'utf8')), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

const { spec, cleanup } = exportSpec();
let generated;
try {
  generated = HEADER + astToString(await openapiTS(spec));
} finally {
  cleanup();
}

const checkOnly = process.argv.includes('--check');
const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;

if (checkOnly) {
  if (current === generated) {
    console.log('API 타입이 백엔드와 일치합니다.');
    process.exit(0);
  }
  console.error(
    current === null
      ? `생성된 타입 파일이 없습니다: ${OUT_FILE}\n  npm run types:generate 를 실행하세요.`
      : 'API 타입이 백엔드와 어긋났습니다 — 백엔드를 고치고 타입을 다시 만들지 않았습니다.\n' +
        '  npm run types:generate 를 실행해 반영하세요.',
  );
  process.exit(1);
}

if (current === generated) {
  console.log('변경 없음 — API 타입이 이미 최신입니다.');
} else {
  writeFileSync(OUT_FILE, generated, 'utf8');
  console.log(`API 타입을 생성했습니다: ${OUT_FILE}`);
}

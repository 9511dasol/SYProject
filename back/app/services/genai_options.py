"""google-genai 클라이언트 생성 지점을 한 곳으로 모은다.

Gemini 클라이언트를 네 곳(llm/gemini_client, heading, image_element,
image_ai_edit)에서 각자 만들면서 아무도 타임아웃을 주지 않았다. SDK 기본값은
사실상 무한대라, 공급자가 응답을 멈추면 그 요청을 잡고 있는 스레드가 영원히
풀리지 않는다. 생성을 이 함수로 모아 한도를 강제한다.

HttpOptions.timeout 은 초가 아니라 **밀리초**다(SDK 문서 기준). 설정값은 초
단위로 두고 여기서만 환산한다.
"""

from google import genai
from google.genai import types

from app.core.settings import settings


def build_genai_client(api_key: str, *, image: bool = False) -> genai.Client:
    """타임아웃·재시도가 적용된 Gemini 클라이언트를 만든다.

    image=True 면 이미지 생성용 한도를 쓴다 — 텍스트보다 훨씬 오래 걸려서
    같은 타임아웃을 쓰면 정상 작업이 중간에 잘린다.
    """
    seconds = settings.LLM_IMAGE_TIMEOUT_SECONDS if image else settings.LLM_TIMEOUT_SECONDS
    return genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(
            timeout=int(seconds * 1000),
            # google-genai 의 attempts 는 첫 요청을 **포함한** 횟수다(1이면 재시도 없음).
            # anthropic/openai 의 max_retries 는 첫 요청을 뺀 재시도 횟수라, 같은 설정값을
            # 그대로 넘기면 Gemini 만 한 번 덜 시도한다.
            retry_options=types.HttpRetryOptions(attempts=settings.LLM_MAX_RETRIES + 1),
        ),
    )

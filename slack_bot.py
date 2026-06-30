import os
import asyncio
from slack_bolt.app.async_app import AsyncApp
from slack_bolt.adapter.socket_mode.async_handler import AsyncSocketModeHandler
from google.antigravity import Agent, LocalAgentConfig, CapabilitiesConfig

# .env 파일에서 환경 변수를 자동으로 읽어오는 함수 (보안 강화)
def load_env():
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    if "=" in line:
                        key, val = line.split("=", 1)
                        os.environ[key.strip()] = val.strip().strip('"').strip("'")

# 환경 변수 로드
load_env()

# Slack Bolt 비동기 앱 초기화
app = AsyncApp(token=os.environ.get("SLACK_BOT_TOKEN"))


# Antigravity 에이전트 설정
# 구글 AI Studio 무료 티어의 503 과부하 에러를 완화하기 위해 비교적 트래픽 여유가 있는 gemini-1.5-flash 모델을 기본 사용하도록 설정합니다.
agent_config = LocalAgentConfig(
    system_instructions=(
        "You are Antigravity, a helpful assistant integrated into Slack. "
        "Provide clear and concise answers. "
        "Keep your formatting clean and suitable for Slack markdown."
    ),
    capabilities=CapabilitiesConfig(
        run_command=True,  # 봇이 터미널 명령어를 실행할 수 있게 허용
        edit_file=True,    # 봇이 로컬 파일을 생성/수정할 수 있게 허용
    ),
    model="gemini-2.5-flash"
)


# 1대1 다이렉트 메시지(DM) 또는 채널 메시지가 수신되었을 때 실행되는 이벤트 핸들러
@app.event("message")
async def handle_message_events(body, say):
    event = body.get("event", {})
    text = event.get("text")
    user = event.get("user")
    channel = event.get("channel")
    
    # 봇 본인이 보낸 메시지나 메시지 수정 이벤트는 무시합니다.
    if event.get("bot_id") is not None or event.get("subtype") in ["message_changed", "message_deleted"]:
        return

    # [보안 중요] 원격 제어가 가능하므로 특정 Slack User ID만 허용하는 화이트리스트 적용을 권장합니다.
    # allowed_users = ["U12345678"]  # 실제 본인의 Slack User ID로 교체하세요.
    # if user not in allowed_users:
    #     await say("죄송합니다. 이 봇을 사용할 권한이 없습니다.")
    #     return

    print(f"\n[수신] {user} 으로부터 메시지: {text}")
    
    # 메시지를 처리 중이라는 알림을 먼저 전송합니다.
    initial_response = await say(text="🤖 생각을 정리하고 작업을 시작합니다...")
    ts = initial_response.get("ts")
    
    try:
        print("[단계 1] Antigravity 에이전트 초기화 중...")
        async with Agent(agent_config) as agent:
            print("[단계 2] 에이전트에게 메시지 전달 중...")
            response = await agent.chat(text)
            
            print("[단계 3] 답변 가져오는 중 (최대 2분 대기)...")
            reply_text = ""
            try:
                async def collect_text():
                    nonlocal reply_text
                    async for token in response:
                        reply_text += token
                await asyncio.wait_for(collect_text(), timeout=120.0)
            except asyncio.TimeoutError:
                raise Exception("답변 수신 중 타임아웃(120초)이 발생했습니다.")
            
            print(f"[단계 4] 답변 수신 완료 (길이: {len(reply_text)})")
            
            if not reply_text.strip():
                raise Exception("에이전트로부터 빈 응답(Empty Response)을 받았습니다. API 서버 부하 상태일 수 있습니다.")
            
            # 대화 내용으로 기존 메시지를 업데이트
            await app.client.chat_update(
                channel=channel,
                ts=ts,
                text=reply_text
            )
            print("[완료] 슬랙 메시지 업데이트 성공")

    except BaseException as e:
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"[오류 발생] {error_msg}")
        try:
            await app.client.chat_update(
                channel=channel,
                ts=ts,
                text=f"❌ 작업을 수행하는 중 오류가 발생했습니다.\n\n*상세 오류:* `{error_msg}`\n\n_(Gemini 서버의 트래픽이 몰려 일시적으로 응답이 지연되거나 거부되었을 수 있습니다. 잠시 후 다시 시도해 주세요.)_"
            )
            print("[완료] 에러 알림 슬랙 전송 완료")
        except Exception as slack_err:
            print(f"[오류] 슬랙에 에러 알림 전송 실패: {slack_err}")

async def main():
    app_token = os.environ.get("SLACK_APP_TOKEN")
    if not app_token or not os.environ.get("SLACK_BOT_TOKEN"):
        print("에러: SLACK_BOT_TOKEN 및 SLACK_APP_TOKEN 환경 변수를 설정해야 합니다.")
        return
        
    handler = AsyncSocketModeHandler(app, app_token)
    print("⚡ Slack Socket Mode 봇이 실행되었습니다. 메시지를 대기 중입니다...")
    await handler.start_async()

if __name__ == "__main__":
    asyncio.run(main())

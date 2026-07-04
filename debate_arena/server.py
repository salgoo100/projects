import os
import json
import urllib.request
import urllib.error
import sys
import io
from http.server import HTTPServer, BaseHTTPRequestHandler

# Windows cmd/powershell encoding issue fix
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except AttributeError:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass


# .env 파일에서 환경 변수를 읽어옵니다.
def load_env():
    env = {}
    # 현재 디렉토리 또는 부모 디렉토리의 .env 파일을 탐색
    paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    ]
    for p in paths:
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        if "=" in line:
                            key, val = line.split("=", 1)
                            env[key.strip()] = val.strip().strip('"').strip("'")
    return env

ENV = load_env()

def call_gemini(model, messages, system_instruction, api_key):
    # Gemini API 호출용 메시지 변환 (Strict Alternating: user, model, user, model...)
    contents = []
    for msg in messages:
        sender = msg.get("sender", "User")
        content_text = msg.get("content", "")
        # 접두사 처리
        if not content_text.startswith(f"[{sender}]:"):
            content_text = f"[{sender}]: {content_text}"
            
        role = "model" if sender == "Gemini" else "user"
        contents.append({
            "role": role,
            "parts": [{"text": content_text}]
        })
    
    # 연속으로 동일한 역할(role)이 나오지 않도록 머지
    merged_contents = []
    for content in contents:
        if not merged_contents:
            merged_contents.append(content)
        else:
            prev = merged_contents[-1]
            if prev["role"] == content["role"]:
                prev["parts"][0]["text"] += "\n\n" + content["parts"][0]["text"]
            else:
                merged_contents.append(content)
                
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": merged_contents,
        "generationConfig": {
            "temperature": 0.7
        }
    }
    if system_instruction:
        payload["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
        
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        try:
            text = response_data["candidates"][0]["content"]["parts"][0]["text"]
            return text
        except (KeyError, IndexError) as e:
            raise Exception(f"Gemini 응답 파싱 실패: {response_data}")

def call_openai(model, messages, system_instruction, api_key):
    formatted_messages = []
    if system_instruction:
        formatted_messages.append({"role": "system", "content": system_instruction})
        
    for msg in messages:
        sender = msg.get("sender", "User")
        content_text = msg.get("content", "")
        if not content_text.startswith(f"[{sender}]:"):
            content_text = f"[{sender}]: {content_text}"
            
        role = "assistant" if sender == "GPT" else "user"
        formatted_messages.append({"role": role, "content": content_text})
        
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": model,
        "messages": formatted_messages,
        "temperature": 0.7
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        },
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        try:
            text = response_data["choices"][0]["message"]["content"]
            return text
        except (KeyError, IndexError):
            raise Exception(f"OpenAI 응답 파싱 실패: {response_data}")

def call_anthropic(model, messages, system_instruction, api_key):
    contents = []
    for msg in messages:
        sender = msg.get("sender", "User")
        content_text = msg.get("content", "")
        if not content_text.startswith(f"[{sender}]:"):
            content_text = f"[{sender}]: {content_text}"
            
        role = "assistant" if sender == "Claude" else "user"
        contents.append({"role": role, "content": content_text})
        
    # 연속 역할 머지
    merged_contents = []
    for content in contents:
        if not merged_contents:
            merged_contents.append(content)
        else:
            prev = merged_contents[-1]
            if prev["role"] == content["role"]:
                prev["content"] += "\n\n" + content["content"]
            else:
                merged_contents.append(content)
                
    # Anthropic은 첫 번째 메시지가 반드시 'user' 여야 함
    if merged_contents and merged_contents[0]["role"] == "assistant":
        merged_contents.insert(0, {"role": "user", "content": "[시스템]: 토론을 시작합니다."})
        
    url = "https://api.anthropic.com/v1/messages"
    payload = {
        "model": model,
        "messages": merged_contents,
        "max_tokens": 4096,
        "temperature": 0.7
    }
    if system_instruction:
        payload["system"] = system_instruction
        
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    with urllib.request.urlopen(req) as res:
        response_data = json.loads(res.read().decode("utf-8"))
        try:
            text = response_data["content"][0]["text"]
            return text
        except (KeyError, IndexError):
            raise Exception(f"Anthropic 응답 파싱 실패: {response_data}")

class DebateRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
            with open(html_path, "r", encoding="utf-8") as f:
                self.wfile.write(f.read().encode("utf-8"))
        elif self.path == "/api/config":
            # .env에 등록된 API 키를 안전하게 클라이언트로 전달 (로컬이므로 안전)
            config = {
                "gemini": ENV.get("GEMINI_API_KEY", ""),
                "openai": ENV.get("OPENAI_API_KEY", ""),
                "anthropic": ENV.get("ANTHROPIC_API_KEY", "")
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(config).encode("utf-8"))
        else:
            self.send_error(404, "File Not Found")
            
    def do_POST(self):
        if self.path == "/api/chat":
            content_length = int(self.headers["Content-Length"])
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            
            provider = data.get("provider", "").lower()
            if provider == "gpt":
                provider = "openai"
            elif provider == "claude":
                provider = "anthropic"
                
            model = data.get("model")
            messages = data.get("messages", [])
            system_instruction = data.get("systemInstruction", "")
            api_key = data.get("apiKey", "")
            
            # API 키가 전달되지 않았으면 서버 환경변수에서 찾기
            if not api_key:
                if provider == "gemini":
                    api_key = ENV.get("GEMINI_API_KEY", "")
                elif provider == "openai":
                    api_key = ENV.get("OPENAI_API_KEY", "")
                elif provider == "anthropic":
                    api_key = ENV.get("ANTHROPIC_API_KEY", "")
            
            if not api_key:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"{provider.upper()} API 키가 없습니다. 설정에서 입력해 주세요."}).encode("utf-8"))
                return
                
            try:
                response_text = ""
                if provider == "gemini":
                    response_text = call_gemini(model, messages, system_instruction, api_key)
                elif provider == "openai":
                    response_text = call_openai(model, messages, system_instruction, api_key)
                elif provider == "anthropic":
                    response_text = call_anthropic(model, messages, system_instruction, api_key)
                else:
                    raise Exception(f"지원하지 않는 프로바이더입니다: {provider}")
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"text": response_text}).encode("utf-8"))
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_error(404, "Endpoint Not Found")

LOGO = r"""=========================================================
   _    ___   ____  _____ ____    _  _____ _____
  / \  |_ _| |  _ \| ____| __ )  / \|_   _| ____|
 / _ \  | |  | | | |  _| |  _ \ / _ \ | | |  _|  
/ ___ \ | |  | |_| | |___| |_) / ___ \| | | |___ 
/_/   \_\___| |____/|_____|____/_/   \_\_| |_____|

    ---  A I   M U L T I - A G E N T   A R E N A  ---
=========================================================
 [STATUS] Initializing Local Daemon...
 [PORT]   {port}
 [LOCAL]  http://localhost:{port}
=========================================================
 [INFO]   Press Ctrl+C in this window to stop the server.
 [LOGS]   Service logs will stream below:
========================================================="""

def run(port=8000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, DebateRequestHandler)
    print(LOGO.format(port=port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Server shutting down.")
        sys.exit(0)

if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run(port)

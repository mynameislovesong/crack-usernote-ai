// ==UserScript==
// @name         Crack 유저노트 AI 정리·압축기
// @namespace    https://github.com/mynameislovesong/crack-usernote-ai
// @version      0.8.0
// @description  Crack 유저노트 안에서 Gemini/Firebase AI로 프롬프트를 작성·압축·검토합니다.
// @author       mynameislovesong
// @match        https://crack.wrtn.ai/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      generativelanguage.googleapis.com
// @connect      firebasevertexai.googleapis.com
// @run-at       document-idle
// @downloadURL  https://raw.githubusercontent.com/mynameislovesong/crack-usernote-ai/main/crack-usernote-ai.user.js
// @updateURL    https://raw.githubusercontent.com/mynameislovesong/crack-usernote-ai/main/crack-usernote-ai.user.js
// ==/UserScript==

(function () {
  "use strict";

  const backgroundListeners = [];
  const chrome = {
    storage: {
      local: {
        async get(key) {
          if (typeof key === "string") return { [key]: GM_getValue(key) };
          const result = {};
          for (const item of Array.isArray(key) ? key : Object.keys(key || {})) {
            result[item] = GM_getValue(item, key?.[item]);
          }
          return result;
        },
        async set(values) {
          for (const [key, value] of Object.entries(values || {})) GM_setValue(key, value);
        }
      }
    },
    runtime: {
      onMessage: {
        addListener(listener) {
          backgroundListeners.push(listener);
        }
      },
      sendMessage(message) {
        return new Promise((resolve) => {
          const listener = backgroundListeners[0];
          if (!listener) return resolve({ ok: false, error: "AI 런타임을 찾지 못함" });
          let settled = false;
          const sendResponse = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };
          try {
            const pending = listener(message, {}, sendResponse);
            if (pending !== true && !settled) resolve(undefined);
          } catch (error) {
            resolve({ ok: false, error: error?.message || String(error) });
          }
        });
      }
    }
  };

  function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || "GET",
        url: String(url),
        headers: options.headers || {},
        data: options.body,
        timeout: 120000,
        onload(response) {
          resolve({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            text: async () => response.responseText || ""
          });
        },
        ontimeout() {
          reject(new TypeError("AI 요청 시간 초과"));
        },
        onerror() {
          reject(new TypeError("AI 네트워크 요청 실패"));
        }
      });
    });
  }

  GM_addStyle(String.raw`#crack-usernote-ai-root {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
  font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #222;
}

#crack-usernote-ai-root * { box-sizing: border-box; }

.cuai-launcher {
  min-height: 32px;
  box-shadow: 0 4px 14px rgba(0,0,0,.10);
}

.cuai-dialog {
  position: fixed;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  width: min(760px, calc(100vw - 24px));
  max-width: none;
  max-height: calc(100vh - 24px);
  margin: 0;
  padding: 0;
  border: 1px solid rgba(0,0,0,.14);
  border-radius: 16px;
  background: #fff;
  color: #222;
  box-shadow: 0 24px 70px rgba(0,0,0,.28);
  overflow: hidden;
}

.cuai-dialog::backdrop {
  background: rgba(20,20,24,.52);
  backdrop-filter: blur(2px);
}

.cuai-review-dialog { width: min(820px, calc(100vw - 24px)); }
.cuai-dialog-shell { display: flex; flex-direction: column; max-height: calc(100vh - 24px); }

.cuai-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex: 0 0 auto;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(0,0,0,.08);
  background: #fff;
}

.cuai-dialog-header strong { font-size: 14px; }
.cuai-header-actions { display: flex; align-items: center; gap: 7px; }

.cuai-dialog-scroll {
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 14px 14px;
  overflow: auto;
  overscroll-behavior: contain;
}

.cuai-actions,
.cuai-setting-row,
.cuai-apply-row,
.cuai-stats {
  display: flex;
  align-items: center;
  gap: 7px;
}

.cuai-settings {
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid rgba(0,0,0,.08);
  border-radius: 12px;
  background: #fafafa;
}

.cuai-settings[hidden] { display: none !important; }
.cuai-settings-status { margin-top: 5px; }

.cuai-label {
  display: block;
  margin: 9px 0 5px;
  color: #555;
  font-size: 12px;
  font-weight: 650;
}

.cuai-textarea,
.cuai-input,
.cuai-select {
  width: 100%;
  border: 1px solid rgba(0,0,0,.14);
  border-radius: 9px;
  background: #fff;
  color: #222;
  font: inherit;
  outline: none;
}

.cuai-textarea {
  min-height: 120px;
  padding: 9px 10px;
  resize: vertical;
  line-height: 1.5;
}

.cuai-result { min-height: 180px; }
.cuai-review-result { min-height: min(54vh, 480px); }
.cuai-extra-prompt { min-height: 76px; }
.cuai-firebase-config { min-height: 150px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }
.cuai-input, .cuai-select { height: 36px; padding: 0 9px; }

.cuai-textarea:focus,
.cuai-input:focus,
.cuai-select:focus {
  border-color: #ff5b4a;
  box-shadow: 0 0 0 3px rgba(255,91,74,.10);
}

.cuai-button,
.cuai-icon-button {
  border: 0;
  border-radius: 8px;
  background: rgba(255,91,74,.12);
  color: #a9342a;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
}

.cuai-button { min-height: 32px; padding: 0 10px; }
.cuai-icon-button { width: 32px; height: 32px; padding: 0; font-size: 22px; line-height: 1; }
.cuai-button:hover:not(:disabled), .cuai-icon-button:hover:not(:disabled) { background: rgba(255,91,74,.20); }
.cuai-button:disabled, .cuai-icon-button:disabled { opacity: .45; cursor: default; }
.cuai-button-primary { background: #ff6657; color: #fff; }
.cuai-button-primary:hover:not(:disabled) { background: #f45648; }
.cuai-review-button { background: #5c52d9; color: #fff; }
.cuai-review-button:hover:not(:disabled) { background: #4c43c5; }

.cuai-actions, .cuai-apply-row { margin-top: 8px; flex-wrap: wrap; }
.cuai-stats { justify-content: space-between; margin-top: 5px; color: #777; font-size: 11px; }
.cuai-status { min-height: 17px; margin-top: 7px; font-size: 11px; color: #666; }
.cuai-status[data-error="true"] { color: #c0392b; }

.cuai-setting-row > * { flex: 1; min-width: 0; }
.cuai-model-reasoning-row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(100px, .75fr);
  align-items: end;
  gap: 8px;
}
.cuai-model-reasoning-row > * { min-width: 0; }
.cuai-provider-fields { margin-top: 6px; }
.cuai-help { margin-top: 5px; color: #777; font-size: 11px; line-height: 1.45; }
.cuai-review-help { margin: 0 0 8px; }

.cuai-mode-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.cuai-mode-toggle input { accent-color: #ff6657; }

.cuai-mode-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.cuai-mode-row .cuai-label { margin: 0; }

@media (max-width: 560px) {
  .cuai-dialog { width: calc(100vw - 12px); max-height: calc(100vh - 12px); }
  .cuai-dialog-shell { max-height: calc(100vh - 12px); }
  .cuai-setting-row { align-items: stretch; flex-direction: column; }
}
`);

  (function registerBackgroundRuntime() {
    const fetch = gmFetch;
    const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "CRACK_USERNOTE_AI_GENERATE") {
        handleGenerate(message.payload)
          .then((result) => sendResponse({ ok: true, result }))
          .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
        return true;
      }
    
    });
    
    async function handleGenerate(payload) {
      const { provider, prompt, config } = payload || {};
      if (!prompt?.trim()) throw new Error("AI에 보낼 내용이 비어 있음");
    
      if (provider === "gemini") return callGemini(prompt, config || {});
      if (provider === "firebase") return callFirebaseAILogic(prompt, config || {});
    
      throw new Error("지원하지 않는 API 종류임");
    }
    
    async function callGemini(prompt, config) {
      const apiKey = (config.apiKey || "").trim();
      const model = normalizeModelName(config.model || DEFAULT_GEMINI_MODEL);
      if (!apiKey) throw new Error("Gemini API 키가 없음");
    
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: buildGenerationConfig(model, config.reasoningLevel, false)
        })
      });
    
      const data = await readJson(response);
      if (!response.ok) throw apiError("Gemini", response.status, data);
    
      const text = data?.candidates?.[0]?.content?.parts
        ?.map((part) => part?.text || "")
        .join("")
        .trim();
    
      if (!text) throw new Error("Gemini 응답에서 텍스트를 찾지 못함");
      return text;
    }
    
    async function callFirebaseAILogic(prompt, config) {
      const firebaseConfig = parseFirebaseConfig(config.firebaseConfig);
      const apiKey = String(firebaseConfig.apiKey || "").trim();
      const projectId = String(firebaseConfig.projectId || "").trim();
      const appId = String(firebaseConfig.appId || "").trim();
      const model = normalizeModelName(config.model || DEFAULT_GEMINI_MODEL);
      const backend = config.backend === "vertexAI" ? "vertexAI" : "googleAI";
      const location = String(config.location || "global").trim() || "global";
    
      if (!apiKey || !projectId) {
        throw new Error("Firebase 설정에서 apiKey와 projectId를 찾지 못함");
      }
    
      const modelPath = backend === "vertexAI"
        ? `projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}`
        : `projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(model)}`;
      const url = `https://firebasevertexai.googleapis.com/v1beta/${modelPath}:generateContent`;
      const headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-api-client": "gl-js/fire-cuai"
      };
      if (appId) headers["X-Firebase-Appid"] = appId;
    
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: buildGenerationConfig(model, config.reasoningLevel, true)
        })
      });
    
      const data = await readJson(response);
      if (!response.ok) throw apiError("Firebase AI Logic", response.status, data);
    
      const text = data?.candidates?.[0]?.content?.parts
        ?.filter((part) => !part?.thought)
        .map((part) => part?.text || "")
        .join("")
        .trim();
      if (!text) throw new Error("Firebase AI Logic 응답에서 텍스트를 찾지 못함");
      return text;
    }
    
    function parseFirebaseConfig(input) {
      if (input && typeof input === "object") return input;
      let raw = String(input || "").trim();
      if (!raw) throw new Error("Firebase CDN 설정(firebaseConfig)이 비어 있음");
    
      raw = raw
        .replace(/^\s*(?:const|let|var)\s+firebaseConfig\s*=\s*/i, "")
        .replace(/;\s*$/, "")
        .trim();
      try {
        return JSON.parse(raw);
      } catch {
        const config = {};
        for (const key of ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId"]) {
          const match = raw.match(new RegExp(`["']?${key}["']?\\s*:\\s*(["'])(.*?)\\1`, "s"));
          if (match) config[key] = match[2];
        }
        return config;
      }
    }
    
    function normalizeModelName(name) {
      return String(name || "").trim().replace(/^models\//, "");
    }
    
    function buildGenerationConfig(model, reasoningLevel, firebase) {
      const level = ["low", "medium", "high"].includes(reasoningLevel) ? reasoningLevel : "medium";
      const generationConfig = { temperature: 0.2 };
      if (/^gemini-2\.5-/i.test(model)) {
        generationConfig.thinkingConfig = {
          thinkingBudget: { low: 1024, medium: 8192, high: 24576 }[level]
        };
      } else if (/^gemini-3(?:\.|-)/i.test(model)) {
        generationConfig.thinkingConfig = {
          thinkingLevel: firebase ? level.toUpperCase() : level
        };
      }
      return generationConfig;
    }
    
    async function readJson(response) {
      const raw = await response.text();
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    }
    
    function apiError(name, status, data) {
      const message = data?.error?.message || data?.message || data?.raw || `HTTP ${status}`;
      if (status === 401 || status === 403) return new Error(`${name} 인증 실패: ${message}`);
      if (status === 429) return new Error(`${name} 사용량/요청 한도 초과: ${message}`);
      return new Error(`${name} API 오류 (${status}): ${message}`);
    }
    
    function normalizeError(error) {
      if (error instanceof TypeError && /fetch/i.test(error.message)) {
        return "네트워크 요청에 실패함. API 주소/인터넷 연결/확장 권한을 확인해주세요.";
      }
      return error?.message || String(error || "알 수 없는 오류");
    }
    
  })();

  (() => {
    if (window.__crackUserNoteAIInstalled) return;
    window.__crackUserNoteAIInstalled = true;
  
    const ROOT_ID = "crack-usernote-ai-root";
    const STORAGE_KEY = "crackUserNoteAISettingsV1";
    const USER_NOTE_PATTERN = /유저\s*노트|유저노트|user\s*note/i;
    const GEMINI_MODELS = [
      { id: "gemini-3.6-flash", label: "3.6 Flash" },
      { id: "gemini-3.5-flash", label: "3.5 Flash" },
      { id: "gemini-3.1-pro-preview", label: "3.1 Pro" },
      { id: "gemini-2.5-pro", label: "2.5 Pro" },
      { id: "gemini-2.5-flash", label: "2.5 Flash" }
    ];
    const GEMINI_MODEL_IDS = new Set(GEMINI_MODELS.map((model) => model.id));
    const DEFAULT_WRITING_MODEL = "gemini-3.6-flash";
    const DEFAULT_REVIEW_MODEL = "gemini-3.1-pro-preview";
  
    const FORMAT_RULES = `당신은 캐릭터/RP/AU/세계관 설정 정리 도우미임.
  사용자 입력은 완성문이 아니라 메모, 구어체, 음슴체, 오타, 희망사항이 섞인 자연어일 수 있음.
  문장 표현 교정보다 사용자의 설정 의도와 제한조건을 읽어 설정으로 정리할 것.
  입력에 없는 사실을 창작하거나 애매한 내용을 임의로 확정하지 말 것.
  특히 '~는 아님', '아직 ~아님', '너무 ~하지는 않음' 같은 부정/제한 조건을 삭제하지 말 것.
  원작과 AU 차이, 관계 단계, 감정의 유무, 전후 변화가 있으면 보존할 것.
  중간 분석은 출력하지 말고 최종 설정문만 출력할 것.
  
  [필수 출력 형식]
  #키워드
  -설명
  -설명
  
  #키워드
  -설명
  
  키워드는 내용에 맞춰 정하고, 각 설명은 '-'로 시작하는 자연스러운 한국어 설정 설명으로 작성할 것.
  내용이 없는 항목은 만들지 말 것.`;
  
    const COMMON_COMPRESSION_PROMPT = `[프롬프트: AI 프롬프트 압축 전문가]
  # 1. AI 역할 및 목표 정의
  * 역할: 너는 AI 롤플레잉 프롬프트를 극한까지 압축하고 최적화하는 **'프롬프트 압축 전문가(Prompt Compressor)'**다.
  * 목표: 너의 유일한 목표는, 아래의 **'압축 4대 원칙'**에 따라 주어진 프롬프트의 모든 지침을 단 하나도 누락 없이, 더 강력하게, 그리고 공백 포함 글자 수가 가장 적은 형태로 재탄생시키는 것이다.
  # 2. 프롬프트 압축 4대 원칙 (절대 규칙)
  * AI 학습 명확성 (Clarity): 생성된 규칙은 Gemini AI가 오해의 소지 없이 해석하고 RP에 즉시 반영할 수 있도록, 구조화된 키워드, 기호, 연산자 중심으로 구성해야 한다.
  * 글자 수 최소화 (Conciseness): 모든 수단을 동원해 글자 수를 극한까지 줄여야 한다.
  * 허용 기법: 한자(漢字), 라틴어 약어(e.g., OOC), 특수기호(#, [], *), 수학/논리 연산자(→, ≠, ↑, |, ✅, ❌), 불필요한 조사/공백/줄바꿈의 완전한 제거.
  * 의도 표현 정확성 (Accuracy): 원본 프롬프트의 모든 지침과 의도는 100% 보존되거나, 더 함축적이고 강력한 표현으로 강화되어야 한다. 규칙의 의미가 약화되어서는 안 된다.
  * 절대적 효율성 (Efficiency): 인간의 가독성, 문장의 자연스러움, 문법적 완결성 등 위 3가지 원칙과 무관한 모든 요소는 완전히 무시하고 배제해야 한다.
  # 3. 작업 프로세스
  * [입력 프롬프트 분석]: 내가 제공하는 원본 프롬프트의 모든 지침과 핵심 의도를 완벽하게 파악한다.
  * [핵심 키워드 추출]: 각 지침을 대표하는 가장 짧고 강력한 핵심 단어(명사, 동사, 형용사)를 추출한다.
  * [기호화 및 압축]: 추출된 키워드를 **'압축 4대 원칙'**에 따라 기호, 한자, 연산자 등과 조합하여 최종 압축 프롬프트를 생성한다.
  # 4. 실행 예시 (Few-Shot Learning)
  * [입력 프롬프트 (Before)]
  > AI는 절대로 사용자의 행동을 대신 서술해서는 안 됩니다. 사용자의 행동은 사용자가 직접 입력하는 것으로만 결정됩니다. 그리고 AI는 사용자의 생각을 읽을 수 없는 존재입니다.
  >
  * [생성 결과물 (After)]
  > User(행동/생각)=사용자영역. AI 代筆/讀心=絶對禁止.`;
  
    const CONTROLLED_COMPRESSION_PROMPT = `# 압축 강도
  - 하: 원문 뉘앙스를 최대한 유지하고 표현만 정리
  - 중: 의미 보존 + 중복 제거 + 규칙형 문장화
  - 상: 글자수 절약 우선. 약어, 한자, 기호 적극 사용
  
  # 허용 한자 치환표
  可=가능
  含=포함
  或=또는
  若=만약
  擬=처럼/모방
  擇=선택
  必=반드시
  禁=금지/불가
  唯=오직
  限=한정
  即=즉시
  已=이미
  且=그리고
  亦=또한
  ∵=때문에
  ∴=따라서
  漸=점점
  尙=여전히/아직
  尤=특히
  常=늘
  對=대해/vs
  詳=상세히
  略=간략히
  〃=위와 동일
  
  # 논리기호
  - ¬ = 배제/not
  - ∀ = 모든
  - ∄ = 존재하지 않음
  - ∴ = 따라서
  - ∵ = 때문에
  
  기호는 목록형, 규칙형 프롬프트에서만 적극 사용한다.
  자연어 문장 안에 억지로 섞어 의미가 흐려질 경우 자연어를 우선한다.
  
  # 한자 치환 효율 원칙
  한글을 한자/기호로 바꿀 때는 실제 글자수 절감이 있을 때만 치환한다.
  
  기준:
  - 원문보다 치환문이 짧으면 사용 가능
  - 글자수가 같으면 한글 유지
  - 글자수가 늘어나면 치환 금지
  - 고유명사, 지명, 캐릭터명, 설정명은 글자수 절감이 없으면 원문 유지
  - 한글+한자가 어색하게 섞여 가독성을 해치면, 글자수 절감이 있어도 자연어를 우선할 수 있음
  
  예시:
  - 위치→位: 2자→1자이므로 가능
  - 해망→海望: 2자→2자이므로 금지, 해망 유지
  - 2층 목조→2層木조: 글자수 절감 없음/가독성 저하이므로 금지
  - 반드시→必: 3자→1자이므로 가능
  - 금지→禁: 2자→1자이므로 가능`;
  
    const REVIEW_PROMPT = `[프롬프트 구조 분석 AI]
  # 1. AI 역할 및 목표
  * 역할: 너는 고도로 압축되고 복잡한 AI 프롬프트의 숨겨진 지시사항을 분석하고, 그 구조와 작동 방식을 해독하는 **'프롬프트 디컨스트럭터(Prompt Deconstructor)'**다.
  * 목표: 너의 임무는 내가 입력하는 프롬프트의 모든 지침을 정확히 파악하고, 아래에 명시된 세 가지 분석 양식에 따라 체계적인 분석 보고서를 출력하는 것이다.
  # 2. 분석 프레임워크 및 원칙
  너는 다음 세 가지 원칙에 따라 프롬프트를 분석하고 결과를 도출해야 한다.
  * 1단계: 지시사항 번역 (Korean Translation)
  * 원칙: 모든 압축된 키워드, 기호, 한자, 연산자를 누락 없이 명확하고 자연스러운 한국어 문장으로 번역한다.
  * 실행: 각 지시사항을 번호로 구분하여 순서대로 나열한다.
  * 2단계: 우선순위 분석 (Priority Analysis)
  * 원칙: 프롬프트 내에서 규칙들의 위계(Hierarchy)를 분석한다.
  * 실행: 지침들을 **'최상위 규칙(Meta-Rules)', '핵심 규칙(Core Rules)', '보조 규칙(Sub-Rules)'**으로 등급을 나누고, 왜 그렇게 판단했는지 근거를 제시한다.
  * 판단 기준: 명시적 키워드(e.g., '최상위', 'TopPriority', '절대', '반드시'), 프롬프트 내 배치 순서(보통 앞에 있을수록 중요), 지침의 포괄성(다른 규칙에 영향을 미치는지 여부).
  * 3단계: 반영 방식 예측 (Reflection Prediction)
  * 원칙 (갈등 분석): 먼저, 프롬프트 내 지침들 간에 잠재적인 충돌이나 모순이 있는지 분석한다. (예: '자유로운 서술' vs '엄격한 금지 조항', '제한 해제' vs '특정 행동 금지').
  * 원칙 (적용 시뮬레이션): 충돌이 발생할 경우, Gemini AI가 '우선순위 분석' 결과에 따라 어떤 지침을 더 중요하게 따를 것인지, 또는 두 지침을 어떻게 절충하여 적용할 것인지 구체적인 예시를 들어 예측하고 서술한다. 충돌이 없다면, 각 지침이 어떻게 상호작용하여 시너지를 내는지 설명한다.
  # 3. 출력 양식 (Output Format)
  너는 반드시 아래의 양식을 엄격히 준수하여 분석 결과를 출력해야 한다.
  1. 프롬프트 지시사항 한글화
  (분석 결과를 여기에 번호로 나열)
  2. 프롬프트 지시사항의 우선순위
  (최상위/핵심/보조 규칙으로 나누어 분석 결과를 여기에 서술)
  3. 제미나이의 프롬프트 지시사항 반영 예상
  (충돌 분석 및 적용 시뮬레이션 결과를 여기에 서술)`;
  
    let currentNoteInput = null;
    let currentBoundary = null;
    let currentRoot = null;
    let scanTimer = null;
  
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open", "style", "class"] });
    window.addEventListener("popstate", scheduleScan);
  
    function scheduleScan() {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scanForUserNote, 180);
    }
  
    function isVisible(el) {
      if (!el?.isConnected) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 20 && rect.height > 18 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }
  
    function labelTextFor(textarea) {
      const labels = [...(textarea.labels || [])].map((label) => label.innerText || label.textContent || "");
      return [textarea.placeholder, textarea.getAttribute("aria-label"), ...labels].filter(Boolean).join(" ");
    }
  
    function findUserNoteContext() {
      const textareas = [...document.querySelectorAll("textarea")]
        .filter((textarea) => !textarea.closest(`#${ROOT_ID}`) && isVisible(textarea));
      const candidates = [];
  
      for (const textarea of textareas) {
        let boundary = null;
        let score = USER_NOTE_PATTERN.test(labelTextFor(textarea)) ? 100 : 0;
        let ancestor = textarea.parentElement;
  
        for (let depth = 0; depth < 8 && ancestor && ancestor !== document.body; depth += 1, ancestor = ancestor.parentElement) {
          const text = (ancestor.innerText || ancestor.textContent || "").trim().slice(0, 3000);
          if (!USER_NOTE_PATTERN.test(text)) continue;
  
          boundary = ancestor;
          score += 45 - depth * 3;
          if (ancestor.querySelectorAll("textarea").length === 1) score += 15;
          if (ancestor.matches('[role="dialog"], [aria-modal="true"]')) score += 5;
          score += Math.max(0, 15 - Math.floor(text.length / 200));
          break;
        }
  
        if (boundary) candidates.push({ textarea, boundary, score });
      }
  
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0] || null;
    }
  
    function destroyUI() {
      currentRoot?.remove();
      currentRoot = null;
      currentNoteInput = null;
      currentBoundary = null;
    }
  
    function scanForUserNote() {
      const context = findUserNoteContext();
      if (!context || !isVisible(context.textarea) || !isVisible(context.boundary)) {
        destroyUI();
        return;
      }
  
      if (
        currentRoot?.isConnected &&
        currentNoteInput === context.textarea &&
        currentBoundary === context.boundary &&
        context.boundary.contains(currentRoot)
      ) return;
  
      destroyUI();
      currentNoteInput = context.textarea;
      currentBoundary = context.boundary;
      injectUI(context);
    }
  
    async function injectUI({ textarea, boundary }) {
      const root = document.createElement("section");
      root.id = ROOT_ID;
      root.innerHTML = `
        <button type="button" class="cuai-button cuai-button-primary cuai-launcher" data-act="open-main">✨ AI 작성·압축·검토</button>
  
        <dialog class="cuai-dialog cuai-main-dialog" data-dialog="main">
          <div class="cuai-dialog-shell">
            <header class="cuai-dialog-header">
              <strong>✨ AI 유저노트 작성·압축</strong>
              <div class="cuai-header-actions">
                <button type="button" class="cuai-button" data-act="settings">⚙ 설정</button>
                <button type="button" class="cuai-icon-button" data-act="close-main" aria-label="닫기">×</button>
              </div>
            </header>
            <div class="cuai-dialog-scroll">
              <div class="cuai-settings" hidden>
                <label class="cuai-label">API 종류</label>
                <select class="cuai-select" data-setting="provider">
                  <option value="gemini">Gemini API</option>
                  <option value="firebase">Firebase AI Logic (CDN 설정)</option>
                </select>
                <div class="cuai-provider-fields" data-provider-fields></div>
  
                <label class="cuai-label">추가 작성/압축 지침 (선택)</label>
                <textarea class="cuai-textarea cuai-extra-prompt" data-setting="additionalCompressionPrompt" placeholder="기본 지침에 더할 내용만 입력하세요."></textarea>
                <div class="cuai-help">압축 모드에는 1차 압축 지침, 검토에는 2차 구조 분석 지침이 자동 적용됩니다.</div>
                <div class="cuai-actions">
                  <button type="button" class="cuai-button cuai-button-primary" data-act="save-settings">설정 저장</button>
                  <button type="button" class="cuai-button" data-act="close-settings">설정 접기</button>
                </div>
                <div class="cuai-status cuai-settings-status" data-settings-status></div>
              </div>
  
              <div class="cuai-body">
                <div class="cuai-mode-row">
                  <label class="cuai-label" for="cuai-compression-level">압축 강도</label>
                  <select class="cuai-select" id="cuai-compression-level" data-setting="compressionLevel">
                    <option value="low">하</option>
                    <option value="medium">중</option>
                    <option value="high">상</option>
                    <option value="maximum">최상</option>
                  </select>
                </div>
                <div class="cuai-help" data-mode-help></div>
                <label class="cuai-label">원본 설정/프롬프트</label>
                <textarea class="cuai-textarea" data-field="source" placeholder="정리하거나 압축할 RP/캐릭터/세계관 내용을 붙여넣으세요."></textarea>
                <div class="cuai-stats"><span data-stat="source">0자</span><span data-stat="ratio"></span></div>
                <div class="cuai-actions">
                  <button type="button" class="cuai-button cuai-button-primary" data-act="generate">작성</button>
                  <button type="button" class="cuai-button" data-act="clear-source">원문 지우기</button>
                </div>
  
                <label class="cuai-label">작성/압축 결과</label>
                <textarea class="cuai-textarea cuai-result" data-field="result" placeholder="#키워드\n-설명\n-설명"></textarea>
                <div class="cuai-stats"><span data-stat="result">0자</span><span></span></div>
                <div class="cuai-apply-row">
                  <button type="button" class="cuai-button" data-act="append">유저노트 아래에 추가</button>
                  <button type="button" class="cuai-button" data-act="replace">유저노트 교체</button>
                  <button type="button" class="cuai-button" data-act="copy">복사</button>
                  <button type="button" class="cuai-button cuai-review-button" data-act="review">🔎 결과 검토</button>
                  <button type="button" class="cuai-button" data-act="open-review">검토 결과 보기</button>
                </div>
                <div class="cuai-status" data-status></div>
              </div>
            </div>
          </div>
        </dialog>
  
        <dialog class="cuai-dialog cuai-review-dialog" data-dialog="review">
          <div class="cuai-dialog-shell">
            <header class="cuai-dialog-header">
              <strong>🔎 프롬프트 구조 분석 결과</strong>
              <button type="button" class="cuai-icon-button" data-act="close-review" aria-label="닫기">×</button>
            </header>
            <div class="cuai-dialog-scroll">
              <div class="cuai-help cuai-review-help">선택한 검토 모델이 2차 지침으로 한글화·우선순위·충돌/반영 방식을 분석한 결과입니다.</div>
              <textarea class="cuai-textarea cuai-review-result" data-field="reviewResult" placeholder="검토 결과가 여기에 별도로 표시됩니다."></textarea>
              <div class="cuai-actions">
                <button type="button" class="cuai-button" data-act="copy-review">검토 결과 복사</button>
                <button type="button" class="cuai-button cuai-button-primary" data-act="close-review">확인</button>
              </div>
            </div>
          </div>
        </dialog>
      `;
  
      let anchor = textarea;
      while (anchor.parentElement && anchor.parentElement !== boundary) anchor = anchor.parentElement;
      if (anchor.parentElement !== boundary) return destroyUI();
      anchor.insertAdjacentElement("afterend", root);
      currentRoot = root;
  
      wireUI(root);
      await loadSettingsIntoUI(root);
    }
  
    function wireUI(root) {
      const mainDialog = root.querySelector('[data-dialog="main"]');
      const reviewDialog = root.querySelector('[data-dialog="review"]');
      const settingsPanel = root.querySelector(".cuai-settings");
      const source = root.querySelector('[data-field="source"]');
      const result = root.querySelector('[data-field="result"]');
      const reviewResult = root.querySelector('[data-field="reviewResult"]');
      const provider = root.querySelector('[data-setting="provider"]');
      const compressionLevel = root.querySelector('[data-setting="compressionLevel"]');
  
      root.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-act]");
        if (!button) return;
        const act = button.dataset.act;
  
        if (act === "open-main") {
          if (!mainDialog.open) mainDialog.showModal();
        } else if (act === "close-main") {
          mainDialog.close();
        } else if (act === "settings") {
          settingsPanel.hidden = !settingsPanel.hidden;
        } else if (act === "close-settings") {
          settingsPanel.hidden = true;
        } else if (act === "save-settings") {
          await saveSettings(root);
          setSettingsStatus(root, "설정 저장 완료");
        } else if (act === "generate") {
          await generate(root, button);
        } else if (act === "review") {
          await reviewGeneratedPrompt(root, button);
        } else if (act === "open-review") {
          if (!reviewResult.value.trim()) return setStatus(root, "아직 검토 결과가 없음", true);
          if (!reviewDialog.open) reviewDialog.showModal();
        } else if (act === "close-review") {
          reviewDialog.close();
        } else if (act === "clear-source") {
          source.value = "";
          updateStats(root);
        } else if (act === "copy") {
          if (!result.value.trim()) return setStatus(root, "복사할 결과가 없음", true);
          await navigator.clipboard.writeText(result.value);
          setStatus(root, "결과 복사됨");
        } else if (act === "copy-review") {
          if (!reviewResult.value.trim()) return;
          await navigator.clipboard.writeText(reviewResult.value);
        } else if (act === "append") {
          applyToUserNote(result.value, "append", root);
        } else if (act === "replace") {
          applyToUserNote(result.value, "replace", root);
        }
      });
  
      for (const dialog of [mainDialog, reviewDialog]) {
        dialog.addEventListener("click", (event) => {
          if (event.target === dialog) dialog.close();
        });
      }
  
      source.addEventListener("input", () => updateStats(root));
      result.addEventListener("input", () => updateStats(root));
      compressionLevel.addEventListener("change", () => updateModeUI(root));
      provider.addEventListener("change", () => {
        root._cuaiSettings = collectSettings(root);
        root._cuaiSettings.provider = provider.value;
        renderProviderFields(root);
      });
    }
  
    function sanitizeSettings(raw = {}) {
      const provider = raw.provider === "firebase" ? "firebase" : "gemini";
      return {
        provider,
        compressionLevel: ["low", "medium", "high", "maximum"].includes(raw.compressionLevel)
          ? raw.compressionLevel
          : raw.compressionEnabled === true ? "maximum" : "low",
        additionalCompressionPrompt: raw.additionalCompressionPrompt || raw.compressionPrompt || "",
        geminiApiKey: raw.geminiApiKey || "",
        geminiModel: normalizeModelSelection(raw.geminiModel, DEFAULT_WRITING_MODEL),
        geminiReviewModel: normalizeModelSelection(raw.geminiReviewModel, DEFAULT_REVIEW_MODEL),
        geminiReasoningLevel: normalizeReasoning(raw.geminiReasoningLevel),
        geminiReviewReasoningLevel: normalizeReasoning(raw.geminiReviewReasoningLevel),
        firebaseConfig: raw.firebaseConfig || "",
        firebaseBackend: raw.firebaseBackend === "googleAI" ? "googleAI" : "vertexAI",
        firebaseLocation: raw.firebaseLocation || "global",
        firebaseModel: normalizeModelSelection(raw.firebaseModel, DEFAULT_WRITING_MODEL),
        firebaseReviewModel: normalizeModelSelection(raw.firebaseReviewModel, DEFAULT_REVIEW_MODEL),
        firebaseReasoningLevel: normalizeReasoning(raw.firebaseReasoningLevel),
        firebaseReviewReasoningLevel: normalizeReasoning(raw.firebaseReviewReasoningLevel)
      };
    }
  
    function normalizeReasoning(value) {
      return ["low", "medium", "high"].includes(value) ? value : "medium";
    }
  
    function normalizeModelSelection(value, fallback) {
      return GEMINI_MODEL_IDS.has(value) ? value : fallback;
    }
  
    async function loadSettingsIntoUI(root) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const settings = sanitizeSettings(stored[STORAGE_KEY]);
      root._cuaiSettings = settings;
      root.querySelector('[data-setting="provider"]').value = settings.provider;
      root.querySelector('[data-setting="compressionLevel"]').value = settings.compressionLevel;
      root.querySelector('[data-setting="additionalCompressionPrompt"]').value = settings.additionalCompressionPrompt;
      renderProviderFields(root);
      updateModeUI(root);
      await chrome.storage.local.set({ [STORAGE_KEY]: settings });
    }
  
    function renderProviderFields(root) {
      const provider = root.querySelector('[data-setting="provider"]').value;
      const holder = root.querySelector("[data-provider-fields]");
      const settings = root._cuaiSettings || sanitizeSettings();
  
      if (provider === "gemini") {
        holder.innerHTML = `
          <label class="cuai-label">Gemini API Key</label>
          <input class="cuai-input" type="password" data-setting="geminiApiKey" autocomplete="off">
          <div class="cuai-model-reasoning-row">
            <div>
              <label class="cuai-label">작성/압축 AI 모델</label>
              <select class="cuai-select" data-setting="geminiModel">${modelOptionsHtml("writing")}</select>
            </div>
            <div>
              <label class="cuai-label">추론 강도</label>
              <select class="cuai-select" data-setting="geminiReasoningLevel">${reasoningOptionsHtml()}</select>
            </div>
          </div>
          <div class="cuai-model-reasoning-row">
            <div>
              <label class="cuai-label">검토 AI 모델</label>
              <select class="cuai-select" data-setting="geminiReviewModel">${modelOptionsHtml("review")}</select>
            </div>
            <div>
              <label class="cuai-label">추론 강도</label>
              <select class="cuai-select" data-setting="geminiReviewReasoningLevel">${reasoningOptionsHtml()}</select>
            </div>
          </div>
          <div class="cuai-help">기본값: 작성/압축 3.6 Flash · 검토 3.1 Pro. 3.1 Pro는 결제 설정과 API 접근 권한이 필요할 수 있습니다.</div>
        `;
        holder.querySelector('[data-setting="geminiApiKey"]').value = settings.geminiApiKey;
        holder.querySelector('[data-setting="geminiModel"]').value = settings.geminiModel;
        holder.querySelector('[data-setting="geminiReviewModel"]').value = settings.geminiReviewModel;
        holder.querySelector('[data-setting="geminiReasoningLevel"]').value = settings.geminiReasoningLevel;
        holder.querySelector('[data-setting="geminiReviewReasoningLevel"]').value = settings.geminiReviewReasoningLevel;
      } else {
        holder.innerHTML = `
          <label class="cuai-label">Firebase CDN 설정 (firebaseConfig)</label>
          <textarea class="cuai-textarea cuai-firebase-config" data-setting="firebaseConfig" placeholder='const firebaseConfig = {\n  apiKey: "...",\n  authDomain: "...",\n  projectId: "...",\n  appId: "..."\n};'></textarea>
          <div class="cuai-help">Firebase 콘솔의 웹 앱 설정에 표시되는 firebaseConfig 객체를 그대로 붙여넣으세요.</div>
          <label class="cuai-label">Gemini API 백엔드</label>
          <select class="cuai-select" data-setting="firebaseBackend">
            <option value="googleAI">Gemini Developer API</option>
            <option value="vertexAI">Vertex AI Gemini API</option>
          </select>
          <label class="cuai-label">Vertex AI 위치</label>
          <input class="cuai-input" data-setting="firebaseLocation" placeholder="global">
          <div class="cuai-help">Gemini 3.x 또는 Preview 모델을 Vertex AI로 사용할 때는 global이 필요합니다.</div>
          <div class="cuai-model-reasoning-row">
            <div>
              <label class="cuai-label">작성/압축 AI 모델</label>
              <select class="cuai-select" data-setting="firebaseModel">${modelOptionsHtml("writing")}</select>
            </div>
            <div>
              <label class="cuai-label">추론 강도</label>
              <select class="cuai-select" data-setting="firebaseReasoningLevel">${reasoningOptionsHtml()}</select>
            </div>
          </div>
          <div class="cuai-model-reasoning-row">
            <div>
              <label class="cuai-label">검토 AI 모델</label>
              <select class="cuai-select" data-setting="firebaseReviewModel">${modelOptionsHtml("review")}</select>
            </div>
            <div>
              <label class="cuai-label">추론 강도</label>
              <select class="cuai-select" data-setting="firebaseReviewReasoningLevel">${reasoningOptionsHtml()}</select>
            </div>
          </div>
        `;
        holder.querySelector('[data-setting="firebaseConfig"]').value = settings.firebaseConfig;
        holder.querySelector('[data-setting="firebaseBackend"]').value = settings.firebaseBackend;
        holder.querySelector('[data-setting="firebaseLocation"]').value = settings.firebaseLocation;
        holder.querySelector('[data-setting="firebaseModel"]').value = settings.firebaseModel;
        holder.querySelector('[data-setting="firebaseReviewModel"]').value = settings.firebaseReviewModel;
        holder.querySelector('[data-setting="firebaseReasoningLevel"]').value = settings.firebaseReasoningLevel;
        holder.querySelector('[data-setting="firebaseReviewReasoningLevel"]').value = settings.firebaseReviewReasoningLevel;
      }
    }
  
    function modelOptionsHtml(purpose) {
      return GEMINI_MODELS.map((model) => {
        const recommended = purpose === "review"
          ? model.id === "gemini-3.1-pro-preview"
          : ["gemini-3.6-flash", "gemini-3.5-flash"].includes(model.id);
        return `<option value="${escapeAttr(model.id)}">${escapeHtml(model.label + (recommended ? " (권장)" : ""))}</option>`;
      }).join("");
    }
  
    function reasoningOptionsHtml() {
      return `<option value="low">하</option><option value="medium">중</option><option value="high">상</option>`;
    }
  
    function collectSettings(root) {
      const old = root._cuaiSettings || sanitizeSettings();
      const value = (key, fallback = "") => root.querySelector(`[data-setting="${key}"]`)?.value ?? fallback;
      return {
        provider: value("provider", old.provider),
        compressionLevel: value("compressionLevel", old.compressionLevel),
        additionalCompressionPrompt: value("additionalCompressionPrompt", old.additionalCompressionPrompt),
        geminiApiKey: value("geminiApiKey", old.geminiApiKey),
        geminiModel: value("geminiModel", old.geminiModel),
        geminiReviewModel: value("geminiReviewModel", old.geminiReviewModel),
        geminiReasoningLevel: value("geminiReasoningLevel", old.geminiReasoningLevel),
        geminiReviewReasoningLevel: value("geminiReviewReasoningLevel", old.geminiReviewReasoningLevel),
        firebaseConfig: value("firebaseConfig", old.firebaseConfig),
        firebaseBackend: value("firebaseBackend", old.firebaseBackend),
        firebaseLocation: value("firebaseLocation", old.firebaseLocation),
        firebaseModel: value("firebaseModel", old.firebaseModel),
        firebaseReviewModel: value("firebaseReviewModel", old.firebaseReviewModel),
        firebaseReasoningLevel: value("firebaseReasoningLevel", old.firebaseReasoningLevel),
        firebaseReviewReasoningLevel: value("firebaseReviewReasoningLevel", old.firebaseReviewReasoningLevel)
      };
    }
  
    async function saveSettings(root) {
      const next = sanitizeSettings(collectSettings(root));
      root._cuaiSettings = next;
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
      return next;
    }
  
    async function generate(root, button) {
      const source = root.querySelector('[data-field="source"]').value.trim();
      if (!source) return setStatus(root, "압축할 원본 프롬프트를 먼저 입력해줘", true);
  
      const settings = await saveSettings(root);
      const provider = settings.provider;
      const prompt = buildPrompt(source, settings.additionalCompressionPrompt, settings.compressionLevel);
      const config = providerConfig(provider, settings);
  
      button.disabled = true;
      button.textContent = "압축 중…";
      setStatus(root, modeStatusText(settings.compressionLevel));
  
      try {
        const response = await chrome.runtime.sendMessage({
          type: "CRACK_USERNOTE_AI_GENERATE",
          payload: { provider, prompt, config }
        });
        if (!response?.ok) throw new Error(response?.error || "API 호출 실패");
  
        root.querySelector('[data-field="result"]').value = cleanupOutput(response.result || "");
        updateStats(root);
        setStatus(root, "완료됨. 결과를 확인한 뒤 유저노트에 적용하면 됨.");
      } catch (error) {
        setStatus(root, error?.message || String(error), true);
      } finally {
        button.disabled = false;
        button.textContent = modeButtonText(settings.compressionLevel);
      }
    }
  
    async function reviewGeneratedPrompt(root, button) {
      const target = root.querySelector('[data-field="result"]').value.trim();
      if (!target) return setStatus(root, "먼저 작성/압축 결과를 만들어줘", true);
  
      const settings = await saveSettings(root);
      const prompt = `${REVIEW_PROMPT}\n\n[분석할 프롬프트]\n${target}`;
      const config = providerConfig(settings.provider, settings, "review");
  
      button.disabled = true;
      button.textContent = "검토 중…";
      setStatus(root, "선택한 검토 모델이 프롬프트 구조를 분석하는 중…");
      try {
        const response = await chrome.runtime.sendMessage({
          type: "CRACK_USERNOTE_AI_GENERATE",
          payload: { provider: settings.provider, prompt, config }
        });
        if (!response?.ok) throw new Error(response?.error || "검토 API 호출 실패");
  
        root.querySelector('[data-field="reviewResult"]').value = cleanupOutput(response.result || "");
        const reviewDialog = root.querySelector('[data-dialog="review"]');
        if (!reviewDialog.open) reviewDialog.showModal();
        setStatus(root, "검토 완료. 분석 결과를 별도 팝업에 표시함.");
      } catch (error) {
        setStatus(root, error?.message || String(error), true);
      } finally {
        button.disabled = false;
        button.textContent = "🔎 결과 검토";
      }
    }
  
    function buildPrompt(source, additionalPrompt, compressionLevel) {
      const extra = additionalPrompt.trim()
        ? `\n\n[사용자 추가 지침]\n${additionalPrompt.trim()}`
        : "";
      if (compressionLevel === "maximum") {
        return `${COMMON_COMPRESSION_PROMPT}${extra}\n\n[현재 작업]\n아래 원본 프롬프트를 위 절대 규칙대로 압축하라. 분석/설명/서문 없이 최종 압축 프롬프트만 출력.\n\n[원본 프롬프트]\n${source}`;
      }
      if (["low", "medium", "high"].includes(compressionLevel)) {
        const selectedRule = {
          low: "[선택 강도: 하]\n원문 뉘앙스·의도·세부정보를 최대한 유지하고 표현만 정리하라. 중복도 의미 차이가 있으면 보존하라.",
          medium: "[선택 강도: 중]\n모든 의미와 제한을 보존하면서 중복을 제거하고 목록형·규칙형 문장으로 압축하라.",
          high: "[선택 강도: 상]\n글자수 절약을 우선하라. 의미·제한을 보존하면서 중복을 적극 제거하고 약어·한자·기호를 효율 원칙 범위에서 적극 사용하라."
        }[compressionLevel];
        return `${CONTROLLED_COMPRESSION_PROMPT}\n\n${selectedRule}${extra}\n\n[현재 작업]\n분석/설명/서문 없이 최종 결과만 출력.\n\n[원본 프롬프트]\n${source}`;
      }
      return buildPrompt(source, additionalPrompt, "low");
    }
  
    function updateModeUI(root) {
      const level = root.querySelector('[data-setting="compressionLevel"]')?.value || "low";
      const button = root.querySelector('[data-act="generate"]');
      const result = root.querySelector('[data-field="result"]');
      const help = root.querySelector("[data-mode-help]");
      if (button && !button.disabled) button.textContent = modeButtonText(level);
      if (result) result.placeholder = `${{ low: "하", medium: "중", high: "상", maximum: "최상" }[level] || "하"} 단계 압축 결과`;
      if (help) help.textContent = {
        low: "선택한 하 단계로 압축합니다.",
        medium: "선택한 중 단계로 압축합니다.",
        high: "선택한 상 단계로 압축합니다.",
        maximum: "선택한 최상 단계로 압축합니다."
      }[level];
    }
  
    function modeButtonText(level) {
      return { low: "하 압축", medium: "중 압축", high: "상 압축", maximum: "최상 압축" }[level] || "하 압축";
    }
  
    function modeStatusText(level) {
      return {
        low: "AI가 하 단계로 압축하는 중…",
        medium: "AI가 중 단계로 압축하는 중…",
        high: "AI가 상 단계로 압축하는 중…",
        maximum: "AI가 최상 단계로 압축하는 중…"
      }[level] || "AI가 하 단계로 압축하는 중…";
    }
  
    function providerConfig(provider, settings, purpose = "generate") {
      if (provider === "gemini") {
        return {
          apiKey: settings.geminiApiKey,
          model: purpose === "review" ? settings.geminiReviewModel : settings.geminiModel,
          reasoningLevel: purpose === "review" ? settings.geminiReviewReasoningLevel : settings.geminiReasoningLevel
        };
      }
      return {
        firebaseConfig: settings.firebaseConfig,
        backend: settings.firebaseBackend,
        location: settings.firebaseLocation,
        model: purpose === "review" ? settings.firebaseReviewModel || settings.firebaseModel : settings.firebaseModel,
        reasoningLevel: purpose === "review" ? settings.firebaseReviewReasoningLevel : settings.firebaseReasoningLevel
      };
    }
  
    function cleanupOutput(text) {
      return String(text || "").replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }
  
    function applyToUserNote(text, mode, root) {
      if (!text.trim()) return setStatus(root, "적용할 결과가 없음", true);
      const context = findUserNoteContext();
      const note = context?.textarea === currentNoteInput ? context.textarea : currentNoteInput;
      if (!note || !isVisible(note)) return setStatus(root, "현재 열린 유저노트 입력창을 찾지 못함", true);
  
      const next = mode === "append"
        ? [note.value.trimEnd(), text.trim()].filter(Boolean).join("\n\n")
        : text.trim();
      setNativeValue(note, next);
      note.dispatchEvent(new Event("input", { bubbles: true }));
      note.dispatchEvent(new Event("change", { bubbles: true }));
      note.focus();
      setStatus(root, mode === "append" ? "유저노트 아래에 추가함. 저장은 직접 눌러줘." : "유저노트를 교체함. 저장은 직접 눌러줘.");
    }
  
    function setNativeValue(el, value) {
      const own = Object.getOwnPropertyDescriptor(el, "value")?.set;
      const proto = Object.getPrototypeOf(el);
      const protoSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (protoSetter && own !== protoSetter) protoSetter.call(el, value);
      else if (own) own.call(el, value);
      else el.value = value;
    }
  
    function updateStats(root) {
      const source = root.querySelector('[data-field="source"]').value;
      const result = root.querySelector('[data-field="result"]').value;
      root.querySelector('[data-stat="source"]').textContent = `${source.length.toLocaleString()}자`;
      root.querySelector('[data-stat="result"]').textContent = `${result.length.toLocaleString()}자`;
      const ratio = root.querySelector('[data-stat="ratio"]');
      if (source.length && result.length) {
        const reduction = Math.round((1 - result.length / source.length) * 1000) / 10;
        ratio.textContent = `→ ${result.length.toLocaleString()}자 (${reduction >= 0 ? "-" : "+"}${Math.abs(reduction)}%)`;
      } else ratio.textContent = "";
    }
  
    function setStatus(root, text, isError = false) {
      const el = root.querySelector("[data-status]");
      if (!el) return;
      el.textContent = text;
      el.dataset.error = isError ? "true" : "false";
    }
  
    function setSettingsStatus(root, text, isError = false) {
      const el = root.querySelector("[data-settings-status]");
      if (!el) return;
      el.textContent = text;
      el.dataset.error = isError ? "true" : "false";
    }
  
    function escapeAttr(value) {
      return String(value).replace(/[&<>\"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[ch]));
    }
  
    function escapeHtml(value) {
      return escapeAttr(value).replace(/'/g, "&#39;");
    }
  
    scheduleScan();
  })();
  
})();


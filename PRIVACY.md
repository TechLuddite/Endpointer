# 🔒 Endpointer Privacy Policy

**Effective Date:** August 1, 2026

Endpointer ("we", "our", or "the app") is committed to protecting your privacy while using our Interactive API Playground & Health Tester platform.

---

## 1. Local Storage & Data Retention

- **Browser Storage**: All user preferences, favorited APIs, created request collections, and request execution histories are stored exclusively inside your browser's local storage (`localStorage`).
- **No Account Required**: Endpointer does not require user registration or account creation.
- **Data Control**: You can clear your request history and collections at any time directly through the app UI or by clearing your browser site data.

---

## 2. API Key & Request Safety

- **Transient Processing**: Any API keys, Bearer tokens, or authentication headers entered in the REST Playground are passed strictly to target endpoints via CORS proxying or direct browser fetch.
- **No Server Persistence**: We do **not** store, log, or persist your API credentials or request payloads on any server or database.

---

## 3. Analytics & Telemetry

- Endpointer contains **zero analytics scripts**, zero tracking cookies, and zero user-profiling tools.

---

## 4. Third-Party Services & Gemini LLM AI Copilot

- **LLM Processing**: Optional AI Copilot and schema analysis features send user prompt queries and active request context (URL, headers, query params, and response payloads) to Google Gemini LLM API endpoints (`gemini-3.6-flash`).
- **Stateless Operation**: Endpointer does not log, track, or persist prompt history or AI completions on any database or server storage.
- **Client Fallback**: If backend LLM endpoints are unconfigured or offline, analysis runs deterministically inside your browser without external transmission.

### ⚠️ Common LLM Concerns & Warnings

1. **Sensitive Data Protection**: Never include production passwords, secret keys, confidential authorization tokens, or sensitive PII (Personally Identifiable Information) in AI prompts or payload contexts. Sanitize payloads with mock data prior to requesting AI analysis.
2. **Third-Party Model Processing**: Requests sent to the AI Copilot are processed by external foundation model infrastructure in accordance with standard Gemini API developer guidelines.
3. **AI Hallucinations & Output Verification**: AI-generated HTTP parameters, TypeScript interfaces, and payload structures are probabilistic. Always review and validate AI-generated configurations before executing them against live production systems.

---

## 5. Contact & Support

If you have questions regarding this Privacy Policy, please reach out via GitHub Issues or contact [opsvibe.systems@gmail.com](mailto:opsvibe.systems@gmail.com).

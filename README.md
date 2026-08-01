# ⚡ Endpointer

> **Interactive API Playground, Real-Time Health Tester & AI Schema Assistant**

Endpointer is a developer platform designed for testing, exploring, and building REST & HTTP API workflows. It combines a curated directory of 65+ public APIs, an interactive REST playground with AI context-driven configuration, zero-CORS proxying, real-time health pings, and collection management.

![Endpointer App Preview](https://raw.githubusercontent.com/TechLuddite/Endpointer/main/docs/preview.png)

---

## ✨ Features

- 🛠️ **REST Playground**: Interactive request builder with support for custom HTTP methods, headers, URL params, bearer tokens, basic auth, and body payloads.
- 🤖 **AI Playground Assistant**: Context-aware Gemini 3.6 Flash copilot embedded in the playground that drives API configs, creates queries (e.g. Pokédex queries), generates TypeScript interfaces, and explains HTTP errors.
- 🌐 **Zero-CORS Proxy Engine**: Built-in Express reverse proxy engine that bypasses browser CORS restrictions cleanly.
- 📚 **Curated Public API Directory**: Browse 65+ verified public APIs categorized by Weather, Crypto, Finance, AI, Development, Gaming, Science, and Entertainment.
- ⏱️ **Real-Time Health Monitor**: Live batch pings with latency measurement (ms), HTTP status verification, and failure detection.
- 💻 **Multi-Language Code Generator**: Instantly export requests to `fetch()`, `axios`, `cURL`, `Python (requests)`, `Node.js`, `Go`, `Rust`, and `PHP`.
- 📁 **Collections & History**: Save request presets, organize collections, and track request history stored in client-side storage.
- 🔒 **Privacy First & Local Storage**: No telemetry, no backend tracking of API keys or user data.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18+ or v20+
- **npm**: v9+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/TechLuddite/Endpointer.git
cd Endpointer
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. Launch development server:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide React Icons
- **Backend Server**: Node.js, Express, `tsx` / `esbuild`
- **AI Engine**: `@google/genai` (Gemini 3.6 Flash)
- **Proxy**: Node `axios` / `fetch` proxy middleware for CORS bypassing

---

## 🛡️ Privacy & Security

Endpointer prioritizes developer privacy:
- All request collections and request histories are stored strictly in your browser's `localStorage`.
- API keys entered in the Playground are transient and never saved to any external database.
- Read our full [Privacy Policy](./PRIVACY.md) for details.

---

## 💖 Support the Developer

If Endpointer helps your daily API development workflow, consider supporting project maintenance and server infrastructure! Click **Dev Support** in the app footer or visit [GitHub Sponsors](https://github.com/sponsors).

---

## 📄 License

This project is open-source under the MIT License.

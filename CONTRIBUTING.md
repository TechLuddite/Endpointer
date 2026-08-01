# 🤝 Contributing to Endpointer

Thank you for considering contributing to Endpointer!

---

## 🚀 How to Contribute

1. **Fork the Repository**
2. **Create a Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Commit Your Changes**: `git commit -m 'Add amazing feature'`
4. **Push to Branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

---

## 🛠️ Code Conventions

- **TypeScript**: Strict type checking with clean interfaces in `src/types.ts`.
- **Styling**: Tailwind CSS classes following the Endpointer dark cyberpunk aesthetic (slate-950, indigo, cyan, emerald accents).
- **Linting & Formatting**: Ensure `npm run lint` and `npm run build` succeed before submitting pull requests.

---

## 💡 Adding New Public APIs

To add a new API to the directory, edit `src/data/publicApis.ts` and add an entry matching the `PublicApi` interface:

```typescript
{
  id: 'unique-id',
  name: 'API Name',
  category: 'Weather' | 'Crypto' | 'Finance' | 'AI & ML' | 'Development' | 'Gaming' | 'Science & Space' | 'Entertainment & Media',
  description: 'Short summary of the API',
  baseUrl: 'https://api.example.com',
  endpoint: '/v1/data',
  method: 'GET',
  cors: 'Yes' | 'Proxy Needed' | 'No',
  auth: 'No Auth' | 'API Key' | 'OAuth' | 'Bearer Token',
  documentationUrl: 'https://docs.example.com',
  sampleResponse: { ... }
}
```

import type { CodeLanguage, RequestConfig } from '../types';
import { joinUrl } from './requestUrl';

/**
 * Build the full request URL.
 *
 * `config.url` carries no query string (see requestUrl.ts), so this is a plain
 * join rather than the old append-onto-whatever-is-already-there, which
 * duplicated every parameter that appeared in both places.
 */
export function buildFullUrl(config: RequestConfig): string {
  const params = [...config.params];

  if (
    config.authType === 'API Key' &&
    config.authConfig.apiKeyIn === 'query' &&
    config.authConfig.apiKeyName
  ) {
    params.push({
      id: 'auth-api-key',
      key: config.authConfig.apiKeyName,
      value: config.authConfig.apiKeyValue ?? '',
      enabled: true,
    });
  }

  return joinUrl(config.url, params);
}

function base64(input: string): string {
  if (typeof btoa === 'function') {
    // btoa is latin1-only, so encode to bytes first; otherwise a non-ASCII
    // credential throws InvalidCharacterError.
    return btoa(String.fromCharCode(...new TextEncoder().encode(input)));
  }
  return Buffer.from(input, 'utf8').toString('base64');
}

export function buildHeadersRecord(config: RequestConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const h of config.headers) {
    if (h.enabled && h.key.trim()) headers[h.key] = h.value;
  }

  const hasHeader = (name: string) =>
    Object.keys(headers).some((k) => k.toLowerCase() === name.toLowerCase());

  if (config.authType === 'Bearer Token' && config.authConfig.bearerToken) {
    headers.Authorization = `Bearer ${config.authConfig.bearerToken}`;
  } else if (
    config.authType === 'API Key' &&
    config.authConfig.apiKeyIn === 'header' &&
    config.authConfig.apiKeyName
  ) {
    headers[config.authConfig.apiKeyName] = config.authConfig.apiKeyValue ?? '';
  } else if (config.authType === 'Basic Auth' && config.authConfig.basicUsername) {
    const credentials = `${config.authConfig.basicUsername}:${config.authConfig.basicPassword ?? ''}`;
    headers.Authorization = `Basic ${base64(credentials)}`;
  }

  if (config.bodyType === 'json' && config.body && !hasHeader('content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

/** Whether this request actually carries a body. */
export function hasRequestBody(config: RequestConfig): boolean {
  return (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method) &&
    config.bodyType !== 'none' &&
    Boolean(config.body.trim())
  );
}

/**
 * Single-quote a string for POSIX shells.
 *
 * The previous generator escaped only double quotes and wrapped the body in
 * double quotes, so a body containing `$`, a backtick or a backslash produced a
 * command the shell would mangle — or execute.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Quote for a single-quoted PHP string literal. */
function phpQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Quote for a Go interpreted string literal. */
function goQuote(value: string): string {
  return JSON.stringify(value);
}

/** Choose a Rust raw-string hash count that cannot collide with the payload. */
function rustRawString(value: string): string {
  let hashes = '';
  while (value.includes(`"${hashes}`)) hashes += '#';
  return `r${hashes}"${value}"${hashes}`;
}

export function generateCodeSnippet(config: RequestConfig, language: CodeLanguage): string {
  const fullUrl = buildFullUrl(config);
  const headers = buildHeadersRecord(config);
  const withBody = hasRequestBody(config);
  const body = config.body.trim();
  const headerEntries = Object.entries(headers);

  switch (language) {
    case 'fetch': {
      const parts = [`  method: '${config.method}',`];
      if (headerEntries.length) parts.push(`  headers: ${JSON.stringify(headers, null, 4)},`);
      if (withBody) {
        parts.push(
          config.bodyType === 'json'
            ? `  body: JSON.stringify(${body}),`
            : `  body: ${JSON.stringify(body)},`,
        );
      }
      return `// JavaScript — fetch
const response = await fetch(${JSON.stringify(fullUrl)}, {
${parts.join('\n')}
});

if (!response.ok) {
  throw new Error(\`HTTP \${response.status} \${response.statusText}\`);
}

const data = await response.json();
console.log(data);`;
    }

    case 'axios': {
      const parts = [
        `  method: '${config.method.toLowerCase()}',`,
        `  url: ${JSON.stringify(fullUrl)},`,
      ];
      if (headerEntries.length) parts.push(`  headers: ${JSON.stringify(headers, null, 4)},`);
      if (withBody) {
        parts.push(
          config.bodyType === 'json' ? `  data: ${body},` : `  data: ${JSON.stringify(body)},`,
        );
      }
      return `// JavaScript — axios
import axios from 'axios';

try {
  const { status, data } = await axios({
${parts.join('\n')}
  });
  console.log(status, data);
} catch (error) {
  console.error(error.response?.status, error.response?.data ?? error.message);
}`;
    }

    case 'curl': {
      let cmd = `curl -sS -X ${config.method} ${shellQuote(fullUrl)}`;
      for (const [key, value] of headerEntries) {
        cmd += ` \\\n  -H ${shellQuote(`${key}: ${value}`)}`;
      }
      if (withBody) cmd += ` \\\n  -d ${shellQuote(body)}`;
      return `# cURL\n${cmd}`;
    }

    case 'python': {
      const lines = ['import requests', '', `url = ${JSON.stringify(fullUrl)}`];
      if (headerEntries.length) lines.push(`headers = ${JSON.stringify(headers, null, 4)}`);
      if (withBody) {
        lines.push(
          config.bodyType === 'json' ? `payload = ${body}` : `payload = ${JSON.stringify(body)}`,
        );
      }

      const args = ['url'];
      if (headerEntries.length) args.push('headers=headers');
      if (withBody) args.push(config.bodyType === 'json' ? 'json=payload' : 'data=payload');
      args.push('timeout=30');

      lines.push(
        '',
        `response = requests.${config.method.toLowerCase()}(${args.join(', ')})`,
        'response.raise_for_status()',
        '',
        'print(response.status_code)',
        'print(response.json())',
      );
      return `# Python — requests\n${lines.join('\n')}`;
    }

    case 'node': {
      const parts = [`  method: '${config.method}',`];
      if (headerEntries.length) parts.push(`  headers: ${JSON.stringify(headers, null, 4)},`);
      if (withBody) {
        parts.push(
          config.bodyType === 'json'
            ? `  body: JSON.stringify(${body}),`
            : `  body: ${JSON.stringify(body)},`,
        );
      }
      return `// Node.js 20+ — native fetch
const response = await fetch(${JSON.stringify(fullUrl)}, {
${parts.join('\n')}
});

console.log(response.status, await response.json());`;
    }

    case 'go': {
      const headerLines = headerEntries
        .map(([k, v]) => `\treq.Header.Set(${goQuote(k)}, ${goQuote(v)})`)
        .join('\n');
      return `// Go — net/http
package main

import (
\t"fmt"
\t"io"
\t"net/http"${withBody ? '\n\t"strings"' : ''}
\t"time"
)

func main() {
\turl := ${goQuote(fullUrl)}
${
  withBody
    ? `\tpayload := strings.NewReader(${goQuote(body)})\n\treq, err := http.NewRequest(${goQuote(config.method)}, url, payload)`
    : `\treq, err := http.NewRequest(${goQuote(config.method)}, url, nil)`
}
\tif err != nil {
\t\tpanic(err)
\t}
${headerLines}

\tclient := &http.Client{Timeout: 30 * time.Second}
\tres, err := client.Do(req)
\tif err != nil {
\t\tpanic(err)
\t}
\tdefer res.Body.Close()

\tbody, _ := io.ReadAll(res.Body)
\tfmt.Println(res.Status)
\tfmt.Println(string(body))
}`;
    }

    case 'rust': {
      // The previous version used HeaderValue::from_static, which requires a
      // &'static str and does not compile for a runtime value.
      const headerLines = headerEntries
        .map(([k, v]) => `        .header(${JSON.stringify(k)}, ${JSON.stringify(v)})`)
        .join('\n');
      return `// Rust — reqwest
// Cargo.toml: reqwest = { version = "0.12", features = ["json"] }
//             tokio   = { version = "1", features = ["full"] }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();

    let response = client
        .request(reqwest::Method::${config.method}, ${JSON.stringify(fullUrl)})
${headerLines}${withBody ? `\n        .body(${rustRawString(body)})` : ''}
        .send()
        .await?;

    println!("{}", response.status());
    println!("{}", response.text().await?);

    Ok(())
}`;
    }

    case 'php': {
      const headerArray = headerEntries
        .map(([k, v]) => `    ${phpQuote(`${k}: ${v}`)}`)
        .join(',\n');
      return `<?php
// PHP — cURL
$curl = curl_init();

curl_setopt_array($curl, [
  CURLOPT_URL => ${phpQuote(fullUrl)},
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => ${phpQuote(config.method)},
  CURLOPT_TIMEOUT => 30,${withBody ? `\n  CURLOPT_POSTFIELDS => ${phpQuote(body)},` : ''}
  CURLOPT_HTTPHEADER => [
${headerArray}
  ],
]);

$response = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
$error = curl_error($curl);
curl_close($curl);

if ($error) {
  echo "cURL error: " . $error;
} else {
  echo $status . PHP_EOL . $response;
}`;
    }

    default:
      return '// Select a language';
  }
}

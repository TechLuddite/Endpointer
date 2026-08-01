import { RequestConfig, CodeLanguage } from '../types';

export function buildFullUrl(config: RequestConfig): string {
  try {
    const urlObj = new URL(config.url);
    
    // Add enabled query params
    config.params.forEach((param) => {
      if (param.enabled && param.key) {
        urlObj.searchParams.append(param.key, param.value);
      }
    });

    // Add API key query param if configured
    if (config.authType === 'API Key' && config.authConfig.apiKeyIn === 'query' && config.authConfig.apiKeyName) {
      urlObj.searchParams.append(config.authConfig.apiKeyName, config.authConfig.apiKeyValue || '');
    }

    return urlObj.toString();
  } catch {
    return config.url;
  }
}

export function buildHeadersRecord(config: RequestConfig): Record<string, string> {
  const headers: Record<string, string> = {};

  config.headers.forEach((h) => {
    if (h.enabled && h.key) {
      headers[h.key] = h.value;
    }
  });

  if (config.authType === 'Bearer Token' && config.authConfig.bearerToken) {
    headers['Authorization'] = `Bearer ${config.authConfig.bearerToken}`;
  } else if (config.authType === 'API Key' && config.authConfig.apiKeyIn === 'header' && config.authConfig.apiKeyName) {
    headers[config.authConfig.apiKeyName] = config.authConfig.apiKeyValue || '';
  } else if (config.authType === 'Basic Auth' && config.authConfig.basicUsername) {
    const credentials = `${config.authConfig.basicUsername}:${config.authConfig.basicPassword || ''}`;
    const encoded = typeof btoa !== 'undefined' ? btoa(credentials) : (typeof Buffer !== 'undefined' ? Buffer.from(credentials).toString('base64') : '');
    headers['Authorization'] = `Basic ${encoded}`;
  }

  if (config.bodyType === 'json' && config.body && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
}

export function generateCodeSnippet(config: RequestConfig, language: CodeLanguage): string {
  const fullUrl = buildFullUrl(config);
  const headers = buildHeadersRecord(config);
  const hasBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(config.method) && Boolean(config.body);

  switch (language) {
    case 'fetch': {
      const options: Record<string, any> = { method: config.method };
      if (Object.keys(headers).length > 0) options.headers = headers;
      if (hasBody) {
        try {
          options.body = JSON.parse(config.body);
        } catch {
          options.body = config.body;
        }
      }

      return `// JavaScript Fetch (Async/Await)
async function sendRequest() {
  const response = await fetch('${fullUrl}', {
    method: '${config.method}',
${Object.keys(headers).length > 0 ? `    headers: ${JSON.stringify(headers, null, 6)},\n` : ''}${hasBody ? `    body: JSON.stringify(${config.body.trim()}),\n` : ''}  });

  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Data:', data);
}

sendRequest();`;
    }

    case 'axios': {
      return `// JavaScript Axios
import axios from 'axios';

async function sendRequest() {
  try {
    const response = await axios({
      method: '${config.method.toLowerCase()}',
      url: '${fullUrl}',
${Object.keys(headers).length > 0 ? `      headers: ${JSON.stringify(headers, null, 8)},\n` : ''}${hasBody ? `      data: ${config.body.trim()},\n` : ''}    });

    console.log('Status:', response.status);
    console.log('Data:', response.data);
  } catch (error) {
    console.error('Error:', error);
  }
}

sendRequest();`;
    }

    case 'curl': {
      let cmd = `curl -X ${config.method} "${fullUrl}"`;

      Object.entries(headers).forEach(([key, value]) => {
        cmd += ` \\\n  -H "${key}: ${value}"`;
      });

      if (hasBody) {
        // Escaping body for bash
        const safeBody = config.body.replace(/"/g, '\\"');
        cmd += ` \\\n  -d "${safeBody}"`;
      }

      return `# cURL Terminal Command
${cmd}`;
    }

    case 'python': {
      let pyHeaders = '';
      if (Object.keys(headers).length > 0) {
        pyHeaders = `headers = ${JSON.stringify(headers, null, 4)}\n`;
      }

      let pyBody = '';
      if (hasBody) {
        if (config.bodyType === 'json') {
          pyBody = `payload = ${config.body.trim()}\n`;
        } else {
          pyBody = `payload = "${config.body.replace(/"/g, '\\"')}"\n`;
        }
      }

      return `# Python requests library
import requests

url = "${fullUrl}"
${pyHeaders}${pyBody}
response = requests.${config.method.toLowerCase()}(
    url,
${pyHeaders ? '    headers=headers,\n' : ''}${hasBody ? (config.bodyType === 'json' ? '    json=payload,\n' : '    data=payload,\n') : ''})

print("Status Code:", response.status_code)
print("Response JSON:", response.json())`;
    }

    case 'node': {
      return `// Node.js (v18+ Native Fetch)
const options = {
  method: '${config.method}',
  headers: ${JSON.stringify(headers, null, 4)},
${hasBody ? `  body: JSON.stringify(${config.body.trim()}),\n` : ''}};

fetch('${fullUrl}', options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error('error:' + err));`;
    }

    case 'go': {
      return `// Go net/http
package main

import (
	"fmt"
	"io"
	"net/http"
${hasBody ? '\t"strings"\n' : ''})

func main() {
	url := "${fullUrl}"
${hasBody ? `	payload := strings.NewReader(\`${config.body.trim()}\`)\n\treq, _ := http.NewRequest("${config.method}", url, payload)\n` : `	req, _ := http.NewRequest("${config.method}", url, nil)\n`}
${Object.entries(headers)
  .map(([k, v]) => `	req.Header.Add("${k}", "${v}")`)
  .join('\n')}

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)
	fmt.Println("Status:", res.Status)
	fmt.Println(string(body))
}`;
    }

    case 'rust': {
      return `// Rust reqwest
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let mut headers = HeaderMap::new();

${Object.entries(headers)
  .map(([k, v]) => `    headers.insert("${k.toLowerCase()}", HeaderValue::from_static("${v}"));`)
  .join('\n')}

    let res = client
        .${config.method.toLowerCase()}("${fullUrl}")
        .headers(headers)
${hasBody ? `        .body(r#"${config.body.trim()}"#)\n` : ''}        .send()
        .await?;

    println!("Status: {}", res.status());
    let body = res.text().await?;
    println!("Body: {}", body);

    Ok(())
}`;
    }

    case 'php': {
      return `<?php
// PHP cURL
$curl = curl_init();

curl_setopt_array($curl, array(
  CURLOPT_URL => '${fullUrl}',
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_CUSTOMREQUEST => '${config.method}',
${hasBody ? `  CURLOPT_POSTFIELDS => '${config.body.replace(/'/g, "\\'")}',\n` : ''}  CURLOPT_HTTPHEADER => array(
${Object.entries(headers)
  .map(([k, v]) => `    '${k}: ${v}'`)
  .join(',\n')}
  ),
));

$response = curl_exec($curl);
$err = curl_error($curl);
curl_close($curl);

if ($err) {
  echo "cURL Error #:" . $err;
} else {
  echo $response;
}
?>`;
    }

    default:
      return `// Select a language`;
  }
}

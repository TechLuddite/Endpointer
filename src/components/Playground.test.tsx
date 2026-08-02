import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Playground } from './Playground';
import type { ApiResponseData, Capabilities, RequestConfig } from '../types';

const capabilities: Capabilities = {
  ai: { available: false, model: null },
  proxy: { available: false },
  checkedAt: Date.now(),
};

const config: RequestConfig = {
  method: 'GET',
  url: 'https://api.example.com/v1/items',
  params: [
    { id: '1', key: 'limit', value: '10', enabled: true },
    { id: '2', key: 'offset', value: '5', enabled: true },
  ],
  headers: [],
  authType: 'No Auth',
  authConfig: {},
  bodyType: 'none',
  body: '',
  useProxy: false,
};

const okResponse: ApiResponseData = {
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  data: { results: [{ id: 1, name: 'ada' }] },
  contentType: 'application/json',
  duration: 42,
  sizeBytes: 64,
  timestamp: Date.now(),
};

function renderPlayground(overrides: Partial<Parameters<typeof Playground>[0]> = {}) {
  const onExecuteRequest = vi.fn(async () => okResponse);
  const props = {
    initialConfig: config,
    capabilities,
    environment: null,
    onExecuteRequest,
    onSaveToCollection: vi.fn(),
    onOpenAiModal: vi.fn(),
    onConfigChange: vi.fn(),
    onNotify: vi.fn(),
    previousResponse: null,
    ...overrides,
  };
  render(<Playground {...props} />);
  return props;
}

describe('Playground URL and params stay in sync', () => {
  it('shows the base URL recombined with its enabled params', () => {
    renderPlayground();
    expect(screen.getByLabelText('Request URL')).toHaveValue(
      'https://api.example.com/v1/items?limit=10&offset=5',
    );
  });

  it('removes a parameter from the URL when its row is unticked', async () => {
    const user = userEvent.setup();
    renderPlayground();

    await user.click(screen.getByLabelText('Include offset'));

    expect(screen.getByLabelText('Request URL')).toHaveValue(
      'https://api.example.com/v1/items?limit=10',
    );
  });

  it('sends each parameter exactly once — the duplication regression', async () => {
    const user = userEvent.setup();
    const { onExecuteRequest } = renderPlayground();

    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    await waitFor(() => expect(onExecuteRequest).toHaveBeenCalled());
    const sent = vi.mocked(onExecuteRequest).mock.calls[0]?.[0] as RequestConfig;
    expect(sent.params.filter((p) => p.key === 'limit')).toHaveLength(1);
    expect(sent.url).not.toContain('?');
  });

  it('parses a query string typed into the URL bar into the params table', async () => {
    const user = userEvent.setup();
    renderPlayground();

    const input = screen.getByLabelText('Request URL');
    await user.clear(input);
    await user.type(input, 'https://api.example.com/search?q=hello');

    expect(screen.getByDisplayValue('q')).toBeInTheDocument();
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
  });
});

describe('Playground transport honesty', () => {
  it('disables the proxy toggle and explains why when no proxy exists', () => {
    renderPlayground();
    const toggle = screen.getByRole('button', { name: /Direct/ });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', expect.stringContaining('No proxy is configured'));
  });

  it('enables the toggle when a proxy is available', () => {
    renderPlayground({
      capabilities: { ...capabilities, proxy: { available: true, url: '/api/proxy' } },
    });
    expect(screen.getByRole('button', { name: /Direct/ })).toBeEnabled();
  });
});

describe('Playground request lifecycle', () => {
  it('offers a cancel control while a request is in flight', async () => {
    const user = userEvent.setup();
    let resolve: ((value: ApiResponseData) => void) | undefined;
    renderPlayground({
      onExecuteRequest: vi.fn(
        () =>
          new Promise<ApiResponseData>((r) => {
            resolve = r;
          }),
      ),
    });

    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(await screen.findByRole('button', { name: /^Cancel$/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancel the in-flight request' }),
    ).toBeInTheDocument();

    resolve?.(okResponse);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Cancel$/ })).toBeNull());
  });

  it('surfaces a classified failure rather than blaming CORS for everything', async () => {
    const user = userEvent.setup();
    renderPlayground({
      onExecuteRequest: vi.fn(async () => ({
        ...okResponse,
        ok: false,
        status: 0,
        statusText: 'DNS failure',
        error: 'Hostname could not be resolved: api.example.com',
        errorKind: 'dns' as const,
      })),
    });

    await user.click(screen.getByRole('button', { name: /^Send$/ }));

    // Surfaced in the status pill, the error panel and the copilot context line.
    expect((await screen.findAllByText(/DNS failure/)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/could not be resolved/)).toBeInTheDocument();
    // Crucially, not blamed on CORS the way every failure used to be.
    expect(screen.queryByText(/same-origin policy/)).toBeNull();
    expect(screen.queryByText(/CORS \/ Direct Network Error/)).toBeNull();
  });

  it('rejects an unsendable URL without calling the executor', async () => {
    const user = userEvent.setup();
    const { onExecuteRequest, onNotify } = renderPlayground({
      initialConfig: { ...config, url: 'nonsense', params: [] },
    });

    await user.click(screen.getByRole('button', { name: /^Send$/ }));
    expect(onExecuteRequest).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalledWith(expect.stringContaining('valid'), 'info');
  });
});

describe('Playground copilot labelling', () => {
  it('states that AI is offline instead of implying a model is answering', () => {
    renderPlayground();
    expect(screen.getByText(/AI offline/)).toBeInTheDocument();
    expect(screen.getByText(/not a\s+language model/)).toBeInTheDocument();
  });
});

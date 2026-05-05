import {
  buildBuilderHeaders,
  buildL2Headers,
  CLOB_URL,
  type ApiCredentials,
} from "@/lib/clobServerAuth";

export function createClobPath(path: string, params?: Record<string, string | undefined>) {
  const url = new URL(`${CLOB_URL}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  return {
    pathWithQuery: `${path}${url.search}`,
    url: url.toString(),
  };
}

export async function fetchClobAuthed(
  creds: ApiCredentials,
  method: "GET" | "POST",
  path: string,
  {
    body = "",
    params,
    builderAuth = false,
  }: {
    body?: string;
    params?: Record<string, string | undefined>;
    builderAuth?: boolean;
  } = {},
) {
  const { url } = createClobPath(path, params);
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...buildL2Headers(creds, method, path, body),
      ...(builderAuth ? buildBuilderHeaders(method, path, body) : {}),
    },
  };
  if (method !== "GET" && body) init.body = body;
  return fetch(url, init);
}

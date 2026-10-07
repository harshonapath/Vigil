import type { ApiError } from '../types';
import { getAccessToken } from '../auth/msal';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:8000/api/v1';

export class ApiException extends Error {
  status: number;
  data: ApiError;

  constructor(
    status: number,
    message: string,
    data?: unknown
  ) {
    super(message);

    this.name = 'ApiException';

    this.status = status;

    this.data = {
      message,
      detail:
        (data as ApiError)?.detail ||
        (typeof data === 'string'
          ? data
          : undefined),
      status,
    };
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<
    string,
    string | number | boolean | undefined | null
  >;
}

export async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    params,
    headers,
    ...restOptions
  } = options;

  let url =
    `${API_BASE_URL}` +
    `${endpoint.startsWith('/')
      ? endpoint
      : `/${endpoint}`}`;

  /*
   * Query parameters
   */
  if (params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(
      ([key, value]) => {
        if (
          value !== undefined &&
          value !== null
        ) {
          searchParams.append(
            key,
            String(value)
          );
        }
      }
    );

    const queryString =
      searchParams.toString();

    if (queryString) {
      url +=
        (url.includes('?') ? '&' : '?') +
        queryString;
    }
  }

  /*
   * Default headers
   */
  const mergedHeaders: Record<
    string,
    string
  > = {
    'Content-Type': 'application/json',
    Accept: 'application/json',

    ...(headers as Record<
      string,
      string
    >),
  };

  /*
   * Microsoft Entra access token.
   *
   * Existing email/password authentication
   * does not set this token, so it remains
   * unaffected.
   */
  const accessToken =
    getAccessToken();

  if (
    accessToken &&
    !mergedHeaders.Authorization
  ) {
    mergedHeaders.Authorization =
      `Bearer ${accessToken}`;
  }

  if (!mergedHeaders['X-Reviewer-Login']) {
    mergedHeaders['X-Reviewer-Login'] = 'vigil-reviewer';
  }

  try {
    const response = await fetch(
      url,
      {
        ...restOptions,
        headers: mergedHeaders,
      }
    );

    if (!response.ok) {
      let errorBody: unknown;

      try {
        errorBody =
          await response.json();
      } catch {
        errorBody =
          await response.text();
      }

      let errorMsg =
        `HTTP Error ${response.status}: ` +
        `${response.statusText}`;

      if (
        typeof errorBody === 'object' &&
        errorBody !== null
      ) {
        const anyErr =
          errorBody as {
            detail?: unknown;
            message?: string;
          };

        if (
          typeof anyErr.detail === 'string'
        ) {
          errorMsg =
            anyErr.detail;
        } else if (
          typeof anyErr.message === 'string'
        ) {
          errorMsg =
            anyErr.message;
        }
      }

      throw new ApiException(
        response.status,
        errorMsg,
        errorBody
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (
      await response.json()
    ) as T;
  } catch (error) {
    if (
      error instanceof ApiException
    ) {
      throw error;
    }

    const genericMsg =
      error instanceof Error
        ? error.message
        : 'Network connection failure';

    throw new ApiException(
      0,
      `Unable to connect to SecurePR backend (${genericMsg})`
    );
  }
}
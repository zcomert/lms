const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('authToken');
  // FormData govdesinde Content-Type'i tarayici (multipart boundary ile) kendisi ayarlar.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) await throwApiError(response, path);

  return (await response.json()) as T;
}

async function throwApiError(response: Response, path: string): Promise<never> {
  let body: { error?: { code?: string; message?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  // Gecersiz/suresi dolmus token: oturumu temizle ve giris sayfasina yonlendir.
  // auth/login ve auth/register uc noktalari haric tutulur; aksi halde basarisiz
  // bir giris denemesi LoginPage'in kendi hata gosterimini engelleyip
  // dogrudan global yonlendirmeyi tetikler.
  const isAuthEndpoint = path === '/api/v1/auth/login' || path === '/api/v1/auth/register';
  if (response.status === 401 && !isAuthEndpoint) {
    localStorage.removeItem('authToken');
    if (window.location.pathname !== '/giris') {
      window.location.assign('/giris');
    }
  }

  throw new ApiError(
    body?.error?.code ?? 'UNKNOWN',
    body?.error?.message ?? 'Bilinmeyen bir hata oluştu.',
    response.status,
  );
}

/** Content-Disposition basliginden dosya adini cozer (filename* oncelikli). */
function parseFilename(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*([^;]+)/i.exec(header);
  if (star) {
    const value = star[1].trim().replace(/^UTF-8''/i, '');
    try {
      return decodeURIComponent(value);
    } catch {
      /* ascii yedege dus */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Yetkili (Bearer) dosya indirir ve tarayiciya kaydettirir. Hata durumunda ApiError firlatir. */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) await throwApiError(response, path);

  const filename = parseFilename(response.headers.get('Content-Disposition')) ?? fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

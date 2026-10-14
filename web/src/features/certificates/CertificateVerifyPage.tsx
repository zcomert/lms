import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Icon, Text } from '../../components';
import { apiFetch, ApiError } from '../../lib/apiClient';
import { certificatePdfUrl, formatDate } from '../../lib/certificates';
import styles from './CertificateVerifyPage.module.css';

interface PublicCertificate {
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: string;
}

export function CertificateVerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [certificate, setCertificate] = useState<PublicCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCertificate(null);
    apiFetch<{ certificate: PublicCertificate }>(`/api/v1/certificates/${encodeURIComponent(code)}`)
      .then((res) => {
        if (!cancelled) setCertificate(res.certificate);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status !== 404
            ? 'Sertifika doğrulanamadı. Lütfen daha sonra tekrar deneyin.'
            : 'Sertifika bulunamadı veya geçersiz.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <main className={styles.page}>
      <Card padding="lg" elevation="2" className={styles.card}>
        {loading && <Text role="body-md">Doğrulanıyor…</Text>}

        {!loading && error && (
          <div className={styles.center} role="alert">
            <span className={styles.iconError}>
              <Icon name="error" size="xl" filled />
            </span>
            <Text role="headline-sm" as="h1" tone="error">
              {error}
            </Text>
          </div>
        )}

        {!loading && certificate && (
          <div className={styles.center}>
            <span className={styles.iconOk}>
              <Icon name="verified" size="xl" filled />
            </span>
            <Text role="headline-md" as="h1" tone="success">
              Bu sertifika geçerlidir.
            </Text>
            <dl className={styles.details}>
              <div>
                <dt>Öğrenci</dt>
                <dd>{certificate.studentName}</dd>
              </div>
              <div>
                <dt>Kurs</dt>
                <dd>{certificate.courseTitle}</dd>
              </div>
              <div>
                <dt>Veriliş tarihi</dt>
                <dd>{formatDate(certificate.issuedAt)}</dd>
              </div>
              <div>
                <dt>Sertifika kodu</dt>
                <dd>{certificate.code}</dd>
              </div>
            </dl>
            <a
              className={styles.download}
              href={certificatePdfUrl(certificate.code)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="download" size="sm" />
              İndir (PDF)
            </a>
          </div>
        )}
      </Card>
    </main>
  );
}

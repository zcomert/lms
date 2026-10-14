import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, Text } from '../../components';
import { apiFetch, ApiError } from '../../lib/apiClient';
import type { AchievementBadge, Certificate } from '../../types';
import { BadgeGrid, CertificateList } from '../profile/components';
import styles from './PublicAchievementsPage.module.css';

interface PublicAchievements {
  user: { name: string; avatarUrl: string | null };
  certificates: Certificate[];
  badges: AchievementBadge[];
}

export function PublicAchievementsPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<PublicAchievements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    apiFetch<PublicAchievements>(`/api/v1/achievements/${encodeURIComponent(userId)}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status !== 404
            ? 'Başarılar yüklenemedi. Lütfen daha sonra tekrar deneyin.'
            : 'Kullanıcı bulunamadı.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {loading && <Text role="body-md">Yükleniyor…</Text>}

        {!loading && error && (
          <Text role="headline-sm" as="h1" tone="error" className={styles.error}>
            {error}
          </Text>
        )}

        {!loading && data && (
          <>
            <header className={styles.header}>
              <Avatar name={data.user.name} src={data.user.avatarUrl ?? undefined} className={styles.avatar} />
              <Text role="headline-lg" as="h1">
                {data.user.name}
              </Text>
            </header>

            <section className={styles.section} aria-label="Rozetler">
              <Text role="headline-md" as="h2">
                Rozetler
              </Text>
              <BadgeGrid badges={data.badges} emptyText="Henüz rozet kazanılmadı." />
            </section>

            <section className={styles.section} aria-label="Sertifikalar">
              <Text role="headline-md" as="h2">
                Sertifikalar
              </Text>
              <CertificateList
                certificates={data.certificates}
                linkToVerify
                emptyText="Henüz sertifika yok."
              />
            </section>
          </>
        )}
      </div>
    </main>
  );
}

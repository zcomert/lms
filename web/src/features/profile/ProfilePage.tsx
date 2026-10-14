import { useState } from 'react';
import { Button, Card, Text, ThemeSelector } from '../../components';
import { PageContainer } from '../../layout/PageContainer';
import { useProfileData } from '../../data/useProfileData';
import { useMyBadges } from '../../data/useMyBadges';
import { useMyCertificates } from '../../data/useMyCertificates';
import { useCopy } from '../../lib/certificates';
import { ProfileHeader, ProfileEditForm, BadgeGrid, CertificateList } from './components';
import styles from './ProfilePage.module.css';

const localeLabels: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
};

export function ProfilePage() {
  const { profile, loading, error, saving, updateProfile } = useProfileData();
  const [isEditing, setEditing] = useState(false);
  const badgesState = useMyBadges();
  const certsState = useMyCertificates();
  const { copiedKey, copy } = useCopy();

  return (
    <PageContainer>
      <div className={styles.headerRow}>
        <Text role="headline-lg" as="h1">
          Profilim
        </Text>
      </div>

      {loading && <Text role="body-md">Yükleniyor…</Text>}

      {!loading && error && !profile && (
        <Text role="body-md" tone="error">
          {error}
        </Text>
      )}

      {!loading && profile && (
        <Card padding="lg" elevation="1" className={styles.card}>
          {error ? (
            <Text role="body-sm" tone="error" className={styles.inlineError}>
              {error}
            </Text>
          ) : null}

          <ProfileHeader profile={profile} />

          {!isEditing ? (
            <div className={styles.details}>
              <div className={styles.detailRow}>
                <Text role="label-md" tone="muted">
                  Dil
                </Text>
                <Text role="body-md" tone="main">
                  {localeLabels[profile.locale] ?? profile.locale}
                </Text>
              </div>

              <div className={styles.detailRow}>
                <Text role="label-md" tone="muted">
                  Tema
                </Text>
                <div>
                  <ThemeSelector />
                </div>
              </div>

              <div className={styles.actions}>
                <Button variant="primary" iconStart="edit" onClick={() => setEditing(true)}>
                  Profili Düzenle
                </Button>
              </div>
            </div>
          ) : (
            <div className={styles.editSection}>
              <ProfileEditForm
                profile={profile}
                saving={saving}
                onCancel={() => setEditing(false)}
                onSubmit={async (input) => {
                  await updateProfile(input);
                  setEditing(false);
                }}
              />
            </div>
          )}
        </Card>
      )}

      {!loading && profile && (
        <>
          <div className={styles.shareRow}>
            <Button
              variant="secondary"
              iconStart={copiedKey === 'share' ? 'check' : 'share'}
              onClick={() => copy('share', `${window.location.origin}/basarilar/${profile.id}`)}
            >
              {copiedKey === 'share' ? 'Kopyalandı!' : 'Başarılarımı paylaş'}
            </Button>
          </div>

          <section className={styles.section} aria-label="Rozetlerim">
            <Text role="headline-md" as="h2">
              Rozetlerim
            </Text>
            {badgesState.loading && <Text role="body-md">Yükleniyor…</Text>}
            {badgesState.error && (
              <Text role="body-sm" tone="error" as="p">
                {badgesState.error}
              </Text>
            )}
            {!badgesState.loading && !badgesState.error && <BadgeGrid badges={badgesState.badges} />}
          </section>

          <section className={styles.section} aria-label="Sertifikalarım">
            <Text role="headline-md" as="h2">
              Sertifikalarım
            </Text>
            {certsState.loading && <Text role="body-md">Yükleniyor…</Text>}
            {certsState.error && (
              <Text role="body-sm" tone="error" as="p">
                {certsState.error}
              </Text>
            )}
            {!certsState.loading && !certsState.error && (
              <CertificateList certificates={certsState.certificates} showCopy />
            )}
          </section>
        </>
      )}
    </PageContainer>
  );
}

import { Link } from 'react-router-dom';
import { Icon, Text } from '../../../components';
import { certificatePdfUrl, formatDate, useCopy } from '../../../lib/certificates';
import type { Certificate } from '../../../types';
import styles from './CertificateList.module.css';

interface CertificateListProps {
  certificates: Certificate[];
  /** Doğrulama linkini kopyala düğmesini göster (kendi profilinde). */
  showCopy?: boolean;
  /** Kurs adını doğrulama sayfasına bağla (herkese açık sayfa). */
  linkToVerify?: boolean;
  emptyText?: string;
}

export function CertificateList({
  certificates,
  showCopy = false,
  linkToVerify = false,
  emptyText = 'Bir kursu %100 tamamladığında sertifikan burada görünecek.',
}: CertificateListProps) {
  const { copiedKey, copy } = useCopy();

  if (certificates.length === 0) {
    return (
      <Text role="body-md" tone="muted" as="p">
        {emptyText}
      </Text>
    );
  }

  return (
    <ul className={styles.list}>
      {certificates.map((c) => (
        <li key={c.id} className={styles.item}>
          <div className={styles.info}>
            {linkToVerify ? (
              <Link to={`/dogrula/${c.code}`} className={styles.titleLink}>
                {c.courseTitle}
              </Link>
            ) : (
              <Text role="title-md" as="p" tone="main">
                {c.courseTitle}
              </Text>
            )}
            <Text role="body-sm" as="p" tone="muted">
              {formatDate(c.issuedAt)} · Kod: {c.code}
            </Text>
          </div>
          <div className={styles.actions}>
            <a
              className={styles.linkBtn}
              href={certificatePdfUrl(c.code)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${c.courseTitle} sertifikasını indir (PDF)`}
            >
              <Icon name="download" size="sm" />
              İndir (PDF)
            </a>
            {showCopy && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => copy(c.id, `${window.location.origin}/dogrula/${c.code}`)}
                aria-label={`${c.courseTitle} doğrulama linkini kopyala`}
              >
                <Icon name={copiedKey === c.id ? 'check' : 'content_copy'} size="sm" />
                {copiedKey === c.id ? 'Kopyalandı!' : 'Doğrulama linkini kopyala'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

import { useState } from 'react';
import { Button, Text } from '../../../components';
import { apiDownload } from '../../../lib/apiClient';
import type { FileMeta } from '../../../types';
import { formatSize } from '../assignmentMeta';
import styles from './AttachmentList.module.css';

interface AttachmentListProps {
  files: FileMeta[];
  /** Ek dosya (eğitmen) veya teslim dosyası; indirme uç noktasını belirler. */
  kind: 'attachment' | 'submission';
}

const PATHS = {
  attachment: (id: string) => `/api/v1/assignment-attachments/${id}/download`,
  submission: (id: string) => `/api/v1/submission-files/${id}/download`,
};

export function AttachmentList({ files, kind }: AttachmentListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0) return null;

  const download = async (file: FileMeta) => {
    setBusyId(file.id);
    setError(null);
    try {
      await apiDownload(PATHS[kind](file.id), file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dosya indirilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <ul className={styles.list}>
        {files.map((file) => (
          <li key={file.id} className={styles.item}>
            <div className={styles.info}>
              <Text role="body-md" as="span" tone="main" className={styles.name}>
                {file.name}
              </Text>
              <Text role="body-sm" as="span" tone="muted">
                {formatSize(file.size)}
              </Text>
            </div>
            <Button
              variant="secondary"
              size="sm"
              iconStart="download"
              disabled={busyId === file.id}
              onClick={() => void download(file)}
              aria-label={`İndir: ${file.name}`}
            >
              {busyId === file.id ? 'İndiriliyor…' : 'İndir'}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}
    </div>
  );
}

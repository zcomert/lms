import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Avatar, Badge, Button, Card, Icon, Text } from '../../../components';
import { useLessonComments } from '../useLessonComments';
import type { ReactionKey } from '../../../types';
import styles from './LessonComments.module.css';

interface LessonCommentsProps {
  lessonId: string;
}

const MAX_LENGTH = 2000;

const REACTIONS: { key: ReactionKey; emoji: string; label: string }[] = [
  { key: 'like', emoji: '👍', label: 'Beğen' },
  { key: 'love', emoji: '❤️', label: 'Sevdim' },
  { key: 'insightful', emoji: '💡', label: 'Aydınlatıcı' },
  { key: 'celebrate', emoji: '🎉', label: 'Tebrikler' },
];

const ROLE_LABEL = { INSTRUCTOR: 'Eğitmen', ADMIN: 'Yönetici' } as const;

export function LessonComments({ lessonId }: LessonCommentsProps) {
  const { comments, loading, error, submitting, addComment, deleteComment, toggleReaction } =
    useLessonComments(lessonId);
  const [draft, setDraft] = useState('');
  const textareaId = useId();

  const canSubmit = draft.trim().length > 0 && !submitting;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await addComment(draft)) setDraft('');
  };

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Yorumlar
      </Text>

      <form className={styles.form} onSubmit={onSubmit}>
        <label htmlFor={textareaId} className={styles.visuallyHidden}>
          Yorumunuzu yazın
        </label>
        <textarea
          id={textareaId}
          className={styles.textarea}
          value={draft}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="Bu ders hakkında bir yorum yaz…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className={styles.formFooter}>
          <Text role="body-sm" tone="muted" as="span">
            {draft.length} / {MAX_LENGTH}
          </Text>
          <Button type="submit" variant="primary" size="sm" disabled={!canSubmit}>
            Gönder
          </Button>
        </div>
      </form>

      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}

      {!loading && comments.length === 0 && !error && (
        <Text role="body-sm" tone="muted" as="p">
          Henüz yorum yok. İlk yorumu sen yaz!
        </Text>
      )}

      {comments.length > 0 && (
        <ul className={styles.list}>
          {comments.map((c) => (
            <li key={c.id} className={styles.item}>
              <div className={styles.header}>
                <Avatar name={c.author.name} src={c.author.avatarUrl ?? undefined} />
                <div className={styles.meta}>
                  <div className={styles.nameRow}>
                    <Text role="label-lg" as="span" tone="main">
                      {c.author.name}
                    </Text>
                    {c.author.role !== 'STUDENT' && (
                      <Badge tone={c.author.role === 'INSTRUCTOR' ? 'brand' : 'navy'} variant="soft">
                        {ROLE_LABEL[c.author.role]}
                      </Badge>
                    )}
                  </div>
                  <Text role="body-sm" tone="muted" as="span">
                    {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                  </Text>
                </div>
                {c.canDelete && (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label="Yorumu sil"
                    onClick={() => deleteComment(c.id)}
                  >
                    <Icon name="delete" size="md" />
                  </button>
                )}
              </div>

              <Text role="body-md" as="p" tone="main" className={styles.body}>
                {c.body}
              </Text>

              <div className={styles.reactions}>
                {REACTIONS.map(({ key, emoji, label }) => {
                  const state = c.reactions[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`${styles.reaction} ${state.mine ? styles.reactionActive : ''}`}
                      aria-pressed={state.mine}
                      aria-label={label}
                      onClick={() => toggleReaction(c.id, key)}
                    >
                      <span aria-hidden="true">{emoji}</span>
                      <Text role="label-md" as="span" tone="muted">
                        {state.count}
                      </Text>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

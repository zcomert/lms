import { Card, ProgressBar, Text } from '../../../components';
import { CommentItem } from '../CommentItem';
import { StarRating } from '../StarRating';
import { useCourseReviews } from '../useCourseReviews';
import { ReviewForm } from './ReviewForm';
import type { CourseReview } from '../../../types';
import styles from './CourseReviews.module.css';

interface CourseReviewsProps {
  courseId: string;
}

const LEVELS = ['5', '4', '3', '2', '1'] as const;

export function CourseReviews({ courseId }: CourseReviewsProps) {
  const {
    summary,
    reviews,
    mine,
    permissions,
    loaded,
    loading,
    error,
    forbidden,
    createReview,
    updateReview,
    deleteReview,
    addReply,
    editReply,
    deleteReply,
  } = useCourseReviews(courseId, true);

  // Okuma yetkisi yoksa bölüm hiç gösterilmez.
  if (forbidden) return null;

  const renderReview = (review: CourseReview) => (
    <CommentItem
      author={review.author}
      body={review.body}
      createdAt={review.createdAt}
      editedAt={review.editedAt}
      meta={<StarRating value={review.rating} />}
      canEdit={review.canEdit}
      canDelete={review.canDelete}
      renderEditor={(done) => (
        <ReviewForm
          initialRating={review.rating}
          initialBody={review.body}
          submitLabel="Kaydet"
          onSubmit={async (input) => {
            await updateReview(review.id, input);
            done();
          }}
          onCancel={done}
        />
      )}
      onDelete={() => deleteReview(review.id)}
      deleteTitle="Değerlendirmeyi sil"
      deleteMessage="Bu değerlendirme ve altındaki tüm yanıtlar kalıcı olarak silinecek. Emin misiniz?"
      canReply={permissions.canReply}
      onReply={(body) => addReply(review.id, body)}
    >
      {review.replies.length > 0 && (
        <div className={styles.replies}>
          {review.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              nested
              author={reply.author}
              authorRole={reply.authorRole}
              body={reply.body}
              createdAt={reply.createdAt}
              editedAt={reply.editedAt}
              canEdit={reply.canEdit}
              canDelete={reply.canDelete}
              onEdit={(body) => editReply(reply.id, body)}
              onDelete={() => deleteReply(reply.id)}
              deleteTitle="Yanıtı sil"
              deleteMessage="Bu yanıt kalıcı olarak silinecek. Emin misiniz?"
            />
          ))}
        </div>
      )}
    </CommentItem>
  );

  return (
    <Card padding="lg" elevation="1" className={styles.root}>
      <Text role="title-md" as="h2" tone="main">
        Değerlendirmeler
      </Text>

      {loading && (
        <Text role="body-sm" tone="muted" as="p">
          Yükleniyor…
        </Text>
      )}

      {error && (
        <div role="alert">
          <Text role="body-sm" tone="error" as="p">
            {error}
          </Text>
        </div>
      )}

      {summary && (
        <div className={styles.summary}>
          <div className={styles.average}>
            <Text role="display-hero" as="p" tone="main">
              {summary.ratingAverage !== null
                ? summary.ratingAverage.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : '–'}
            </Text>
            <StarRating value={Math.round(summary.ratingAverage ?? 0)} />
            <Text role="body-sm" tone="muted" as="p">
              {summary.ratingCount > 0 ? `${summary.ratingCount} değerlendirme` : 'Henüz değerlendirme yok'}
            </Text>
          </div>
          <ul className={styles.distribution} aria-label="Puan dağılımı">
            {LEVELS.map((level) => {
              const count = summary.distribution[level] ?? 0;
              const percent = summary.ratingCount > 0 ? Math.round((count / summary.ratingCount) * 100) : 0;
              return (
                <li key={level} className={styles.distRow}>
                  <Text role="label-md" as="span" tone="muted" className={styles.distLabel}>
                    {level} yıldız
                  </Text>
                  <ProgressBar value={percent} label={`${level} yıldız: ${count} değerlendirme`} size="sm" tone="cyan" />
                  <Text role="label-md" as="span" tone="muted" className={styles.distCount}>
                    {count}
                  </Text>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {permissions.canReview && (
        <div className={styles.formBlock}>
          <Text role="label-lg" as="h3" tone="main">
            Bu kursu değerlendirin
          </Text>
          <ReviewForm submitLabel="Değerlendir" onSubmit={createReview} />
        </div>
      )}

      {loaded && !error && reviews.length === 0 && (
        <Text role="body-md" tone="muted" as="p">
          Bu kurs henüz değerlendirilmemiş.
        </Text>
      )}

      {reviews.length > 0 && (
        <ul className={styles.list}>
          {reviews.map((review) => (
            <li key={review.id} className={styles.listItem}>
              {mine?.id === review.id && (
                <Text role="label-md" as="p" tone="secondary" className={styles.mineLabel}>
                  Sizin değerlendirmeniz
                </Text>
              )}
              {renderReview(review)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

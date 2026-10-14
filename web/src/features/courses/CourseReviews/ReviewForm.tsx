import { useState } from 'react';
import { CommentForm } from '../CommentForm';
import { StarRating } from '../StarRating';
import styles from './CourseReviews.module.css';

interface ReviewFormProps {
  initialRating?: number;
  initialBody?: string | null;
  submitLabel: string;
  onSubmit: (input: { rating: number; body: string | null }) => Promise<void>;
  onCancel?: () => void;
}

export function ReviewForm({ initialRating = 0, initialBody, submitLabel, onSubmit, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(initialRating);

  return (
    <CommentForm
      label="Yorumunuz (isteğe bağlı)"
      placeholder="Bu kurs hakkındaki deneyiminizi paylaşın…"
      submitLabel={submitLabel}
      initialValue={initialBody ?? ''}
      required={false}
      onCancel={onCancel}
      onSubmit={async (body) => {
        if (rating < 1) throw new Error('Lütfen 1 ile 5 arasında bir puan seçin.');
        await onSubmit({ rating, body: body.length > 0 ? body : null });
      }}
    >
      <div className={styles.ratingPick}>
        <StarRating value={rating} onChange={setRating} label="Kurs puanı" />
      </div>
    </CommentForm>
  );
}

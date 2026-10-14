import type { MascotSlot } from '../../../../types';
import styles from './Mascot.module.css';

export type MascotMood = 'sleepy' | 'happy' | 'excited';

interface MascotProps {
  streakDays: number;
  /** slot -> itemId */
  equipped?: Partial<Record<MascotSlot, string>>;
  /** Giyili eşyaların Türkçe adları (aria-label için). */
  equippedNames?: string[];
  size?: 'md' | 'lg';
}

export const moodOf = (streakDays: number): MascotMood =>
  streakDays <= 0 ? 'sleepy' : streakDays >= 7 ? 'excited' : 'happy';

const MOOD_TEXT: Record<MascotMood, string> = {
  sleepy: 'uykulu',
  happy: 'mutlu',
  excited: 'coşkulu',
};

/** "Pıtır" — özgün bilgi kuşu maskotu; ruh hali seriye göre, aksesuarlar katman olarak çizilir. */
export function Mascot({ streakDays, equipped = {}, equippedNames = [], size = 'md' }: MascotProps) {
  const mood = moodOf(streakDays);
  const label =
    `Pıtır adlı bilgi kuşu maskotu, ${MOOD_TEXT[mood]}.` +
    (equippedNames.length ? ` Giydikleri: ${equippedNames.join(', ')}.` : ' Üzerinde aksesuar yok.');

  return (
    <svg
      className={[styles.mascot, styles[size], mood === 'excited' ? styles.excited : ''].join(' ')}
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
    >
      {/* Aura: gövdenin arkasında */}
      {equipped.AURA === 'aura-sparkle' && (
        <g className={styles.sparkle}>
          <path d="M16 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className={styles.cyanFill} />
          <path d="M104 24l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" className={styles.yellowFill} />
          <path d="M100 84l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" className={styles.cyanFill} />
          <path d="M12 82l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" className={styles.yellowFill} />
        </g>
      )}
      {equipped.AURA === 'aura-flame' && (
        <g className={styles.flame}>
          <circle cx="60" cy="66" r="52" className={styles.flameRing} />
          <path d="M18 70c-6-12 0-22 4-26 0 8 6 10 6 18 0 6-4 8-10 8z" className={styles.flameFill} />
          <path d="M102 70c6-12 0-22-4-26 0 8-6 10-6 18 0 6 4 8 10 8z" className={styles.flameFill} />
          <path d="M60 10c-7 9-3 14 0 18 3-4 7-9 0-18z" className={styles.flameFill} />
        </g>
      )}

      <g className={styles.body}>
        {/* ayaklar */}
        <ellipse cx="46" cy="106" rx="9" ry="4" className={styles.beakFill} />
        <ellipse cx="74" cy="106" rx="9" ry="4" className={styles.beakFill} />
        {/* kanatlar */}
        <ellipse cx="22" cy="72" rx="10" ry="18" className={styles.wingFill} transform="rotate(12 22 72)" />
        <ellipse cx="98" cy="72" rx="10" ry="18" className={styles.wingFill} transform="rotate(-12 98 72)" />
        {/* gövde */}
        <ellipse cx="60" cy="68" rx="38" ry="38" className={styles.bodyFill} />
        <ellipse cx="60" cy="78" rx="24" ry="24" className={styles.bellyFill} />
        {/* kulak tüyleri */}
        <path d="M30 40l-4-16 16 8z" className={styles.bodyFill} />
        <path d="M90 40l4-16-16 8z" className={styles.bodyFill} />

        {/* gözler */}
        {mood === 'sleepy' ? (
          <g className={styles.stroke}>
            <path d="M39 56q7 6 14 0" />
            <path d="M67 56q7 6 14 0" />
          </g>
        ) : (
          <g>
            <circle cx="46" cy="55" r="9" className={styles.eyeWhite} />
            <circle cx="74" cy="55" r="9" className={styles.eyeWhite} />
            <circle cx="47" cy="56" r="4.5" className={styles.pupil} />
            <circle cx="73" cy="56" r="4.5" className={styles.pupil} />
            <circle cx="48.5" cy="54" r="1.5" className={styles.eyeWhite} />
            <circle cx="74.5" cy="54" r="1.5" className={styles.eyeWhite} />
          </g>
        )}
        {/* gaga */}
        <path d="M54 64l6 9 6-9z" className={styles.beakFill} />
        {mood !== 'sleepy' && (
          <g>
            <ellipse cx="36" cy="68" rx="5" ry="3" className={styles.cheek} />
            <ellipse cx="84" cy="68" rx="5" ry="3" className={styles.cheek} />
          </g>
        )}
        {mood === 'excited' && <path d="M52 78q8 7 16 0" className={styles.stroke} />}
      </g>

      {mood === 'sleepy' && (
        <text x="92" y="28" className={styles.zzz} aria-hidden="true">
          Zzz
        </text>
      )}

      {/* Boyun */}
      {equipped.NECK === 'neck-scarf' && (
        <g>
          <path d="M30 86q30 16 60 0l2 9q-32 16 -64 0z" className={styles.scarfFill} />
          <path d="M78 92l8 20 8-4-4-18z" className={styles.scarfFill} />
        </g>
      )}
      {equipped.NECK === 'neck-bowtie' && (
        <g>
          <path d="M60 88l-14-8v16z" className={styles.bowFill} />
          <path d="M60 88l14-8v16z" className={styles.bowFill} />
          <circle cx="60" cy="88" r="4" className={styles.bowKnot} />
        </g>
      )}

      {/* Gözlük */}
      {equipped.GLASSES === 'glasses-round' && (
        <g className={styles.frame}>
          <circle cx="46" cy="55" r="12" />
          <circle cx="74" cy="55" r="12" />
          <path d="M58 55h4" />
        </g>
      )}
      {equipped.GLASSES === 'glasses-star' && (
        <g>
          <path
            d="M46 41l3.5 8.5 9 .8-6.8 6 2.1 9-7.8-4.8-7.8 4.8 2.1-9-6.8-6 9-.8z"
            className={styles.starLens}
          />
          <path
            d="M74 41l3.5 8.5 9 .8-6.8 6 2.1 9-7.8-4.8-7.8 4.8 2.1-9-6.8-6 9-.8z"
            className={styles.starLens}
          />
          <path d="M58 56h4" className={styles.frame} />
        </g>
      )}

      {/* Şapka */}
      {equipped.HAT === 'hat-beret' && (
        <g>
          <ellipse cx="60" cy="34" rx="28" ry="10" className={styles.beretFill} />
          <circle cx="60" cy="22" r="3.5" className={styles.beretFill} />
        </g>
      )}
      {equipped.HAT === 'hat-graduation' && (
        <g>
          <path d="M60 14l38 14-38 14-38-14z" className={styles.capFill} />
          <path d="M42 38v12q18 8 36 0V38l-18 6z" className={styles.capFill} />
          <path d="M92 31v18" className={styles.tassel} />
          <circle cx="92" cy="51" r="3" className={styles.tasselDot} />
        </g>
      )}
    </svg>
  );
}

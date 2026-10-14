import { useState } from 'react';
import { Button, Icon, Text } from '../../../components';
import type { ActivityDay, CheckinResult, MascotState, TermInfo } from '../../../types';
import { Mascot } from './Mascot';
import { MascotWardrobe } from './MascotWardrobe';
import styles from './StreakWidget.module.css';

export interface StreakMascotProps {
  state: MascotState | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  busy: boolean;
  lastCheckin: CheckinResult | null;
  onPurchase: (itemId: string) => void;
  onToggleEquipped: (itemId: string, equipped: boolean) => void;
  onWardrobeClose: () => void;
}

interface StreakWidgetProps {
  term: TermInfo;
  activity: ActivityDay[];
  mascot?: StreakMascotProps;
}

function speechFor(state: MascotState | null, streak: number): string {
  if (!state) return 'Merhaba, ben Pıtır!';
  if (state.checkedInToday && state.todayAward > 0) {
    return streak >= 7
      ? `Bugün +${state.todayAward} puan kazandın, harikasın!`
      : `Bugün +${state.todayAward} puan kazandın!`;
  }
  if (streak === 0) return 'Bugün bir ders izle, seriyi başlatalım!';
  if (streak >= 7) return 'Ateş gibisin! Yarın da gel, serin büyüsün!';
  return 'Yarın da gel, serin büyüsün!';
}

function awardMessage(result: CheckinResult): string {
  return result.milestoneBonus > 0
    ? `Günlük giriş: +${result.amount} puan (seri bonusu +${result.milestoneBonus} dahil)`
    : `Günlük giriş: +${result.amount} puan`;
}

/** Hero içindeki seri sayacı, maskot ve haftalık hedef mini göstergesi. */
export function StreakWidget({ term, activity, mascot }: StreakWidgetProps) {
  const peak = Math.max(...activity.map((day) => day.videoMinutes + day.otherMinutes), 1);
  const [open, setOpen] = useState(false);
  const state = mascot?.state ?? null;
  const streak = state?.streakDays ?? term.streakDays;
  const wornNames = state ? state.items.filter((item) => item.equipped).map((item) => item.name) : [];

  const close = () => {
    setOpen(false);
    mascot?.onWardrobeClose();
  };

  return (
    <div className={styles.widget}>
      {mascot && !mascot.error ? (
        <div className={styles.mascotBox}>
          <Mascot streakDays={streak} equipped={state?.equipped} equippedNames={wornNames} />
          <div className={styles.mascotInfo}>
            <Text role="body-sm" as="p" tone="on-primary" className={styles.speech}>
              {mascot.loading ? 'Pıtır uyanıyor…' : speechFor(state, streak)}
            </Text>
            {state ? (
              <Text role="label-lg" as="p" tone="on-primary" className={styles.points}>
                <Icon name="stars" size="sm" filled /> {state.points} puan
              </Text>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              iconStart="checkroom"
              disabled={!state}
              onClick={() => setOpen(true)}
            >
              Maskotu Giydir
            </Button>
          </div>
          <div aria-live="polite" role="status" className={styles.live}>
            {mascot.lastCheckin?.awarded ? awardMessage(mascot.lastCheckin) : ''}
          </div>
        </div>
      ) : null}

      <div className={styles.streak}>
        <Text role="headline-md" tone="on-primary" weight="bold">
          {streak}
        </Text>
        <Text role="label-md" tone="on-primary" className={styles.streakLabel}>
          Gün Seri
        </Text>
      </div>

      <div className={styles.goal}>
        <Text role="label-lg" tone="on-primary">
          Bu Haftaki Hedef: {term.weeklyGoalHours} Saat
        </Text>

        <ul className={styles.bars}>
          {activity.map((day) => {
            const total = day.videoMinutes + day.otherMinutes;
            const height = Math.max(20, Math.round((total / peak) * 100));
            const tone = day.isToday ? styles.today : total > 0 ? styles.done : styles.pending;

            return (
              <li
                key={day.date}
                className={[styles.bar, tone].join(' ')}
                style={{ height: `${height}%` }}
                title={`${day.label}: ${total} dk`}
              />
            );
          })}
        </ul>

        <Text role="body-sm" tone="on-primary" className={styles.todayNote}>
          Bugün {term.minutesCompletedToday} dk tamamlandı
        </Text>
      </div>

      {open && mascot && state ? (
        <MascotWardrobe
          state={state}
          busy={mascot.busy}
          error={mascot.actionError}
          onClose={close}
          onPurchase={mascot.onPurchase}
          onToggleEquipped={mascot.onToggleEquipped}
        />
      ) : null}
    </div>
  );
}

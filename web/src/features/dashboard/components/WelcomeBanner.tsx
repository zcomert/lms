import { Badge, Text } from '../../../components';
import type { ActivityDay, TermInfo } from '../../../types';
import { StreakWidget, type StreakMascotProps } from './StreakWidget';
import styles from './WelcomeBanner.module.css';

interface WelcomeBannerProps {
  greeting: string;
  summary: string;
  term: TermInfo;
  activity: ActivityDay[];
  mascot?: StreakMascotProps;
}

export function WelcomeBanner({ greeting, summary, term, activity, mascot }: WelcomeBannerProps) {
  return (
    <section className={styles.banner} aria-labelledby="welcome-heading">
      <span className={styles.orbOne} aria-hidden="true" />
      <span className={styles.orbTwo} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.badges}>
          <Badge variant="glass" tone="brand" icon="verified" iconFilled>
            {term.label}
          </Badge>
          <Badge variant="glass" tone="warning" icon="local_fire_department" iconFilled>
            {mascot?.state?.streakDays ?? term.streakDays} Günlük Seri!
          </Badge>
        </div>

        <Text role="headline-lg" as="h1" tone="on-primary" className={styles.heading}>
          <span id="welcome-heading">{greeting}</span>
        </Text>

        <Text role="body-lg" as="p" tone="on-primary" className={styles.summary}>
          {summary}
        </Text>
      </div>

      <StreakWidget term={term} activity={activity} mascot={mascot} />
    </section>
  );
}

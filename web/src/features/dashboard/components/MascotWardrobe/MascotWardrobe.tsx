import { Button, Dialog, Icon, Text } from '../../../../components';
import type { MascotItemView, MascotSlot, MascotState } from '../../../../types';
import { Mascot } from '../Mascot';
import styles from './MascotWardrobe.module.css';

const SLOTS: { slot: MascotSlot; label: string }[] = [
  { slot: 'HAT', label: 'Şapka' },
  { slot: 'GLASSES', label: 'Gözlük' },
  { slot: 'NECK', label: 'Boyunluk' },
  { slot: 'AURA', label: 'Aura' },
];

interface MascotWardrobeProps {
  state: MascotState;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPurchase: (itemId: string) => void;
  onToggleEquipped: (itemId: string, equipped: boolean) => void;
}

/** Maskotu Giydir penceresi: önizleme, bakiye ve slotlara göre eşya listesi. */
export function MascotWardrobe({ state, busy, error, onClose, onPurchase, onToggleEquipped }: MascotWardrobeProps) {
  const wornNames = state.items.filter((item) => item.equipped).map((item) => item.name);

  const renderAction = (item: MascotItemView) => {
    if (item.owned) {
      return (
        <Button
          variant={item.equipped ? 'secondary' : 'primary'}
          size="sm"
          disabled={busy}
          onClick={() => onToggleEquipped(item.id, !item.equipped)}
          aria-label={`${item.name} ${item.equipped ? 'çıkar' : 'giy'}`}
        >
          {item.equipped ? 'Çıkar' : 'Giy'}
        </Button>
      );
    }
    if (item.locked) {
      return (
        <Text role="label-md" tone="muted" className={styles.reason}>
          <Icon name="lock" size="sm" /> {item.minStreak} günlük seri gerekli
        </Text>
      );
    }
    const short = state.points < item.price;
    return (
      <div className={styles.buy}>
        <Button
          variant="navy"
          size="sm"
          disabled={busy || short}
          onClick={() => onPurchase(item.id)}
          aria-label={`${item.name} satın al, ${item.price} puan`}
        >
          Satın Al
        </Button>
        {short ? (
          <Text role="label-md" tone="muted">
            {item.price - state.points} puan eksik
          </Text>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog title="Pıtır'ı Giydir" onClose={onClose} busy={busy} size="lg">
      <div className={styles.layout}>
        <div className={styles.preview}>
          <Mascot size="lg" streakDays={state.streakDays} equipped={state.equipped} equippedNames={wornNames} />
          <Text role="title-md" as="p" tone="on-primary" className={styles.balance}>
            <Icon name="stars" filled /> {state.points} puan
          </Text>
          <Button variant="ghost" size="sm" onClick={onClose} className={styles.close}>
            Kapat
          </Button>
        </div>

        <div className={styles.items}>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          {SLOTS.map(({ slot, label }) => {
            const items = state.items.filter((item) => item.slot === slot);
            if (items.length === 0) return null;
            return (
              <section key={slot} aria-label={label} className={styles.group}>
                <Text role="label-lg" as="h3" tone="muted" className={styles.groupTitle}>
                  {label}
                </Text>
                <ul className={styles.list}>
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className={[styles.item, item.equipped ? styles.worn : '', item.locked ? styles.locked : '']
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className={styles.info}>
                        <Text role="label-lg" as="p" tone="main">
                          {item.name}
                        </Text>
                        <Text role="body-sm" as="p" tone="muted">
                          {item.description}
                        </Text>
                        {!item.owned ? (
                          <Text role="label-md" as="p" tone="navy">
                            {item.price} puan
                          </Text>
                        ) : (
                          <Text role="label-md" as="p" tone="success">
                            {item.equipped ? 'Giyili' : 'Sende'}
                          </Text>
                        )}
                      </div>
                      <div className={styles.action}>{renderAction(item)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
}

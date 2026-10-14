import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { IconButton } from '../IconButton';
import { RichText } from '../RichText';
import { Text } from '../Text';
import styles from './RichTextEditor.module.css';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  /** Textarea'ya bağlanan açıklama öğesi kimliği. */
  'aria-describedby'?: string;
  /** Alanın erişilebilir adı. */
  'aria-label'?: string;
  rows?: number;
}

type Tab = 'write' | 'preview';

export function RichTextEditor({
  value,
  onChange,
  maxLength,
  'aria-describedby': describedBy,
  'aria-label': ariaLabel = 'Duyuru metni',
  rows = 8,
}: RichTextEditorProps) {
  const id = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [tab, setTab] = useState<Tab>('write');

  // Değer güncellendikten sonra seçimi ve odağı geri yükle.
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    const area = areaRef.current;
    if (!selection || !area) return;
    pendingSelection.current = null;
    area.focus();
    area.setSelectionRange(selection[0], selection[1]);
  }, [value]);

  const apply = (next: string, start: number, end: number) => {
    if (next.length > maxLength) return;
    pendingSelection.current = [start, end];
    onChange(next);
  };

  const wrap = (marker: string, placeholder: string) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: s, selectionEnd: e } = area;
    const m = marker.length;
    // Seçim zaten işaretlerle sarılıysa işaretleri kaldır.
    if (s >= m && value.slice(s - m, s) === marker && value.slice(e, e + m) === marker) {
      apply(value.slice(0, s - m) + value.slice(s, e) + value.slice(e + m), s - m, e - m);
      return;
    }
    const selected = value.slice(s, e) || placeholder;
    apply(value.slice(0, s) + marker + selected + marker + value.slice(e), s + m, s + m + selected.length);
  };

  const prefixLines = (prefixFor: (index: number) => string, pattern: RegExp) => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: s, selectionEnd: e } = area;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const nl = value.indexOf('\n', e);
    const lineEnd = nl === -1 ? value.length : nl;
    const lines = value.slice(lineStart, lineEnd).split('\n');
    const allPrefixed = lines.every((line) => pattern.test(line));
    const next = lines
      .map((line, i) => (allPrefixed ? line.replace(pattern, '') : prefixFor(i) + line.replace(pattern, '')))
      .join('\n');
    apply(value.slice(0, lineStart) + next + value.slice(lineEnd), lineStart, lineStart + next.length);
  };

  const insertLink = () => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: s, selectionEnd: e } = area;
    const text = value.slice(s, e) || 'bağlantı metni';
    const url = 'https://';
    const urlStart = s + text.length + 3;
    apply(value.slice(0, s) + `[${text}](${url})` + value.slice(e), urlStart, urlStart + url.length);
  };

  const actions = [
    { icon: 'format_bold', label: 'Kalın (Ctrl+B)', run: () => wrap('**', 'kalın metin') },
    { icon: 'format_italic', label: 'İtalik (Ctrl+I)', run: () => wrap('*', 'italik metin') },
    { icon: 'title', label: 'Başlık', run: () => prefixLines(() => '## ', /^#{2,3}\s+/) },
    { icon: 'format_list_bulleted', label: 'Madde listesi', run: () => prefixLines(() => '- ', /^-\s+/) },
    {
      icon: 'format_list_numbered',
      label: 'Numaralı liste',
      run: () => prefixLines((i) => `${i + 1}. `, /^\d+\.\s+/),
    },
    { icon: 'format_quote', label: 'Alıntı', run: () => prefixLines(() => '> ', /^>\s?/) },
    { icon: 'link', label: 'Bağlantı', run: insertLink },
  ];

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      wrap('**', 'kalın metin');
    } else if (key === 'i') {
      event.preventDefault();
      wrap('*', 'italik metin');
    }
  };

  const writing = tab === 'write';

  return (
    <div className={styles.editor}>
      <div className={styles.header}>
        <div role="tablist" aria-label="Görünüm" className={styles.tabs}>
          {(['write', 'preview'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${id}-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`${id}-panel-${key}`}
              className={[styles.tab, tab === key ? styles.tabActive : ''].join(' ')}
              onClick={() => setTab(key)}
            >
              {key === 'write' ? 'Yaz' : 'Önizleme'}
            </button>
          ))}
        </div>
        <Text role="body-sm" as="span" tone="muted">
          <span aria-live="polite">
            {value.length.toLocaleString('tr-TR')} / {maxLength.toLocaleString('tr-TR')}
          </span>
        </Text>
      </div>

      <div className={styles.toolbar} role="toolbar" aria-label="Biçimlendirme" aria-controls={`${id}-area`}>
        {actions.map((action) => (
          <IconButton
            key={action.icon}
            icon={action.icon}
            label={action.label}
            title={action.label}
            disabled={!writing}
            className={styles.tool}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action.run}
          />
        ))}
      </div>

      <div id={`${id}-panel-write`} role="tabpanel" aria-labelledby={`${id}-tab-write`} hidden={!writing}>
        <textarea
          id={`${id}-area`}
          ref={areaRef}
          className={styles.textarea}
          rows={rows}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          required
          aria-required="true"
          aria-label={ariaLabel}
          aria-describedby={describedBy}
        />
      </div>
      <div
        id={`${id}-panel-preview`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-preview`}
        hidden={writing}
        className={styles.preview}
      >
        {value.trim() ? (
          <RichText body={value} />
        ) : (
          <Text role="body-md" as="p" tone="muted">
            Önizlenecek bir şey yok.
          </Text>
        )}
      </div>
    </div>
  );
}

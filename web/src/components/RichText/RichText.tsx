import type { ReactNode } from 'react';
import { Text } from '../Text';
import styles from './RichText.module.css';

/**
 * Duyuru gövdesi için sınırlı Markdown alt kümesi: ## / ### başlık, **kalın**, *italik*,
 * "- " liste, "1. " numaralı liste, "> " alıntı, [metin](bağlantı) ve boş satırla paragraf.
 * Ham HTML desteklenmez; çıktı yalnızca React elemanlarıdır.
 */

const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+?)\*\*|\*([^*\n]+?)\*/;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let index = 0;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      nodes.push(rest);
      break;
    }
    if (match.index > 0) nodes.push(rest.slice(0, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[1] !== undefined) {
      if (SAFE_URL.test(match[2])) {
        nodes.push(
          <a key={key} href={match[2]} rel="noopener noreferrer" target="_blank" className={styles.link}>
            {renderInline(match[1], key)}
          </a>,
        );
      } else {
        // Güvensiz şema: düz metin olarak göster.
        nodes.push(match[0]);
      }
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={key}>{renderInline(match[3], key)}</strong>);
    } else {
      nodes.push(<em key={key}>{renderInline(match[4], key)}</em>);
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return nodes;
}

/** Satırları <br> ile birleştirerek satır içi biçimlendirmeyi uygular. */
function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, i) => {
    const content = renderInline(line, `${keyPrefix}-${i}`);
    return i === 0 ? content : [<br key={`${keyPrefix}-br${i}`} />, ...content];
  });
}

const HEADING = /^(#{2,3})\s+(.*)$/;
const UL = /^[-]\s+(.*)$/;
const OL = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

function isBlockStart(line: string): boolean {
  return HEADING.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line);
}

function renderBlocks(body: string): ReactNode[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blocks.length}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <Text key={key} role={level === 2 ? 'headline-sm' : 'title-md'} as={level === 2 ? 'h2' : 'h3'} className={styles.heading}>
          {renderInline(heading[2], key)}
        </Text>,
      );
      i++;
      continue;
    }
    const listRe = UL.test(line) ? UL : OL.test(line) ? OL : null;
    if (listRe) {
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const m = listRe.exec(lines[i]);
        if (!m) break;
        items.push(
          <li key={`${key}-${items.length}`}>
            <Text role="body-lg">{renderInline(m[1], `${key}-${items.length}`)}</Text>
          </li>,
        );
        i++;
      }
      const List = listRe === UL ? 'ul' : 'ol';
      blocks.push(
        <List key={key} className={styles.list}>
          {items}
        </List>,
      );
      continue;
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const m = QUOTE.exec(lines[i]);
        if (!m) break;
        quoted.push(m[1]);
        i++;
      }
      blocks.push(
        <blockquote key={key} className={styles.quote}>
          <Text role="body-lg" as="p">
            {renderLines(quoted, key)}
          </Text>
        </blockquote>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !isBlockStart(lines[i]))) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={key} role="body-lg" as="p">
        {renderLines(para, key)}
      </Text>,
    );
  }
  return blocks;
}

interface RichTextProps {
  body: string;
  className?: string;
}

export function RichText({ body, className }: RichTextProps) {
  return <div className={[styles.root, className].filter(Boolean).join(' ')}>{renderBlocks(body)}</div>;
}

/** Liste ve özet gösterimleri için Markdown işaretlerini temizleyip düz metin döndürür. */
export function stripMarkdown(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^(#{2,3}\s+|-\s+|\d+\.\s+|>\s?)/, ''))
    .join(' ')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\*([^*\n]+?)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

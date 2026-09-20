import { SubtitleItem } from '@/types/transapp';

function timeToMs(timeStr: string): number {
  const parts = timeStr?.trim()?.split(':') ?? [];
  if (parts.length < 3) return 0;
  const hours = parseInt(parts[0] ?? '0', 10) || 0;
  const minutes = parseInt(parts[1] ?? '0', 10) || 0;
  const secParts = (parts[2] ?? '0,0').split(/[,.]/);
  const seconds = parseInt(secParts[0] ?? '0', 10) || 0;
  const milliseconds = parseInt((secParts[1] ?? '0').padEnd(3, '0').slice(0, 3), 10) || 0;
  return hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
}

function msToTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function parseSrt(content: string): SubtitleItem[] {
  const items: SubtitleItem[] = [];
  const blocks = (content ?? '').trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = (block ?? '').trim().split('\n');
    if ((lines?.length ?? 0) < 3) continue;

    const indexLine = lines[0]?.trim() ?? '';
    const timeLine = lines[1]?.trim() ?? '';
    const textLines = lines.slice(2);

    const idx = parseInt(indexLine, 10);
    if (isNaN(idx)) continue;

    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.:]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.:]\d{3})/);
    if (!timeMatch) continue;

    const startTimeStr = timeMatch[1] ?? '00:00:00,000';
    const endTimeStr = timeMatch[2] ?? '00:00:00,000';
    const startTimeMs = timeToMs(startTimeStr);
    const endTimeMs = timeToMs(endTimeStr);
    const text = textLines.map((l: string) => (l ?? '').trim()).filter(Boolean).join(' ');

    items.push({
      id: idx,
      index: idx,
      startTimeStr,
      endTimeStr,
      startTimeMs,
      endTimeMs,
      enText: text,
      frText: '',
    });
  }

  return items;
}

export function generateSrt(items: SubtitleItem[], useFrench: boolean = true): string {
  return (items ?? []).map((item: SubtitleItem) => {
    const text = useFrench ? (item?.frText ?? item?.enText ?? '') : (item?.enText ?? '');
    return `${item?.index ?? 0}\n${item?.startTimeStr ?? '00:00:00,000'} --> ${item?.endTimeStr ?? '00:00:00,000'}\n${text}`;
  }).join('\n\n') + '\n';
}

export function formatDuration(ms: number): string {
  return msToTime(ms);
}

export { msToTime, timeToMs };

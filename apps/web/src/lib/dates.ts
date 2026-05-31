import { format, isToday, isValid, isYesterday, parseISO } from 'date-fns';

type DateInput = Date | string | number | null | undefined;

export function formatAppDateTime(input: DateInput) {
  const date = readDate(input);
  if (!date) return 'Unknown time';

  const time = format(date, 'h:mm a');
  if (isToday(date)) return `Today, ${time}`;
  if (isYesterday(date)) return `Yesterday, ${time}`;
  return format(date, 'd MMM yyyy, h:mm a');
}

export function formatAppDate(input: DateInput) {
  const date = readDate(input);
  return date ? format(date, 'd MMM yyyy') : 'Unknown date';
}

function readDate(input: DateInput) {
  if (!input) return null;
  const date = typeof input === 'string' ? parseISO(input) : new Date(input);
  return isValid(date) ? date : null;
}

// src/utils/date.ts
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

export const getFormattedDate = (date?: string) => {
  const now = date ? dayjs(date) : dayjs();

  // 1. 년, 월, 일 구하기
  const dateStr = now.format('YYYY년 MM월 DD일');

  // 2. 해당 월의 주차 계산하기
  // (현재 날짜의 일수 + 이번 달 1일의 요일 숫자)를 7로 나누어 올림
  const startOfMonth = now.startOf('month');
  const weekOfMonth = Math.ceil((now.date() + startOfMonth.day()) / 7);

  // 3. 최종 문자열 조합 (예: 2026년 01월 13일 2주차)
  return `${dateStr} ${weekOfMonth}주차`;
};

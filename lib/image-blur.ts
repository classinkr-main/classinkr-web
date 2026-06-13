/**
 * 동적 이미지(블로그·행사 등)용 공용 blur placeholder.
 * 이미지별 blurDataURL을 생성하지 않는 대신, 사이트 배경 톤(#ECECEA)의
 * 중립 블러를 깔아 로딩 중 회색 박스 깜빡임을 줄인다.
 */
export const NEUTRAL_BLUR_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGN48+YVVsQwkBIAy1CEYWZQTwUAAAAASUVORK5CYII="

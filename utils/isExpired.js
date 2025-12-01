export default function isExpired(time, timeByMinutes = 2) {
  const currentTime = new Date();
  const createdTime = new Date(time);
  const minutesInMilliseconds = timeByMinutes * 60 * 1000;
  return currentTime - createdTime >= minutesInMilliseconds;
}
